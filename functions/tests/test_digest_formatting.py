"""digest_service pure helpers and channel normalization.

digest_service imports google.cloud.firestore / db at module top; conftest
fakes those offline. The functions tested here are pure (no db/network calls),
so they run directly.
"""

import digest_service as ds


# ── _normalize_channels ───────────────────────────────────────────────────

def test_normalize_channels_none_defaults_to_push():
    assert ds._normalize_channels(None) == ["push"]


def test_normalize_channels_maps_whatsapp_to_push():
    assert ds._normalize_channels(["whatsapp"]) == ["push"]


def test_normalize_channels_dedupes_after_migration():
    # push + legacy whatsapp collapse to a single push, order preserved.
    assert ds._normalize_channels(["push", "whatsapp"]) == ["push"]
    # whatsapp migrates to push; the retired email channel is dropped.
    assert ds._normalize_channels(["whatsapp", "email"]) == ["push"]


def test_normalize_channels_drops_retired_email():
    # Email delivery was cut: it's silently dropped at read time, never kept.
    assert ds._normalize_channels(["push", "email"]) == ["push"]
    # An email-only legacy user falls back to the always-on in-app surface.
    assert ds._normalize_channels(["email"]) == []


def test_normalize_channels_preserves_push():
    assert ds._normalize_channels(["push"]) == ["push"]


def test_normalize_channels_empty_list_stays_empty():
    # An explicit empty list is distinct from None (None → push default).
    assert ds._normalize_channels([]) == []


# ── normalize_mode (retired-mode read-time mapping) ───────────────────────

def test_normalize_mode_maps_retired_modes_to_smart():
    # random / unread / favorites were retired — each resolves to smart.
    for retired in ("random", "unread", "favorites"):
        assert ds.normalize_mode(retired) == "smart"


def test_normalize_mode_keeps_survivors():
    for survivor in ("smart", "topic", "rediscover", "synthesis"):
        assert ds.normalize_mode(survivor) == survivor


def test_normalize_mode_defaults_unknown_and_none_to_smart():
    assert ds.normalize_mode(None) == "smart"
    assert ds.normalize_mode("") == "smart"
    assert ds.normalize_mode("bogus") == "smart"


def test_retired_modes_are_not_valid():
    for retired in ("random", "unread", "favorites"):
        assert retired not in ds.VALID_MODES


# ── curate honours the read-time mapping ──────────────────────────────────

def _links(n=6):
    # n cards, staggered createdAt so smart/rediscover have material to sort.
    now_ms = 1_700_000_000_000
    return [
        {"id": f"c{i}", "title": f"Card {i}", "status": "active",
         "createdAt": now_ms - i * 86_400_000, "isRead": False}
        for i in range(n)
    ]


def test_curate_retired_mode_curates_via_smart_without_error():
    links = _links()
    for retired in ("random", "unread", "favorites"):
        picks = ds.curate(links, retired, 3)
        # Same shape/size as an explicit smart request — no crash, real cards.
        assert len(picks) == 3
        assert all(p["id"] in {l["id"] for l in links} for p in picks)


def test_curate_unknown_mode_falls_back_to_smart():
    assert len(ds.curate(_links(), "totally-unknown", 2)) == 2


# ── _to_ms coercion ───────────────────────────────────────────────────────

def test_to_ms_handles_none_and_numbers():
    assert ds._to_ms(None) == 0
    # A seconds-scale number is scaled up to ms.
    assert ds._to_ms(1_600_000_000) == 1_600_000_000 * 1000
    # An already-ms-scale number is left as-is.
    assert ds._to_ms(1_600_000_000_000) == 1_600_000_000_000


def test_to_ms_parses_iso_string():
    assert ds._to_ms("2021-01-01T00:00:00Z") > 0
    assert ds._to_ms("not-a-date") == 0


def test_to_ms_nan_inf_and_bool_are_zero():
    # NaN/inf: int() raises, and _to_ms runs inside curate()'s sort keys — one
    # poison createdAt used to fail the user's digest every tick. bool is an
    # int subclass but never a timestamp.
    assert ds._to_ms(float("nan")) == 0
    assert ds._to_ms(float("inf")) == 0
    assert ds._to_ms(True) == 0


def test_to_ms_parses_numeric_strings():
    # A stringified number isn't ISO — it used to silently become epoch 0,
    # making the card look infinitely old to curation (permanent
    # "rediscover" bait). Same seconds/ms heuristic as real numbers.
    assert ds._to_ms("1700000000000") == 1_700_000_000_000
    assert ds._to_ms("1700000000") == 1_700_000_000_000
    assert ds._to_ms("inf") == 0


def test_normalize_channels_bare_string_wraps():
    # "push" (string, not list) used to iterate as characters and silently
    # disable delivery while everything else looked healthy.
    assert ds._normalize_channels("push") == ["push"]
    assert ds._normalize_channels("whatsapp") == ["push"]
    assert ds._normalize_channels({"bogus": 1}) == ["push"]


# ── curate: the smart 60/40 mix and corrupt-field resilience ──────────────

def _now_ms():
    from datetime import datetime, timezone
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def test_smart_mix_includes_rediscovery():
    # The 60/40 backlog/rediscovery split was dead code: the per-source quota
    # (`take`) was computed but never applied, so with a deep unread backlog
    # the digest was 100% fresh and old saves never resurfaced.
    now = _now_ms()
    old_ms = now - 60 * 86_400_000
    links = (
        [{"id": f"f{i}", "isRead": False, "createdAt": now - i} for i in range(10)]
        + [{"id": f"o{i}", "isRead": True, "createdAt": old_ms - i,
            "lastViewedAt": old_ms - i} for i in range(10)]
    )
    picks = ds.curate(links, "smart", 5)
    assert len(picks) == 5
    old_picks = [p for p in picks if p["id"].startswith("o")]
    assert len(old_picks) == 2  # count - fresh_target = 5 - 3


def test_smart_mix_tops_up_when_no_old_cards_exist():
    # A library with nothing old enough to rediscover must still fill the
    # digest from the backlog (the quota must not leave slots empty).
    now = _now_ms()
    links = [{"id": f"f{i}", "isRead": False, "createdAt": now - i} for i in range(10)]
    picks = ds.curate(links, "smart", 5)
    assert len(picks) == 5


def test_topic_mode_survives_corrupt_tags_and_category():
    # tags: [None, ...] / category: 5 are client data — they used to
    # AttributeError the user's digest every tick.
    links = [
        {"id": "a", "tags": [None, "ml"], "category": "other"},
        {"id": "b", "tags": "not-a-list", "category": 5},
        {"id": "c", "tags": ["cooking"], "category": "Food"},
    ]
    picks = ds.curate(links, "topic", 3, topics=["ml"])
    assert [p["id"] for p in picks] == ["a"]


def test_curate_junk_count_falls_back_to_default():
    now = _now_ms()
    links = [{"id": f"f{i}", "isRead": False, "createdAt": now - i} for i in range(10)]
    assert len(ds.curate(links, "smart", "five")) == 5
    assert len(ds.curate(links, "smart", None)) == 5


def test_normalize_topics_skips_non_strings():
    assert ds._normalize_topics([5, None, " ML "]) == ["ml"]
