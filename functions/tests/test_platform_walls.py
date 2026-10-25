"""Instagram's login page and TikTok's app shell are never read as the post
(2026-10-25: every Instagram and TikTok share became an "Instagram Login Page"
/ "TikTok video content" card), and the post as read on the phone
(`pagePreview`, sent by the iOS share extension) fills the card instead."""

import pytest

pytest.importorskip("bs4", reason="the scrapers parse HTML with BeautifulSoup")

import scraper


class _Resp:
    def __init__(self, text="", ok=True, url=""):
        self.text, self.ok, self.url, self.status_code = text, ok, url, 200 if ok else 403
        self.headers = {"Content-Type": "text/html; charset=utf-8"}


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


# What Instagram served our Cloud Functions on 2026-10-25 (task_logs).
IG_LOGIN_PAGE = """<html><head><title>Instagram</title>
<meta property="og:title" content="Login • Instagram">
<meta property="og:description" content="Welcome back to Instagram. Sign in to check out what your friends, family &amp; interests have been capturing &amp; sharing around the world.">
<meta property="og:image" content="https://static.cdninstagram.com/rsrc.php/logo.png">
</head><body>"username":"instagram"</body></html>"""

IG_PHONE_READ = {
    "title": 'Apoorva on Instagram: "Crispy spicy jowar roti fry- perfect evening snack"',
    "description": '6,346 likes, 9 comments - nann.recipe on September 3, 2026: "Crispy spicy jowar roti fry- perfect evening snack. Ingredients: jowar roti, oil, mustard seeds"',
    "image": "https://scontent.cdninstagram.com/v/t51/poster.jpg?stp=dst-jpg",
    "url": "https://www.instagram.com/nann.recipe/reel/Dc0zAdzh7te/",
}

# TikTok's shell as a server gets it: the data block without the video.
TT_SHELL = """<html><head><title>TikTok - Make Your Day</title>
<meta property="og:description" content="Watch this video on TikTok">
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.app-context":{}}}</script>
</head></html>"""

TT_FULL = """<html><head><title>TikTok - Make Your Day</title>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":{"desc":"One Pot Creamy Chicken Pasta. Full recipe on my website.","author":{"uniqueId":"dadsfoodtoday","nickname":"Dad's Food"},"video":{"cover":"https://p16-common-sign.tiktokcdn.com/cover.jpg"}}}}}}</script>
</head></html>"""


@pytest.mark.parametrize("title,desc,walled", [
    ("Login • Instagram", "Welcome back to Instagram. Sign in to check out what your friends, family & interests", True),
    ("Instagram", "Create an account or log in to Instagram - A simple, fun & creative way to capture", True),
    ("Instagram", "", True),
    ("Instagram", "120 likes - jane on Instagram: \"Lunch\"", False),
    ("jane on Instagram", "How I finally log in to Instagram less: a thread about screen time", False),
])
def test_login_wall_detection(title, desc, walled):
    assert scraper._looks_like_ig_login_wall(title, desc) is walled


def test_instagram_login_page_is_an_honest_partial_card(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(IG_LOGIN_PAGE))
    r = scraper._scrape_instagram_url("https://www.instagram.com/reel/Dc0zAdzh7te/")
    assert r["truncated"] is True and r["capture_reason"] == "login_wall"
    assert "Welcome back" not in str(r) and "logo.png" not in str(r)
    assert r["source_name"] in (None, "Instagram")  # never "@instagram" off the login page


def test_instagram_login_page_with_phone_read_is_the_post(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(IG_LOGIN_PAGE))
    r = scraper._scrape_instagram_url("https://www.instagram.com/reel/Dc0zAdzh7te/",
                                      page_preview=IG_PHONE_READ)
    assert "jowar roti" in r["text"]
    assert not r.get("truncated")
    assert r["source_name"] == "@nann.recipe"
    assert r["image_urls"] == []                                  # a reel: banner only
    assert r["video_thumbnail_url"].startswith("https://scontent.cdninstagram.com/")


def test_instagram_server_read_wins_over_the_phone(monkeypatch):
    page = ('<html><head><meta property="og:title" content="jane on Instagram">'
            '<meta property="og:description" content="1,000 likes - jane on Instagram: '
            '&quot;The real caption the server read, long enough&quot;"></head></html>')
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(page))
    r = scraper._scrape_instagram_url("https://www.instagram.com/p/ABC/", page_preview=IG_PHONE_READ)
    assert "server read" in r["text"] and "jowar" not in r["text"]


def test_instagram_login_page_with_shared_caption_is_still_partial(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(IG_LOGIN_PAGE))
    r = scraper._scrape_instagram_url("https://www.instagram.com/p/ABC/",
                                      message_body="Grandma's challah, three rises")
    assert "challah" in r["text"]
    assert r["truncated"] is True and r["capture_reason"] == "login_wall"


def test_a_phone_read_that_is_itself_the_login_page_is_ignored(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(IG_LOGIN_PAGE))
    r = scraper._scrape_instagram_url("https://www.instagram.com/p/ABC/", page_preview={
        "title": "Login • Instagram",
        "description": "Welcome back to Instagram. Sign in to check out what your friends, family & interests"})
    assert r["capture_reason"] == "login_wall" and "Welcome back" not in str(r)


def test_tiktok_links_use_the_tiktok_reader(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get",
                        lambda u, **k: _Resp(TT_SHELL, url="https://www.tiktok.com/@dadsfoodtoday/video/766"))
    r = scraper.scrape_url("https://vt.tiktok.com/ZSgx3txGb/")
    assert r["title"] != "TikTok - Make Your Day"
    assert r["truncated"] is True and r["capture_reason"] == "login_wall"
    assert r["source_name"] == "@dadsfoodtoday"   # from the landed URL
    assert "Watch this video" not in r["text"]


def test_tiktok_phone_read_fills_the_card(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(TT_SHELL, url="https://www.tiktok.com/@x/video/1"))
    r = scraper.scrape_url("https://vt.tiktok.com/ZSgx3txGb/", page_preview={
        "description": "Here is my One Pot Creamy Chicken Pasta Dinner, full recipe on my website.",
        "author": "dadsfoodtoday", "authorName": "Dad's Food",
        "image": "https://p16-common-sign.tiktokcdn.com/cover.jpg"})
    assert "Chicken Pasta" in r["text"] and not r.get("truncated")
    assert r["title"].startswith("Here is my One Pot")
    assert r["source_name"] == "@dadsfoodtoday"
    assert r["video_thumbnail_url"] == "https://p16-common-sign.tiktokcdn.com/cover.jpg"
    assert r["image_urls"] == []


def test_tiktok_page_data_is_read_when_served(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get", lambda u, **k: _Resp(TT_FULL, url="https://www.tiktok.com/@dadsfoodtoday/video/1"))
    r = scraper._scrape_tiktok_url("https://www.tiktok.com/@dadsfoodtoday/video/1")
    assert "One Pot Creamy" in r["text"] and "Dad's Food (@dadsfoodtoday)" in r["text"]
    assert r["video_thumbnail_url"].endswith("cover.jpg")


# ── share_ingest's sanitizer for the phone's read (main._clean_page_preview) ──

def test_page_preview_is_kept_for_instagram_and_tiktok_only():
    import main
    ig = main._clean_page_preview(dict(IG_PHONE_READ), "https://www.instagram.com/reel/X/")
    assert ig["description"] == IG_PHONE_READ["description"]
    assert ig["image"] == IG_PHONE_READ["image"]
    assert main._clean_page_preview({"description": "x" * 50}, "https://vt.tiktok.com/ZS/")
    assert main._clean_page_preview(dict(IG_PHONE_READ), "https://example.com/a") is None
    assert main._clean_page_preview("not a dict", "https://www.instagram.com/p/X/") is None
    assert main._clean_page_preview({"image": "https://scontent.cdninstagram.com/a.jpg"},
                                    "https://www.instagram.com/p/X/") is None   # no text: nothing


def test_page_preview_drops_foreign_images_and_urls_and_bounds_text():
    import main
    out = main._clean_page_preview({
        "description": "y" * 20000,
        "image": "https://evil.example/track.jpg",
        "url": "https://instagram.com.evil.example/p/X/",
        "author": 123,
    }, "https://www.instagram.com/p/X/")
    assert "image" not in out and "url" not in out and "author" not in out
    assert len(out["description"]) == 5000
    assert "image" not in main._clean_page_preview(
        {"description": "ok caption", "image": "http://scontent.cdninstagram.com/a.jpg"},
        "https://www.instagram.com/p/X/")                                          # https only
