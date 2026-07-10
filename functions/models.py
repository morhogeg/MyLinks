"""
Pydantic models for SecondBrain
These mirror the Firestore schema from the PRD
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class LinkStatus(str, Enum):
    """Status of a saved link"""
    UNREAD = "unread"
    ARCHIVED = "archived"
    FAVORITE = "favorite"
    # Async-capture lifecycle (M3): a captured item is written as PROCESSING the
    # moment it's queued, then flips to UNREAD (ready) or FAILED (retryable) so a
    # capture is never silently lost while background analysis runs.
    PROCESSING = "processing"
    FAILED = "failed"


class ReminderStatus(str, Enum):
    """Reminder status for a link"""
    NONE = "none"
    PENDING = "pending"
    COMPLETED = "completed"


class LinkMetadata(BaseModel):
    """Metadata extracted from the original page"""
    originalTitle: str = Field(description="Original <title> from the page")
    estimatedReadTime: int = Field(description="Estimated read time in minutes")
    actionableTakeaway: Optional[str] = Field(None, description="Key takeaway from AI analysis")


class AIAnalysis(BaseModel):
    """
    Output from Gemini AI analysis
    """
    language: str = Field(description="ISO 639-1 language code of the content (e.g., 'en', 'he')", default="en")
    title: str = Field(description="Clear, descriptive title")
    summary: str = Field(description="2-4 sentences for snackable preview")
    category: str = Field(description="One high-level category")
    tags: List[str] = Field(max_length=5, description="3-5 relevant tags")
    actionableTakeaway: str = Field(description="One concrete specific action")
    detailedSummary: Optional[str] = Field(None, description="Markdown formatted detailed summary")
    sourceName: Optional[str] = Field(None, description="Name of the source/publisher (e.g., CNN, X)")
    concepts: List[str] = Field(default_factory=list, description="3-5 abstract concepts or mental models")
    # YouTube-specific fields (populated only when analyzing video content)
    videoHighlights: List[str] = Field(default_factory=list, description="3-6 key moments from a video, each prefixed with its 'M:SS' timestamp")
    speakers: List[str] = Field(default_factory=list, description="Host/creator and guests who actually speak in a video")
    videoDurationMinutes: Optional[int] = Field(None, description="Observed length of the video in whole minutes")


class BrainAnswer(BaseModel):
    """Structured output for the "Ask Your Brain" RAG endpoint.

    Schema-constrained generation guarantees valid, fully-escaped JSON even when
    the answer contains quotes or newlines (e.g. Hebrew text), which a free-form
    response_mime_type call does not.
    """
    answer: str = Field(description="The grounded answer, in the same language as the question")
    citedIds: List[str] = Field(default_factory=list, description="Ids of the saved sources actually used")


class SynthesisTheme(BaseModel):
    """One throughline of the week's reading, tied back to the cards that fed it."""
    title: str = Field(description="Short name for the theme (e.g. 'Network effects', 'Sleep & recovery')")
    insight: str = Field(description="1-2 sentences on what the week's saves said about this theme, factual and specific")
    cardIds: List[str] = Field(default_factory=list, description="Ids of the source cards that belong to this theme")


class WeeklySynthesis(BaseModel):
    """Structured output for the weekly "What you learned" synthesis (M12).

    A narrative recap of the week's saves — themes + a standout + an open
    question — that reads like a thoughtful debrief, not a list of links. Every
    theme and the standout reference real card ids so the UI/email can link back
    to the sources. Schema-constrained so the model returns valid, escaped JSON
    even with quotes/newlines (matches the BrainAnswer approach for Hebrew etc.).
    """
    title: str = Field(description="A warm, specific title for the week, e.g. 'A week of systems thinking'")
    narrative: str = Field(description="2-4 short paragraphs (markdown) that tie the week's saves together into a story — the throughline, not a bullet dump")
    themes: List[SynthesisTheme] = Field(default_factory=list, description="2-4 themes that ran through the week's saves")
    standoutCardId: Optional[str] = Field(None, description="Id of the single most noteworthy card this week")
    standoutReason: str = Field(default="", description="One sentence on why that card stood out")
    openQuestion: str = Field(default="", description="One genuine open question the week's reading raises, to carry into next week")


class UserSettings(BaseModel):
    """User preferences"""
    theme: str = "dark"
    daily_digest: bool = False
    reminders_enabled: bool = True
    reminder_frequency: str = "smart"  # "smart", "daily", "weekly", "off"

    # ── Curated Digest delivery ──────────────────────────────────────────
    # A scheduled, curated set of saved cards delivered to push and/or email.
    # See digest_service.py for the curation + delivery logic.
    digest_enabled: bool = False
    # How often to deliver: "daily" | "weekly"
    digest_frequency: str = "weekly"
    # Delivery channels — any subset of ["push", "email"]
    digest_channels: List[str] = Field(default_factory=lambda: ["push"])
    # Curation strategy:
    #   "smart"      – a balanced mix of backlog + rediscovery (default)
    #   "random"     – surprise me: a random sample across the library
    #   "topic"      – only cards from a chosen category/tag (see digest_topic)
    #   "unread"     – chip away at the backlog (oldest unread first)
    #   "favorites"  – revisit starred cards
    #   "rediscover" – "on this day": older saves you haven't opened recently
    digest_mode: str = "smart"
    # Categories/tags to focus on when digest_mode == "topic". `digest_topics`
    # (plural) supports picking several; `digest_topic` (singular) is kept for
    # backward compatibility and treated as a single-item list.
    digest_topics: List[str] = Field(default_factory=list)
    digest_topic: Optional[str] = None
    # How many cards per digest.
    digest_count: int = 5
    # Preferred local delivery time (0–23 hour, 0–59 minute) in the user's timezone.
    digest_hour: int = 9
    digest_minute: int = 0
    # Preferred weekday for weekly digests (0=Mon … 6=Sun).
    digest_day: int = 0
    # Don't send a digest if there's nothing fresh to show.
    digest_skip_empty: bool = True


class UserDocument(BaseModel):
    """
    Firestore document schema for a user
    Collection path: users/{uid}
    """
    phone_number: str = Field(description="Phone number in E.164 format, e.g., +15551234567")
    createdAt: datetime = Field(default_factory=datetime.now)
    settings: UserSettings = Field(default_factory=UserSettings)
    last_saved_link_id: Optional[str] = Field(None, description="ID of the last saved link for context")
    email: Optional[str] = Field(None, description="Email address for digest delivery")
    timezone: Optional[str] = Field(None, description="IANA timezone, e.g. 'America/New_York'")
    lastDigestSentAt: Optional[int] = Field(None, description="Unix ms timestamp of the last digest delivered")
