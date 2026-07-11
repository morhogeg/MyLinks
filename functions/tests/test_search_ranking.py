"""Pure ranking/embedding-text helpers in search.py (Weakness #2 — Ask/search).

Covers, all offline over plain dicts (no Firestore, no Gemini):
  - build_embedding_text: the RICH v2 recipe that folds detailedSummary /
    takeaway / concepts / highlights into the vector (the fix for details being
    invisible to Ask), plus its truncation guard and placeholder handling.
  - keyword_query_tokens / keyword_match_score: the lexical fallback's tokenizer
    and title-weighted scorer (extracted so the fallback and rerank agree).
  - rerank_candidates: deepen-then-rerank — a card the pure vector rank buried
    but which literally matches the query is lifted back into the model context.

conftest installs the offline fakes (incl. the firebase_functions decorator
shim) so `import search` — which has module-level @firestore_fn/@https_fn
decorators — works with plain pytest.
"""

from search import (
    build_embedding_text,
    keyword_query_tokens,
    keyword_match_score,
    rerank_candidates,
    EMBED_TEXT_VERSION,
    _EMBED_TEXT_MAX_CHARS,
)


# ── build_embedding_text ───────────────────────────────────────────────────

def test_embed_text_folds_in_the_rich_fields():
    text = build_embedding_text({
        "title": "Intermittent fasting study",
        "summary": "MIT found a 40% drop.",
        "detailedSummary": "## Key Points\n- Benefits appeared after **2 weeks**.",
        "tags": ["health", "fasting"],
        "concepts": ["Metabolic Health"],
        "metadata": {"actionableTakeaway": "Try a 16:8 window."},
        "videoHighlights": ["2:15 — the 2-week mark"],
    })
    # The detail that never made the 2-4 sentence blurb is now IN the vector text.
    assert "2 weeks" in text
    assert "Key Points" in text
    assert "Try a 16:8 window." in text
    assert "Metabolic Health" in text
    assert "2:15" in text
    # And the old fields are still there.
    assert "Intermittent fasting study" in text
    assert "MIT found a 40% drop." in text
    assert "health, fasting" in text


def test_embed_text_order_puts_headline_before_detail():
    # Title/summary/details lead so truncation only ever drops the low-value tail.
    text = build_embedding_text({
        "title": "T", "summary": "S", "detailedSummary": "D",
        "tags": ["tag"], "concepts": ["C"],
    })
    assert text.index("Title: T") < text.index("Summary: S") < text.index("Details: D")
    assert text.index("Details: D") < text.index("Tags:") < text.index("Concepts:")


def test_embed_text_omits_missing_fields_cleanly():
    text = build_embedding_text({"title": "Only a title"})
    assert text == "Title: Only a title"
    # No empty "Summary:" / "Tags:" lines for absent fields.
    assert "Summary:" not in text
    assert "Tags:" not in text


def test_embed_text_empty_for_placeholder_card():
    # A processing/empty card has nothing to embed → "" (the trigger guards on this).
    assert build_embedding_text({}) == ""
    assert build_embedding_text({"title": "", "summary": ""}) == ""


def test_embed_text_is_truncated_to_model_budget():
    huge = "x" * 50_000
    text = build_embedding_text({"title": "T", "detailedSummary": huge})
    assert len(text) == _EMBED_TEXT_MAX_CHARS


def test_embed_version_is_current():
    assert EMBED_TEXT_VERSION >= 2  # v1 was the too-thin title+summary+tags recipe


# ── keyword_query_tokens / keyword_match_score ─────────────────────────────

def test_query_tokens_drop_stopwords_and_shorts():
    toks = keyword_query_tokens("What did I save about the CRISPR gene editing?")
    assert "crispr" in toks and "gene" in toks and "editing" in toks
    # stopwords + <3-char tokens dropped
    assert "the" not in toks and "did" not in toks and "i" not in toks


def test_query_tokens_empty_for_all_stopwords():
    assert keyword_query_tokens("what is it about?") == set()


def test_match_score_weights_title_above_body():
    tokens = {"crispr"}
    title_hit = {"title": "CRISPR explained", "summary": "gene editing"}
    body_hit = {"title": "Gene editing", "summary": "uses CRISPR"}
    # Title hit scores 3 (2 title + 1 haystack); body-only hit scores 1.
    assert keyword_match_score(title_hit, tokens) == 3
    assert keyword_match_score(body_hit, tokens) == 1
    assert keyword_match_score(title_hit, tokens) > keyword_match_score(body_hit, tokens)


def test_match_score_zero_without_tokens_or_hits():
    assert keyword_match_score({"title": "anything"}, set()) == 0
    assert keyword_match_score({"title": "nothing relevant"}, {"crispr"}) == 0


def test_match_score_scans_tags_source_category():
    tokens = {"fasting"}
    assert keyword_match_score({"title": "Diet", "tags": ["fasting"]}, tokens) == 1
    assert keyword_match_score({"title": "Diet", "category": "Fasting"}, tokens) == 1


# ── rerank_candidates ──────────────────────────────────────────────────────

def _cand(cid, title="", summary="", created=0):
    return {"id": cid, "title": title, "summary": summary, "createdAt": created}


def test_rerank_keeps_vector_order_when_no_keyword_signal():
    # No query tokens overlap → pure vector rank order preserved.
    cands = [_cand("a"), _cand("b"), _cand("c")]
    out = rerank_candidates("zzz", cands, top_k=3)
    assert [c["id"] for c in out] == ["a", "b", "c"]


def test_rerank_lifts_buried_literal_match_into_topk():
    # Realistic deepen-then-rerank: 25 vector candidates, and the card that
    # literally answers the question is buried at rank 20 (out of the top-10 the
    # model would otherwise see). Its keyword overlap must lift it INTO top-10,
    # above the middling non-matching cards it was sitting behind.
    cands = [_cand(f"v{i}", title=f"unrelated topic {i}", created=1) for i in range(25)]
    cands[20] = _cand("hit", title="sleep and recovery habits",
                      summary="how to improve deep sleep", created=1)
    out = [c["id"] for c in rerank_candidates("how do I improve my sleep", cands, top_k=10)]
    assert "hit" in out                     # rescued from rank 20 into the context
    assert "v24" not in out                 # a genuinely far, non-matching card stays out


def test_rerank_keyword_card_outranks_nearer_nonmatch():
    # A keyword match a bit deeper beats a nearer card with no lexical signal.
    cands = [_cand(f"v{i}", title=f"topic {i}", created=1) for i in range(20)]
    cands[15] = _cand("hit", title="sleep hygiene", summary="improve sleep", created=1)
    out = [c["id"] for c in rerank_candidates("improve sleep", cands, top_k=20)]
    assert out.index("hit") < out.index("v12")  # lifted above a nearer non-match


def test_rerank_truncates_to_top_k():
    cands = [_cand(str(i)) for i in range(30)]
    assert len(rerank_candidates("q", cands, top_k=10)) == 10


def test_rerank_empty_is_empty():
    assert rerank_candidates("q", [], top_k=10) == []


def test_rerank_recency_breaks_ties():
    # Same vector rank pressure + no keyword signal: newer edges out older only as
    # a gentle tiebreak, never overturning a clear vector-rank lead.
    cands = [_cand("old", created=1), _cand("new", created=1_000_000)]
    out = rerank_candidates("zzz", cands, top_k=2)
    # 'old' is nearer by vector (rank 0) so it still leads; recency doesn't flip it.
    assert out[0]["id"] == "old"
