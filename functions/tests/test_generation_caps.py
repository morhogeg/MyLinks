"""Every generation call carries an output ceiling (AI-12).

Only the 1-token filter probe ever set max_output_tokens, so a degenerate
generation (a repetition loop) could run to the model's own maximum on any
surface. Each surface now has its own generous cap, hitting it is handled
explicitly, and the weekly synthesis no longer sends an unbounded week.
Offline: the Gemini client is faked and records each call's config.
"""

from types import SimpleNamespace

import pytest

import ai_service
import search
from ai_service import GeminiService, AnalysisError
from graph_service import GraphService

CARDS = [{"id": "id1", "title": "Pasta", "summary": "A pasta recipe."}]


class _Recorder:
    def __init__(self, text='{"answer": "Boil it.", "citedIds": ["id1"]}', finish=None):
        self.configs = []
        self.text = text
        self.finish = finish

    def _response(self):
        cands = [SimpleNamespace(finish_reason=self.finish)] if self.finish else []
        return SimpleNamespace(text=self.text, candidates=cands)

    def generate_content(self, model=None, contents=None, config=None):
        self.configs.append(config)
        return self._response()

    def generate_content_stream(self, model=None, contents=None, config=None):
        self.configs.append(config)
        return iter([SimpleNamespace(text="Boil it.\n[[CITED: id1]]", candidates=[])])


def _svc(recorder):
    svc = GeminiService.__new__(GeminiService)
    svc.client = SimpleNamespace(models=recorder)
    svc.model = ai_service.GEMINI_ANALYSIS_MODEL
    return svc


def test_analysis_calls_are_capped():
    rec = _Recorder(text='{"title": "T", "summary": "Done.", "category": "Tech", "tags": ["x"]}')
    _svc(rec)._generate_json(["analyze this"], "text analysis")
    assert rec.configs[0]["max_output_tokens"] == ai_service.ANALYSIS_MAX_OUTPUT_TOKENS


def test_ask_json_plain_and_stream_are_capped():
    rec = _Recorder()
    svc = _svc(rec)
    svc.answer_from_context("how?", CARDS)
    svc._plain_answer("prompt")
    list(svc.answer_from_context_stream("how?", CARDS))
    assert [c["max_output_tokens"] for c in rec.configs] == [ai_service.ASK_MAX_OUTPUT_TOKENS] * 3


def test_small_json_follow_ups_are_capped():
    rec = _Recorder(text='{"tags": ["pasta", "lemon"]}')
    _svc(rec)._ensure_tags({"title": "Pasta", "summary": "Lemon pasta.", "tags": []})
    rec.text = '{"platform": "x", "evidence": "logo"}'
    _svc(rec).classify_screenshot_platform([(b"img", "image/png")])
    assert [c["max_output_tokens"] for c in rec.configs] == [ai_service.SMALL_JSON_MAX_OUTPUT_TOKENS] * 2


def test_search_judge_is_capped(monkeypatch):
    rec = _Recorder(text="[]")
    monkeypatch.setattr(search, "_get_genai_client", lambda timeout_ms: SimpleNamespace(models=rec))
    search.judge_relevance("pasta", [{"id": "a", "title": "Pasta"}])
    assert rec.configs[0]["max_output_tokens"] == ai_service.JUDGE_MAX_OUTPUT_TOKENS


def test_see_also_verifier_is_capped():
    rec = _Recorder(text="[]")
    svc = GraphService.__new__(GraphService)
    svc.ai = SimpleNamespace(client=SimpleNamespace(models=rec))
    svc._verify_relationships_with_llm("New", "S", [], [{"id": "c1", "title": "Old"}])
    assert rec.configs[0]["max_output_tokens"] == ai_service.VERIFIER_MAX_OUTPUT_TOKENS


def test_synthesis_is_capped_in_and_out():
    seen = {}
    svc = GeminiService.__new__(GeminiService)
    svc.client = object()

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        seen["prompt"], seen["config"] = contents[0], config_extra
        return {"title": "T", "narrative": "n", "themes": [{"title": "t", "insight": "i",
                                                            "cardIds": ["c0", "c99"]}]}

    svc._generate_json = fake_generate_json
    week = [{"id": f"c{i}", "title": f"Card {i}", "summary": "x" * 5000} for i in range(100)]
    out = svc.synthesize_week(week)

    assert seen["config"]["max_output_tokens"] == ai_service.SYNTHESIS_MAX_OUTPUT_TOKENS
    p = seen["prompt"]
    assert "[c79]" in p and "[c80]" not in p
    assert "x" * (ai_service.SYNTHESIS_SUMMARY_CHARS + 1) not in p
    assert "80 most recent of the 100 things" in p
    # Ids outside the capped input can no longer be referenced.
    assert out["themes"][0]["cardIds"] == ["c0"]


def test_json_cut_by_the_cap_fails_fast_and_says_why():
    rec = _Recorder(text='{"title": "T", "summary": "An unfinished sent', finish="MAX_TOKENS")
    with pytest.raises(AnalysisError, match="max_output_tokens"):
        _svc(rec)._generate_json(["analyze this"], "text analysis", attempts=3)
    assert len(rec.configs) == 1  # the same cap would cut a retry again


def test_plain_answer_cut_by_the_cap_is_not_passed_off_as_the_answer():
    rec = _Recorder(text='{"answer": "Half of the answ', finish="MAX_TOKENS")
    with pytest.raises(AnalysisError, match="max_output_tokens"):
        _svc(rec)._plain_answer("prompt")
