"""Ask chip-retrieval guarantees (search.py pure helpers).

The Ask UI's chips send questions that embed the cited card's title in quotes;
`pin_quoted_title_cards` guarantees that card reaches the front of the model's
context (the deep-content window). `is_recency_question` routes time-anchored
questions ("catch me up on this week's saves") to createdAt-ordered retrieval
instead of semantic-matching the phrase. All pure, offline over plain dicts.
"""

from search import (
    extract_quoted_phrases,
    pin_quoted_title_cards,
    pin_title_phrases,
    missing_quoted_phrases,
    missing_title_phrases,
    anchor_phrases_for,
    is_recency_question,
    is_exclusion_question,
    demote_cards_by_titles,
    keyword_match_score,
    keyword_query_tokens,
)


# ── extract_quoted_phrases ─────────────────────────────────────────────────

def test_extract_straight_quotes():
    assert extract_quoted_phrases(
        'Walk me through the steps in "Pan con Tomate Recipe"'
    ) == ["Pan con Tomate Recipe"]


def test_extract_curly_quotes_and_hebrew():
    assert extract_quoted_phrases("Key points from “הכותרת בעברית”") == ["הכותרת בעברית"]


def test_extract_trims_truncation_ellipsis():
    # chipTitle truncates long titles and appends "…" — the anchor phrase must
    # come out clean so prefix matching can work.
    assert extract_quoted_phrases('What is "A very long saved title…" about?') == [
        "A very long saved title"
    ]


def test_extract_keeps_curly_apostrophe_inside_title():
    # iOS smart punctuation puts curly apostrophes INSIDE titles — the quoted
    # span must survive intact, not split at the apostrophe.
    assert extract_quoted_phrases('Walk me through the steps in "Rafi’s Pasta"') == [
        "Rafi’s Pasta"
    ]


def test_extract_multiple_phrases():
    assert extract_quoted_phrases('Compare "Alpha" with "Beta Gamma"') == [
        "Alpha", "Beta Gamma",
    ]


def test_extract_empty_when_unquoted():
    assert extract_quoted_phrases("Recap my recent saves") == []
    assert extract_quoted_phrases("") == []
    assert extract_quoted_phrases(None) == []


# ── pin_quoted_title_cards ─────────────────────────────────────────────────

def _cards():
    return [
        {"id": "a", "title": "Something Unrelated"},
        {"id": "b", "title": "Pan con Tomate Recipe"},
        {"id": "c", "title": "Another Card"},
    ]


def test_pin_moves_quoted_card_to_front():
    out, matched = pin_quoted_title_cards(
        'Walk me through the steps in "Pan con Tomate Recipe"', _cards())
    assert matched is True
    assert [c["id"] for c in out] == ["b", "a", "c"]


def test_pin_is_case_and_punctuation_insensitive():
    cards = [{"id": "a", "title": "Other"},
             {"id": "b", "title": "Pan con Tomate: RECIPE!"}]
    out, matched = pin_quoted_title_cards(
        'Steps in "pan con tomate recipe"', cards)
    assert matched is True
    assert out[0]["id"] == "b"


def test_pin_matches_truncated_quote_as_prefix():
    cards = [{"id": "a", "title": "Other"},
             {"id": "b", "title": "A very long saved title about tomatoes and bread"}]
    out, matched = pin_quoted_title_cards(
        'Key points from "A very long saved title about tomatoes…"', cards)
    assert matched is True
    assert out[0]["id"] == "b"


def test_pin_short_fragment_never_pins_by_prefix():
    # A stray short quoted fragment (e.g. a title's own inner quotes) must not
    # drag an unrelated card to the front via prefix matching.
    cards = [{"id": "a", "title": "The 10x Engineer Myth"}]
    out, matched = pin_quoted_title_cards('What about "The"?', cards)
    assert matched is False
    assert out == cards


def test_pin_pins_both_cards_of_a_compare_question():
    cards = [{"id": "x", "title": "Filler"},
             {"id": "a", "title": "Alpha Protocol"},
             {"id": "b", "title": "Beta Gamma Notes"}]
    out, matched = pin_quoted_title_cards(
        'Compare "Alpha Protocol" with "Beta Gamma Notes"', cards)
    assert matched is True
    assert [c["id"] for c in out] == ["a", "b", "x"]


def test_pin_reports_unmatched_and_keeps_order():
    cards = [{"id": "a", "title": "One"}, {"id": "b", "title": "Two"}]
    out, matched = pin_quoted_title_cards('Steps in "Missing Card Title"', cards)
    assert matched is False
    assert out == cards


def test_pin_no_quotes_is_a_no_op():
    cards = _cards()
    out, matched = pin_quoted_title_cards("recap my recent saves", cards)
    assert matched is False
    assert out == cards


def test_pin_empty_cards():
    out, matched = pin_quoted_title_cards('About "Anything"', [])
    assert out == [] and matched is False


def test_pin_matches_titles_wrapped_in_bidi_isolates():
    # The client wraps embedded titles in FSI…PDI isolates (U+2068/U+2069) so
    # mixed-script bubbles render cleanly — normalization must see through them.
    cards = [{"id": "a", "title": "Other"},
             {"id": "b", "title": "Pan con Tomate Recipe"}]
    out, matched = pin_quoted_title_cards(
        'Walk me through the steps in "⁨Pan con Tomate Recipe⁩"', cards)
    assert matched is True
    assert out[0]["id"] == "b"


# ── missing_quoted_phrases ─────────────────────────────────────────────────

def test_missing_reports_each_unmatched_phrase():
    # A compare question quotes TWO titles — the one retrieval missed must be
    # reported individually so ask_brain can rescue it with its own scan.
    cards = [{"id": "a", "title": "Alpha Protocol"}]
    missing = missing_quoted_phrases(
        'Compare "Alpha Protocol" with "Beta Gamma Notes"', cards)
    assert missing == ["Beta Gamma Notes"]


def test_missing_empty_when_all_matched():
    cards = [{"id": "a", "title": "Alpha Protocol"},
             {"id": "b", "title": "Beta Gamma Notes"}]
    assert missing_quoted_phrases(
        'Compare "Alpha Protocol" with "Beta Gamma Notes"', cards) == []


def test_missing_all_when_no_cards():
    assert missing_quoted_phrases('About "Alpha Protocol"', []) == ["Alpha Protocol"]


def test_missing_none_when_no_quotes():
    assert missing_quoted_phrases("recap my recent saves", [{"id": "a", "title": "T"}]) == []


# ── is_recency_question ────────────────────────────────────────────────────

def test_recency_matches_every_chip_phrasing():
    # Every recency-flavored chip the client can generate must route to
    # createdAt-ordered retrieval — this is the airtight contract.
    for q in (
        "Catch me up on this week's saves",
        "What did I save this week?",
        "Recap my recent saves",
        "What's my latest Tech save about?",
        "What did I save today?",
    ):
        assert is_recency_question(q) is True, q


def test_recency_negative_on_topic_questions():
    for q in (
        'Walk me through the steps in "Pan con Tomate Recipe"',
        "What do my saves say about longevity?",
        "Key takeaways from my Tech saves",
        "",
    ):
        assert is_recency_question(q) is False, q


# ── anchor_phrases_for (question quotes + hints, minus exclusions) ─────────

def test_anchor_merges_quotes_and_hint_titles_deduped():
    anchors = anchor_phrases_for(
        'Key points from "Alpha Protocol"',
        anchor_titles=["Alpha Protocol", "Beta Gamma Notes"])
    assert anchors == ["Alpha Protocol", "Beta Gamma Notes"]


def test_anchor_drops_excluded_titles():
    # "What else … besides X": X must NOT be re-pinned as an anchor.
    anchors = anchor_phrases_for(
        'What else did I save, besides "Alpha Protocol"?',
        anchor_titles=["Beta Gamma Notes"],
        excluded_titles=["Alpha Protocol"])
    assert anchors == ["Beta Gamma Notes"]


def test_anchor_empty_when_nothing_supplied():
    assert anchor_phrases_for("recap my saves") == []


def test_pin_title_phrases_pins_hinted_card_without_quotes():
    cards = [{"id": "a", "title": "Other"}, {"id": "b", "title": "Alpha Protocol"}]
    out, matched = pin_title_phrases(["Alpha Protocol"], cards)
    assert matched is True and out[0]["id"] == "b"


def test_missing_title_phrases_reports_unretrieved_hint():
    assert missing_title_phrases(
        ["Alpha Protocol"], [{"id": "x", "title": "Unrelated"}]) == ["Alpha Protocol"]


# ── is_exclusion_question / demote_cards_by_titles ─────────────────────────

def test_exclusion_matches_what_else_phrasings():
    for q in (
        "What else did I save on Resilience?",
        'Anything besides "Alpha Protocol"?',
        'Other than "Alpha Protocol", what covers this?',
        "Show me something apart from that article",
    ):
        assert is_exclusion_question(q) is True, q


def test_exclusion_negative_on_plain_questions():
    for q in ("Key points from my Tech saves", 'What was "Alpha" about?', ""):
        assert is_exclusion_question(q) is False, q


def test_demote_moves_excluded_cards_to_back():
    cards = [
        {"id": "a", "title": "Argentina Comeback Analysis"},
        {"id": "b", "title": "Fresh Other Card"},
        {"id": "c", "title": "Third Card"},
    ]
    out, demoted = demote_cards_by_titles(["Argentina Comeback Analysis"], cards)
    assert [c["id"] for c in out] == ["b", "c", "a"]
    assert demoted == ["Argentina Comeback Analysis"]


def test_demote_no_titles_is_a_no_op():
    cards = [{"id": "a", "title": "T"}]
    out, demoted = demote_cards_by_titles([], cards)
    assert out == cards and demoted == []


# ── concepts are lexically searchable (the "what else on X" retrieval hole) ─

def test_keyword_score_matches_concept_only_cards():
    # "Resilience" lives ONLY in the concepts array — the lexical scan must
    # still find the card, or a concept chip can't deliver.
    card = {"title": "Análise da vitória", "summary": "Match analysis.",
            "concepts": ["Resilience", "Team Spirit"]}
    tokens = keyword_query_tokens("What else did I save on Resilience?")
    assert keyword_match_score(card, tokens) > 0
