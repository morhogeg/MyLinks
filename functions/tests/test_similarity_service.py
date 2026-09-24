"""Server-side card similarity (similarity_service.py) and its HTTP entry
(`/api/search` with a `similarity` body).

The client's Related list and graph keep their own qualification logic
(web/lib/related.ts); the server only supplies cosine similarities. What must
hold is that every pair the client's bar could qualify is returned, and the
constants that define "could qualify" match the TS file.
"""

import json
import re
from pathlib import Path

import pytest
from google.cloud.firestore_v1.vector import Vector

import similarity_service as sim
import vector_store
from tests.test_vector_store import FakeDb


@pytest.fixture(autouse=True)
def _fresh_flags():
    vector_store.reset_flag_cache()
    yield
    vector_store.reset_flag_cache()


def test_thresholds_match_related_ts():
    ts = (Path(__file__).resolve().parents[2] / "web" / "lib" / "related.ts").read_text()
    def const(name):
        return float(re.search(rf"export const {name} = ([0-9.]+);", ts).group(1))
    assert const("SEMANTIC_ASSIST_MIN") == sim.SEMANTIC_ASSIST_MIN
    assert const("CONCEPT_SIM_FLOOR") == sim.CONCEPT_SIM_FLOOR
    graph_ts = (Path(__file__).resolve().parents[2] / "web" / "lib" / "graph.ts").read_text()
    assert int(re.search(r"const MAX_PAIRWISE = (\d+);", graph_ts).group(1)) == sim.MAX_GRAPH_IDS


def _unit(angle_deg):
    import math
    a = math.radians(angle_deg)
    return Vector([math.cos(a), math.sin(a)])


def _db(vectors, flags=None, siblings=False):
    docs = {}
    for cid, v in vectors.items():
        docs[f"users/u1/links/{cid}"] = {"title": cid, "status": "unread", "embedding_vector": v}
        if siblings:
            docs[f"users/u1/vectors/{cid}"] = {"embedding_vector": v}
    docs["users/u1/links/novec"] = {"title": "novec", "status": "unread"}
    return FakeDb(docs, flags=flags)


# cos(angle): 0°→1.0, 20°→0.94, 45°→0.707, 50°→0.643, 70°→0.342
VECS = {"a": _unit(0), "b": _unit(20), "c": _unit(45), "d": _unit(50), "e": _unit(70)}


def test_graph_pairs_keep_everything_the_bar_could_qualify():
    out = sim.graph_similarity(_db(VECS), "u1", ["a", "b", "c", "e", "novec"])
    pairs = {(i, j): s for i, j, s in out["pairs"]}
    assert out["noVector"] == ["novec"]
    assert pairs[(0, 1)] == pytest.approx(0.9397, abs=1e-3)   # semantic range
    assert pairs[(0, 2)] == pytest.approx(0.7071, abs=1e-3)   # concept range, no concepts sent → kept
    assert (0, 3) not in pairs                                 # 0.34 < floor: never qualifies
    assert all(4 not in (i, j) for i, j, _ in out["pairs"])


def test_graph_concept_band_pairs_need_two_shared_concepts():
    ids = ["a", "c", "d"]
    concepts = [["X", "y"], ["x", "Y "], ["x"]]
    out = sim.graph_similarity(_db(VECS), "u1", ids, concepts)
    pairs = {(i, j) for i, j, _ in out["pairs"]}
    assert (0, 1) in pairs        # 0.707, shares x + y (case/space-insensitive)
    assert (0, 2) not in pairs    # 0.643, shares only x
    assert (1, 2) in pairs        # 0.996 semantic, concepts irrelevant


def test_related_returns_candidate_sims_neighbours_and_no_vector_ids():
    db = _db(VECS)
    out = sim.related_similarity(db, "u1", "a", ["c", "novec", "a"])
    assert out["anchorHasVector"] is True
    assert out["noVector"] == ["novec"]
    assert out["sims"]["c"] == pytest.approx(0.7071, abs=1e-3)   # exact, candidate
    assert out["sims"]["b"] == pytest.approx(0.9397, abs=1e-3)   # neighbour ≥ 0.74
    assert "d" not in out["sims"] and "e" not in out["sims"] and "a" not in out["sims"]


def test_related_without_anchor_vector():
    out = sim.related_similarity(_db(VECS), "u1", "novec", ["a"])
    assert out == {"anchorHasVector": False, "sims": {}, "noVector": []}


def test_related_reads_siblings_after_backfill():
    db = _db(VECS, flags={"siblingReady": True}, siblings=True)
    out = sim.related_similarity(db, "u1", "a", [])
    assert "vectors" in db.nearest_calls
    assert out["sims"]["b"] == pytest.approx(0.9397, abs=1e-3)


def test_clean_ids_drops_paths_and_junk():
    assert sim.clean_ids(["a", "a", "x/y", 3, "", "b"], 10) == ["a", "b"]
    assert sim.clean_ids("nope", 10) == []
    assert sim.clean_ids(["a", "b", "c"], 2) == ["a", "b"]


# ── HTTP entry ───────────────────────────────────────────────────────────────

import main  # noqa: E402
from tests.test_search_http import _Req, _Resp  # noqa: E402


@pytest.fixture
def http(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    buckets = []
    monkeypatch.setattr(main, "check_rate_limit", lambda key, *a, **k: buckets.append(key.split(":")[0]) or True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    db = _db(VECS)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "perform_hybrid_search",
                        lambda *a, **k: pytest.fail("similarity must not run a search"))
    return buckets


def test_http_related_mode(http):
    resp = main.search_links_http(_Req(json_body={"uid": "u1", "similarity": {"anchorId": "a", "candidateIds": ["c"]}}))
    assert resp.status == 200
    body = json.loads(resp.body)
    assert set(body["sims"]) == {"b", "c"}
    assert http == ["similarity", "similarity-uid"]   # never the search buckets


def test_http_graph_mode(http):
    resp = main.search_links_http(_Req(json_body={"uid": "u1", "similarity": {"ids": ["a", "b"]}}))
    assert resp.status == 200
    assert json.loads(resp.body)["pairs"][0][:2] == [0, 1]


def test_http_rejects_empty_spec(http):
    resp = main.search_links_http(_Req(json_body={"uid": "u1", "similarity": {"ids": ["a"]}}))
    assert resp.status == 400


def test_http_requires_auth(http):
    resp = main.search_links_http(_Req(json_body={"similarity": {"anchorId": "a"}}))
    assert resp.status == 401
