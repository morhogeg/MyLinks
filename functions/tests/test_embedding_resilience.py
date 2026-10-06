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
    def __init__(self, doc_id, data, writes, uid="u1"):
        self.id = doc_id
        self._data = data
        self.reference = types.SimpleNamespace(update=lambda u, i=doc_id: writes.append((i, u)),
                                               path=f"users/{uid}/links/{doc_id}")

    def to_dict(self):
        return dict(self._data)


def _segments(path):
    return tuple(path.split("/"))


class _SweepDb:
    """The flagged cards of the `links` collection group, paged like
    Firestore (ordered by document path; a cursor is a position, valid
    whether or not that card still exists), plus the scheduler_state doc the
    sweep keeps its place in."""

    def __init__(self, docs, fail=False, state=None):
        self.docs, self.fail, self.query = docs, fail, {}
        self.state = dict(state or {})

    def collection_group(self, name):
        self.query = {"group": name}
        return self

    def where(self, filter):
        self.query["where"] = (filter.field_path, filter.op_string, filter.value)
        return self

    def order_by(self, field):
        self.query["order_by"] = field
        return self

    def start_after(self, cursor):
        self.query["start_after"] = cursor["__name__"].path
        return self

    def limit(self, n):
        self.query["limit"] = n
        return self

    def stream(self):
        if self.fail:
            raise RuntimeError("400 The query requires a COLLECTION_GROUP_ASC index")
        after = self.query.get("start_after")
        docs = sorted(self.docs, key=lambda d: _segments(d.reference.path))
        docs = [d for d in docs if after is None or _segments(d.reference.path) > _segments(after)]
        return iter(docs[: self.query.get("limit")])

    def document(self, path):
        return types.SimpleNamespace(path=path)

    def collection(self, name):
        assert name == search.SCHEDULER_STATE_COLLECTION
        state = self.state
        return types.SimpleNamespace(document=lambda doc_id: types.SimpleNamespace(
            get=lambda: types.SimpleNamespace(exists=doc_id in state,
                                              to_dict=lambda: dict(state.get(doc_id) or {})),
            set=lambda data, merge=False: state.__setitem__(doc_id, dict(data))))


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
                        "order_by": "__name__", "limit": search.EMBED_REPAIR_SCAN}
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


# ── RV-5: the sweep's query has its index, and it gets past a stuck front ───

def test_the_needs_embedding_index_is_declared():
    import json
    from pathlib import Path

    spec = json.loads((Path(main.__file__).resolve().parent.parent / "firestore.indexes.json").read_text())
    entry = [o for o in spec["fieldOverrides"]
             if o["collectionGroup"] == "links" and o["fieldPath"] == "needsEmbedding"]
    assert len(entry) == 1
    indexes = entry[0]["indexes"]
    # The sweep's collection-group equality query ...
    assert {"order": "ASCENDING", "queryScope": "COLLECTION_GROUP"} in indexes
    # ... and the automatic single-field indexes an override would otherwise drop.
    for default in ({"order": "ASCENDING", "queryScope": "COLLECTION"},
                    {"order": "DESCENDING", "queryScope": "COLLECTION"},
                    {"arrayConfig": "CONTAINS", "queryScope": "COLLECTION"}):
        assert default in indexes


def test_a_stuck_front_of_the_scan_no_longer_starves_the_rest():
    # 60 flagged cards still processing sort first; a fixed limit(50) from
    # the start saw only them, every tick, and never reached the 40 behind.
    writes = []
    docs = ([_FlaggedDoc(f"a{i:03d}", {"title": "T", "status": "processing"}, writes) for i in range(60)]
            + [_FlaggedDoc(f"b{i:03d}", {"title": "T", "summary": "S"}, writes) for i in range(40)])
    db = _SweepDb(docs)
    for _ in range(6):
        search.repair_flagged_embeddings(db)
    requested = {i for i, u in writes if search._REPAIR_STAMP in u}
    assert requested == {f"b{i:03d}" for i in range(40)}


def test_the_scan_continues_after_its_cursor_and_wraps_at_the_end():
    writes = []
    docs = [_FlaggedDoc(f"c{i:02d}", {"title": "T", "status": "processing"}, writes) for i in range(70)]
    db = _SweepDb(docs)
    search.repair_flagged_embeddings(db)
    assert "start_after" not in db.query
    assert db.state["embedRepair"]["cursor"] == "users/u1/links/c49"  # a full page: continue
    search.repair_flagged_embeddings(db)
    assert db.query["start_after"] == "users/u1/links/c49"
    assert db.state["embedRepair"]["cursor"] is None  # reached the end: wrap
    search.repair_flagged_embeddings(db)
    assert "start_after" not in db.query


def test_a_full_batch_stops_on_the_last_card_it_examined():
    writes = []
    docs = [_FlaggedDoc(f"c{i:02d}", {"title": "T", "summary": "S"}, writes) for i in range(30)]
    db = _SweepDb(docs)
    search.repair_flagged_embeddings(db)
    assert db.state["embedRepair"]["cursor"] == "users/u1/links/c09"
    search.repair_flagged_embeddings(db)
    touched = [i for i, u in writes if search._REPAIR_STAMP in u]
    assert touched == [f"c{i:02d}" for i in range(20)]


def test_a_deleted_cursor_card_or_a_bad_cursor_is_harmless():
    writes = []
    docs = [_FlaggedDoc(f"c{i:02d}", {"title": "T", "summary": "S"}, writes) for i in range(3)]
    db = _SweepDb(docs, state={"embedRepair": {"cursor": "users/u1/links/c00x"}})
    search.repair_flagged_embeddings(db)
    assert [i for i, u in writes] == ["c01", "c02"]  # resumed after the gone card's place
    writes.clear()
    db = _SweepDb(docs, state={"embedRepair": {"cursor": "not/a card"}})
    search.repair_flagged_embeddings(db)
    assert [i for i, u in writes] == ["c00", "c01", "c02"]


def test_the_real_query_carries_the_cursor_as_a_card_reference(monkeypatch):
    pytest.importorskip("google.cloud.firestore_v1.query")
    from google.auth.credentials import AnonymousCredentials
    from google.cloud import firestore
    from google.cloud.firestore_v1.document import DocumentReference
    from google.cloud.firestore_v1.query import Query

    built, saved = [], []
    monkeypatch.setattr(Query, "stream", lambda self, *a, **k: built.append(self._to_protobuf()) or iter([]))
    monkeypatch.setattr(DocumentReference, "get", lambda self, *a, **k: types.SimpleNamespace(
        exists=True, to_dict=lambda: {"cursor": "users/u1/links/c3"}))
    monkeypatch.setattr(DocumentReference, "set", lambda self, data, merge=False: saved.append((self.path, data)))
    db = firestore.Client(project="p", credentials=AnonymousCredentials())

    report = search.repair_flagged_embeddings(db)

    assert report["errors"] == 0
    q = built[0]
    assert q.from_[0].collection_id == "links" and q.from_[0].all_descendants is True
    assert q.order_by[0].field.field_path == "__name__"
    assert q.start_at.before is False
    assert q.start_at.values[0].reference_value.endswith("/documents/users/u1/links/c3")
    assert saved and saved[0][0] == "scheduler_state/embedRepair" and saved[0][1]["cursor"] is None


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
