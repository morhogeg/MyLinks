"""Tests for pulling in-post images into the summary (X + Instagram photos).

Three layers are covered:
  1. The Twitter/X scraper formatters SURFACE the post's photo URLs as
     ``image_urls`` (fxtwitter + vxtwitter shapes) — previously they were dropped
     and only a "[Contains N Image(s)]" placeholder reached the model.
  2. The Instagram scraper surfaces the post's cover photo (og:image) as
     ``image_urls`` for PHOTO posts only — reels/IGTV (video, poster-frame only)
     and login-walled scrapes stay text-only.
  3. ``main._analyze_scraped`` routes a post-with-images through the SINGLE
     multimodal vision call, and degrades to the text-only card if the fetch or
     the vision call fails — an image must never break a working save.

All offline: no network, no Gemini, no Firebase.
"""

import pytest

import scraper


# ── Layer 1: formatters surface image_urls ───────────────────────────────────

def test_fxtwitter_formatter_surfaces_photo_urls():
    tweet = {
        "text": "Messi vs Ronaldo, by the numbers",
        "author": {"name": "Touchline", "screen_name": "touchlinex"},
        "media": {"photos": [
            {"url": "https://pbs.twimg.com/media/a.jpg", "type": "photo"},
            {"url": "https://pbs.twimg.com/media/b.jpg", "type": "photo"},
        ]},
    }
    result = scraper._format_twitter_data(tweet, "fxtwitter")
    assert result["image_urls"] == [
        "https://pbs.twimg.com/media/a.jpg",
        "https://pbs.twimg.com/media/b.jpg",
    ]


def test_fxtwitter_formatter_no_media_yields_empty_list():
    tweet = {"text": "just words", "author": {"name": "X", "screen_name": "x"}}
    result = scraper._format_twitter_data(tweet, "fxtwitter")
    assert result["image_urls"] == []


def test_vxtwitter_formatter_prefers_typed_photos_over_videos():
    data = {
        "text": "post with a photo and a video",
        "user_name": "Touchline",
        "user_screen_name": "touchlinex",
        "media_extended": [
            {"url": "https://x/photo.jpg", "type": "image"},
            {"url": "https://x/clip.mp4", "type": "video"},
        ],
    }
    result = scraper._format_vxtwitter_data(data)
    # Only the image is kept — vision must never run on a video thumbnail.
    assert result["image_urls"] == ["https://x/photo.jpg"]


def test_vxtwitter_formatter_falls_back_to_media_urls_without_types():
    data = {
        "text": "photo only",
        "user_name": "X",
        "user_screen_name": "x",
        "mediaURLs": ["https://x/only.jpg"],
    }
    result = scraper._format_vxtwitter_data(data)
    assert result["image_urls"] == ["https://x/only.jpg"]


# ── Layer 2: Instagram cover-photo extraction ────────────────────────────────

def test_ig_url_is_video_detects_reels_and_igtv():
    assert scraper._ig_url_is_video("https://www.instagram.com/reel/ABC123/") is True
    assert scraper._ig_url_is_video("https://www.instagram.com/tv/ABC123/") is True
    assert scraper._ig_url_is_video("https://www.instagram.com/p/ABC123/") is False
    assert scraper._ig_url_is_video("https://www.instagram.com/cristiano/") is False


def test_extract_og_image_rejects_non_http():
    bs4 = pytest.importorskip("bs4")
    soup = bs4.BeautifulSoup(
        '<meta property="og:image" content="/relative/logo.png">', "html.parser")
    assert scraper._extract_og_image(soup) == ""
    soup2 = bs4.BeautifulSoup(
        '<meta property="og:image" content="https://cdn/x.jpg">', "html.parser")
    assert scraper._extract_og_image(soup2) == "https://cdn/x.jpg"


pytest.importorskip("bs4", reason="Instagram scrape parses HTML with BeautifulSoup")


class _FakeHTMLResponse:
    def __init__(self, html, ok=True):
        self.text = html
        self.ok = ok
        self.headers = {"Content-Type": "text/html; charset=utf-8"}

    def raise_for_status(self):
        return None


# A rich photo-post page: real caption (has "Likes,"/"Comments"/"Instagram" so the
# direct-scrape path keeps it) long enough (>100 chars) to skip the bridges.
_IG_PHOTO_HTML = """
<html><head>
<meta property="og:title" content="cristiano on Instagram: Great win">
<meta property="og:description" content="1M Likes, 5,000 Comments - cristiano on Instagram: 'What a night, so proud of this team and every single fan who believed in us the whole way through.'">
<meta property="og:image" content="https://scontent.cdninstagram.com/v/photo.jpg">
<meta property="og:url" content="https://www.instagram.com/p/ABC123/">
<meta property="og:type" content="article">
</head></html>
"""

# Login wall: generic title, no usable description, but an og:image is present.
_IG_LOGIN_WALL_HTML = """
<html><head>
<meta property="og:title" content="Login • Instagram">
<meta property="og:image" content="https://static.cdninstagram.com/logo.png">
</head></html>
"""


def test_instagram_photo_post_surfaces_cover_image(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda u: None)
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeHTMLResponse(_IG_PHOTO_HTML))
    result = scraper._scrape_instagram_url("https://www.instagram.com/p/ABC123/")
    assert result["image_urls"] == ["https://scontent.cdninstagram.com/v/photo.jpg"]
    # Instagram is image-first → flag the analysis layer to read the image as the
    # authoritative (screenshot) source, not a supplement.
    assert result["image_primary"] is True


def test_instagram_reel_is_gated_out_of_vision(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda u: None)
    # Same rich page, but a /reel/ URL → og:image is only a poster frame.
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeHTMLResponse(_IG_PHOTO_HTML))
    result = scraper._scrape_instagram_url("https://www.instagram.com/reel/ABC123/")
    assert result["image_urls"] == []


def test_instagram_login_wall_stays_text_only(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda u: None)
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeHTMLResponse(_IG_LOGIN_WALL_HTML))
    result = scraper._scrape_instagram_url("https://www.instagram.com/p/ABC123/")
    # No real metadata was extracted → no image attached (avoid running vision on
    # the Instagram logo). Early failure return carries no image_urls at all.
    assert not result.get("image_urls")


# ── Layer 3: _analyze_scraped routing + fallback ──────────────────────────────

pytest.importorskip("firebase_functions", reason="main.py imports firebase_functions")
import main  # noqa: E402
from ai_service import AnalysisError  # noqa: E402


class _FakeAI:
    """Records which analysis method was invoked."""

    def __init__(self, image_should_fail=False):
        self.image_should_fail = image_should_fail
        self.calls = []

    def analyze_text_with_images(self, text, images, existing_tags=None, content_type=None, **kw):
        self.calls.append(("images", len(images)))
        if self.image_should_fail:
            raise AnalysisError("vision boom")
        return {"detailedSummary": "multimodal", "summary": "from image+text"}

    def analyze_text(self, text, existing_tags=None, content_type=None, **kw):
        self.calls.append(("text", 0))
        return {"detailedSummary": "text only", "summary": "words only"}


def test_post_with_images_uses_multimodal(monkeypatch):
    monkeypatch.setattr(main, "_fetch_post_images",
                        lambda urls: [(b"jpgbytes", "image/jpeg")] if urls else [])
    ai = _FakeAI()
    scraped = {"text": "tweet body", "image_urls": ["https://x/a.jpg"]}

    result = main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    assert ai.calls == [("images", 1)]
    assert result["summary"] == "from image+text"


def test_multimodal_success_stashes_cover_for_the_card(monkeypatch):
    """On a successful multimodal analysis, the cover image is kept on `scraped`
    so the caller can persist it as the card thumbnail (show, not just summarize).
    First image only — the card header is a single banner."""
    monkeypatch.setattr(main, "_fetch_post_images",
                        lambda urls: [(b"first", "image/jpeg"), (b"second", "image/png")])
    ai = _FakeAI()
    scraped = {"text": "tweet body", "image_urls": ["https://x/a.jpg", "https://x/b.jpg"]}

    main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    assert scraped.get("_post_thumbnail") == (b"first", "image/jpeg")


def test_multimodal_failure_leaves_no_cover(monkeypatch):
    """If vision fails and we fall back to text, no thumbnail is stashed — a broken
    analysis must not leave a dangling image to persist."""
    monkeypatch.setattr(main, "_fetch_post_images",
                        lambda urls: [(b"jpgbytes", "image/jpeg")])
    ai = _FakeAI(image_should_fail=True)
    scraped = {"text": "tweet body", "image_urls": ["https://x/a.jpg"]}

    main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    assert "_post_thumbnail" not in scraped


def test_multimodal_failure_falls_back_to_text(monkeypatch):
    monkeypatch.setattr(main, "_fetch_post_images",
                        lambda urls: [(b"jpgbytes", "image/jpeg")] if urls else [])
    ai = _FakeAI(image_should_fail=True)
    scraped = {"text": "tweet body", "image_urls": ["https://x/a.jpg"]}

    result = main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    # Tried vision first, then fell back to text-only — the save still succeeds.
    assert ai.calls == [("images", 1), ("text", 0)]
    assert result["summary"] == "words only"


def test_post_without_images_stays_text_only(monkeypatch):
    monkeypatch.setattr(main, "_fetch_post_images", lambda urls: [])
    ai = _FakeAI()
    scraped = {"text": "just words", "image_urls": []}

    result = main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    assert ai.calls == [("text", 0)]
    assert result["summary"] == "words only"


class _PrimaryCapturingAI:
    """Records the image_is_primary flag passed to the multimodal call."""

    def __init__(self):
        self.image_is_primary = None

    def analyze_text_with_images(self, text, images, existing_tags=None,
                                 content_type=None, image_is_primary=False, **kw):
        self.image_is_primary = image_is_primary
        return {"summary": "ok"}

    def analyze_text(self, *a, **k):
        return {"summary": "text"}


def test_instagram_scraped_requests_primary_image_treatment(monkeypatch):
    monkeypatch.setattr(main, "_fetch_post_images",
                        lambda urls: [(b"x", "image/jpeg")] if urls else [])
    ai = _PrimaryCapturingAI()
    # Instagram scraped dict carries image_primary=True.
    scraped = {"text": "caption teaser", "image_urls": ["u"], "image_primary": True}

    main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    assert ai.image_is_primary is True


def test_x_scraped_keeps_text_primary_treatment(monkeypatch):
    monkeypatch.setattr(main, "_fetch_post_images",
                        lambda urls: [(b"x", "image/jpeg")] if urls else [])
    ai = _PrimaryCapturingAI()
    # X scraped dict has no image_primary key → default text-primary (low-res).
    scraped = {"text": "tweet body", "image_urls": ["u"]}

    main._analyze_scraped(ai, scraped, existing_tags=[], attempts=2)

    assert ai.image_is_primary is False


def test_image_is_primary_switches_resolution_and_prompt():
    """image_is_primary=True → MEDIUM res + 'authoritative image' prompt;
    False → LOW res + 'fold in' prompt. Captures the _generate_json call."""
    from ai_service import GeminiService

    svc = GeminiService.__new__(GeminiService)  # skip __init__ (no API key needed)
    captured = {}

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        captured["prompt"] = contents[0]
        captured["media_resolution"] = (config_extra or {}).get("media_resolution")
        return {"summary": "ok"}

    svc._generate_json = fake_generate_json

    svc.analyze_text_with_images("body", [(b"x", "image/jpeg")], image_is_primary=True)
    assert captured["media_resolution"] == "MEDIA_RESOLUTION_MEDIUM"
    assert "AUTHORITATIVE" in captured["prompt"]
    assert "do NOT" in captured["prompt"]  # preserve outcome/tense guardrail

    svc.analyze_text_with_images("body", [(b"x", "image/jpeg")], image_is_primary=False)
    assert captured["media_resolution"] == "MEDIA_RESOLUTION_LOW"
    assert "AUTHORITATIVE" not in captured["prompt"]
