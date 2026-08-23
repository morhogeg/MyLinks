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
