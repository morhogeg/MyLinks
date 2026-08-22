"""Early-stopped generations must not persist as cards.

Reported 2026-08-22: a dense Hebrew screenshot (long Facebook post) produced a
card whose last Key Points bullet ended mid-word — "מנכ" (the first three
letters of מנכ"ל). The JSON was valid and complete, so nothing downstream
noticed; the fragment was stored as the summary.

Covered here:
  1. _text_cut_off / _analysis_cut_off — the truncation-shape detectors.
  2. _generate_json — retries a truncated-looking result, returns a clean
     retry, and falls back to the fullest fragment rather than failing a save.
"""

import pytest

pytest.importorskip("bs4")
import ai_service
from ai_service import _analysis_cut_off, _text_cut_off


# ── the detector ─────────────────────────────────────────────────────────────

def test_mid_word_hebrew_cutoff_is_flagged():
    """The prod case: a bullet run that stops on a bare Hebrew letter."""
    assert _text_cut_off("## נקודות עיקריות\n- הארגון קיים מפגש בבאר שבע.\n- מנכ")


def test_unclosed_bold_is_flagged():
    assert _text_cut_off("- **Marcus Aurelius** wrote it.\n- **Senec")


def test_normal_summary_passes():
    assert not _text_cut_off(
        "Researchers at **MIT** found benefits.\n\nThe study lasted 12 weeks.")


def test_hebrew_summary_ending_with_period_passes():
    assert not _text_cut_off("המהלך נועד לחזק את מערכת הבריאות בנגב.")


def test_hebrew_sentence_with_gershayim_abbreviation_passes():
    # מנכ"ל mid-sentence, sentence properly closed with a period.
    assert not _text_cut_off('המנכ"ל הציג את התוכנית.')


def test_empty_and_non_string_pass():
    assert not _text_cut_off("")
    assert not _text_cut_off(None)
    assert not _text_cut_off(42)


def test_analysis_checks_both_prose_fields_only():
    assert _analysis_cut_off({"summary": "Fine.", "detailedSummary": "- מנכ"})
    assert _analysis_cut_off({"summary": "cut mid", "detailedSummary": "Fine."})
    assert not _analysis_cut_off({"summary": "Fine.", "detailedSummary": "Also fine."})
    # Non-analysis schemas (no prose fields) are never flagged.
    assert not _analysis_cut_off({"answer": "whatever with no period"})


# ── _generate_json behavior ──────────────────────────────────────────────────

class _FakeModels:
    def __init__(self, texts):
        self._texts = list(texts)
        self.calls = 0

    def generate_content(self, **kwargs):
        self.calls += 1
        text = self._texts.pop(0)

        class _Resp:
            pass

        r = _Resp()
        r.text = text
        r.candidates = []
        return r


def _service_with(texts):
    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
    svc.model = "test-model"

    class _Client:
        pass

    svc.client = _Client()
    svc.client.models = _FakeModels(texts)
    return svc


_CUT = '{"summary": "Fine.", "detailedSummary": "- מנכ"}'
_CUT_SHORTER = '{"summary": "Fine.", "detailedSummary": "- מ"}'
_CLEAN = '{"summary": "Fine.", "detailedSummary": "- הכל תקין."}'


def test_truncated_first_attempt_is_retried_and_clean_retry_wins():
    svc = _service_with([_CUT, _CLEAN])
    data = svc._generate_json(["prompt"], "test", attempts=2)
    assert data["detailedSummary"] == "- הכל תקין."
    assert svc.client.models.calls == 2


def test_all_attempts_truncated_keeps_the_fullest_fragment():
    svc = _service_with([_CUT_SHORTER, _CUT])
    data = svc._generate_json(["prompt"], "test", attempts=2)
    assert data["detailedSummary"] == "- מנכ"  # longer fragment, not a failure


def test_clean_first_attempt_is_not_retried():
    svc = _service_with([_CLEAN, _CUT])
    data = svc._generate_json(["prompt"], "test", attempts=2)
    assert data["detailedSummary"] == "- הכל תקין."
    assert svc.client.models.calls == 1


# ── _strip_output_dashes (em dashes banned from AI output, 2026-08-22) ───────

from ai_service import _strip_output_dashes


def test_em_dash_becomes_comma_break():
    d = _strip_output_dashes({"summary": "The plan is simple — save everything."})
    assert d["summary"] == "The plan is simple, save everything."


def test_numeric_range_keeps_a_hyphen():
    d = _strip_output_dashes({"summary": "The study ran 3–5 weeks."})
    assert d["summary"] == "The study ran 3-5 weeks."


def test_hebrew_dash_and_untouched_fields():
    d = _strip_output_dashes({
        "detailedSummary": "המהלך נועד לחזק את הנגב — ולסייע לרופאים.",
        "tags": ["a—b"],  # not a prose field: untouched
    })
    assert d["detailedSummary"] == "המהלך נועד לחזק את הנגב, ולסייע לרופאים."
    assert d["tags"] == ["a—b"]


def test_clean_text_unchanged():
    d = {"summary": "No dashes here. A well-known hyphen stays."}
    assert _strip_output_dashes(dict(d)) == d
