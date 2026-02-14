"""
Reminder Service
Handles reminder scheduling, spaced repetition logic, and reminder checks.
"""

import os
import re
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from db import get_db
from link_service import is_hebrew
from models import ReminderStatus

logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")


def handle_reminder_intent(text: str) -> Optional[datetime]:
    """Parse text for reminder commands (English and Hebrew)."""
    text = re.sub(r'https?://[^\s]+', '', text).lower().strip()
    now = datetime.now(timezone.utc)

    # English Patterns
    if 'tomorrow' in text:
        return now + timedelta(days=1)
    if 'next week' in text:
        return now + timedelta(days=7)
    match = re.search(r'\bin (\d+) days?', text)
    if match:
        return now + timedelta(days=int(match.group(1)))

    # Hebrew Patterns
    if 'מחר' in text:
        return now + timedelta(days=1)
    if 'שבוע הבא' in text:
        return now + timedelta(days=7)
    match_he = re.search(r'(?:בעוד|עוד)\s+(\d+)\s+ימים', text)
    if match_he:
        return now + timedelta(days=int(match_he.group(1)))

    # Numeric shortcuts from menu (exact match only)
    stripped = text.strip()
    if stripped == '1':
        return now + timedelta(days=1)
    if stripped == '2':
        return now + timedelta(days=3)
    if stripped == '3':
        return now + timedelta(days=7)

    return None


def set_reminder(uid: str, link_id: str, reminder_time: datetime, profile: str = "smart"):
    """Set a reminder for a specific link."""
    db = get_db()
    link_ref = db.collection('users').document(uid).collection('links').document(link_id)
    reminder_time_ms = int(reminder_time.timestamp() * 1000)
    link_ref.update({
        'reminderStatus': 'pending',
        'nextReminderAt': reminder_time_ms,
        'reminderCount': 0,
        'reminderProfile': profile
    })


def calculate_next_reminder(reminder_count: int, profile: str = "smart") -> datetime:
    """
    Calculate the next reminder date using spaced repetition.

    Profiles:
    - smart: 1, 7, 30, 90 days
    - spaced: initial (3), 5, 7 days
    - spaced-N: initial N, then progression
    """
    now = datetime.now(timezone.utc)

    if profile.startswith("spaced"):
        start_days = 3
        if "-" in profile:
            try:
                start_days = int(profile.split("-")[1])
            except (ValueError, IndexError):
                pass

        days = 90  # default long term

        if reminder_count == 0:
            days = start_days
        elif start_days == 3:
            if reminder_count == 1: days = 5
            elif reminder_count == 2: days = 7
        elif start_days == 5:
            if reminder_count == 1: days = 7
            elif reminder_count == 2: days = 14
        elif start_days == 7:
            if reminder_count == 1: days = 14
            elif reminder_count == 2: days = 30

        return now + timedelta(days=days)

    else:  # smart
        intervals = {
            0: timedelta(days=1),
            1: timedelta(days=7),
            2: timedelta(days=30),
        }
        interval = intervals.get(reminder_count, timedelta(days=90))
        return now + interval


def run_reminder_check() -> dict:
    """
    Main logic for checking pending reminders and sending WhatsApp messages.
    Returns a summary dict.
    """
    # Import here to avoid circular dependency
    from whatsapp_handler import send_whatsapp_message

    db = get_db()
    logger.info("Starting reminder logic execution...")

    users_ref = db.collection('users')
    users = users_ref.get()

    report = {
        "users_checked": 0,
        "users_with_reminders_enabled": 0,
        "reminders_found": 0,
        "reminders_sent": 0,
        "errors": []
    }

    for user_doc in users:
        uid = user_doc.id
        user_data = user_doc.to_dict()
        report["users_checked"] += 1

        settings = user_data.get('settings', {})
        enabled = settings.get('reminders_enabled', settings.get('remindersEnabled', True))

        if not enabled:
            continue

        report["users_with_reminders_enabled"] += 1

        phone_number = user_data.get('phone_number') or user_data.get('phoneNumber')
        if not phone_number:
            continue

        links_ref = db.collection('users').document(uid).collection('links')
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        # Data Cleanup: Ensure nextReminderAt is always an integer
        all_links_to_clean = links_ref.where('reminderStatus', '==', 'pending').get()
        for l in all_links_to_clean:
            d = l.to_dict()
            nra = d.get('nextReminderAt')
            if hasattr(nra, 'timestamp'):
                new_ms = int(nra.timestamp() * 1000)
                l.reference.update({'nextReminderAt': new_ms})
                logger.info(f"Cleaned up nextReminderAt for link {l.id} (converted Timestamp to {new_ms})")

        query = links_ref.where('reminderStatus', '==', 'pending').where('nextReminderAt', '<=', now_ms).limit(10)

        try:
            due_links = query.get()
        except Exception as e:
            err_msg = f"Failed to query reminders for user {phone_number}: {e}"
            logger.error(err_msg)
            report["errors"].append(err_msg)
            continue

        if due_links:
            logger.info(f"Found {len(due_links)} reminders for user {phone_number}")
            report["reminders_found"] += len(due_links)

        for link_doc in due_links:
            link_id = link_doc.id
            link_data = link_doc.to_dict()

            title = link_data.get('title', 'Untitled')
            url = link_data.get('url', '')
            category = link_data.get('category', 'General')
            reminder_count = link_data.get('reminderCount', 0)

            is_he = is_hebrew(title)

            if is_he:
                cat_name = "מתכון" if category == "Recipe" else category
                message = f"🧠 *לולאת המוח השני*\n\nזמן לחזור אל:\n📄 *{title}*\n📂 {cat_name}\n\n{url}\n\n🔗 *פתח במוח השני:*\n{APP_URL}?linkId={link_id}\n\n💡 *למה עכשיו?* חזרה ברווחים מחזקת את הזיכרון לטווח ארוך."
            else:
                cat_emoji = "📂"
                if "Recipe" in category: cat_emoji = "🍲"
                elif "Tech" in category: cat_emoji = "💻"

                message = f"🧠 *Second Brain Loop*\n\nTime to revisit:\n📄 *{title}*\n{cat_emoji} {category}\n\n{url}\n\n🔗 *Open in Second Brain:*\n{APP_URL}?linkId={link_id}\n\n💡 *Why now?* Spaced repetition strengthens long-term retention."

            try:
                send_whatsapp_message(f"whatsapp:{phone_number}", message)
                report["reminders_sent"] += 1

                new_reminder_count = reminder_count + 1
                profile = link_data.get('reminderProfile', 'smart')
                next_reminder = calculate_next_reminder(new_reminder_count, profile=profile)
                next_reminder_ms = int(next_reminder.timestamp() * 1000)

                if new_reminder_count >= 3:
                    link_doc.reference.update({
                        'reminderStatus': ReminderStatus.COMPLETED.value,
                        'reminderCount': new_reminder_count,
                        'nextReminderAt': None
                    })
                else:
                    link_doc.reference.update({
                        'reminderCount': new_reminder_count,
                        'nextReminderAt': next_reminder_ms
                    })

                logger.info(f"Successfully sent reminder for link {link_id} to {phone_number}")
            except Exception as e:
                err_msg = f"Failed to send reminder for link {link_id}: {e}"
                logger.error(err_msg)
                report["errors"].append(err_msg)

    logger.info(f"Reminder execution complete. Report: {report}")
    return report
