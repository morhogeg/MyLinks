"""Scheduled digests and syntheses catch up instead of silently missing a week
(AI-2).

What was wrong: send_digests ran on the 60s default timeout while walking
every user serially (a weekly synthesis alone is a model call); the gate
matched ONE five-minute window per period, so a missed tick or a failed
synthesis lost the whole week; a free workspace paid up to 500 document reads
per check for a digest it could never get; and the synthesis stamped
lastDigestSentAt, which made the weekly digest's 6-day guard skip the digest
for anyone who had both on. Offline: "now" is frozen through
digest_service._local_now, Firestore is a small dict-backed fake, and the
send paths are stubbed where the gate is what's under test.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

import digest_service as ds
import main

SUNDAY_9 = datetime(2026, 10, 4, 9, 0, tzinfo=timezone.utc)
assert SUNDAY_9.weekday() == 6


class _Clock:
    def __init__(self, at):
        self.at = at

    def now(self, tz_name=None):
        return self.at.astimezone(ZoneInfo(tz_name)) if tz_name else self.at


@pytest.fixture
def clock(monkeypatch):
    c = _Clock(SUNDAY_9)
    monkeypatch.setattr(ds, "_local_now", c.now)
    return c


class _UsersDb:
    """users/{uid} docs that the scan streams and the run stamps merge into."""

    def __init__(self, users):
        self.users = users

    def collection(self, name):
        assert name == "users"
        return self

    def select(self, fields):
        self._fields = fields
        return self

    def stream(self):
        for uid, data in list(self.users.items()):
            masked = {k: v for k, v in data.items() if k in self._fields}
            yield type("_Doc", (), {"id": uid, "to_dict": lambda _s, d=masked: dict(d)})()

    def document(self, uid):
        users = self.users
        return type("_Ref", (), {"set": lambda _s, data, merge=False: users[uid].update(data)})()


_SYNTH_USER = {"settings": {"synthesis_enabled": True, "synthesis_day": 6, "digest_hour": 9},
               "timezone": "UTC"}
_DIGEST_USER = {"settings": {"digest_enabled": True, "digest_day": 6, "digest_hour": 9},
                "timezone": "UTC"}


# ── the gates catch up ──────────────────────────────────────────────────────

def test_synthesis_is_due_ten_minutes_late_when_nothing_ran(clock):
    clock.at = SUNDAY_9 + timedelta(minutes=10)
    assert ds.is_synthesis_due(_SYNTH_USER["settings"], "UTC", None) is True
    assert ds.synthesis_due_at(_SYNTH_USER["settings"], "UTC", None) == SUNDAY_9


def test_weekly_digest_is_due_ten_minutes_late_too(clock):
    clock.at = SUNDAY_9 + timedelta(minutes=10)
    assert ds.is_due(_DIGEST_USER["settings"], "UTC", None) is True


def test_catch_up_is_bounded(clock):
    clock.at = SUNDAY_9 + ds.DIGEST_CATCHUP + timedelta(minutes=1)
    assert ds.is_synthesis_due(_SYNTH_USER["settings"], "UTC", None) is False
    assert ds.is_due(_DIGEST_USER["settings"], "UTC", None) is False


def test_a_settled_period_is_closed_and_a_failed_one_waits_to_retry(clock):
    clock.at = SUNDAY_9 + timedelta(minutes=20)
    at = int((SUNDAY_9 + timedelta(minutes=5)).timestamp() * 1000)
    settings = _SYNTH_USER["settings"]
    assert ds.is_synthesis_due(settings, "UTC", {"at": at, "ok": True}) is False
    assert ds.is_synthesis_due(settings, "UTC", {"at": at, "ok": False}) is False  # 15 min later
    clock.at = SUNDAY_9 + timedelta(minutes=36)
    assert ds.is_synthesis_due(settings, "UTC", {"at": at, "ok": False}) is True   # 31 min later
    # A stamp from LAST week's period does not close this one.
    last_week = int((SUNDAY_9 - timedelta(days=7)).timestamp() * 1000)
    assert ds.is_synthesis_due(settings, "UTC", {"at": last_week, "ok": True}) is True


# ── the scheduler walk: no double send, retries, the week id ────────────────

def _run_ticks(monkeypatch, clock, users, outcomes, minutes):
    """Run run_digest_check at SUNDAY_9 + each of `minutes`; the synthesis
    send returns the next of `outcomes`. Returns the week ids it was called
    with."""
    db = _UsersDb(users)
    monkeypatch.setattr(ds, "get_db", lambda: db)
    calls = []

    def fake_synthesis(uid, user_data, links=None, force=False, week_id=None):
        calls.append(week_id)
        return outcomes[len(calls) - 1]

    monkeypatch.setattr(ds, "build_and_send_synthesis", fake_synthesis)
    for m in minutes:
        clock.at = SUNDAY_9 + timedelta(minutes=m)
        ds.run_digest_check()
    return calls


def test_a_delivered_synthesis_is_not_sent_again(monkeypatch, clock):
    users = {"u1": dict(_SYNTH_USER)}
    calls = _run_ticks(monkeypatch, clock, users, [{"sent": True}], minutes=[0, 5, 10, 60, 300])
    assert len(calls) == 1
    assert users["u1"]["synthesisRun"]["ok"] is True


def test_a_failed_synthesis_is_retried_after_the_backoff(monkeypatch, clock):
    users = {"u1": dict(_SYNTH_USER)}
    calls = _run_ticks(monkeypatch, clock, users,
                       [{"sent": False, "skipped": "synthesis_failed"}, {"sent": True}],
                       minutes=[0, 5, 10, 30, 35, 40])
    assert len(calls) == 2  # the first tick, then the first tick past 30 minutes
    assert users["u1"]["synthesisRun"]["ok"] is True


def test_a_retry_across_utc_midnight_keeps_the_period_week(monkeypatch, clock):
    # Jerusalem, Monday 01:00 local = Sunday 22:00 UTC: the retry 2.5 hours
    # later is already Monday in UTC, and must still file under the same week.
    user = {"settings": {"synthesis_enabled": True, "synthesis_day": 0, "digest_hour": 1},
            "timezone": "Asia/Jerusalem"}
    calls = _run_ticks(monkeypatch, clock, {"u1": user},
                       [{"sent": False, "skipped": "synthesis_failed"}, {"sent": True}],
                       minutes=[13 * 60, 13 * 60 + 150])
    assert calls == ["2026-W40", "2026-W40"]


def test_scan_masks_in_the_run_stamps_and_free_users_settle_once(monkeypatch, clock):
    users = {"free": dict(_DIGEST_USER)}
    db = _UsersDb(users)
    monkeypatch.setattr(ds, "get_db", lambda: db)
    checks = []
    monkeypatch.setattr(ds, "is_pro", lambda uid: checks.append(uid) or False)
    monkeypatch.setattr(ds, "fetch_candidate_links",
                        lambda uid: pytest.fail("free workspace read 500 candidates"))
    for m in (0, 5, 10):
        clock.at = SUNDAY_9 + timedelta(minutes=m)
        ds.run_digest_check()
    assert checks == ["free"]  # settled as pro_required on the first tick
    assert users["free"]["digestRun"]["ok"] is True


def test_the_tick_stops_starting_users_when_its_budget_is_spent(monkeypatch, clock):
    users = {"a": dict(_SYNTH_USER), "b": dict(_SYNTH_USER)}
    monkeypatch.setattr(ds, "get_db", lambda: _UsersDb(users))
    monkeypatch.setattr(ds, "build_and_send_synthesis", lambda *a, **k: pytest.fail("ran past budget"))
    report = ds.run_digest_check(budget_s=-1)
    assert report["deferred"] is True and report["users_checked"] == 0


# ── the send paths ──────────────────────────────────────────────────────────

def test_free_workspace_never_reads_candidates(monkeypatch):
    monkeypatch.setattr(ds, "is_pro", lambda uid: False)
    monkeypatch.setattr(ds, "fetch_candidate_links",
                        lambda uid: pytest.fail("free workspace read 500 candidates"))
    res = ds.build_and_send_digest("u1", {"settings": {"digest_enabled": True}}, force=False)
    assert res["skipped"] == "pro_required"


def test_a_delivered_week_costs_one_read_not_five_hundred(monkeypatch):
    from tests.test_digest_delivery import RecordingDB
    monkeypatch.setattr(ds, "get_db", lambda: RecordingDB(synth_exists=True))
    monkeypatch.setattr(ds, "fetch_candidate_links",
                        lambda uid: pytest.fail("read candidates for a delivered week"))
    res = ds.build_and_send_synthesis("u1", {"settings": {}}, None, force=False, week_id="2026-W40")
    assert res["skipped"] == "already_sent_this_week"


def test_synthesis_no_longer_stamps_the_digest_send_time(monkeypatch):
    import ai_service
    from tests.test_digest_delivery import RecordingDB, _recent_cards
    rec = RecordingDB()
    monkeypatch.setattr(ds, "get_db", lambda: rec)
    monkeypatch.setattr(ds, "is_pro", lambda uid: True)
    monkeypatch.setattr(ai_service, "GeminiService", lambda: type("G", (), {
        "synthesize_week": lambda self, c: {"title": "T", "narrative": "n"}})())
    res = ds.build_and_send_synthesis("u1", {"settings": {}}, _recent_cards(), force=False)
    assert res["sent"] is True
    assert rec.user_merge is None  # lastDigestSentAt untouched: the weekly digest still goes


def test_synthesis_call_has_a_short_timeout_and_one_retry():
    import ai_service
    seen = {}
    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
    svc.client = object()

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        seen.update(config=config_extra, attempts=attempts)
        return {"title": "T", "narrative": "n"}

    svc._generate_json = fake_generate_json
    svc.synthesize_week([{"id": "a", "title": "Card", "summary": "s"}])
    assert seen["config"]["http_options"] == {"timeout": ai_service.SYNTHESIS_CALL_TIMEOUT_MS}
    assert seen["attempts"] == ai_service.SYNTHESIS_ATTEMPTS == 2
    # Worst case (two calls plus the backoff) still fits a 60s callable.
    assert ai_service.SYNTHESIS_CALL_TIMEOUT_MS * 2 / 1000 + 4 < 60


def test_send_digests_runs_on_a_real_timeout():
    endpoint = getattr(main.send_digests, "__firebase_endpoint__", None)
    if endpoint is not None:
        assert endpoint.timeoutSeconds == 540
    else:  # offline stub decorator: check the declaration itself
        assert 'schedule="*/5 * * * *", max_instances=1, timeout_sec=540' in open(main.__file__).read()
    # The last user a tick starts (worst case: a synthesis, i.e. two model
    # calls plus the backoff, plus ~30s of reads and the push) still finishes
    # before the next tick, so two ticks never work on the same user at once.
    import ai_service
    worst_user_s = ai_service.SYNTHESIS_CALL_TIMEOUT_MS * ai_service.SYNTHESIS_ATTEMPTS / 1000 + 4 + 30
    assert ds.DIGEST_TICK_BUDGET_S + worst_user_s < ds.DIGEST_CADENCE_MINUTES * 60
