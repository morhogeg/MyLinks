"""ai_service RAG prompt assembly: _rag_source_label / _rag_card_block /
_build_rag_prompt.

Pure string builders — no Gemini call, no network. (answer_from_context_stream
parses the ``[[CITED: ...]]`` marker inline against a live stream, so there's
nothing importable to unit-test offline; see final report note.)
"""

from ai_service import _rag_source_label, _rag_card_block, _build_rag_prompt


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
