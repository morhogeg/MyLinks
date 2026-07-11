"""Pydantic schema tests — defaults and accept/reject shapes.

Pure: only depends on ``models`` (real pydantic), no Firestore/network.
"""

import pytest
from pydantic import ValidationError

from models import (
    UserSettings,
    UserDocument,
    AIAnalysis,
    BrainAnswer,
    WeeklySynthesis,
    LinkStatus,
    ReminderStatus,
)


# ── UserSettings defaults ─────────────────────────────────────────────────

def test_user_settings_defaults():
    s = UserSettings()
    # The headline default the digest pipeline relies on.
    assert s.digest_channels == ["push"]
    assert s.digest_enabled is True  # weekly digest on by default for new users
    assert s.digest_frequency == "weekly"
    assert s.digest_mode == "smart"
    assert s.digest_count == 5
    assert s.digest_hour == 9
    assert s.digest_minute == 0
    assert s.digest_day == 0
    assert s.digest_skip_empty is True
    assert s.theme == "dark"
    assert s.reminders_enabled is True


def test_user_settings_digest_channels_is_a_fresh_list_per_instance():
    # Guards against a mutable default shared across instances.
    a = UserSettings()
    b = UserSettings()
    a.digest_channels.append("email")
    assert b.digest_channels == ["push"]


def test_user_settings_accepts_overrides():
    s = UserSettings(digest_channels=["push", "email"], digest_mode="topic", digest_count=3)
    assert s.digest_channels == ["push", "email"]
    assert s.digest_mode == "topic"
    assert s.digest_count == 3


# ── UserDocument defaults ─────────────────────────────────────────────────

def test_user_document_defaults_and_nested_settings():
    doc = UserDocument(phone_number="+15551234567")
    assert doc.phone_number == "+15551234567"
    # Nested settings default-constructs, carrying the push default.
    assert isinstance(doc.settings, UserSettings)
    assert doc.settings.digest_channels == ["push"]
    assert doc.email is None
    assert doc.timezone is None
    assert doc.last_saved_link_id is None
    assert doc.createdAt is not None  # default_factory=datetime.now


def test_user_document_requires_phone_number():
    with pytest.raises(ValidationError):
        UserDocument()


# ── AIAnalysis accept / reject ────────────────────────────────────────────

def test_ai_analysis_minimal_valid_shape():
    a = AIAnalysis(
        title="T",
        summary="S",
        category="Tech",
        tags=["a", "b", "c"],
        actionableTakeaway="Do the thing",
    )
    assert a.language == "en"  # default
    assert a.tags == ["a", "b", "c"]
    assert a.concepts == []  # default_factory list
    assert a.videoHighlights == []
    assert a.detailedSummary is None


def test_ai_analysis_valid_without_actionable_takeaway():
    # actionableTakeaway is OPTIONAL — a card for non-actionable content (news,
    # an anecdote, a personal note) omits it rather than manufacturing filler.
    a = AIAnalysis(
        title="T",
        summary="S",
        category="News",
        tags=["a", "b"],
    )
    assert a.actionableTakeaway is None


def test_ai_analysis_rejects_too_many_tags():
    # tags has max_length=5.
    with pytest.raises(ValidationError):
        AIAnalysis(
            title="T",
            summary="S",
            category="Tech",
            tags=["a", "b", "c", "d", "e", "f"],
            actionableTakeaway="x",
        )


def test_ai_analysis_rejects_missing_required_fields():
    with pytest.raises(ValidationError):
        AIAnalysis(title="only title")


# ── BrainAnswer / WeeklySynthesis ─────────────────────────────────────────

def test_brain_answer_defaults_cited_ids():
    ans = BrainAnswer(answer="hello")
    assert ans.citedIds == []


def test_weekly_synthesis_defaults():
    w = WeeklySynthesis(title="A week", narrative="body")
    assert w.themes == []
    assert w.standoutCardId is None
    assert w.standoutReason == ""
    assert w.openQuestion == ""


# ── Enums ─────────────────────────────────────────────────────────────────

def test_link_status_enum_values():
    assert LinkStatus.UNREAD.value == "unread"
    assert LinkStatus.PROCESSING.value == "processing"
    assert LinkStatus.FAILED.value == "failed"
    # str-Enum: compares equal to the raw string.
    assert LinkStatus.ARCHIVED == "archived"


def test_reminder_status_enum_values():
    assert ReminderStatus.NONE == "none"
    assert ReminderStatus.PENDING == "pending"
    assert ReminderStatus.COMPLETED == "completed"
