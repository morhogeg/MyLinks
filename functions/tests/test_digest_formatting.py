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


# ── normalize_mode: every stored mode resolves to the one curation ────────

def test_normalize_mode_maps_every_stored_mode_to_smart():
    # The three that used to be pickable, the three retired before them, the
    # legacy synthesis style, and junk — all one curation now.
    for stored in ("smart", "topic", "rediscover", "synthesis",
                   "random", "unread", "favorites", "bogus", "", None):
        assert ds.normalize_mode(stored) == ds.DIGEST_MODE == "smart"


# ── the legacy synthesis encoding is read RAW, not through normalize_mode ──

def test_legacy_synthesis_mode_detected_from_the_raw_stored_value():
    # A workspace that predates the synthesis_enabled toggle still encodes the
    # weekly recap as digest_mode == 'synthesis'. normalize_mode collapses that
    # to 'smart', so the check has to read what is actually stored — otherwise
    # these users silently lose their recap.
    assert ds.is_legacy_synthesis_mode({"digest_mode": "synthesis"}) is True
    assert ds._synthesis_enabled({"digest_mode": "synthesis"}) is True


def test_non_synthesis_modes_are_not_legacy_synthesis():
    for stored in ("smart", "topic", "rediscover", "random", "", None):
        assert ds.is_legacy_synthesis_mode({"digest_mode": stored}) is False
    assert ds.is_legacy_synthesis_mode({}) is False
    # The dedicated toggle still turns it on by itself.
    assert ds._synthesis_enabled({"synthesis_enabled": True}) is True
    assert ds._synthesis_enabled({"digest_mode": "smart"}) is False


# ── curate: one curation, backlog + older saves ───────────────────────────

def _links(n=6):
    # n cards, staggered createdAt so the curation has material to sort.
    now_ms = 1_700_000_000_000
    return [
        {"id": f"c{i}", "title": f"Card {i}", "status": "active",
         "createdAt": now_ms - i * 86_400_000, "isRead": False}
        for i in range(n)
    ]


def test_curate_returns_the_requested_count_of_real_cards():
    links = _links()
    picks = ds.curate(links, 3)
    assert len(picks) == 3
    assert all(p["id"] in {l["id"] for l in links} for p in picks)
    # No duplicates: a card is never dealt twice into one digest.
    assert len({p["id"] for p in picks}) == 3


def test_curate_never_surfaces_archived_cards():
    links = _links()
    links[0]["status"] = "archived"
    picks = ds.curate(links, 6)
    assert all(p["id"] != "c0" for p in picks)


def test_curate_handles_an_empty_library_and_clamps_the_count():
    assert ds.curate([], 5) == []
    # Fewer cards than asked for: return what exists, don't pad or crash.
    assert len(ds.curate(_links(2), 5)) == 2
    # A junk count falls back to the default rather than raising.
    assert len(ds.curate(_links(), None)) == 5


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
