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


# ── production shape 2026-09-09: handle answered as sourceName ───────────────

def test_handle_in_source_name_with_new_fields_null_is_still_a_handle():
    """The deployed model returned sourceName "@OpenAI" and both new fields
    null for the owner's X screenshot; the card must still get its handle."""
    analysis = {"sourceName": "@OpenAI", "sourceHandle": None, "sourcePlatform": None}
    assert main._screenshot_source(analysis) == (None, "OpenAI")
    card = main._apply_screenshot_source(_card(sourceName="@OpenAI"), analysis)
    assert card["sourceHandle"] == "@OpenAI"
    assert card["sourceName"] == "@OpenAI"
    assert "sourcePlatform" not in card


def test_handle_in_source_name_keeps_a_valid_platform():
    analysis = {"sourceName": "@OpenAI", "sourceHandle": "", "sourcePlatform": "x"}
    assert main._screenshot_source(analysis) == ("x", "OpenAI")


def test_source_name_that_is_not_a_handle_is_not_promoted():
    for name in ("X", "OpenAI", "The Verge", "@Open AI"):
        assert main._screenshot_source({"sourceName": name}) == (None, None)


def test_explicit_handle_wins_over_source_name():
    analysis = {"sourceName": "@wrong", "sourceHandle": "@right", "sourcePlatform": "x"}
    assert main._screenshot_source(analysis) == ("x", "right")


# ── platform resolution: every signal, then the focused follow-up ───────────

class _FakeAI:
    def __init__(self, answer):
        self.answer, self.calls = answer, 0

    def classify_screenshot_platform(self, images):
        self.calls += 1
        return self.answer


def test_bare_platform_source_name_names_the_platform():
    analysis = {"sourceName": "X", "sourceHandle": "@OpenAI"}
    ai = _FakeAI("instagram")
    card = main._apply_screenshot_source(_card(sourceName="X"), analysis, images=[(b"i", "image/jpeg")], ai=ai)
    assert card["sourcePlatform"] == "x"
    assert ai.calls == 0  # the name already settled it


def test_follow_up_runs_only_for_handle_without_platform():
    analysis = {"sourceName": "@OpenAI", "sourceHandle": None, "sourcePlatform": None}
    ai = _FakeAI("x")
    card = main._apply_screenshot_source(_card(sourceName="@OpenAI"), analysis, images=[(b"i", "image/jpeg")], ai=ai)
    assert ai.calls == 1
    assert card["sourcePlatform"] == "x"
    assert card["sourceHandle"] == "@OpenAI"


def test_follow_up_answer_is_validated():
    analysis = {"sourceHandle": "@someone"}
    for bad in ("reddit", "", None, "X marks"):
        card = main._apply_screenshot_source(_card(), analysis, images=[(b"i", "image/jpeg")], ai=_FakeAI(bad))
        assert "sourcePlatform" not in card
        assert card["sourceHandle"] == "@someone"


def test_no_follow_up_without_handle_or_images():
    ai = _FakeAI("x")
    main._apply_screenshot_source(_card(), {"sourcePlatform": None}, images=[(b"i", "image/jpeg")], ai=ai)
    main._apply_screenshot_source(_card(), {"sourceHandle": "@a"}, images=None, ai=ai)
    main._apply_screenshot_source(_card(), {"sourceHandle": "@a"}, images=[(b"i", "image/jpeg")], ai=None)
    assert ai.calls == 0


def test_platform_from_name_table():
    assert main._platform_from_name("Twitter") == "x"
    assert main._platform_from_name("TikTok") == "tiktok"
    assert main._platform_from_name("The Verge") == ""
    assert main._platform_from_name(None) == ""


def test_classify_prompt_uses_small_schema_and_low_resolution(monkeypatch):
    import sys, types as _types
    from ai_service import GeminiService
    import models
    try:
        from google.genai import types as _t  # noqa: F401
    except ImportError:
        fake = _types.ModuleType("google.genai.types")
        fake.Part = type("Part", (), {"from_bytes": staticmethod(lambda data, mime_type: ("part", mime_type))})
        monkeypatch.setitem(sys.modules, "google.genai.types", fake)
        monkeypatch.setattr(sys.modules["google.genai"], "types", fake, raising=False)
    svc = GeminiService.__new__(GeminiService)
    seen = {}

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        seen["extra"], seen["attempts"] = config_extra, attempts
        seen["prompt"] = [c for c in contents if isinstance(c, str)][0]
        return {"platform": "X", "evidence": "X logo"}

    svc._generate_json = fake_generate_json
    assert svc.classify_screenshot_platform([(b"i", "image/jpeg"), (b"j", "image/jpeg")]) == "x"
    assert seen["extra"]["response_schema"] is models.ScreenshotPlatform
    assert seen["extra"]["media_resolution"] == "MEDIA_RESOLUTION_LOW"
    assert seen["attempts"] == 1
    assert "NOT evidence" in seen["prompt"]


def test_classify_never_raises(monkeypatch):
    from ai_service import GeminiService
    svc = GeminiService.__new__(GeminiService)

    def boom(*a, **k):
        raise RuntimeError("gemini down")

    svc._generate_json = boom
    assert svc.classify_screenshot_platform([(b"i", "image/jpeg")]) == ""
