"""RevenueCat webhook: which events re-sync, and how the secret is compared.

  - Every event that names an app user re-reads the subscriber from
    RevenueCat (the body is never trusted for dates), so a type the handler
    did not list (SUBSCRIPTION_EXTENDED, REFUND_REVERSED,
    TEMPORARY_ENTITLEMENT_GRANT, or one RevenueCat adds later) can no longer
    leave `proUntil` stale. TEST is the one type that is never synced.
  - The Authorization check compares bytes, so a non-ASCII header is a plain
    401 instead of a TypeError (500) out of hmac.compare_digest.

Offline: workspace resolution and the RevenueCat sync are faked at main's
module boundary, like test_account_lifecycle's TRANSFER cases.
"""

import json

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


@pytest.mark.parametrize("etype", [
    "SUBSCRIPTION_EXTENDED", "REFUND_REVERSED", "TEMPORARY_ENTITLEMENT_GRANT",
    "NON_RENEWING_PURCHASE", "SUBSCRIPTION_PAUSED",
    "SOME_TYPE_REVENUECAT_ADDS_NEXT_YEAR",
])
def test_any_event_naming_an_app_user_resyncs_it(synced, etype):
    res = _post({"type": etype, "app_user_id": "auth-a"})
    assert res.status == 200
    assert synced == [("ws-a", "auth-a")]
    assert json.loads(res.body)["plan"] == "pro"


@pytest.mark.parametrize("etype", ["INITIAL_PURCHASE", "RENEWAL", "EXPIRATION", "CANCELLATION"])
def test_the_original_billing_events_still_resync(synced, etype):
    assert _post({"type": etype, "app_user_id": "auth-a"}).status == 200
    assert synced == [("ws-a", "auth-a")]


def test_a_test_event_is_acknowledged_and_never_synced(synced):
    res = _post({"type": "TEST", "app_user_id": "auth-a"})
    assert res.status == 200
    assert json.loads(res.body)["ignored"] == "TEST"
    assert synced == []


def test_an_event_with_no_app_user_is_acknowledged_without_a_sync(synced):
    res = _post({"type": "SUBSCRIPTION_EXTENDED"})
    assert res.status == 200
    assert synced == []
    # A malformed id is not something to look up either (and never a 5xx,
    # which RevenueCat would retry for days).
    assert _post({"type": "RENEWAL", "app_user_id": 12345}).status == 200
    assert synced == []


def test_original_app_user_id_is_used_when_app_user_id_is_absent(synced):
    assert _post({"type": "REFUND_REVERSED", "original_app_user_id": "auth-a"}).status == 200
    assert synced == [("ws-a", "auth-a")]


def test_transfer_keeps_its_both_sides_resync(synced):
    res = _post({"type": "TRANSFER", "transferred_from": ["auth-old"], "transferred_to": ["auth-new"]})
    assert res.status == 200
    assert synced == [("ws-old", "auth-old"), ("ws-new", "auth-new")]


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
