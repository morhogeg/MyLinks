"""ai_service RAG prompt assembly + the "citations are a hard invariant" logic.

Covers the pure string builders (_rag_source_label / _rag_card_block /
_build_rag_prompt), the pure citation helpers (_valid_cited_ids /
_parse_cited_marker), and the retry/ungrounded-flag decision in both RAG paths
(answer_from_context buffered re-ask; answer_from_context_stream after-the-fact
flag). The model call itself is stubbed — no Gemini, no network — so the trust
invariant is verified deterministically offline.
"""

from ai_service import (
    _rag_source_label,
    _rag_card_block,
    _build_rag_prompt,
    _valid_cited_ids,
    _parse_cited_marker,
    GeminiService,
    GEMINI_ASK_MODEL,
    GEMINI_ANALYSIS_MODEL,
)


# ── _rag_source_label ─────────────────────────────────────────────────────

def test_source_label_prefers_explicit_source_name():
    assert _rag_source_label({"sourceName": "CNN", "url": "https://x.com"}) == "CNN"


def test_source_label_strips_www_from_host():
    assert _rag_source_label({"url": "https://www.example.com/path"}) == "example.com"


def test_source_label_falls_back_to_host_when_name_is_placeholder():
    for bad in ("none", "screenshot", "unknown"):
        assert _rag_source_label({"sourceName": bad, "url": "https://foo.org"}) == "foo.org"


def test_source_label_empty_when_no_name_or_url():
    assert _rag_source_label({}) == ""


# ── _rag_card_block ───────────────────────────────────────────────────────

def test_card_block_contains_id_title_summary_and_meta():
    block = _rag_card_block({
        "id": "abc123",
        "title": "My Title",
        "summary": "A short summary.",
        "sourceName": "CNN",
        "category": "News",
        "tags": ["ai", "policy"],
    })
    assert "[abc123]" in block
    assert "My Title" in block
    assert "A short summary." in block
    assert "source: CNN" in block
    assert "category: News" in block
    assert "tags: ai, policy" in block


def test_card_block_uses_defaults_for_sparse_card():
    block = _rag_card_block({"id": "x"})
    assert "[x]" in block
    assert "Untitled" in block
    assert "category: General" in block
    assert "tags: " in block


def test_card_block_includes_legacy_user_note():
    block = _rag_card_block({"id": "x", "title": "T", "userNote": "my own take"})
    assert "My note: my own take" in block


def test_card_block_includes_multi_note_array():
    # Every note the user wrote is surfaced to the model, not just the first.
    block = _rag_card_block({
        "id": "x", "title": "T",
        "userNotes": [
            {"id": "a", "text": "first note", "createdAt": 2},
            {"id": "b", "text": "second note", "createdAt": 1},
        ],
    })
    assert "My note:" in block
    assert "first note" in block
    assert "second note" in block


def test_card_block_survives_non_string_tags():
    # One numeric tag on a retrieved card must not TypeError the whole RAG
    # prompt build (which sat outside ask_brain's retrieval try → 500).
    block = _rag_card_block({"id": "x", "title": "T", "tags": [2024, "ai"]})
    assert "2024" in block and "ai" in block


def test_card_block_caps_note_length():
    # Notes are the one client-controlled field that was folded in unbounded —
    # a multi-KB note must be clamped so 15 cards can't balloon the paid prompt.
    from ai_service import _RAG_NOTE_MAX_CHARS
    block = _rag_card_block({"id": "x", "title": "T", "userNote": "n" * 50_000})
    assert len(block) < _RAG_NOTE_MAX_CHARS + 500


def test_prompt_survives_junk_history_items():
    # history is client-supplied: a stray string / number in the list must be
    # skipped, not AttributeError the ask.
    prompt = _build_rag_prompt("q", [{"id": "a", "title": "T"}],
                               history=["junk", 42, {"role": "user", "content": "real"}])
    assert "real" in prompt


def test_card_block_omits_note_line_when_no_notes():
    block = _rag_card_block({"id": "x", "title": "T", "summary": "S"})
    assert "My note:" not in block


# ── _build_rag_prompt ─────────────────────────────────────────────────────

def _card(i):
    return {"id": f"id{i}", "title": f"Title {i}", "summary": f"Summary {i}"}


def test_prompt_includes_question_and_sources():
    prompt = _build_rag_prompt("What did I save about sleep?", [_card(1), _card(2)])
    assert "What did I save about sleep?" in prompt
    assert "[id1]" in prompt and "[id2]" in prompt
    assert "Saved sources:" in prompt
    # No history section when none supplied.
    assert "Earlier in this conversation:" not in prompt


def test_prompt_includes_history_when_provided():
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello there"},
    ]
    prompt = _build_rag_prompt("q?", [_card(1)], history)
    assert "Earlier in this conversation:" in prompt
    assert "User: hi" in prompt
    assert "Assistant: hello there" in prompt


def test_prompt_respects_six_turn_history_window():
    # 8 turns supplied; only the last 6 should appear.
    history = [{"role": "user", "content": f"turn{i}"} for i in range(8)]
    prompt = _build_rag_prompt("q?", [_card(1)], history)
    assert "turn0" not in prompt
    assert "turn1" not in prompt
    for i in range(2, 8):
        assert f"turn{i}" in prompt


def test_prompt_non_user_role_renders_as_assistant():
    # Any role that isn't exactly "user" is labelled Assistant.
    history = [{"role": "system", "content": "sys note"}]
    prompt = _build_rag_prompt("q?", [_card(1)], history)
    assert "Assistant: sys note" in prompt


def test_prompt_carries_grounding_rules():
    prompt = _build_rag_prompt("q?", [_card(1)])
    # A couple of load-bearing instruction lines the model depends on.
    assert "USING ONLY the saved sources" in prompt
    assert "match the user's language" in prompt


# ── _valid_cited_ids ──────────────────────────────────────────────────────

_CARDS = [{"id": "id1"}, {"id": "id2"}, {"id": "id3"}]


def test_valid_cited_keeps_only_supplied_ids():
    assert _valid_cited_ids(["id2", "id9", "id1"], _CARDS) == ["id2", "id1"]


def test_valid_cited_drops_duplicates_preserving_order():
    assert _valid_cited_ids(["id1", "id1", "id2"], _CARDS) == ["id1", "id2"]


def test_valid_cited_handles_none_and_non_list():
    assert _valid_cited_ids(None, _CARDS) == []
    assert _valid_cited_ids("id1", _CARDS) == []
    assert _valid_cited_ids(123, _CARDS) == []


def test_valid_cited_survives_unhashable_and_non_string_ids():
    # The docstring promises defense against "non-string ids" — a dict/list
    # element (schema slip on citedIds) used to TypeError the set lookup and
    # 500 the whole ask instead of just dropping the bad citation.
    cards = [{"id": "a"}, {"id": "b"}]
    assert _valid_cited_ids([{"id": "a"}, ["b"], "a", 7], cards) == ["a"]


def test_valid_cited_null_id_never_validates():
    # A card missing its id puts None in the valid set; citedIds:[null] must
    # not come back as a "valid" citation.
    assert _valid_cited_ids([None], [{"title": "no id"}]) == []


def test_valid_cited_empty_when_no_overlap():
    assert _valid_cited_ids(["nope", "gone"], _CARDS) == []


# ── _parse_cited_marker ───────────────────────────────────────────────────

def test_parse_marker_extracts_ids():
    assert _parse_cited_marker("Some answer.\n[[CITED: id1, id2]]") == ["id1", "id2"]


def test_parse_marker_trims_and_drops_blanks():
    assert _parse_cited_marker("[[CITED:  id1 ,  , id2 ]]") == ["id1", "id2"]


def test_parse_marker_missing_returns_empty():
    assert _parse_cited_marker("Answer with no marker at all.") == []
    assert _parse_cited_marker("") == []
    assert _parse_cited_marker(None) == []


def test_parse_marker_multiline():
    assert _parse_cited_marker("ans\n[[CITED: a,\n b]]") == ["a", "b"]


# ── answer_from_context: retry + ungrounded flag (buffered path) ───────────

def _svc_with_json_responses(responses):
    """A GeminiService whose model call is stubbed to return `responses` in
    order, recording how many times it was invoked."""
    svc = GeminiService.__new__(GeminiService)
    svc.client = object()  # truthy → passes the "configured" guard
    calls = {"n": 0}

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=None):
        # `model` accepts the RAG paths' GEMINI_ASK_MODEL override; `attempts`
        # accepts the synchronous callers' reduced retry budget.
        calls.setdefault("models", []).append(model)
        calls.setdefault("attempts", []).append(attempts)
        i = calls["n"]
        calls["n"] += 1
        resp = responses[i]
        if isinstance(resp, Exception):
            raise resp
        return resp

    svc._generate_json = fake_generate_json
    svc._calls = calls
    return svc


def test_answer_first_pass_cited_no_retry():
    svc = _svc_with_json_responses([
        {"answer": "A grounded answer.", "citedIds": ["id1"]},
    ])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "A grounded answer.", "citedIds": ["id1"], "ungrounded": False}
    assert svc._calls["n"] == 1  # never re-asked


def test_answer_retry_recovers_citation():
    svc = _svc_with_json_responses([
        {"answer": "First, uncited.", "citedIds": []},
        {"answer": "Second, now cited.", "citedIds": ["id2"]},
    ])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Second, now cited.", "citedIds": ["id2"], "ungrounded": False}
    assert svc._calls["n"] == 2  # re-asked exactly once


def test_answer_flags_ungrounded_when_retry_still_uncited():
    svc = _svc_with_json_responses([
        {"answer": "Confident but uncited.", "citedIds": []},
        {"answer": "Still nothing valid.", "citedIds": ["hallucinated"]},
    ])
    out = svc.answer_from_context("q?", _CARDS)
    # Keeps the first answer, empty citations, flagged so the UI downgrades.
    assert out["ungrounded"] is True
    assert out["citedIds"] == []
    assert out["answer"] == "Confident but uncited."
    assert svc._calls["n"] == 2


def test_answer_retry_exception_still_flags_ungrounded():
    from ai_service import AnalysisError
    svc = _svc_with_json_responses([
        {"answer": "Uncited answer.", "citedIds": []},
        # The citation retry fails on BOTH models (_answer_json falls back to
        # the analysis model before giving up), so it takes two failures for
        # the retry to be abandoned and the first answer flagged ungrounded.
        AnalysisError("ask model failure"),
        AnalysisError("fallback model failure"),
    ])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Uncited answer.", "citedIds": [], "ungrounded": True}
    assert svc._calls["n"] == 3


# ── _answer_json: ask-tier model falls back to the proven analysis tier ────

def test_answer_falls_back_to_analysis_model_when_ask_model_fails():
    from ai_service import AnalysisError
    svc = _svc_with_json_responses([
        AnalysisError("ask model unavailable"),          # GEMINI_ASK_MODEL
        {"answer": "Recovered.", "citedIds": ["id1"]},   # GEMINI_ANALYSIS_MODEL
    ])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Recovered.", "citedIds": ["id1"], "ungrounded": False}
    assert svc._calls["models"] == [GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL]


def test_answer_raises_when_both_models_fail():
    import pytest
    from ai_service import AnalysisError
    svc = _svc_with_json_responses([
        AnalysisError("ask model unavailable"),
        AnalysisError("fallback also down"),
    ])
    with pytest.raises(AnalysisError):
        svc.answer_from_context("q?", _CARDS)
    assert svc._calls["models"] == [GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL]


def test_answer_empty_library_is_not_ungrounded():
    svc = _svc_with_json_responses([])  # model must never be called
    out = svc.answer_from_context("q?", [])
    assert out["ungrounded"] is False
    assert out["citedIds"] == []
    assert "couldn't find anything" in out["answer"].lower()
    assert svc._calls["n"] == 0


# ── answer_from_context_stream: after-the-fact ungrounded flag ─────────────

class _FakeChunk:
    def __init__(self, text):
        self.text = text


class _FakeModels:
    def __init__(self, pieces):
        self._pieces = pieces
        self.used_model = None

    def generate_content_stream(self, model, contents, config=None):
        self.used_model = model
        return iter(_FakeChunk(p) for p in self._pieces)


class _FakeClient:
    def __init__(self, pieces):
        self.models = _FakeModels(pieces)


def _svc_with_stream(pieces):
    svc = GeminiService.__new__(GeminiService)
    svc.client = _FakeClient(pieces)
    svc.model = "fake-model"
    return svc


def _drain(gen):
    tokens, cited, ungrounded = [], None, False
    for kind, payload in gen:
        if kind == "token":
            tokens.append(payload)
        elif kind == "citedIds":
            cited = payload
        elif kind == "ungrounded":
            ungrounded = payload
    return "".join(tokens), cited, ungrounded


def test_stream_with_valid_marker_not_flagged():
    svc = _svc_with_stream(["Grounded answer body.\n", "[[CITED: id1, id2]]"])
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert "Grounded answer body." in text
    assert "[[CITED:" not in text  # marker never surfaced to the user
    assert cited == ["id1", "id2"]
    assert ungrounded is False


def test_stream_without_marker_flagged_ungrounded():
    svc = _svc_with_stream(["An answer with no citation marker at all."])
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert text == "An answer with no citation marker at all."
    assert cited == []
    assert ungrounded is True


def test_stream_with_only_invalid_ids_flagged_ungrounded():
    svc = _svc_with_stream(["Body.\n", "[[CITED: hallucinated]]"])
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert cited == []
    assert ungrounded is True


# ── answer_from_context_stream: ask-tier model fallback ────────────────────

class _SelectiveFailModels:
    """generate_content_stream that raises for `bad_models` and streams
    `pieces` for anything else, recording every model requested."""

    def __init__(self, pieces, bad_models):
        self._pieces = pieces
        self._bad = set(bad_models)
        self.requested = []

    def generate_content_stream(self, model, contents, config=None):
        self.requested.append(model)
        if model in self._bad:
            raise RuntimeError(f"model not found: {model}")
        return iter(_FakeChunk(p) for p in self._pieces)


class _MidStreamFailModels:
    """Streams one real chunk, then dies — a mid-stream failure AFTER output."""

    def __init__(self):
        self.requested = []

    def generate_content_stream(self, model, contents, config=None):
        self.requested.append(model)

        def gen():
            yield _FakeChunk("Some prose that is safely emitted right away. ")
            raise RuntimeError("stream died mid-answer")
        return gen()


def _svc_with_models(models_obj):
    svc = GeminiService.__new__(GeminiService)
    svc.client = type("C", (), {"models": models_obj})()
    svc.model = GEMINI_ANALYSIS_MODEL
    return svc


def test_stream_falls_back_when_ask_model_fails_before_output():
    models = _SelectiveFailModels(
        ["Answer body.\n", "[[CITED: id1]]"], bad_models={GEMINI_ASK_MODEL})
    svc = _svc_with_models(models)
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert models.requested == [GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL]
    assert "Answer body." in text
    assert "[[CITED:" not in text
    assert cited == ["id1"]
    assert ungrounded is False


def test_stream_raises_when_both_models_fail():
    import pytest
    from ai_service import AnalysisError
    models = _SelectiveFailModels(
        [], bad_models={GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL})
    svc = _svc_with_models(models)
    with pytest.raises(AnalysisError):
        _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert models.requested == [GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL]


def test_stream_no_fallback_after_tokens_emitted():
    """A failure after prose reached the client must NOT restart on the
    fallback model — that would stream the answer twice."""
    import pytest
    from ai_service import AnalysisError
    models = _MidStreamFailModels()
    svc = _svc_with_models(models)
    with pytest.raises(AnalysisError):
        _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert models.requested == [GEMINI_ASK_MODEL]  # never retried


def test_stream_empty_library_not_flagged():
    svc = _svc_with_stream([])  # generate_content_stream never reached
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", []))
    assert cited == []
    assert ungrounded is False
    assert "couldn't find anything" in text.lower()


# ── RAG answer paths use the higher-tier ASK model, not analysis flash-lite ──

def test_buffered_answer_uses_ask_model_on_both_passes():
    from ai_service import GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL
    assert GEMINI_ASK_MODEL != GEMINI_ANALYSIS_MODEL  # it's genuinely a tier up
    # First pass uncited → forces the strict re-ask; BOTH calls must use ASK model.
    svc = _svc_with_json_responses([
        {"answer": "uncited", "citedIds": []},
        {"answer": "now cited", "citedIds": ["id2"]},
    ])
    svc.answer_from_context("q?", _CARDS)
    assert svc._calls["models"] == [GEMINI_ASK_MODEL, GEMINI_ASK_MODEL]


def test_stream_answer_uses_ask_model():
    from ai_service import GEMINI_ASK_MODEL
    svc = _svc_with_stream(["Body.\n", "[[CITED: id1]]"])
    _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert svc.client.models.used_model == GEMINI_ASK_MODEL
