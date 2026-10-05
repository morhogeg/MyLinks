"""Saves past the plan's monthly allowance: kept now, analyzed later.

Capture is never gated (SOURCE_OF_TRUTH §7.1). When a save would cross the
workspace's monthly `saves` allowance, the save still succeeds: the card is
written (URL, title, the user's own text) with ``status: 'waiting'`` and no
quota unit is charged. Only the Gemini analysis waits. It runs later, through
the SAME background queue every other capture uses (a ``pending_processing``
job carrying the card's id and a charge token, picked up by
``process_link_background``), when one of these happens:

* **Upgrade.** The entitlement turns Pro (``entitlement.sync_from_revenuecat``,
  the RevenueCat sync and webhook; ``entitlement_http`` catches any other grant
  path the next time the app opens). Waiting cards are enqueued oldest first.
* **The monthly reset.** ``run_waiting_release`` (scheduled daily, see main.py)
  enqueues each workspace's waiting cards oldest first, inside the CURRENT
  month's remaining allowance. On the 1st that is the fresh allowance; on any
  other day it is usually zero, so the run is a no-op for that workspace. Daily
  rather than monthly so a failed run heals itself the next day and a unit
  refunded mid-month (a failed analysis) is not left unused.

Every release CHARGES one `saves` unit before enqueuing, so the backlog counts
toward the allowance: a free user's waiting cards eat into the month they are
read in, and a Pro user's backlog counts toward the 1000/month abuse ceiling
(otherwise "save 10,000 links on the free plan, then subscribe" would buy
unbounded analysis for one month's price). Cards that do not fit keep waiting.
A single call enqueues at most ``RELEASE_BATCH`` cards, the same burst size a
bulk import already puts on the queue.

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

import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

import capture_charge
from db import get_db
from log_safe import mask_uid
from quota import meter as meter_quota, refund_quota
from url_key import url_key

logger = logging.getLogger(__name__)

WAITING = "waiting"
SNAPSHOT_COLLECTION = "capture_snapshots"

# Most cards one release call enqueues: the same burst MAX_IMPORT_LINKS puts on
# the queue, which process_link_background (max_instances) and the janitor's
# queued window are already sized for. More waiting cards are picked up by the
# next run.
RELEASE_BATCH = 200
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
        return "Saved. Machina will read it on the 1st, or now with Pro."
    return "Saved. Machina will read it on the 1st."


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


def store_snapshot(db, uid: str, card_id: str, scrape: dict, stored_image_urls=None) -> None:
    data = {"uid": uid, "cardId": card_id, "scrape": scrape, "scrapedAt": _now_ms()}
    if stored_image_urls:
        data["storedImageUrls"] = list(stored_image_urls)
    snapshot_ref(db, uid, card_id).set(data, merge=True)


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

def _waiting_query(db, uid: str):
    return (db.collection("users").document(uid).collection("links")
            .where(filter=FieldFilter("status", "==", WAITING)))


def count_waiting(uid: str) -> int:
    """How many of `uid`'s cards are waiting to be read (the paywall's number).
    An aggregation query (one read per 1000 matches); 0 on any error, since it
    feeds copy, never a gate."""
    if not uid:
        return 0
    try:
        q = _waiting_query(get_db(), uid)
        count = getattr(q, "count", None)
        if callable(count):
            result = count().get()
            return max(0, int(result[0][0].value))
        return len(list(q.limit(_SCAN_PER_USER).stream()))
    except Exception as e:
        logger.warning("Waiting count failed (ignored) for %s: %s", mask_uid(uid), e)
        return 0


def _age_key(card: dict) -> tuple:
    def ms(v):
        return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    t = ms(card.get("waitingAt"))
    c = ms(card.get("createdAt"))
    return (t if t is not None else (c if c is not None else 0), c or 0)


def waiting_cards(db, uid: str) -> list:
    """`[(ref, card)]` for every waiting card of `uid`, oldest first. Sorted
    here rather than by the query, so no composite index is needed."""
    out = [(d.reference, d.to_dict() or {})
           for d in _waiting_query(db, uid).limit(_SCAN_PER_USER).stream()]
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


def _enqueue_one(db, uid: str, card_ref) -> str:
    """Flip one waiting card to queued and write its job, atomically.
    Returns 'queued', 'gone' (no longer waiting: deleted, or another release
    got there first) or 'empty' (nothing to analyze)."""
    snap_ref = snapshot_ref(db, uid, card_ref.id)
    job_ref = db.collection("pending_processing").document()

    def _body(tx):
        snap = card_ref.get(transaction=tx)
        card = (snap.to_dict() or {}) if getattr(snap, "exists", False) else None
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
            r = meter_quota(uid, "saves", plan=plan)
            if not r.get("ok"):
                report["stopped"] = "quota"
                break
            try:
                outcome = _enqueue_one(db, uid, card_ref)
            except Exception as e:
                logger.error("Waiting-card release failed for %s: %s", mask_uid(uid), e)
                outcome = "error"
            if outcome == "queued":
                report["released"] += 1
                continue
            # Charged but nothing was enqueued: give the unit back.
            refund_quota(uid, "saves")
            skipped += 1
            if outcome == "empty":
                # Nothing to analyze (a client-written waiting card with no URL):
                # leave it as an ordinary saved card instead of waiting forever.
                try:
                    card_ref.update({"status": "unread", "waitingAt": firestore.DELETE_FIELD})
                except Exception:
                    pass
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


def run_waiting_release(plan_for: Optional[Callable[[str], str]] = None) -> dict:
    """The scheduled sweep: every workspace with waiting cards gets them
    enqueued, oldest first, within this month's remaining allowance.

    One collection-group query on `status` (the COLLECTION_GROUP index the
    processing janitor already declares in firestore.indexes.json), grouped by
    workspace in Python. Workspaces are served oldest-backlog first, so a run
    that hits ``_RUN_CAP`` leaves the newest backlogs for the next day."""
    if plan_for is None:
        from entitlement import plan_for  # lazy: entitlement imports this module
    report = {"workspaces": 0, "released": 0, "still_waiting": 0, "errors": 0}
    db = get_db()
    by_uid = {}
    try:
        stream = (db.collection_group("links")
                  .where(filter=FieldFilter("status", "==", WAITING))
                  .limit(_SCAN_ALL).stream())
        for doc in stream:
            try:
                owner = doc.reference.parent.parent.id
            except Exception:
                continue
            if isinstance(owner, str) and owner:
                by_uid.setdefault(owner, []).append((doc.reference, doc.to_dict() or {}))
    except Exception as e:
        logger.error("Waiting-card sweep query failed: %s", e)
        report["errors"] += 1
        return report

    for cards in by_uid.values():
        cards.sort(key=lambda rc: _age_key(rc[1]))
    order = sorted(by_uid, key=lambda u: _age_key(by_uid[u][0][1]))
    for uid in order:
        cards = by_uid[uid]
        room = _RUN_CAP - report["released"]
        if room <= 0:
            report["still_waiting"] += len(cards)
            continue
        report["workspaces"] += 1
        try:
            plan = plan_for(uid)
        except Exception:
            plan = "free"
        r = release_waiting(uid, plan, limit=min(RELEASE_BATCH, room), cards=cards)
        report["released"] += r["released"]
        report["still_waiting"] += r["waiting"]
    logger.info("Waiting-card sweep: %s", report)
    return report
