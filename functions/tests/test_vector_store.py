"""Vector store: card vectors mirrored to users/{uid}/vectors/{linkId}.

Pins the phase-1/2 contract (vector_store.py):
  - every server vector write is mirrored, every vector drop deletes the
    sibling, and a mirror failure never breaks the card write while the card
    is still authoritative (but does once the sibling is the only copy);
  - readers stay on the card field until the backfill flips `siblingReady`,
    then read siblings with a fallback to the card field;
  - "needs embedding?" ignores the sibling until cards stop carrying vectors,
    so a stale sibling can never mask a card that genuinely needs one;
  - card delete and account delete remove the sibling;
  - the create-time trigger backstop mirrors a card that arrives with a vector.
"""

import math
import types

import pytest
from google.cloud.firestore_v1 import DELETE_FIELD
from google.cloud.firestore_v1.vector import Vector

import vector_store


# ── A tiny path-keyed Firestore double ───────────────────────────────────────

def _cos_dist(a, b):
    a, b = list(a), list(b)
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return 1.0 - dot / (na * nb)


class _Snap:
    def __init__(self, path, data):
        self.id = path.rsplit("/", 1)[1]
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _Ref:
    def __init__(self, db, path):
        self._db, self.path = db, path
        self.id = path.rsplit("/", 1)[1]

    @property
    def parent(self):
        return _Coll(self._db, self.path.rsplit("/", 1)[0])

    def collection(self, name):
        return _Coll(self._db, f"{self.path}/{name}")

    def get(self):
        self._db.reads.append(self.path)
        return _Snap(self.path, self._db.docs.get(self.path))

    def set(self, data, merge=False):
        if self._db.fail_prefix and self.path.startswith(self._db.fail_prefix):
            raise RuntimeError("write failed")
        self._db.docs[self.path] = {k: v for k, v in data.items() if v is not DELETE_FIELD}

    def update(self, data):
        doc = dict(self._db.docs[self.path])
        for k, v in data.items():
            if v is DELETE_FIELD:
                doc.pop(k, None)
            else:
                doc[k] = v
        self._db.docs[self.path] = doc

    def delete(self):
        if self._db.fail_prefix and self.path.startswith(self._db.fail_prefix):
            raise RuntimeError("delete failed")
        self._db.docs.pop(self.path, None)


class _Coll:
    def __init__(self, db, path):
        self._db, self.path = db, path
        self._lim = None

    @property
    def parent(self):
        return _Ref(self._db, self.path.rsplit("/", 1)[0])

    def document(self, doc_id):
        return _Ref(self._db, f"{self.path}/{doc_id}")

    def _children(self):
        pre = self.path + "/"
        return [(p, d) for p, d in sorted(self._db.docs.items())
                if p.startswith(pre) and "/" not in p[len(pre):]]

    def limit(self, n):
        self._lim = n
        return self

    def stream(self):
        docs = self._children()[: self._lim]
        return iter([_Snap(p, d) for p, d in docs])

    def find_nearest(self, vector_field, query_vector, limit, distance_measure,
                     distance_result_field=None, distance_threshold=None):
        if self._db.nearest_fails and self.path.endswith("/" + self._db.nearest_fails):
            raise RuntimeError("index missing")
        self._db.nearest_calls.append(self.path.rsplit("/", 1)[1])
        hits = []
        for p, d in self._children():
            v = d.get(vector_field)
            if not isinstance(v, Vector):
                continue
            dist = _cos_dist(query_vector, v)
            if distance_threshold is not None and dist > distance_threshold:
                continue
            out = dict(d)
            out[distance_result_field] = dist
            hits.append((dist, p, out))
        hits.sort(key=lambda h: h[0])
        snaps = [_Snap(p, d) for _, p, d in hits[:limit]]
        return types.SimpleNamespace(get=lambda: snaps)


class FakeDb:
    def __init__(self, docs=None, flags=None):
        self.docs = dict(docs or {})
        if flags is not None:
            self.docs["config/vector_store"] = flags
        self.reads = []
        self.nearest_calls = []
        self.nearest_fails = None
        self.fail_prefix = None

    def collection(self, name):
        return _Coll(self, name)

    def batch(self):
        ops = []
        return types.SimpleNamespace(
            set=lambda ref, data, merge=False: ops.append(lambda: ref.set(data)),
            update=lambda ref, data: ops.append(lambda: ref.update(data)),
            delete=lambda ref: ops.append(ref.delete),
            commit=lambda: [op() for op in ops] and ops.clear(),
        )

    def get_all(self, refs, field_paths=None):
        out = []
        for r in refs:
            data = self.docs.get(r.path)
            if data is not None and field_paths:
                data = {k: v for k, v in data.items() if k in field_paths}
            out.append(_Snap(r.path, data))
        return out


@pytest.fixture(autouse=True)
def _fresh_flags():
    vector_store.reset_flag_cache()
    yield
    vector_store.reset_flag_cache()


def _v(*xs):
    return Vector([float(x) for x in xs])


CARD = "users/u1/links/c1"
SIB = "users/u1/vectors/c1"


def _card_ref(db, link_id="c1"):
    return db.collection("users").document("u1").collection("links").document(link_id)


# ── Writes ───────────────────────────────────────────────────────────────────

def test_vector_write_is_mirrored_with_version():
    db = FakeDb({CARD: {"title": "T"}})
    update = {"embedding_vector": _v(1, 0), "embeddingVersion": 5, "needsEmbedding": DELETE_FIELD}
    assert vector_store.mirror_vector_write(_card_ref(db), update, db=db) == "set"
    assert db.docs[SIB]["embedding_vector"] == _v(1, 0)
    assert db.docs[SIB]["embeddingVersion"] == 5


def test_vector_drop_deletes_the_sibling():
    db = FakeDb({CARD: {}, SIB: {"embedding_vector": _v(1, 0)}})
    assert vector_store.mirror_vector_write(
        _card_ref(db), {"needsEmbedding": True, "embedding_vector": DELETE_FIELD}, db=db) == "delete"
    assert SIB not in db.docs


def test_card_set_without_vector_deletes_sibling_but_update_without_one_does_not():
    db = FakeDb({CARD: {}, SIB: {"embedding_vector": _v(1, 0)}})
    assert vector_store.mirror_vector_write(_card_ref(db), {"status": "unread"}, db=db) is None
    assert SIB in db.docs
    assert vector_store.mirror_vector_write(
        _card_ref(db), {"needsEmbedding": True}, replace=True, db=db) == "delete"
    assert SIB not in db.docs


def test_mirror_failure_is_swallowed_while_card_is_authoritative():
    db = FakeDb({CARD: {}})
    db.fail_prefix = "users/u1/vectors"
    assert vector_store.mirror_vector_write(_card_ref(db), {"embedding_vector": _v(1, 0)}, db=db) is None


def test_mirror_failure_raises_once_sibling_is_the_only_copy():
    db = FakeDb({CARD: {}}, flags={"siblingReady": True, "cardVectorsRemoved": True})
    db.fail_prefix = "users/u1/vectors"
    with pytest.raises(RuntimeError):
        vector_store.mirror_vector_write(_card_ref(db), {"embedding_vector": _v(1, 0)}, db=db)


def test_card_payload_keeps_the_vector_until_phase_three():
    update = {"embedding_vector": _v(1, 0), "title": "T"}
    assert vector_store.card_payload(update, FakeDb()) is update
    vector_store.reset_flag_cache()
    stripped = vector_store.card_payload(update, FakeDb(flags={"cardVectorsRemoved": True}))
    assert stripped == {"title": "T"}


def test_unreadable_or_mocked_flags_mean_phase_one():
    from unittest.mock import MagicMock
    assert vector_store.sibling_ready(MagicMock()) is False
    vector_store.reset_flag_cache()
    assert vector_store.card_vectors_removed(object()) is False  # .collection raises


# ── Repair check ─────────────────────────────────────────────────────────────

def test_repair_check_ignores_a_stale_sibling_while_cards_carry_vectors():
    db = FakeDb({SIB: {"embedding_vector": _v(1, 0)}})
    # Card has no vector: it needs one, even though an (old) sibling exists.
    assert vector_store.vector_needs_repair(_card_ref(db), {"title": "T"}, db) is True
    assert SIB not in db.reads


def test_repair_check_reads_sibling_once_cards_no_longer_carry_vectors():
    db = FakeDb({SIB: {"embedding_vector": _v(1, 0)}}, flags={"cardVectorsRemoved": True})
    assert vector_store.vector_needs_repair(_card_ref(db), {"title": "T"}, db) is False
    db2 = FakeDb(flags={"cardVectorsRemoved": True})
    vector_store.reset_flag_cache()
    assert vector_store.vector_needs_repair(_card_ref(db2), {"title": "T"}, db2) is True


# ── Nearest neighbours ───────────────────────────────────────────────────────

def _library(flags=None, siblings=True, card_vectors=True):
    docs = {}
    for cid, vec, status in (("near", _v(1, 0.1), "unread"), ("far", _v(0, 1), "unread"),
                             ("failed", _v(1, 0), "failed")):
        card = {"title": cid, "status": status}
        if card_vectors:
            card["embedding_vector"] = vec
        docs[f"users/u1/links/{cid}"] = card
        if siblings:
            docs[f"users/u1/vectors/{cid}"] = {"embedding_vector": vec}
    if siblings:
        docs["users/u1/vectors/orphan"] = {"embedding_vector": _v(1, 0.05)}
    return FakeDb(docs, flags=flags)


def test_before_backfill_search_reads_the_card_field():
    db = _library()
    hits = vector_store.find_nearest_cards(db, "u1", [1, 0], 10)
    assert db.nearest_calls == ["links"]
    assert [h[0] for h in hits][0] in ("failed", "near")


def test_after_backfill_search_reads_siblings_and_drops_orphans_and_failed():
    db = _library(flags={"siblingReady": True})
    hits = vector_store.find_nearest_cards(db, "u1", [1, 0], 10)
    assert db.nearest_calls == ["vectors"]
    assert [h[0] for h in hits] == ["near", "far"]
    assert hits[0][1]["title"] == "near"
    assert isinstance(hits[0][1]["vector_distance"], float)


def test_sibling_query_error_falls_back_to_card_field():
    db = _library(flags={"siblingReady": True})
    db.nearest_fails = "vectors"
    hits = vector_store.find_nearest_cards(db, "u1", [1, 0], 10)
    assert {h[0] for h in hits} == {"near", "far", "failed"}  # the old path, unchanged


def test_empty_sibling_collection_falls_back_to_card_field():
    db = _library(flags={"siblingReady": True}, siblings=False)
    hits = vector_store.find_nearest_cards(db, "u1", [1, 0], 10)
    assert db.nearest_calls == ["vectors", "links"]
    assert hits


def test_after_phase_three_search_still_finds_cards_via_siblings():
    db = _library(flags={"siblingReady": True, "cardVectorsRemoved": True}, card_vectors=False)
    hits = vector_store.find_nearest_cards(db, "u1", [1, 0], 10)
    assert [h[0] for h in hits] == ["near", "far"]


def test_load_vectors_prefers_siblings_and_falls_back_to_cards():
    db = FakeDb({
        "users/u1/links/a": {"embedding_vector": _v(1, 0)},
        "users/u1/links/b": {"embedding_vector": _v(0, 1)},
        "users/u1/vectors/a": {"embedding_vector": _v(0.5, 0.5)},
    }, flags={"siblingReady": True})
    vecs = vector_store.load_vectors(db, "u1", ["a", "b", "missing"])
    assert vecs == {"a": [0.5, 0.5], "b": [0.0, 1.0]}


# ── Search wiring ────────────────────────────────────────────────────────────

def test_perform_search_logic_uses_the_vector_store(monkeypatch):
    import search
    db = _library(flags={"siblingReady": True})
    monkeypatch.setattr(search, "get_db", lambda: db)

    class FakeES:
        api_key = "k"

        def generate_embedding(self, text, task_type=None):
            return [1.0, 0.0]

    monkeypatch.setattr(search, "EmbeddingService", FakeES)
    links = search.perform_search_logic("u1", "query", limit=5)
    assert [l["id"] for l in links] == ["near", "far"]
    assert all("embedding_vector" not in l for l in links)


# ── Trigger ──────────────────────────────────────────────────────────────────

class _EvSnap:
    def __init__(self, data, doc_id="c1", exists=True):
        self._data, self.id, self.exists = data, doc_id, exists

    def to_dict(self):
        return self._data


def _run_trigger(monkeypatch, db, after, before):
    import search
    import entitlement
    monkeypatch.setattr(search, "get_db", lambda: db)
    monkeypatch.setattr(search, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(entitlement, "maybe_start_trial", lambda uid: None)

    class FakeES:
        def generate_embedding(self, text):
            return [0.6, 0.8]

    monkeypatch.setattr(search, "EmbeddingService", FakeES)
    event = types.SimpleNamespace(
        data=types.SimpleNamespace(after=after, before=before),
        params={"uid": "u1", "linkId": "c1"})
    search.sync_link_embedding.__wrapped__(event)


def test_trigger_embed_writes_card_and_sibling(monkeypatch):
    card = {"title": "T", "summary": "S", "status": "unread", "needsEmbedding": True}
    db = FakeDb({CARD: dict(card)})
    _run_trigger(monkeypatch, db, _EvSnap(card), _EvSnap(card))
    assert isinstance(db.docs[CARD]["embedding_vector"], Vector)
    assert "needsEmbedding" not in db.docs[CARD]
    assert db.docs[SIB]["embedding_vector"] == db.docs[CARD]["embedding_vector"]


def test_trigger_create_with_vector_mirrors_it(monkeypatch):
    card = {"title": "T", "summary": "S", "status": "unread", "embedding_vector": _v(1, 0)}
    db = FakeDb({CARD: dict(card)})
    _run_trigger(monkeypatch, db, _EvSnap(card), _EvSnap(None, exists=False))
    assert db.docs[SIB]["embedding_vector"] == _v(1, 0)


def test_trigger_after_phase_three_does_not_reembed_a_card_whose_sibling_is_valid(monkeypatch):
    card = {"title": "T", "summary": "S", "status": "unread"}
    db = FakeDb({CARD: dict(card), SIB: {"embedding_vector": _v(1, 0)}},
                flags={"siblingReady": True, "cardVectorsRemoved": True})
    _run_trigger(monkeypatch, db, _EvSnap(card), _EvSnap(card))
    assert db.docs[SIB]["embedding_vector"] == _v(1, 0)  # untouched: no re-embed
    assert "embedding_vector" not in db.docs[CARD]


def test_trigger_after_phase_three_embeds_into_sibling_only(monkeypatch):
    card = {"title": "T", "summary": "S", "status": "unread", "needsEmbedding": True}
    db = FakeDb({CARD: dict(card)}, flags={"siblingReady": True, "cardVectorsRemoved": True})
    _run_trigger(monkeypatch, db, _EvSnap(card), _EvSnap(card))
    assert "embedding_vector" not in db.docs[CARD]
    assert "needsEmbedding" not in db.docs[CARD]
    assert isinstance(db.docs[SIB]["embedding_vector"], Vector)


# ── Deletes ──────────────────────────────────────────────────────────────────

def test_card_delete_cleanup_removes_the_sibling(monkeypatch):
    import card_cleanup
    db = FakeDb({SIB: {"embedding_vector": _v(1, 0)}})  # user doc gone → early return after
    monkeypatch.setattr(card_cleanup, "get_db", lambda: db)
    report = card_cleanup.cleanup_deleted_card_logic("u1", "c1", {"title": "T"})
    assert report["vector_deleted"] is True
    assert SIB not in db.docs


def test_account_deletion_sweeps_vectors():
    import link_service
    assert "vectors" in link_service.USER_SUBCOLLECTIONS


# ── Owner scripts (tools/) ───────────────────────────────────────────────────

def _tools():
    import importlib
    import sys
    from pathlib import Path
    tools_dir = str(Path(__file__).resolve().parents[1] / "tools")
    if tools_dir not in sys.path:
        sys.path.insert(0, tools_dir)
    return importlib.import_module("backfill_vectors"), importlib.import_module("migrate_strip_card_vectors")


def _script_db():
    return FakeDb({
        "users/u1/links/a": {"embedding_vector": _v(1, 0), "embeddingVersion": 5},
        "users/u1/links/b": {"embedding_vector": _v(0, 1)},
        "users/u1/vectors/b": {"embedding_vector": _v(1, 1)},          # stale
        "users/u1/links/c": {"title": "no vector"},
        "users/u1/vectors/c": {"embedding_vector": _v(1, 0)},          # card lost it
        "users/u1/vectors/gone": {"embedding_vector": _v(1, 0)},       # card deleted
    })


def test_backfill_dry_run_counts_and_writes_nothing():
    backfill, _ = _tools()
    db = _script_db()
    before = dict(db.docs)
    c = backfill.backfill_one(db, "u1", apply=False)
    assert (c["cards"], c["set"], c["fixed"], c["orphans"], c["unembedded"]) == (3, 1, 1, 2, 1)
    assert db.docs == before


def test_backfill_apply_reconciles_then_is_idempotent():
    backfill, _ = _tools()
    db = _script_db()
    backfill.backfill_one(db, "u1", apply=True)
    assert db.docs["users/u1/vectors/a"]["embedding_vector"] == _v(1, 0)
    assert db.docs["users/u1/vectors/a"]["embeddingVersion"] == 5
    assert db.docs["users/u1/vectors/b"]["embedding_vector"] == _v(0, 1)
    assert "users/u1/vectors/c" not in db.docs and "users/u1/vectors/gone" not in db.docs
    again = backfill.backfill_one(db, "u1", apply=True)
    assert again["set"] == again["fixed"] == again["orphans"] == 0


def test_strip_writes_missing_sibling_before_dropping_card_field_and_restore_undoes_it():
    _, strip = _tools()
    db = FakeDb({
        "users/u1/links/a": {"embedding_vector": _v(1, 0), "title": "A"},
        "users/u1/links/b": {"embedding_vector": _v(0, 1)},
        "users/u1/vectors/b": {"embedding_vector": _v(0, 1)},
    })
    dry = strip.strip_one(db, "u1", apply=False)
    assert (dry["with_vector"], dry["sibling_written"], dry["stripped"]) == (2, 1, 2)
    assert "embedding_vector" in db.docs["users/u1/links/a"]

    strip.strip_one(db, "u1", apply=True)
    assert db.docs["users/u1/links/a"] == {"title": "A"}
    assert db.docs["users/u1/vectors/a"]["embedding_vector"] == _v(1, 0)
    assert "embedding_vector" not in db.docs["users/u1/links/b"]

    restored = strip.restore_one(db, "u1", apply=True)
    assert restored["restored"] == 2
    assert db.docs["users/u1/links/a"]["embedding_vector"] == _v(1, 0)
