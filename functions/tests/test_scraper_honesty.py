"""Content-type / capture-integrity honesty tests for scraper.scrape_url.

These verify the scraper degrades HONESTLY on content it cannot actually read
(PDFs, JS shells, gated/empty pages) instead of feeding raw markup to the model
and producing a confident junk summary. The honest signal is the SAME channel
Facebook uses: a ``truncated`` flag plus the exact ``[no text content
available]`` placeholder body that the GROUNDING prompt rule recognizes.

Offline: the PDF and pure-helper paths need no network/bs4 and always run; the
HTML-parsing paths are gated on bs4 (installed in CI) via ``importorskip``.
"""

import pytest

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


# ── Pure helpers ─────────────────────────────────────────────────────────────

def test_readable_len_ignores_whitespace_and_scaffolding():
    assert scraper._readable_len(None) == 0
    assert scraper._readable_len("   \n\t  ") == 0
    # The "SHARED CAPTION:" label and "---" rule are scaffolding, not content.
    assert scraper._readable_len("SHARED CAPTION:\n---\n") == 0
    assert scraper._readable_len("hello world") == 10


def test_unreadable_result_is_flagged_and_uses_grounding_placeholder():
    r = scraper._unreadable_result("PDF document")
    assert r["truncated"] is True
    # EXACT string the GROUNDING rule keys on — must not drift.
    assert r["text"] == "[no text content available]"
    assert r["title"] == "PDF document"
    assert r["html"] == ""


# ── PDF detection (no bs4 / no fetch needed) ─────────────────────────────────

def test_pdf_url_degrades_before_any_fetch(monkeypatch):
    # If we ever fetched, this would explode — proving .pdf is caught up front.
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("fetched a .pdf")))
    result = scraper.scrape_url("https://example.com/reports/q3.pdf")
    assert result["truncated"] is True
    assert result["text"] == "[no text content available]"


def test_pdf_url_with_query_and_caps_still_degrades(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("fetched a .pdf")))
    result = scraper.scrape_url("https://example.com/DOC.PDF?download=1")
    assert result["truncated"] is True


def test_pdf_content_type_degrades(monkeypatch):
    # URL doesn't end in .pdf, but the server serves application/pdf.
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeResponse(text="%PDF-1.7 ...binary...",
                                                      content_type="application/pdf"))
    result = scraper.scrape_url("https://example.com/download?id=42")
    assert result["truncated"] is True
    assert result["text"] == "[no text content available]"


# ── HTML-parsing paths (need bs4 — installed in CI) ──────────────────────────

def test_real_article_is_not_flagged_truncated(monkeypatch):
    pytest.importorskip("bs4")
    body = "<p>" + ("Real article sentence with plenty of words. " * 10) + "</p>"
    html = f"<html><head><title>A Real Post</title></head><body>{body}</body></html>"
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://example.com/post")
    assert result.get("truncated") is False
    assert "Real article sentence" in result["text"]
    assert result["title"] == "A Real Post"


def test_js_shell_with_no_readable_text_degrades_honestly(monkeypatch):
    pytest.importorskip("bs4")
    # A JS shell: no <p>, no meaningful body text, no og tags — just a script.
    html = ("<html><head><title>Loading…</title></head><body>"
            "<div id='root'></div><script>window.__DATA__={}</script>"
            "</body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://example.com/app")
    assert result["truncated"] is True
    assert result["text"] == "[no text content available]"


def test_og_only_preview_is_used_but_flagged_truncated(monkeypatch):
    pytest.importorskip("bs4")
    # TikTok-style JS shell: no article body, but a social-preview caption in og
    # tags. We use the teaser (better than nothing) but flag it truncated.
    html = ("<html><head><title>TikTok</title>"
            "<meta property='og:title' content='Amazing 30-second pasta recipe you must try'>"
            "<meta property='og:description' content='Quick weeknight dinner idea with three ingredients'>"
            "</head><body><div id='app'></div><script>1</script></body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://www.tiktok.com/@chef/video/123")
    assert result["truncated"] is True
    assert "pasta recipe" in result["text"]


def test_server_rendered_divs_are_treated_as_real_body(monkeypatch):
    pytest.importorskip("bs4")
    # Content lives in <div>s, not <p> — the body-text fallback should recover it
    # as genuine content and NOT flag truncated.
    inner = "This page renders its whole article inside div blocks. " * 8
    html = (f"<html><head><title>Div Page</title></head><body>"
            f"<div class='content'>{inner}</div></body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://example.com/divpage")
    assert result.get("truncated") is False
    assert "article inside div blocks" in result["text"]
