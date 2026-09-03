"""PM-1C — a partial capture says so, structurally.

The scraper has always known when it could only read PART of a page (a login
wall, a social-preview teaser, a PDF): it sets ``truncated``. Until now nothing
user-facing read that flag — the old "couldn't read the full text" blockquote
appended into ``detailedSummary`` was removed at the owner's request and must
NOT come back. Instead the signal is carried as a STRUCTURED pair on the link
doc, ``captureQuality: 'partial'`` plus a machine ``captureReason``, which the
client renders as one quiet line in the card's own language.

These tests pin the two halves:
  1. ``scraper`` names WHY every partial read is partial (``capture_reason``),
     and never flags a page it actually read.
  2. ``main._capture_quality`` maps that onto the card fields, writes NOTHING
     for a complete capture (absence means "read fine" — no card is
     retroactively labelled), and never lets an unknown reason through.

Offline: pure helpers plus the same bs4-gated HTML paths as
``test_scraper_honesty``.
"""

import pytest

import main
import scraper


class _FakeResponse:
    """Minimal stand-in for a requests.Response as scrape_url consumes it."""

    def __init__(self, text="", content_type="text/html; charset=utf-8"):
        self.text = text
        self.headers = {"Content-Type": content_type}
        self.ok = True

    def raise_for_status(self):
        return None


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    """Skip DNS/SSRF validation so tests never touch the network."""
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


# ── main._capture_quality — the card fields ──────────────────────────────────

def test_complete_capture_writes_no_fields():
    # The whole point: a card that was read fine carries NO capture fields, so
    # absence is the normal state and nothing old gets labelled by a deploy.
    assert main._capture_quality({}) == {}
    assert main._capture_quality({"truncated": False}) == {}
    # A reason left on a complete read (the platform scrapers always set one) is
    # ignored — `truncated` is the gate.
    assert main._capture_quality({"truncated": False, "capture_reason": "teaser"}) == {}


def test_partial_capture_carries_quality_and_reason():
    assert main._capture_quality({"truncated": True, "capture_reason": "pdf"}) == {
        "captureQuality": "partial",
        "captureReason": "pdf",
    }
    assert main._capture_quality({"truncated": True, "capture_reason": "login_wall"}) == {
        "captureQuality": "partial",
        "captureReason": "login_wall",
    }


def test_missing_or_unknown_reason_falls_back_to_truncated():
    # A partial read whose cause we can't name is still partial — never dropped,
    # and never allowed to write a value the client has no copy for.
    assert main._capture_quality({"truncated": True})["captureReason"] == "truncated"
    assert main._capture_quality(
        {"truncated": True, "capture_reason": "something-new"}
    )["captureReason"] == "truncated"


def test_every_reason_the_scraper_emits_is_a_known_value():
    # Guards the two files drifting apart: a new scraper reason with no client
    # copy would silently degrade to "truncated" instead of failing here.
    assert set(scraper.CAPTURE_REASONS) == {"login_wall", "teaser", "pdf", "truncated"}


# ── scraper.capture_reason — naming WHY ──────────────────────────────────────

def test_pdf_url_reports_the_pdf_reason(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("fetched a .pdf")))
    result = scraper.scrape_url("https://example.com/reports/q3.pdf")
    assert result["capture_reason"] == "pdf"
    assert main._capture_quality(result) == {"captureQuality": "partial", "captureReason": "pdf"}


def test_pdf_content_type_reports_the_pdf_reason(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeResponse(text="%PDF-1.7 ...binary...",
                                                      content_type="application/pdf"))
    result = scraper.scrape_url("https://example.com/download?id=42")
    assert result["capture_reason"] == "pdf"


def test_og_only_preview_reports_the_teaser_reason(monkeypatch):
    pytest.importorskip("bs4")
    html = ("<html><head><title>TikTok</title>"
            "<meta property='og:title' content='Amazing 30-second pasta recipe you must try'>"
            "<meta property='og:description' content='Quick weeknight dinner idea with three ingredients'>"
            "</head><body><div id='app'></div><script>1</script></body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://www.tiktok.com/@chef/video/123")
    assert result["capture_reason"] == "teaser"
    assert main._capture_quality(result)["captureReason"] == "teaser"


def test_js_shell_with_nothing_readable_reports_login_wall(monkeypatch):
    pytest.importorskip("bs4")
    html = ("<html><head><title>Loading…</title></head><body>"
            "<div id='root'></div><script>window.__DATA__={}</script>"
            "</body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://example.com/app")
    assert result["capture_reason"] == "login_wall"


def test_real_article_produces_no_capture_fields(monkeypatch):
    pytest.importorskip("bs4")
    body = "<p>" + ("Real article sentence with plenty of words. " * 10) + "</p>"
    html = f"<html><head><title>A Real Post</title></head><body>{body}</body></html>"
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://example.com/post")
    assert result.get("truncated") is False
    assert main._capture_quality(result) == {}


def test_server_rendered_divs_produce_no_capture_fields(monkeypatch):
    pytest.importorskip("bs4")
    inner = "This page renders its whole article inside div blocks. " * 8
    html = (f"<html><head><title>Div Page</title></head><body>"
            f"<div class='content'>{inner}</div></body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://example.com/divpage")
    assert main._capture_quality(result) == {}


def test_unreadable_result_defaults_to_login_wall_and_keeps_the_placeholder():
    # The exact placeholder body the GROUNDING rule keys on must not drift while
    # the reason rides alongside it.
    r = scraper._unreadable_result("Some page")
    assert r["truncated"] is True
    assert r["capture_reason"] == "login_wall"
    assert r["text"] == "[no text content available]"


# ── The line must never appear on a screenshot card ──────────────────────────

def test_image_bytes_scraped_as_html_would_be_partial(monkeypatch):
    """Why process_link_background gates the stamp on `not is_image`.

    Step 1 of the background pipeline scrapes unconditionally, including for an
    image job whose `url` is the screenshot's Storage URL. Reading image bytes as
    HTML always comes back unreadable, so WITHOUT that gate every screenshot card
    would carry a "couldn't read the full post" line. This test documents the
    trap rather than trusting a comment to hold.
    """
    pytest.importorskip("bs4")
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeResponse(text="\xff\xd8\xff\xe0JFIF binary"))
    result = scraper.scrape_url("https://storage.googleapis.com/b/screenshots/u/x.jpg")
    assert main._capture_quality(result) != {}
