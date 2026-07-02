"""
WhatsApp Handler
Handles WhatsApp webhook processing and message sending via Twilio.
"""

import os
import re
import logging
from typing import Optional
from datetime import datetime, timezone

from twilio.rest import Client

from link_service import is_hebrew
from reminder_service import format_local_time

logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")

# Connections ("how this links to other notes in your brain") is built and
# ready below but kept OFF until the related-links quality is dialed in. Flip
# this to True to ship it — no other change needed.
INCLUDE_CONNECTIONS = False


def _wa_clean(text: str) -> str:
    """Convert markdown **bold** to WhatsApp *bold* and trim whitespace."""
    if not text:
        return ""
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)
    return text.strip()


def _extract_key_points(detailed: str, limit: int = 3) -> list:
    """Pull the first few bullet points out of the markdown detailedSummary."""
    if not detailed:
        return []
    points = []
    for raw in detailed.splitlines():
        line = raw.strip()
        if line.startswith(("- ", "* ", "• ")):
            point = _wa_clean(line[2:])
            if point:
                points.append(point)
        if len(points) >= limit:
            break
    return points


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
    link_id: Optional[str] = None,
    tz: Optional[str] = None
) -> str:
    """
    Format a rich success message using the final link data structure.
    Supports English ("en") and Hebrew ("he").
    Detects YouTube content and formats with video-specific fields.
    """
    title = link_data.get("title", "Untitled")
    category = link_data.get("category", "General")
    source_type = link_data.get("sourceType", "web")
    source_name = link_data.get("sourceName")

    meta = link_data.get("metadata", {})
    gist = _wa_clean(link_data.get("summary", ""))
    takeaway = _wa_clean(meta.get("actionableTakeaway", ""))

    is_youtube = source_type == "youtube"
    is_he = language == "he"

    # Emojis for categories
    cat_emoji = "📂"
    if "Recipe" in category: cat_emoji = "🍲"
    elif "Tech" in category: cat_emoji = "💻"
    elif "Health" in category: cat_emoji = "❤️"
    elif "Business" in category: cat_emoji = "💼"
    elif "Science" in category: cat_emoji = "🔬"

    lbl_saved = "✅ *נשמר ב-Machina AI*" if is_he else "✅ *Saved to Machina AI*"
    lbl_gist = "📌 *בקצרה*" if is_he else "📌 *In one line*"
    lbl_points = "🔑 *כדאי לדעת*" if is_he else "🔑 *Worth knowing*"
    lbl_moments = "🔑 *רגעים מרכזיים*" if is_he else "🔑 *Key moments*"
    lbl_min = "דק׳ קריאה" if is_he else "min read"
    lbl_view_app = "📲 *פתח ב-Machina AI*" if is_he else "📲 *Open in Machina AI*"

    lines = [lbl_saved, "", f"🧠 *{title}*"]

    # Compact context line (one line instead of stacked metadata rows).
    if is_youtube:
        channel = meta.get("youtubeChannel") or source_name
        duration = meta.get("durationDisplay", "")
        ctx = []
        if channel: ctx.append(f"🎬 {channel}")
        if duration: ctx.append(f"⏱️ {duration}")
        if ctx: lines.append(" · ".join(ctx))
    else:
        read_time = meta.get("estimatedReadTime", 1)
        ctx = [f"{cat_emoji} {category}", f"⏱️ {read_time} {lbl_min}"]
        if source_name and source_name != "Screenshot":
            ctx.append(source_name)
        lines.append(" · ".join(ctx))

    # The gist — the single most useful line. Fall back to the takeaway.
    lead = gist or takeaway
    if lead:
        lines += ["", lbl_gist, lead]

    # "Worth knowing" — key points (web) or timestamped moments (video).
    if is_youtube:
        highlights = meta.get("videoHighlights", [])
        if highlights:
            lines += ["", lbl_moments]
            for h in highlights[:4]:
                if isinstance(h, dict):
                    ts, desc = h.get("timestamp", ""), h.get("description", "")
                    lines.append(f"• {ts} — {desc}" if ts and desc else f"• {desc or ts}")
                elif isinstance(h, str):
                    lines.append(f"• {h}")
    else:
        points = _extract_key_points(link_data.get("detailedSummary", ""), 3)
        if points:
            lines += ["", lbl_points]
            lines += [f"• {p}" for p in points]
        elif takeaway and takeaway != lead:
            lines += ["", lbl_points, f"• {takeaway}"]

    # Connections to other notes — built, but gated behind INCLUDE_CONNECTIONS
    # until the related-links quality is ready. Kept here for later execution.
    if INCLUDE_CONNECTIONS:
        related = link_data.get("relatedLinks", []) or []
        named = [r for r in related if r.get("title")]
        if named:
            lbl_conn = (f"🧠 *מקושר ל-{len(named)} פתקים במוח שלך*"
                        if is_he else f"🧠 *Connects to {len(named)} notes in your brain*")
            lines += ["", lbl_conn]
            lines += [f"↳ {r['title']}" for r in named[:3]]
            lines.append("_פתח כדי לראות איך הם מתחברים →_" if is_he else "_Open to see how they link →_")

    # Reminder — quick-reply menu (N = days, S = spaced repetition).
    lines.append("")
    if reminder_time:
        date_str = format_local_time(reminder_time, tz, is_he)
        lbl_set = "⏰ *התזכורת נקבעה:*" if is_he else "⏰ *Reminder set:*"
        lines.append(f"{lbl_set} {date_str}")
    elif is_he:
        lines.append('⏰ *להזכיר לי לחזור?* השב/י *1*, *2*, *3* או *7* (ימים) — או *S* לחזרה מרווחת')
    else:
        lines.append('⏰ *Remind me to revisit?* reply *1*, *2*, *3* or *7* (days) — or *S* for spaced repetition')

    if link_id:
        lines += ["", lbl_view_app, f"{APP_URL}?linkId={link_id}"]

    return "\n".join(lines)
