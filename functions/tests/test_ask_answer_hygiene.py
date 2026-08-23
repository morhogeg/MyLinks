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


# ── the STREAMING path must scrub inline ids too (2026-08-23) ────────────────
# The buffered path runs _strip_inline_ids on the finished answer; the streaming
# path emits token-by-token, so without an in-stream scrub the same
# "(fb9QaKk…, F7wwq0P…)" garbage reaches the user — including ids split across
# chunk boundaries. These tests drive answer_from_context_stream with a fake
# stream and assert the emitted prose never contains a supplied id.

FULL_CARDS = [
    {"id": "fb9QaKkmjNvk4ueKybSv", "title": "Sanctions explainer", "summary": "s1"},
    {"id": "F7wwq0PWJh3cpyMaCbBt", "title": "Oil markets", "summary": "s2"},
]


def _stream_service(chunks):
    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)

    class _Chunk:
        def __init__(self, t):
            self.text = t

    class _Models:
        def generate_content_stream(self, **kwargs):
            return iter([_Chunk(t) for t in chunks])

    class _Client:
        pass

    svc.client = _Client()
    svc.client.models = _Models()
    return svc


def _run_stream(chunks, cards=FULL_CARDS):
    events = list(_stream_service(chunks).answer_from_context_stream("q", cards))
    prose = "".join(t for kind, t in events if kind == "token")
    cited = next((v for kind, v in events if kind == "citedIds"), None)
    return prose, cited, events


def test_stream_scrubs_inline_ids_even_across_chunk_boundaries():
    prose, cited, _ = _run_stream([
        "Oil sanctions were renewed (fb9QaKkmjN",
        "vk4ueKybSv, F7wwq0PWJh3cpyMaCbBt). More detail follows.",
        "\n[[CITED: fb9QaKkmjNvk4ueKybSv]]",
    ])
    for c in FULL_CARDS:
        assert c["id"] not in prose
    assert "()" not in prose and "( , )" not in prose
    assert "More detail follows." in prose
    assert cited == ["fb9QaKkmjNvk4ueKybSv"]


def test_stream_scrubs_bare_mid_prose_id():
    prose, cited, _ = _run_stream([
        "See fb9QaKkmjNvk4ueKybSv for the sanctions timeline.",
        "\n[[CITED: fb9QaKkmjNvk4ueKybSv, F7wwq0PWJh3cpyMaCbBt]]",
    ])
    assert "fb9QaKkmjNvk4ueKybSv" not in prose
    assert "sanctions timeline" in prose
    assert cited == ["fb9QaKkmjNvk4ueKybSv", "F7wwq0PWJh3cpyMaCbBt"]


def test_stream_without_ids_or_marker_flushes_everything_and_flags_ungrounded():
    prose, cited, events = _run_stream([
        "A perfectly ordinary answer ",
        "with (parentheses like these) intact.",
    ])
    assert prose == "A perfectly ordinary answer with (parentheses like these) intact."
    assert cited == []
    assert ("ungrounded", True) in events


def test_stream_marker_is_never_emitted_as_prose():
    prose, cited, _ = _run_stream([
        "Answer text.",
        "\n[[CITED: F7wwq0PWJh3cpyMaCbBt]]",
    ])
    assert "[[CITED" not in prose
    assert prose.strip() == "Answer text."
    assert cited == ["F7wwq0PWJh3cpyMaCbBt"]
