"""Account / billing lifecycle edge cases (launch readiness, 2026-09).

  - RevenueCat TRANSFER re-syncs BOTH sides (the account that lost the
    purchase and the one that gained it), skipping anonymous ids.
  - Registering a push token removes it from every OTHER workspace, so one
    phone never receives two accounts' pushes.
  - A workspace created by the client-side fallback (no server-minted
    `trialClockChecked` marker) still inherits a deleted account's trial clock
    on its first entitlement grant — once.
  - `_session_revoked` mirrors verify_id_token(check_revoked=True) for the
    delete-account and claim-workspace paths.

Offline: every Firestore / RevenueCat / Auth touchpoint is faked at the
module boundary, like the other endpoint tests (test_client_error_report).
"""

import json
import types
from datetime import datetime, timezone

import pytest

import entitlement as ent
import main


class _Resp:
    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    def __init__(self, body=None, method="POST", headers=None):
        self.method = method
        self._json = body
        self.headers = headers or {}
        self.remote_addr = "1.2.3.4"

    def get_json(self, silent=False):
        return self._json


# ── RevenueCat TRANSFER ──────────────────────────────────────────────────────

@pytest.fixture
def webhook(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setenv("REVENUECAT_WEBHOOK_AUTH", "Bearer s3cret")
    monkeypatch.setattr(main, "rc_configured", lambda: True)
    synced = []
    workspaces = {"auth-old": "ws-old", "auth-new": "ws-new"}
    monkeypatch.setattr(main, "resolve_workspace_for_app_user",
                        lambda app_user_id, aliases=None: workspaces.get(app_user_id))

    def _sync(uid, app_user_id):
        synced.append((uid, app_user_id))
        return {"plan": "pro" if uid == "ws-new" else "free"}

    monkeypatch.setattr(main, "sync_from_revenuecat", _sync)
    return synced


def _event(**event):
    return _Req(body={"event": event}, headers={"Authorization": "Bearer s3cret"})


def test_transfer_is_a_handled_event_type():
    assert "TRANSFER" in main._RC_EVENTS


def test_transfer_resyncs_both_the_old_and_the_new_account(webhook):
    res = main.revenuecat_webhook(_event(
        type="TRANSFER",
        transferred_from=["auth-old"],
        transferred_to=["$RCAnonymousID:abc", "auth-new"],
    ))
    assert res.status == 200
    assert webhook == [("ws-old", "auth-old"), ("ws-new", "auth-new")]
    assert json.loads(res.body)["synced"] == 2


def test_transfer_skips_unknown_accounts_without_failing(webhook):
    res = main.revenuecat_webhook(_event(
        type="TRANSFER", transferred_from=["deleted-user"], transferred_to=["auth-new"],
    ))
    assert res.status == 200
    assert webhook == [("ws-new", "auth-new")]


def test_transfer_sync_outage_asks_revenuecat_to_retry(webhook, monkeypatch):
    def _down(uid, app_user_id):
        raise main.RevenueCatError("HTTP 503")

    monkeypatch.setattr(main, "sync_from_revenuecat", _down)
    res = main.revenuecat_webhook(_event(
        type="TRANSFER", transferred_from=["auth-old"], transferred_to=["auth-new"],
    ))
    assert res.status == 502


# ── Push token dedupe ────────────────────────────────────────────────────────

class _Doc:
    def __init__(self, db, doc_id):
        self.db, self.id = db, doc_id
        self.reference = self

    def set(self, data, merge=False):
        self.db.writes.append(("set", self.id, data))

    def update(self, data):
        self.db.writes.append(("update", self.id, data))

    def get(self):
        return types.SimpleNamespace(exists=True, to_dict=lambda: {"fcmTokens": ["tok"]})


class _Query:
    def __init__(self, db):
        self.db = db

    def limit(self, n):
        return self

    def stream(self):
        return [_Doc(self.db, d) for d in self.db.holders]


class _Users:
    def __init__(self, db):
        self.db = db

    def document(self, doc_id):
        return _Doc(self.db, doc_id)

    def where(self, filter=None):
        self.db.filters.append(filter)
        return _Query(self.db)


class _TokenDb:
    def __init__(self, holders):
        self.holders = holders
        self.writes = []
        self.filters = []

    def collection(self, name):
        assert name == "users"
        return _Users(self)


def test_registering_a_token_removes_it_from_other_workspaces(monkeypatch):
    db = _TokenDb(holders=["ws-me", "ws-previous-account"])
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "_verify_bearer", lambda req: {"uid": "auth-me"})
    monkeypatch.setattr(main, "find_data_uid_by_auth_uid", lambda _u: "ws-me")
    monkeypatch.setattr(main, "get_db", lambda: db)
    removed_from = []
    monkeypatch.setattr(main.gc_firestore, "ArrayRemove", lambda v: ("remove", tuple(v)), raising=False)
    monkeypatch.setattr(main.gc_firestore, "ArrayUnion", lambda v: ("union", tuple(v)), raising=False)

    res = main.register_device_token_http(_Req(body={"token": "tok"}))
    assert res.status == 200
    for kind, doc_id, data in db.writes:
        if kind == "update" and data.get("fcmTokens") == ("remove", ("tok",)):
            removed_from.append(doc_id)
    # Removed from the other account, never from the caller's own workspace.
    assert removed_from == ["ws-previous-account"]
    assert len(db.filters) == 1


def test_token_dedupe_failure_never_fails_registration(monkeypatch):
    class Boom:
        def where(self, filter=None):
            raise RuntimeError("index missing")

    class Db:
        def collection(self, name):
            return Boom()

    assert main._drop_token_from_other_workspaces(Db(), "ws-me", "tok") == 0


# ── Trial clock for client-fallback workspaces ───────────────────────────────

DAY = 24 * 60 * 60 * 1000


def _ms(iso):
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


class _Snap:
    def __init__(self, data):
        self._d = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class _EntDb:
    """users/{uid}, deleted_accounts/{hash}, entitlements/{uid} in memory."""

    def __init__(self, user, tombstones):
        self.store = {"users": {"u1": dict(user)}, "deleted_accounts": dict(tombstones),
                      "entitlements": {}}
        self.tomb_reads = 0

    def collection(self, name):
        db = self

        class Ref:
            def __init__(self, doc_id):
                self.doc_id = doc_id

            def get(self):
                if name == "deleted_accounts":
                    db.tomb_reads += 1
                return _Snap(db.store[name].get(self.doc_id))

            def set(self, data, merge=False):
                cur = db.store[name].get(self.doc_id) or {}
                db.store[name][self.doc_id] = {**cur, **data} if merge else dict(data)

            def create(self, data):
                db.store[name][self.doc_id] = dict(data)

        return types.SimpleNamespace(document=Ref)


def test_client_fallback_workspace_inherits_the_deleted_accounts_trial_clock(monkeypatch):
    import link_service
    launch = _ms(ent.PRO_LAUNCH_AT)
    first = launch + 1 * DAY
    now_created = launch + 40 * DAY
    tid = link_service.email_tombstone_id("again@example.com")
    db = _EntDb(
        user={"authUids": ["u1"], "createdAt": now_created, "email": "again@example.com"},
        tombstones={tid: {"firstCreatedAt": first}},
    )
    monkeypatch.setattr(ent, "get_db", lambda: db)

    doc = ent.get_entitlement("u1")
    # The grant's ceiling is measured from the ORIGINAL first sign-up.
    assert doc["proUntil"] == first + ent.TRIAL_CEILING_DAYS * DAY
    user = db.store["users"]["u1"]
    assert user["createdAt"] == first
    assert user[ent.TRIAL_CLOCK_CHECKED] is True


def test_server_created_workspace_skips_the_lookup(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 5 * DAY
    db = _EntDb(
        user={"createdAt": created, "email": "x@example.com", ent.TRIAL_CLOCK_CHECKED: True},
        tombstones={},
    )
    monkeypatch.setattr(ent, "get_db", lambda: db)
    doc = ent.get_entitlement("u1")
    assert doc["proUntil"] == created + ent.TRIAL_CEILING_DAYS * DAY
    assert db.tomb_reads == 0


def test_fallback_workspace_without_a_tombstone_is_only_marked(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 5 * DAY
    db = _EntDb(user={"createdAt": created, "email": "new@example.com"}, tombstones={})
    monkeypatch.setattr(ent, "get_db", lambda: db)
    ent.get_entitlement("u1")
    user = db.store["users"]["u1"]
    assert user["createdAt"] == created
    assert user[ent.TRIAL_CLOCK_CHECKED] is True


# ── Revoked sessions ─────────────────────────────────────────────────────────

class _NotFound(Exception):
    pass


def _fake_auth(monkeypatch, user=None, missing=False):
    def get_user(uid):
        if missing:
            raise _NotFound()
        return user

    monkeypatch.setattr(main, "admin_auth",
                        types.SimpleNamespace(get_user=get_user, UserNotFoundError=_NotFound))


def test_session_before_revocation_is_revoked(monkeypatch):
    _fake_auth(monkeypatch, types.SimpleNamespace(disabled=False, tokens_valid_after_timestamp=2_000_000))
    assert main._session_revoked({"uid": "a", "auth_time": 1_000}) is True


def test_session_after_revocation_is_valid(monkeypatch):
    _fake_auth(monkeypatch, types.SimpleNamespace(disabled=False, tokens_valid_after_timestamp=2_000_000))
    assert main._session_revoked({"uid": "a", "auth_time": 2_000}) is False


def test_disabled_user_is_revoked(monkeypatch):
    _fake_auth(monkeypatch, types.SimpleNamespace(disabled=True, tokens_valid_after_timestamp=None))
    assert main._session_revoked({"uid": "a", "auth_time": 5}) is True


def test_missing_user_is_left_to_the_caller(monkeypatch):
    _fake_auth(monkeypatch, missing=True)
    assert main._session_revoked({"uid": "a", "auth_time": 5}) is False


def test_revoked_session_cannot_delete_the_account(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "_verify_bearer", lambda req: {"uid": "a", "auth_time": 1})
    monkeypatch.setattr(main, "_session_revoked", lambda claims: True)

    def _never(*a, **k):
        raise AssertionError("deletion must not run for a revoked session")

    monkeypatch.setattr(main, "_delete_account_logic", _never)
    res = main.delete_account_http(_Req(body={}))
    assert res.status == 401
