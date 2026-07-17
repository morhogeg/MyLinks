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
    _EMBED_TEXT_MAX_CHARS,
)
from ai_service import collect_notes_text


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


def test_embed_text_folds_in_user_note():
    # The user's own note (their voice) is embedded so a card is findable by what
    # the user wrote about it — placed after Details, before Tags. Legacy single
    # `userNote` string still works after the multi-note change.
    text = build_embedding_text({
        "title": "T", "summary": "S", "detailedSummary": "D",
        "userNote": "reminded me of the 2008 crash", "tags": ["tag"],
    })
    assert "Note: reminded me of the 2008 crash" in text
    assert text.index("Details: D") < text.index("Note:") < text.index("Tags:")


def test_embed_text_folds_in_multi_note_array():
    # v4: the multi-note `userNotes` array is embedded too — every note's text,
    # so a card is findable by ANY of the user's notes, not just the first.
    text = build_embedding_text({
        "title": "T", "summary": "S",
        "userNotes": [
            {"id": "a", "text": "first take on it", "createdAt": 2},
            {"id": "b", "text": "second thought later", "createdAt": 1},
        ],
        "tags": ["tag"],
    })
    assert "first take on it" in text
    assert "second thought later" in text
    assert text.index("Note:") < text.index("Tags:")


def test_embed_text_merges_legacy_and_array_notes():
    # A card mid-migration (both shapes) contributes both to the embedding.
    text = build_embedding_text({
        "title": "T",
        "userNote": "legacy note",
        "userNotes": [{"id": "a", "text": "array note", "createdAt": 1}],
    })
    assert "legacy note" in text
    assert "array note" in text


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


def test_embed_text_coerces_non_string_tags_and_concepts():
    # A numeric tag/concept (older client or direct Firestore write) must fold
    # in as text — a TypeError here silently left the card unembedded via
    # sync_link_embedding's blanket except, and aborted a whole backfill run.
    text = build_embedding_text({"title": "T", "tags": [2024, "ai"], "concepts": [3.5, "systems"]})
    assert "2024" in text and "ai" in text
    assert "3.5" in text and "systems" in text


def test_embed_text_survives_non_dict_metadata():
    # metadata: "oops" (schema drift) — `meta.get` used to AttributeError.
    text = build_embedding_text({"title": "T", "metadata": "oops"})
    assert "Title: T" in text


# ── collect_notes_text (shared legacy+array note reader) ───────────────────

def test_collect_notes_text_legacy_only():
    assert collect_notes_text({"userNote": "just one"}) == "just one"


def test_collect_notes_text_array_only():
    out = collect_notes_text({"userNotes": [
        {"id": "a", "text": "one", "createdAt": 1},
        {"id": "b", "text": "two", "createdAt": 2},
    ]})
    assert "one" in out and "two" in out


def test_collect_notes_text_merges_both_shapes():
    out = collect_notes_text({
        "userNote": "legacy",
        "userNotes": [{"id": "a", "text": "array", "createdAt": 1}],
    })
    assert "legacy" in out and "array" in out


def test_collect_notes_text_skips_blank_and_malformed():
    out = collect_notes_text({"userNotes": [
        {"id": "a", "text": "   "},          # blank → dropped
        {"id": "b", "text": "kept"},
        "not-a-dict",                          # malformed → ignored
        {"id": "c"},                           # no text → ignored
    ]})
    assert out == "kept"


def test_collect_notes_text_empty_for_note_less_card():
    assert collect_notes_text({}) == ""
    assert collect_notes_text({"userNote": "   "}) == ""


def test_collect_notes_text_survives_non_string_shapes():
    # Client-written data: a numeric userNote, a numeric note text, or a
    # non-list userNotes must degrade to "no note", not AttributeError — this
    # helper sits inside every search/ask/embed haystack build.
    assert collect_notes_text({"userNote": 5}) == ""
    assert collect_notes_text({"userNotes": [{"id": "n", "text": 5}]}) == ""
    assert collect_notes_text({"userNotes": "not-a-list"}) == ""
    assert collect_notes_text({"userNote": 5, "userNotes": [{"text": "real"}]}) == "real"


# ── keyword_query_tokens / keyword_match_score ─────────────────────────────

def test_query_tokens_drop_stopwords_and_shorts():
    toks = keyword_query_tokens("What did I save about the CRISPR gene editing?")
    assert "crispr" in toks and "gene" in toks and "editing" in toks
    # stopwords + <3-char tokens dropped
    assert "the" not in toks and "did" not in toks and "i" not in toks


def test_query_tokens_support_non_latin_scripts():
    # The old ASCII-only splitter reduced every Hebrew query to zero tokens, so
    # typing a card's exact Hebrew title produced no lexical hits at all —
    # despite cross-language recall being the module's own headline use case.
    assert keyword_query_tokens("מתכון מאפינס אוכמניות") == {"מתכון", "מאפינס", "אוכמניות"}


def test_match_score_hebrew_title_hit():
    tokens = keyword_query_tokens("מאפינס")
    assert keyword_match_score({"title": "מאפינס אוכמניות"}, tokens) > 0


def test_query_tokens_non_string_input_is_empty():
    assert keyword_query_tokens(None) == set()


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


def test_rerank_survives_poison_card():
    # One card with every field wrong-typed (numeric tag, numeric note text,
    # NaN createdAt, string metadata, numeric title). Any one of these used to
    # TypeError rerank — and rerank sits UNGUARDED in perform_hybrid_search, so
    # a single such card 500'd every search and Ask for the whole user (the
    # same failure class as the 2026-07-16 string-createdAt outage).
    poison = {
        "id": "poison",
        "title": 7,
        "tags": [2024, None, "ai"],
        "userNotes": [{"id": "n", "text": 5}],
        "createdAt": float("nan"),
        "metadata": "oops",
    }
    cands = [_cand("muffins", title="blueberry muffins recipe"), poison]
    out = rerank_candidates("muffins", cands, top_k=2)
    assert {c["id"] for c in out} == {"muffins", "poison"}
    # The healthy literal match still ranks first.
    assert out[0]["id"] == "muffins"


def test_match_score_survives_non_string_tags():
    tokens = keyword_query_tokens("2024 report")
    score = keyword_match_score({"title": "yearly report", "tags": [2024]}, tokens)
    assert score > 0  # numeric tag both survives and matches as text


# ── apply_distance_threshold: the vector-quality gate ───────────────────────

import search as search_mod
from search import apply_distance_threshold, normalize_card_for_search, perform_hybrid_search


def _vres(id, dist):
    return {"id": id, "title": id, "vector_distance": dist}


def test_threshold_keeps_the_close_cluster_drops_the_tail():
    # Beyond the top-3 recall floor, the relative cutoff kills the padding:
    # cutoff = min(0.30 + 0.22, 0.68) = 0.52 → d (rank 3, 0.60) is out.
    results = [_vres("a", 0.30), _vres("b", 0.42), _vres("c", 0.55), _vres("d", 0.60)]
    kept = [r["id"] for r in apply_distance_threshold(results, ceiling=0.68, margin=0.22)]
    assert kept == ["a", "b", "c"]


def test_threshold_recall_floor_keeps_top3_under_hard_ceiling():
    # Cross-language case (English query → Hebrew card): distances run larger
    # than same-language matches, but the top few must never be dropped on an
    # absolute number — the floor keeps them while the tail still dies.
    results = [_vres("a", 0.70), _vres("b", 0.72), _vres("c", 0.74), _vres("d", 0.76)]
    kept = [r["id"] for r in apply_distance_threshold(
        results, ceiling=0.68, margin=0.02, hard_ceiling=0.80)]
    assert kept == ["a", "b", "c"]  # top-3 floor; rank-3 tail cut


def test_threshold_empties_beyond_hard_ceiling():
    # Truly unrelated (past even the loose bound): honest empty, no placeholders.
    results = [_vres("a", 0.85), _vres("b", 0.90)]
    assert apply_distance_threshold(
        results, ceiling=0.68, margin=0.22, hard_ceiling=0.80) == []


def test_threshold_keeps_results_without_distances():
    # Fail open when the field is missing/malformed — order already ranks them.
    results = [{"id": "a"}, {"id": "b", "vector_distance": "oops"}]
    assert len(apply_distance_threshold(results)) == 2


def test_threshold_mixed_missing_distance_is_kept():
    results = [_vres("a", 0.30), {"id": "no-dist"}, _vres("c", 0.70), _vres("d", 0.99)]
    kept = [r["id"] for r in apply_distance_threshold(
        results, ceiling=0.68, margin=0.22, hard_ceiling=0.80)]
    # c survives via the top-3 floor (rank 2, under 0.80); d fails everything.
    assert kept == ["a", "no-dist", "c"]


def test_threshold_empty_input():
    assert apply_distance_threshold([]) == []


def test_threshold_treats_nan_distance_as_missing():
    # NaN passes isinstance(float) but poisons min() order-dependently: with a
    # NaN first, cutoff became NaN and every comparison went False — dropping
    # all genuinely-close results. NaN must behave exactly like a missing
    # distance: the row fails open, the finite rows gate normally.
    results = [_vres("nan", float("nan")), _vres("a", 0.30),
               _vres("b", 0.42), _vres("far", 0.99)]
    kept = [r["id"] for r in apply_distance_threshold(
        results, ceiling=0.68, margin=0.22, hard_ceiling=0.80)]
    assert "a" in kept and "b" in kept   # the real cluster survives
    assert "nan" in kept                 # fail-open, like a missing distance
    assert "far" not in kept             # the tail still dies


def test_cliff_fails_open_on_nan_distance():
    from search import cut_at_distance_cliff
    results = [_vres("a", 0.30), _vres("b", float("nan")), _vres("c", 0.90)]
    # A non-finite distance means gaps are meaningless — no cut, like missing.
    assert len(cut_at_distance_cliff(results)) == 3


# ── normalize_card_for_search ───────────────────────────────────────────────

class _FakeTs:
    def timestamp(self):
        return 1_700_000_000.0


def test_normalize_converts_timestamp_strips_vector_stamps_id():
    out = normalize_card_for_search(
        {"title": "T", "createdAt": _FakeTs(), "embedding_vector": [0.1] * 3},
        "doc1",
    )
    assert out["id"] == "doc1"
    assert out["createdAt"] == 1_700_000_000_000  # unix ms — rerank-safe
    assert "embedding_vector" not in out


def test_normalize_leaves_ms_created_at_alone():
    out = normalize_card_for_search({"createdAt": 1_752_600_000_000}, "d")
    assert out["createdAt"] == 1_752_600_000_000


# ── perform_hybrid_search: fusion + degradation (halves stubbed) ────────────

def test_hybrid_merges_vector_and_keyword_deduped(monkeypatch):
    monkeypatch.setattr(search_mod, "perform_search_logic", lambda uid, q, limit: [
        _vres("v1", 0.30), _vres("v2", 0.35),
    ])
    captured = {}

    def fake_scan(uid, q, exclude_ids=None, limit=10):
        captured["exclude"] = exclude_ids
        return [{"id": "k1", "title": "improve sleep", "createdAt": 5}]

    monkeypatch.setattr(search_mod, "keyword_scan_cards", fake_scan)
    out = perform_hybrid_search("u", "improve sleep", limit=10)
    ids = [c["id"] for c in out]
    # Vector ids are excluded from the scan; the keyword hit joins the ranking
    # (and its literal title match lifts it), and no distances leak out.
    assert captured["exclude"] == {"v1", "v2"}
    assert set(ids) == {"v1", "v2", "k1"}
    assert all("vector_distance" not in c for c in out)


def test_hybrid_degrades_to_keyword_only_on_vector_failure(monkeypatch):
    def boom(uid, q, limit):
        raise Exception("VECTOR_SEARCH_ERROR: index rebuilding")
    monkeypatch.setattr(search_mod, "perform_search_logic", boom)
    monkeypatch.setattr(search_mod, "keyword_scan_cards",
                        lambda uid, q, exclude_ids=None, limit=10: [
                            {"id": "k1", "title": "muffins", "createdAt": 5}])
    out = perform_hybrid_search("u", "muffins", limit=10)
    assert [c["id"] for c in out] == ["k1"]  # search bar never blanks


def test_hybrid_propagates_config_error(monkeypatch):
    import pytest as _pytest

    def boom(uid, q, limit):
        raise Exception("SEMANTIC_SEARCH_NOT_CONFIGURED: no key")
    monkeypatch.setattr(search_mod, "perform_search_logic", boom)
    with _pytest.raises(Exception, match="SEMANTIC_SEARCH_NOT_CONFIGURED"):
        perform_hybrid_search("u", "q", limit=10)


def test_hybrid_thresholds_before_keyword_exclusion(monkeypatch):
    # A truly-unrelated vector hit (beyond even the recall floor's hard
    # ceiling) is dropped by the gate, so the keyword scan may re-find it as a
    # REAL literal match rather than it surviving as noise.
    monkeypatch.setattr(search_mod, "perform_search_logic", lambda uid, q, limit: [
        _vres("close", 0.30), _vres("far", 0.85),
    ])
    captured = {}

    def fake_scan(uid, q, exclude_ids=None, limit=10):
        captured["exclude"] = exclude_ids
        return []

    monkeypatch.setattr(search_mod, "keyword_scan_cards", fake_scan)
    out = perform_hybrid_search("u", "q", limit=10)
    assert captured["exclude"] == {"close"}
    assert [c["id"] for c in out] == ["close"]


# ── Timestamp-shape robustness (the 2026-07-16 search-outage regression) ────
# One legacy card with a string createdAt in the candidate set crashed
# rerank's min/max (str vs int TypeError) and took the whole search request
# down. Every shape in the wild must flow through ranking without crashing.

from search import _to_unix_ms


def test_to_unix_ms_handles_every_shape():
    class _Ts:
        def timestamp(self):
            return 1_700_000_000.0
    assert _to_unix_ms(_Ts()) == 1_700_000_000_000
    assert _to_unix_ms(1_752_600_000_000) == 1_752_600_000_000     # already ms
    assert _to_unix_ms(1_752_600_000) == 1_752_600_000_000          # unix seconds
    assert _to_unix_ms("2026-07-01T10:00:00Z") > 0                  # ISO string
    assert _to_unix_ms("garbage") == 0
    assert _to_unix_ms(None) == 0


def test_to_unix_ms_nan_and_inf_are_unparseable():
    # Firestore can legally store NaN doubles; int(nan) raises. The documented
    # contract is "0 when absent or unparseable" — a poison timestamp used to
    # blank the entire vector half (and keyword half) of every search.
    assert _to_unix_ms(float("nan")) == 0
    assert _to_unix_ms(float("inf")) == 0
    assert _to_unix_ms(float("-inf")) == 0


def test_rerank_survives_mixed_timestamp_shapes():
    cands = [
        {"id": "a", "title": "muffins recipe", "createdAt": 1_752_600_000_000},
        {"id": "b", "title": "other", "createdAt": "2026-07-01T10:00:00Z"},
        {"id": "c", "title": "third"},  # missing entirely
    ]
    out = [c["id"] for c in rerank_candidates("muffins", cands, top_k=3)]
    assert set(out) == {"a", "b", "c"}
    assert out[0] == "a"  # the literal title match still leads


def test_normalize_converts_string_and_seconds_created_at():
    assert normalize_card_for_search({"createdAt": "2026-07-01T10:00:00Z"}, "d")["createdAt"] > 1e12
    assert normalize_card_for_search({"createdAt": 1_752_600_000}, "d")["createdAt"] == 1_752_600_000_000


def test_hybrid_survives_mixed_timestamps_end_to_end(monkeypatch):
    monkeypatch.setattr(search_mod, "perform_search_logic", lambda uid, q, limit: [
        {"id": "v1", "title": "x", "vector_distance": 0.3, "createdAt": 1_752_600_000_000},
    ])
    monkeypatch.setattr(search_mod, "keyword_scan_cards",
                        lambda uid, q, exclude_ids=None, limit=10: [
                            {"id": "k1", "title": "muffins", "createdAt": "2026-07-01T10:00:00Z"}])
    out = perform_hybrid_search("u", "muffins", limit=10)
    assert {c["id"] for c in out} == {"v1", "k1"}


# ── cut_at_distance_cliff: the per-query precision trim ─────────────────────

from search import cut_at_distance_cliff


def test_cliff_cuts_after_relevant_cluster():
    # Two real matches, then a jump into the junk tail (the muffins case).
    results = [_vres("m1", 0.45), _vres("m2", 0.48),
               _vres("junk1", 0.62), _vres("junk2", 0.64), _vres("junk3", 0.66)]
    kept = [r["id"] for r in cut_at_distance_cliff(results)]
    assert kept == ["m1", "m2"]


def test_cliff_first_gap_wins_over_later_bigger_gap():
    # A later, larger jump inside the tail must not re-include the junk.
    results = [_vres("a", 0.45), _vres("b", 0.48),
               _vres("j1", 0.60), _vres("j2", 0.62), _vres("j3", 0.79)]
    kept = [r["id"] for r in cut_at_distance_cliff(results)]
    assert kept == ["a", "b"]


def test_cliff_no_gap_keeps_up_to_max():
    # Smooth distances (a genuinely broad query): no cliff → cap at max_keep.
    results = [_vres(str(i), 0.40 + i * 0.01) for i in range(15)]
    kept = cut_at_distance_cliff(results, max_keep=10)
    assert len(kept) == 10


def test_cliff_never_cuts_inside_min_keep():
    # Even with an immediate jump, the top min_keep results always survive.
    results = [_vres("a", 0.30), _vres("b", 0.55), _vres("c", 0.56)]
    kept = [r["id"] for r in cut_at_distance_cliff(results, min_keep=2)]
    assert kept[:2] == ["a", "b"]


def test_cliff_fails_open_without_distances():
    results = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert len(cut_at_distance_cliff(results)) == 3


def test_cliff_short_list_untouched():
    results = [_vres("a", 0.30)]
    assert cut_at_distance_cliff(results) == results


def test_hybrid_applies_cliff_to_vector_results(monkeypatch):
    monkeypatch.setattr(search_mod, "perform_search_logic", lambda uid, q, limit: [
        _vres("m1", 0.45), _vres("m2", 0.48),
        _vres("junk1", 0.62), _vres("junk2", 0.64),
    ])
    monkeypatch.setattr(search_mod, "keyword_scan_cards",
                        lambda uid, q, exclude_ids=None, limit=10: [])
    out = [c["id"] for c in perform_hybrid_search("u", "muffins", limit=20)]
    assert out == ["m1", "m2"]  # the junk tail never reaches the client
