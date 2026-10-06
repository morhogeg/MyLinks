"""Relatedness quality gates and backfill accounting (graph_service).

The 2026-08-22 related-cards fix rests on three gates: a cosine-distance
ceiling before the LLM ever sees a candidate, an adversarial gatekeeper
prompt, and a similarity floor with NO default gifted to a missing score
(the original bug handed an absent LLM score `similarity: 0.8`). These tests
pin all three offline, plus the backfill's failed-vs-skipped accounting that
the client graph migration (web/lib/rebuildConnections.ts ensureGraphVersion)
now depends on: `failed` must mean "a retry could help" — a permanently
text-less card is `skipped`, or the version stamp would never be written and
every app open would re-run the whole force rebuild forever.
"""

from types import SimpleNamespace

import pytest

pytest.importorskip("bs4")

import graph_service
from graph_service import GraphService


class _Doc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.updates = []
        self.reference = SimpleNamespace(update=self.updates.append)

    def to_dict(self):
        return dict(self._data)


class _LinksRef:
    """Just enough of a Firestore collection for backfill_batch and the
    find_nearest candidate query."""

    def __init__(self, docs):
        self._docs = docs
        self._limit = None

    # backfill pagination surface
    def order_by(self, field):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def stream(self):
        return iter(self._docs[: self._limit])

    def document(self, doc_id):
        return SimpleNamespace(get=lambda: SimpleNamespace(exists=False))

    # vector search surface
    def find_nearest(self, **kwargs):
        return SimpleNamespace(get=lambda: list(self._docs))


class _Db:
    def __init__(self, docs):
        self._links = _LinksRef(docs)

    def collection(self, name):
        return SimpleNamespace(
            document=lambda uid: SimpleNamespace(
                collection=lambda sub: self._links))


def _service(docs):
    svc = GraphService.__new__(GraphService)
    svc.db = _Db(docs)
    svc.ai = SimpleNamespace(client=None, embed_text=lambda text: None)
    return svc


# ── backfill accounting: failed must mean "retry could help" ─────────────────

def test_relate_phase_counts_textless_cards_as_skipped_not_failed():
    docs = [
        _Doc("has-relations", {"title": "T", "summary": "S",
                               "relatedLinks": [{"id": "x"}]}),
        _Doc("no-text", {"title": "", "summary": ""}),
    ]
    res = _service(docs).backfill_batch("uid", phase="relate", limit=20)
    assert res["failed"] == 0
    assert res["skipped"] == 2
    assert res["done"] is True


def test_relate_phase_still_fails_on_a_missing_embedding():
    # Text exists but no stored vector and embed_text returns None — a genuine
    # transient failure (quota/outage): retrying later CAN fix it, so it counts.
    docs = [_Doc("embed-broken", {"title": "T", "summary": "S"})]
    res = _service(docs).backfill_batch("uid", phase="relate", limit=20)
    assert res["failed"] == 1


# ── the three relatedness gates ──────────────────────────────────────────────

def _related_call(distances, relations):
    """Run find_related_links over candidates at the given cosine distances,
    with the LLM verifier faked to return `relations`. Returns (results,
    candidates_the_llm_saw)."""
    docs = [
        _Doc(f"c{i}", {"title": f"T{i}", "summary": "S",
                       "vector_distance": d, "concepts": []})
        for i, d in enumerate(distances)
    ]
    svc = _service(docs)
    seen = {}

    def fake_verify(title, summary, concepts, candidates):
        seen["candidates"] = candidates
        return relations

    svc._verify_relationships_with_llm = fake_verify
    results = svc.find_related_links(
        new_link_id="new", title="New", summary="Sum",
        embedding=[0.1] * 4, new_concepts=[], uid="uid")
    return results, seen.get("candidates")


def test_distance_ceiling_keeps_far_candidates_from_the_llm():
    _, candidates = _related_call([0.30, 0.65, 0.90], relations=[])
    assert [c["id"] for c in candidates] == ["c0"]


def test_missing_similarity_score_is_dropped_not_defaulted():
    # The original bug: a relation with no score was gifted similarity 0.8 and
    # shipped as a confident connection. Now it must be dropped outright.
    results, candidates = _related_call(
        [0.30], relations=[{"id": "c0", "reason": "same topic"}])
    assert candidates is not None  # the pipeline genuinely ran (no swallowed error)
    assert results == []


def test_below_floor_similarity_is_dropped_and_at_floor_kept():
    results, _ = _related_call(
        [0.30, 0.31],
        relations=[
            {"id": "c0", "reason": "hedge", "similarity": 0.5},
            {"id": "c1", "reason": "real", "similarity": 0.9},
        ])
    assert [r["id"] for r in results] == ["c1"]
    assert results[0]["similarity"] == 0.9


def test_all_candidates_past_ceiling_returns_empty_without_llm():
    svc = _service([_Doc("far", {"title": "T", "summary": "S",
                                 "vector_distance": 0.9})])
    svc._verify_relationships_with_llm = lambda *a, **k: (
        pytest.fail("LLM called despite empty candidate set"))
    assert svc.find_related_links("new", "N", "S", [0.1] * 4, [], "uid") == []


# ── RV-11: a deleted checkpoint card does not restart the phase ─────────────

class _PagedLinks:
    """Pages by document id like Firestore's order_by('__name__'): a cursor
    is a POSITION, valid whether or not that card still exists."""

    def __init__(self, docs):
        self._docs = sorted(docs, key=lambda d: d.id)
        self._after = None
        self._limit = None

    def order_by(self, field):
        assert field == "__name__"
        return self

    def start_after(self, cursor):
        self._after = cursor["__name__"] if isinstance(cursor, dict) else cursor.id
        return self

    def limit(self, n):
        self._limit = n
        return self

    def stream(self):
        docs = [d for d in self._docs if self._after is None or d.id > self._after]
        return iter(docs[: self._limit])

    def document(self, doc_id):
        exists = any(d.id == doc_id for d in self._docs)
        return SimpleNamespace(get=lambda: SimpleNamespace(exists=exists, id=doc_id))


def _paged_service(docs):
    links = _PagedLinks(docs)
    svc = GraphService.__new__(GraphService)
    svc.db = SimpleNamespace(collection=lambda name: SimpleNamespace(
        document=lambda uid: SimpleNamespace(collection=lambda sub: links)))
    svc.ai = SimpleNamespace(client=None, embed_text=lambda text: None)
    return svc


def test_a_deleted_checkpoint_card_resumes_after_its_id():
    # c3 was the last card of the previous page and has since been deleted.
    docs = [_Doc(f"c{i}", {"title": "", "summary": ""}) for i in (1, 2, 4, 5, 6)]
    res = _paged_service(docs).backfill_batch("uid", phase="relate", cursor="c3", limit=2)
    assert res["nextCursor"] == "c5"  # page was c4, c5, not c1, c2 again
    assert res["processed"] == 2 and res["done"] is False


def test_the_cursor_is_a_document_position_in_the_real_query(monkeypatch):
    pytest.importorskip("google.cloud.firestore_v1.query")
    from google.auth.credentials import AnonymousCredentials
    from google.cloud import firestore
    from google.cloud.firestore_v1.document import DocumentReference
    from google.cloud.firestore_v1.query import Query

    built = []
    monkeypatch.setattr(Query, "stream", lambda self, *a, **k: built.append(self._to_protobuf()) or iter([]))
    # Offline: resuming must not need the checkpoint card itself.
    monkeypatch.setattr(DocumentReference, "get", lambda self, *a, **k: pytest.fail("read the checkpoint card"))
    svc = GraphService.__new__(GraphService)
    svc.db = firestore.Client(project="p", credentials=AnonymousCredentials())
    svc.ai = SimpleNamespace(client=None, embed_text=lambda text: None)

    svc.backfill_batch("u1", phase="embed", cursor="c3", limit=20)

    start = built[0].start_at
    assert start.before is False  # start AFTER the checkpoint
    assert start.values[0].reference_value.endswith("/documents/users/u1/links/c3")
