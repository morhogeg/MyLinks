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
    status: LinkStatus = LinkStatus.UNREAD
    createdAt: datetime = Field(default_factory=datetime.now)
    metadata: LinkMetadata
    # Reminder fields
    reminderStatus: ReminderStatus = ReminderStatus.NONE
    nextReminderAt: Optional[datetime] = None
    reminderCount: int = 0
    lastViewedAt: Optional[datetime] = None


class WebhookPayload(BaseModel):
    """
    Incoming WhatsApp message payload
    This structure depends on your WhatsApp provider (Twilio, etc.)
    """
    from_number: str = Field(alias="From", description="Sender phone number in E.164 format")
    body: str = Field(alias="Body", description="Message content containing the URL")
    message_sid: Optional[str] = Field(None, alias="MessageSid")

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


class UserDocument(BaseModel):
    """
    Firestore document schema for a user
    Collection path: users/{uid}
    """
    phone_number: str = Field(description="Phone number in E.164 format, e.g., +16462440305")
    createdAt: datetime = Field(default_factory=datetime.now)
    settings: UserSettings = Field(default_factory=UserSettings)
    last_saved_link_id: Optional[str] = Field(None, description="ID of the last saved link for context")
