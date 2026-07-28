"""Fixed-window math in rate_limit.check_rate_limit.

Firestore is mocked at the ``db.get_db`` boundary: a fake db returns a doc
snapshot we control and records writes, and the module's identity
``@firestore.transactional`` (see conftest fakes / real driver) runs the txn body
directly. No network, no emulator.
"""

import rate_limit


class FakeSnap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class FakeDocRef:
    def __init__(self, store):
        self._store = store  # dict holding the current persisted value

    def get(self, transaction=None):
        return FakeSnap(self._store.get("value"))


class FakeTxn:
    def __init__(self, store):
        self._store = store

    def set(self, doc_ref, data):
        # Mirror Firestore set(): overwrite the doc with the new payload.
        self._store["value"] = dict(data)


class FakeCollection:
    def __init__(self, doc_ref):
        self._doc_ref = doc_ref

    def document(self, _id):
        return self._doc_ref


class FakeDB:
    def __init__(self, store):
        self._store = store
        self._doc_ref = FakeDocRef(store)

    def collection(self, _name):
        return FakeCollection(self._doc_ref)

    def transaction(self):
        return FakeTxn(self._store)


def _install_fake_db(monkeypatch, store):
    monkeypatch.setattr(rate_limit, "get_db", lambda: FakeDB(store))
    # Bypass @firestore.transactional: the REAL google-cloud-firestore decorator
    # (installed in CI via requirements.txt) demands a genuine Transaction object
    # (reads txn._read_only etc.), so FakeTxn makes check_rate_limit fail open
    # and nothing persists. The decorator is applied at call time inside
    # check_rate_limit, so patching the module attribute to an identity
    # decorator runs the txn body directly against FakeTxn in BOTH the
    # fake-module (sandbox) and real-package (CI) environments.
    monkeypatch.setattr(rate_limit.firestore, "transactional", lambda fn: fn)
    return store


def test_first_call_allowed_and_persists_count(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    assert rate_limit.check_rate_limit("k", limit=3, window_seconds=60) is True
    assert store["value"]["count"] == 1


def test_counts_up_to_limit_then_blocks(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    # limit=3 → calls 1,2,3 allowed; call 4 blocked (count 4 > 3).
    results = [rate_limit.check_rate_limit("k", 3, 60) for _ in range(4)]
    assert results == [True, True, True, False]
    assert store["value"]["count"] == 4


def test_window_rolls_over_and_resets_count(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)

    fake_now = {"t": 1000}
    monkeypatch.setattr(rate_limit.time, "time", lambda: fake_now["t"])

    # Exhaust the window at t=1000.
    assert rate_limit.check_rate_limit("k", 1, 60) is True   # count 1 (<=1)
    assert rate_limit.check_rate_limit("k", 1, 60) is False  # count 2 (>1)

    # Advance past the window; count resets, first call allowed again.
    fake_now["t"] = 1000 + 60
    assert rate_limit.check_rate_limit("k", 1, 60) is True
    assert store["value"]["count"] == 1
    assert store["value"]["window_start"] == 1060


def test_within_window_keeps_window_start(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    fake_now = {"t": 500}
    monkeypatch.setattr(rate_limit.time, "time", lambda: fake_now["t"])

    rate_limit.check_rate_limit("k", 5, 100)
    fake_now["t"] = 550  # still inside the 100s window
    rate_limit.check_rate_limit("k", 5, 100)
    assert store["value"]["window_start"] == 500
    assert store["value"]["count"] == 2


def test_fails_open_on_backend_error(monkeypatch):
    def boom():
        raise RuntimeError("firestore down")

    monkeypatch.setattr(rate_limit, "get_db", boom)
    # Any backend failure must degrade to "allowed" rather than blocking.
    assert rate_limit.check_rate_limit("k", 1, 60) is True


# ── client_ip ─────────────────────────────────────────────────────────────

class FakeReq:
    def __init__(self, headers=None, remote_addr=None):
        self.headers = headers or {}
        if remote_addr is not None:
            self.remote_addr = remote_addr


def test_client_ip_takes_last_forwarded_hop():
    req = FakeReq(headers={"X-Forwarded-For": "1.1.1.1, 2.2.2.2, 3.3.3.3"})
    # Only the last hop (appended by Google's front end) is trustworthy.
    assert rate_limit.client_ip(req) == "3.3.3.3"


def test_client_ip_falls_back_to_remote_addr():
    req = FakeReq(headers={}, remote_addr="9.9.9.9")
    assert rate_limit.client_ip(req) == "9.9.9.9"


def test_client_ip_unknown_when_nothing_available():
    req = FakeReq(headers={})
    assert rate_limit.client_ip(req) == "unknown"


def test_safe_key_strips_slashes_and_caps_length():
    key = "a/b/c" * 1000
    safe = rate_limit._safe_key(key)
    assert "/" not in safe
    assert len(safe) <= 1400


# ── Rate-limit IDENTITY (main._rate_limit_identity, audit S-12) ──────────────
#
# The bug this guards: `client_ip` returns the LAST X-Forwarded-For hop (the only
# unforgeable one), which for a server-side-proxied request is the PROXY's egress
# IP — the same value for every user behind it. `/api/chat` runs through a Vercel
# route rather than a rewrite, so the fail-CLOSED 60/hr `chat` bucket had become
# one ceiling shared by the whole desktop-web user base.

import main


class _StubReq:
    """Minimal request stand-in: headers plus attribute assignment (the memo)."""

    def __init__(self, headers=None, remote_addr=None):
        self.headers = headers or {}
        self.remote_addr = remote_addr


def _fake_tokens(monkeypatch, mapping):
    """Map bearer token -> decoded dict; anything else raises like the SDK does."""
    calls = []

    def _verify(token):
        calls.append(token)
        if token in mapping:
            return mapping[token]
        raise ValueError("invalid token")

    # raising=False: in CI the real firebase_admin.auth has verify_id_token, but
    # the offline harness fakes that module as a bare SimpleNamespace which does
    # not (conftest only fakes what it must). Same drift class as the
    # test_embed_trigger_backstop mocks — see SOURCE_OF_TRUTH §4 item 11b.
    monkeypatch.setattr(main.admin_auth, "verify_id_token", _verify, raising=False)
    monkeypatch.setattr(main, "ensure_app", lambda: None, raising=False)
    return calls


def test_identity_is_per_ip_when_anonymous(monkeypatch):
    _fake_tokens(monkeypatch, {})
    req = _StubReq(headers={"X-Forwarded-For": "1.1.1.1, 76.76.21.9"})
    assert main._rate_limit_identity(req) == "ip:76.76.21.9"


def test_identity_is_per_auth_uid_when_a_token_is_present(monkeypatch):
    _fake_tokens(monkeypatch, {"good": {"uid": "auth-abc"}})
    req = _StubReq(headers={"Authorization": "Bearer good",
                            "X-Forwarded-For": "76.76.21.9"})
    assert main._rate_limit_identity(req) == "auth:auth-abc"


def test_identity_falls_back_to_ip_for_an_invalid_token(monkeypatch):
    _fake_tokens(monkeypatch, {"good": {"uid": "auth-abc"}})
    req = _StubReq(headers={"Authorization": "Bearer forged",
                            "X-Forwarded-For": "76.76.21.9"})
    assert main._rate_limit_identity(req) == "ip:76.76.21.9"


def test_two_users_behind_one_proxy_ip_do_not_share_a_bucket(monkeypatch):
    """THE regression test for S-12 — everything else here is scaffolding.

    Both requests carry the identical proxy egress IP, exactly as they do in
    production behind the Vercel route. Before the fix both collapsed to
    `chat:76.76.21.9` and the 60th Ask of the hour locked out everybody.
    """
    _fake_tokens(monkeypatch, {"tok-a": {"uid": "user-a"},
                               "tok-b": {"uid": "user-b"}})
    proxy_ip = "76.76.21.9"
    a = main._rate_limit_identity(
        _StubReq(headers={"Authorization": "Bearer tok-a",
                          "X-Forwarded-For": f"10.0.0.1, {proxy_ip}"}))
    b = main._rate_limit_identity(
        _StubReq(headers={"Authorization": "Bearer tok-b",
                          "X-Forwarded-For": f"10.0.0.2, {proxy_ip}"}))
    assert a != b, "two signed-in users behind one proxy still share a bucket"
    assert proxy_ip not in a and proxy_ip not in b


def test_auth_and_ip_identities_cannot_collide(monkeypatch):
    """An auth uid that looks like an IP must not land on an anonymous key."""
    _fake_tokens(monkeypatch, {"tok": {"uid": "76.76.21.9"}})
    signed_in = main._rate_limit_identity(
        _StubReq(headers={"Authorization": "Bearer tok",
                          "X-Forwarded-For": "8.8.8.8"}))
    anon = main._rate_limit_identity(_StubReq(headers={"X-Forwarded-For": "76.76.21.9"}))
    assert signed_in == "auth:76.76.21.9"
    assert anon == "ip:76.76.21.9"
    assert signed_in != anon


def test_bearer_verification_is_memoized_per_request(monkeypatch):
    """_rate_limit_identity and _authed_uid both verify; it must cost one check.

    Also keeps a bad token from logging "verification failed" twice per request.
    """
    calls = _fake_tokens(monkeypatch, {"good": {"uid": "auth-abc"}})
    req = _StubReq(headers={"Authorization": "Bearer good"})
    assert main._verify_bearer(req)["uid"] == "auth-abc"
    assert main._verify_bearer(req)["uid"] == "auth-abc"
    assert main._rate_limit_identity(req) == "auth:auth-abc"
    assert calls == ["good"], f"verify_id_token called {len(calls)}x, expected 1"


def test_memoized_none_is_not_reverified(monkeypatch):
    """A cached negative must stick — anonymous floods are the hot path."""
    calls = _fake_tokens(monkeypatch, {})
    req = _StubReq(headers={"Authorization": "Bearer forged"})
    assert main._verify_bearer(req) is None
    assert main._verify_bearer(req) is None
    assert len(calls) == 1
