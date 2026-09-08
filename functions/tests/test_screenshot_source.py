"""Screenshot provenance — who posted what a screenshot shows.

Pure/offline. Covers main._screenshot_source (validation of the model's
sourcePlatform/sourceHandle against per-platform username rules),
main._apply_screenshot_source (what lands on the card), the vision prompt's
instructions, the response schema carrying the two fields, and the share
page's byline mirror.
"""

import pytest

import main
import models
import share_service


# ── _screenshot_source: validation ───────────────────────────────────────────

def test_x_post_with_visible_handle():
    assert main._screenshot_source({"sourcePlatform": "x", "sourceHandle": "@OpenAI"}) == ("x", "OpenAI")


def test_platform_is_case_insensitive_and_trimmed():
    assert main._screenshot_source({"sourcePlatform": " Instagram ", "sourceHandle": "@cristiano"}) == ("instagram", "cristiano")


def test_handle_without_platform_is_kept_without_platform():
    assert main._screenshot_source({"sourcePlatform": None, "sourceHandle": "@someone"}) == (None, "someone")


def test_unknown_platform_is_dropped_but_handle_survives():
    assert main._screenshot_source({"sourcePlatform": "reddit", "sourceHandle": "@user_1"}) == (None, "user_1")


def test_platform_without_handle_is_nothing():
    """Handles only: a bare 'X' says nothing a reader can act on."""
    assert main._screenshot_source({"sourcePlatform": "x", "sourceHandle": None}) == (None, None)
    assert main._screenshot_source({"sourcePlatform": "x", "sourceHandle": ""}) == (None, None)


@pytest.mark.parametrize("bad", [
    "OpenAI",                       # no @ — a display name, not a handle
    "@Open AI",                     # whitespace inside
    "@",                            # empty
    "@this_is_way_too_long_for_x",  # X caps usernames at 15
    "@open.ai",                     # dots are not legal on X
    "@We're sharing a solution",    # a sentence
    "@home",                        # reserved X route
])
def test_x_rejects_non_handles(bad):
    assert main._screenshot_source({"sourcePlatform": "x", "sourceHandle": bad}) == (None, None)


def test_instagram_allows_dots_and_30_chars():
    h = "a.b_c" + "d" * 25
    assert len(h) == 30
    assert main._screenshot_source({"sourcePlatform": "instagram", "sourceHandle": f"@{h}"}) == ("instagram", h)


def test_non_dict_and_missing_fields():
    assert main._screenshot_source(None) == (None, None)
    assert main._screenshot_source({}) == (None, None)
    assert main._screenshot_source({"title": "x"}) == (None, None)


# ── _apply_screenshot_source: what lands on the card ─────────────────────────

def _card(**over):
    d = {"sourceType": "image", "sourceName": "Screenshot", "url": "https://storage/x.jpg"}
    d.update(over)
    return d


def test_apply_stamps_handle_platform_and_source_name():
    card = main._apply_screenshot_source(_card(), {"sourcePlatform": "x", "sourceHandle": "@OpenAI"})
    assert card["sourceHandle"] == "@OpenAI"
    assert card["sourcePlatform"] == "x"
    assert card["sourceName"] == "@OpenAI"


def test_apply_handle_only_has_no_platform_key():
    card = main._apply_screenshot_source(_card(), {"sourceHandle": "@someone"})
    assert card["sourceHandle"] == "@someone"
    assert card["sourceName"] == "@someone"
    assert "sourcePlatform" not in card


def test_apply_without_handle_leaves_card_untouched():
    card = main._apply_screenshot_source(_card(), {"sourcePlatform": "x"})
    assert card == _card()


def test_apply_without_handle_reverts_bare_platform_name_to_screenshot():
    """The model may name the app as the publisher; without a handle that is
    not a source under the handles-only rule."""
    for name in ("X", "Instagram", "twitter", "TikTok"):
        card = main._apply_screenshot_source(_card(sourceName=name), {"sourcePlatform": "x"})
        assert card["sourceName"] == "Screenshot"


def test_apply_without_handle_keeps_a_real_publisher_name():
    """A screenshot of an article keeps its legible masthead (existing behaviour)."""
    card = main._apply_screenshot_source(_card(sourceName="The Verge"), {})
    assert card["sourceName"] == "The Verge"


# ── schema + prompt ──────────────────────────────────────────────────────────

def test_schema_carries_the_two_fields():
    """Structured output only returns fields in the response schema — without
    these the model's answer would be silently dropped."""
    fields = models.AIAnalysis.model_fields
    assert "sourcePlatform" in fields and "sourceHandle" in fields


def test_vision_prompt_asks_for_platform_and_handle(monkeypatch):
    import sys, types as _types
    from ai_service import GeminiService

    # Offline the conftest fakes google.genai without `types`; the method does
    # a local `from google.genai import types`, so give it a Part stand-in.
    try:
        from google.genai import types as _genai_types  # noqa: F401
    except ImportError:
        fake = _types.ModuleType("google.genai.types")
        fake.Part = type("Part", (), {"from_bytes": staticmethod(lambda data, mime_type: ("part", mime_type))})
        monkeypatch.setitem(sys.modules, "google.genai.types", fake)
        monkeypatch.setattr(sys.modules["google.genai"], "types", fake, raising=False)

    svc = GeminiService.__new__(GeminiService)  # skip __init__ (no API key needed)
    captured = {}

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        captured["prompt"] = [c for c in contents if isinstance(c, str)][0]
        return {"tags": []}

    svc._generate_json = fake_generate_json
    svc.analyze_images([(b"img", "image/jpeg")])
    p = captured["prompt"]
    assert "sourcePlatform" in p and "sourceHandle" in p
    assert "LITERALLY visible" in p
    assert "NOT evidence of a platform" in p


# ── share page byline mirror ─────────────────────────────────────────────────

def test_share_byline_x_screenshot_shows_x_mark_and_handle():
    html = share_service._source_byline({"sourceType": "image", "url": "https://storage/x.jpg",
                                         "sourceName": "@OpenAI", "sourceHandle": "@OpenAI",
                                         "sourcePlatform": "x"})
    assert "@OpenAI" in html
    assert share_service._PLATFORM_ICONS["x"][1] in html


def test_share_byline_handle_without_known_platform_keeps_image_glyph():
    html = share_service._source_byline({"sourceType": "image", "url": "https://storage/x.jpg",
                                         "sourceName": "@someone", "sourceHandle": "@someone",
                                         "sourcePlatform": "threads"})
    assert "@someone" in html
    assert share_service._ICON_IMAGE in html


def test_share_byline_plain_screenshot_unchanged():
    html = share_service._source_byline({"sourceType": "image", "url": "https://storage/x.jpg",
                                         "sourceName": "Screenshot"})
    assert "Screenshot" in html
    assert share_service._ICON_IMAGE in html
