"""
Digest Service
==============
Delivers a *curated set of saved cards* to the user on a schedule (daily or
weekly). Every digest is ALWAYS persisted to users/{uid}/digests — the in-app
Digest section is the always-on surface — and additionally sent over the
opt-in delivery channel (iOS push).

The user controls, from Settings:
  • whether digests are on at all              (digest_enabled)
  • how often                                  (digest_frequency: daily | weekly)
  • where to                                   (digest_channels: push)
  • what to curate                             (digest_mode)
  • a topic to focus on                        (digest_topic, when mode=topic)
  • how many cards                             (digest_count)
  • when, in their local time                  (digest_hour, digest_minute, digest_day)

Curation modes (digest_mode) — three survivors:
  smart      – a balanced mix of backlog + rediscovery (the default)
  rediscover – "on this day": older saves you haven't opened in a while
  topic      – only cards from a chosen category/tag

Three earlier modes (random / unread / favorites) were retired. A stored value
of any of them is mapped to 'smart' at read time (see REMOVED_MODE_ALIASES) so
existing settings keep working; the removed value is never written back.
"""

import random
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from google.cloud import firestore

from db import get_db

logger = logging.getLogger(__name__)

# How old (days) a save must be before "rediscover" will resurface it.
# Client mirror: web/lib/reviewQueue.ts forgottenQueue() twins the rediscover
# branch for in-app Review mode — keep the SHAPE in sync (constants
# intentionally differ: the deck uses 30d and no random backfill).
REDISCOVER_MIN_AGE_DAYS = 14
# Cap how many links we pull per user when curating (keeps reads bounded).
CANDIDATE_LIMIT = 500

# How often the `send_digests` scheduler ticks (functions/main.py). is_due()
# fires on the first tick at or after the user's target hour:minute, so this is
# also the worst-case delivery latency and the width of the is_due match window.
# MUST stay in sync with the cron in send_digests. Smaller = tighter to the
# chosen minute but proportionally more scheduler invocations (cost).
DIGEST_CADENCE_MINUTES = 5

VALID_MODES = {"smart", "topic", "rediscover", "synthesis"}

# Retired curation modes → the surviving mode they now resolve to. A user whose
# settings still carry one of these keeps getting a digest (curated via the
# mapped survivor) with no error; the stale value is normalized at read time and
# never written back. Kept here (not in curate) so every read path shares it.
# MIRRORED in web/lib/useUserSettings.ts REMOVED_DIGEST_MODES — retire or add
# modes in BOTH places or client and server will disagree on stored settings.
REMOVED_MODE_ALIASES = {"random": "smart", "unread": "smart", "favorites": "smart"}


def normalize_mode(mode: Optional[str]) -> str:
    """Resolve a stored digest_mode to a live one: retired modes map to their
    survivor (REMOVED_MODE_ALIASES), anything unrecognized falls back to 'smart'."""
    mode = mode or "smart"
    mode = REMOVED_MODE_ALIASES.get(mode, mode)
    return mode if mode in VALID_MODES else "smart"

# How many days of saves the weekly "What you learned" synthesis (M12) looks back
# over, and the minimum number of cards in that window worth synthesizing (below
# this a recap would be thin — skip rather than send something hollow).
SYNTHESIS_WINDOW_DAYS = 7
SYNTHESIS_MIN_CARDS = 3


def _to_ms(value) -> int:
    """Best-effort coerce a Firestore timestamp / ISO string / number to ms."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        # Heuristic: seconds vs milliseconds.
        return int(value if value > 1e11 else value * 1000)
    if hasattr(value, "timestamp"):
        return int(value.timestamp() * 1000)
    if isinstance(value, str):
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            return 0
    return 0


def _normalize_channels(stored) -> List[str]:
    """Resolve a user's stored digest_channels into the live channel set.

    Digest delivery is push-only (plus the always-on in-app surface). A missing
    setting defaults to ['push']; any legacy 'whatsapp' entry is migrated to
    'push' at read time (deduped), so a user who only ever had WhatsApp still
    receives push digests. The retired 'email' channel is dropped at read time —
    email delivery was cut — and is never written back.
    """
    if stored is None:
        return ["push"]
    return list(dict.fromkeys(
        "push" if c == "whatsapp" else c
        for c in (stored or [])
        if c != "email"
    ))


# ─────────────────────────────────────────────────────────────────────────
# Curation
# ─────────────────────────────────────────────────────────────────────────

def fetch_candidate_links(uid: str) -> List[dict]:
    """Load the user's links (excluding archived) as plain dicts with `id`."""
    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    docs = links_ref.limit(CANDIDATE_LIMIT).get()

    links = []
    for doc in docs:
        data = doc.to_dict() or {}
        if data.get("status") == "archived":
            continue
        # Drop the heavy embedding vector — never needed for a digest.
        data.pop("embedding_vector", None)
        data["id"] = doc.id
        links.append(data)
    return links


def _normalize_topics(topics) -> List[str]:
    """Accept a str, list, or None and return a lowercased, de-duped list."""
    if not topics:
        return []
    if isinstance(topics, str):
        topics = [topics]
    seen, out = set(), []
    for t in topics:
        key = (t or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def curate(links: List[dict], mode: str, count: int, topics=None) -> List[dict]:
    """
    Pick `count` cards out of `links` according to `mode`.

    `topics` may be a single string or a list of categories/tags (used when
    mode == "topic"). Pure function (no I/O) so it can be unit-tested.
    """
    # Read-time mapping: retired modes resolve to their survivor here too, so a
    # stale stored value curates via 'smart' rather than crashing or curating
    # nothing (defense in depth — build_and_send_digest also normalizes on read).
    mode = normalize_mode(mode)
    count = max(1, min(int(count or 5), 20))
    topic_set = set(_normalize_topics(topics))
    # Defense in depth: never surface archived cards even if they slip in.
    links = [l for l in links if l.get("status") != "archived"]
    if not links:
        return []

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    age_cutoff = now_ms - REDISCOVER_MIN_AGE_DAYS * 86_400_000

    def created(l):
        return _to_ms(l.get("createdAt"))

    def viewed(l):
        return _to_ms(l.get("lastViewedAt"))

    if mode == "topic":
        pool = [
            l for l in links
            if topic_set and (
                (l.get("category") or "").lower() in topic_set
                or any(tag.lower() in topic_set for tag in (l.get("tags") or []))
            )
        ]
        random.shuffle(pool)
        return pool[:count]

    if mode == "rediscover":
        pool = [l for l in links
                if created(l) and created(l) < age_cutoff
                and viewed(l) < age_cutoff]
        # Prefer the ones gathering the most dust (least recently touched).
        pool.sort(key=lambda l: max(viewed(l), created(l)))
        if len(pool) < count:
            # Backfill with random older items so the digest isn't thin.
            extra = [l for l in links if l not in pool]
            random.shuffle(extra)
            pool += extra
        return pool[:count]

    # ── smart: a balanced mix of backlog + rediscovery ──────────────────
    unread = [l for l in links if l.get("status") not in ("archived", "favorite")
              and not l.get("isRead")]
    unread.sort(key=created)

    old = [l for l in links if created(l) and created(l) < age_cutoff]
    old.sort(key=lambda l: max(viewed(l), created(l)))

    picks, seen = [], set()
    # Roughly 60% fresh backlog, 40% rediscovery, interleaved.
    fresh_target = max(1, round(count * 0.6))
    for source, take in ((unread, fresh_target), (old, count - fresh_target)):
        for l in source:
            if len(picks) >= count:
                break
            if l["id"] in seen:
                continue
            picks.append(l)
            seen.add(l["id"])
        # (loop continues to second source)

    # Fill any remainder from a shuffle of everything left.
    if len(picks) < count:
        rest = [l for l in links if l["id"] not in seen]
        random.shuffle(rest)
        for l in rest:
            if len(picks) >= count:
                break
            picks.append(l)
            seen.add(l["id"])

    return picks[:count]


# ─────────────────────────────────────────────────────────────────────────
# Weekly "What you learned" synthesis (M12)
# ─────────────────────────────────────────────────────────────────────────

def _week_id(now: Optional[datetime] = None) -> str:
    """Stable id for the current ISO week, e.g. '2026-W27' — one synthesis/week."""
    now = now or datetime.now(timezone.utc)
    iso = now.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def synthesis_window_cards(links: List[dict]) -> List[dict]:
    """The saves from the last SYNTHESIS_WINDOW_DAYS, newest first — the raw
    material for the weekly recap. Pure function so it can be unit-tested."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    cutoff = now_ms - SYNTHESIS_WINDOW_DAYS * 86_400_000
    recent = [l for l in links if _to_ms(l.get("createdAt")) >= cutoff]
    recent.sort(key=lambda l: _to_ms(l.get("createdAt")), reverse=True)
    return recent


def _card_index(cards: List[dict]) -> dict:
    return {c["id"]: c for c in cards if c.get("id")}


def _write_inapp_synthesis(uid: str, synth: dict, cards: List[dict], week_id: str) -> None:
    """Persist the synthesis as an in-app "special card" the feed surfaces (M12).

    Stored at users/{uid}/syntheses/{week_id} (one per ISO week, so a re-run
    within the same week overwrites rather than duplicates). We denormalize the
    referenced cards' id+title+category so the card renders even if a source is
    later deleted — the feed still deep-links by id when the card exists.
    """
    by_id = _card_index(cards)
    referenced_ids = set()
    for theme in (synth.get("themes") or []):
        referenced_ids.update(theme.get("cardIds") or [])
    if synth.get("standoutCardId"):
        referenced_ids.add(synth["standoutCardId"])

    card_refs = [
        {
            "id": cid,
            "title": (by_id[cid].get("title") or "Untitled").strip(),
            "category": by_id[cid].get("category") or "General",
        }
        for cid in referenced_ids if cid in by_id
    ]

    doc = {
        "weekId": week_id,
        "title": synth.get("title") or "What you learned this week",
        "narrative": synth.get("narrative") or "",
        "themes": synth.get("themes") or [],
        "standoutCardId": synth.get("standoutCardId"),
        "standoutReason": synth.get("standoutReason") or "",
        "openQuestion": synth.get("openQuestion") or "",
        "cards": card_refs,
        "cardCount": len(cards),
        "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
    }
    try:
        get_db().collection("users").document(uid).collection("syntheses").document(week_id).set(doc)
    except Exception as e:
        logger.error(f"Failed to write in-app synthesis for {uid}: {e}")


def build_and_send_synthesis(uid: str, user_data: dict, links: List[dict], force: bool = False) -> dict:
    """Generate the weekly "What you learned" synthesis and deliver it.

    Always writes the in-app special card (that's the primary surface), and
    additionally sends a push notification when the user has the push channel on.
    Returns a result dict shaped like build_and_send_digest's.
    """
    from ai_service import GeminiService, AnalysisError

    settings = user_data.get("settings", {}) or {}
    channels = _normalize_channels(settings.get("digest_channels"))
    result = {"uid": uid, "sent": False, "channels": [], "card_count": 0, "skipped": None, "mode": "synthesis"}

    cards = synthesis_window_cards(links)
    if len(cards) < SYNTHESIS_MIN_CARDS and not force:
        result["skipped"] = "not_enough_cards"
        return result
    if not cards:
        result["skipped"] = "no_cards"
        return result

    try:
        synth = GeminiService().synthesize_week(cards)
    except AnalysisError as e:
        logger.error(f"Synthesis generation failed for {uid}: {e}")
        result["skipped"] = "synthesis_failed"
        return result

    result["card_count"] = len(cards)
    week_id = _week_id()

    # Primary surface: always write the in-app special card.
    _write_inapp_synthesis(uid, synth, cards, week_id)
    result["channels"].append("in_app")

    # Push (native iOS)
    if "push" in channels and user_data.get("fcmTokens"):
        from push_service import send_push  # lazy: keeps cold starts light
        try:
            push_result = send_push(
                uid,
                synth.get("title") or "What you learned this week",
                f"Your weekly synthesis of {len(cards)} cards is ready",
                {"view": "digest"},
            )
            if push_result.get("sent"):
                result["channels"].append("push")
        except Exception as e:
            logger.error(f"Synthesis push send failed for {uid}: {e}")

    result["sent"] = True
    get_db().collection("users").document(uid).set(
        {"lastDigestSentAt": int(datetime.now(timezone.utc).timestamp() * 1000)},
        merge=True,
    )
    return result


# ─────────────────────────────────────────────────────────────────────────
# In-app curated digest (the always-on surface)
# ─────────────────────────────────────────────────────────────────────────

# Keep the newest N digest docs per user; older ones are pruned on write so
# the subcollection stays bounded.
DIGEST_RETENTION = 30


def _digest_id(frequency: str, now: Optional[datetime] = None) -> str:
    """Deterministic doc id per period so a re-run within the same period
    overwrites instead of duplicating: daily → '2026-07-06', weekly → '2026-W28'."""
    now = now or datetime.now(timezone.utc)
    if frequency == "daily":
        return now.strftime("%Y-%m-%d")
    return _week_id(now)


def _write_inapp_digest(uid: str, cards: List[dict], mode: str, frequency: str, topics) -> Optional[str]:
    """Persist the curated digest to users/{uid}/digests/{digestId} (mirrors
    _write_inapp_synthesis). Cards are denormalized so the digest renders even
    if a source link is later deleted; the app still deep-links by id when the
    card exists. Returns the doc id, or None if the write failed."""
    period = "Daily" if frequency == "daily" else "Weekly"
    digest_id = _digest_id(frequency)

    card_refs = [
        {
            "id": c.get("id"),
            "title": (c.get("title") or "Untitled").strip(),
            "category": c.get("category") or "General",
            "summary": (c.get("summary") or "").strip(),
            "thumbnailUrl": c.get("thumbnailUrl") or None,
            "sourceName": c.get("sourceName") or None,
            "url": c.get("url") or None,
        }
        for c in cards
    ]

    doc = {
        "id": digest_id,
        "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        "mode": mode,
        "frequency": frequency,
        "title": f"Your {period} Brew",
        "topics": _normalize_topics(topics),
        "cards": card_refs,
        "cardCount": len(card_refs),
    }
    try:
        col = get_db().collection("users").document(uid).collection("digests")
        col.document(digest_id).set(doc)
    except Exception as e:
        logger.error(f"Failed to write in-app digest for {uid}: {e}")
        return None

    _prune_old_digests(uid)
    return digest_id


def _prune_old_digests(uid: str, keep: int = DIGEST_RETENTION) -> None:
    """Best-effort retention: delete digest docs beyond the newest `keep`."""
    try:
        col = get_db().collection("users").document(uid).collection("digests")
        stale = (
            col.order_by("createdAt", direction=firestore.Query.DESCENDING)
            .offset(keep)
            .stream()
        )
        for doc in stale:
            doc.reference.delete()
    except Exception as e:
        logger.warning(f"Digest retention cleanup failed for {uid}: {e}")


# ─────────────────────────────────────────────────────────────────────────
# Orchestration
# ─────────────────────────────────────────────────────────────────────────

def build_and_send_digest(uid: str, user_data: dict, force: bool = False) -> dict:
    """
    Build a curated digest for one user and deliver it on their chosen
    channels. `force=True` ignores schedule/empty checks (used by the
    "send one now" preview button).

    Returns a per-user result dict.
    """
    settings = user_data.get("settings", {}) or {}
    result = {"uid": uid, "sent": False, "channels": [], "card_count": 0, "skipped": None}

    # Read-time mapping: a stored retired mode (random/unread/favorites) resolves
    # to its survivor here so it's never carried past load or written back.
    mode = normalize_mode(settings.get("digest_mode"))
    # Support multi-topic (digest_topics) with single-topic (digest_topic) fallback.
    topics = settings.get("digest_topics") or []
    if not topics and settings.get("digest_topic"):
        topics = [settings["digest_topic"]]
    count = settings.get("digest_count", 5)
    frequency = settings.get("digest_frequency", "weekly")
    channels = _normalize_channels(settings.get("digest_channels"))
    skip_empty = settings.get("digest_skip_empty", True)

    links = fetch_candidate_links(uid)

    # The weekly "What you learned" synthesis (M12) is its own narrative path —
    # it recaps the week's saves instead of curating a set of cards.
    if mode == "synthesis":
        return build_and_send_synthesis(uid, user_data, links, force=force)

    cards = curate(links, mode, count, topics)

    if not cards and skip_empty and not force:
        result["skipped"] = "no_cards"
        return result
    if not cards:
        result["skipped"] = "no_cards"
        return result

    result["card_count"] = len(cards)
    db = get_db()
    delivered_any = False

    # In-app (always-on surface): persist the digest BEFORE any channel sends,
    # so the Digest section shows it even when every outbound channel fails.
    digest_id = _write_inapp_digest(uid, cards, mode, frequency, topics)
    if digest_id:
        result["channels"].append("in_app")
        result["digest_id"] = digest_id
        delivered_any = True

    # Push (native iOS)
    if "push" in channels:
        if user_data.get("fcmTokens"):
            from push_service import send_push  # lazy: keeps cold starts light
            period = "Daily" if frequency == "daily" else "Weekly"
            try:
                push_result = send_push(
                    uid,
                    f"🧠 Your {period} Brew",
                    f"{len(cards)} new card{'s' if len(cards) != 1 else ''} to revisit",
                    {"view": "digest"},
                )
                if push_result.get("sent"):
                    result["channels"].append("push")
            except Exception as e:
                logger.error(f"Digest push send failed for {uid}: {e}")
        else:
            logger.info(f"Digest: user {uid} has push channel but no device tokens")

    if delivered_any:
        result["sent"] = True
        db.collection("users").document(uid).set(
            {"lastDigestSentAt": int(datetime.now(timezone.utc).timestamp() * 1000)},
            merge=True,
        )

    return result


def _local_now(tz_name: Optional[str]) -> datetime:
    now = datetime.now(timezone.utc)
    if tz_name:
        try:
            from zoneinfo import ZoneInfo
            return now.astimezone(ZoneInfo(tz_name))
        except Exception as e:
            logger.warning(f"Bad timezone {tz_name!r}: {e}")
    return now


def is_due(settings: dict, tz_name: Optional[str], last_sent_ms: Optional[int]) -> bool:
    """
    Decide whether a user's digest is due *right now*. Designed to be called by
    the `send_digests` scheduler every DIGEST_CADENCE_MINUTES — fires once on the
    first tick at or after the user's exact local hour:minute, and uses
    last_sent_ms to avoid duplicate sends within the same period.
    """
    if not settings.get("digest_enabled"):
        return False
    # NOTE: no digest_channels requirement — the in-app Digest section is the
    # always-on surface, so a digest with zero outbound channels still runs
    # (it just persists to users/{uid}/digests and sends nothing).

    local = _local_now(tz_name)
    target_hour = int(settings.get("digest_hour", 9))
    target_minute = int(settings.get("digest_minute", 0))

    # Fire on the first scheduler tick in [target, target + cadence). Comparing
    # actual datetimes (not raw hour/minute) makes this correct across midnight:
    # a target of 23:58 is caught by the 00:00 tick, and `fired` still reports
    # the day the window opened on — which is what the weekly day check needs.
    target_today = local.replace(
        hour=target_hour, minute=target_minute, second=0, microsecond=0
    )
    window = timedelta(minutes=DIGEST_CADENCE_MINUTES)
    fired = None
    for candidate in (target_today, target_today - timedelta(days=1)):
        if timedelta(0) <= (local - candidate) < window:
            fired = candidate
            break
    if fired is None:
        return False

    frequency = settings.get("digest_frequency", "weekly")
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    last = last_sent_ms or 0

    if frequency == "daily":
        # Guard window: at least 20h since the last send.
        return (now_ms - last) >= 20 * 3600 * 1000

    # weekly — the day-of-week is the day the target window opened on.
    target_day = int(settings.get("digest_day", 0))
    if fired.weekday() != target_day:
        return False
    return (now_ms - last) >= 6 * 86_400 * 1000


def run_digest_check() -> dict:
    """
    Scheduled entry point. Walks every user, sends a digest to those who are
    due. Returns a summary report (mirrors run_reminder_check's shape).
    """
    db = get_db()
    logger.info("Starting digest check…")

    report = {
        "users_checked": 0,
        "users_enabled": 0,
        "digests_sent": 0,
        "cards_delivered": 0,
        "errors": [],
    }

    for user_doc in db.collection("users").get():
        report["users_checked"] += 1
        uid = user_doc.id
        user_data = user_doc.to_dict() or {}
        settings = user_data.get("settings", {}) or {}

        if not settings.get("digest_enabled"):
            continue
        report["users_enabled"] += 1

        try:
            if not is_due(settings, user_data.get("timezone"), user_data.get("lastDigestSentAt")):
                continue
            res = build_and_send_digest(uid, user_data, force=False)
            if res.get("sent"):
                report["digests_sent"] += 1
                report["cards_delivered"] += res.get("card_count", 0)
        except Exception as e:
            err = f"Digest failed for {uid}: {e}"
            logger.error(err)
            report["errors"].append(err)

    logger.info(f"Digest check complete: {report}")
    return report
