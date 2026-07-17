"""Offline unit tests for the Gemini retry classifier (ai_service, report 3.6).

_is_retryable_error is a pure function, so it's testable without a live model.
It duck-types the google-genai APIError shape (int ``code`` / string ``status``)
plus network-error base classes, so we exercise it with lightweight fakes.
"""

import ai_service


class FakeAPIError(Exception):
    """Stand-in for google.genai.errors.APIError (int code + string status)."""
    def __init__(self, code=None, status=None):
        super().__init__(status or str(code))
        self.code = code
        self.status = status


# ── retryable: 429 / RESOURCE_EXHAUSTED / 5xx ────────────────────────────────

def test_429_is_retryable():
    assert ai_service._is_retryable_error(FakeAPIError(code=429)) is True


def test_resource_exhausted_status_is_retryable():
    # code=None so the STATUS branch is what's exercised — with code=429 the
    # classifier returned True before ever reading the status, so the
    # RESOURCE_EXHAUSTED string had zero effective coverage.
    assert ai_service._is_retryable_error(
        FakeAPIError(code=None, status="RESOURCE_EXHAUSTED")) is True


def test_500_and_503_are_retryable():
    assert ai_service._is_retryable_error(FakeAPIError(code=500)) is True
    assert ai_service._is_retryable_error(FakeAPIError(code=503, status="UNAVAILABLE")) is True


def test_unavailable_status_without_code_is_retryable():
    assert ai_service._is_retryable_error(FakeAPIError(status="UNAVAILABLE")) is True


# ── network-level transients ─────────────────────────────────────────────────

def test_builtin_timeout_and_connection_errors_are_retryable():
    assert ai_service._is_retryable_error(TimeoutError("slow")) is True
    assert ai_service._is_retryable_error(ConnectionError("reset")) is True


def test_named_timeout_connection_errors_are_retryable():
    class ReadTimeout(Exception):
        pass

    assert ai_service._is_retryable_error(ReadTimeout()) is True
    # A class whose name contains "connection" (case-insensitive) is retryable.
    err = type("ServerConnectionDropped", (Exception,), {})()
    assert ai_service._is_retryable_error(err) is True


# ── NOT retryable: permanent client errors and our own AnalysisError ─────────

def test_400_client_error_is_not_retryable():
    assert ai_service._is_retryable_error(FakeAPIError(code=400)) is False


def test_403_and_404_are_not_retryable():
    assert ai_service._is_retryable_error(FakeAPIError(code=403)) is False
    assert ai_service._is_retryable_error(FakeAPIError(code=404)) is False


def test_analysis_error_is_not_retryable():
    # Empty / bad-shape response — retrying yields the identical failure.
    assert ai_service._is_retryable_error(
        ai_service.AnalysisError("Empty response from Gemini")) is False


def test_value_and_json_errors_are_not_retryable():
    import json
    assert ai_service._is_retryable_error(ValueError("bad")) is False
    assert ai_service._is_retryable_error(
        json.JSONDecodeError("x", "doc", 0)) is False


def test_plain_exception_is_not_retryable():
    assert ai_service._is_retryable_error(Exception("mystery")) is False


# ── backoff shape ────────────────────────────────────────────────────────────

def test_retry_delay_bounds():
    # attempt 0 → ~1-2s, attempt 1 → ~2-4s (base + jitter in [0, base]).
    for _ in range(200):
        d0 = ai_service._retry_delay(0)
        d1 = ai_service._retry_delay(1)
        assert 1.0 <= d0 <= 2.0
        assert 2.0 <= d1 <= 4.0


# ── _generate_json honors the `attempts` budget (report 3.6) ─────────────────

def _svc_with_failing_client(exc):
    """A GeminiService whose model call always raises `exc`, counting calls."""
    from ai_service import GeminiService
    svc = GeminiService.__new__(GeminiService)
    calls = {"n": 0}

    class _Models:
        def generate_content(self, model, contents, config):
            calls["n"] += 1
            raise exc

    svc.client = type("_Client", (), {"models": _Models()})()
    svc.model = "test-model"
    return svc, calls


def test_generate_json_attempts_caps_retries(monkeypatch):
    # No real backoff sleeps in the test.
    monkeypatch.setattr(ai_service.time, "sleep", lambda *a, **k: None)

    # Synchronous callers pass attempts=2 → exactly 2 tries on a retryable error.
    svc, calls = _svc_with_failing_client(FakeAPIError(code=503))
    try:
        svc._generate_json(["x"], "test", attempts=2)
    except ai_service.AnalysisError:
        pass
    assert calls["n"] == 2

    # Background default (3) → 3 tries.
    svc, calls = _svc_with_failing_client(FakeAPIError(code=503))
    try:
        svc._generate_json(["x"], "test", attempts=3)
    except ai_service.AnalysisError:
        pass
    assert calls["n"] == 3


def test_generate_json_non_retryable_fails_fast_regardless_of_attempts(monkeypatch):
    monkeypatch.setattr(ai_service.time, "sleep", lambda *a, **k: None)
    # A 400 is not retryable → only ONE try even with attempts=3.
    svc, calls = _svc_with_failing_client(FakeAPIError(code=400))
    try:
        svc._generate_json(["x"], "test", attempts=3)
    except ai_service.AnalysisError:
        pass
    assert calls["n"] == 1
