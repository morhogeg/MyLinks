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


def test_posts_url_without_an_underscore_is_refused():
    """Regression, 2026-07-25: this shipped and put post text in the byline.

    `/posts/<authorSlug>_<post-slug>-activity-<id>` — the author is ONLY the
    part before the underscore. Without one the segment is the post's own
    words, and the slug parser happily title-cased them into a "name"
    ("Claude Opus 5 Is Now Available in Perplexity Activity …"), which then
    became the source. LinkedIn blocks the scraper, so the meta path is usually
    empty and this fallback runs first — it has to fail closed.
    """
    url = ("https://www.linkedin.com/posts/"
           "claude-opus-5-is-now-available-in-perplexity-activity-7350000000-abcd")
    assert scraper.linkedin_author_from_url(url) is None


def test_author_slug_before_underscore_still_wins():
    url = ("https://www.linkedin.com/posts/anthropicresearch_"
           "claude-opus-5-is-now-available-in-perplexity-activity-7350000000-abcd")
    assert scraper.linkedin_author_from_url(url) == "Anthropicresearch"


def test_sentence_length_slug_is_refused_on_profile_urls():
    """The token cap catches sentence-shaped slugs on /in/ and /company/ too.

    The cap is 6 tokens, not fewer: real organisations reach that length
    ("European Bank for Reconstruction and Development"), so it only rejects
    what is unambiguously a sentence.
    """
    url = ("https://www.linkedin.com/company/"
           "introducing-three-new-certifications-for-the-claude-partner-network/")
    assert scraper.linkedin_author_from_url(url) is None


def test_six_token_organisation_name_still_passes():
    url = "https://www.linkedin.com/company/european-bank-for-reconstruction-and-development/"
    assert (scraper.linkedin_author_from_url(url)
            == "European Bank for Reconstruction and Development")


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


# ── scraper._linkedin_ldjson_fields ──────────────────────────────────────────

_LDJSON_PAGE = (
    '<html><head><title>x</title>'
    '<script type="application/ld+json">'
    '{"@type": "DiscussionForumPosting", '
    '"author": {"@type": "Person", "name": "Ryan Holiday"}, '
    '"articleBody": "Meditations is perhaps the only document of its kind. '
    'Make sure you pick up the Gregory Hays translation. '
    'Letters from a Stoic by Seneca. Essays by Montaigne."}'
    '</script></head></html>'
)


def test_ldjson_yields_author_and_full_body():
    """Reported 2026-08-22: a Ryan Holiday post card had no byline and a summary
    that died mid-post. og:description is a teaser; the full text and the real
    author name live in the page's JSON-LD."""
    author, body = scraper._linkedin_ldjson_fields(_LDJSON_PAGE)
    assert author == "Ryan Holiday"
    assert "Montaigne" in body  # content from the END of the post survived


def test_ldjson_tolerates_garbage():
    html = '<script type="application/ld+json">{not json</script>'
    assert scraper._linkedin_ldjson_fields(html) == (None, None)


def test_ldjson_ignores_sentence_length_author():
    html = ('<script type="application/ld+json">'
            '{"author": {"name": "' + 'x' * 80 + '"}}</script>')
    author, _ = scraper._linkedin_ldjson_fields(html)
    assert author is None


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


# ── LinkedIn UI chrome is not a name (2026-09-04) ────────────────────────────
# Reported: an Adam Sterling post bylined "See Stanford Law School's activity".
# The logged-out page hands its accessibility copy over where the author name
# used to be, and a personal post RESHARING a company post carries the
# company's label there while the URL slug still names the person who posted.

@pytest.mark.parametrize("wrapped, inner", [
    ("See Stanford Law School's activity", "Stanford Law School"),
    ("See Stanford Law School\u2019s activity", "Stanford Law School"),
    ("View Adam Sterling's profile", "Adam Sterling"),
    ("view adam sterling's posts", "adam sterling"),
    ("Stanford Law School's activity", "Stanford Law School"),
    ("Adam Sterling on LinkedIn", "Adam Sterling"),
])
def test_ui_boilerplate_yields_the_inner_name(wrapped, inner):
    assert scraper.linkedin_ui_boilerplate(wrapped) == inner


@pytest.mark.parametrize("name", ["Adam Sterling", "Stanford Law School", "Claude for Business",
                                  "Seen and Heard Media", "Viewpoint Labs", "", None])
def test_real_names_are_not_boilerplate(name):
    assert scraper.linkedin_ui_boilerplate(name) is None


_RESHARE_PAGE = (
    '<html><head><title>Adam Sterling on LinkedIn: Stanford Law School launches</title>'
    '<meta property="og:title" content="Adam Sterling on LinkedIn: Stanford Law School launches" />'
    '<script type="application/ld+json">'
    '{"@type": "DiscussionForumPosting", '
    '"author": {"@type": "Organization", "name": "See Stanford Law School\'s activity"}, '
    '"articleBody": "Stanford Law School is launching the Legal Engineering Academy."}'
    '</script></head></html>'
)


def test_ldjson_rejects_ui_chrome_as_author():
    author, body = scraper._linkedin_ldjson_fields(_RESHARE_PAGE)
    assert author is None
    assert "Legal Engineering Academy" in body


def test_meta_path_then_names_the_poster_not_the_reshared_company():
    # With the JSON-LD chrome rejected, the "<Author> on LinkedIn:" title wins.
    assert scraper._extract_linkedin_author(_RESHARE_PAGE, "https://www.linkedin.com/posts/adam-sterling_x-activity-1") == "Adam Sterling"


def test_meta_path_rejects_ui_chrome_too():
    html = '<meta property="og:title" content="See Stanford Law School\'s activity on LinkedIn: hello" />'
    got = scraper._extract_linkedin_author(html, "https://www.linkedin.com/posts/adam-sterling_x-activity-1")
    assert got == "Adam Sterling"  # the slug, not the chrome


def test_wrapped_name_is_the_last_resort():
    html = ('<script type="application/ld+json">'
            '{"author": {"name": "See Stanford Law School\'s activity"}}</script>')
    assert scraper._linkedin_wrapped_name(html) == "Stanford Law School"
    assert scraper._linkedin_wrapped_name("<html></html>") is None
