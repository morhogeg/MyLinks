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


def _clear_quota_env(monkeypatch):
    for name in ("MONTHLY_SAVE_QUOTA", "MONTHLY_ASK_QUOTA", "FREE_SAVE_QUOTA",
                 "FREE_ASK_QUOTA", "PRO_SAVE_QUOTA", "PRO_ASK_QUOTA"):
        monkeypatch.delenv(name, raising=False)


def test_limit_for_defaults(monkeypatch):
    _clear_quota_env(monkeypatch)
    # Machina Pro (2026-09-02): the free tier's published caps, and the Pro
    # abuse ceilings. `_limit_for` without a plan is the FREE limit.
    assert quota._limit_for("saves") == 100
    assert quota._limit_for("asks") == 20
    assert quota._limit_for("saves", "pro") == 1000
    assert quota._limit_for("asks", "pro") == 1000


def test_limit_for_plan_env_names(monkeypatch):
    """FREE_*/PRO_* override per plan; the legacy MONTHLY_* alias still means
    the free value, and the explicit FREE_* name wins over the alias."""
    _clear_quota_env(monkeypatch)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")
    assert quota._limit_for("saves") == 150
    assert quota._limit_for("saves", "pro") == 1000
    monkeypatch.setenv("FREE_SAVE_QUOTA", "7")
    assert quota._limit_for("saves") == 7
    monkeypatch.setenv("PRO_ASK_QUOTA", "0")
    assert quota._limit_for("asks", "pro") == 0
    assert quota._limit_for("asks", "free") == 20


def test_meter_reports_used_and_limit_for_the_429_body(monkeypatch):
    store = {"value": {"2026-07": {"saves": 3}}}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    _clear_quota_env(monkeypatch)
    monkeypatch.setenv("FREE_SAVE_QUOTA", "3")

    blocked = quota.meter("u1", "saves", plan="free")
    assert blocked["ok"] is False
    assert (blocked["used"], blocked["limit"], blocked["plan"]) == (3, 3, "free")
    assert store["value"]["2026-07"]["saves"] == 3  # not incremented

    # Same counter, Pro plan: the ceiling is the Pro one, so it goes through.
    allowed = quota.meter("u1", "saves", plan="pro")
    assert allowed["ok"] is True
    assert allowed["used"] == 4 and allowed["limit"] == 1000


def test_quota_message_free_carries_upgrade_hint_pro_does_not():
    free = quota.quota_message("asks", "free", 20)
    assert "20" in free and "Machina Pro" in free
    pro = quota.quota_message("asks", "pro")
    assert "Machina Pro" not in pro
    # Build tripwire: the client renders this verbatim.
    for kind in ("saves", "asks"):
        for plan in ("free", "pro"):
            assert "\u2014" not in quota.quota_message(kind, plan, 5)


def test_quota_usage_reads_current_month_only(monkeypatch):
    store = {"value": {"2026-06": {"saves": 9}, "2026-07": {"saves": 3, "asks": "2"}}}
    _install_fake_db(monkeypatch, store)
    _pin_month(monkeypatch)
    assert quota.quota_usage("u1") == {"saves": 3, "asks": 2}
    assert quota.quota_usage(None) == {"saves": 0, "asks": 0}


def test_env_still_overrides_the_ask_default(monkeypatch):
    """The default must stay a DEFAULT — setting MONTHLY_ASK_QUOTA in the
    functions env is how the ceiling moves without a deploy (either direction:
    up for a heavy owner month, down for a public tier)."""
    monkeypatch.setenv("MONTHLY_ASK_QUOTA", "500")
    assert quota._limit_for("asks") == 500


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
    # Refunds don't know the plan, so "disabled" means disabled on EVERY plan.
    monkeypatch.setenv("PRO_SAVE_QUOTA", "0")

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


def test_refund_swallows_backend_error(monkeypatch):
    def boom():
        raise RuntimeError("firestore down")

    monkeypatch.setattr(quota, "get_db", boom)
    monkeypatch.setenv("MONTHLY_SAVE_QUOTA", "150")
    # Must not raise — a failed refund is best-effort.
    quota.refund_quota("u1", "saves")
