"""Instagram author @handle extraction for the card source tag.

Verifies scraper._extract_instagram_handle / _instagram_source_name pull the
author handle from og:title/description or a profile-scoped URL, and never
invent a bogus handle from a short-code route (/p/, /reel/, …) or a generic
title. Also checks the handle rides out on the scrape result's ``source_name``
(the same field Facebook/LinkedIn use) so the card renders "@handle".

The pure-helper tests need no network/bs4; the scrape_url integration test is
gated on bs4 via ``importorskip``.
"""

import pytest

import scraper


class _FakeResponse:
    def __init__(self, text="", content_type="text/html; charset=utf-8"):
        self.text = text
        self.headers = {"Content-Type": content_type}
        self.ok = True

    def raise_for_status(self):
        return None


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


# ── _valid_ig_handle ─────────────────────────────────────────────────────────

def test_valid_handle_accepts_ig_charset():
    assert scraper._valid_ig_handle("cristiano") == "cristiano"
    assert scraper._valid_ig_handle("@cristiano") == "cristiano"
    assert scraper._valid_ig_handle("nasa.gov_2024") == "nasa.gov_2024"
    assert scraper._valid_ig_handle("a" * 30) == "a" * 30


def test_valid_handle_rejects_bad_or_generic():
    assert scraper._valid_ig_handle("") is None
    assert scraper._valid_ig_handle(None) is None
    assert scraper._valid_ig_handle("has space") is None      # space not allowed
    assert scraper._valid_ig_handle("a" * 31) is None          # too long
    assert scraper._valid_ig_handle("bad-dash") is None        # dash not in charset
    assert scraper._valid_ig_handle("Instagram") is None       # generic label
    assert scraper._valid_ig_handle("login") is None


# ── _extract_instagram_handle: og:title / description patterns ───────────────

def test_extract_from_paren_handle_in_title():
    title = "Cristiano Ronaldo (@cristiano) • Instagram photos and videos"
    assert scraper._extract_instagram_handle("https://instagram.com/p/ABC123/", title) == "cristiano"


def test_extract_from_username_on_instagram():
    desc = "leomessi on Instagram: \"Great match today\""
    assert scraper._extract_instagram_handle("https://instagram.com/reel/XYZ/", desc) == "leomessi"


def test_extract_from_on_instagram_after_separator():
    desc = "1,234 Likes, 56 Comments - natgeo on Instagram: \"A rare sighting\""
    assert scraper._extract_instagram_handle("https://instagram.com/p/ABC/", desc) == "natgeo"


def test_multiword_display_name_yields_no_stray_word():
    # "Cristiano Ronaldo on Instagram" must NOT yield "Ronaldo".
    title = "Cristiano Ronaldo on Instagram"
    assert scraper._extract_instagram_handle("https://instagram.com/p/ABC/", title) is None


def test_generic_title_ignored():
    for t in ("Instagram", "Login • Instagram", "Instagram photos and videos"):
        assert scraper._extract_instagram_handle("https://instagram.com/p/ABC/", t) is None


# ── _extract_instagram_handle: URL fallback ──────────────────────────────────

def test_url_profile_segment_is_used():
    assert scraper._extract_instagram_handle("https://www.instagram.com/cristiano/") == "cristiano"
    # profile-scoped post: first segment is the profile, not the short code.
    assert scraper._extract_instagram_handle("https://instagram.com/cristiano/p/ABC123/") == "cristiano"


def test_url_shortcode_routes_are_not_handles():
    for u in (
        "https://instagram.com/p/ABC123/",
        "https://instagram.com/reel/ABC123/",
        "https://instagram.com/reels/ABC123/",
        "https://instagram.com/tv/ABC123/",
        "https://instagram.com/stories/highlights/999/",
        "https://instagram.com/explore/tags/food/",
    ):
        assert scraper._extract_instagram_handle(u) is None, u


def test_text_pattern_wins_over_url_segment():
    # URL segment "p" is a route, but the title carries the real handle.
    title = "Some Chef (@thehungrychef) • Instagram"
    assert scraper._extract_instagram_handle("https://instagram.com/p/ABC/", title) == "thehungrychef"


# ── _instagram_source_name ───────────────────────────────────────────────────

def test_source_name_prefixes_at_sign_or_none():
    assert scraper._instagram_source_name("https://instagram.com/cristiano/") == "@cristiano"
    assert scraper._instagram_source_name("https://instagram.com/p/ABC/") is None


# ── _extract_instagram_handle: reel-shaped signals ──────────────────────────

def test_extract_date_style_byline():
    # Modern reel byline carries a date, not the literal word "Instagram".
    desc = '2,600 likes, 141 comments - veryshortphilosophy on July 12, 2026: "2600 Years of Philosophy in Two Minutes"'
    assert scraper._extract_instagram_handle("https://instagram.com/reel/ABC/", desc) == "veryshortphilosophy"


def test_date_style_byline_ignores_multiword_display_name():
    # "… - Very Short Philosophy on July 12, 2026" must NOT yield "Philosophy":
    # the token is not anchored to a separator.
    desc = "2,600 likes, 141 comments from Very Short Philosophy on July 12, 2026"
    assert scraper._extract_instagram_handle("https://instagram.com/reel/ABC/", desc) is None


def test_extract_from_embedded_json_username():
    html = '<html><body><script>{"foo":1,"username":"veryshortphilosophy","bar":2}</script></body></html>'
    assert scraper._extract_instagram_handle("https://instagram.com/reel/ABC/", html=html) == "veryshortphilosophy"


def test_extract_from_embedded_json_owner():
    # A stray "username" for the viewer precedes the owner block; the direct
    # "username" key wins first here, but the owner pattern must also resolve.
    html = '<script>{"owner":{"id":"42","username":"natgeo"},"caption":"x"}</script>'
    assert scraper._extract_instagram_handle("https://instagram.com/reel/ABC/", html=html) == "natgeo"


def test_extract_from_og_url_profile_path():
    # og:url carries the profile-scoped path even though the reel URL doesn't.
    assert scraper._extract_instagram_handle(
        "https://instagram.com/reel/ABC/",
        og_url="https://www.instagram.com/veryshortphilosophy/reel/ABC/",
    ) == "veryshortphilosophy"


def test_og_url_shortcode_path_is_not_a_handle():
    assert scraper._extract_instagram_handle(
        "https://instagram.com/reel/ABC/",
        og_url="https://www.instagram.com/reel/ABC/",
    ) is None


def test_reel_with_no_author_signal_returns_none():
    # Title only, no handle anywhere, short-code URL → no bogus handle.
    title = "2600 Years of Philosophy in Two Minutes"
    assert scraper._extract_instagram_handle("https://instagram.com/reel/ABC/", title) is None
    assert scraper._instagram_source_name("https://instagram.com/reel/ABC/", title) is None


def test_source_name_never_raises():
    # Extraction is wrapped: even a non-string text degrades to None.
    assert scraper._instagram_source_name("https://instagram.com/reel/ABC/", 12345) is None


# ── scrape_url integration (needs bs4) ───────────────────────────────────────

def test_scrape_url_sets_instagram_source_name(monkeypatch):
    pytest.importorskip("bs4")
    html = (
        "<html><head>"
        "<meta property='og:title' content='Cristiano Ronaldo (@cristiano) • Instagram photos and videos'>"
        "<meta property='og:description' content='" + ("Amazing goal celebration with the whole team. " * 4) + "'>"
        "</head><body></body></html>"
    )
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://www.instagram.com/p/ABC123/")
    assert result["source_name"] == "@cristiano"


def test_scrape_reel_source_name_from_description_byline(monkeypatch):
    # Reel: og:title is just the caption (no handle); the author only appears in
    # the og:description byline. The scrape result must still tag the @handle,
    # proving the description is passed to source-name extraction.
    pytest.importorskip("bs4")
    desc = ('2,600 likes, 141 comments - veryshortphilosophy on July 12, 2026: '
            '"2600 Years of Philosophy in Two Minutes. ' + ("More text. " * 8) + '"')
    html = (
        "<html><head>"
        "<meta property='og:title' content='2600 Years of Philosophy in Two Minutes'>"
        "<meta property='og:description' content='" + desc + "'>"
        "</head><body></body></html>"
    )
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://www.instagram.com/reel/ABC123/")
    assert result["source_name"] == "@veryshortphilosophy"
