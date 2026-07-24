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


def test_card_block_omits_note_line_when_no_notes():
    block = _rag_card_block({"id": "x", "title": "T", "summary": "S"})
    assert "My note:" not in block


# ── _rag_card_block: deep content (the "walk me through the steps" fix) ─────
# The model can only be as specific as its context: a card's stored recipe
# steps, long-form detail, takeaway, and video highlights must reach the
# prompt, or every depth question degrades to a re-paraphrased summary.

def test_card_block_renders_recipe_ingredients_and_numbered_steps():
    block = _rag_card_block({
        "id": "r1",
        "title": "Pan con Tomate Recipe",
        "summary": "A simple appetizer.",
        "recipe": {
            "ingredients": ["4 slices rustic bread", "2 ripe tomatoes", "olive oil"],
            "instructions": ["Toast the bread", "Grate the tomatoes", "Spoon over the toast"],
            "servings": "4",
            "prep_time": "10 min",
        },
    })
    assert "Ingredients:" in block
    assert "- 4 slices rustic bread" in block
    assert "- olive oil" in block
    assert "Steps:" in block
    assert "1. Toast the bread" in block
    assert "2. Grate the tomatoes" in block
    assert "3. Spoon over the toast" in block
    assert "serves: 4" in block
    assert "prep: 10 min" in block


def test_card_block_renders_detail_takeaway_highlights_speakers():
    block = _rag_card_block({
        "id": "v1",
        "title": "T",
        "summary": "S",
        "detailedSummary": "## Key Points\n- The deep analysis body.",
        "actionableTakeaway": "Do the thing tomorrow.",
        "videoHighlights": ["2:15 — Explains the rule", "5:40 — The demo"],
        "speakers": ["Host Person", "Guest Person"],
    })
    assert "Detail:\n## Key Points" in block
    assert "The deep analysis body." in block
    assert "Takeaway: Do the thing tomorrow." in block
    assert "Video highlights:" in block
    assert "- 2:15 — Explains the rule" in block
    assert "Speakers: Host Person, Guest Person" in block


def test_card_block_renders_saved_date_from_unix_ms():
    # 2025-07-15T00:00:00Z in unix ms — the shape normalize_card_for_search emits.
    block = _rag_card_block({"id": "x", "title": "T", "createdAt": 1752537600000})
    assert "saved: 2025-07-15" in block


def test_card_block_omits_deep_sections_when_absent():
    block = _rag_card_block({"id": "x", "title": "T", "summary": "S"})
    for marker in ("Ingredients:", "Steps:", "Detail:", "Takeaway:",
                   "Video highlights:", "Speakers:", "saved:", "Recipe ("):
        assert marker not in block, marker


def test_card_block_ignores_malformed_deep_fields():
    # A recipe that isn't a dict / highlights that aren't a list must never
    # crash prompt assembly — the card degrades to its headline fields.
    block = _rag_card_block({
        "id": "x", "title": "T", "summary": "S",
        "recipe": "not-a-dict",
        "videoHighlights": "not-a-list",
        "createdAt": "not-a-number",
    })
    assert "[x]" in block
    assert "Ingredients:" not in block
    assert "saved:" not in block


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


def test_prompt_carries_format_matching_rules():
    # The chip contract: "walk me through the steps" must yield the actual
    # steps, follow-ups must add new information, and a request for specifics
    # must never come back as a rephrased overview.
    prompt = _build_rag_prompt("q?", [_card(1)])
    assert "COMPLETE numbered steps" in prompt
    assert "NEVER answer a request for specifics with a rephrased overview" in prompt
    assert "FOLLOW-UPS MUST ADD VALUE" in prompt


def test_prompt_includes_todays_date_for_recency_questions():
    from datetime import datetime, timezone
    prompt = _build_rag_prompt("q?", [_card(1)])
    assert datetime.now(timezone.utc).strftime("%Y-%m-%d") in prompt


def test_prompt_lists_excluded_titles_for_what_else_questions():
    prompt = _build_rag_prompt(
        "What else did I save on resilience?", [_card(1)],
        excluded_titles=["Argentina Comeback Analysis", "  ", None])
    assert "Already discussed with the user" in prompt
    assert "- Argentina Comeback Analysis" in prompt
    # Blank/None entries never render as empty bullets.
    assert "- \n" not in prompt


def test_prompt_omits_excluded_block_when_none():
    prompt = _build_rag_prompt("q?", [_card(1)])
    assert "Already discussed with the user" not in prompt


def test_prompt_carries_what_else_rule():
    prompt = _build_rag_prompt("q?", [_card(1)])
    assert '"What else…" questions' in prompt


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


def test_parse_marker_truncated_at_end_still_yields_ids():
    # Max-length/interrupted generation: the model named its ids but the
    # closing "]]" never arrived — those citations are real and must count.
    assert _parse_cited_marker("Answer.\n[[CITED: id1, id2") == ["id1", "id2"]


# ── answer_from_context_stream: empty stream is a failure, not a success ───

class _EmptyThenRealModels:
    """ASK model streams nothing; the fallback streams real chunks."""

    def __init__(self, pieces):
        self._pieces = pieces
        self.requested = []

    def generate_content_stream(self, model, contents, config=None):
        self.requested.append(model)
        if len(self.requested) == 1:
            return iter(())  # completes with zero chunks
        return iter(_FakeChunk(p) for p in self._pieces)


def test_stream_empty_answer_falls_back_to_analysis_model():
    models = _EmptyThenRealModels(["Real answer.\n", "[[CITED: id1]]"])
    svc = _svc_with_models(models)
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert models.requested == [GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL]
    assert "Real answer." in text
    assert cited == ["id1"]
    assert ungrounded is False


def test_stream_empty_on_both_models_raises():
    import pytest
    from ai_service import AnalysisError

    class _AlwaysEmpty:
        def __init__(self):
            self.requested = []

        def generate_content_stream(self, model, contents, config=None):
            self.requested.append(model)
            return iter(())

    models = _AlwaysEmpty()
    svc = _svc_with_models(models)
    with pytest.raises(AnalysisError):
        _drain(svc.answer_from_context_stream("q?", _CARDS))
    # ASK (verbatim) → ANALYSIS (verbatim) → ANALYSIS (paraphrase-safe) →
    # ANALYSIS (headline-only) before giving up.
    assert models.requested == [
        GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL,
        GEMINI_ANALYSIS_MODEL, GEMINI_ANALYSIS_MODEL]


def test_stream_empty_thrice_then_headline_context_recovers():
    """A PROMPT-blocked stream (empty on verbatim AND paraphrase framings)
    falls back to headline-only context — deep card content stripped — which
    clears the input filter and streams a real answer."""
    deep_cards = [{
        "id": "id1", "title": "Pasta", "summary": "A creamy pasta recipe.",
        "recipe": {"ingredients": ["500g pasta"], "instructions": ["Boil it"]},
        "detailedSummary": "RAW SCRAPED DETAIL", "userNote": "my private note",
    }]

    class _EmptyThriceThenReal:
        def __init__(self, pieces):
            self._pieces = pieces
            self.requested = []
            self.prompts = []

        def generate_content_stream(self, model, contents, config=None):
            self.requested.append(model)
            self.prompts.append(contents[0])
            if len(self.requested) <= 3:
                return iter(())  # verbatim ×2 + paraphrase all blocked
            return iter(_FakeChunk(p) for p in self._pieces)

    models = _EmptyThriceThenReal(["Headline answer.\n", "[[CITED: id1]]"])
    svc = _svc_with_models(models)
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", deep_cards))
    assert len(models.requested) == 4
    assert "Headline answer." in text
    assert cited == ["id1"]
    # The recovering attempt carried NO raw deep content, but kept the headline.
    assert "500g pasta" not in models.prompts[3]
    assert "RAW SCRAPED DETAIL" not in models.prompts[3]
    assert "my private note" not in models.prompts[3]
    assert "A creamy pasta recipe." in models.prompts[3]
    # …while the first (verbatim, full-context) attempt did carry it.
    assert "500g pasta" in models.prompts[0]


def test_stream_empty_verbatim_then_paraphrase_recovers():
    """An empty (RECITATION-signature) stream on both verbatim attempts gets one
    paraphrase-safe retry, which streams a real answer — no hard failure."""
    class _EmptyTwiceThenReal:
        def __init__(self, pieces):
            self._pieces = pieces
            self.requested = []
            self.prompts = []

        def generate_content_stream(self, model, contents, config=None):
            self.requested.append(model)
            self.prompts.append(contents[0])
            if len(self.requested) <= 2:
                return iter(())  # both verbatim attempts stream nothing
            return iter(_FakeChunk(p) for p in self._pieces)

    models = _EmptyTwiceThenReal(["Paraphrased answer.\n", "[[CITED: id1]]"])
    svc = _svc_with_models(models)
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", _CARDS))
    assert models.requested == [
        GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL, GEMINI_ANALYSIS_MODEL]
    assert "Paraphrased answer." in text
    assert cited == ["id1"]
    # The recovering attempt used the paraphrase framing, not the verbatim one.
    assert "YOUR OWN WORDS" in models.prompts[2]
    assert "YOUR OWN WORDS" not in models.prompts[0]


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
    assert out == {"answer": "A grounded answer.", "citedIds": ["id1"], "ungrounded": False,
                   "droppedCardIds": [], "filteredCards": []}
    assert svc._calls["n"] == 1  # never re-asked


def test_answer_retry_recovers_citation():
    svc = _svc_with_json_responses([
        {"answer": "First, uncited.", "citedIds": []},
        {"answer": "Second, now cited.", "citedIds": ["id2"]},
    ])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Second, now cited.", "citedIds": ["id2"], "ungrounded": False,
                   "droppedCardIds": [], "filteredCards": []}
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
    assert out == {"answer": "Uncited answer.", "citedIds": [], "ungrounded": True,
                   "droppedCardIds": [], "filteredCards": []}
    assert svc._calls["n"] == 3


# ── _answer_json: ask-tier model falls back to the proven analysis tier ────

def test_answer_falls_back_to_analysis_model_when_ask_model_fails():
    from ai_service import AnalysisError
    svc = _svc_with_json_responses([
        AnalysisError("ask model unavailable"),          # GEMINI_ASK_MODEL
        {"answer": "Recovered.", "citedIds": ["id1"]},   # GEMINI_ANALYSIS_MODEL
    ])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Recovered.", "citedIds": ["id1"], "ungrounded": False,
                   "droppedCardIds": [], "filteredCards": []}
    assert svc._calls["models"] == [GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL]


def test_buffered_empty_generation_retries_paraphrase_safe():
    """An EMPTY generation on both model tiers (the RECITATION signature — the
    verbatim-reproduction instruction blocked) triggers ONE paraphrase-safe
    re-ask, which recovers a real cited answer."""
    from ai_service import EmptyGenerationError
    svc = _svc_with_json_responses([
        EmptyGenerationError("Empty response from Gemini (finish_reason=RECITATION)"),  # ASK verbatim
        EmptyGenerationError("Empty response from Gemini (finish_reason=RECITATION)"),  # ANALYSIS verbatim
        {"answer": "Paraphrased, grounded.", "citedIds": ["id1"]},                       # paraphrase retry
    ])
    # Capture the prompts so we can prove the retry switched framing.
    seen = svc._generate_json
    prompts = []

    def _capture(contents, what, config_extra=None, model=None, attempts=None):
        prompts.append(contents[0])
        return seen(contents, what, config_extra=config_extra, model=model, attempts=attempts)

    svc._generate_json = _capture
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Paraphrased, grounded.", "citedIds": ["id1"], "ungrounded": False,
                   "droppedCardIds": [], "filteredCards": []}
    assert svc._calls["n"] == 3  # ask + analysis (both empty) + paraphrase retry
    assert "YOUR OWN WORDS" in prompts[2]
    assert "YOUR OWN WORDS" not in prompts[0]


def _svc_with_plain_ladder(schema_responses, plain_outcomes):
    """Fake service: `_generate_json` serves `schema_responses` in order and
    `_plain_answer` serves `plain_outcomes` (dict = success, Exception =
    raised), recording every plain prompt."""
    svc = _svc_with_json_responses(schema_responses)
    state = {"i": 0, "prompts": []}

    def fake_plain(prompt):
        state["prompts"].append(prompt)
        i = state["i"]
        state["i"] += 1
        out = plain_outcomes[i]
        if isinstance(out, Exception):
            raise out
        return out

    svc._plain_answer = fake_plain
    svc._plain_state = state
    return svc


def test_buffered_block_ladder_paraphrase_stage_recovers():
    """Plain full-depth fails (output-side kill) → the paraphrase framing is
    tried next, in plain mode, with the SAME full context."""
    from ai_service import AnalysisError, EmptyGenerationError
    deep_cards = [{
        "id": "id1", "title": "Pasta", "summary": "A creamy pasta recipe.",
        "recipe": {"ingredients": ["500g pasta"], "instructions": ["Boil it"]},
    }]
    svc = _svc_with_plain_ladder(
        [EmptyGenerationError("blocked", prompt_blocked=True)],
        [AnalysisError("plain full failed"),
         {"answer": "Paraphrased, grounded.", "citedIds": ["id1"]}])
    out = svc.answer_from_context("q?", deep_cards)
    assert out == {"answer": "Paraphrased, grounded.", "citedIds": ["id1"],
                   "ungrounded": False, "droppedCardIds": [], "filteredCards": []}
    prompts = svc._plain_state["prompts"]
    assert len(prompts) == 2
    assert "YOUR OWN WORDS" in prompts[1]      # paraphrase framing
    assert "500g pasta" in prompts[1]          # …but still FULL context


def test_buffered_block_ladder_headline_stage_strips_deep_content():
    """Full and paraphrase both fail → the headline stage sends every card as
    title+summary only (no raw deep content), still in plain mode."""
    from ai_service import AnalysisError, EmptyGenerationError
    deep_cards = [{
        "id": "id1", "title": "Pasta", "summary": "A creamy pasta recipe.",
        "recipe": {"ingredients": ["500g pasta"], "instructions": ["Boil it"]},
        "detailedSummary": "RAW SCRAPED DETAIL", "userNote": "my private note",
    }]
    svc = _svc_with_plain_ladder(
        [EmptyGenerationError("blocked", prompt_blocked=True)],
        [AnalysisError("plain full failed"),
         AnalysisError("plain paraphrase failed"),
         {"answer": "Grounded on headlines.", "citedIds": ["id1"]}])
    out = svc.answer_from_context("q?", deep_cards)
    assert out["answer"] == "Grounded on headlines."
    assert out["citedIds"] == ["id1"]
    headline = svc._plain_state["prompts"][2]
    assert "500g pasta" not in headline
    assert "RAW SCRAPED DETAIL" not in headline
    assert "my private note" not in headline
    assert "A creamy pasta recipe." in headline   # card still present


def test_buffered_block_ladder_uncited_reask_stays_plain_and_reduced():
    """When the ladder rescued at the headline stage and the answer is
    UNCITED, the strict citation re-ask must stay in PLAIN mode (schema is
    what blocked) and reuse the reduced context."""
    from ai_service import AnalysisError, EmptyGenerationError
    deep_cards = [{
        "id": "id1", "title": "Pasta", "summary": "A creamy pasta recipe.",
        "recipe": {"ingredients": ["500g pasta"], "instructions": ["Boil it"]},
    }]
    svc = _svc_with_plain_ladder(
        [EmptyGenerationError("blocked", prompt_blocked=True)],
        [AnalysisError("plain full failed"),
         AnalysisError("plain paraphrase failed"),
         {"answer": "Uncited.", "citedIds": []},          # headline stage
         {"answer": "Now cited.", "citedIds": ["id1"]}])  # plain strict re-ask
    out = svc.answer_from_context("q?", deep_cards)
    assert out["answer"] == "Now cited."
    assert out["citedIds"] == ["id1"]
    assert svc._calls["n"] == 1  # schema was hit exactly once, never again
    reask = svc._plain_state["prompts"][3]
    assert "500g pasta" not in reask  # reduced context carried into the re-ask


def test_buffered_block_ladder_final_salvage_drops_poison_in_plain_mode():
    """All three plain stages fail → the final stage probe-isolates the poison
    card and generates from the salvaged context IN PLAIN MODE, disclosing the
    exclusion."""
    from ai_service import AnalysisError, EmptyGenerationError
    cards = [
        {"id": "clean1", "title": "Fine card", "summary": "Totally fine."},
        {"id": "poison", "title": "Bad card", "summary": "Bad summary."},
    ]
    svc = _svc_with_plain_ladder(
        [EmptyGenerationError("blocked", prompt_blocked=True)],
        [AnalysisError("s1"), AnalysisError("s2"), AnalysisError("s3"),
         {"answer": "From the clean rest.", "citedIds": ["clean1"]}])
    svc._drop_prompt_blocked_cards = (
        lambda q, c, h=None, x=None, max_drops=3: ([cards[0]], [cards[1]], False))
    svc._best_clean_variant = lambda q, b, pc, h=None, x=None: (None, None)
    out = svc.answer_from_context("q?", cards)
    assert out["answer"].startswith("From the clean rest.")
    assert 'Your saved card "Bad card" could not be included' in out["answer"]
    assert out["droppedCardIds"] == ["poison"]
    # The salvage generation ran in plain mode with only the clean card.
    final = svc._plain_state["prompts"][3]
    assert "Bad summary." not in final
    assert "Fine card" in final


def test_buffered_block_ladder_exhausted_raises_with_stage():
    """All three plain stages fail → a stage-tagged error surfaces so the
    diag names the exhausted ladder instead of an opaque block."""
    import pytest
    from ai_service import AnalysisError, EmptyGenerationError
    svc = _svc_with_plain_ladder(
        [EmptyGenerationError("blocked", prompt_blocked=True)],
        [AnalysisError("s1"), AnalysisError("s2"), AnalysisError("s3")])
    with pytest.raises(EmptyGenerationError) as exc_info:
        svc.answer_from_context("q?", _CARDS)
    assert "plain-mode ladder exhausted" in str(exc_info.value)
    assert exc_info.value.prompt_blocked is True


def test_buffered_prompt_block_rescued_by_plain_mode_first():
    """A schema-mode prompt block is FIRST retried as a plain (schema-less)
    generation with the identical full-depth prompt — no card is touched."""
    from ai_service import EmptyGenerationError
    svc = _svc_with_plain_ladder(
        [EmptyGenerationError("blocked", prompt_blocked=True)],
        [{"answer": "Full-depth plain answer.", "citedIds": ["id1"]}])
    out = svc.answer_from_context("q?", _CARDS)
    assert out == {"answer": "Full-depth plain answer.", "citedIds": ["id1"],
                   "ungrounded": False, "droppedCardIds": [], "filteredCards": []}
    assert len(svc._plain_state["prompts"]) == 1
    assert svc._calls["n"] == 1  # only the schema attempt hit _generate_json


def test_stream_block_salvages_poison_card_with_toxic_field_excised():
    """Stream mirror of the salvage rescue: all four ladder attempts stream
    nothing, the probe bisection finds the poison card, the salvage excises
    only its toxic field, and a fifth attempt streams a real answer — followed
    by the disclosure note."""
    cards = [
        {"id": "clean1", "title": "Fine card", "summary": "Totally fine."},
        {"id": "poison", "title": "Pasta card", "summary": "TOXIC SUMMARY",
         "recipe": {"ingredients": ["500g pasta"], "instructions": ["Boil it"]}},
    ]

    class _EmptyLadderThenReal:
        def __init__(self, pieces):
            self._pieces = pieces
            self.requested = []
            self.prompts = []

        def generate_content_stream(self, model, contents, config=None):
            self.requested.append(model)
            self.prompts.append(contents[0])
            if len(self.requested) <= 4:
                return iter(())  # the whole static ladder streams nothing
            return iter(_FakeChunk(p) for p in self._pieces)

    models = _EmptyLadderThenReal(["Clean answer.\n", "[[CITED: poison]]"])
    svc = _svc_with_models(models)
    svc._probe_prompt_blocked = lambda prompt: "TOXIC SUMMARY" in prompt
    text, cited, ungrounded = _drain(svc.answer_from_context_stream("q?", cards))
    assert len(models.requested) == 5
    assert "Clean answer." in text
    # The salvaged card is citable and the withholding is disclosed post-answer.
    assert cited == ["poison"]
    assert 'Some details of "Pasta card" were withheld' in text
    final = models.prompts[4]
    assert "TOXIC SUMMARY" not in final
    assert "Pasta card" in final
    assert "500g pasta" in final
    assert "Fine card" in final


def test_buffered_non_empty_failure_does_not_paraphrase_retry():
    """A NON-empty transport failure (not the RECITATION signature) must NOT be
    swallowed into a paraphrase retry — it propagates so the caller surfaces the
    sanitized error and refunds the ask unit."""
    import pytest
    from ai_service import AnalysisError
    svc = _svc_with_json_responses([
        AnalysisError("AI answer failed: 500 backend error"),   # ASK
        AnalysisError("AI answer failed: 500 backend error"),   # ANALYSIS fallback
    ])
    with pytest.raises(AnalysisError):
        svc.answer_from_context("q?", _CARDS)
    assert svc._calls["n"] == 2  # no third (paraphrase) attempt


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


def test_stream_falls_back_when_first_attempt_fails_before_output():
    """A transport failure on the first stream attempt (before any output)
    retries on the next ladder attempt instead of failing the ask. (The ask
    and analysis tiers share a model id since 2026-07-24, so the fake fails
    by call order, not by model name.)"""
    class _FailFirstThenReal:
        def __init__(self, pieces):
            self._pieces = pieces
            self.requested = []

        def generate_content_stream(self, model, contents, config=None):
            self.requested.append(model)
            if len(self.requested) == 1:
                raise RuntimeError("transient transport failure")
            return iter(_FakeChunk(p) for p in self._pieces)

    models = _FailFirstThenReal(["Answer body.\n", "[[CITED: id1]]"])
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
    # Every attempt errors before output: ASK, then ANALYSIS three times
    # (verbatim + paraphrase-safe + headline-only) before the failure surfaces.
    assert models.requested == [
        GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL,
        GEMINI_ANALYSIS_MODEL, GEMINI_ANALYSIS_MODEL]


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
    # 2026-07-24: the "tier up" id gemini-3.1-flash proved to be a 404 in
    # production (CI ask-debug probes) — the ask tier is pinned back to the
    # proven analysis model until a real higher-tier id is verified.
    assert GEMINI_ASK_MODEL == GEMINI_ANALYSIS_MODEL
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
