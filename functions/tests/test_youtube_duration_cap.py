"""Pre-analysis duration cap for YouTube native video ingestion.

Native video ingestion is the one per-card cost outlier (~$0.09/hour of video
at LOW media resolution), so `_analyze_scraped` must skip the Gemini video call
for videos over YOUTUBE_MAX_VIDEO_MINUTES and degrade to the honest
metadata-only card — while failing OPEN when the duration is unknown (the
watch-page probe is best-effort and cloud IPs sometimes get a bot wall).

Offline: the AI service is a stub; the scraper probe tests monkeypatch
safe_get.
"""

import pytest

import scraper
import main
from ai_service import AnalysisError


class _FakeAI:
    """Records which analysis path was taken."""

    def __init__(self, youtube_raises=False):
        self.youtube_calls = []
        self.text_calls = []
        self._youtube_raises = youtube_raises

    def analyze_youtube(self, watch_url, existing_tags=None, **kw):
        self.youtube_calls.append(watch_url)
        if self._youtube_raises:
            raise AnalysisError("private video")
        return {"title": "native", "videoDurationMinutes": 999}

    def analyze_text(self, text, existing_tags=None, **kw):
        self.text_calls.append(text)
        return {"title": "fallback"}


def _scraped(length_seconds):
    return {
        "content_type": "youtube",
        "text": "YOUTUBE VIDEO\nTitle: t",
        "youtube_metadata": {
            "watch_url": "https://www.youtube.com/watch?v=abcdefghijk",
            "length_seconds": length_seconds,
        },
    }


def test_over_cap_skips_native_and_uses_metadata_card(monkeypatch):
    monkeypatch.setattr(main, "YOUTUBE_MAX_VIDEO_MINUTES", 180)
    ai = _FakeAI()
    analysis = main._analyze_scraped(ai, _scraped(181 * 60), [])
    assert ai.youtube_calls == []
    assert len(ai.text_calls) == 1
    assert analysis["title"] == "fallback"
    # Real duration still lands on the card even though the model never saw it.
    assert analysis["videoDurationMinutes"] == 181


def test_under_cap_uses_native_analysis(monkeypatch):
    monkeypatch.setattr(main, "YOUTUBE_MAX_VIDEO_MINUTES", 180)
    ai = _FakeAI()
    analysis = main._analyze_scraped(ai, _scraped(20 * 60), [])
    assert len(ai.youtube_calls) == 1
    assert ai.text_calls == []
    # Probed duration (ground truth) overrides the model's estimate.
    assert analysis["videoDurationMinutes"] == 20


def test_unknown_duration_fails_open(monkeypatch):
    monkeypatch.setattr(main, "YOUTUBE_MAX_VIDEO_MINUTES", 180)
    ai = _FakeAI()
    main._analyze_scraped(ai, _scraped(None), [])
    assert len(ai.youtube_calls) == 1


def test_cap_disabled_with_zero(monkeypatch):
    monkeypatch.setattr(main, "YOUTUBE_MAX_VIDEO_MINUTES", 0)
    ai = _FakeAI()
    main._analyze_scraped(ai, _scraped(10 * 3600), [])
    assert len(ai.youtube_calls) == 1


def test_native_failure_fallback_keeps_probed_duration(monkeypatch):
    monkeypatch.setattr(main, "YOUTUBE_MAX_VIDEO_MINUTES", 180)
    ai = _FakeAI(youtube_raises=True)
    analysis = main._analyze_scraped(ai, _scraped(90), [])
    assert len(ai.youtube_calls) == 1
    assert len(ai.text_calls) == 1
    assert analysis["videoDurationMinutes"] == 2  # 90s rounds up


# ── Watch-page duration probe ────────────────────────────────────────────────

class _FakeResponse:
    def __init__(self, text="", ok=True):
        self.text = text
        self.ok = ok


def test_probe_parses_length_seconds(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeResponse('..."lengthSeconds":"754",...'))
    assert scraper._probe_youtube_duration("https://www.youtube.com/watch?v=x") == 754


def test_probe_treats_zero_and_missing_as_unknown(monkeypatch):
    monkeypatch.setattr(scraper, "safe_get",
                        lambda *a, **k: _FakeResponse('..."lengthSeconds":"0",...'))
    assert scraper._probe_youtube_duration("u") is None
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse("<html>bot wall</html>"))
    assert scraper._probe_youtube_duration("u") is None


def test_probe_never_raises(monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("network down")
    monkeypatch.setattr(scraper, "safe_get", _boom)
    assert scraper._probe_youtube_duration("u") is None
