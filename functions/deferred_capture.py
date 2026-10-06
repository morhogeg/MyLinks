"""Saves past the plan's monthly allowance: kept now, analyzed later.

Capture is never gated (SOURCE_OF_TRUTH §7.1). When a save would cross the
workspace's monthly `saves` allowance, the save still succeeds: the card is
written (URL, title, the user's own text) with ``status: 'waiting'`` and no
quota unit is charged. Only the Gemini analysis waits. It runs later, through
the SAME background queue every other capture uses (a ``pending_processing``
job carrying the card's id and a charge token, picked up by
``process_link_background``), when one of these happens:

* **Upgrade.** The entitlement turns Pro: every grant path writes
  ``entitlements/{uid}``, and the trigger on that doc
  (``main.release_waiting_on_upgrade`` → ``release_on_entitlement_write``)
  enqueues the whole backlog oldest first, within the Pro ceiling.
* **The next month.** ``run_waiting_release`` (scheduled daily, see main.py)
  enqueues each workspace's backlog oldest first, but only from the part of the
  month's allowance ABOVE a reserve kept for fresh saves
  (``BACKLOG_RESERVE_FRACTION``), so this month's new saves never queue behind
  last month's. In the last ``END_OF_MONTH_DAYS`` days of the UTC month the
  reserve is released and the backlog may use whatever is left. Daily rather
  than monthly so a failed run heals itself the next day and a unit refunded
  mid-month (a failed analysis) is not left unused. That is also why the copy
  says "next month", not "on the 1st".

**Notes.** A note saved past the allowance is NOT a waiting card: it is the
user's own words, so it stays a normal, visible, searchable card and only its
AI organization (heading, tags, category, takeaway) waits. It carries
``noteEnrichPending: true`` + ``noteEnrichWaitingAt`` instead, and is released
the same way (same order, same allowance, one charged unit), as a job the
worker hands to the existing note-enrichment path.

Every release CHARGES one `saves` unit before enqueuing, so the backlog counts
toward the allowance: a free user's waiting cards eat into the month they are
read in, and a Pro user's backlog counts toward the 1000/month abuse ceiling
(otherwise "save 10,000 links on the free plan, then subscribe" would buy
unbounded analysis for one month's price). Cards that do not fit keep waiting.
A single call enqueues at most ``RELEASE_BATCH`` cards, the same burst size a
bulk import already puts on the queue. The daily sweep decides its cards once
a day but queues them ``RELEASE_SLICE`` at a time, one slice per janitor tick
(``release_next_slice``), so a large backlog never holds every worker
instance while live saves wait behind it.

**Snapshot.** For a link, the page is scraped at save time when that needs no
Gemini (it never does: ``scraper.scrape_url`` is plain HTTP + parsing), and the
extracted content is kept server-side in ``users/{uid}/capture_snapshots/
{cardId}`` (no client rule matches, so clients can neither read nor write it).
Analysis later reads the snapshot instead of the live page, because social
posts get deleted or login-walled. Up to two post images are copied into our
own Storage too, since social CDN image URLs expire. Two kinds of scrape are
NOT snapshotted and are fetched live at analysis time: a direct PDF or image
file (raw bytes up to 10 MB do not belong in a Firestore doc; static files are
also the least likely to vanish), and a page that could not be fetched at all.

The snapshot doc also keeps the share's own fields (the text the user wrote
around the link, the quote flag) from the moment of capture, so nothing the
user typed depends on the scrape job surviving.
"""

import calendar
import logging
import math
from datetime import datetime, timezone
from typing import Callable, Optional

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

import capture_charge
from db import get_db
from log_safe import mask_uid
from quota import meter as meter_quota, refund_quota, quota_usage, quota_limit
from url_key import url_key

logger = logging.getLogger(__name__)

WAITING = "waiting"
SNAPSHOT_COLLECTION = "capture_snapshots"
# A note whose AI organization waits for room in the allowance (see Notes above).
NOTE_PENDING = "noteEnrichPending"
NOTE_WAITING_AT = "noteEnrichWaitingAt"

# The daily sweep's backlog policy (owner decision 2026-10-05): this share of
# the month's allowance is held back for NEW saves; the backlog only uses what
# is above it...
BACKLOG_RESERVE_FRACTION = 0.5
# ...until the last this-many days of the UTC month, when it may use whatever
# is left (an allowance unused by then would otherwise just expire).
END_OF_MONTH_DAYS = 3

# Most cards one release call enqueues: the same burst MAX_IMPORT_LINKS puts on
# the queue, which process_link_background (max_instances) and the janitor's
# queued window are already sized for. More waiting cards are picked up by the
# next run.
RELEASE_BATCH = 200
# The daily sweep does not put its whole plan on the queue at once: it shares
# process_link_background's 10 instances with every live save, and a 3,000-card
# release was ~2.5 hours of worker time during which share-sheet saves sat
# invisible behind it and web placeholders were failed by the janitor. The
# plan (which cards, decided once a day) is written as slices of this many
# cards; the daily run releases the first, the 5-minute janitor tick one more
# each (release_next_slice). 3,000 cards drain in about five hours.
RELEASE_SLICE = 50
SLICE_COLLECTION = "waiting_release_slices"
# How many waiting cards one workspace's release reads before sorting. Far
# above any real backlog; it only bounds a pathological one.
_SCAN_PER_USER = 5000
# The daily run's ceilings: cards scanned across every workspace, and cards
# enqueued in total. A run that hits either finishes the rest the next day.
_SCAN_ALL = 20000
_RUN_CAP = 3000

# Text a snapshot keeps. The scraper already caps an article at 25,000 chars;
# this only bounds a pathological platform scrape below Firestore's 1 MiB doc.
_MAX_SNAPSHOT_TEXT = 150_000
# The scrape fields analysis reads (main._analyze_scraped, _prompt_content,
# _capture_quality, _scrape_extras, _apply_post_thumbnail). `html` is left out
# on purpose: every scraper sets `text`, which the prompt prefers, and raw HTML
# is the one field that can blow the doc size.
_SNAPSHOT_KEYS = (
    "title", "text", "truncated", "capture_reason", "text_truncated", "source_name",
    "final_url", "source_url", "content_type", "youtube_metadata", "image_urls",
    "image_primary", "image_text_likely", "video_thumbnail_url",
)
# The share fields a release job carries over from capture time.
_JOB_KEYS = ("body", "userNoteText", "noteKind", "source")


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def is_waiting(card: Optional[dict]) -> bool:
    return isinstance(card, dict) and card.get("status") == WAITING


def waiting_message(upgrade: bool) -> str:
    """What a waiting save tells the user (share-sheet clients show it as is;
    no em dashes, the client renders it verbatim). `upgrade` is False on Pro,
    whose cap is an abuse ceiling with nothing to upgrade to."""
    if upgrade:
        return "Saved. Machina will read it next month, or now with Pro."
    return "Saved. Machina will read it next month."


def is_pending_note(card: Optional[dict]) -> bool:
    return isinstance(card, dict) and card.get(NOTE_PENDING) is True


def note_pending_fields(now_ms: Optional[int] = None) -> dict:
    """Fields that mark a saved note's AI organization as waiting."""
    return {NOTE_PENDING: True, NOTE_WAITING_AT: now_ms or _now_ms()}


def snapshot_ref(db, uid: str, card_id: str):
    return db.collection("users").document(uid).collection(SNAPSHOT_COLLECTION).document(card_id)


# ── Writing a waiting card ───────────────────────────────────────────────────

def waiting_update(now_ms: Optional[int] = None) -> dict:
    """Fields that turn an existing placeholder card into a waiting one. The
    processing clocks go, so neither the janitor nor Card.tsx ages it."""
    return {
        "status": WAITING,
        "waitingAt": now_ms or _now_ms(),
        "processingStartedAt": firestore.DELETE_FIELD,
        "processingStage": firestore.DELETE_FIELD,
        "queuedAt": firestore.DELETE_FIELD,
        "pendingEnqueue": firestore.DELETE_FIELD,
        "error": firestore.DELETE_FIELD,
        "failedAt": firestore.DELETE_FIELD,
    }


def new_waiting_card(*, url: str, title: str, source_type: str = "web",
                     image_urls: Optional[list] = None, mime_type: Optional[str] = None,
                     now_ms: Optional[int] = None) -> dict:
    """A fresh waiting card, for capture paths where the server writes the
    card (the share sheet, a single image). Same shape as the processing
    placeholder process_link_background writes, minus the processing clock."""
    now = now_ms or _now_ms()
    card = {
        "url": url,
        "title": title,
        "summary": "",
        "tags": [],
        "category": "",
        "status": WAITING,
        "sourceType": source_type,
        "isRead": False,
        "createdAt": now,
        "waitingAt": now,
        "metadata": {"originalTitle": "", "estimatedReadTime": 0},
    }
    if source_type != "image":
        key = url_key(url)
        if key:
            card["urlKey"] = key
    if image_urls and len(image_urls) > 1:
        card["imageUrls"] = list(image_urls)
    if mime_type:
        card["mimeType"] = mime_type
    return card


def save_job_fields(db, uid: str, card_id: str, fields: dict) -> None:
    """Keep the share's own fields (what the user wrote, the quote flag) for
    the release job. Written at capture time, so the user's words never depend
    on the scrape job running."""
    job = {k: v for k, v in (fields or {}).items() if k in _JOB_KEYS and v not in (None, "")}
    snapshot_ref(db, uid, card_id).set(
        {"uid": uid, "cardId": card_id, "job": job, "savedAt": _now_ms()}, merge=True)


# ── The snapshot ─────────────────────────────────────────────────────────────

def snapshot_from_scrape(scraped) -> Optional[dict]:
    """The JSON-safe part of a scrape worth keeping, or None when this scrape
    should not be snapshotted (a fetch failure, or a direct PDF/image file
    whose bytes stay on the live URL; see the module docstring)."""
    if not isinstance(scraped, dict) or scraped.get("fetch_error"):
        return None
    if scraped.get("document_bytes") or scraped.get("image_bytes"):
        return None
    snap = {}
    for key in _SNAPSHOT_KEYS:
        value = scraped.get(key)
        if value is None:
            continue
        if key == "text":
            value = str(value)[:_MAX_SNAPSHOT_TEXT]
        elif key == "image_urls":
            value = [u for u in value if isinstance(u, str)][:4] if isinstance(value, list) else []
        elif key == "youtube_metadata":
            value = {k: v for k, v in value.items()
                     if isinstance(v, (str, int, float, bool))} if isinstance(value, dict) else {}
        elif not isinstance(value, (str, int, float, bool)):
            continue
        snap[key] = value
    if not snap.get("text") and isinstance(scraped.get("html"), str):
        # A scraper that only filled `html` (none today): keep a bounded copy.
        snap["text"] = scraped["html"][:_MAX_SNAPSHOT_TEXT]
    return snap


def scrape_from_snapshot(snap: dict) -> dict:
    """Turn a stored snapshot back into the dict scrape_url returns."""
    scraped = {k: v for k, v in (snap or {}).items() if k in _SNAPSHOT_KEYS}
    scraped.setdefault("html", "")
    scraped.setdefault("title", "")
    scraped.setdefault("text", "")
    return scraped


def snapshot_payload(uid: str, card_id: str, scrape: dict, stored_image_urls=None) -> dict:
    """The fields the scrape-only job merges into the snapshot doc (the share's
    own `job` fields are already there). `storedImageUrls` are the post images
    copied into our Storage, deleted together with the snapshot."""
    data = {"uid": uid, "cardId": card_id, "scrape": scrape, "scrapedAt": _now_ms()}
    if stored_image_urls:
        data["storedImageUrls"] = list(stored_image_urls)
    return data


def load_snapshot(db, uid: str, card_id: str) -> Optional[dict]:
    """The snapshot doc for a card, or None. Never raises."""
    try:
        snap = snapshot_ref(db, uid, card_id).get()
        return (snap.to_dict() or {}) if snap.exists else None
    except Exception as e:
        logger.warning("Snapshot read failed (live scrape instead): %s", e)
        return None


def delete_snapshot(db, uid: str, card_id: str,
                    delete_blob: Optional[Callable[[str], None]] = None) -> None:
    """Remove a card's snapshot doc and the post images it copied. Called once
    the card has been analyzed (either way) and when the card is deleted.
    Best-effort: never raises."""
    if not uid or not card_id:
        return
    try:
        ref = snapshot_ref(db, uid, card_id)
        snap = ref.get()
        if not snap.exists:
            return
        data = snap.to_dict() or {}
        if delete_blob:
            for u in data.get("storedImageUrls") or []:
                if isinstance(u, str):
                    try:
                        delete_blob(u)
                    except Exception as e:
                        logger.warning("Snapshot image cleanup failed: %s", e)
        ref.delete()
    except Exception as e:
        logger.warning("Snapshot cleanup failed (ignored) for %s: %s", mask_uid(uid), e)


# ── Counting and releasing ───────────────────────────────────────────────────

def _links(db, uid: str):
    return db.collection("users").document(uid).collection("links")


def _waiting_query(db, uid: str):
    return _links(db, uid).where(filter=FieldFilter("status", "==", WAITING))


def _pending_notes_query(db, uid: str):
    return _links(db, uid).where(filter=FieldFilter(NOTE_PENDING, "==", True))


def _count(q) -> int:
    count = getattr(q, "count", None)
    if callable(count):
        result = count().get()
        return max(0, int(result[0][0].value))
    return len(list(q.limit(_SCAN_PER_USER).stream()))


def count_waiting(uid: str) -> int:
    """How many of `uid`'s saves are waiting to be read: waiting cards plus
    notes whose AI organization waits (the paywall's number). Aggregation
    queries (one read per 1000 matches); 0 on any error, since it feeds copy,
    never a gate."""
    if not uid:
        return 0
    try:
        db = get_db()
        return _count(_waiting_query(db, uid)) + _count(_pending_notes_query(db, uid))
    except Exception as e:
        logger.warning("Waiting count failed (ignored) for %s: %s", mask_uid(uid), e)
        return 0


def _age_key(card: dict) -> tuple:
    """Oldest first: when the save was kept past the allowance (a waiting
    card's `waitingAt`, a pending note's `noteEnrichWaitingAt`), else when it
    was created."""
    def ms(v):
        return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    t = ms(card.get("waitingAt"))
    if t is None:
        t = ms(card.get(NOTE_WAITING_AT))
    c = ms(card.get("createdAt"))
    return (t if t is not None else (c if c is not None else 0), c or 0)


def waiting_cards(db, uid: str) -> list:
    """`[(ref, card)]` for every waiting card and pending note of `uid`,
    oldest first. Sorted here rather than by the query, so no composite index
    is needed."""
    seen, out = set(), []
    for q in (_waiting_query(db, uid), _pending_notes_query(db, uid)):
        for d in q.limit(_SCAN_PER_USER).stream():
            if d.id not in seen:
                seen.add(d.id)
                out.append((d.reference, d.to_dict() or {}))
    out.sort(key=lambda rc: _age_key(rc[1]))
    return out


def _release_job(uid: str, card_id: str, card: dict, snapshot: Optional[dict]) -> Optional[dict]:
    """The pending_processing doc that analyzes a waiting card, or None when
    the card has nothing to analyze (no URL and no image)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    base = {
        "uid": uid,
        "cardId": card_id,
        "source": "deferred",
        "body": "",
        "createdAt": now_iso,
        "status": "queued",
        "attempts": 0,
        # A reminder in the share note was set at capture time, relative to
        # the save; never re-parse it weeks later.
        "reminderText": "",
        capture_charge.CHARGE_FIELD: capture_charge.token("saves"),
    }
    if card.get("sourceType") == "image":
        urls = [u for u in (card.get("imageUrls") or []) if isinstance(u, str) and u]
        if not urls and isinstance(card.get("url"), str) and card["url"]:
            urls = [card["url"]]
        if not urls:
            return None
        base.update({"url": urls[0], "isImage": True,
                     "mimeType": card.get("mimeType") or "image/jpeg"})
        if len(urls) > 1:
            base["imageUrls"] = urls
        return base
    url = card.get("url")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        return None
    base["url"] = url
    key = url_key(url)
    if key:
        base["urlKey"] = key
    job = (snapshot or {}).get("job") or {}
    if isinstance(job.get("body"), str):
        base["body"] = job["body"]
    if isinstance(job.get("userNoteText"), str) and job["userNoteText"]:
        base["userNoteText"] = job["userNoteText"]
    if job.get("noteKind") == "quote":
        base["noteKind"] = "quote"
    if isinstance((snapshot or {}).get("scrape"), dict):
        base["fromSnapshot"] = True
    return base


def _note_job(uid: str, card_id: str) -> dict:
    """The pending_processing doc that organizes a pending note (the worker's
    `noteEnrich` branch, main._enrich_pending_note)."""
    return {
        "uid": uid,
        "cardId": card_id,
        "noteEnrich": True,
        "source": "deferred",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "attempts": 0,
        capture_charge.CHARGE_FIELD: capture_charge.token("saves"),
    }


def _enqueue_one(db, uid: str, card_ref) -> str:
    """Flip one waiting card to queued (or take one note off pending) and
    write its job, atomically. Returns 'queued', 'gone' (no longer waiting:
    deleted, or another release got there first) or 'empty' (nothing to
    analyze)."""
    snap_ref = snapshot_ref(db, uid, card_ref.id)
    job_ref = db.collection("pending_processing").document()

    def _body(tx):
        snap = card_ref.get(transaction=tx)
        card = (snap.to_dict() or {}) if getattr(snap, "exists", False) else None
        if is_pending_note(card) and not is_waiting(card):
            # The note stays exactly as it is (a normal card); only the flag
            # moves, so a second release can never enqueue it twice.
            tx.update(card_ref, {
                NOTE_PENDING: firestore.DELETE_FIELD,
                NOTE_WAITING_AT: firestore.DELETE_FIELD,
                "noteEnrichQueuedAt": _now_ms(),
            })
            tx.set(job_ref, _note_job(uid, card_ref.id))
            return "queued"
        if not is_waiting(card):
            return "gone"
        s = snap_ref.get(transaction=tx)
        snapshot = (s.to_dict() or {}) if getattr(s, "exists", False) else None
        job = _release_job(uid, card_ref.id, card, snapshot)
        if job is None:
            return "empty"
        now = _now_ms()
        tx.update(card_ref, {
            "status": "processing",
            # QUEUED, like an imported card: the worker stamps
            # processingStartedAt when it picks the job up, and until then the
            # janitor and Card.tsx age it on the long queued clock.
            "queuedAt": now,
            "waitingAt": firestore.DELETE_FIELD,
            "processingStartedAt": firestore.DELETE_FIELD,
        })
        tx.set(job_ref, job)
        return "queued"
    return capture_charge.run_transaction(db, _body)


def _release_one(db, uid: str, plan: str, card_ref) -> str:
    """Charge one `saves` unit on `plan` and enqueue one waiting card (or
    pending note). Returns 'queued', 'quota' (the allowance refused; nothing
    charged), or why nothing was enqueued ('gone', 'empty', 'error'), in
    which case the unit is given back."""
    r = meter_quota(uid, "saves", plan=plan)
    if not r.get("ok"):
        return "quota"
    try:
        outcome = _enqueue_one(db, uid, card_ref)
    except Exception as e:
        logger.error("Waiting-card release failed for %s: %s", mask_uid(uid), e)
        outcome = "error"
    if outcome == "queued":
        return outcome
    # Charged but nothing was enqueued: give the unit back.
    refund_quota(uid, "saves")
    if outcome == "empty":
        # Nothing to analyze (a client-written waiting card with no URL):
        # leave it as an ordinary saved card instead of waiting forever.
        try:
            card_ref.update({"status": "unread", "waitingAt": firestore.DELETE_FIELD})
        except Exception:
            pass
    return outcome


def release_waiting(uid: str, plan: str, *, limit: int = RELEASE_BATCH, cards=None) -> dict:
    """Enqueue `uid`'s waiting cards for analysis, oldest first, charging one
    `saves` unit each on `plan`, until the allowance or `limit` runs out.

    Returns ``{released, waiting, stopped}`` where ``stopped`` is 'quota',
    'batch', or None (every waiting card was enqueued). Never raises."""
    report = {"released": 0, "waiting": 0, "stopped": None}
    if not uid:
        return report
    skipped = 0
    try:
        db = get_db()
        if cards is None:
            cards = waiting_cards(db, uid)
        report["waiting"] = len(cards)
        for card_ref, _card in cards:
            if report["released"] >= limit:
                report["stopped"] = "batch"
                break
            outcome = _release_one(db, uid, plan, card_ref)
            if outcome == "quota":
                report["stopped"] = "quota"
                break
            if outcome == "queued":
                report["released"] += 1
            else:
                skipped += 1
        report["waiting"] = max(0, report["waiting"] - report["released"] - skipped)
        if report["released"]:
            logger.info("Released %d waiting card(s) for %s (plan=%s, stopped=%s)",
                        report["released"], mask_uid(uid), plan, report["stopped"])
    except Exception as e:
        logger.warning("Waiting-card release aborted for %s: %s", mask_uid(uid), e)
    return report


def release_on_entitlement_write(uid: str, after: Optional[dict]) -> Optional[dict]:
    """The upgrade hook: called on every write to ``entitlements/{uid}``
    (main.release_waiting_on_upgrade). Every way a workspace becomes Pro writes
    that doc (the RevenueCat sync and webhook, the founder and trial grants, an
    owner's hand edit), so one trigger covers them all. Releases only while the
    doc's EFFECTIVE plan is Pro; for a Pro workspace with nothing waiting this
    costs one empty query. Returns the release report, or None when not Pro."""
    from entitlement import effective_plan  # lazy: entitlement imports this module
    if not uid or effective_plan(after) != "pro":
        return None
    return release_waiting(uid, "pro")


def in_end_of_month_window(now: Optional[datetime] = None) -> bool:
    """True in the last END_OF_MONTH_DAYS days of the UTC month (quota month
    keys are UTC), when the backlog may use the reserve too."""
    now = now or datetime.now(timezone.utc)
    days = calendar.monthrange(now.year, now.month)[1]
    return now.day > days - END_OF_MONTH_DAYS


def backlog_budget(uid: str, plan: str, now: Optional[datetime] = None) -> Optional[int]:
    """How many backlog saves the daily sweep may release for `uid` now, or
    None when saves are unmetered on `plan`.

    The month's allowance minus a reserve of BACKLOG_RESERVE_FRACTION kept for
    new saves, minus what is already used (new saves and backlog alike); in
    the end-of-month window the reserve is released. On a 100-save free plan:
    the backlog gets up to 50 from the 1st, fresh saves keep the other 50, and
    in the last 3 days whatever is still unused goes to the backlog."""
    limit = quota_limit("saves", plan)
    if limit <= 0:
        return None
    used = int(quota_usage(uid).get("saves", 0) or 0)
    if in_end_of_month_window(now):
        return max(0, limit - used)
    reserve = math.ceil(limit * BACKLOG_RESERVE_FRACTION)
    return max(0, limit - reserve - used)


def _slice_id(run_ms: int, seq: int) -> str:
    """Slice doc ids sort in release order: by run, then by position."""
    return f"{run_ms:013d}-{seq:04d}"


def _write_plan(db, entries: list, run_ms: int) -> int:
    """Replace any unreleased plan with `entries`, as slices of RELEASE_SLICE.
    A leftover slice from an earlier day is dropped, not merged: today's plan
    re-picks those cards if they are still eligible. Returns the slice count."""
    for doc in list(db.collection(SLICE_COLLECTION).stream()):
        doc.reference.delete()
    slices = 0
    for seq, start in enumerate(range(0, len(entries), RELEASE_SLICE)):
        db.collection(SLICE_COLLECTION).document(_slice_id(run_ms, seq)).set(
            {"runAt": run_ms, "seq": seq, "entries": entries[start:start + RELEASE_SLICE]})
        slices += 1
    return slices


def release_next_slice(db=None) -> dict:
    """Release the oldest planned slice (at most RELEASE_SLICE cards) through
    the transactional per-card release, then drop the slice. The daily run
    releases the first slice itself; the 5-minute janitor tick
    (main.sweep_stuck_processing) releases one more each time, so a backlog
    never takes all of the worker's instances from live saves.

    A card that is no longer waiting (released by an upgrade, deleted, its
    account gone) is skipped before anything is charged; a workspace whose
    allowance refuses a card keeps the rest of its slice waiting for the next
    day's plan. Re-running a slice that was cut short is harmless for the
    same reasons. Returns ``{released, gone, kept, slice}``; never raises."""
    report = {"released": 0, "gone": 0, "kept": 0, "slice": None}
    try:
        db = db or get_db()
        docs = list(db.collection(SLICE_COLLECTION).limit(1).stream())
        if not docs:
            return report
        slice_doc = docs[0]
        report["slice"] = slice_doc.id
        exhausted = set()
        for entry in (slice_doc.to_dict() or {}).get("entries") or []:
            uid = entry.get("uid") if isinstance(entry, dict) else None
            card_id = entry.get("cardId") if isinstance(entry, dict) else None
            if not isinstance(uid, str) or not uid or not isinstance(card_id, str) or not card_id:
                continue
            if uid in exhausted:
                report["kept"] += 1
                continue
            card_ref = _links(db, uid).document(card_id)
            try:
                snap = card_ref.get()
                card = (snap.to_dict() or {}) if getattr(snap, "exists", False) else None
            except Exception as e:
                logger.warning("Planned card unreadable (kept waiting) for %s: %s", mask_uid(uid), e)
                report["kept"] += 1
                continue
            if not (is_waiting(card) or is_pending_note(card)):
                report["gone"] += 1
                continue
            outcome = _release_one(db, uid, entry.get("plan") or "free", card_ref)
            if outcome == "queued":
                report["released"] += 1
            elif outcome == "quota":
                exhausted.add(uid)
                report["kept"] += 1
            elif outcome == "error":
                report["kept"] += 1
            else:
                report["gone"] += 1
        slice_doc.reference.delete()
    except Exception as e:
        logger.warning("Waiting-card slice release failed: %s", e)
    if report["released"]:
        logger.info("Waiting-card slice %s: %s", report["slice"], report)
    return report


def run_waiting_release(plan_for: Optional[Callable[[str], str]] = None,
                        now: Optional[datetime] = None) -> dict:
    """The scheduled sweep: every workspace's backlog (waiting cards and
    pending notes) is PLANNED oldest first, within ``backlog_budget``, and
    the first RELEASE_SLICE cards of the plan are enqueued now; the janitor
    tick releases the rest a slice at a time (release_next_slice). Which cards
    are eligible is still decided once a day, here.

    Two collection-group equality queries, grouped by workspace in Python:
    `status` (the COLLECTION_GROUP index the processing janitor already
    declares) and `noteEnrichPending` (its own fieldOverride in
    firestore.indexes.json). Workspaces are served oldest-backlog first, so a
    run that hits ``_RUN_CAP`` leaves the newest backlogs for the next day.
    Upgrade releases (release_on_entitlement_write) ignore the reserve."""
    if plan_for is None:
        from entitlement import plan_for  # lazy: entitlement imports this module
    report = {"workspaces": 0, "released": 0, "still_waiting": 0, "errors": 0,
              "planned": 0, "slices": 0}
    db = get_db()
    by_uid = {}
    seen = set()
    for field, value in (("status", WAITING), (NOTE_PENDING, True)):
        try:
            stream = (db.collection_group("links")
                      .where(filter=FieldFilter(field, "==", value))
                      .limit(_SCAN_ALL).stream())
            for doc in stream:
                try:
                    owner = doc.reference.parent.parent.id
                except Exception:
                    continue
                if not isinstance(owner, str) or not owner or (owner, doc.id) in seen:
                    continue
                seen.add((owner, doc.id))
                by_uid.setdefault(owner, []).append((doc.reference, doc.to_dict() or {}))
        except Exception as e:
            logger.error("Waiting-card sweep query failed (%s): %s", field, e)
            report["errors"] += 1
    if not by_uid:
        logger.info("Waiting-card sweep: %s", report)
        return report

    for cards in by_uid.values():
        cards.sort(key=lambda rc: _age_key(rc[1]))
    order = sorted(by_uid, key=lambda u: _age_key(by_uid[u][0][1]))
    entries = []
    total = 0
    for uid in order:
        cards = by_uid[uid]
        total += len(cards)
        room = _RUN_CAP - len(entries)
        if room <= 0:
            continue
        report["workspaces"] += 1
        try:
            plan = plan_for(uid)
        except Exception:
            plan = "free"
        try:
            budget = backlog_budget(uid, plan, now)
        except Exception as e:
            logger.warning("Backlog budget failed (skipped) for %s: %s", mask_uid(uid), e)
            budget = 0
        limit = min(RELEASE_BATCH, room) if budget is None else min(RELEASE_BATCH, room, budget)
        if limit <= 0:
            continue
        entries.extend({"uid": uid, "cardId": ref.id, "plan": plan} for ref, _card in cards[:limit])
    report["planned"] = len(entries)
    run_ms = int((now or datetime.now(timezone.utc)).timestamp() * 1000)
    try:
        report["slices"] = _write_plan(db, entries, run_ms)
    except Exception as e:
        logger.error("Waiting-card plan not written: %s", e)
        report["errors"] += 1
    first = release_next_slice(db) if report["slices"] else {"released": 0, "gone": 0}
    report["released"] = first["released"]
    report["still_waiting"] = max(0, total - first["released"] - first["gone"])
    logger.info("Waiting-card sweep: %s", report)
    return report
