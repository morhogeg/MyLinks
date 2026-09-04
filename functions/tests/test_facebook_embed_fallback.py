"""Facebook: the public embed plugin as a second source for partial reads.

Facebook serves a JS login wall to server-side fetches, so the post page only
ever yields Open Graph tags — and ``og:description`` is cut at ~2 lines with an
ellipsis. That is the whole reason recipe/itinerary posts saved as partial
cards. The official embed plugin (``/plugins/post.php``) renders a PUBLIC
post's body without a login, so ``_scrape_facebook_url`` now tries it exactly
when the meta read was empty or truncated, and keeps the og read otherwise.

Offline: ``safe_get`` is routed by URL to canned responses. NOT a live
verification of Facebook's current markup — the parser looks for the three
body containers the plugin has used (``data-testid="post_message"``,
``userContent``, ``_5pbx``) and degrades to "" on anything else.
"""

import pytest

pytest.importorskip("bs4")
import scraper


class _Resp:
    def __init__(self, text="", ok=True):
        self.text = text
        self.ok = ok
        self.headers = {"Content-Type": "text/html; charset=utf-8"}
        self.url = ""

    def raise_for_status(self):
        return None


POST_URL = "https://www.facebook.com/crispykitchens/posts/pfbid0abc"

_OG_PAGE = (
    '<html><head>'
    '<meta property="og:title" content="Crispy Kitchens - פשוט טעימה" />'
    '<meta property="og:description" content="מתכון לכבדי עוף: ½ קילו כבדי עוף נקיים, ¼ כוס שמן, כף סוכר..." />'
    '</head><body></body></html>'
)

_EMBED_PAGE = (
    '<html><body><div class="_5pcr userContentWrapper">'
    '<div data-testid="post_message" class="_5pbx userContent">'
    '<p>מתכון לכבדי עוף: ½ קילו כבדי עוף נקיים, ¼ כוס שמן, כף סוכר חום או לבן, 2 בצלים חתוכים לרצועות.</p>'
    '<p>מטגנים את הבצל עד הזהבה, מוסיפים סוכר ומקרמלים. מוסיפים את הכבדים ומטגנים 4 דקות מכל צד.</p>'
    '<p>מגישים עם אורז לבן. בתיאבון!</p>'
    '</div></div></body></html>'
)

_WALL_PAGE = (
    '<html><body><div data-testid="post_message">'
    'Log into Facebook to start sharing and connecting with your friends, family, and people you know.'
    '</div></body></html>'
)


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


def _route(monkeypatch, embed):
    """safe_get stub: the post page yields the truncated og read; the plugin
    URL yields `embed` (a response, or an exception to raise)."""
    calls = []

    def fake_get(url, **kw):
        calls.append(url)
        if "/plugins/post.php" in url:
            if isinstance(embed, Exception):
                raise embed
            return embed
        return _Resp(_OG_PAGE)

    monkeypatch.setattr(scraper, "safe_get", fake_get)
    return calls


def test_embed_body_replaces_the_truncated_preview(monkeypatch):
    calls = _route(monkeypatch, _Resp(_EMBED_PAGE))
    r = scraper._scrape_facebook_url(POST_URL)
    assert any("/plugins/post.php" in c for c in calls)
    # The END of the post (the steps, the serving line) reached the text.
    assert "בתיאבון" in r["text"]
    assert "מקרמלים" in r["text"]
    # No longer a partial read: the card must not carry the screenshot nudge.
    assert r["truncated"] is False
    # The fragment is not fed to the model twice.
    assert "POST CAPTION:" not in r["text"]
    assert r["source_name"] == "Crispy Kitchens - פשוט טעימה"


def test_login_wall_from_the_plugin_keeps_the_partial_read(monkeypatch):
    _route(monkeypatch, _Resp(_WALL_PAGE))
    r = scraper._scrape_facebook_url(POST_URL)
    assert r["truncated"] is True
    assert "כף סוכר..." in r["text"]
    assert "Log into Facebook" not in r["text"]


def test_plugin_failure_is_silent(monkeypatch):
    _route(monkeypatch, RuntimeError("blocked"))
    r = scraper._scrape_facebook_url(POST_URL)
    assert r["truncated"] is True
    assert "כף סוכר..." in r["text"]


def test_complete_meta_read_never_calls_the_plugin(monkeypatch):
    full = _OG_PAGE.replace("כף סוכר...", "כף סוכר, 2 בצלים. מטגנים ומגישים.")
    calls = []

    def fake_get(url, **kw):
        calls.append(url)
        return _Resp(full)

    monkeypatch.setattr(scraper, "safe_get", fake_get)
    r = scraper._scrape_facebook_url(POST_URL)
    assert r["truncated"] is False
    assert not any("/plugins/post.php" in c for c in calls)


def test_embed_parser_handles_missing_body_and_see_more():
    assert scraper._facebook_embed_text.__doc__  # exists
    html = '<div class="userContent"><p>Short post.</p><p>See more</p></div>'
    # Route directly: only the plugin URL is fetched here.
    scraper_get = scraper.safe_get
    try:
        scraper.safe_get = lambda url, **kw: _Resp(html)
        assert scraper._facebook_embed_text(POST_URL) == "Short post."
        scraper.safe_get = lambda url, **kw: _Resp("<html><body>nothing</body></html>")
        assert scraper._facebook_embed_text(POST_URL) == ""
        scraper.safe_get = lambda url, **kw: _Resp("", ok=False)
        assert scraper._facebook_embed_text(POST_URL) == ""
    finally:
        scraper.safe_get = scraper_get
