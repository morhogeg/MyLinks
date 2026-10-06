"""Streamed Ask answers end honestly (AI-8).

Two ways a streamed answer used to end early with no signal:
  - emission stopped at the FIRST `[[CITED:`; a marker the model wrote
    mid-answer ("The maple cake [[CITED: id]] bakes for 40 minutes…") cut the
    visible answer to "The maple cake ", and only the first marker's ids
    counted;
  - finish_reason was never checked, so an answer stopped by MAX_TOKENS or
    SAFETY ended with "done" like a whole one (and the failure reason read
    from the stream object was always "unknown").
Offline: the Gemini stream is faked chunk by chunk.
"""

import json
from types import SimpleNamespace

import pytest

import main
from ai_service import GeminiService, AnalysisError, _parse_cited_marker, _strip_cited_markers
from tests.test_search_http import _Req, _Resp

CARDS = [{"id": "id1", "title": "Maple cake", "summary": "A cake."},
         {"id": "id2", "title": "Oven guide", "summary": "Temperatures."}]


def _chunk(text, finish=None):
    cands = [SimpleNamespace(finish_reason=finish)] if finish else []
    return SimpleNamespace(text=text, candidates=cands)


class _Models:
    """One scripted chunk list per attempt; records the attempts made."""

    def __init__(self, *scripts):
        self.scripts = list(scripts)
        self.requested = []

    def generate_content_stream(self, model, contents, config=None):
        self.requested.append(model)
        script = self.scripts[min(len(self.requested), len(self.scripts)) - 1]
        return iter(script)


def _run(*scripts, cards=CARDS):
    svc = GeminiService.__new__(GeminiService)
    models = _Models(*scripts)
    svc.client = SimpleNamespace(models=models)
    events = list(svc.answer_from_context_stream("q?", cards))
    prose = "".join(p for k, p in events if k == "token")
    return prose, events, models


def _kind(events, kind):
    return next((p for k, p in events if k == kind), None)


# ── inline markers no longer end the answer ─────────────────────────────────

def test_a_mid_answer_marker_is_removed_and_the_rest_still_streams():
    prose, events, _ = _run([
        _chunk("The maple cake [[CITED: id1]] bakes for 40 minutes"),
        _chunk(" at 180C.\n[[CITED: id2]]", finish="STOP"),
    ])
    assert prose.strip() == "The maple cake bakes for 40 minutes at 180C."
    assert "[[CITED" not in prose
    assert _kind(events, "citedIds") == ["id1", "id2"]
    assert _kind(events, "incomplete") is None


def test_a_marker_split_across_chunks_mid_answer():
    prose, events, _ = _run([
        _chunk("Bake it [[CI"), _chunk("TED: id1]] then cool it."), _chunk("", finish="STOP"),
    ])
    assert prose == "Bake it then cool it."
    assert _kind(events, "citedIds") == ["id1"]


def test_parse_unions_every_marker_including_a_cut_off_last_one():
    text = "A [[CITED: id1]] b [[CITED: id2, id1]] c\n[[CITED: id3, id4"
    assert _parse_cited_marker(text) == ["id1", "id2", "id3", "id4"]


def test_marker_strip_keeps_exactly_one_space_between_words():
    assert _strip_cited_markers("cake [[CITED: a]] bakes") == "cake bakes"
    assert _strip_cited_markers("cake[[CITED: a]] bakes") == "cake bakes"
    assert _strip_cited_markers("cake [[CITED: a]].") == "cake."
    assert _strip_cited_markers("Done.\n[[CITED: a, b]]") == "Done.\n"


# ── finish_reason is read, from the last chunk ──────────────────────────────

def test_max_tokens_after_visible_text_is_reported_incomplete():
    prose, events, _ = _run([
        _chunk("Step 1: mix the flour. Step 2: add the"),
        _chunk(" eggs and", finish="MAX_TOKENS"),
    ])
    assert "Step 1" in prose
    assert events[-1] == ("incomplete", "MAX_TOKENS")
    assert _kind(events, "citedIds") is None and _kind(events, "ungrounded") is None


def test_an_sdk_enum_finish_reason_is_understood():
    enum_like = SimpleNamespace(name="SAFETY", value="SAFETY")
    _, events, _ = _run([_chunk("Partial answer that is visible"),
                         SimpleNamespace(text=None, candidates=[SimpleNamespace(finish_reason=enum_like)])])
    assert events[-1] == ("incomplete", "SAFETY")


def test_a_stop_before_anything_reached_the_user_tries_the_next_rung():
    # The first attempt's text is all held back (a would-be marker), then
    # SAFETY: nothing was shown, so the ladder moves on instead of failing.
    prose, events, models = _run(
        [_chunk("[[CIT", finish="SAFETY")],
        [_chunk("Clean answer.\n[[CITED: id1]]", finish="STOP")],
    )
    assert len(models.requested) == 2
    assert prose.strip() == "Clean answer."
    assert _kind(events, "citedIds") == ["id1"]


def test_failure_reason_comes_from_the_last_chunk():
    empty_safety = [SimpleNamespace(text=None, candidates=[SimpleNamespace(finish_reason="SAFETY")])]
    svc = GeminiService.__new__(GeminiService)
    svc.client = SimpleNamespace(models=_Models(empty_safety))
    svc._drop_prompt_blocked_cards = lambda *a, **k: (CARDS, [], False)
    with pytest.raises(AnalysisError) as err:
        list(svc.answer_from_context_stream("q?", CARDS))
    assert "finish_reason=SAFETY" in str(err.value)


def test_a_normal_stream_without_finish_metadata_is_complete():
    prose, events, _ = _run([_chunk("Plain answer.\n"), _chunk("[[CITED: id2]]")])
    assert prose.strip() == "Plain answer."
    assert _kind(events, "incomplete") is None
    assert _kind(events, "citedIds") == ["id2"]


# ── the endpoint turns "incomplete" into an error event and a refund ────────

def test_endpoint_reports_a_cut_off_stream_and_refunds(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "plan_for", lambda uid: "pro")
    monkeypatch.setattr(main, "meter_quota",
                        lambda *a, **k: {"ok": True, "remaining": 1, "used": 1, "limit": 2, "plan": "pro"})
    monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: list(CARDS))
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "rerank_candidates", lambda q, c, top_k=10: list(c))
    monkeypatch.setattr(main, "keyword_scan_cards", lambda *a, **k: [])
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())
    refunds, errors = [], []
    monkeypatch.setattr(main, "refund_quota", lambda *a: refunds.append(a))
    monkeypatch.setattr(main, "_record_server_error", lambda fn, exc, uid=None: errors.append(str(exc)))

    class _Gemini:
        def answer_from_context_stream(self, question, cards, history=None, **kwargs):
            yield ("token", "Half an answer")
            yield ("incomplete", "MAX_TOKENS")

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I bake it?", "stream": True}))
    events = [json.loads(line[len("data: "):]) for line in "".join(resp.body).split("\n\n") if line]

    assert events[0] == {"type": "token", "text": "Half an answer"}
    assert events[-1]["type"] == "error" and events[-1]["reason"] == "incomplete"
    assert not any(e["type"] == "done" for e in events)
    assert refunds == [("u1", "asks")]
    assert errors and "MAX_TOKENS" in errors[0]
