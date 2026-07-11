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
