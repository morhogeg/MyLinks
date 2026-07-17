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

def test_intent_keywords_parse_to_expected_magnitudes():
    # Assert the actual magnitudes, not just "is not None" — a regression that
    # returned +7d for "tomorrow" used to pass this test.
    assert round(_days_from_now(handle_reminder_intent("tomorrow"))) == 1
    assert round(_days_from_now(handle_reminder_intent("next week"))) == 7
    assert round(_days_from_now(handle_reminder_intent("in 3 days"))) == 3
    assert round(_days_from_now(handle_reminder_intent("3"))) == 3
    assert handle_reminder_intent("s") is not None
    assert handle_reminder_intent("nope") is None


def test_intent_hebrew_patterns_parse():
    assert round(_days_from_now(handle_reminder_intent("מחר"))) == 1
    assert round(_days_from_now(handle_reminder_intent("שבוע הבא"))) == 7
    assert round(_days_from_now(handle_reminder_intent("בעוד 3 ימים"))) == 3


def test_intent_bounds_and_junk_input():
    # "in 9999999999 days" used to OverflowError timedelta; "²" passes
    # isdigit() but int() raises; "in 0 days" bypassed the 1–365 guard and
    # produced an immediately-due reminder; a non-string body crashed re.sub.
    assert handle_reminder_intent("in 9999999999 days") is None
    assert handle_reminder_intent("²") is None
    assert handle_reminder_intent("in 0 days") is None
    assert handle_reminder_intent("0") is None
    assert handle_reminder_intent("366") is None
    assert handle_reminder_intent(None) is None
    assert handle_reminder_intent(123) is None


def test_intent_boundary_365_days_accepted():
    assert round(_days_from_now(handle_reminder_intent("in 365 days"))) == 365
    assert round(_days_from_now(handle_reminder_intent("365"))) == 365


# ── Corrupt-doc resilience (crash here = push spam every tick) ─────────────

def test_calculate_next_reminder_survives_corrupt_fields():
    # A null/wrong-typed profile or count crashes AFTER the push is sent but
    # BEFORE the schedule advances — the doc stays due and the user is pushed
    # again every 2-minute tick. Must fall back to defaults instead.
    assert round(_days_from_now(calculate_next_reminder(1, None))) == 7      # smart fallback
    assert round(_days_from_now(calculate_next_reminder("2", "smart"))) == 30
    assert round(_days_from_now(calculate_next_reminder(None, "smart"))) == 1
    # 'spaced-' with junk suffix keeps the default start interval.
    assert calculate_next_reminder(0, "spaced-junk") is not None


def test_should_complete_reminder_survives_corrupt_count():
    # Uncomparable count → complete (never risk endless recurrence).
    assert should_complete_reminder("smart", "many") is True


# ── spaced-N progression table (counts 1/2 per start interval) ─────────────

def test_spaced_progressions_follow_table():
    assert round(_days_from_now(calculate_next_reminder(1, "spaced-3"))) == 5
    assert round(_days_from_now(calculate_next_reminder(2, "spaced-3"))) == 7
    assert round(_days_from_now(calculate_next_reminder(1, "spaced-5"))) == 7
    assert round(_days_from_now(calculate_next_reminder(2, "spaced-5"))) == 14
    assert round(_days_from_now(calculate_next_reminder(1, "spaced-7"))) == 14
    assert round(_days_from_now(calculate_next_reminder(2, "spaced-7"))) == 30


# ── _coerce_reminder_ms (admin repair sweep) ───────────────────────────────

def test_coerce_reminder_ms_nan_and_inf_are_unparseable():
    from reminder_service import _coerce_reminder_ms
    # int(nan)/int(inf) raise — and the call site has no per-doc try, so one
    # poisoned doc used to abort the whole repair sweep.
    for bad in (float("nan"), float("inf"), float("-inf"), "inf", "Infinity", "nan"):
        assert _coerce_reminder_ms(bad) == (None, "unparseable")


def test_coerce_reminder_ms_normal_shapes():
    from reminder_service import _coerce_reminder_ms
    assert _coerce_reminder_ms(1_700_000_000_000) == (None, "ok")
    assert _coerce_reminder_ms(1.7e12) == (1_700_000_000_000, "converted")
    assert _coerce_reminder_ms("1700000000000") == (1_700_000_000_000, "converted")
    assert _coerce_reminder_ms(True) == (None, "unparseable")
    assert _coerce_reminder_ms("garbage") == (None, "unparseable")
