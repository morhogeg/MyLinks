"""An honest "your saves don't cover that" is not an ungrounded answer (AI-5).

It has nothing to cite, which used to look exactly like an answer that failed
to cite: it got the strict re-ask (a second paid Gemini call), the ungrounded
caution banner, and kept the ask unit. The model now declares it
(`answered: false` / `[[CITED: none]]`) and the endpoint refunds it. Offline:
the model calls are stubbed. Whether the real model sets the flag reliably is
not verified here.
"""

import json
from types import SimpleNamespace

import pytest

import main
import ai_service
from ai_service import GeminiService
from tests.test_search_http import _Req, _Resp

CARDS = [{"id": "id1", "title": "Pasta", "summary": "A pasta recipe."}]
NO = "Your saves don't cover the history of the fork."


def _svc(*responses):
    svc = GeminiService.__new__(GeminiService)
    svc.client = object()
    calls = []

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=None):
        calls.append(config_extra)
        r = responses[len(calls) - 1]
        if isinstance(r, Exception):
            raise r
        return r

    svc._generate_json = fake_generate_json
    return svc, calls


def test_a_declared_no_answer_costs_one_call_and_is_not_ungrounded():
    svc, calls = _svc({"answer": NO, "citedIds": [], "answered": False})
    out = svc.answer_from_context("history of the fork?", CARDS)
    assert len(calls) == 1
    assert out["answer"] == NO
    assert out["ungrounded"] is False and out["noAnswer"] is True and out["citedIds"] == []


def test_the_answer_schema_carries_the_declaration():
    svc, calls = _svc({"answer": "Boil it.", "citedIds": ["id1"], "answered": True})
    svc.answer_from_context("how?", CARDS)
    schema = calls[0]["response_schema"]
    assert schema is ai_service.AskAnswer
    assert "answered" in schema.model_fields
    assert schema(answer="x").answered is True  # absent means answered


def test_an_uncited_answer_without_the_declaration_still_gets_the_strict_reask():
    svc, calls = _svc({"answer": "Confident, uncited.", "citedIds": []},
                      {"answer": "Still uncited.", "citedIds": []})
    out = svc.answer_from_context("how?", CARDS)
    assert len(calls) == 2
    assert out["ungrounded"] is True and "noAnswer" not in out


def test_the_strict_reask_may_declare_the_no_answer():
    svc, _ = _svc({"answer": "Uncited.", "citedIds": []},
                  {"answer": NO, "citedIds": [], "answered": "false"})
    out = svc.answer_from_context("history of the fork?", CARDS)
    assert out["noAnswer"] is True and out["ungrounded"] is False
    assert out["answer"] == NO


def test_citations_win_over_a_stray_declaration():
    svc, _ = _svc({"answer": "Boil it.", "citedIds": ["id1"], "answered": False})
    out = svc.answer_from_context("how?", CARDS)
    assert out["citedIds"] == ["id1"] and "noAnswer" not in out


def test_prompts_describe_both_declarations():
    assert '"answered": boolean' in ai_service._CITED_JSON_SUFFIX
    assert "answered to false" in ai_service._CITED_JSON_STRICT_SUFFIX
    seen = {}
    svc = GeminiService.__new__(GeminiService)

    def stream(model, contents, config=None):
        seen["prompt"] = contents[0]
        return iter([SimpleNamespace(text="ok\n[[CITED: id1]]")])

    svc.client = SimpleNamespace(models=SimpleNamespace(generate_content_stream=stream))
    list(svc.answer_from_context_stream("q?", CARDS))
    assert "[[CITED: none]]" in seen["prompt"]


# ── streaming twin ──────────────────────────────────────────────────────────

def _stream(*pieces):
    svc = GeminiService.__new__(GeminiService)
    svc.client = SimpleNamespace(models=SimpleNamespace(
        generate_content_stream=lambda **kw: iter([SimpleNamespace(text=p) for p in pieces])))
    events = list(svc.answer_from_context_stream("history of the fork?", CARDS))
    return "".join(p for k, p in events if k == "token"), events


def test_stream_none_marker_is_a_no_answer_not_ungrounded():
    prose, events = _stream(NO + "\n", "[[CITED: none]]")
    assert prose.strip() == NO
    assert ("noAnswer", True) in events and ("ungrounded", True) not in events
    assert ("citedIds", []) in events


def test_stream_real_citation_beats_none():
    _, events = _stream("Boil it [[CITED: id1]].\n", "[[CITED: none]]")
    assert ("citedIds", ["id1"]) in events
    assert ("noAnswer", True) not in events and ("ungrounded", True) not in events


# ── the endpoint refunds a no-answer ────────────────────────────────────────

@pytest.fixture
def endpoint(monkeypatch):
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
    monkeypatch.setattr(main, "keyword_scan_full", lambda *a, **k: [])
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())
    refunds = []
    monkeypatch.setattr(main, "refund_quota", lambda *a: refunds.append(a))
    return refunds


def test_endpoint_refunds_a_declared_no_answer(monkeypatch, endpoint):
    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            return {"answer": NO, "citedIds": [], "ungrounded": False, "noAnswer": True}

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "history of the fork?"}))
    body = json.loads(resp.body)
    assert resp.status == 200 and body["answer"] == NO and body["ungrounded"] is False
    assert endpoint == [("u1", "asks")]


def test_endpoint_charges_a_grounded_answer(monkeypatch, endpoint):
    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            return {"answer": "Boil it.", "citedIds": ["id1"], "ungrounded": False}

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook pasta?"}))
    assert endpoint == []


def test_stream_endpoint_refunds_a_no_answer_once(monkeypatch, endpoint):
    class _Gemini:
        def answer_from_context_stream(self, question, cards, history=None, **kwargs):
            yield ("token", NO)
            yield ("citedIds", [])
            yield ("noAnswer", True)

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "history of the fork?", "stream": True}))
    events = [json.loads(line[len("data: "):]) for line in "".join(resp.body).split("\n\n") if line]
    assert events[-1] == {"type": "done"}
    assert not any(e["type"] == "ungrounded" for e in events)
    assert endpoint == [("u1", "asks")]
