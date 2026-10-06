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
  • how many cards                             (digest_count)
  • when, in their local time                  (digest_hour, digest_minute, digest_day)

There is ONE curation: a balanced mix of the backlog and older saves worth a
second look (`curate`). Digests used to offer a STYLE — smart / rediscover /
by-topic, and before those random / unread / favorites — but resurfacing now has
one surface (the app's Today tab) and one behaviour, so the picker is gone and
`digest_mode` is no longer a user choice. Every stored value, live or retired,
resolves to that one curation at read time (`normalize_mode`); nothing is
rewritten, so an existing workspace keeps working untouched. `digest_topic` /
`digest_topics` only ever fed the by-topic style and are now ignored.
"""

import re
import time
import random
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from google.cloud import firestore

from db import get_db, SCHEDULER_STATE_COLLECTION
from entitlement import is_pro
from log_safe import mask_uid
from models import UNANALYZED_STATUSES

logger = logging.getLogger(__name__)

# How old (days) a save must be before curate() counts it as "worth a second
# look" and mixes it in with the fresh backlog.
# Client mirror: web/lib/reviewQueue.ts forgottenQueue() twins this half of the
# curation for in-app Review mode — keep the SHAPE in sync (constants
# intentionally differ: the deck uses 30d and no random backfill).
REDISCOVER_MIN_AGE_DAYS = 14
# A card kept in the review deck (reviewedAt) rests this long before a digest
# may pick it again. The digest push opens the deck on the digest's own cards,
# so without the rest a Keep would come straight back tomorrow. Mirrors
# REVIEWED_REST_DAYS in web/lib/reviewQueue.ts.
REVIEWED_REST_DAYS = 30
# Cap how many links we pull per user when curating (keeps reads bounded).
CANDIDATE_LIMIT = 500

# How often the `send_digests` scheduler ticks (functions/main.py). A period is
# due from the first tick at or after the user's target hour:minute, so this is
# also the delivery latency of an on-time tick (missed ticks catch up for
# DIGEST_CATCHUP, below). MUST stay in sync with the cron in send_digests.
# Smaller = tighter to the chosen minute but proportionally more scheduler
# invocations (cost).
DIGEST_CADENCE_MINUTES = 5

# The one curation. Still written onto every digest doc (the client type carries
# the field) and still the value the client saves, so nothing about the stored
# shape changes.
DIGEST_MODE = "smart"

# The weekly synthesis's LEGACY encoding: it used to be a digest style occupying
# the mode slot, before it got its own `synthesis_enabled` toggle. It is not a
# curation mode, so normalize_mode never returns it — the two read paths that
# still honour it (_synthesis_enabled and build_and_send_digest's routing) test
# the RAW stored value instead. Removing that test would silently stop the
# weekly recap for any workspace that hasn't saved its settings since the
# toggle shipped.
LEGACY_SYNTHESIS_MODE = "synthesis"


def normalize_mode(mode: Optional[str]) -> str:
    """Resolve any stored digest_mode to the one live curation.

    Every value maps to 'smart': the three modes that used to be pickable
    (smart / rediscover / topic), the three retired before them (random /
    unread / favorites), the legacy 'synthesis' style, and anything
    unrecognized. The stale value is never written back. MIRRORED in
    web/lib/useUserSettings.ts normalizeDigestMode."""
    return DIGEST_MODE


def is_legacy_synthesis_mode(settings: dict) -> bool:
    """True when this workspace still encodes the weekly synthesis the old way,
    as digest_mode == 'synthesis'. Reads the RAW value on purpose (see
    LEGACY_SYNTHESIS_MODE)."""
    return (settings or {}).get("digest_mode") == LEGACY_SYNTHESIS_MODE

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


def _settings_of(user_data) -> dict:
    """The user's `settings` map, or {} when it is missing or not a map.

    `settings` is client-writable, and the schedulers read it for every user
    in one loop. A non-dict value (a modified client could write
    `settings: "x"`; the rules now type-check it, this is the server half)
    must degrade to defaults for THAT user, never raise into the loop.
    """
    if not isinstance(user_data, dict):
        return {}
    settings = user_data.get("settings")
    return settings if isinstance(settings, dict) else {}


def _normalize_channels(stored) -> List[str]:
    """Resolve a user's stored digest_channels into the live channel set.

    Digest delivery is push-only (plus the always-on in-app surface). A missing
    setting defaults to ['push']; any legacy 'whatsapp' entry is migrated to
    'push' at read time (deduped), so a user who only ever had WhatsApp still
    receives push digests. The retired 'email' channel is dropped at read time —
    email delivery was cut — and is never written back.
    """
    if not isinstance(stored, list):
        return ["push"]
    return list(dict.fromkeys(
        "push" if c == "whatsapp" else c
        for c in stored
        if c != "email"
    ))


# ─────────────────────────────────────────────────────────────────────────
# Curation
# ─────────────────────────────────────────────────────────────────────────

def fetch_candidate_links(uid: str) -> List[dict]:
    """Load the user's links (excluding archived) as plain dicts with `id`.

    KNOWN LIMIT: the fetch is bounded by CANDIDATE_LIMIT but NOT ordered, so a
    user past that many saves gets an arbitrary (doc-id-ordered) slice — which
    can thin out rediscover/synthesis quality. A server-side order_by("createdAt")
    is unsafe here: createdAt is stored mixed number|string across docs (see
    web/lib/types.ts), and Firestore sorts across types, so it would corrupt the
    order. A correct fix needs a normalized numeric sort field (a backfill/
    migration) — tracked in SOURCE_OF_TRUTH §4, deferred until it actually bites.

    PRIVACY (2026-07-27): effectively-private cards (own `isPrivate` flag or
    membership in a private collection) are dropped here, at the single point
    both consumers read from. It matters more on this path than anywhere else:
    the digest renders card titles into an in-app surface, and the SYNTHESIS
    mode sends every card in the window to Gemini and then puts the model's
    generated title into a PUSH NOTIFICATION — i.e. a private card's subject
    on a locked phone. Ask has enforced the same rule since it shipped
    (`search.strip_private_cards`); these two surfaces never got it.
    """
    # Lazy import: `search` pulls in ai_service/genai, which the scheduler
    # path has no other reason to load (house pattern in this module).
    from search import is_effectively_private, private_collection_ids

    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    docs = links_ref.limit(CANDIDATE_LIMIT).get()

    private_ids = private_collection_ids(uid)
    links = []
    for doc in docs:
        data = doc.to_dict() or {}
        if data.get("status") == "archived":
            continue
        # A card with no analysis yet (mid-capture, failed, or a save waiting
        # for the 1st) has no summary to put in a digest.
        if data.get("status") in UNANALYZED_STATUSES:
            continue
        if is_effectively_private(data, private_ids):
            continue
        # Drop the heavy embedding vector — never needed for a digest.
        data.pop("embedding_vector", None)
        data["id"] = doc.id
        links.append(data)
    return links


def curate(links: List[dict], count: int) -> List[dict]:
    """
    Pick `count` cards out of `links`: a balanced mix of the untouched backlog
    and older saves worth a second look. THE curation — the mode/topic branches
    that used to sit here went with the style picker. Pure function (no I/O) so
    it can be unit-tested.
    """
    count = max(1, min(int(count or 5), 20))
    # Defense in depth: never surface archived cards even if they slip in.
    links = [l for l in links if l.get("status") != "archived"]
    if not links:
        return []

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    age_cutoff = now_ms - REDISCOVER_MIN_AGE_DAYS * 86_400_000

    def created(l):
        return _to_ms(l.get("createdAt"))

    def viewed(l):
        return max(_to_ms(l.get("lastViewedAt")), _to_ms(l.get("reviewedAt")))

    # Already dealt with from the deck: kept recently, or a reminder is on its
    # way. Only the random backfill may reach these, and only as a last resort.
    rest_cutoff = now_ms - REVIEWED_REST_DAYS * 86_400_000

    def handled(l):
        return l.get("reminderStatus") == "pending" or _to_ms(l.get("reviewedAt")) > rest_cutoff

    unread = [l for l in links if l.get("status") not in ("archived", "favorite")
              and not l.get("isRead") and not handled(l)]
    unread.sort(key=created)

    old = [l for l in links if created(l) and created(l) < age_cutoff and not handled(l)]
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
        rest.sort(key=handled)  # stable: unhandled first, each half shuffled
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
    material for the weekly recap. Pure function so it can be unit-tested.

    Cards flagged `askExcluded` are dropped: the flag means the card's stored
    text trips Gemini's non-configurable prompt filter (the 2026-07-24
    incident), and this window is fed straight to `synthesize_week`. Ask has
    filtered it since that incident; the weekly call could still be poisoned by
    the same one card, losing the whole synthesis. Privacy filtering happens
    upstream in fetch_candidate_links, which both consumers share.
    """
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    cutoff = now_ms - SYNTHESIS_WINDOW_DAYS * 86_400_000
    links = [l for l in links if not l.get("askExcluded")]
    recent = [l for l in links if _to_ms(l.get("createdAt")) >= cutoff]
    recent.sort(key=lambda l: _to_ms(l.get("createdAt")), reverse=True)
    return recent


def _card_index(cards: List[dict]) -> dict:
    return {c["id"]: c for c in cards if c.get("id")}


# The synthesis title is model output over the week's saves, i.e. over page
# text a third party wrote, and it lands on a lock screen as Machina speaking.
# Only plain words go out: markdown, HTML and anything URL-shaped are removed
# and the result is capped (push_service's own 200-char cap is for payload
# size, not for what a notification title should read like).
PUSH_TITLE_MAX_CHARS = 80
SYNTHESIS_PUSH_FALLBACK_TITLE = "What you learned this week"
_MD_LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
# Scheme/www URLs, plus bare domains on the TLDs a lure would use. A general
# "word.word/path" rule would also eat titles like "Node.js/Deno".
_URLISH_RE = re.compile(
    r"(?:https?://|www\.)\S+"
    r"|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|app|xyz|info|biz|me|ly|link|"
    r"click|top|site|online|shop|live|ru|cn|tk)\b(?:/\S*)?",
    re.IGNORECASE)
_HTML_TAG_RE = re.compile(r"<[^>]*>")
_MD_MARK_RE = re.compile(r"[*_`#>~|\\]+")


def push_safe_title(title, fallback: str = SYNTHESIS_PUSH_FALLBACK_TITLE) -> str:
    """`title` as plain notification text: markdown links reduced to their
    words, URLs and HTML dropped, emphasis marks removed, whitespace squeezed,
    capped at PUSH_TITLE_MAX_CHARS on a word boundary. Pure."""
    t = _MD_LINK_RE.sub(r"\1", str(title or ""))
    t = _HTML_TAG_RE.sub(" ", t)
    t = _URLISH_RE.sub(" ", t)
    t = " ".join(_MD_MARK_RE.sub(" ", t).split()).strip(" -:;,")
    if len(t) > PUSH_TITLE_MAX_CHARS:
        t = t[:PUSH_TITLE_MAX_CHARS].rsplit(" ", 1)[0].rstrip(" -:;,") + "…"
    return t or fallback


def synthesis_teaser(narrative: str, max_len: int = 160) -> str:
    """The first sentence of the narrative, for the locked (free-plan) card.

    One sentence is the whole point: enough to show the recap is real and
    about THIS week, not enough to read it. Falls back to a hard cut when the
    opening sentence runs long."""
    text = " ".join((narrative or "").split())
    if not text:
        return ""
    for sep in (". ", "! ", "? "):
        idx = text.find(sep)
        if 0 < idx < max_len:
            return text[: idx + 1]
    if len(text) <= max_len:
        return text
    cut = text[:max_len].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "..."


def locked_synthesis_doc(full: dict) -> dict:
    """The user-visible shape of a synthesis a free workspace may not read yet:
    title + one-line teaser + counts, `locked: True`, and NO narrative, themes,
    standout or question. The full doc goes to the vault (entitlement.py)."""
    return {
        "weekId": full.get("weekId"),
        "title": full.get("title"),
        "teaser": synthesis_teaser(full.get("narrative") or ""),
        "locked": True,
        "narrative": "",
        "themes": [],
        "standoutCardId": None,
        "standoutReason": "",
        "openQuestion": "",
        "cards": [],
        "cardCount": full.get("cardCount", 0),
        "createdAt": full.get("createdAt"),
    }


def _write_inapp_synthesis(uid: str, synth: dict, cards: List[dict], week_id: str,
                           pro: bool = True) -> bool:
    """Persist the synthesis as an in-app "special card" the feed surfaces (M12).

    Stored at users/{uid}/syntheses/{week_id} (one per ISO week, so a re-run
    within the same week overwrites rather than duplicates). We denormalize the
    referenced cards' id+title+category so the card renders even if a source is
    later deleted — the feed still deep-links by id when the card exists.

    Machina Pro: a free workspace (`pro=False`) gets the LOCKED shape here
    (title + teaser) and the full payload is stashed in the functions-only
    synthesis_vault, from which going Pro restores it in place. Generation
    still happens for everyone: it costs a fraction of a cent and the teaser
    is the upgrade moment.

    Returns True on a successful write, False if it failed — the caller gates
    `sent` on this so a swallowed write error isn't reported as a delivered
    synthesis (which would also settle the period and suppress the retry).
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
        if not pro:
            from entitlement import stash_synthesis  # lazy: keeps cold starts light
            # Vault first: if the visible write fails after this, the next run
            # regenerates anyway; if the vault write fails, the user must not
            # be shown a teaser whose body nobody can ever unlock.
            stash_synthesis(uid, week_id, doc)
            doc = locked_synthesis_doc(doc)
        get_db().collection("users").document(uid).collection("syntheses").document(week_id).set(doc)
        return True
    except Exception as e:
        logger.error(f"Failed to write in-app synthesis for {mask_uid(uid)}: {e}")
        return False


def build_and_send_synthesis(uid: str, user_data: dict, links: Optional[List[dict]] = None,
                             force: bool = False, week_id: Optional[str] = None,
                             push_hold: Optional[str] = None) -> dict:
    """Generate the weekly "What you learned" synthesis and deliver it.

    Always writes the in-app special card (that's the primary surface), and
    additionally sends a push notification when the user has the push channel on.
    Returns a result dict shaped like build_and_send_digest's.

    `links` None defers the candidate read (up to CANDIDATE_LIMIT documents)
    until after the per-week dedupe check, so a week already delivered costs
    one read. `week_id` pins the ISO week the scheduled period belongs to
    (run_digest_check derives it from the period's target, so a retry later
    in the catch-up window lands on the same doc); default: the current week.
    `push_hold` (run_digest_check, see push_hold_reason) delivers in-app only.
    """
    from ai_service import GeminiService, AnalysisError

    settings = _settings_of(user_data)
    channels = _normalize_channels(settings.get("digest_channels"))
    result = {"uid": uid, "sent": False, "channels": [], "card_count": 0, "skipped": None, "mode": "synthesis"}

    week_id = week_id or _week_id()

    # Synthesis is inherently weekly. The schedule's frequency is independent of
    # the mode, so a user can pair mode=synthesis with frequency=daily — under
    # which is_due's 20h guard would fire this path every day, re-generating the
    # same 7-day recap (wasted Gemini spend) and pushing a duplicate each day.
    # Guard on the per-week doc: if this week's synthesis already exists, it's
    # been delivered — skip regen + push. `force` (the preview button) bypasses
    # for a Pro workspace only: a free workspace sees a locked teaser either
    # way, and letting it regenerate a 500-card synthesis on every tap
    # (10/hour, forever) was a paid call with no product behind it.
    if not force or not is_pro(uid):
        try:
            existing = (
                get_db().collection("users").document(uid)
                .collection("syntheses").document(week_id).get()
            )
            if existing.exists:
                result["skipped"] = "already_sent_this_week"
                return result
        except Exception as e:
            # Fail open: a read error shouldn't block the primary surface.
            logger.warning(f"Synthesis dedupe check failed for {mask_uid(uid)}: {e}")

    if links is None:
        links = fetch_candidate_links(uid)
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
        logger.error(f"Synthesis generation failed for {mask_uid(uid)}: {e}")
        result["skipped"] = "synthesis_failed"
        return result

    result["card_count"] = len(cards)

    # Machina Pro: free workspaces get the locked teaser (see _write_inapp_synthesis).
    pro = is_pro(uid)
    result["locked"] = not pro

    # Primary surface: write the in-app special card. If this fails, the
    # synthesis wasn't delivered — don't report it sent (that would settle the
    # period and suppress the next retry). Mirrors build_and_send_digest.
    if not _write_inapp_synthesis(uid, synth, cards, week_id, pro=pro):
        result["skipped"] = "write_failed"
        return result
    result["channels"].append("in_app")

    # Push (native iOS)
    if "push" in channels and push_hold:
        # Delivered late (see push_hold_reason): the recap is in the app,
        # the notification is not sent.
        result["push_held"] = push_hold
        logger.info(f"Synthesis: push held for {mask_uid(uid)} ({push_hold})")
    elif "push" in channels and not user_data.get("fcmTokens"):
        # Same visibility the curated path has — a missing token is the one
        # failure the user can never see from the app.
        logger.info(f"Synthesis: user {mask_uid(uid)} has push channel but no device tokens")
    elif "push" in channels and user_data.get("fcmTokens"):
        from push_service import send_push  # lazy: keeps cold starts light
        try:
            # A locked recap must not promise a body the tap can't show.
            push_body = (
                f"Your weekly synthesis of {len(cards)} cards is ready. Unlock it with Machina Pro."
                if not pro else
                f"Your weekly synthesis of {len(cards)} cards is ready"
            )
            push_result = send_push(
                uid,
                push_safe_title(synth.get("title")),
                push_body,
                {"view": "digest"},
            )
            if push_result.get("sent"):
                result["channels"].append("push")
        except Exception as e:
            logger.error(f"Synthesis push send failed for {mask_uid(uid)}: {e}")

    # No lastDigestSentAt stamp: the recap is not the curated digest, and
    # stamping it made the weekly digest's 6-day guard skip the digest for
    # every user who also had the synthesis on. The per-week doc above is the
    # synthesis's own dedupe; the scheduler records the run (synthesisRun).
    result["sent"] = True
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


def _write_inapp_digest(uid: str, cards: List[dict], frequency: str, tz_name: Optional[str] = None,
                        at: Optional[datetime] = None) -> Optional[str]:
    """Persist the curated digest to users/{uid}/digests/{digestId} (mirrors
    _write_inapp_synthesis). Cards are denormalized so the digest renders even
    if a source link is later deleted; the app still deep-links by id when the
    card exists. Returns the doc id, or None if the write failed.

    `tz_name` is the user's IANA timezone: the period id (daily date / ISO week)
    is derived in local time so it matches the local-time schedule that fired the
    digest and the local date the client renders — not the UTC day, which can
    differ by one near midnight for far-from-UTC users. `at` (the scheduled
    period's local target time) pins the id to the period itself, so a
    catch-up delivery after local midnight still files under its own day."""
    period = "Daily" if frequency == "daily" else "Weekly"
    digest_id = _digest_id(frequency, at or _local_now(tz_name))

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
        # Constant now (there is one curation), kept on the doc because the
        # client's CuratedDigest type reads it and older docs carry it.
        "mode": DIGEST_MODE,
        "frequency": frequency,
        "title": f"Your {period} Brew",
        # Topics only ever meant "the by-topic style picked these"; with that
        # style gone nothing narrows a digest, so a new one carries none. Older
        # docs keep theirs and still render their chips.
        "topics": [],
        "cards": card_refs,
        "cardCount": len(card_refs),
    }
    try:
        col = get_db().collection("users").document(uid).collection("digests")
        col.document(digest_id).set(doc)
    except Exception as e:
        logger.error(f"Failed to write in-app digest for {mask_uid(uid)}: {e}")
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
        logger.warning(f"Digest retention cleanup failed for {mask_uid(uid)}: {e}")


# ─────────────────────────────────────────────────────────────────────────
# Orchestration
# ─────────────────────────────────────────────────────────────────────────

def build_and_send_digest(uid: str, user_data: dict, force: bool = False,
                          period: Optional[datetime] = None,
                          push_hold: Optional[str] = None) -> dict:
    """
    Build a curated digest for one user and deliver it on their chosen
    channels. `force=True` ignores schedule/empty checks (used by the
    "send one now" preview button). `period` is the scheduled period's local
    target time (run_digest_check); it names the digest doc and, on the legacy
    synthesis route, the ISO week. Default: now. `push_hold` (run_digest_check,
    see push_hold_reason) delivers in-app only.

    Returns a per-user result dict.
    """
    settings = _settings_of(user_data)
    result = {"uid": uid, "sent": False, "channels": [], "card_count": 0, "skipped": None}

    count = settings.get("digest_count", 5)
    frequency = settings.get("digest_frequency", "weekly")
    channels = _normalize_channels(settings.get("digest_channels"))

    # The weekly "What you learned" synthesis (M12) is its own narrative path —
    # it recaps the week's saves instead of curating a set of cards. Routed on
    # the RAW stored mode: a workspace that predates the synthesis_enabled
    # toggle still encodes the recap here (see LEGACY_SYNTHESIS_MODE). It reads
    # its own candidates, after its per-week dedupe check.
    if is_legacy_synthesis_mode(settings):
        week_id = _week_id(period.astimezone(timezone.utc)) if period else None
        return build_and_send_synthesis(uid, user_data, None, force=force, week_id=week_id,
                                        push_hold=push_hold)

    # Curated digests are Pro-only (Machina Pro). Checked after the synthesis
    # branch on purpose: the synthesis path has its own locked-teaser handling.
    # And BEFORE the candidate read: a free workspace (the digest toggle is on
    # by default) used to pay up to CANDIDATE_LIMIT document reads per
    # scheduled check for a digest it was never going to get.
    # Info, not warning: a free user with the toggle on is expected, not wrong.
    if not is_pro(uid):
        logger.info(f"Digest: skipping curated digest for free workspace {mask_uid(uid)} (Pro feature)")
        result["skipped"] = "pro_required"
        return result

    links = fetch_candidate_links(uid)
    cards = curate(links, count)

    # Nothing to curate → nothing to deliver. NOTE: the `digest_skip_empty`
    # setting is currently inert — an empty digest is always skipped, because a
    # digest with zero cards has nothing to render or push. The "Skip when empty"
    # toggle in Settings is decorative pending a product decision (drop it, or
    # give its off-state a distinct "nothing new this period" behaviour).
    if not cards:
        result["skipped"] = "no_cards"
        return result

    result["card_count"] = len(cards)
    db = get_db()
    delivered_any = False

    # In-app (always-on surface): persist the digest BEFORE any channel sends,
    # so the Digest section shows it even when every outbound channel fails. The
    # digest's period id is computed in the user's local time so its doc id (and
    # the date the client renders from it) agree with the schedule that fired it.
    digest_id = _write_inapp_digest(uid, cards, frequency, user_data.get("timezone"), at=period)
    if digest_id:
        result["channels"].append("in_app")
        result["digest_id"] = digest_id
        delivered_any = True

    # Push (native iOS)
    if "push" in channels and push_hold:
        # Delivered late (see push_hold_reason): the digest is in the app,
        # the notification is not sent.
        result["push_held"] = push_hold
        logger.info(f"Digest: push held for {mask_uid(uid)} ({push_hold})")
    elif "push" in channels:
        if user_data.get("fcmTokens"):
            from push_service import send_push  # lazy: keeps cold starts light
            period = "Daily" if frequency == "daily" else "Weekly"
            try:
                push_result = send_push(
                    uid,
                    f"Your {period} Brew",
                    f"{len(cards)} card{'s' if len(cards) != 1 else ''} to revisit",
                    # review=1: the tap opens the review deck on THIS digest's
                    # cards (web/lib/push.ts). Older app builds ignore the extra
                    # keys and open the Revisit tab as before.
                    {"view": "digest", "review": "1", "digestId": digest_id},
                )
                if push_result.get("sent"):
                    result["channels"].append("push")
            except Exception as e:
                logger.error(f"Digest push send failed for {mask_uid(uid)}: {e}")
        else:
            logger.info(f"Digest: user {mask_uid(uid)} has push channel but no device tokens")

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


# A scheduled period stays open this long after its target time. The gates
# used to match ONE cadence-wide window (five minutes a week for a weekly
# digest or synthesis), so a missed tick, or a run that failed, lost the whole
# period. Inside the window a later tick retries until the period is SETTLED
# (delivered, or skipped for a reason a retry cannot change), which the
# scheduler records on the user doc (`digestRun` / `synthesisRun`), so a
# settled period costs nothing on later ticks and is never sent twice.
DIGEST_CATCHUP = timedelta(hours=6)
# A failed attempt waits this long before a later tick retries it: a synthesis
# attempt is a paid model call plus a candidate read.
DIGEST_RETRY_AFTER = timedelta(minutes=30)
# ...and a synthesis is attempted at most this many times per period (each
# attempt is up to two model calls). The count rides the run stamp
# (synthesisRun.n): the per-week syntheses/{weekId} doc exists only once a
# recap is delivered, and the app renders whatever is there.
SYNTHESIS_MAX_PERIOD_ATTEMPTS = 3
# A push is for the moment the user picked. Within the catch-up window a
# period can be delivered hours late (a digest due at 21:00 could push at
# 02:00), so a late one lands in the app without its push: more than
# DIGEST_PUSH_LATE_AFTER late, or late at all (past DIGEST_ON_TIME) inside the
# user's night, QUIET_HOURS local. An on-time delivery pushes at whatever hour
# the user chose: someone who picked 23:00 still gets their 23:00 push.
DIGEST_PUSH_LATE_AFTER = timedelta(hours=2)
DIGEST_ON_TIME = timedelta(minutes=15)
QUIET_HOURS = (22, 7)  # [22:00, 07:00) local
# Skips no retry can change: they settle the period like a delivery does.
_SETTLED_SKIPS = frozenset({"no_cards", "pro_required", "already_sent_this_week",
                            "not_enough_cards"})


def _fired_window(settings: dict, tz_name: Optional[str],
                  window: Optional[timedelta] = None) -> Optional[datetime]:
    """The local target datetime whose window [target, target + window) this
    scheduler tick falls in, or None (default window: DIGEST_CATCHUP).
    Comparing actual datetimes (not raw hour/minute) makes this correct across
    midnight: a target of 23:58 is caught by the 00:00 tick, and the returned
    datetime still reports the day the window opened on — which is what the
    weekly day checks need. Shared by the digest and synthesis due-gates."""
    local = _local_now(tz_name)
    target_hour = int(settings.get("digest_hour", 9))
    target_minute = int(settings.get("digest_minute", 0))
    target_today = local.replace(
        hour=target_hour, minute=target_minute, second=0, microsecond=0
    )
    window = window or DIGEST_CATCHUP
    for candidate in (target_today, target_today - timedelta(days=1)):
        if timedelta(0) <= (local - candidate) < window:
            return candidate
    return None


def _stamp_at(last_run):
    """The ms timestamp of a run stamp, or None."""
    at = last_run.get("at") if isinstance(last_run, dict) else None
    return None if isinstance(at, bool) or not isinstance(at, (int, float)) else at


def _stamp_attempts(last_run) -> int:
    """Attempts the stamp records for its period (1 for stamps that predate
    the count)."""
    n = last_run.get("n") if isinstance(last_run, dict) else None
    return n if isinstance(n, int) and not isinstance(n, bool) and n > 0 else 1


def _period_open(target: datetime, last_run, max_attempts: Optional[int] = None) -> bool:
    """True while the period whose window opened at `target` still needs a
    run: nothing recorded since `target`, or only a failed attempt at least
    DIGEST_RETRY_AFTER ago (and, with `max_attempts`, fewer failed attempts
    than that). `last_run` is the {"at": ms, "ok": bool, "n": attempts} stamp
    run_digest_check leaves after each attempt (absent before the first)."""
    at = _stamp_at(last_run)
    if at is None or at < target.timestamp() * 1000:
        return True
    if last_run.get("ok") is True:
        return False
    if max_attempts and _stamp_attempts(last_run) >= max_attempts:
        return False
    now_ms = _local_now(None).timestamp() * 1000
    return now_ms - at >= DIGEST_RETRY_AFTER.total_seconds() * 1000


def push_hold_reason(target: datetime, tz_name: Optional[str]) -> Optional[str]:
    """Why a scheduled delivery for the period that opened at `target` should
    skip its push ("late", "quiet_hours"), or None to push (see
    DIGEST_PUSH_LATE_AFTER)."""
    local = _local_now(tz_name)
    late = local - target
    if late > DIGEST_PUSH_LATE_AFTER:
        return "late"
    start, end = QUIET_HOURS
    if late > DIGEST_ON_TIME and (local.hour >= start or local.hour < end):
        return "quiet_hours"
    return None


def run_settled(result: dict) -> bool:
    """Did this attempt settle its period (see DIGEST_CATCHUP)?"""
    return bool(result.get("sent")) or result.get("skipped") in _SETTLED_SKIPS


def _synthesis_enabled(settings: dict) -> bool:
    """The dedicated toggle, plus the legacy encoding: digest_mode 'synthesis'
    (when it was a digest style) implied the weekly synthesis. The client
    migrates that to synthesis_enabled on its next settings save."""
    if settings.get("synthesis_enabled"):
        return True
    return is_legacy_synthesis_mode(settings)


def synthesis_due_at(settings: dict, tz_name: Optional[str], last_run=None) -> Optional[datetime]:
    """Weekly synthesis due-gate: the local target time of the period that is
    due now (the user's synthesis_day at their digest hour, up to
    DIGEST_CATCHUP late, not yet settled per `last_run`, fewer than
    SYNTHESIS_MAX_PERIOD_ATTEMPTS failed attempts), or None.
    build_and_send_synthesis is also idempotent per ISO week (the
    syntheses/{weekId} doc), so a lost run stamp can't double-send."""
    if not _synthesis_enabled(settings):
        return None
    fired = _fired_window(settings, tz_name)
    if fired is None or fired.weekday() != int(settings.get("synthesis_day", 6)):
        return None
    return fired if _period_open(fired, last_run, SYNTHESIS_MAX_PERIOD_ATTEMPTS) else None


def is_synthesis_due(settings: dict, tz_name: Optional[str], last_run=None) -> bool:
    return synthesis_due_at(settings, tz_name, last_run) is not None


def digest_due_at(settings: dict, tz_name: Optional[str], last_sent_ms: Optional[int],
                  last_run=None) -> Optional[datetime]:
    """
    The local target time of the digest period that is due *right now*, or
    None. Called by the `send_digests` scheduler every DIGEST_CADENCE_MINUTES:
    due from the first tick at or after the user's exact local hour:minute
    until the period settles (see DIGEST_CATCHUP / `last_run`), and
    last_sent_ms still guards against a second send within the same period
    (a "send one now" preview counts).
    """
    if not settings.get("digest_enabled"):
        return None
    # NOTE: no digest_channels requirement — the in-app Digest section is the
    # always-on surface, so a digest with zero outbound channels still runs
    # (it just persists to users/{uid}/digests and sends nothing).

    fired = _fired_window(settings, tz_name)
    if fired is None or not _period_open(fired, last_run):
        return None

    frequency = settings.get("digest_frequency", "weekly")
    now_ms = int(_local_now(None).timestamp() * 1000)
    last = last_sent_ms or 0

    if frequency == "daily":
        # Guard window: at least 20h since the last send.
        return fired if (now_ms - last) >= 20 * 3600 * 1000 else None

    # weekly — the day-of-week is the day the target window opened on.
    target_day = int(settings.get("digest_day", 0))
    if fired.weekday() != target_day:
        return None
    return fired if (now_ms - last) >= 6 * 86_400 * 1000 else None


def is_due(settings: dict, tz_name: Optional[str], last_sent_ms: Optional[int],
           last_run=None) -> bool:
    return digest_due_at(settings, tz_name, last_sent_ms, last_run) is not None


# How long one scheduler tick may spend starting deliveries. Kept well under
# the 5-minute cadence on purpose: the last user a tick starts can still take
# about a minute (a synthesis is up to two 25s model calls plus reads and a
# push), and a tick that ends before the next one starts can never race it
# into a double send. Anyone it did not reach is still in their catch-up
# window next tick. send_digests' timeout_sec is the backstop.
DIGEST_TICK_BUDGET_S = 180


def _record_run(db, uid: str, field: str, ok: bool, target: Optional[datetime] = None,
                last_run=None) -> None:
    """Stamp the scheduled attempt (see _period_open), counting the attempts
    made for the period that opened at `target` (`last_run` is the stamp the
    scan read). Best effort: a lost stamp only means one more cheap check,
    deduped by the period's own guard."""
    n = 1
    at = _stamp_at(last_run)
    if target is not None and at is not None and at >= target.timestamp() * 1000:
        n = _stamp_attempts(last_run) + 1
    try:
        db.collection("users").document(uid).set(
            {field: {"at": int(_local_now(None).timestamp() * 1000), "ok": bool(ok), "n": n}},
            merge=True)
    except Exception as e:
        logger.warning(f"Digest run stamp {field} failed for {mask_uid(uid)}: {type(e).__name__}")


# Where the last deferred walk stopped (scheduler_state/digestWalk): the next
# tick starts after that user and wraps to the front, so a tick that runs out
# of budget hands the rest of the line to the next one instead of serving the
# same first users again.
_WALK_STATE_DOC = "digestWalk"


def _walk_state(db):
    return db.collection(SCHEDULER_STATE_COLLECTION).document(_WALK_STATE_DOC)


def _walk_resume_after(db) -> Optional[str]:
    """The uid the last deferred walk stopped after, or None. Never raises."""
    try:
        snap = _walk_state(db).get()
        uid = (snap.to_dict() or {}).get("resumeAfter") if snap.exists else None
    except Exception as e:
        logger.warning(f"Digest walk cursor unreadable ({type(e).__name__}); walking from the top")
        return None
    return uid if isinstance(uid, str) and uid and "/" not in uid else None


def _save_walk_resume_after(db, uid: Optional[str]) -> None:
    try:
        _walk_state(db).set({"resumeAfter": uid,
                             "at": int(_local_now(None).timestamp() * 1000)})
    except Exception as e:
        logger.warning(f"Digest walk cursor not saved ({type(e).__name__})")


def _user_walk(db, fields: List[str], resume_after: Optional[str]):
    """Every user doc (field-masked), in id order from just after
    `resume_after`, wrapping around to it; from the top when None."""
    users = db.collection("users")
    if not resume_after:
        yield from users.select(fields).stream()
        return
    cursor = {"__name__": resume_after}
    yield from users.select(fields).order_by("__name__").start_after(cursor).stream()
    yield from users.select(fields).order_by("__name__").end_at(cursor).stream()


def run_digest_check(budget_s: float = DIGEST_TICK_BUDGET_S) -> dict:
    """
    Scheduled entry point. Walks every user, sends a digest to those who are
    due, records each attempt (see _period_open), and stops starting new
    users once `budget_s` is spent (they catch up next tick, which starts
    after the last user this one started). Returns a summary report (mirrors
    run_reminder_check's shape).
    """
    db = get_db()
    logger.info("Starting digest check…")
    started = time.monotonic()

    report = {
        "users_checked": 0,
        "users_enabled": 0,
        "digests_sent": 0,
        "syntheses_sent": 0,
        "cards_delivered": 0,
        "deferred": False,
        "errors": [],
    }

    # Slim scan: stream() (don't buffer every user doc in memory) and a field
    # mask so each scanned doc carries only what the due gates AND the send
    # path (build_and_send_digest / _synthesis) actually read — settings,
    # timezone, lastDigestSentAt, fcmTokens, and the run stamps — never the
    # rest of the user doc. Because these fields cover the full send path, no
    # per-DUE-user re-fetch is needed.
    resume_after = _walk_resume_after(db)
    last_started = None
    scan = _user_walk(
        db, ["settings", "timezone", "lastDigestSentAt", "fcmTokens", "digestRun", "synthesisRun"],
        resume_after)
    for user_doc in scan:
        if time.monotonic() - started > budget_s:
            report["deferred"] = True
            logger.warning("Digest check: tick budget spent; the remaining users catch up next tick")
            break
        report["users_checked"] += 1
        uid = user_doc.id
        last_started = uid
        user_data = user_doc.to_dict() or {}
        settings = _settings_of(user_data)

        # Curated digest pass. Legacy note: a stored digest_mode of 'synthesis'
        # still routes build_and_send_digest to the synthesis path here — the
        # per-week idempotency guard makes any overlap with the independent
        # synthesis pass below a no-op.
        if settings.get("digest_enabled"):
            report["users_enabled"] += 1
            period = None
            try:
                period = digest_due_at(settings, user_data.get("timezone"),
                                       user_data.get("lastDigestSentAt"), user_data.get("digestRun"))
                if period is not None:
                    res = build_and_send_digest(
                        uid, user_data, force=False, period=period,
                        push_hold=push_hold_reason(period, user_data.get("timezone")))
                    _record_run(db, uid, "digestRun", run_settled(res),
                                period, user_data.get("digestRun"))
                    if res.get("sent"):
                        report["digests_sent"] += 1
                        report["cards_delivered"] += res.get("card_count", 0)
            except Exception as e:
                if period is not None:
                    _record_run(db, uid, "digestRun", False, period, user_data.get("digestRun"))
                err = f"Digest failed for {mask_uid(uid)}: {e}"
                logger.error(err)
                report["errors"].append(err)

        # Weekly synthesis pass — independent of the digest (its own toggle and
        # delivery day), so both can run for the same user. Idempotent per ISO
        # week, so a re-fired window never double-generates or double-pushes.
        # The week is the one the period's TARGET falls in (UTC, as the doc ids
        # always were), so a retry later in the catch-up window that crosses
        # midnight still finds the doc an earlier attempt wrote.
        target = None
        try:
            target = synthesis_due_at(settings, user_data.get("timezone"), user_data.get("synthesisRun"))
            if target is not None:
                synth_res = build_and_send_synthesis(
                    uid, user_data, None, force=False,
                    week_id=_week_id(target.astimezone(timezone.utc)),
                    push_hold=push_hold_reason(target, user_data.get("timezone")))
                _record_run(db, uid, "synthesisRun", run_settled(synth_res),
                            target, user_data.get("synthesisRun"))
                if synth_res.get("sent"):
                    report["syntheses_sent"] += 1
        except Exception as e:
            if target is not None:
                _record_run(db, uid, "synthesisRun", False, target, user_data.get("synthesisRun"))
            err = f"Synthesis failed for {mask_uid(uid)}: {e}"
            logger.error(err)
            report["errors"].append(err)

    # Keep the walk's place: a deferred tick hands the next one the users
    # after the last it started; a full lap starts the next walk at the top.
    if report["deferred"] and last_started:
        _save_walk_resume_after(db, last_started)
    elif not report["deferred"] and resume_after:
        _save_walk_resume_after(db, None)

    logger.info(f"Digest check complete: {report}")
    return report
