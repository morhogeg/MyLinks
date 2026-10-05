"""share_ingest admits browser-extension origins for CORS; nothing else does.

The browser extension calls /api/share from its own origin, which no fixed
allowlist can name: Chrome's is 32 letters a-p per extension, Safari's a random
UUID per install, and Safari never grants the host permission that would let
the extension skip CORS. So `share_ingest`, and only `share_ingest`, echoes an
Origin that FULLY matches one of those two shapes. The ingest token stays the
only credential: no cookies, and never Access-Control-Allow-Credentials.
"""

import json

import pytest

import main

CHROME = "chrome-extension://" + "abcdefghijklmnopabcdefghijklmnop"
SAFARI = "safari-web-extension://3F2504E0-4F89-11D3-9A0C-0305E82C3301"
APP = main._allowed_origins()[0]


class _Resp:
    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    def __init__(self, method="POST", body=None, headers=None):
        self.method = method
        self._body = body if body is not None else {}
        self.headers = headers or {}
        self.remote_addr = "203.0.113.9"

    def get_json(self, silent=False):
        return self._body

    def get_data(self, cache=False, as_text=False):
        raw = json.dumps(self._body)
        return raw if as_text else raw.encode()


@pytest.fixture(autouse=True)
def _harness(monkeypatch):
    monkeypatch.delenv("CORS_ORIGIN", raising=False)
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "_rate_limited", lambda *a, **k: None)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "find_user_by_ingest_token", lambda tok: "ws-1" if tok == "t" * 32 else None)
    monkeypatch.setattr(main, "_verify_bearer", lambda req: None)


# ── The matcher ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("origin", [CHROME, SAFARI, SAFARI.lower()])
def test_real_extension_origins_are_echoed_when_allowed(origin):
    req = _Req(headers={"Origin": origin})
    assert main._resolve_origin(req, allow_extension=True) == origin


@pytest.mark.parametrize("origin", [CHROME, SAFARI])
def test_extension_origins_are_not_echoed_by_default(origin):
    assert main._resolve_origin(_Req(headers={"Origin": origin})) == APP


@pytest.mark.parametrize("origin", [
    "chrome-extension://abc",                                   # too short
    "chrome-extension://" + "q" * 32,                           # letters past p
    "chrome-extension://" + "A" * 32,                           # upper case
    "chrome-extension://" + "a" * 33,                           # too long
    CHROME + "/popup.html",                                     # extra path
    CHROME + ".evil.example",                                   # look-alike host
    "https://" + "a" * 32 + ".chrome-extension.evil.example",
    CHROME + "\n",                                              # trailing newline
    " " + CHROME,
    SAFARI + "/x",
    "safari-web-extension://not-a-uuid",
    "safari-web-extension://" + "G" * 36,                       # not hex
    "moz-extension://3F2504E0-4F89-11D3-9A0C-0305E82C3301",    # not one we ship
    "https://evil.example",
    "null",
    "",
])
def test_look_alikes_fall_back_to_the_app_origin(origin):
    req = _Req(headers={"Origin": origin})
    assert main._resolve_origin(req, allow_extension=True) == APP


# ── share_ingest ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("origin", [CHROME, SAFARI])
def test_share_ingest_preflight_echoes_the_extension(origin):
    res = main.share_ingest(_Req(method="OPTIONS", headers={"Origin": origin}))
    assert res.status == 204
    assert res.headers["Access-Control-Allow-Origin"] == origin
    assert "X-Ingest-Token" in res.headers["Access-Control-Allow-Headers"]
    assert "Access-Control-Allow-Credentials" not in res.headers


def test_share_ingest_answer_echoes_the_extension():
    # The extension's harmless token check: a known token, no content -> 400.
    res = main.share_ingest(_Req(body={}, headers={"Origin": SAFARI, "X-Ingest-Token": "t" * 32}))
    assert res.status == 400
    assert res.headers["Access-Control-Allow-Origin"] == SAFARI
    assert res.headers["Vary"] == "Origin"
    assert "Access-Control-Allow-Credentials" not in res.headers


def test_share_ingest_rejects_a_bad_token_but_still_lets_the_extension_read_why():
    res = main.share_ingest(_Req(body={}, headers={"Origin": CHROME, "X-Ingest-Token": "u" * 32}))
    assert res.status == 403
    assert res.headers["Access-Control-Allow-Origin"] == CHROME


def test_share_ingest_does_not_echo_a_look_alike():
    res = main.share_ingest(_Req(method="OPTIONS", headers={"Origin": CHROME + "/x"}))
    assert res.headers["Access-Control-Allow-Origin"] == APP


def test_share_ingest_still_echoes_the_web_app():
    res = main.share_ingest(_Req(method="OPTIONS", headers={"Origin": "https://mymachina.app"}))
    assert res.headers["Access-Control-Allow-Origin"] == "https://mymachina.app"


# ── Every other endpoint keeps the strict allowlist ──────────────────────

@pytest.mark.parametrize("endpoint", [
    "get_share_config_http", "rotate_ingest_token_http", "search_links_http",
    "client_error_http", "claim_workspace_http", "delete_account_http",
])
@pytest.mark.parametrize("origin", [CHROME, SAFARI])
def test_other_endpoints_do_not_echo_extension_origins(endpoint, origin):
    fn = getattr(main, endpoint)
    res = fn(_Req(method="OPTIONS", headers={"Origin": origin}))
    assert res.headers["Access-Control-Allow-Origin"] == APP


def test_default_helpers_do_not_echo_extension_origins():
    req = _Req(headers={"Origin": CHROME})
    assert main._cors_headers(req)["Access-Control-Allow-Origin"] == APP
    assert main._cors_preflight(req).headers["Access-Control-Allow-Origin"] == APP
