"""The deleted-account trial-clock lookup keys on the VERIFIED email.

A workspace created by the client-side fallback (AuthProvider's
createWorkspaceClientSide) is written by the client, so its `email` field is
whatever the client sent. `_created_at_for_new_grant` used that field to find
a deleted account's tombstone: naming someone else's address inherited THEIR
first createdAt (a founder's year of Pro for a pre-launch account, and a
creation-date oracle for anyone), and leaving the field out reset the trial
clock. The lookup now asks Firebase Auth for the account's own email.

Offline: Firestore is an in-memory double at entitlement.get_db, and the Auth
lookup is faked at firebase_admin.auth.get_user.
"""

import hashlib
import types
from datetime import datetime, timezone

import pytest

import entitlement as ent

DAY = 24 * 60 * 60 * 1000


def _ms(iso):
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _tomb(email):
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


class _Snap:
    def __init__(self, data):
        self._d = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class _Db:
    """users/{id}, deleted_accounts/{hash}, entitlements/{id} in memory."""

    def __init__(self, users, tombstones):
        self.store = {"users": {k: dict(v) for k, v in users.items()},
                      "deleted_accounts": dict(tombstones), "entitlements": {}}

    def collection(self, name):
        db = self

        class Ref:
            def __init__(self, doc_id):
                self.doc_id = doc_id

            def get(self):
                return _Snap(db.store[name].get(self.doc_id))

            def set(self, data, merge=False):
                cur = db.store[name].get(self.doc_id) or {}
                db.store[name][self.doc_id] = {**cur, **data} if merge else dict(data)

            def create(self, data):
                if self.doc_id in db.store[name]:
                    raise RuntimeError("409 already exists")
                db.store[name][self.doc_id] = dict(data)

        return types.SimpleNamespace(document=Ref)


@pytest.fixture
def auth_accounts(monkeypatch):
    """Firebase Auth as a dict: auth uid -> email (None = no email)."""
    import firebase_admin.auth as fb_auth  # here, like the storage fakes elsewhere
    accounts = {}
    looked_up = []

    def get_user(auth_uid):
        looked_up.append(auth_uid)
        if auth_uid not in accounts:
            raise fb_auth.UserNotFoundError("no user record")
        return types.SimpleNamespace(uid=auth_uid, email=accounts[auth_uid])

    monkeypatch.setattr(fb_auth, "get_user", get_user)
    accounts["_looked_up"] = looked_up
    return accounts


def _env(monkeypatch, users, tombstones):
    db = _Db(users, tombstones)
    monkeypatch.setattr(ent, "get_db", lambda: db)
    return db


def test_a_foreign_email_on_the_doc_cannot_claim_a_founders_clock(monkeypatch, auth_accounts):
    launch = _ms(ent.PRO_LAUNCH_AT)
    founder_first = launch - 30 * DAY             # a deleted pre-launch (founder) account
    created = launch + 40 * DAY                   # the attacker's fresh workspace
    db = _env(monkeypatch,
              users={"attacker": {"authUids": ["attacker"], "createdAt": created,
                                  "onboarded": False, "email": "tester@example.com"}},
              tombstones={_tomb("tester@example.com"): {"firstCreatedAt": founder_first}})
    auth_accounts["attacker"] = "attacker@example.com"

    doc = ent.get_entitlement("attacker")

    assert doc["source"] == "trial"
    assert doc["proUntil"] == created + ent.TRIAL_CEILING_DAYS * DAY
    user = db.store["users"]["attacker"]
    assert user["createdAt"] == created          # nothing inherited, nothing learned
    assert user[ent.TRIAL_CLOCK_CHECKED] is True


def test_leaving_the_email_out_no_longer_resets_the_clock(monkeypatch, auth_accounts):
    launch = _ms(ent.PRO_LAUNCH_AT)
    first = launch + 1 * DAY
    created = launch + 40 * DAY
    db = _env(monkeypatch,
              users={"again": {"authUids": ["again"], "createdAt": created, "onboarded": False}},
              tombstones={_tomb("again@example.com"): {"firstCreatedAt": first}})
    auth_accounts["again"] = "again@example.com"

    doc = ent.get_entitlement("again")

    assert doc["proUntil"] == first + ent.TRIAL_CEILING_DAYS * DAY
    assert db.store["users"]["again"]["createdAt"] == first


def test_the_lookup_follows_the_linked_account_of_a_legacy_doc(monkeypatch, auth_accounts):
    """A phone-keyed workspace names its Auth account in authUids."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    first = launch + 2 * DAY
    created = launch + 20 * DAY
    db = _env(monkeypatch,
              users={"+15551234567": {"authUids": ["auth-x"], "createdAt": created}},
              tombstones={_tomb("x@example.com"): {"firstCreatedAt": first}})
    auth_accounts["auth-x"] = "x@example.com"

    ent.get_entitlement("+15551234567")

    assert auth_accounts["_looked_up"] == ["auth-x"]
    assert db.store["users"]["+15551234567"]["createdAt"] == first


def test_an_account_with_no_auth_record_or_email_inherits_nothing(monkeypatch, auth_accounts):
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 10 * DAY
    for uid, email in (("gone", "missing"), ("no-email", None)):
        db = _env(monkeypatch,
                  users={uid: {"authUids": [uid], "createdAt": created, "email": "tester@example.com"}},
                  tombstones={_tomb("tester@example.com"): {"firstCreatedAt": launch - 30 * DAY}})
        if email is None:
            auth_accounts[uid] = None
        doc = ent.get_entitlement(uid)
        assert doc["source"] == "trial", uid
        assert db.store["users"][uid]["createdAt"] == created, uid
        assert db.store["users"][uid][ent.TRIAL_CLOCK_CHECKED] is True, uid
