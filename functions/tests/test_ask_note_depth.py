"""Ask reads a note's own words, not just their first 1,500 characters (AI-10).

A typed note or a shared-text card stores the user's verbatim text in
`summary` (up to MAX_NOTE_LENGTH), but ask_brain capped every summary at
1,500 characters, and the AI write-up of a verbatim text card (parked in
`aiDetailedSummary`) never reached the prompt at all. Offline: retrieval and
the model are stubbed; the test reads the slimmed cards the model was given.
"""

import pytest

import main
from tests.test_search_http import _Req, _Resp


@pytest.fixture
def ask(monkeypatch):
    seen = {}
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "plan_for", lambda uid: "pro")
    monkeypatch.setattr(main, "meter_quota",
                        lambda *a, **k: {"ok": True, "remaining": 1, "used": 1, "limit": 2, "plan": "pro"})
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "rerank_candidates", lambda q, c, top_k=10: list(c))
    monkeypatch.setattr(main, "keyword_scan_cards", lambda *a, **k: [])
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())

    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            seen["cards"] = {c["id"]: c for c in cards}
            return {"answer": "ok", "citedIds": []}

    monkeypatch.setattr(main, "GeminiService", _Gemini)

    def run(cards):
        monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: list(cards))
        main.ask_brain(_Req(json_body={"uid": "u1", "question": "what did I write about the trip"}))
        return seen["cards"]

    return run


LONG = "word " * 1500  # 7,500 characters of the user's own text


def test_a_long_note_in_the_deep_window_reaches_the_model(ask):
    out = ask([{"id": "note", "title": "Trip notes", "summary": LONG, "sourceType": "note"}])
    assert len(out["note"]["summary"]) == main.ASK_DETAIL_MAX_CHARS


def test_shared_text_and_saved_answers_get_the_same_depth(ask):
    out = ask([{"id": "text", "title": "T", "summary": LONG, "captureType": "text", "sourceType": "note"},
               {"id": "answer", "title": "A", "summary": LONG, "captureType": "answer"}])
    assert len(out["text"]["summary"]) == main.ASK_DETAIL_MAX_CHARS
    assert len(out["answer"]["summary"]) == main.ASK_DETAIL_MAX_CHARS


def test_ordinary_cards_and_the_tail_keep_the_short_cap(ask):
    cards = [{"id": f"c{i}", "title": "Article", "summary": LONG} for i in range(main.ASK_DEEP_CARDS)]
    cards.append({"id": "late-note", "title": "N", "summary": LONG, "sourceType": "note"})
    out = ask(cards)
    assert len(out["c0"]["summary"]) == 1500
    assert len(out["late-note"]["summary"]) == 1500  # outside the deep window


def test_a_verbatim_cards_parked_write_up_is_included(ask):
    out = ask([{"id": "text", "title": "T", "summary": "My own paragraph.", "captureType": "text",
                "sourceType": "note", "detailedSummary": "",
                "aiDetailedSummary": "## Key Points\n- The paragraph argues X."}])
    assert out["text"]["detailedSummary"] == "## Key Points\n- The paragraph argues X."
