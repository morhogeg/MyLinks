"""
Pydantic models for SecondBrain
These mirror the Firestore schema from the PRD
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum


class LinkStatus(str, Enum):
    """Status of a saved link"""
    UNREAD = "unread"
    ARCHIVED = "archived"
    FAVORITE = "favorite"


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


class LinkDocument(BaseModel):
    """
    Firestore document schema for a saved link
    Collection path: users/{uid}/links/{linkId}
    """
    url: str
    title: str
    summary: str
    detailedSummary: Optional[str] = None
    tags: List[str] = Field(max_length=5)
    category: str
    sourceName: Optional[str] = None
    status: LinkStatus = LinkStatus.UNREAD
    createdAt: datetime = Field(default_factory=datetime.now)
    metadata: LinkMetadata
    # Reminder fields
    reminderStatus: ReminderStatus = ReminderStatus.NONE
    nextReminderAt: Optional[int] = None # Using int for Unix ms timestamp
    reminderCount: int = 0
    reminderProfile: Optional[str] = "smart" # "smart" or "spaced"
    lastViewedAt: Optional[int] = None

    # Contextual Linking & graph fields
    embedding: Optional[List[float]] = Field(None, description="Vector embedding of title + summary")
    concepts: List[str] = Field(default_factory=list, description="List of abstract concepts/philosophical anchors")
    relatedLinks: List["RelatedLink"] = Field(default_factory=list, description="AI-suggested related notes")


class RelatedLink(BaseModel):
    """
    Snapshot of a related link
    """
    id: str
    title: str
    reason: str = Field(description="AI-generated explanation of the connection")
    similarity: float = Field(description="Cosine similarity score (0-1)")
    commonConcepts: List[str] = Field(default_factory=list)
    # Semantic Search
    embedding_vector: Optional[List[float]] = Field(None, description="768-dimensional vector for semantic search")


class WebhookPayload(BaseModel):
    """
    Incoming WhatsApp message payload
    This structure depends on your WhatsApp provider (Twilio, etc.)
    """
    from_number: str = Field(alias="From", description="Sender phone number in E.164 format")
    body: str = Field(alias="Body", description="Message content containing the URL")
    message_sid: Optional[str] = Field(None, alias="MessageSid")
    num_media: int = Field(0, alias="NumMedia", description="Number of media items attached")
    media_url0: Optional[str] = Field(None, alias="MediaUrl0", description="URL for the first media item")
    media_content_type0: Optional[str] = Field(None, alias="MediaContentType0", description="Mime type for the first media item")

    model_config = ConfigDict(
        extra="allow",
        populate_by_name=True
    )


class UserSettings(BaseModel):
    """User preferences"""
    theme: str = "dark"
    daily_digest: bool = False
    reminders_enabled: bool = True
    reminder_frequency: str = "smart"  # "smart", "daily", "weekly", "off"

    # ── Curated Digest delivery ──────────────────────────────────────────
    # A scheduled, curated set of saved cards delivered to email and/or
    # WhatsApp. See digest_service.py for the curation + delivery logic.
    digest_enabled: bool = False
    # How often to deliver: "daily" | "weekly"
    digest_frequency: str = "weekly"
    # Delivery channels — any subset of ["email", "whatsapp"]
    digest_channels: List[str] = Field(default_factory=lambda: ["whatsapp"])
    # Curation strategy:
    #   "smart"      – a balanced mix of backlog + rediscovery (default)
    #   "random"     – surprise me: a random sample across the library
    #   "topic"      – only cards from a chosen category/tag (see digest_topic)
    #   "unread"     – chip away at the backlog (oldest unread first)
    #   "favorites"  – revisit starred cards
    #   "rediscover" – "on this day": older saves you haven't opened recently
    digest_mode: str = "smart"
    # Category or tag to focus on when digest_mode == "topic".
    digest_topic: Optional[str] = None
    # How many cards per digest.
    digest_count: int = 5
    # Preferred local delivery hour (0–23) in the user's timezone.
    digest_hour: int = 9
    # Preferred weekday for weekly digests (0=Mon … 6=Sun).
    digest_day: int = 0
    # Don't send a digest if there's nothing fresh to show.
    digest_skip_empty: bool = True


class UserDocument(BaseModel):
    """
    Firestore document schema for a user
    Collection path: users/{uid}
    """
    phone_number: str = Field(description="Phone number in E.164 format, e.g., +16462440305")
    createdAt: datetime = Field(default_factory=datetime.now)
    settings: UserSettings = Field(default_factory=UserSettings)
    last_saved_link_id: Optional[str] = Field(None, description="ID of the last saved link for context")
    email: Optional[str] = Field(None, description="Email address for digest delivery")
    timezone: Optional[str] = Field(None, description="IANA timezone, e.g. 'America/New_York'")
    lastDigestSentAt: Optional[int] = Field(None, description="Unix ms timestamp of the last digest delivered")
