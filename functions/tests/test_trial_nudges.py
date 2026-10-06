"""Trial-ending nudges land in the user's daytime, exactly once.

The sweep used to run every six hours at fixed UTC times, so about a quarter
of the "your trial ends" pushes arrived at night wherever the user was. It now
runs hourly and only sends between 09:00 and 20:59 in the zone stored on the
user doc; a workspace with no usable zone is sent on the first sweep. Each
trial is claimed (nudgedAt) in a transaction before its push, so overlapping
sweeps cannot double-send, and a push that raises releases the claim so the
next hourly sweep retries it.

Offline: an in-memory Firestore double at entitlement.get_db; push and quota
are faked at their modules.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

import entitlement as ent
import main
import push_service
import quota

HOUR = 60 * 60 * 1000
DAY = 24 * HOUR


def _utc_ms(iso):
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _local_hour(ms, tz_name):
    return datetime.fromtimestamp(ms / 1000, ZoneInfo(tz_name)).hour


# ── In-memory Firestore ──────────────────────────────────────────────────────

class _Snap:
    def __init__(self, ref, data):
        self.reference = ref
        self.id = ref.id
        self._d = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class _Ref:
    def __init__(self, db, coll, doc_id):
        self.db, self.coll, self.id = db, coll, doc_id

    def get(self, transaction=None):
        return _Snap(self, self.db.store[self.coll].get(self.id))

    def set(self, data, merge=False):
        cur = self.db.store[self.coll].get(self.id) or {}
        self.db.store[self.coll][self.id] = {**cur, **data} if merge else dict(data)


class _EntQuery:
    def __init__(self, db, filters=(), lim=None, after=None):
        self.db, self.filters, self.lim, self.after = db, list(filters), lim, after

    def where(self, filter):
        return _EntQuery(self.db, self.filters + [filter], self.lim, self.after)

    def order_by(self, field, **_kw):
        assert field == "trialEndsAt"
        return self

    def limit(self, n):
        return _EntQuery(self.db, self.filters, n, self.after)

    def start_after(self, snap):
        return _EntQuery(self.db, self.filters, self.lim, snap)

    def get(self):
        self.db.queries += 1
        ops = {"==": lambda a, b: a == b, ">": lambda a, b: a is not None and a > b,
               "<=": lambda a, b: a is not None and a <= b}
        rows = [
            (doc_id, data) for doc_id, data in self.db.store["entitlements"].items()
            if all(ops[f.op_string](data.get(f.field_path), f.value) for f in self.filters)
        ]
        rows.sort(key=lambda r: (r[1]["trialEndsAt"], r[0]))
        if self.after is not None:
            key = (self.after.to_dict()["trialEndsAt"], self.after.id)
            rows = [r for r in rows if (r[1]["trialEndsAt"], r[0]) > key]
        if self.lim:
            rows = rows[: self.lim]
        return [_Snap(_Ref(self.db, "entitlements", doc_id), data) for doc_id, data in rows]


class _Coll(_EntQuery):
    def __init__(self, db, name):
        super().__init__(db)
        self.name = name

    def document(self, doc_id):
        return _Ref(self.db, self.name, doc_id)


class _Db:
    def __init__(self):
        self.store = {"entitlements": {}, "users": {}}
        self.queries = 0

    def collection(self, name):
        return _Coll(self, name)


class _DirectTx:
    def set(self, ref, data, merge=False):
        ref.set(data, merge=merge)


@pytest.fixture
def env(monkeypatch):
    db = _Db()
    sent = []
    clock = {"now": _utc_ms("2026-10-01T00:00:00")}

    def send_push(uid, title, body, data=None):
        sent.append({"uid": uid, "at": clock["now"], "title": title})
        return {"sent": 1, "failed": 0, "pruned": 0, "skipped": None}

    monkeypatch.setattr(ent, "get_db", lambda: db)
    monkeypatch.setattr(ent, "_now_ms", lambda: clock["now"])
    monkeypatch.setattr(ent, "_run_transaction", lambda _db, fn: fn(_DirectTx()), raising=False)
    monkeypatch.setattr(push_service, "send_push", send_push)
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {"saves": 12, "asks": 3})

    def add_trial(uid, ends_at, tz=None, **extra):
        db.store["entitlements"][uid] = {"plan": "pro", "source": "trial", "proUntil": ends_at,
                                         "trialEndsAt": ends_at, "nudgedAt": None, **extra}
        db.store["users"][uid] = {"timezone": tz} if tz else {}

    return {"db": db, "sent": sent, "clock": clock, "add_trial": add_trial}


def _sweep_hourly(env, hours):
    for _ in range(hours):
        ent.run_trial_nudges()
        env["clock"]["now"] += HOUR


# ── Local daytime ────────────────────────────────────────────────────────────

def test_a_nudge_waits_for_the_users_daytime(env):
    # 10:00 UTC is 03:00 in Los Angeles (PDT): too early to buzz a phone.
    env["clock"]["now"] = _utc_ms("2026-10-01T10:00:00")
    env["add_trial"]("la", env["clock"]["now"] + 30 * HOUR, tz="America/Los_Angeles")

    report = ent.run_trial_nudges()
    assert env["sent"] == []
    assert report["deferred"] == 1
    assert env["db"].store["entitlements"]["la"]["nudgedAt"] is None

    _sweep_hourly(env, 24)
    assert len(env["sent"]) == 1
    assert _local_hour(env["sent"][0]["at"], "America/Los_Angeles") == 9


@pytest.mark.parametrize("tz", [
    "Asia/Jerusalem", "America/New_York", "America/Los_Angeles", "Europe/London",
    "Asia/Kolkata", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC",
])
def test_every_trial_in_the_window_is_nudged_once_in_local_daytime(env, tz):
    """No misses, no duplicates: trials ending anywhere 1 to 48 hours past the
    first sweep each get one push, at a local hour between 9 and 20, as long
    as a daytime hour remains before the end. Trials are spread across the
    48 hours, so every phase of the local day is covered."""
    start = _utc_ms("2026-10-01T00:00:00")
    env["clock"]["now"] = start
    ends = {f"t{h}": start + h * HOUR + 17 * 60 * 1000 for h in range(1, 49)}
    for uid, at in ends.items():
        env["add_trial"](uid, at, tz=tz)

    _sweep_hourly(env, 49)

    by_uid = {}
    for s in env["sent"]:
        by_uid.setdefault(s["uid"], []).append(s["at"])
    zone = ZoneInfo(tz)
    for uid, at in ends.items():
        first_sweep = start
        daytime_left = any(
            9 <= datetime.fromtimestamp(t / 1000, zone).hour <= 20
            for t in range(first_sweep, at, HOUR)
        )
        got = by_uid.get(uid, [])
        assert len(got) == (1 if daytime_left else 0), (uid, got)
        for t in got:
            assert 9 <= _local_hour(t, tz) <= 20
            assert t < at


def test_a_full_window_always_contains_daytime(env):
    """Entering the window 48 hours out, every zone sees daytime before the
    end: the deferral can never turn into a miss for a normal trial."""
    for tz in ("Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kathmandu", "America/St_Johns"):
        env["sent"].clear()
        env["db"].store["entitlements"].clear()
        start = env["clock"]["now"]
        env["add_trial"]("u", start + 48 * HOUR, tz=tz)
        _sweep_hourly(env, 48)
        assert len(env["sent"]) == 1, tz


def test_without_a_usable_zone_the_first_sweep_sends(env):
    env["clock"]["now"] = _utc_ms("2026-10-01T03:00:00")
    env["add_trial"]("nozone", env["clock"]["now"] + 40 * HOUR)
    env["add_trial"]("badzone", env["clock"]["now"] + 40 * HOUR, tz="Mars/Olympus_Mons")
    ent.run_trial_nudges()
    assert sorted(s["uid"] for s in env["sent"]) == ["badzone", "nozone"]


# ── Exactly once ─────────────────────────────────────────────────────────────

def test_hourly_sweeps_send_once(env):
    env["clock"]["now"] = _utc_ms("2026-10-01T12:00:00")
    env["add_trial"]("tlv", env["clock"]["now"] + 40 * HOUR, tz="Asia/Jerusalem")
    _sweep_hourly(env, 40)
    assert [s["uid"] for s in env["sent"]] == ["tlv"]


def test_an_overlapping_sweep_cannot_double_send(env, monkeypatch):
    """Cloud Scheduler delivers at least once, and the admin trigger can run
    beside the hourly sweep. The second sweep reads the same candidates while
    the first is still sending; the claim (nudgedAt, stamped in a transaction
    before the push) keeps it from sending again."""
    env["clock"]["now"] = _utc_ms("2026-10-01T12:00:00")
    env["add_trial"]("tlv", env["clock"]["now"] + 40 * HOUR, tz="Asia/Jerusalem")
    sent = env["sent"]
    nested = {"ran": False}

    def send_push(uid, title, body, data=None):
        sent.append({"uid": uid, "at": env["clock"]["now"]})
        if not nested["ran"]:
            nested["ran"] = True
            ent.run_trial_nudges()       # a second sweep, mid-send
        return {"sent": 1, "failed": 0, "pruned": 0, "skipped": None}

    monkeypatch.setattr(push_service, "send_push", send_push)
    ent.run_trial_nudges()
    assert [s["uid"] for s in sent] == ["tlv"]


def test_a_push_that_raises_is_retried_on_the_next_sweep(env, monkeypatch):
    env["clock"]["now"] = _utc_ms("2026-10-01T12:00:00")
    env["add_trial"]("tlv", env["clock"]["now"] + 40 * HOUR, tz="Asia/Jerusalem")
    calls = []

    def flaky(uid, title, body, data=None):
        calls.append(uid)
        if len(calls) == 1:
            raise RuntimeError("FCM unavailable")
        return {"sent": 1, "failed": 0, "pruned": 0, "skipped": None}

    monkeypatch.setattr(push_service, "send_push", flaky)
    report = ent.run_trial_nudges()
    assert report["errors"] == 1
    assert env["db"].store["entitlements"]["tlv"]["nudgedAt"] is None
    env["clock"]["now"] += HOUR
    ent.run_trial_nudges()
    env["clock"]["now"] += HOUR
    ent.run_trial_nudges()
    assert calls == ["tlv", "tlv"]
    assert env["db"].store["entitlements"]["tlv"]["nudgedAt"]


def test_a_device_without_push_is_stamped_and_not_retried(env, monkeypatch):
    env["clock"]["now"] = _utc_ms("2026-10-01T12:00:00")
    env["add_trial"]("tlv", env["clock"]["now"] + 40 * HOUR, tz="Asia/Jerusalem")
    calls = []
    monkeypatch.setattr(push_service, "send_push",
                        lambda uid, *a, **k: calls.append(uid) or {"sent": 0, "skipped": "no_tokens"})
    _sweep_hourly(env, 3)
    assert calls == ["tlv"]


def test_a_purchase_after_the_query_is_not_nudged(env, monkeypatch):
    """The claim re-reads the doc: a subscriber who bought between the sweep's
    query and its push is not told their trial is ending."""
    env["clock"]["now"] = _utc_ms("2026-10-01T12:00:00")
    env["add_trial"]("tlv", env["clock"]["now"] + 40 * HOUR, tz="Asia/Jerusalem")
    store = env["db"].store

    real_get = _Ref.get

    def get(self, transaction=None):
        if self.coll == "users" and self.id == "tlv":
            store["entitlements"]["tlv"].update({"source": "revenuecat", "proUntil": 10**13})
        return real_get(self, transaction)

    monkeypatch.setattr(_Ref, "get", get)
    ent.run_trial_nudges()
    assert env["sent"] == []


def test_every_page_of_candidates_is_swept(env, monkeypatch):
    monkeypatch.setattr(ent, "_NUDGE_PAGE", 2, raising=False)
    env["clock"]["now"] = _utc_ms("2026-10-01T12:00:00")
    for i in range(5):
        env["add_trial"](f"u{i}", env["clock"]["now"] + (30 + i) * HOUR, tz="Asia/Jerusalem")
    ent.run_trial_nudges()
    assert sorted(s["uid"] for s in env["sent"]) == [f"u{i}" for i in range(5)]


# ── Schedule ─────────────────────────────────────────────────────────────────

def test_the_sweep_is_scheduled_hourly():
    endpoint = getattr(main.trial_nudges, "__firebase_endpoint__", None)
    if endpoint is None:  # offline stub of firebase_functions: read the source
        import inspect
        src = inspect.getsource(main)
        assert '@scheduler_fn.on_schedule(schedule="0 * * * *", max_instances=1)\ndef trial_nudges' in src
        return
    assert endpoint.scheduleTrigger["schedule"] == "0 * * * *"
