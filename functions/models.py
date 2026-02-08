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


class ReminderStatus(str, Enum):
    """Reminder status for a link"""
    NONE = "none"
    PENDING = "pending"
    COMPLETED = "completed"


class LinkMetadata(BaseModel):
    """Metadata extracted from the original page"""
    original_title: str = Field(description="Original <title> from the page")
    estimated_read_time: int = Field(description="Estimated read time in minutes")
    actionable_takeaway: Optional[str] = Field(None, description="Key takeaway from AI analysis")


class AIAnalysis(BaseModel):
    """
    Output from Gemini AI analysis
    """
    title: str = Field(description="Clear, descriptive title")
    summary: str = Field(description="2-4 sentences for snackable preview")
    category: str = Field(description="One high-level category")
    tags: List[str] = Field(max_length=5, description="3-5 relevant tags")
    actionable_takeaway: str = Field(description="One concrete specific action")
    detailed_summary: Optional[str] = Field(None, description="Markdown formatted detailed summary")


class LinkDocument(BaseModel):
    """
    Firestore document schema for a saved link
    Collection path: users/{uid}/links/{linkId}
    """
    url: str
    title: str
    summary: str
    detailed_summary: Optional[str] = None
    tags: List[str] = Field(max_length=5)
    category: str
    status: LinkStatus = LinkStatus.UNREAD
    created_at: datetime = Field(default_factory=datetime.now)
    metadata: LinkMetadata
    # Reminder fields
    reminder_status: ReminderStatus = ReminderStatus.NONE
    next_reminder_at: Optional[datetime] = None
    reminder_count: int = 0
    last_viewed_at: Optional[datetime] = None


class WebhookPayload(BaseModel):
    """
    Incoming WhatsApp message payload
    This structure depends on your WhatsApp provider (Twilio, etc.)
    TODO: Adjust fields based on actual provider
    """
    from_number: str = Field(alias="From", description="Sender phone number in E.164 format")
    body: str = Field(alias="Body", description="Message content containing the URL")
    message_sid: Optional[str] = Field(None, alias="MessageSid")


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
    phone_number: str = Field(description="Phone number in E.164 format, e.g., +97250...")
    created_at: datetime = Field(default_factory=datetime.now)
    settings: UserSettings = Field(default_factory=UserSettings)
    last_saved_link_id: Optional[str] = Field(None, description="ID of the last saved link for context")
