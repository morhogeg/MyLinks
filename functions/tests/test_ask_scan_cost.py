"""Ask's lexical scans are bounded and light (AI-14).

Every anchor (a quoted title) that retrieval missed cost ask_brain one scan of
the newest 1,000 cards, with no cap on anchors: a 2,000-character question
of quoted phrases was 287 full-library scans. And every Ask scan streamed
COMPLETE documents (embedding vector included) although only ten small fields
decide a match. Offline: retrieval is stubbed at the boundary.
"""

import pytest

import main
import search
from tests.test_search_http import _Req, _Resp

_QUOTED_FLOOD = " ".join(f'"t{i:03d}"' for i in range(300))[:2000]


def test_anchor_phrases_are_capped():
    assert len(search.extract_quoted_phrases(_QUOTED_FLOOD)) > 250
    anchors = search.anchor_phrases_for(_QUOTED_FLOOD, ["Chip Title"])
    assert len(anchors) == search.MAX_ANCHOR_PHRASES == 4


def test_chip_anchors_still_survive_the_cap():
    assert search.anchor_phrases_for('Compare "Alpha Protocol" with "Beta Notes"', ["Alpha Protocol"]) == [
        "Alpha Protocol", "Beta Notes"]


def test_a_quoted_flood_costs_at_most_a_handful_of_scans(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "plan_for", lambda uid: "pro")
    monkeypatch.setattr(main, "meter_quota",
                        lambda *a, **k: {"ok": True, "remaining": 1, "used": 1, "limit": 2, "plan": "pro"})
    monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: [{"id": "a", "title": "Something"}])
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "rerank_candidates", lambda q, c, top_k=10: list(c))
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())
    scans = []
    monkeypatch.setattr(main, "keyword_scan_full", lambda uid, q, exclude_ids=None, limit=5: scans.append(q) or [])

    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            return {"answer": "ok", "citedIds": ["a"]}

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": _QUOTED_FLOOD}))

    assert resp.status == 200
    assert len(scans) <= 1 + search.MAX_ANCHOR_PHRASES  # the main scan + capped anchors


def test_keyword_scan_full_reads_the_projection_and_hydrates_only_winners(monkeypatch):
    seen = {}

    def fake_scan(uid, q, exclude_ids=None, limit=10, fields=None):
        seen["fields"] = fields
        return [{"id": "b", "title": "x"}, {"id": "gone", "title": "x"}, {"id": "a", "title": "x"}]

    def fake_by_ids(uid, ids):
        seen["ids"] = list(ids)
        return [{"id": "a", "title": "A", "detailedSummary": "full body"},
                {"id": "b", "title": "B", "detailedSummary": "full body"}]

    monkeypatch.setattr(search, "keyword_scan_cards", fake_scan)
    monkeypatch.setattr(search, "cards_by_ids", fake_by_ids)

    out = search.keyword_scan_full("u1", "pasta", exclude_ids={"z"}, limit=3)

    assert seen["fields"] == search.SEARCH_SCAN_FIELDS
    assert seen["ids"] == ["b", "gone", "a"]
    assert [c["id"] for c in out] == ["b", "a"]          # scan order kept, vanished one dropped
    assert all(c["detailedSummary"] == "full body" for c in out)


def test_keyword_scan_full_skips_the_fetch_when_nothing_matched(monkeypatch):
    monkeypatch.setattr(search, "keyword_scan_cards", lambda *a, **k: [])
    monkeypatch.setattr(search, "cards_by_ids", lambda *a, **k: pytest.fail("fetched nothing"))
    assert search.keyword_scan_full("u1", "pasta") == []
