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
