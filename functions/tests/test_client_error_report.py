"""`client_error_http` — the crash sink for clients with no workspace.

WHY THIS ENDPOINT EXISTS: `lib/errorReporter.ts` normally writes to
`users/{uid}/client_errors`, which the locked rules gate behind `owns(uid)`.
When workspace resolution itself fails there is no uid, so the reports die in a
memory buffer. That is why ungated TestFlight builds 1266/1267 were invisible
for a day. This endpoint accepts a report with or without an identity.

Accepting unauthenticated writes makes it a public surface, so these tests pin
the bounds that keep it safe as much as the happy path:

  - OPTIONS returns a 204 CORS preflight, GET is rejected,
  - a report is stored with every field truncated server-side,
  - an oversized body is rejected BEFORE it is parsed,
  - the identity is taken from the verified token and NEVER from the body,
  - the rate limiter is per-IP and its 429 short-circuits the write,
  - a Firestore failure never fails the caller (it is already degraded).
"""

import json

import pytest

import main


class _Resp:
    """Capturing stand-in for https_fn.Response (mirrors test_search_http)."""

    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    """Minimal Flask-shaped request. `get_data` is what the size cap reads."""

    def __init__(self, method="POST", raw=b"", headers=None, remote_addr="1.2.3.4"):
        self.method = method
        self._raw = raw
        self.headers = headers or {}
        self.remote_addr = remote_addr

    def get_data(self, cache=False):
        return self._raw


class _FakeCollection:
    def __init__(self, sink):
        self._sink = sink

    def add(self, doc):
        self._sink.append(doc)


class _FakeDb:
    def __init__(self):
        self.written = []

    def collection(self, name):
        assert name == "client_error_reports", f"unexpected collection {name}"
        return _FakeCollection(self.written)


@pytest.fixture
def db():
    return _FakeDb()


@pytest.fixture(autouse=True)
def _harness(monkeypatch, db):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "get_db", lambda: db)
    # Anonymous unless a test says otherwise.
    monkeypatch.setattr(main, "_verify_bearer", lambda req: None)


def _body(**kw):
    return json.dumps(kw).encode("utf-8")


def test_options_is_a_cors_preflight():
    res = main.client_error_http(_Req(method="OPTIONS"))
    assert res.status == 204


def test_get_is_rejected():
    res = main.client_error_http(_Req(method="GET"))
    assert res.status == 405


def test_anonymous_report_is_stored(db):
    res = main.client_error_http(_Req(raw=_body(
        message="Missing or insufficient permissions.",
        source="auth-resolve-workspace",
        reason="workspace-unresolved",
        buildNumber="1267",
        requireAuth=False,
    )))
    assert res.status == 200
    assert len(db.written) == 1
    rec = db.written[0]
    assert rec["message"] == "Missing or insufficient permissions."
    assert rec["reason"] == "workspace-unresolved"
    assert rec["buildNumber"] == "1267"
    assert rec["requireAuth"] is False
    # No token → recorded as anonymous, not as some claimed identity.
    assert rec["authUid"] is None
    assert rec["expireAt"] is not None


def test_message_is_required(db):
    res = main.client_error_http(_Req(raw=_body(source="x")))
    assert res.status == 400
    assert db.written == []


def test_invalid_json_is_rejected(db):
    res = main.client_error_http(_Req(raw=b"not json{"))
    assert res.status == 400
    assert db.written == []


def test_non_object_json_is_rejected(db):
    """A bare list would sail through a naive `.get` on a parsed body."""
    res = main.client_error_http(_Req(raw=b'["message"]'))
    assert res.status == 400
    assert db.written == []


def test_oversized_body_is_rejected_before_parsing(db):
    huge = b"x" * (main.MAX_CLIENT_ERROR_BYTES + 1)
    res = main.client_error_http(_Req(raw=huge))
    assert res.status == 413
    assert db.written == []


def test_fields_are_truncated_server_side(db):
    """Over-long fields in an otherwise well-sized body are cut, not rejected.

    Kept under MAX_CLIENT_ERROR_BYTES on purpose — the byte cap is the cheaper
    guard and fires first (see the test below), so oversizing every field at
    once would exercise that path instead of this one. The client truncates too,
    but the server must not depend on the client having done so.
    """
    main.client_error_http(_Req(raw=_body(
        message="m" * 1000,
        stack="s" * 4000,
        url="u" * 1000,
        source="c" * 300,
    )))
    rec = db.written[0]
    assert len(rec["message"]) == 500
    assert len(rec["stack"]) == 2000
    assert len(rec["url"]) == 300
    assert len(rec["source"]) == 100


def test_byte_cap_is_reached_before_field_truncation(db):
    """The size guard short-circuits: a huge body is refused, never truncated.

    A legitimate report can't reach the cap — every field limit added together
    is ~3KB against a 16KB ceiling — so anything over it is malformed or hostile
    and is rejected without being deserialized.
    """
    res = main.client_error_http(_Req(raw=_body(message="m" * 5000, stack="s" * 20000)))
    assert res.status == 413
    assert db.written == []


def test_identity_comes_from_the_token_not_the_body(monkeypatch, db):
    """A caller must not be able to attribute its report to someone else."""
    monkeypatch.setattr(main, "_verify_bearer", lambda req: {"uid": "real-auth-uid"})
    main.client_error_http(_Req(raw=_body(message="boom", authUid="spoofed", uid="spoofed")))
    assert db.written[0]["authUid"] == "real-auth-uid"


def test_rate_limit_blocks_the_write(monkeypatch, db):
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: False)
    res = main.client_error_http(_Req(raw=_body(message="boom")))
    assert res.status == 429
    assert db.written == []


def test_rate_limit_bucket_is_per_ip(monkeypatch, db):
    seen = {}

    def _fake(key, limit, window, fail_open=False):
        seen["key"] = key
        seen["fail_open"] = fail_open
        return True

    monkeypatch.setattr(main, "check_rate_limit", _fake)
    main.client_error_http(_Req(raw=_body(message="boom"), remote_addr="9.9.9.9"))
    assert seen["key"] == "client-error:9.9.9.9"
    # Public write surface → must fail CLOSED when the limiter is unavailable.
    assert seen["fail_open"] is False


def test_firestore_failure_does_not_fail_the_caller(monkeypatch):
    class _Boom:
        def collection(self, name):
            raise RuntimeError("firestore down")

    monkeypatch.setattr(main, "get_db", lambda: _Boom())
    res = main.client_error_http(_Req(raw=_body(message="boom")))
    # The client is already degraded; a 5xx here is noise it cannot act on.
    assert res.status == 200
