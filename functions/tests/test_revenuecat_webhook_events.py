"""RevenueCat webhook: how the shared secret is compared.

  - The Authorization check compares bytes, so a non-ASCII header is a plain
    401 instead of a TypeError (500) out of hmac.compare_digest.

Offline: workspace resolution and the RevenueCat sync are faked at main's
module boundary, like test_account_lifecycle's TRANSFER cases.
"""

import pytest

import main


class _Resp:
    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    def __init__(self, body=None, headers=None):
        self.method = "POST"
        self._json = body
        self.headers = headers or {}

    def get_json(self, silent=False):
        return self._json


SECRET = "Bearer s3cret"


@pytest.fixture
def synced(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setenv("REVENUECAT_WEBHOOK_AUTH", SECRET)
    monkeypatch.setattr(main, "rc_configured", lambda: True)
    workspaces = {"auth-a": "ws-a", "auth-old": "ws-old", "auth-new": "ws-new"}
    monkeypatch.setattr(main, "resolve_workspace_for_app_user",
                        lambda app_user_id, aliases=None: workspaces.get(app_user_id))
    calls = []

    def _sync(uid, app_user_id):
        calls.append((uid, app_user_id))
        return {"plan": "pro"}

    monkeypatch.setattr(main, "sync_from_revenuecat", _sync)
    return calls


def _post(event, auth=SECRET):
    headers = {} if auth is None else {"Authorization": auth}
    return main.revenuecat_webhook(_Req(body={"event": event}, headers=headers))


# ── Authorization header ─────────────────────────────────────────────────────

@pytest.mark.parametrize("auth", ["Bearer s3crét", "Bearer é", "ÿ" * 40, "Bearer 秘密"])
def test_a_non_ascii_authorization_header_is_a_plain_401(synced, auth):
    res = _post({"type": "RENEWAL", "app_user_id": "auth-a"}, auth=auth)
    assert res.status == 401
    assert synced == []


def test_a_missing_or_wrong_authorization_header_is_rejected(synced):
    assert _post({"type": "RENEWAL", "app_user_id": "auth-a"}, auth=None).status == 401
    assert _post({"type": "RENEWAL", "app_user_id": "auth-a"}, auth="Bearer wrong").status == 401
    assert synced == []


def test_the_right_secret_still_gets_in(synced):
    assert _post({"type": "RENEWAL", "app_user_id": "auth-a"}).status == 200
    assert synced == [("ws-a", "auth-a")]
