"""Third-party relays and shared captions (launch audit CAP-10, CAP-16).

- X posts are read through api.fxtwitter.com / api.vxtwitter.com. They get
  the post's PATH only: the query string is the sharer's tracking (?s=, ?t=).
- Instagram posts are no longer sent to viewer "bridges" at all.
- The text shared with an Instagram or Facebook link reaches the analysis
  even though share_ingest has already removed the URL from it.
"""

import pytest

import scraper


class _Resp:
    def __init__(self, text="", ok=True, payload=None, status=200, url=""):
        self.text, self.ok, self._payload, self.status_code, self.url = text, ok, payload, status, url
        self.headers = {"Content-Type": "text/html; charset=utf-8"}

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


@pytest.mark.parametrize("url,host,expected", [
    ("https://x.com/jane/status/123?s=20&t=abc", "api.fxtwitter.com", "https://api.fxtwitter.com/jane/status/123"),
    ("https://mobile.twitter.com/jane/status/123?t=q", "api.vxtwitter.com", "https://api.vxtwitter.com/jane/status/123"),
    ("https://www.x.com/jane/status/9#frag", "api.fxtwitter.com", "https://api.fxtwitter.com/jane/status/9"),
    ("https://www.instagram.com/p/ABC/?igsh=xyz&img_index=2", "instagramez.com", "https://www.instagramez.com/p/ABC/"),
    ("https://instagram.com/reel/XYZ?utm_source=ig_web", "kkinstagram.com", "https://kkinstagram.com/reel/XYZ"),
])
def test_relay_urls_carry_the_path_only(url, host, expected):
    assert scraper._relay_url(url, host) == expected


def test_the_x_scraper_sends_no_query_string_to_a_relay(monkeypatch):
    seen = []

    def fake_get(u, **k):
        seen.append(u)
        if "fxtwitter" in u:
            return _Resp(payload={"tweet": {"text": "A post with enough text to count as real content here."}})
        return _Resp(ok=False)

    monkeypatch.setattr(scraper, "safe_get", fake_get)
    monkeypatch.setattr(scraper, "_format_twitter_data", lambda tweet, src: {"text": tweet["text"]})
    scraper._scrape_twitter_url("https://x.com/jane/status/123?s=20&t=sharer-token")
    relays = [u for u in seen if "fxtwitter" in u or "vxtwitter" in u]
    assert relays and all("?" not in u and "sharer-token" not in u for u in relays)


def test_instagram_is_never_sent_to_a_bridge(monkeypatch):
    # The bridges died in October 2026 (one now redirects to an ad network):
    # a thin Instagram read must not reach any third-party host.
    seen = []

    def fake_get(u, **k):
        seen.append(u)
        return _Resp(text="<html><head><title>Instagram</title></head></html>")

    monkeypatch.setattr(scraper, "safe_get", fake_get)
    scraper._scrape_instagram_url("https://www.instagram.com/p/ABC/?igsh=tok")
    assert seen == ["https://www.instagram.com/p/ABC/?igsh=tok"]


def test_an_instagram_caption_reaches_analysis_without_the_url(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(ok=False))
    caption = "Grandma's challah: three rises, egg wash twice, bake at 180."
    r = scraper._scrape_instagram_url("https://www.instagram.com/p/ABC/", message_body=caption)
    assert caption in r["text"]


def test_a_facebook_caption_reaches_analysis_without_the_url(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(ok=False))
    caption = "Our village fair is on Saturday, bring the kids and a picnic."
    r = scraper._scrape_facebook_url("https://www.facebook.com/share/p/abc/", message_body=caption)
    assert caption in r["text"]
