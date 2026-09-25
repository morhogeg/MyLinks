"""Tag follow-up for vision/video analyses (ai_service.GeminiService._ensure_tags).

The screenshot and YouTube paths can't pre-filter the Existing-Tags vocabulary
by script (no text before the call), so the same-language backstop can strip
every tag — owner's Hebrew screenshot card, 2026-09-25. _ensure_tags refills
them with one text-only call, offered only same-script vocabulary.
"""
from ai_service import GeminiService


def _svc(reply=None, raises=None):
    svc = object.__new__(GeminiService)
    svc.calls = []

    def fake_generate(contents, what, **kw):
        svc.calls.append((contents, what, kw))
        if raises:
            raise raises
        return reply

    svc._generate_json = fake_generate
    return svc


HE_CARD = {"language": "he", "title": "עוצמת הבכי של התינוק", "summary": "הבכי של תינוקות עובר תהליך התפתחותי",
           "category": "Health"}


def test_empty_tags_trigger_followup_with_same_script_vocab_only():
    svc = _svc({"tags": ["בכי תינוקות", "התפתחות תינוקות", "parenting"]})
    out = svc._ensure_tags(dict(HE_CARD, tags=[]), ["sleep", "הורות", "AI", "תינוקות"])
    assert out["tags"] == ["בכי תינוקות", "התפתחות תינוקות"]  # English one dropped by backstop
    prompt = svc.calls[0][0][0]
    assert "הורות, תינוקות" in prompt and "sleep" not in prompt
    assert svc.calls[0][2]["attempts"] == 1


def test_enough_tags_skip_the_call():
    svc = _svc({"tags": ["x"]})
    card = dict(HE_CARD, tags=["בכי", "תינוקות"])
    assert svc._ensure_tags(card, ["x"])["tags"] == ["בכי", "תינוקות"]
    assert svc.calls == []


def test_one_tag_is_topped_up_without_duplicates():
    svc = _svc({"tags": ["תינוקות", "בכי", "שבוע 6"]})
    out = svc._ensure_tags(dict(HE_CARD, tags=["תינוקות"]), [])
    assert out["tags"] == ["תינוקות", "בכי", "שבוע 6"]


def test_failed_followup_leaves_card_untouched():
    svc = _svc(raises=RuntimeError("boom"))
    card = dict(HE_CARD, tags=[])
    assert svc._ensure_tags(card, [])["tags"] == []


def test_no_title_or_summary_skips_the_call():
    svc = _svc({"tags": ["a", "b"]})
    assert svc._ensure_tags({"language": "en", "tags": []}, [])["tags"] == []
    assert svc.calls == []


def test_followup_tags_capped_and_category_dropped():
    svc = _svc({"tags": ["Health", "a", "b", "c", "d", "e"]})
    out = svc._ensure_tags({"language": "en", "title": "t", "summary": "s", "category": "Health", "tags": []}, [])
    assert "Health" not in out["tags"] and len(out["tags"]) <= 5
