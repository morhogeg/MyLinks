"""Reminder scheduling logic — the once/recurrence decision and interval math.

Pure: only depends on ``reminder_service`` (no Firestore/network). Guards the
retention-loop invariant that one-shots fire exactly once while smart/spaced
profiles recur up to the 3-fire cap.
"""

from datetime import datetime, timezone

from reminder_service import (
    should_complete_reminder,
    calculate_next_reminder,
    handle_reminder_intent,
)


# ── One-shot vs recurring decision ────────────────────────────────────────

def test_once_completes_on_first_fire():
    # A 'once' reminder (tomorrow / next week / custom / numbered quick-reply)
    # must complete after firing a single time — never re-fire at +7d/+30d.
    assert should_complete_reminder("once", 1) is True


def test_smart_recurs_until_cap():
    # 'smart' recurs on fires 1 and 2, then completes on the 3rd.
    assert should_complete_reminder("smart", 1) is False
    assert should_complete_reminder("smart", 2) is False
    assert should_complete_reminder("smart", 3) is True


def test_spaced_recurs_until_cap():
    assert should_complete_reminder("spaced-5", 1) is False
    assert should_complete_reminder("spaced-5", 2) is False
    assert should_complete_reminder("spaced-3", 3) is True


# ── Recurrence intervals ──────────────────────────────────────────────────

def _days_from_now(dt: datetime) -> float:
    return (dt - datetime.now(timezone.utc)).total_seconds() / 86400


def test_smart_intervals_progress():
    # smart schedule: 1, 7, 30 days for counts 0/1/2.
    assert round(_days_from_now(calculate_next_reminder(0, "smart"))) == 1
    assert round(_days_from_now(calculate_next_reminder(1, "smart"))) == 7
    assert round(_days_from_now(calculate_next_reminder(2, "smart"))) == 30


def test_spaced_start_interval_respected():
    # spaced-5 starts at 5 days on the first recurrence.
    assert round(_days_from_now(calculate_next_reminder(0, "spaced-5"))) == 5


# ── Quick-reply intent parsing (stores 'once' vs 'spaced' in main.py) ──────

def test_intent_numbered_and_keywords_parse():
    assert handle_reminder_intent("tomorrow") is not None
    assert handle_reminder_intent("next week") is not None
    assert handle_reminder_intent("3") is not None
    assert handle_reminder_intent("s") is not None
    assert handle_reminder_intent("nope") is None


# ── Recurrence keeps the scheduled local time of day ──────────────────────

def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def test_smart_repeat_keeps_local_clock_time():
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("Asia/Jerusalem")
    fired = datetime(2026, 9, 26, 9, 0, tzinfo=tz)
    # The sweep got to it a few minutes late; the repeat still lands at 9:00.
    now = datetime(2026, 9, 26, 9, 7, tzinfo=tz).astimezone(timezone.utc)
    nxt = calculate_next_reminder(1, "smart", anchor_ms=_ms(fired), tz_name="Asia/Jerusalem", now=now)
    local = nxt.astimezone(tz)
    assert (local.year, local.month, local.day, local.hour, local.minute) == (2026, 10, 3, 9, 0)


def test_repeat_survives_dst_change():
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/New_York")
    # 30 days across the early-November fall-back: still 9:00 AM local.
    fired = datetime(2026, 10, 20, 9, 0, tzinfo=tz)
    now = fired.astimezone(timezone.utc)
    nxt = calculate_next_reminder(2, "smart", anchor_ms=_ms(fired), tz_name="America/New_York", now=now)
    local = nxt.astimezone(tz)
    assert (local.month, local.day, local.hour) == (11, 19, 9)


def test_stale_anchor_rolls_forward_to_next_future_time():
    anchor = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    now = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)
    nxt = calculate_next_reminder(1, "smart", anchor_ms=_ms(anchor), tz_name=None, now=now)
    assert nxt > now
    assert (nxt.day, nxt.hour, nxt.minute) == (26, 9, 0)


def test_bad_anchor_or_timezone_falls_back_to_interval():
    now = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)
    for anchor, tz in ((None, None), ("x", None), (_ms(now), "Not/AZone")):
        nxt = calculate_next_reminder(1, "smart", anchor_ms=anchor, tz_name=tz, now=now)
        assert round((nxt - now).total_seconds() / 86400) == 7
