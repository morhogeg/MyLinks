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
