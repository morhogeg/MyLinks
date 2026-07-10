"""digest_service pure formatters and channel normalization.

digest_service imports google.cloud.firestore / requests / db at module top;
conftest fakes those offline. The functions tested here are pure (no db/network
calls), so they run directly.
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
    assert ds._normalize_channels(["whatsapp", "email"]) == ["push", "email"]


def test_normalize_channels_preserves_valid_channels():
    assert ds._normalize_channels(["push", "email"]) == ["push", "email"]
    assert ds._normalize_channels(["email"]) == ["email"]


def test_normalize_channels_empty_list_stays_empty():
    # An explicit empty list is distinct from None (None → push default).
    assert ds._normalize_channels([]) == []


# ── _topics_label ─────────────────────────────────────────────────────────

def test_topics_label_empty_defaults_to_library():
    assert ds._topics_label(None) == "your library"
    assert ds._topics_label([]) == "your library"
    assert ds._topics_label(["", "  "]) == "your library"


def test_topics_label_accepts_single_string():
    assert ds._topics_label("AI") == "AI"


def test_topics_label_joins_and_trims_list():
    assert ds._topics_label([" AI ", "Health"]) == "AI, Health"


# ── _cat_emoji ────────────────────────────────────────────────────────────

def test_cat_emoji_unknown_category_uses_default_folder():
    assert ds._cat_emoji("something-not-in-map") == "📂"
    assert ds._cat_emoji("") == "📂"
    assert ds._cat_emoji(None) == "📂"


def test_cat_emoji_matches_known_category_case_insensitively():
    # Every configured mapping should resolve to its own (non-default) emoji.
    for key, emoji in ds.CATEGORY_EMOJI.items():
        assert ds._cat_emoji(key.upper()) == emoji


# ── _link_url ─────────────────────────────────────────────────────────────

def test_link_url_embeds_link_id():
    url = ds._link_url("card42")
    assert url.endswith("?linkId=card42")
    assert url.startswith(ds.APP_URL)


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


# ── format_digest_email ───────────────────────────────────────────────────

CARDS = [
    {
        "id": "c1",
        "title": "First Card",
        "summary": "Summary one.",
        "category": "Tech",
        "sourceName": "CNN",
        "metadata": {"estimatedReadTime": 4},
    },
    {
        "id": "c2",
        "title": "Second Card",
        "summary": "Summary two.",
        "category": "Health",
    },
]


def test_format_digest_email_returns_subject_html_text():
    subject, html_body, text_body = ds.format_digest_email(CARDS, "smart", None, "weekly")
    assert isinstance(subject, str) and isinstance(html_body, str) and isinstance(text_body, str)
    # Subject reflects cadence + card count.
    assert "Weekly" in subject
    assert "2 cards" in subject


def test_format_digest_email_daily_cadence():
    subject, _, _ = ds.format_digest_email(CARDS, "smart", None, "daily")
    assert "Daily" in subject


def test_format_digest_email_body_contains_card_content():
    _, html_body, text_body = ds.format_digest_email(CARDS, "smart", None, "weekly")
    for card in CARDS:
        assert card["title"] in html_body
        assert card["title"] in text_body
        # Each card links back with its id.
        assert f"linkId={card['id']}" in html_body
        assert f"linkId={card['id']}" in text_body


def test_format_digest_email_escapes_html_in_titles():
    dangerous = [{"id": "x", "title": "<script>alert(1)</script>", "summary": "s", "category": "Tech"}]
    _, html_body, _ = ds.format_digest_email(dangerous, "smart", None, "weekly")
    assert "<script>alert(1)</script>" not in html_body
    assert "&lt;script&gt;" in html_body
