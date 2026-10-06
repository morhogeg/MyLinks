"""Account deletion and log hygiene, launch audit ACCT-4/8/9/14.

- Storage is swept FIRST and a failure keeps the account, so a retry can
  finish; a blob that is already gone is fine (ACCT-4).
- Linked sign-ins and the RevenueCat customer record go with the account
  (ACCT-8).
- Log tags for phone-number uids are keyed, so they can't be brute-forced
  back to the number (ACCT-9).
- A non-ASCII admin token is a 404 like any wrong token, not a 500 (ACCT-14).
- Rate-limit rows carry an expiry, since their ids name users and IPs.
"""

import hashlib
import types

import pytest

import main
import log_safe
import rate_limit

_real_before_delete = main._user_doc_before_delete


class _NotFound(Exception):
    code = 404


class _Blob:
    def __init__(self, name, log, fail=None):
        self.name, self._log, self._fail = name, log, fail

    def delete(self):
        if self._fail:
            raise self._fail
        self._log.append(("blob", self.name))


def _world(monkeypatch, blobs, before=None, log=None):
    log = [] if log is None else log
    by_prefix = {}
    for b in blobs:
        by_prefix.setdefault(b.name.rsplit("/", 1)[0] + "/", []).append(b)

    class Bucket:
        def list_blobs(self, prefix):
            return list(by_prefix.get(prefix, []))

    monkeypatch.setattr(main, "storage", types.SimpleNamespace(bucket=lambda: Bucket()))
    monkeypatch.setattr(main, "find_data_uid_by_auth_uid", lambda a: "ws-1")
    monkeypatch.setattr(main, "_user_doc_before_delete",
                        lambda uid: before if before is not None else {"storageKey": "KEY", "createdAt": 1})
    monkeypatch.setattr(main, "write_account_tombstone", lambda *a: None)
    monkeypatch.setattr(main, "delete_user_data", lambda uid: log.append(("firestore", uid)) or 1)

    class UserNotFoundError(Exception):
        pass

    monkeypatch.setattr(main, "admin_auth", types.SimpleNamespace(
        delete_user=lambda u: log.append(("auth", u)), UserNotFoundError=UserNotFoundError))
    monkeypatch.setattr(main, "_delete_rc_subscriber_best_effort", lambda u: log.append(("rc", u)))
    return log


def test_storage_is_swept_before_firestore_and_auth(monkeypatch):
    log = []
    _world(monkeypatch, [_Blob("screenshots/KEY/a.jpg", log), _Blob("post_thumbs/ws-1/b.jpg", log)], log=log)
    assert main._delete_account_logic("auth-1", "a@b.c") == {"success": True}
    kinds = [k for k, _ in log]
    assert kinds.index("blob") < kinds.index("firestore") < kinds.index("auth")


def test_a_storage_failure_keeps_the_account_for_a_retry(monkeypatch):
    log = []
    _world(monkeypatch, [_Blob("screenshots/KEY/a.jpg", log, fail=RuntimeError("503 backend"))], log=log)
    with pytest.raises(main._DeleteAccountError):
        main._delete_account_logic("auth-1", "a@b.c")
    # Nothing else ran: the workspace and the login stay, so a retry finds
    # the account (and its storageKey) and finishes.
    assert log == []


def test_an_already_deleted_blob_does_not_stop_the_sweep(monkeypatch):
    log = []
    blobs = [_Blob("screenshots/KEY/0.jpg", log, fail=_NotFound("gone"))] + [
        _Blob(f"screenshots/KEY/{i}.jpg", log) for i in range(1, 5)]
    _world(monkeypatch, blobs, log=log)
    assert main._delete_account_logic("auth-1", "a@b.c") == {"success": True}
    assert sorted(n for k, n in log if k == "blob") == [f"screenshots/KEY/{i}.jpg" for i in range(1, 5)]
    assert ("firestore", "ws-1") in log and ("auth", "auth-1") in log


def test_both_uid_and_storage_key_prefixes_are_swept(monkeypatch):
    log = []
    blobs = [_Blob(p, log) for p in (
        "screenshots/KEY/a.jpg", "post_thumbs/KEY/b.jpg", "screenshots/ws-1/c.jpg", "post_thumbs/ws-1/d.jpg")]
    _world(monkeypatch, blobs, log=log)
    main._delete_account_logic("auth-1", None)
    assert len([1 for k, _ in log if k == "blob"]) == 4


def test_an_unreadable_user_doc_aborts_before_anything_is_deleted(monkeypatch):
    log = _world(monkeypatch, [])
    monkeypatch.setattr(main, "_user_doc_before_delete", _real_before_delete)

    class _Boom:
        def collection(self, *_):
            raise RuntimeError("UNAVAILABLE")

    monkeypatch.setattr(main, "get_db", lambda: _Boom())
    with pytest.raises(main._DeleteAccountError):
        main._delete_account_logic("auth-1", "a@b.c")
    assert log == []


def test_linked_sign_ins_and_the_revenuecat_record_go_too(monkeypatch):
    log = _world(monkeypatch, [], before={"storageKey": "KEY", "authUids": ["auth-1", "auth-2", 7, ""]})
    main._delete_account_logic("auth-1", "a@b.c")
    auth = [u for k, u in log if k == "auth"]
    assert auth == ["auth-2", "auth-1"]          # the caller's login last
    assert ("rc", "auth-1") in log


def test_a_non_list_auth_uids_field_is_ignored(monkeypatch):
    log = _world(monkeypatch, [], before={"authUids": "auth-9"})
    main._delete_account_logic("auth-1", "a@b.c")
    assert [u for k, u in log if k == "auth"] == ["auth-1"]


def test_revenuecat_delete_is_best_effort(monkeypatch):
    calls = []
    monkeypatch.setenv("REVENUECAT_SECRET_KEY", "sk_test")

    def fake_delete(url, headers, timeout):
        calls.append((url, headers["Authorization"], timeout))
        return types.SimpleNamespace(status_code=200)

    monkeypatch.setattr(main.requests, "delete", fake_delete)
    main._delete_rc_subscriber_best_effort("auth/1")
    assert calls and calls[0][0].endswith("/subscribers/auth%2F1") and calls[0][1] == "Bearer sk_test"

    def boom(*a, **k):
        raise main.requests.ConnectionError("down")

    monkeypatch.setattr(main.requests, "delete", boom)
    main._delete_rc_subscriber_best_effort("auth-1")  # never raises

    monkeypatch.delenv("REVENUECAT_SECRET_KEY")
    calls.clear()
    monkeypatch.setattr(main.requests, "delete", fake_delete)
    main._delete_rc_subscriber_best_effort("auth-1")
    assert calls == []  # not configured: no call


# ── ACCT-9: keyed log tags ──────────────────────────────────────────────────

def test_log_tags_are_keyed_when_a_secret_is_available(monkeypatch):
    phone = "+972501234567"
    plain = "uid#" + hashlib.sha256(phone.encode()).hexdigest()[:8]
    monkeypatch.delenv("LOG_MASK_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "k1")
    keyed = log_safe.mask_uid(phone)
    assert keyed != plain and keyed == log_safe.mask_uid(phone)
    monkeypatch.setenv("GEMINI_API_KEY", "k2")
    assert log_safe.mask_uid(phone) != keyed
    monkeypatch.setenv("LOG_MASK_KEY", "dedicated")
    assert log_safe.mask_uid(phone) not in (keyed, plain)
    monkeypatch.delenv("LOG_MASK_KEY")
    monkeypatch.delenv("GEMINI_API_KEY")
    assert log_safe.mask_uid(phone) == plain  # tests / local tools


# ── ACCT-14: admin token compare ────────────────────────────────────────────

@pytest.mark.parametrize("provided", ["ü-token", "secret\udcff", "", "wrong"])
def test_a_bad_admin_token_is_a_404_never_a_500(monkeypatch, provided):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    req = types.SimpleNamespace(headers={"X-Admin-Token": provided})
    resp = main._require_admin(req, {})
    assert resp is not None and resp.status_code == 404


def test_the_right_admin_token_passes(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    assert main._require_admin(types.SimpleNamespace(headers={"X-Admin-Token": "secret"}), {}) is None


# ── rate-limit rows expire ──────────────────────────────────────────────────

def test_rate_limit_rows_carry_an_expiry(monkeypatch):
    written = {}

    class _Snap:
        exists = False

        def to_dict(self):
            return {}

    class _Ref:
        def get(self, transaction=None):
            return _Snap()

    class _Txn:
        def set(self, ref, data):
            written.update(data)

    class _Db:
        def collection(self, name):
            return self

        def document(self, id):
            return _Ref()

        def transaction(self):
            return _Txn()

    monkeypatch.setattr(rate_limit, "get_db", lambda: _Db())
    monkeypatch.setattr(rate_limit, "firestore", types.SimpleNamespace(transactional=lambda fn: fn))
    monkeypatch.setattr(rate_limit.time, "time", lambda: 1_000_000)
    assert rate_limit.check_rate_limit("ask:+972501234567", 5, 3600) is True
    assert written["count"] == 1
    assert written["expireAt"].timestamp() == 1_000_000 + 3600 + rate_limit._EXPIRE_SLACK_S
