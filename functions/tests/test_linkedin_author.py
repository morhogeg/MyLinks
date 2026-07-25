"""LinkedIn author extraction — stop post text becoming the publisher.

Reported 2026-07-25: a "Claude for Business" company post showed its byline as
"Introducing Three New Certifica…" — the post's own opening line.

The chain was: company-page posts have no "<Author> on LinkedIn:" title (only
personal profiles do), so `_extract_linkedin_author` returned None, and the
caller fell through to the model's `sourceName`, which echoes the post text.

Two layers are covered here, both pure/offline:
  1. scraper.linkedin_author_from_url — the deterministic slug fallback that
     covers company pages, including lowercase joining words.
  2. main._pick_source_name — the guard that refuses the model's guess for
     LinkedIn entirely.
"""

import pytest

import main

pytest.importorskip("bs4")
import scraper


# ── scraper.linkedin_author_from_url ─────────────────────────────────────────

def test_slug_recovers_company_page_name():
    url = "https://www.linkedin.com/posts/claude-for-business_activity-7350000000000000000-abcd"
    assert scraper.linkedin_author_from_url(url) == "Claude for Business"


def test_slug_keeps_joining_words_lowercase():
    url = "https://www.linkedin.com/company/bank-of-america/"
    assert scraper.linkedin_author_from_url(url) == "Bank of America"


def test_slug_capitalises_first_token_even_if_a_small_word():
    url = "https://www.linkedin.com/company/the-economist/"
    assert scraper.linkedin_author_from_url(url) == "The Economist"


def test_slug_drops_trailing_id_hash():
    url = "https://www.linkedin.com/in/omri-zerachovitz-699331b7/"
    assert scraper.linkedin_author_from_url(url) == "Omri Zerachovitz"


def test_slug_ignores_non_linkedin_hosts():
    assert scraper.linkedin_author_from_url("https://example.com/posts/foo-bar") is None


def test_slug_ignores_unknown_linkedin_paths():
    assert scraper.linkedin_author_from_url("https://www.linkedin.com/feed/") is None


def test_slug_survives_a_malformed_url():
    assert scraper.linkedin_author_from_url("not a url") is None


# ── scraper._extract_linkedin_author ─────────────────────────────────────────

def test_meta_author_wins_over_slug():
    """A personal post's real name beats the slug's reconstruction."""
    html = '<meta property="og:title" content="Mark Manson on LinkedIn: my post">'
    url = "https://www.linkedin.com/posts/mark-manson-writer_activity-123"
    assert scraper._extract_linkedin_author(html, url) == "Mark Manson"


def test_company_post_falls_back_to_slug_not_post_text():
    """The regression: og:title IS the post text, so the slug must win."""
    html = (
        '<meta property="og:title" content="Introducing three new certifications '
        'for the Claude Partner Network:">'
    )
    url = "https://www.linkedin.com/posts/claude-for-business_activity-7350000000000000000-abcd"
    assert scraper._extract_linkedin_author(html, url) == "Claude for Business"


def test_returns_none_rather_than_post_text_when_no_slug():
    html = '<meta property="og:title" content="Some long sentence from the post:">'
    assert scraper._extract_linkedin_author(html, "") is None


# ── main._pick_source_name ───────────────────────────────────────────────────

def test_linkedin_never_takes_the_model_guess():
    got = _pick("", "Introducing Three New Certifica…",
                "https://www.linkedin.com/posts/claude-for-business_activity-1")
    assert got is None


def test_linkedin_keeps_a_scraped_name():
    got = _pick("Claude for Business", "Introducing Three New Certifica…",
                "https://www.linkedin.com/posts/claude-for-business_activity-1")
    assert got == "Claude for Business"


def test_non_linkedin_still_accepts_the_model_guess():
    assert _pick("", "Alaxon", "https://www.alaxon.co.il/article") == "Alaxon"


def test_image_capture_has_no_url_and_keeps_the_model_guess():
    assert _pick(None, "Screenshot", "") == "Screenshot"


def _pick(scraped, model, url):
    return main._pick_source_name(scraped or None, model, url)
