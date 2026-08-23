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


# ── list-field tails (tags/concepts/videoHighlights) ─────────────────────────
# Structured output writes fields in schema order, so an early stop can land in
# whichever LIST the model was emitting (concepts/videoHighlights come after
# the prose) and still close the JSON. Only unambiguous signatures flag —
# tags/concepts are short noun phrases with no terminal punctuation, so a bare
# short word is their NORMAL shape.

from ai_service import _list_tail_cut_off


def test_unclosed_bold_in_last_list_item_is_flagged():
    assert _list_tail_cut_off(["**Marcus Aurelius** wrote it", "**Senec"])


def test_trailing_connector_in_last_list_item_is_flagged():
    assert _list_tail_cut_off(["robot vacuums", "self-"])
    assert _list_tail_cut_off(["בריאות", "מנכ־"])   # Hebrew maqaf mid-compound
    assert _list_tail_cut_off(["one", "two,"])      # cut between items


def test_bare_short_words_in_lists_are_accepted():
    # A mid-word cut like a bare "מנכ" is indistinguishable from a legitimate
    # short term — accepted by design (documented judgment call), never a
    # retry-loop trigger on valid output.
    assert not _list_tail_cut_off(["spaced repetition", "מנכ"])
    assert not _list_tail_cut_off(["vitamin d"])
    assert not _list_tail_cut_off([])
    assert not _list_tail_cut_off(None)
    assert not _list_tail_cut_off(["ok", 42])


def test_video_highlight_without_period_is_not_flagged():
    # Highlights are "M:SS — description" with no required terminator.
    assert not _analysis_cut_off({
        "summary": "Fine.",
        "videoHighlights": ["2:15 — Explains the 2-minute rule"]})


def test_truncated_last_concept_flags_the_analysis():
    assert _analysis_cut_off({"summary": "Fine.", "concepts": ["Stoicism", "**Netw"]})


def test_hebrew_terminators_still_accepted():
    # Geresh / gershayim are legitimate Hebrew line enders — whitelist, not cut.
    assert not _text_cut_off("קטע שמסתיים בציטוט ׳כך׳")
    assert not _text_cut_off('ראשי תיבות בסוף שורה: צה"ל.')


# ── present-but-empty summary (valid JSON, no content) ───────────────────────

def test_empty_summary_is_flagged():
    assert _analysis_cut_off({"summary": "", "detailedSummary": "Fine."})
    assert _analysis_cut_off({"summary": "   ", "detailedSummary": "Fine."})


def test_non_analysis_schemas_still_pass_untouched():
    # BrainAnswer / WeeklySynthesis shapes carry none of the checked fields.
    assert not _analysis_cut_off({"answer": "whatever with no period", "citedIds": []})
    assert not _analysis_cut_off({
        "title": "A week of systems thinking",
        "narrative": "Two paragraphs",
        "themes": [{"title": "T", "insight": "cut mid", "cardIds": ["x"]}],
    })


def test_empty_summary_attempt_is_retried():
    _EMPTY = '{"summary": "", "detailedSummary": "- fine."}'
    svc = _service_with([_EMPTY, _CLEAN])
    data = svc._generate_json(["prompt"], "test", attempts=2)
    assert data["detailedSummary"] == "- הכל תקין."
    assert svc.client.models.calls == 2
