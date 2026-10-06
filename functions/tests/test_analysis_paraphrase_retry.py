"""A RECITATION-blocked page can still be saved (launch audit CAP-22).

An output-side empty generation (the model refused to reproduce a page's text
verbatim) came back the same on every Retry, so the capture could never
succeed. analyze_text now retries once asking for its own words; an
input-side block (the prompt itself rejected) still raises at once.
"""

import pytest

import ai_service
from ai_service import EmptyGenerationError


def _service(monkeypatch, outcomes):
    calls = []
    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)

    def fake_generate(contents, what, config_extra=None, attempts=None, **kw):
        calls.append((contents[0], what, attempts))
        result = outcomes[len(calls) - 1]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(svc, "_generate_json", fake_generate, raising=False)
    monkeypatch.setattr(svc, "_same_script_tags", lambda tags, text: tags or [], raising=False)
    monkeypatch.setattr(svc, "_categories_context", lambda cats: "", raising=False)
    monkeypatch.setattr(svc, "_enforce_tag_language", lambda data: data, raising=False)
    return svc, calls


def test_an_output_side_block_is_retried_once_in_own_words(monkeypatch):
    svc, calls = _service(monkeypatch, [
        EmptyGenerationError("Empty response from Gemini (RECITATION)", prompt_blocked=False),
        {"title": "Grandma's challah", "summary": "Three rises."},
    ])
    out = svc.analyze_text("Ingredients: 500g flour ... Step 1 ...")
    assert out["title"] == "Grandma's challah"
    assert len(calls) == 2
    assert ai_service._ANALYSIS_PARAPHRASE_SUFFIX not in calls[0][0]
    assert calls[1][0].endswith(ai_service._ANALYSIS_PARAPHRASE_SUFFIX)
    assert calls[1][2] == 1  # one extra call, no more


def test_an_input_side_block_raises_without_a_retry(monkeypatch):
    svc, calls = _service(monkeypatch, [
        EmptyGenerationError("Empty response from Gemini (PROHIBITED_CONTENT)", prompt_blocked=True),
    ])
    with pytest.raises(EmptyGenerationError):
        svc.analyze_text("some page")
    assert len(calls) == 1


def test_a_second_block_still_fails(monkeypatch):
    svc, calls = _service(monkeypatch, [
        EmptyGenerationError("RECITATION", prompt_blocked=False),
        EmptyGenerationError("RECITATION", prompt_blocked=False),
    ])
    with pytest.raises(EmptyGenerationError):
        svc.analyze_text("some page")
    assert len(calls) == 2
