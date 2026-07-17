"""Offline unit tests for quota.check_and_increment_quota and its helpers.

Firestore is mocked at the ``db.get_db`` boundary (same approach as
test_rate_limit.py): a fake db returns a snapshot we control and records the
``txn.set`` write, and the module's ``@firestore.transactional`` is patched to an
identity decorator so the txn body runs directly. No network, no emulator.
"""

import quota


# ── Fakes (mirror test_rate_limit.py) ────────────────────────────────────────

class FakeSnap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


def _install_fake_db_for_refund(monkeypatch, store):
    """Same as _install_fake_db but where FakeSnap.exists tracks the store, so a
    refund against a never-charged (absent) doc is a genuine no-op."""
    class _RefundDocRef:
        def __init__(self, s):
            self._store = s

        def get(self, transaction=None):
            return FakeSnap(self._store.get("value"))

    class _RefundDB:
        def __init__(self, s):
            self._store = s
            self._doc_ref = _RefundDocRef(s)

        def collection(self, _name):
            return FakeCollection(self._doc_ref)

        def transaction(self):
            return FakeTxn(self._store)

    monkeypatch.setattr(quota, "get_db", lambda: _RefundDB(store))
    monkeypatch.setattr(quota.firestore, "transactional", lambda fn: fn)
    return store


class FakeDocRef:
    def __init__(self, store):
        self._store = store

    def get(self, transaction=None):
        return FakeSnap(self._store.get("value"))


class FakeTxn:
    def __init__(self, store):
        self._store = store

    def set(self, doc_ref, data):
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
    monkeypatch.setattr(quota, "get_db", lambda: FakeDB(store))
    # Bypass @firestore.transactional (see test_rate_limit for the rationale):
    # run the txn body directly against FakeTxn in both sandbox and CI.
    monkeypatch.setattr(quota.firestore, "transactional", lambda fn: fn)
    return store


def _pin_month(monkeypatch, month="2026-07"):
    monkeypatch.setattr(quota, "_current_month", lambda now=None: month)


# ── check_and_increment_quota ────────────────────────────────────────────────

def test_first_save_allowed_and_persists(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "3")

    ok, remaining = quota.check_and_increment_quota("u1", "saves")
    assert ok is True
    assert remaining == 2
    assert store["value"]["2026-07"]["saves"] == 1


def test_counts_up_to_limit_then_blocks(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "3")

    results = [quota.check_and_increment_quota("u1", "saves") for _ in range(4)]
    oks = [r[0] for r in results]
    assert oks == [True, True, True, False]
    # The blocked 4th call must NOT have incremented past the limit.
    assert store["value"]["2026-07"]["saves"] == 3


def test_saves_and_asks_are_independent(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "1")
    monkeypatch.setenv("MONTHLY_ASK_QUOTA", "1")

    assert quota.check_and_increment_quota("u1", "saves")[0] is True
    # asks has its own counter — a maxed-out saves counter must not block it.
    assert quota.check_and_increment_quota("u1", "asks")[0] is True
    assert store["value"]["2026-07"] == {"saves": 1, "asks": 1}


def test_zero_limit_disables_check(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "0")

    for _ in range(10):
        ok, _rem = quota.check_and_increment_quota("u1", "saves")
        assert ok is True
    # Disabled → no counter doc is ever written.
    assert store == {}


def test_amount_greater_than_one(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "5")

    ok, remaining = quota.check_and_increment_quota("u1", "saves", amount=5)
    assert ok is True and remaining == 0
    # A further single increment now exceeds the cap.
    assert quota.check_and_increment_quota("u1", "saves")[0] is False


def test_prunes_months_older_than_two(monkeypatch):
    store = {"value": {
        "2026-07": {"saves": 1},
        "2026-06": {"saves": 9},   # kept (within 2 most recent)
        "2026-01": {"saves": 99},  # pruned
        "2025-12": {"saves": 99},  # pruned
    }}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch, "2026-07")
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")

    quota.check_and_increment_quota("u1", "saves")
    kept = set(store["value"].keys())
    assert kept == {"2026-07", "2026-06"}
    assert store["value"]["2026-07"]["saves"] == 2


def test_none_uid_allows_and_writes_nothing(monkeypatch):
    store = {}
    _install_fake_db(monkeypatch, store)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "1")
    ok, remaining = quota.check_and_increment_quota(None, "saves")
    assert ok is True
    assert store == {}


def test_unknown_kind_raises(monkeypatch):
    _install_fake_db(monkeypatch, {})
    try:
        quota.check_and_increment_quota("u1", "bogus")
    except ValueError:
        return
    raise AssertionError("expected ValueError for unknown kind")


def test_corrupted_month_map_fails_open(monkeypatch):
    # A corrupted doc (month key holds a string, or the counter is not a number)
    # raises inside the txn body; the soft-cap contract says that must degrade to
    # "allowed", exactly like a Firestore outage — never a 500 for the user.
    for bad_value in ("garbage", {"saves": "NaN"}):
        store = {"value": {"2026-07": bad_value}}
        _install_fake_db(monkeypatch, store)
        _pin_month(monkeypatch)
        monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "3")
        ok, remaining = quota.check_and_increment_quota("u1", "saves")
        assert ok is True
        assert remaining == quota._UNLIMITED


def test_negative_limit_disables_check(monkeypatch):
    # _limit_for: "0 (or negative / unparseable) disables the check entirely."
    store = {}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "-5")
    ok, remaining = quota.check_and_increment_quota("u1", "saves")
    assert ok is True and remaining == quota._UNLIMITED
    assert store == {}


def test_fails_open_on_backend_error(monkeypatch):
    def boom():
        raise RuntimeError("firestore down")

    monkeypatch.setattr(quota, "get_db", boom)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "1")
    ok, remaining = quota.check_and_increment_quota("u1", "saves")
    # A backend outage must degrade to "allowed" (soft cap).
    assert ok is True
    assert remaining == quota._UNLIMITED


# ── pure helpers ─────────────────────────────────────────────────────────────

def test_recent_months_wraps_year_boundary():
    assert quota._recent_months("2026-01") == {"2026-01", "2025-12"}
    assert quota._recent_months("2026-07") == {"2026-07", "2026-06"}


def test_limit_for_defaults(monkeypatch):
    monkeypatch.delenv("MONTHLY_SAVE_QUOTA", raising=False)
    monkeypatch.delenv("MONTHLY_ASK_QUOTA", raising=False)
    assert quota._limit_for("saves") == 150
    assert quota._limit_for("asks") == 100


def test_limit_for_unparseable_disables(monkeypatch):
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "not-a-number")
    assert quota._limit_for("saves") == 0


def test_limit_for_unknown_kind_is_zero(monkeypatch):
    # An unknown kind isn't in the config table → disabled (0), not a KeyError.
    assert quota._limit_for("bogus") == 0


# ── consolidated kind table / messages (report 3.2d) ─────────────────────────

def test_quota_message_per_kind():
    assert "save" in quota.quota_message("saves").lower()
    assert "question" in quota.quota_message("asks").lower()


def test_quota_message_unknown_kind_falls_back():
    # Must not KeyError for an unknown kind — a generic message is returned.
    assert quota.quota_message("bogus") == "Monthly limit reached."


def test_kinds_derived_from_table():
    # _KINDS is derived from the single config table, so the message lookup and
    # the metering path can't drift apart.
    assert set(quota._KINDS) == set(quota._QUOTA_KINDS)


# ── refund_quota (report 3.2b) ───────────────────────────────────────────────

def test_refund_decrements_current_month(monkeypatch):
    store = {"value": {"2026-07": {"saves": 3}}}
    _install_fake_db_for_refund(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")

    quota.refund_quota("u1", "saves")
    assert store["value"]["2026-07"]["saves"] == 2


def test_refund_floors_at_zero(monkeypatch):
    store = {"value": {"2026-07": {"saves": 0}}}
    _install_fake_db_for_refund(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")

    quota.refund_quota("u1", "saves")
    # Never goes negative, and (counter already 0) the doc is left as-is.
    assert store["value"]["2026-07"]["saves"] == 0


def test_refund_noop_when_metering_disabled(monkeypatch):
    store = {"value": {"2026-07": {"saves": 3}}}
    _install_fake_db_for_refund(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "0")  # disabled → nothing was charged

    quota.refund_quota("u1", "saves")
    assert store["value"]["2026-07"]["saves"] == 3  # untouched


def test_refund_noop_for_none_uid_and_unknown_kind(monkeypatch):
    store = {"value": {"2026-07": {"saves": 3}}}
    _install_fake_db_for_refund(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")

    quota.refund_quota(None, "saves")
    quota.refund_quota("u1", "bogus")
    assert store["value"]["2026-07"]["saves"] == 3


def test_refund_larger_than_counter_floors_at_zero(monkeypatch):
    # Refunding more than was charged (e.g. a double refund race) must clamp to
    # 0, never drive the counter negative and mint free quota.
    store = {"value": {"2026-07": {"saves": 1}}}
    _install_fake_db_for_refund(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")

    quota.refund_quota("u1", "saves", amount=3)
    assert store["value"]["2026-07"]["saves"] == 0


def test_refund_absent_doc_is_a_noop(monkeypatch):
    # A refund for a user who was never charged (no counter doc) must not
    # create one.
    store = {}
    _install_fake_db_for_refund(monkeypatch, store)
    _pin_month(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")

    quota.refund_quota("u1", "saves")
    assert store == {}


def test_refund_swallows_backend_error(monkeypatch):
    def boom():
        raise RuntimeError("firestore down")

    monkeypatch.setattr(quota, "get_db", boom)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")
    # Must not raise — a failed refund is best-effort.
    quota.refund_quota("u1", "saves")
