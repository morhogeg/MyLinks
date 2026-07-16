"""The `search_links_http` twin — the native iOS path for the home search bar.

The Firebase callable `search_links` can't be reached from the Capacitor
WKWebView (its CORS preflight is rejected at `capacitor://localhost`), so the
native app calls this HTTP twin instead. These tests cover the transport
contract without touching Firestore or Gemini:

  - OPTIONS returns a 204 CORS preflight (so the WebView's preflight succeeds),
  - auth is required (no token + no client uid → 401),
  - the happy path runs the SAME `perform_search_logic` as the callable and
    returns its results verbatim as {"links": [...]},
  - an empty query is rejected before any search work.

conftest installs the offline fakes so `import main` works with plain pytest.
`perform_search_logic` and the rate limiter are stubbed at the main boundary;
`https_fn.Response` is replaced with a tiny capturing shim so the returned
status/body are inspectable under both the offline fake and the real package.
"""

import json

import pytest

import main


class _Resp:
    """Capturing stand-in for https_fn.Response, so tests can read status/body
    regardless of whether the real firebase_functions package is installed."""

    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    """Minimal Flask-shaped request: method, headers (.get), remote_addr, JSON."""

    def __init__(self, method="POST", json_body=None, headers=None, remote_addr="1.2.3.4"):
        self.method = method
        self._json = json_body
        self.headers = headers or {}
        self.remote_addr = remote_addr

    def get_json(self, silent=False):
        return self._json


@pytest.fixture(autouse=True)
def _harness(monkeypatch):
    # Inspectable Response + never touch Firestore for rate limiting.
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    # Pre-cutover posture: soft auth (client uid accepted), App Check soft.
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)


def test_options_returns_cors_preflight_204():
    resp = main.search_links_http(_Req(method="OPTIONS"))
    assert resp.status == 204


def test_missing_auth_and_uid_is_rejected(monkeypatch):
    # No Authorization header and no client uid → cannot resolve a workspace.
    # Guard: the hybrid search must never be reached (it would raise, not 401).
    monkeypatch.setattr(main, "perform_hybrid_search",
                        lambda *a, **k: pytest.fail("search ran without auth"))
    resp = main.search_links_http(_Req(json_body={"query": "dogs"}))
    assert resp.status == 401


def test_empty_query_is_rejected():
    resp = main.search_links_http(_Req(json_body={"query": "   ", "uid": "user1"}))
    assert resp.status == 400


def test_happy_path_runs_hybrid_search(monkeypatch):
    captured = {}

    def fake_search(uid, query_text, limit):
        captured["args"] = (uid, query_text, limit)
        return [{"id": "a", "title": "Dogs 101"}, {"id": "b", "title": "Puppies"}]

    monkeypatch.setattr(main, "perform_hybrid_search", fake_search)

    resp = main.search_links_http(
        _Req(json_body={"query": "dogs", "uid": "user1", "limit": 5})
    )

    assert resp.status == 200
    # Identity comes from the client uid (soft mode), and the twin reuses the
    # exact same hybrid core the callable does, so behavior is identical.
    assert captured["args"] == ("user1", "dogs", 5)
    payload = json.loads(resp.body)
    assert [c["id"] for c in payload["links"]] == ["a", "b"]
