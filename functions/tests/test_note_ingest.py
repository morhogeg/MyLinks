"""Tests for URL-less note capture — the 'note' card shape and its title
fallback. A thought without a URL is a first-class card, not a 400.

Pure: only imports ``main`` (via the offline conftest fakes) and exercises the
document-shaping helpers directly, no Firestore/Gemini/network.
"""

import main


# ── _first_line ───────────────────────────────────────────────────────────

def test_first_line_skips_blank_leading_lines():
    assert main._first_line("\n  \n First real line\nsecond") == "First real line"


def test_first_line_truncates_long_lines():
    long = "x" * 500
    assert main._first_line(long, limit=120) == "x" * 120


def test_first_line_empty_text():
    assert main._first_line("") == ""
    assert main._first_line("   \n  ") == ""


# ── _note_link_data — the note card shape ─────────────────────────────────

def _analysis(**over):
    base = {
        "title": "A saved thought",
        "summary": "The gist of the note.",
        "detailedSummary": "## Key Points\n- something",
        "category": "Personal",
        "tags": ["idea"],
        "language": "en",
    }
    base.update(over)
    return base


def test_note_card_has_no_url_and_note_source_type():
    data = main._note_link_data(_analysis(), "My note body")
    # No fabricated URL — a note has no source to open.
    assert data["url"] == ""
    assert data["sourceType"] == "note"
    assert data["sourceName"] == "Note"
    # Normal card fields still present so the feed renders it like any card.
    assert data["title"] == "A saved thought"
    assert data["summary"] == "The gist of the note."
    assert data["status"] == "unread"
    assert data["category"] == "Personal"
    assert data["metadata"]["estimatedReadTime"] >= 1


def test_note_title_falls_back_to_first_line_when_ai_gives_none():
    analysis = _analysis()
    analysis.pop("title")
    data = main._note_link_data(analysis, "First line becomes the title\nrest of note")
    assert data["title"] == "First line becomes the title"


def test_note_title_final_fallback_is_note():
    analysis = _analysis()
    analysis.pop("title")
    data = main._note_link_data(analysis, "   \n   ")
    assert data["title"] == "Note"


def test_note_ai_sourcename_is_preserved_when_present():
    data = main._note_link_data(_analysis(sourceName="Journal"), "body")
    assert data["sourceName"] == "Journal"


def test_note_tolerates_missing_actionable_takeaway():
    # The analysis dict may omit actionableTakeaway now (optional) — the builder
    # must still produce a valid card, with takeaway defaulting to None.
    data = main._note_link_data(_analysis(), "body")
    assert data["metadata"]["actionableTakeaway"] is None


# ── verbatim text cards: the user's words are NEVER rewritten ────────────────
# A shared paragraph stores the user's text UNTOUCHED in `summary`; the AI take
# is parked in aiSummary/aiDetailedSummary. No pipeline step — including the
# truncation backstop, which retries model output that "looks cut off" — may
# ever touch the verbatim body: user text legitimately ends mid-thought.

def test_verbatim_body_is_stored_byte_identical_even_when_it_looks_cut_off():
    # Ends on a bare letter mid-word — exactly the shape the truncation guard
    # flags on MODEL output. On user text it must be preserved as-is.
    text = "רשמתי לעצמי את ההתחלה של מחשבה על מנכ"
    data = main._note_link_data(_analysis(), text, verbatim=True)
    assert data["summary"] == text
    assert data["detailedSummary"] == ""
    assert data["aiSummary"] == "The gist of the note."
    assert data["captureType"] == "text"


def test_truncation_guard_only_sees_model_output_not_user_text():
    # _analysis_cut_off runs inside _generate_json on the MODEL's dict, before
    # _note_link_data ever substitutes the verbatim body — so a cut-off-looking
    # user text must not be what the guard evaluates. Locked structurally: the
    # verbatim substitution happens in _note_link_data, and the guard's input
    # (the analysis dict) is complete here, so no retry would fire.
    from ai_service import _analysis_cut_off
    analysis = _analysis(detailedSummary="## Key Points\n- something complete.")
    assert not _analysis_cut_off(analysis)
    data = main._note_link_data(analysis, "user text that ends mid-wor", verbatim=True)
    assert data["summary"].endswith("mid-wor")
