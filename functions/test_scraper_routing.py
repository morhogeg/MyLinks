"""
Routing + generic-fallback tests for scraper.scrape_url.

Why: scrape_url dispatches by URL substring to platform-specific scrapers.
That dispatch is exactly what broke when Facebook handling was added, and it's
pure logic we can pin down without any network. We stub each platform scraper
(and requests.get for the generic branch) so the test is fast, offline, and has
no external deps beyond what scraper.py already imports.

Run: python3 test_scraper_routing.py   (exits non-zero on first failure)
"""

import scraper


# ── Test harness (stdlib only, matches the repo's importable-test convention) ──
_failures = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        _failures.append(name)


def _stub_platforms(monkey):
    """Replace every platform scraper with a sentinel-returning stub."""
    for fn, tag in [
        ("_scrape_twitter_url", "twitter"),
        ("_scrape_instagram_url", "instagram"),
        ("_scrape_youtube_url", "youtube"),
        ("_scrape_linkedin_url", "linkedin"),
        ("_scrape_facebook_url", "facebook"),
    ]:
        monkey[fn] = getattr(scraper, fn)
        setattr(scraper, fn, (lambda t: (lambda *a, **k: {"_routed": t}))(tag))


def _restore(monkey):
    for name, original in monkey.items():
        setattr(scraper, name, original)


class _FakeResponse:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


def test_platform_routing():
    print("test_platform_routing")
    monkey = {}
    _stub_platforms(monkey)
    try:
        cases = {
            "twitter": ["https://twitter.com/a/status/1", "https://x.com/a/status/1"],
            "instagram": ["https://www.instagram.com/p/abc/"],
            "youtube": ["https://www.youtube.com/watch?v=x", "https://youtu.be/x"],
            "linkedin": ["https://www.linkedin.com/posts/x"],
            "facebook": [
                "https://www.facebook.com/x/posts/1",
                "https://fb.watch/abc/",
                "https://fb.com/x",
            ],
        }
        for expected, urls in cases.items():
            for u in urls:
                got = scraper.scrape_url(u).get("_routed")
                check(f"{u} -> {expected} (got {got})", got == expected)
    finally:
        _restore(monkey)


def test_generic_fallback_and_caption():
    print("test_generic_fallback_and_caption")
    saved_get = scraper.requests.get
    html = "<html><head><title> Hello World </title></head><body><p>Body text.</p></body></html>"
    scraper.requests.get = lambda *a, **k: _FakeResponse(html)
    try:
        # A non-platform URL hits the BeautifulSoup branch.
        res = scraper.scrape_url("https://example.com/article")
        check("generic title parsed", res.get("title") == "Hello World")
        check("generic body text parsed", "Body text." in res.get("text", ""))

        # message_body caption is folded in as SHARED CAPTION (the regression the
        # generic branch was fixed for).
        res2 = scraper.scrape_url(
            "https://example.com/article",
            message_body="A great recipe https://example.com/article",
        )
        check("caption folded as SHARED CAPTION", "SHARED CAPTION" in res2.get("text", ""))
        check("caption text present", "A great recipe" in res2.get("text", ""))
    finally:
        scraper.requests.get = saved_get


def test_scrape_error_is_swallowed():
    print("test_scrape_error_is_swallowed")
    saved_get = scraper.requests.get

    def _boom(*a, **k):
        raise RuntimeError("network down")

    scraper.requests.get = _boom
    try:
        res = scraper.scrape_url("https://example.com/down")
        check("returns empty dict on error", res == {"html": "", "title": "", "text": ""})
    finally:
        scraper.requests.get = saved_get


if __name__ == "__main__":
    import sys

    test_platform_routing()
    test_generic_fallback_and_caption()
    test_scrape_error_is_swallowed()
    if _failures:
        print(f"\n{len(_failures)} failure(s): {_failures}")
        sys.exit(1)
    print("\nAll scraper routing tests passed.")
