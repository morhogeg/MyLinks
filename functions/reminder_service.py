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


# Max due reminders processed per scheduler tick. One bounded collection-group
# query replaces the old per-user scan; anything beyond this rolls to the next
# tick. Kept well above realistic per-tick due volume so it's effectively a
# safety ceiling, not a throttle.
REMINDER_BATCH_LIMIT = 500

# Max due reminders DELIVERED per user per tick. A user with a large accumulated
# backlog (e.g. reminders re-enabled after a long pause) would otherwise get all
# of them — pushes and writes — in a single tick. The rest stay pending and fire
# on subsequent ticks; there's no starvation because each processed doc changes
# status/nextReminderAt and so leaves the ASC-ordered batch head.
REMINDER_PER_USER_LIMIT = 10

# How long a due doc is snoozed when its owner can't be delivered to right now
# (reminders disabled, or the user doc is missing / failed to load). Pushing
# nextReminderAt to now+1h moves the doc off the head of the ASC-ordered,
# limit-500 due query so it stops being re-fetched every tick and starving other
# users. A user who re-enables reminders sees the reminder within <= 1h.
REMINDER_SNOOZE_MS = 60 * 60 * 1000


def _is_missing_index_error(exc: Exception) -> bool:
    """True when a Firestore query failed because a composite index is missing.

    Firestore raises FAILED_PRECONDITION ("The query requires an index") when the
    collection-group index isn't deployed. Duck-typed (not importing
    google.api_core.exceptions) so it stays detectable in the offline test
    harness: match the exception class name and the gRPC status text."""
    if "FailedPrecondition" in type(exc).__name__:
        return True
    msg = str(exc)
    return "FAILED_PRECONDITION" in msg or "requires an index" in msg


def _snooze_due_links(link_docs, snooze_to_ms: int) -> None:
    """Push each due doc's nextReminderAt forward (int ms, type preserved).

    Used when the owner can't be delivered to this tick — see REMINDER_SNOOZE_MS.
    Best-effort per doc so one bad write doesn't abort the sweep."""
    for link_doc in link_docs:
        try:
            link_doc.reference.update({'nextReminderAt': int(snooze_to_ms)})
        except Exception as e:
            logger.error(f"Failed to snooze reminder for link {link_doc.id}: {e}")


def _uid_from_link_ref(reference) -> Optional[str]:
    """Derive the owner uid from a link doc reference (users/{uid}/links/{id}).

    Uses the reference's parent chain (parent = the 'links' collection,
    parent.parent = the 'users/{uid}' document); falls back to parsing the path
    string. Returns None if the shape is unexpected (defensive — such a doc is
    skipped rather than crashing the whole tick)."""
    try:
        owner = reference.parent.parent
        if owner is not None and owner.id:
            return owner.id
    except Exception:
        pass
    try:
        parts = [p for p in str(reference.path).split('/') if p]
        # users/{uid}/links/{id}
        if len(parts) >= 2 and parts[0] == 'users':
            return parts[1]
    except Exception:
        pass
    return None


def run_reminder_check() -> dict:
    """
    Main logic for checking pending reminders and delivering them.

    Every due reminder is surfaced IN-APP (the link is flagged reminderDue so
    the feed can show it) regardless of push — the promise "I'll remind you"
    must always produce something the user can see in-app. Push is delivered on
    top when the user has it enabled with a live token. The schedule (advance/
    complete) runs identically whether or not push was sent.

    Scale: one bounded collection-group query finds every due reminder across
    all users in a single read (reminderStatus == 'pending' AND
    nextReminderAt <= now, limit REMINDER_BATCH_LIMIT), instead of loading all
    user docs and running a per-user scan. Due docs are grouped by owner uid
    (derived from the doc path) and each affected user's doc is fetched exactly
    once — only for users that actually have due reminders — for the settings /
    push-token data the send path needs.

    Legacy nextReminderAt coercion is gone: every writer (set_reminder and this
    function) stores nextReminderAt as an integer-ms value, and the '<=' filter
    against an integer only matches integer-typed fields, so any stale
    Timestamp/string value simply isn't returned (it can't be "due" until a
    writer rewrites it as ms). Docs left stranded by that (legacy Timestamp/
    string values) are repaired by the admin coercion sweep — force_check_reminders
    with ?coerce=1 in main.py. A read-time isinstance guard defends the send path.
    Returns a summary dict.
    """
    # Import here to avoid circular dependency
    from push_service import send_push

    db = get_db()
    logger.info("Starting reminder logic execution...")

    report = {
        "users_checked": 0,
        "users_with_reminders_enabled": 0,
        "reminders_found": 0,
        "reminders_sent": 0,
        "reminders_surfaced": 0,
        "errors": []
    }

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    # One bounded query across every user's links subcollection (needs the
    # COLLECTION_GROUP composite index in firestore.indexes.json).
    try:
        due_links = list(
            db.collection_group('links')
            .where('reminderStatus', '==', 'pending')
            .where('nextReminderAt', '<=', now_ms)
            .limit(REMINDER_BATCH_LIMIT)
            .get()
        )
    except Exception as e:
        if _is_missing_index_error(e):
            # The collection-group composite index is missing → the query can
            # never succeed and reminders silently stop firing. Make it LOUD and
            # actionable rather than a one-line warning buried in logs.
            err_msg = (
                "REMINDERS HALTED — the 'links' collection-group index "
                "(reminderStatus, nextReminderAt) is missing, so NO reminders "
                "can fire until it is deployed. Fix: run "
                "`firebase deploy --only firestore:indexes`. Underlying error: "
                f"{e}"
            )
        else:
            err_msg = f"Failed to query due reminders: {e}"
        logger.error(err_msg)
        report["errors"].append(err_msg)
        return report

    # Group due docs by owner uid (users/{uid}/links/{id}).
    by_uid: dict = {}
    for link_doc in due_links:
        uid = _uid_from_link_ref(link_doc.reference)
        if not uid:
            logger.warning(f"Skipping due reminder with unexpected path: {getattr(link_doc.reference, 'path', '?')}")
            continue
        by_uid.setdefault(uid, []).append(link_doc)

    report["users_checked"] = len(by_uid)

    # Batch-fetch every affected user's doc in ONE round trip (db.get_all) instead
    # of a sequential .get() per uid. Maps uid -> user_data dict, or None when the
    # doc is missing OR the whole batch fetch failed — either way the owner can't
    # be delivered to, so their due docs are snoozed below.
    uids = list(by_uid.keys())
    user_data_by_uid: dict = {}
    try:
        user_refs = [db.collection('users').document(uid) for uid in uids]
        for snap in db.get_all(user_refs):
            if getattr(snap, 'exists', True):
                user_data_by_uid[snap.id] = snap.to_dict() or {}
            else:
                user_data_by_uid[snap.id] = None
    except Exception as e:
        # Batch fetch failed wholesale — treat every affected user as unloadable
        # so their due docs get snoozed (not left to starve the batch head).
        err_msg = f"Failed to batch-load users for reminders: {e}"
        logger.error(err_msg)
        report["errors"].append(err_msg)
        user_data_by_uid = {uid: None for uid in uids}

    for uid, user_links in by_uid.items():
        user_data = user_data_by_uid.get(uid)

        if user_data is None:
            # User doc missing or its fetch failed. Snooze so these due docs stop
            # sorting to the head of the ASC-ordered limit-500 query and starving
            # everyone (they'd otherwise be re-fetched untouched every tick).
            _snooze_due_links(user_links, now_ms + REMINDER_SNOOZE_MS)
            continue

        settings = user_data.get('settings', {}) or {}
        enabled = settings.get('reminders_enabled', settings.get('remindersEnabled', True))

        if not enabled:
            # Reminders are OFF. Snooze the due docs (nextReminderAt -> now+1h)
            # rather than leaving them pending-in-the-past: untouched, they'd stay
            # at the head of the due query and be re-fetched every 2-min tick,
            # eventually starving users who CAN be delivered to. A user who
            # re-enables reminders still sees the reminder within <= 1h.
            _snooze_due_links(user_links, now_ms + REMINDER_SNOOZE_MS)
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

        report["reminders_found"] += len(user_links)
        logger.info(f"Found {len(user_links)} reminders for user {uid}")

        # Deliver at most REMINDER_PER_USER_LIMIT this tick; the rest stay pending
        # and fire on subsequent ticks (a big backlog can't flood one user with
        # pushes/writes at once). No starvation: delivered docs advance their
        # status/nextReminderAt, so the leftovers surface next tick.
        for link_doc in user_links[:REMINDER_PER_USER_LIMIT]:
            link_id = link_doc.id
            link_data = link_doc.to_dict() or {}

            # Defensive: skip any doc whose nextReminderAt isn't a usable number
            # (should never happen — the '<=' int filter excludes non-numeric
            # values — but never fire on a value we can't reason about).
            if not isinstance(link_data.get('nextReminderAt'), (int, float)):
                continue

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


def _coerce_reminder_ms(value):
    """Normalize a nextReminderAt value to int epoch-ms for the '<=' int filter.

    Returns ``(new_value_or_None, status)`` where status is:
    - 'ok'          — already an int; no rewrite needed (new_value is None).
    - 'converted'   — new_value is the int-ms to write in its place.
    - 'unparseable' — couldn't be interpreted; leave the doc as-is (new_value None).

    Handles the legacy shapes that got stranded once read-time coercion was
    removed: a Firestore Timestamp / datetime (has ``.timestamp()`` → epoch
    seconds), a numeric or ISO-8601 string, and a float. Pure so it's unit-testable
    offline without Firestore."""
    # bool is an int subclass — never a valid ms value.
    if isinstance(value, bool):
        return None, 'unparseable'
    if isinstance(value, int):
        return None, 'ok'
    if isinstance(value, float):
        return int(value), 'converted'
    # Firestore Timestamp / datetime expose .timestamp() → epoch seconds.
    ts = getattr(value, 'timestamp', None)
    if callable(ts):
        try:
            return int(ts() * 1000), 'converted'
        except Exception:
            return None, 'unparseable'
    if isinstance(value, str):
        s = value.strip()
        try:
            return int(float(s)), 'converted'
        except ValueError:
            pass
        try:
            dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000), 'converted'
        except ValueError:
            return None, 'unparseable'
    return None, 'unparseable'


def coerce_pending_reminder_times(limit: int = 1000) -> dict:
    """One-time admin repair sweep for legacy nextReminderAt values.

    The '<=' int filter in run_reminder_check only matches integer-typed fields,
    so any pending reminder whose nextReminderAt is a Firestore Timestamp or a
    string is permanently stranded (never "due"). This bounded pass finds pending
    reminders, client-side type-checks each nextReminderAt, and rewrites the
    non-int ones to int ms (Timestamp → epoch-ms; unparseable → left in place and
    counted). Admin-triggered (force_check_reminders?coerce=1), not on the hot
    scheduler path. Returns counts."""
    db = get_db()
    report = {"scanned": 0, "converted": 0, "already_int": 0,
              "unparseable": 0, "errors": []}
    try:
        docs = list(
            db.collection_group('links')
            .where('reminderStatus', '==', 'pending')
            .limit(limit)
            .get()
        )
    except Exception as e:
        err_msg = f"Reminder coercion query failed: {e}"
        logger.error(err_msg)
        report["errors"].append(err_msg)
        return report

    for link_doc in docs:
        report["scanned"] += 1
        data = link_doc.to_dict() or {}
        new_ms, status = _coerce_reminder_ms(data.get('nextReminderAt'))
        if status == 'ok':
            report["already_int"] += 1
        elif status == 'unparseable':
            report["unparseable"] += 1
        else:  # 'converted'
            try:
                link_doc.reference.update({'nextReminderAt': new_ms})
                report["converted"] += 1
            except Exception as e:
                report["errors"].append(f"{link_doc.id}: {e}")

    if report["unparseable"]:
        logger.warning(
            "Reminder coercion left %d unparseable nextReminderAt value(s)",
            report["unparseable"],
        )
    logger.info(f"Reminder coercion sweep complete. Report: {report}")
    return report
