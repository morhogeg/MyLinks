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
