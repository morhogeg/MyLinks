"""
WhatsApp Handler
Handles WhatsApp webhook processing and message sending via Twilio.
"""

import os
import logging
from typing import Optional
from datetime import datetime, timezone

from twilio.rest import Client

from link_service import is_hebrew

logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")


def send_whatsapp_message(to_number: str, body: str):
    """Send a WhatsApp message via Twilio."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

    if not account_sid or not auth_token:
        logger.warning(f"Twilio credentials missing. Would have sent to {to_number}: {body[:100]}...")
        return

    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            from_=from_number,
            body=body,
            to=to_number
        )
        logger.info(f"Sent message: {message.sid}")
    except Exception as e:
        logger.error(f"Twilio error: {e}")


def format_success_message(
    link_data: dict,
    reminder_time: Optional[datetime] = None,
    language: str = "en",
    link_id: Optional[str] = None
) -> str:
    """
    Format a rich success message using the final link data structure.
    Supports English ("en") and Hebrew ("he").
    """
    title = link_data.get("title", "Untitled")
    category = link_data.get("category", "General")
    tags = link_data.get("tags", [])

    meta = link_data.get("metadata", {})
    read_time = meta.get("estimatedReadTime", 1)
    takeaway = meta.get("actionableTakeaway")

    # Emojis for categories
    cat_emoji = "📂"
    if "Recipe" in category: cat_emoji = "🍲"
    elif "Tech" in category: cat_emoji = "💻"
    elif "Health" in category: cat_emoji = "❤️"
    elif "Business" in category: cat_emoji = "💼"
    elif "Science" in category: cat_emoji = "🔬"

    is_he = language == "he"

    lbl_saved = "✅ *נשמר למוח השני*" if is_he else "✅ *Saved to Second Brain*"
    lbl_category = "קטגוריה" if is_he else "Category"
    lbl_read_time = "זמן קריאה" if is_he else "Read Time"
    lbl_min = "דק׳" if is_he else "min"
    lbl_tags = "תגיות" if is_he else "Tags"
    lbl_insight = "💡 *תובנה מרכזית:*" if is_he else "💡 *Key Insight:*"
    lbl_reminder_set = "⏰ *התזכורת נקבעה:*" if is_he else "⏰ *Reminder Set:*"
    lbl_reply_hint = "השב/י עם \"תזכורת\" לקביעת תזכורת." if is_he else "REPLY with \"reminder\" to set a reminder."
    lbl_view_app = "🔗 *פתח במוח השני:*" if is_he else "🔗 *Open in Second Brain:*"

    lines = [
        f"{lbl_saved}",
        f"",
        f"📄 *{title}*",
        f"",
        f"{cat_emoji} *{lbl_category}:* {category}",
        f"⏱️ *{lbl_read_time}:* {read_time} {lbl_min}",
        f"🏷️ *{lbl_tags}:* {', '.join([f'#{t}' for t in tags[:3]])}"
    ]

    if takeaway:
        lines.append(f"")
        lines.append(f"{lbl_insight}")
        lines.append(f"{takeaway}")

    lines.append(f"")

    if reminder_time:
        date_str = reminder_time.strftime('%b %d at %I:%M %p')
        lines.append(f"{lbl_reminder_set} {date_str}")
    else:
        lines.append(f"{lbl_reply_hint}")

    if link_id:
        lines.append(f"")
        lines.append(f"{lbl_view_app}")
        lines.append(f"{APP_URL}?linkId={link_id}")

    return "\n".join(lines)
