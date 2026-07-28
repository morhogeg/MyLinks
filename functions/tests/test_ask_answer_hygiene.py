"""Ask answer hygiene — raw card ids must never reach the user-visible text.

Owner report (2026-07-28): a graph-launched ask answered with citation ids
parenthesized INSIDE the prose — "…oil sanctions (fb9QaKkmjNvk4ueKybSv,
F7wwq0PWJh3cpyMaCbBt)". Ids are machine references; the reader has no use for
them and they read as garbage. Two layers guard this: a prompt rule (asserted
here so a wording edit can't silently drop it) and the deterministic
``_strip_inline_ids`` scrub on the buffered answer paths (exact in-context ids
only — prose can never be a false positive).
"""

import ai_service
from ai_service import _strip_inline_ids

CARDS = [{"id": "fb9QaKkmjNvk4ueKybSv"}, {"id": "F7wwq0PWJh3cpyMaCbBt"}]


def test_scrub_removes_parenthesized_ids_and_husks():
    a = ("US retaliatory strikes and the renewal of oil sanctions "
         "(fb9QaKkmjNvk4ueKybSv, F7wwq0PWJh3cpyMaCbBt). More text.")
    assert _strip_inline_ids(a, CARDS) == (
        "US retaliatory strikes and the renewal of oil sanctions. More text.")


def test_scrub_removes_bracketed_single_id():
    assert _strip_inline_ids("Mixed [fb9QaKkmjNvk4ueKybSv] style.", CARDS) == "Mixed style."


def test_scrub_leaves_clean_prose_alone():
    a = "No ids here — parentheses (like these) survive."
    assert _strip_inline_ids(a, CARDS) == a


def test_scrub_only_touches_known_ids():
    a = "An unrelated token zzzzzzzzzzzzzzzzzzzz stays."
    assert _strip_inline_ids(a, CARDS) == a


def test_prompt_forbids_ids_in_answer_text():
    # The rule lives in the shared RAG prompt builder, so both the buffered
    # and streaming paths carry it.
    p = ai_service._build_rag_prompt("q", [{"id": "x", "title": "T"}])
    assert "NEVER write a source's id" in p


def test_prompt_demands_structured_long_answers():
    # The wall-of-text rule (owner report 2026-07-28): long answers must break
    # into paragraphs/bullets with optional bold mini-headings; short answers
    # stay plain. Lives in the shared builder so both paths carry it.
    p = ai_service._build_rag_prompt("q", [{"id": "x", "title": "T"}])
    assert "never return one unbroken block of text" in p.lower()
    assert "mini-heading" in p
    assert "Short answers (a few sentences) stay plain" in p
    # The rule must ALSO ride the output-format suffixes — the rules-list copy
    # alone was ignored in practice (owner report: 6-sentence single block).
    assert "FORMATTING of the answer text" in ai_service._CITED_JSON_SUFFIX
    assert "FORMATTING of the answer text" in ai_service._CITED_JSON_STRICT_SUFFIX
    assert "FORMATTING of the answer text" in ai_service._CITED_JSON_PARAPHRASE_SUFFIX
