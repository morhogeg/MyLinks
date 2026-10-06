"""The truncation check no longer buys extra analysis calls for whole cards
(AI-13).

`_analysis_cut_off` retries an analysis that "looks cut off", and each false
positive is a full extra Gemini call (up to 3 per card in the background). It
misfired on summaries ending in other scripts' terminators (。！？।؟ »), on an
emoji, and on recipe steps / list items in detailedSummary that end on a bare
word. The model's own finish_reason (MAX_TOKENS) is now the main signal.
"""

from types import SimpleNamespace

import pytest

import ai_service
from ai_service import _analysis_cut_off, _text_cut_off


@pytest.mark.parametrize("text", [
    "これはテストです。", "本当ですか？", "素晴らしい！", "यह सही है।", "هل هذا صحيح؟",
    "اردو کا جملہ۔", "Il a dit «oui»", "Great week 🎉", "Done 👍🏽",
    "With love \u2764\ufe0f",  # heart + emoji variation selector
    "「引用」", "（注）",
])
def test_whole_summaries_in_other_scripts_are_not_cut(text):
    assert _text_cut_off(text) is False


def test_a_summary_trailing_off_mid_word_is_still_cut():
    assert _text_cut_off("המהלך נועד לחזק את מנכ") is True
    assert _analysis_cut_off({"summary": "The study found that partic"}) is True


def test_recipe_steps_and_list_items_are_not_cut():
    recipe = {"summary": "A creamy pasta.", "detailedSummary":
              "## Ingredients\n- 500g pasta\n- 2 lemons\n\n## Steps\n1. Boil the pasta\n2. Serve warm"}
    assert _analysis_cut_off(recipe) is False


def test_max_tokens_is_the_main_signal():
    clean = {"summary": "Fine.", "detailedSummary": "- Complete."}
    assert _analysis_cut_off(clean, "MAX_TOKENS") is True
    assert _analysis_cut_off(clean, "STOP") is False
    assert _analysis_cut_off(clean, None) is False


def _service(*responses):
    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
    svc.model = "m"
    calls = []

    def generate_content(**kwargs):
        calls.append(kwargs)
        text, finish = responses[len(calls) - 1]
        return SimpleNamespace(text=text, candidates=[SimpleNamespace(finish_reason=finish)])

    svc.client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    return svc, calls


_RECIPE = ('{"summary": "A creamy lemon pasta.", "detailedSummary": '
           '"## Steps\\n1. Boil the pasta\\n2. Serve warm", "tags": ["pasta"]}')


def test_a_recipe_card_costs_one_call():
    svc, calls = _service((_RECIPE, "STOP"))
    data = svc._generate_json(["p"], "text analysis", attempts=3)
    assert len(calls) == 1
    assert data["detailedSummary"].endswith("Serve warm")


def test_a_max_tokens_result_is_retried():
    svc, calls = _service((_RECIPE, "MAX_TOKENS"), (_RECIPE, "STOP"))
    svc._generate_json(["p"], "text analysis", attempts=3)
    assert len(calls) == 2


# ── RV-4: a bare cut last line in detailedSummary is caught again ───────────
# The 2026-08-22 incident (cad0e81) was an early stop with clean JSON and
# finish_reason STOP: the last Key Points bullet read "- מנכ". AI-13 narrowed
# detailedSummary to the unclosed-bold check, so MAX_TOKENS never saw it and
# the fragment was stored. The bare-letter test is back for the LAST line,
# minus the recipe-style lines AI-13 was protecting.

_INCIDENT = {"title": "t", "summary": "הארגון קיים מפגש.", "category": "News", "tags": ["a"],
             "detailedSummary": "**נקודות עיקריות**\n- הארגון קיים מפגש\n- מנכ"}


@pytest.mark.parametrize("detail", [
    "- מנכ",                                                         # the incident, alone
    "**נקודות עיקריות**\n- הארגון קיים מפגש\n- מנכ",                 # ... after an unpunctuated bullet
    "## נקודות עיקריות\n- הארגון קיים מפגש בבאר שבע.\n- מנכ",
    "## Key Points\n- The study ran for 12 weeks.\n- Participants who slept more report",
    "## Key Points\n- The study ran for 12 weeks.\n\nResearchers found that partic",
    "## Key Points\n- The study ran for 12 weeks.\n## Steps",          # a heading with nothing under it
    "## Key Points\n- Sleep matters,",                               # stopped between clauses
])
def test_a_cut_last_line_is_flagged(detail):
    assert _analysis_cut_off({"summary": "Fine.", "detailedSummary": detail}) is True


@pytest.mark.parametrize("detail", [
    "## Steps\n1. Mix\n2. Serve warm",
    "## Ingredients\n- 500g pasta\n- 2 lemons\n\n## Steps\n1. Boil the pasta\n2. Serve warm",
    "## Ingredients\n- 2 cups flour\n- 1 tsp salt",
    "## Key Points\n- **Sleep** improves memory.\n- Naps help too.",
    "## Key Points\n- Great week 🎉",
    "## Key Points\n- Read *Meditations* (Hays translation)",
    "---",
])
def test_whole_detail_endings_are_not_flagged(detail):
    assert _analysis_cut_off({"summary": "Fine.", "detailedSummary": detail}) is False


def test_the_incident_is_retried_and_the_clean_take_stored():
    import json
    clean = dict(_INCIDENT, detailedSummary="**נקודות עיקריות**\n- הארגון קיים מפגש\n- מנכ\"ל החברה נאם.")
    svc, calls = _service((json.dumps(_INCIDENT, ensure_ascii=False), "STOP"),
                          (json.dumps(clean, ensure_ascii=False), "STOP"))
    data = svc._generate_json(["x"], "image analysis", attempts=3)
    assert len(calls) == 2
    assert data["detailedSummary"].endswith("נאם.")


def test_the_last_line_check_buys_at_most_one_extra_call():
    import json
    longer = dict(_INCIDENT, detailedSummary=_INCIDENT["detailedSummary"] + "\n- עוד שור")
    svc, calls = _service((json.dumps(_INCIDENT, ensure_ascii=False), "STOP"),
                          (json.dumps(longer, ensure_ascii=False), "STOP"),
                          (json.dumps(_INCIDENT, ensure_ascii=False), "STOP"))
    data = svc._generate_json(["x"], "image analysis", attempts=3)
    assert len(calls) == 2  # one retry for this signal, not two
    assert data["detailedSummary"] == longer["detailedSummary"]  # the fullest fragment
