"""Adversarial regressions for scraper.py: malformed API payloads, hostile
URLs, SSRF boundary cases, and honesty on total extraction failure.

Offline: network is never touched — `safe_get` (and, for the SSRF tests,
`socket.getaddrinfo`) are monkeypatched. bs4-dependent paths use importorskip
(bs4 is installed in CI).
"""

import pytest

import scraper


class _FakeResponse:
    def __init__(self, text="", content_type="text/html; charset=utf-8", ok=True):
        self.text = text
        self.headers = {"Content-Type": content_type}
        self.ok = ok

    def raise_for_status(self):
        return None

    def json(self):
        import json as _json
        return _json.loads(self.text)


# ── Twitter formatters: JSON-null fields (deleted/suspended accounts) ───────

def test_twitter_null_author_keeps_tweet_text():
    # author: null used to AttributeError, and the outer except then discarded
    # the ENTIRE tweet — total data loss from one null field.
    r = scraper._format_twitter_data({"text": "hello world", "author": None}, "fxtwitter")
    assert "hello world" in r["text"]
    assert "Unknown" in r["text"]


def test_twitter_null_quote_author_keeps_both_texts():
    r = scraper._format_twitter_data(
        {"text": "top text", "quote": {"author": None, "text": "quoted"}}, "fxtwitter")
    assert "top text" in r["text"] and "quoted" in r["text"]


def test_vxtwitter_null_media_urls_with_extended_media():
    # The caller's truthy gate passes via media_extended, then
    # len(None) crashed on the null mediaURLs key.
    r = scraper._format_vxtwitter_data(
        {"text": "x" * 200, "mediaURLs": None, "media_extended": [1]})
    assert "1 Media Item" in r["text"]


def test_vxtwitter_empty_payload_leaks_no_none():
    r = scraper._format_vxtwitter_data({})
    assert "None" not in r["title"]
    assert "(@unknown)" in r["text"]


# ── Twitter API URL rewrite (host swap, not substring replace) ──────────────

def test_twitter_api_url_swaps_host_only(monkeypatch):
    fetched = []

    def record(url, **kwargs):
        fetched.append(url)
        raise RuntimeError("stop after recording")

    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)
    monkeypatch.setattr(scraper, "safe_get", record)
    scraper.scrape_url("https://mobile.twitter.com/user/status/123?ref=twitter.com")
    # mobile.twitter.com used to become mobile.api.fxtwitter.com (a dead host),
    # and the twitter.com inside the query string got mangled too.
    assert fetched[0].startswith("https://api.fxtwitter.com/")
    assert "ref=twitter.com" in fetched[0]
    assert "mobile.api" not in fetched[0]


# ── Dispatch guard: hostile lookalike hosts stay in the generic branch ──────

def test_host_spoof_does_not_hijack_platform_branch(monkeypatch):
    pytest.importorskip("bs4")
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)
    html = "<html><head><title>Evil</title></head><body><p>" + "content words here " * 10 + "</p></body></html>"
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=html))
    result = scraper.scrape_url("https://instagram.com.evil.test/p/x")
    # Generic branch (no source_name key) — the IG branch would set one.
    assert "source_name" not in result
    assert "content words here" in result["text"]


# ── LinkedIn: honest degradation instead of raw markup ──────────────────────

def test_linkedin_js_shell_degrades_honestly(monkeypatch):
    pytest.importorskip("bs4")
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)
    shell = ("<html><head><title>LinkedIn</title></head><body>"
             "<div id='app'></div><script>var x=1;</script></body></html>")
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=shell))
    result = scraper.scrape_url("https://www.linkedin.com/posts/someone_activity-1")
    # The old `text or html[:5000]` fallback fed raw markup to the model.
    assert "<script" not in result["text"]
    assert result["text"] == "[no text content available]"
    assert result["truncated"] is True


# ── Instagram: total failure must not fabricate content ─────────────────────

def test_instagram_total_failure_uses_grounding_placeholder(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("net down")))
    result = scraper.scrape_url("https://www.instagram.com/reel/ABC123/")
    # The old fabricated "Instagram content (metadata extraction failed)" body
    # passed the readability threshold and got confidently "summarized".
    assert result["text"] == "[no text content available]"
    assert result["truncated"] is True


def test_instagram_owner_username_beats_first_bare_username():
    # IG pages embed viewer/commenter usernames before the owner block; the
    # bare "username" pattern used to win and mis-attribute the card.
    html = '{"viewer":{"username":"some_viewer"},"owner":{"id":"1","username":"natgeo"}}'
    assert scraper._extract_instagram_handle(
        "https://www.instagram.com/reel/X/", html=html) == "natgeo"


# ── Facebook og:title splitting ─────────────────────────────────────────────

def test_fb_title_pipe_inside_caption_is_not_an_author():
    # "Buy 1 | Get 1 free deal today | Facebook": the trailing segment used to
    # become a bogus byline and the leftover "Buy 1" stub then failed the
    # real-caption check — the whole caption vanished.
    caption, author = scraper._clean_fb_title("Buy 1 | Get 1 free deal today | Facebook")
    assert caption == "Buy 1 | Get 1 free deal today"
    assert author is None


def test_fb_title_real_author_still_splits():
    caption, author = scraper._clean_fb_title("My trip itinerary for Japan | John Traveler | Facebook")
    assert caption == "My trip itinerary for Japan"
    assert author == "John Traveler"


def test_fb_title_empty_input():
    assert scraper._clean_fb_title(None) == ("", None)
    assert scraper._looks_like_fb_login_wall(None) is False


# ── YouTube id extraction ───────────────────────────────────────────────────

def test_youtube_id_rejects_over_length_tokens():
    # A 12-char token used to silently truncate to its first 11 chars and
    # fabricate a watch_url/thumbnail for a WRONG video.
    assert scraper._extract_youtube_id("https://youtu.be/abcdefghijkl") is None
    assert scraper._extract_youtube_id("https://www.youtube.com/watch?v=abcdefghijkl") is None


def test_youtube_id_accepts_all_supported_shapes():
    vid = "dQw4w9WgXcQ"
    for u in (f"https://youtu.be/{vid}",
              f"https://www.youtube.com/watch?v={vid}",
              f"https://www.youtube.com/shorts/{vid}",
              f"https://www.youtube.com/embed/{vid}",
              f"https://www.youtube.com/live/{vid}",
              f"https://www.youtube.com/v/{vid}"):
        assert scraper._extract_youtube_id(u) == vid
    assert scraper._extract_youtube_id("https://example.com/") is None


# ── Shared-caption budget ───────────────────────────────────────────────────

def test_shared_caption_cannot_blow_past_text_budget(monkeypatch):
    pytest.importorskip("bs4")
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)
    page = "<html><body><p>" + ("word " * 2000) + "</p></body></html>"
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(text=page))
    url = "https://example.com/a"
    result = scraper.scrape_url(url, message_body=url + " " + ("caption " * 5000))
    # Page slice (5000) + capped caption (2000) + scaffolding — bounded, where
    # it used to exceed 20k.
    assert len(result["text"]) <= 5000 + 2000 + 100


# ── SSRF guard boundaries ───────────────────────────────────────────────────

def _pin_dns(monkeypatch, ip):
    monkeypatch.setattr(scraper.socket, "getaddrinfo",
                        lambda host, port: [(2, 1, 6, "", (ip, 0))])


@pytest.mark.parametrize("ip", [
    "100.64.0.1",       # CGNAT shared space — no negative flag, not global
    "169.254.169.254",  # cloud metadata
    "10.0.0.5",         # RFC1918
    "127.0.0.1",        # loopback
    "::ffff:127.0.0.1", # v4-mapped loopback
])
def test_validate_public_url_blocks_non_global(monkeypatch, ip):
    _pin_dns(monkeypatch, ip)
    with pytest.raises(scraper.UnsafeURLError):
        scraper.validate_public_url("http://h.example/")


def test_validate_public_url_allows_global(monkeypatch):
    _pin_dns(monkeypatch, "93.184.216.34")
    scraper.validate_public_url("http://h.example/")  # must not raise


def test_validate_public_url_userinfo_trick_checks_real_host(monkeypatch):
    # http://trusted@169.254.169.254/ must validate the REAL host.
    _pin_dns(monkeypatch, "169.254.169.254")
    with pytest.raises(scraper.UnsafeURLError):
        scraper.validate_public_url("http://trusted.example@h.example/")


@pytest.mark.parametrize("url", [
    "javascript:alert(1)",
    "ftp://example.com/x",
    "//example.com/x",       # scheme-relative
    "http:///path",          # no host
    "",
    None,
])
def test_validate_public_url_rejects_non_http_shapes(url):
    with pytest.raises(scraper.UnsafeURLError):
        scraper.validate_public_url(url)


def test_scrape_url_malformed_inputs_return_empty(monkeypatch):
    # None/empty/int inputs degrade to the empty result, never raise.
    for bad in (None, "", 12345):
        result = scraper.scrape_url(bad)
        assert result == {"html": "", "title": "", "text": ""}
