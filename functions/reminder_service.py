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

# Initial interval (in days) for the "S" spaced-repetition quick reply.
SPACED_START_DAYS = 3


def format_local_time(dt: datetime, tz_name: Optional[str], is_he: bool = False) -> str:
    """Format a UTC datetime in the user's local timezone (falls back to UTC)."""
    try:
        if tz_name:
            from zoneinfo import ZoneInfo
            dt = dt.astimezone(ZoneInfo(tz_name))
    except Exception as e:
        logger.warning(f"Bad timezone {tz_name!r}: {e}")
    return dt.strftime('%d/%m %H:%M') if is_he else dt.strftime('%b %d at %I:%M %p')


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

    # Quick-reply menu: a bare number means "remind me in that many days"
    # (1 -> 1 day, 2 -> 2 days, 7 -> 7 days …). "S" starts spaced repetition,
    # whose initial interval is SPACED_START_DAYS; run_reminder_check carries
    # the schedule on from there.
    stripped = text.strip()
    if stripped in ('s', 'spaced'):
        return now + timedelta(days=SPACED_START_DAYS)
    if stripped.isdigit():
        days = int(stripped)
        if 1 <= days <= 365:
            return now + timedelta(days=days)

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
        start_days = SPACED_START_DAYS
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


def should_complete_reminder(profile: str, new_reminder_count: int) -> bool:
    """
    Decide whether a just-fired reminder is finished (stops recurring).

    A reminder completes when it's a true one-shot ('once' — the "tomorrow",
    "next week", "custom" and numbered quick-reply choices) or when it has
    fired the maximum number of times (>= 3). Every other profile ('smart',
    'spaced-N') recurs via calculate_next_reminder until it hits that cap.

    Pure decision so it can be unit-tested offline without Firestore.
    """
    return profile == "once" or new_reminder_count >= 3


def run_reminder_check() -> dict:
    """
    Main logic for checking pending reminders and delivering them.

    Every due reminder is surfaced IN-APP (the link is flagged reminderDue so
    the feed can show it) regardless of push — the promise "I'll remind you"
    must always produce something the user can see in-app. Push is delivered on
    top when the user has it enabled with a live token. The schedule (advance/
    complete) runs identically whether or not push was sent.
    Returns a summary dict.
    """
    # Import here to avoid circular dependency
    from push_service import send_push

    db = get_db()
    logger.info("Starting reminder logic execution...")

    users_ref = db.collection('users')
    users = users_ref.get()

    report = {
        "users_checked": 0,
        "users_with_reminders_enabled": 0,
        "reminders_found": 0,
        "reminders_sent": 0,
        "reminders_surfaced": 0,
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

        fcm_tokens = user_data.get('fcmTokens') or []

        # Push channel resolution. In-app surfacing (below) is always on; push
        # is the extra notification channel when the user has it. Users predating
        # the push rollout (or with a legacy 'whatsapp' entry stored) are migrated
        # at read time: a missing setting defaults to ['push'], and any stored
        # 'whatsapp' entry is normalized to 'push' (deduped). New workspaces
        # default to ["push"] (DEFAULT_USER_SETTINGS in link_service.py).
        stored = settings.get('reminders_channel')
        if stored is None:
            channels = ['push']
        else:
            channels = list(dict.fromkeys(
                'push' if c == 'whatsapp' else c for c in stored
            ))
        wants_push = 'push' in channels and bool(fcm_tokens)

        # NOTE: we no longer skip users without push. Reminders are surfaced
        # in-app for everyone (see below); push is an extra channel on top.

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
            err_msg = f"Failed to query reminders for user {uid}: {e}"
            logger.error(err_msg)
            report["errors"].append(err_msg)
            continue

        if due_links:
            logger.info(f"Found {len(due_links)} reminders for user {uid}")
            report["reminders_found"] += len(due_links)

        for link_doc in due_links:
            link_id = link_doc.id
            link_data = link_doc.to_dict()

            title = link_data.get('title', 'Untitled')
            category = link_data.get('category', 'General')
            reminder_count = link_data.get('reminderCount', 0)

            is_he = is_hebrew(title)

            try:
                # In-app is the always-available channel: flag the link so the
                # feed surfaces a "Reminders due" strip even with no push. This
                # write is the delivery — it can't silently fail the way a dead
                # push token can, so a reminder is never stuck pending in the past.
                updates = {'reminderDue': True, 'reminderDueAt': now_ms}

                pushed = False
                if wants_push:
                    push_title = "🧠 זמן לחזור אל" if is_he else "🧠 Time to revisit"
                    push_body = title if not category else f"{title} · {category}"
                    push_result = send_push(uid, push_title, push_body, {"linkId": link_id})
                    pushed = bool(push_result.get("sent"))

                if pushed:
                    report["reminders_sent"] += 1
                else:
                    # No push (user hasn't enabled it, or the token just died) —
                    # the in-app strip is how they'll see it.
                    report["reminders_surfaced"] += 1

                new_reminder_count = reminder_count + 1
                profile = link_data.get('reminderProfile', 'smart')

                # One-shots ('once' — tomorrow / next week / custom / numbered
                # quick-reply) fire exactly once. 'smart' and 'spaced-N' recur up
                # to 3 times via the spaced-repetition schedule.
                if should_complete_reminder(profile, new_reminder_count):
                    updates.update({
                        'reminderStatus': ReminderStatus.COMPLETED.value,
                        'reminderCount': new_reminder_count,
                        'nextReminderAt': None,
                    })
                else:
                    next_reminder = calculate_next_reminder(new_reminder_count, profile=profile)
                    updates['reminderCount'] = new_reminder_count
                    updates['nextReminderAt'] = int(next_reminder.timestamp() * 1000)

                link_doc.reference.update(updates)
                logger.info(f"Delivered reminder for link {link_id} (push={pushed})")
            except Exception as e:
                err_msg = f"Failed to send reminder for link {link_id}: {e}"
                logger.error(err_msg)
                report["errors"].append(err_msg)

    logger.info(f"Reminder execution complete. Report: {report}")
    return report
