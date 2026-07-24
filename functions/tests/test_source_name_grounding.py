"""sourceName grounding — stop the "Machina AI" publisher hallucination.

Two layers are covered here, both pure/offline:
  1. scraper._generic_source_name — deterministic ground truth from a page's
     own meta tags (og:site_name / application-name / twitter:site), falling
     back to the prettified host. Exercised with HTML snippets, no network.
  2. main._ground_source_name — the belt-and-braces sanitizer that rejects any
     candidate naming the assistant/app ("machina") unless the link genuinely
     lives on a Machina host, and swaps in the prettified host (or the image
     "Screenshot" fallback) instead.
"""

import pytest

import main

bs4 = pytest.importorskip("bs4")
import scraper


# ── scraper._generic_source_name / _prettify_domain ──────────────────────────

def _soup(html):
    return bs4.BeautifulSoup(html, "html.parser")


def test_generic_prefers_og_site_name():
    html = '<html><head><meta property="og:site_name" content="Alaxon"></head></html>'
    assert scraper._generic_source_name(_soup(html), "https://www.alaxon.co.il/x") == "Alaxon"


def test_generic_falls_back_to_application_name():
    html = '<html><head><meta name="application-name" content="The Verge"></head></html>'
    assert scraper._generic_source_name(_soup(html), "https://theverge.com/a") == "The Verge"


def test_generic_falls_back_to_twitter_site_handle_without_at():
    html = '<html><head><meta name="twitter:site" content="@nytimes"></head></html>'
    assert scraper._generic_source_name(_soup(html), "https://nytimes.com/a") == "nytimes"


def test_generic_falls_back_to_prettified_host_when_no_meta():
    html = "<html><head><title>An article</title></head></html>"
    assert scraper._generic_source_name(_soup(html), "https://www.alaxon.co.il/deep/path") == "alaxon.co.il"


def test_prettify_domain_strips_www_only_and_does_not_titlecase():
    assert scraper._prettify_domain("https://www.nytimes.com/a") == "nytimes.com"
    assert scraper._prettify_domain("https://alaxon.co.il/") == "alaxon.co.il"


# ── main._ground_source_name / _prettified_host ──────────────────────────────

def test_sanitizer_rejects_machina_ai_and_falls_back_to_host():
    # The reported bug: an alaxon.co.il article whose Gemini sourceName was
    # "Machina AI" must show the domain, never the app's own name.
    assert main._ground_source_name("Machina AI", "https://www.alaxon.co.il/x") == "alaxon.co.il"


def test_sanitizer_rejects_bare_machina_case_insensitively():
    assert main._ground_source_name("machina", "https://nytimes.com/a") == "nytimes.com"
    assert main._ground_source_name("MACHINA ai", "https://nytimes.com/a") == "nytimes.com"


def test_sanitizer_keeps_machina_on_a_real_machina_host():
    # The app legitimately IS the publisher for its own pages.
    got = main._ground_source_name("Machina AI", "https://secondbrain-app-94da2.web.app/p")
    assert got == "Machina AI"


def test_sanitizer_passes_through_a_clean_publisher():
    assert main._ground_source_name("CNN", "https://cnn.com/a") == "CNN"


def test_sanitizer_image_rejection_falls_back_to_screenshot():
    # Image path: no meaningful host, so a rejected candidate becomes the
    # "Screenshot" fallback rather than an empty string.
    assert main._ground_source_name("Machina AI", url="", fallback="Screenshot") == "Screenshot"


def test_sanitizer_empty_candidate_returns_fallback_not_host():
    # A legitimately-absent sourceName keeps prior behaviour (no host injection).
    assert main._ground_source_name(None, "https://cnn.com/a") is None
    assert main._ground_source_name(None, url="", fallback="Screenshot") == "Screenshot"
