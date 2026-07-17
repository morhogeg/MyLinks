"""is_due — the central digest scheduling gate (previously untested).

Covers the fire-window math (first tick at/after the local target), the
midnight-crossing window, the daily/weekly dedupe guards, DST spring-forward
(the skipped-hour target), and corrupt-settings resilience. `_local_now` is
pinned per test; the last-sent guards are driven relative to real UTC now.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import digest_service as ds


def _pin_local(monkeypatch, dt):
    monkeypatch.setattr(ds, "_local_now", lambda tz_name: dt)


def _now_ms():
    return int(datetime.now(timezone.utc).timestamp() * 1000)


ENABLED_DAILY = {"digest_enabled": True, "digest_frequency": "daily",
                 "digest_hour": 9, "digest_minute": 0}


def test_fires_on_first_tick_at_or_after_target(monkeypatch):
    _pin_local(monkeypatch, datetime(2026, 7, 16, 9, 5, tzinfo=timezone.utc))
    assert ds.is_due(dict(ENABLED_DAILY), "UTC", None) is True


def test_does_not_fire_before_target_or_after_window(monkeypatch):
    _pin_local(monkeypatch, datetime(2026, 7, 16, 8, 55, tzinfo=timezone.utc))
    assert ds.is_due(dict(ENABLED_DAILY), "UTC", None) is False
    # Past the 15-minute cadence window: the tick that should have fired did.
    _pin_local(monkeypatch, datetime(2026, 7, 16, 9, 20, tzinfo=timezone.utc))
    assert ds.is_due(dict(ENABLED_DAILY), "UTC", None) is False


def test_midnight_crossing_window_fires_next_day(monkeypatch):
    # Target 23:55 → the first tick after it is 00:05 the NEXT day; the
    # yesterday-candidate makes the window straddle midnight correctly.
    settings = {"digest_enabled": True, "digest_frequency": "daily",
                "digest_hour": 23, "digest_minute": 55}
    _pin_local(monkeypatch, datetime(2026, 7, 17, 0, 5, tzinfo=timezone.utc))
    assert ds.is_due(settings, "UTC", None) is True


def test_daily_20h_guard_blocks_duplicate_sends(monkeypatch):
    _pin_local(monkeypatch, datetime(2026, 7, 16, 9, 5, tzinfo=timezone.utc))
    nineteen_h_ago = _now_ms() - 19 * 3600 * 1000
    twentyone_h_ago = _now_ms() - 21 * 3600 * 1000
    assert ds.is_due(dict(ENABLED_DAILY), "UTC", nineteen_h_ago) is False
    assert ds.is_due(dict(ENABLED_DAILY), "UTC", twentyone_h_ago) is True


def test_weekly_fires_only_on_target_day(monkeypatch):
    # 2026-07-16 is a Thursday (weekday 3).
    _pin_local(monkeypatch, datetime(2026, 7, 16, 9, 5, tzinfo=timezone.utc))
    weekly = {"digest_enabled": True, "digest_frequency": "weekly",
              "digest_hour": 9, "digest_minute": 0}
    assert ds.is_due({**weekly, "digest_day": 3}, "UTC", None) is True
    assert ds.is_due({**weekly, "digest_day": 0}, "UTC", None) is False


def test_weekly_midnight_crossing_attributes_to_window_open_day(monkeypatch):
    # Target Monday 23:55, tick lands Tuesday 00:05 — still Monday's digest.
    # 2026-07-13 is a Monday; 07-14 00:05 is the first tick after 23:55.
    weekly = {"digest_enabled": True, "digest_frequency": "weekly",
              "digest_hour": 23, "digest_minute": 55, "digest_day": 0}
    _pin_local(monkeypatch, datetime(2026, 7, 14, 0, 5, tzinfo=timezone.utc))
    assert ds.is_due(weekly, "UTC", None) is True


def test_dst_spring_forward_skipped_hour_still_fires(monkeypatch):
    # America/New_York, 2026-03-08: the wall clock jumps 01:59 → 03:00, so a
    # 02:30 target never exists that day. Wall-clock subtraction (same-tzinfo
    # aware datetimes subtract as naive) meant NO tick ever landed in the
    # window and the digest silently skipped the day. In absolute time the
    # skipped target maps to 03:30 EDT, and the 03:35 tick catches it.
    tz = ZoneInfo("America/New_York")
    local = datetime(2026, 3, 8, 7, 35, tzinfo=timezone.utc).astimezone(tz)
    assert local.hour == 3 and local.minute == 35  # sanity: 03:35 EDT
    settings = {"digest_enabled": True, "digest_frequency": "daily",
                "digest_hour": 2, "digest_minute": 30}
    _pin_local(monkeypatch, local)
    assert ds.is_due(settings, "America/New_York", None) is True


def test_corrupt_settings_never_raise(monkeypatch):
    _pin_local(monkeypatch, datetime(2026, 7, 16, 9, 5, tzinfo=timezone.utc))
    # Explicit nulls survive .get()'s default — int(None) used to raise, and
    # hour 24 crashed local.replace(): that user errored every tick, forever.
    assert ds.is_due({"digest_enabled": True, "digest_frequency": "daily",
                      "digest_hour": None, "digest_minute": None}, "UTC", None) is True
    assert ds.is_due({"digest_enabled": True, "digest_hour": 24,
                      "digest_minute": 99}, "UTC", None) in (True, False)  # clamped, no raise
    assert ds.is_due("not-a-dict", "UTC", None) is False
    assert ds.is_due({}, "UTC", None) is False


def test_disabled_or_bad_timezone(monkeypatch):
    _pin_local(monkeypatch, datetime(2026, 7, 16, 9, 5, tzinfo=timezone.utc))
    assert ds.is_due({"digest_enabled": False}, "UTC", None) is False
    # A bogus tz name falls back to UTC inside _local_now (pinned here) — the
    # call must simply not raise.
    assert ds.is_due(dict(ENABLED_DAILY), "Not/AZone", None) is True
