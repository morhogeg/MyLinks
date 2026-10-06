"""One transient embedding failure must not cost a card its search vector (AI-7).

Edits (title, summary, notes) re-flag a card that already has a valid vector
(`needsEmbedding: true`), and sync_link_embedding answered ANY embed error by
deleting `embedding_vector` along with the flag, after a single attempt, with
nothing scheduled to repair it: one blip made an edited card invisible to
search until its next write. Offline: Firestore is the dict-backed fake from
test_vector_store; the embedding API is faked.
"""

import types

import pytest
from google.cloud.firestore_v1 import DELETE_FIELD
from google.cloud.firestore_v1.vector import Vector

import main
import search
import vector_store
from tests.test_vector_store import FakeDb, CARD, SIB, _EvSnap


@pytest.fixture(autouse=True)
def _fresh_flags():
    vector_store.reset_flag_cache()
    yield
    vector_store.reset_flag_cache()


def _trigger(monkeypatch, db, card, embed):
    import entitlement
    monkeypatch.setattr(search, "get_db", lambda: db)
    monkeypatch.setattr(search, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(entitlement, "maybe_start_trial", lambda uid: None)
    updates = []
    real_update = type(db.collection("x").document("y")).update

    def spy(ref, data):
        updates.append(dict(data))
        return real_update(ref, data)

    monkeypatch.setattr(type(db.collection("x").document("y")), "update", spy)
    monkeypatch.setattr(search, "EmbeddingService",
                        lambda: types.SimpleNamespace(generate_embedding=embed))
    event = types.SimpleNamespace(
        data=types.SimpleNamespace(after=_EvSnap(card), before=_EvSnap(card)),
        params={"uid": "u1", "linkId": "c1"})
    search.sync_link_embedding.__wrapped__(event)
    return updates


def _fail(text):
    raise Exception("Gemini Embedding failed: 503 UNAVAILABLE")


def test_a_valid_vector_survives_a_failed_re_embed(monkeypatch):
    vec = Vector([0.6, 0.8])
    card = {"title": "Edited title", "summary": "S", "status": "unread",
            "needsEmbedding": True, "embedding_vector": vec}
    db = FakeDb({CARD: dict(card), SIB: {"embedding_vector": vec}})

    updates = _trigger(monkeypatch, db, card, _fail)

    assert all(DELETE_FIELD not in u.values() for u in updates)
    assert db.docs[CARD]["embedding_vector"] == vec
    assert db.docs[CARD]["needsEmbedding"] is True      # still queued for repair
    assert db.docs[SIB]["embedding_vector"] == vec      # the search copy too
    assert updates == []  # already flagged: no write, so no trigger re-fire


def test_an_unusable_vector_is_still_dropped_on_failure(monkeypatch):
    card = {"title": "T", "summary": "S", "status": "unread",
            "embedding_vector": Vector([0.0, 0.0])}  # degenerate
    db = FakeDb({CARD: dict(card), SIB: {"embedding_vector": Vector([0.0, 0.0])}})

    _trigger(monkeypatch, db, card, _fail)

    assert "embedding_vector" not in db.docs[CARD]
    assert db.docs[CARD]["needsEmbedding"] is True
    assert SIB not in db.docs


def test_a_successful_embed_still_writes_and_clears_the_flag(monkeypatch):
    card = {"title": "T", "summary": "S", "status": "unread", "needsEmbedding": True,
            "embedding_vector": Vector([1.0, 0.0])}
    db = FakeDb({CARD: dict(card)})
    _trigger(monkeypatch, db, card, lambda text: [0.6, 0.8])
    assert db.docs[CARD]["embedding_vector"] == Vector([0.6, 0.8])
    assert "needsEmbedding" not in db.docs[CARD]


# ── one retry with jitter, for document embeds only ─────────────────────────

class _ApiError(Exception):
    code = 503
    status = "UNAVAILABLE"


def _service(outcomes):
    calls = []

    def embed_content(model, contents, config):
        calls.append(config["task_type"])
        out = outcomes[len(calls) - 1]
        if isinstance(out, Exception):
            raise out
        return types.SimpleNamespace(embeddings=[types.SimpleNamespace(values=out)])

    svc = search.EmbeddingService.__new__(search.EmbeddingService)
    svc.client = types.SimpleNamespace(models=types.SimpleNamespace(embed_content=embed_content))
    svc.model = "models/gemini-embedding-001"
    return svc, calls


def test_document_embed_retries_a_transient_error_once(monkeypatch):
    monkeypatch.setattr(search.time, "sleep", lambda s: None)
    svc, calls = _service([_ApiError("blip"), [0.1, 0.2]])
    assert svc.generate_embedding("card text") == [0.1, 0.2]
    assert calls == ["RETRIEVAL_DOCUMENT", "RETRIEVAL_DOCUMENT"]


def test_query_embed_fails_fast(monkeypatch):
    monkeypatch.setattr(search.time, "sleep", lambda s: pytest.fail("a query embed waited"))
    svc, calls = _service([_ApiError("blip"), [0.1]])
    with pytest.raises(Exception, match="Gemini Embedding failed"):
        svc.generate_embedding("query", task_type="RETRIEVAL_QUERY")
    assert len(calls) == 1


def test_a_permanent_error_is_not_retried(monkeypatch):
    class _BadRequest(Exception):
        code = 400

    svc, calls = _service([_BadRequest("bad input"), [0.1]])
    with pytest.raises(Exception):
        svc.generate_embedding("card text")
    assert len(calls) == 1


# ── the repair sweep ────────────────────────────────────────────────────────

class _FlaggedDoc:
    def __init__(self, doc_id, data, writes):
        self.id = doc_id
        self._data = data
        self.reference = types.SimpleNamespace(update=lambda u, i=doc_id: writes.append((i, u)))

    def to_dict(self):
        return dict(self._data)


class _SweepDb:
    def __init__(self, docs, fail=False):
        self.docs, self.fail, self.query = docs, fail, {}

    def collection_group(self, name):
        self.query["group"] = name
        return self

    def where(self, filter):
        self.query["where"] = (filter.field_path, filter.op_string, filter.value)
        return self

    def limit(self, n):
        self.query["limit"] = n
        return self

    def stream(self):
        if self.fail:
            raise RuntimeError("400 The query requires a COLLECTION_GROUP_ASC index")
        return iter(self.docs)


def test_sweep_refires_flagged_cards_and_skips_the_rest():
    import time as _time
    now = int(_time.time() * 1000)
    writes = []
    docs = [
        _FlaggedDoc("due", {"title": "T", "summary": "S", "status": "unread"}, writes),
        _FlaggedDoc("processing", {"title": "T", "status": "processing"}, writes),
        _FlaggedDoc("textless", {"title": "", "summary": ""}, writes),
        _FlaggedDoc("recent", {"title": "T", search._REPAIR_STAMP: now - 60_000}, writes),
        _FlaggedDoc("stale", {"title": "T", search._REPAIR_STAMP: now - 2 * 3_600_000}, writes),
    ]
    db = _SweepDb(docs)

    report = search.repair_flagged_embeddings(db)

    assert db.query == {"group": "links", "where": ("needsEmbedding", "==", True),
                        "limit": search.EMBED_REPAIR_SCAN}
    touched = {i for i, u in writes if search._REPAIR_STAMP in u}
    assert touched == {"due", "stale"}
    assert ("textless", {"needsEmbedding": DELETE_FIELD}) in writes
    assert report == {"scanned": 5, "requested": 2, "cleared": 1, "errors": 0}


def test_sweep_is_bounded_per_tick():
    writes = []
    docs = [_FlaggedDoc(f"c{i}", {"title": "T"}, writes) for i in range(40)]
    report = search.repair_flagged_embeddings(_SweepDb(docs))
    assert report["requested"] == search.EMBED_REPAIR_BATCH == len(writes)


def test_sweep_never_raises_without_its_index():
    report = search.repair_flagged_embeddings(_SweepDb([], fail=True))
    assert report["errors"] == 1 and report["requested"] == 0


def test_the_janitor_tick_runs_the_sweep(monkeypatch):
    ran = []
    monkeypatch.setattr(main, "run_processing_janitor", lambda: ran.append("janitor"))
    monkeypatch.setattr(main, "run_category_migration", lambda: ran.append("categories"))
    monkeypatch.setattr(main, "repair_flagged_embeddings", lambda: ran.append("embeddings"))
    handler = main.sweep_stuck_processing
    while getattr(handler, "__wrapped__", handler) is not handler:
        handler = handler.__wrapped__
    handler(None)
    assert ran == ["janitor", "categories", "embeddings"]
