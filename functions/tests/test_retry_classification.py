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
    assert ai_service._is_retryable_error(
        FakeAPIError(code=429, status="RESOURCE_EXHAUSTED")) is True


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

    class ConnectionResetError2(Exception):  # name contains "connection"
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
