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
