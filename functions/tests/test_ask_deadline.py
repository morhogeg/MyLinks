"""Ask runs on one wall-clock budget (AI-3, server half).

A Gemini call could take 90s (GEMINI_CALL_TIMEOUT_MS) and the buffered ladder
can make about a dozen of them, inside ask_brain's 120s timeout, behind a
Hosting rewrite that gives up at 60s. The ask unit was charged up front and
only refunded when Python saw an exception, never when the platform killed
the function or the client had already left. Now every Ask call carries a
short per-call timeout and no call starts once the request's budget
(ASK_DEADLINE_S) cannot cover it; the caller refunds and answers 502/503.

Offline and instant: a fake clock replaces ai_service's `time`, and the fake
Gemini client "hangs" by advancing that clock by its whole per-call timeout.
"""

import json
from types import SimpleNamespace

import pytest

import ai_service
import main
from tests.test_search_http import _Req, _Resp

CARDS = [{"id": "id1", "title": "Pasta", "summary": "A pasta recipe."}]


class _Clock:
    def __init__(self):
        self.t = 1000.0

    def monotonic(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


class _HangingModels:
    """Every call burns its whole per-call timeout, then times out."""

    def __init__(self, clock):
        self.clock = clock
        self.timeouts = []

    def _hang(self, config):
        timeout_ms = ((config or {}).get("http_options") or {}).get("timeout")
        self.timeouts.append(timeout_ms)
        self.clock.t += (timeout_ms or ai_service.GEMINI_CALL_TIMEOUT_MS) / 1000
        raise TimeoutError("read timeout")

    def generate_content(self, model, contents, config=None):
        self._hang(config)

    def generate_content_stream(self, model, contents, config=None):
        self._hang(config)


@pytest.fixture
def env(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(ai_service, "time", clock)
    models = _HangingModels(clock)

    def make_service():
        svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
        svc.client = SimpleNamespace(models=models)
        svc.model = ai_service.GEMINI_ANALYSIS_MODEL
        return svc

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
    monkeypatch.setattr(main, "_record_server_error", lambda *a, **k: None)
    refunds = []
    monkeypatch.setattr(main, "refund_quota", lambda *a: refunds.append(a))
    monkeypatch.setattr(main, "GeminiService", make_service)
    return SimpleNamespace(clock=clock, models=models, refunds=refunds, start=clock.t)


def test_hanging_model_fails_inside_the_budget_and_refunds(env):
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook the pasta?"}))

    assert resp.status in (502, 503)
    assert env.refunds == [("u1", "asks")]
    # Never past the budget, and no single call allowed the old 90s.
    assert env.clock.t - env.start <= ai_service.ASK_DEADLINE_S + 1e-6
    assert env.models.timeouts and all(t <= ai_service.ASK_CALL_TIMEOUT_MS for t in env.models.timeouts)
    # Ask model twice (a retry), then the fallback model on what was left.
    assert len(env.models.timeouts) == 3 and env.models.timeouts[2] < ai_service.ASK_CALL_TIMEOUT_MS


def test_budget_spent_in_retrieval_skips_the_model_with_a_friendly_503(monkeypatch, env):
    def slow_retrieval(*a, **k):
        env.clock.t += ai_service.ASK_DEADLINE_S - 2  # leaves less than ASK_MIN_CALL_S
        return list(CARDS)

    monkeypatch.setattr(main, "perform_search_logic", slow_retrieval)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook the pasta?"}))

    assert resp.status == 503
    assert json.loads(resp.body)["error"] == "Machina took too long to answer. Please try again in a moment."
    assert env.models.timeouts == []  # no call was started
    assert env.refunds == [("u1", "asks")]


def test_stream_stops_at_the_budget_with_an_error_event_and_a_refund(monkeypatch, env):
    def slow_retrieval(*a, **k):
        env.clock.t += ai_service.ASK_DEADLINE_S - 2
        return list(CARDS)

    monkeypatch.setattr(main, "perform_search_logic", slow_retrieval)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook the pasta?", "stream": True}))
    events = [json.loads(line[len("data: "):]) for line in "".join(resp.body).split("\n\n") if line]

    assert events == [{"type": "error", "error": "Machina took too long to answer. Please try again in a moment."}]
    assert env.models.timeouts == []
    assert env.refunds == [("u1", "asks")]


def test_stream_rungs_carry_the_short_timeout(env):
    seen = []

    def stream(model, contents, config=None):
        seen.append(config["http_options"]["timeout"])
        return iter([SimpleNamespace(text="Boil it.\n[[CITED: id1]]")])

    env.models.generate_content_stream = stream
    svc = main.GeminiService()
    events = list(svc.answer_from_context_stream("q?", CARDS, deadline=ai_service.ask_deadline()))
    assert ("citedIds", ["id1"]) in events
    assert seen == [ai_service.ASK_CALL_TIMEOUT_MS]
    assert svc._deadline is None  # the budget does not outlive the request


def test_other_surfaces_keep_the_client_timeout(env):
    seen = []

    def generate(model, contents, config=None):
        seen.append(config)
        return SimpleNamespace(text='{"title": "T", "summary": "Done.", "category": "Tech", "tags": ["x"]}')

    env.models.generate_content = generate
    main.GeminiService()._generate_json(["analyze"], "text analysis")
    assert "http_options" not in seen[0]
