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

RV-2: the per-call timeout is shaped by how the reply arrives. A buffered
call (the native app asks for one buffered answer) gets the whole remaining
budget and is not retried on the same model after a timeout: capped at 20s,
every answer that took longer to generate failed with a 502 after ~50s. A
stream keeps the 20s as its client READ timeout, and the server is told the
rest of the budget explicitly (google-genai otherwise sends the 20s as the
X-Server-Timeout of the whole stream).
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
    monkeypatch.setattr(main, "keyword_scan_full", lambda *a, **k: [])
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())
    monkeypatch.setattr(main, "_record_server_error", lambda *a, **k: None)
    refunds = []
    monkeypatch.setattr(main, "refund_quota", lambda *a: refunds.append(a))
    monkeypatch.setattr(main, "GeminiService", make_service)
    return SimpleNamespace(clock=clock, models=models, refunds=refunds, start=clock.t)


def test_hanging_model_fails_inside_the_budget_and_refunds(env):
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook the pasta?"}))

    assert resp.status == 503
    assert json.loads(resp.body)["error"] == "Machina took too long to answer. Please try again in a moment."
    assert env.refunds == [("u1", "asks")]
    # Never past the budget, and no call allowed the old 90s.
    assert env.clock.t - env.start <= ai_service.ASK_DEADLINE_S + 1e-6
    # One buffered call with the whole budget; after its timeout neither a
    # same-model retry nor the fallback model had time to start.
    assert env.models.timeouts == [int(ai_service.ASK_DEADLINE_S * 1000)]


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


# ── RV-2: the timeout follows how the reply arrives ────────────────────────

def _svc_with_budget(env, left_s):
    svc = main.GeminiService()
    svc._deadline = env.clock.t + left_s
    return svc


def test_a_stream_reads_on_a_short_timeout_and_tells_the_server_the_budget(env):
    cfg = _svc_with_budget(env, 45)._call_config({"temperature": 0.2}, stream=True)
    assert cfg["http_options"] == {"timeout": ai_service.ASK_CALL_TIMEOUT_MS,
                                   "headers": {"X-Server-Timeout": "45"}}
    assert cfg["temperature"] == 0.2
    late = _svc_with_budget(env, 6.5)._call_config({}, stream=True)
    assert late["http_options"] == {"timeout": 6500, "headers": {"X-Server-Timeout": "6"}}


def test_a_buffered_call_gets_the_whole_remaining_budget(env):
    cfg = _svc_with_budget(env, 45)._call_config({"temperature": 0.2})
    assert cfg["http_options"] == {"timeout": 45000}


def test_a_filter_probe_keeps_the_short_timeout(env):
    seen = []

    def generate(model, contents, config=None):
        seen.append(config["http_options"])
        return SimpleNamespace(text="", prompt_feedback=None)

    env.models.generate_content = generate
    _svc_with_budget(env, 45)._probe_prompt_blocked("prompt")
    assert seen == [{"timeout": ai_service.ASK_CALL_TIMEOUT_MS}]


def test_stream_rungs_tell_the_server_the_remaining_budget(env):
    seen = []

    def stream(model, contents, config=None):
        seen.append(config["http_options"])
        return iter([SimpleNamespace(text="Boil it.\n[[CITED: id1]]")])

    env.models.generate_content_stream = stream
    svc = main.GeminiService()
    list(svc.answer_from_context_stream("q?", CARDS, deadline=ai_service.ask_deadline()))
    assert seen == [{"timeout": ai_service.ASK_CALL_TIMEOUT_MS,
                     "headers": {"X-Server-Timeout": str(int(ai_service.ASK_DEADLINE_S))}}]


class _SlowModels:
    """Generates the answer in `needs_s` seconds of fake time, or times out
    first when the call's timeout is shorter."""

    def __init__(self, clock, needs_s):
        self.clock, self.needs_s, self.calls = clock, needs_s, []

    def generate_content(self, model, contents, config=None):
        timeout_s = config["http_options"]["timeout"] / 1000
        self.calls.append((model, timeout_s))
        if timeout_s < self.needs_s:
            self.clock.t += timeout_s
            raise TimeoutError("read timeout")
        self.clock.t += self.needs_s
        return SimpleNamespace(text=json.dumps({"answer": "1. Boil.\n2. Serve.", "citedIds": ["id1"]}),
                               candidates=[SimpleNamespace(finish_reason="STOP")])


@pytest.mark.parametrize("needs_s", [25, 45])
def test_a_long_buffered_answer_is_not_cut_at_twenty_seconds(env, needs_s):
    models = _SlowModels(env.clock, needs_s)
    env.models.generate_content = models.generate_content
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "walk me through all the steps"}))

    assert resp.status == 200
    assert json.loads(resp.body)["citedIds"] == ["id1"]
    assert env.refunds == []
    assert models.calls == [(ai_service.GEMINI_ASK_MODEL, ai_service.ASK_DEADLINE_S)]


def test_a_buffered_timeout_is_not_retried_on_the_same_model(env):
    calls = []

    def generate(model, contents, config=None):
        calls.append(model)
        if model == ai_service.GEMINI_ASK_MODEL:
            env.clock.t += 5  # the connection timed out early
            raise TimeoutError("connect timeout")
        return SimpleNamespace(text=json.dumps({"answer": "Boil it.", "citedIds": ["id1"]}),
                               candidates=[SimpleNamespace(finish_reason="STOP")])

    env.models.generate_content = generate
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook the pasta?"}))

    assert resp.status == 200
    assert calls == [ai_service.GEMINI_ASK_MODEL, ai_service.GEMINI_FALLBACK_MODEL]


def test_a_transient_error_is_still_retried_on_the_same_model(env, monkeypatch):
    monkeypatch.setattr(ai_service, "_retry_delay", lambda attempt: 1.0)
    calls = []

    class _Unavailable(Exception):
        code = 503

    def generate(model, contents, config=None):
        calls.append(model)
        if len(calls) == 1:
            raise _Unavailable("503 UNAVAILABLE")
        return SimpleNamespace(text=json.dumps({"answer": "Boil it.", "citedIds": ["id1"]}),
                               candidates=[SimpleNamespace(finish_reason="STOP")])

    env.models.generate_content = generate
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "how do I cook the pasta?"}))
    assert resp.status == 200
    assert calls == [ai_service.GEMINI_ASK_MODEL, ai_service.GEMINI_ASK_MODEL]


# ── The real google-genai request: our header is the one sent ──────────────

def _captured_request(monkeypatch, env, call):
    pytest.importorskip("google.genai._api_client")
    from google import genai

    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
    svc.client = genai.Client(api_key="test-key",
                              http_options={"timeout": ai_service.GEMINI_CALL_TIMEOUT_MS})
    svc.model = ai_service.GEMINI_ANALYSIS_MODEL
    svc._deadline = env.clock.t + 45
    sent = []

    class _Stop(Exception):
        pass

    def fake_send(request, stream=False, **kwargs):
        sent.append((request.headers, request.extensions.get("timeout"), stream))
        raise _Stop("captured")

    monkeypatch.setattr(svc.client._api_client._httpx_client, "send", fake_send)
    with pytest.raises(Exception):
        call(svc)
    return sent[-1]


def test_the_sdk_sends_the_budget_as_the_stream_server_timeout(monkeypatch, env):
    headers, timeout, stream = _captured_request(monkeypatch, env, lambda svc: list(
        svc.client.models.generate_content_stream(
            model="m", contents=["hi"], config=svc._call_config({"temperature": 0.2}, stream=True))))
    assert stream is True
    assert headers.get_list("X-Server-Timeout") == ["45"]
    assert timeout["read"] == ai_service.ASK_CALL_TIMEOUT_MS / 1000


def test_the_sdk_sends_the_budget_on_a_buffered_call(monkeypatch, env):
    headers, timeout, stream = _captured_request(monkeypatch, env, lambda svc: (
        svc.client.models.generate_content(
            model="m", contents=["hi"], config=svc._call_config({"temperature": 0.2}))))
    assert stream is False
    assert headers.get_list("X-Server-Timeout") == ["45"]
    assert timeout["read"] == 45.0
