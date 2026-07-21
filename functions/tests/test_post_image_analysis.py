"""Tests for pulling in-post images into the summary (X posts with photos).

Two layers are covered:
  1. The Twitter/X scraper formatters now SURFACE the post's photo URLs as
     ``image_urls`` (fxtwitter + vxtwitter shapes) — previously they were dropped
     and only a "[Contains N Image(s)]" placeholder reached the model.
  2. ``main._analyze_scraped`` routes a post-with-images through the SINGLE
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


# ── Layer 2: _analyze_scraped routing + fallback ──────────────────────────────

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
