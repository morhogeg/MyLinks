"""Background link processing (Firestore-triggered).

Scrapes the queued URL (or downloads the queued image), runs AI analysis, and
saves the final card. Triggered by creates on `pending_processing`.

`process_link_background` is re-exported from main.py so Firebase's entrypoint
scan still discovers it under the same deployed name.
"""

import os
import logging
import requests
from datetime import datetime, timezone

from firebase_functions import firestore_fn
from google.cloud.firestore_v1.vector import Vector

from db import get_db
from models import LinkStatus
from ai_service import GeminiService
from link_service import save_link_to_firestore, get_user_tags
from reminder_service import handle_reminder_intent, set_reminder
from graph_service import GraphService
from analysis_shared import _estimate_read_time, _analyze_scraped, _apply_youtube_metadata, _store_image

logger = logging.getLogger(__name__)


def log_to_firestore(task_id: str, message: str, level: str = "INFO", data: dict = None):
    """Log a heartbeat to Firestore for visibility."""
    try:
        db = get_db()
        log_entry = {
            "taskId": task_id,
            "message": message,
            "level": level,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data or {}
        }
        db.collection('task_logs').add(log_entry)
        logger.info(f"[{task_id}] {message}")
    except Exception as e:
        logger.error(f"Failed to log to Firestore: {e}")


def _capture_placeholder_title(url: str, is_image: bool) -> str:
    """A friendly, human-readable title for a still-processing capture card."""
    if is_image:
        return "Analyzing image…"
    try:
        from urllib.parse import urlparse
        host = (urlparse(url).netloc or "").replace("www.", "")
        return host or "Analyzing link…"
    except Exception:
        return "Analyzing link…"


@firestore_fn.on_document_created(
    document="pending_processing/{doc_id}",
    memory=1024,
    timeout_sec=300
)
def process_link_background(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """
    Background Task: Scrapes URL, runs AI analysis, and saves final link.
    """
    # Heavy/external deps imported lazily (see top-of-file note).
    from scraper import scrape_url
    from whatsapp_handler import send_whatsapp_message, format_success_message
    snapshot = event.data
    if not snapshot:
        logger.error("No snapshot in background trigger")
        return

    data = snapshot.to_dict()
    ref = snapshot.reference
    task_id = snapshot.id

    uid = data.get("uid")
    url = data.get("url")
    is_image = data.get("isImage", False)
    mime_type = data.get("mimeType", "image/jpeg")
    from_number = data.get("fromNumber")
    original_body = data.get("body")

    # Idempotency guard. Firestore triggers are at-least-once: the same
    # `pending_processing` create can be delivered more than once, and without a
    # guard each redelivery writes a second placeholder card and re-runs the
    # full scrape + Gemini analysis + embedding (duplicate cards, duplicate
    # spend). Atomically claim the task: only the first delivery — where status
    # is still "queued" and attempts are under the cap — flips it to
    # "processing" and proceeds; every later delivery sees a non-"queued" status
    # and bails.
    from google.cloud import firestore as _fs
    _MAX_ATTEMPTS = 3
    _db_claim = get_db()

    @_fs.transactional
    def _claim(txn):
        snap = ref.get(transaction=txn)
        if not snap.exists:
            return False
        d = snap.to_dict() or {}
        if d.get("status") != "queued":
            return False
        attempts = d.get("attempts", 0)
        if attempts >= _MAX_ATTEMPTS:
            return False
        txn.update(ref, {
            "status": "processing",
            "attempts": attempts + 1,
            "startedAt": datetime.now(timezone.utc).isoformat(),
        })
        return True

    try:
        claimed = _claim(_db_claim.transaction())
    except Exception as claim_err:
        # If the claim transaction itself errors, fail closed (skip) rather than
        # risk a duplicate run — the original delivery will have claimed it, or a
        # later redelivery will retry the claim.
        logger.error(f"process_link_background claim failed for {task_id}: {claim_err}", exc_info=True)
        return
    if not claimed:
        logger.warning("process_link_background: task %s already claimed/exhausted — skipping redelivery", task_id)
        return

    log_to_firestore(task_id, "Background processing started", data={"url": url, "uid": uid, "isImage": is_image})

    # The URL we were handed before any reassignment (the image path rewrites `url`
    # to the stored Storage URL below). Kept so a FAILED card records the original.
    original_url = url

    # M3 — durable capture lifecycle. Write a visible "processing" card into the
    # user's library the instant work begins, then update THIS SAME card to ready
    # (on success) or a retryable "failed" state (on error). A captured item is
    # therefore never invisible and never silently dropped, even if analysis fails.
    card_ref = get_db().collection('users').document(uid).collection('links').document()
    card_id = card_ref.id
    try:
        card_ref.set({
            "url": original_url,
            "title": _capture_placeholder_title(original_url, is_image),
            "summary": "",
            "tags": [],
            "category": "",
            "status": LinkStatus.PROCESSING.value,
            "sourceType": "image" if is_image else "web",
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "metadata": {"originalTitle": "", "estimatedReadTime": 0},
        })
        ref.update({"cardId": card_id})
    except Exception as placeholder_err:
        # Non-fatal: if we can't write the placeholder, fall back to the legacy
        # "create the real card at the end" behaviour so a save is never lost.
        logger.error(f"Failed to write processing placeholder card: {placeholder_err}", exc_info=True)
        card_ref = None

    analysis = {}
    scraped = {"html": "", "title": "", "text": ""}
    
    try:
        # 1. Scrape content (only once)
        log_to_firestore(task_id, f"Scraping content for: {url}")
        ref.update({"status": "scraping"})
        scraped_raw = scrape_url(url, original_body)
        
        # Ensure scraped is a dict
        if isinstance(scraped_raw, dict):
            scraped = scraped_raw
        else:
            logger.error(f"Scraper returned non-dict {type(scraped_raw)}: {scraped_raw}")
            scraped = {"html": str(scraped_raw), "title": "Scrape Failed", "text": str(scraped_raw)}

        # 2. Analyze with AI
        log_to_firestore(task_id, "Starting AI analysis", data={"scrapedTitle": scraped.get("title")})
        ref.update({"status": "analyzing", "scrapedTitle": scraped.get("title", "")})

        db = get_db()
        existing_tags = get_user_tags(uid)
        ai = GeminiService()

        if is_image:
            log_to_firestore(task_id, f"Downloading image bytes from: {url}")
            ref.update({"status": "downloading_image"})

            account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
            auth_token = os.environ.get("TWILIO_AUTH_TOKEN")

            img_response = requests.get(url, timeout=30, auth=(account_sid, auth_token))
            img_response.raise_for_status()
            image_bytes = img_response.content

            # Upload to Firebase Storage
            log_to_firestore(task_id, "Uploading image to Firebase Storage")
            public_url = _store_image(f"screenshots/{uid}/{task_id}.jpg", image_bytes, mime_type)

            url = public_url

            log_to_firestore(task_id, "Starting AI image analysis")
            ref.update({"status": "analyzing_image", "storageUrl": public_url})
            analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags)
        else:
            # Analyze with AI (YouTube → native video ingestion w/ fallback)
            analysis = _analyze_scraped(ai, scraped, existing_tags)

        # Final Defensive check for analysis
        if not isinstance(analysis, dict):
            logger.warning(f"Final analysis check failed. Type: {type(analysis)}")
            analysis = {}

        # 3. Generate Embedding & Find Connections
        embedding_text = f"{analysis.get('title', '')}\n{analysis.get('summary', '')}"
        embedding = ai.embed_text(embedding_text)

        graph_service = GraphService(get_db())
        related_links = graph_service.find_related_links(
            new_link_id="pending",
            title=analysis.get("title", ""),
            summary=analysis.get("summary", ""),
            embedding=embedding,
            new_concepts=analysis.get("concepts", []),
            uid=uid
        )

        # 4. Build link document
        final_title = analysis.get("title", scraped.get("title", "Untitled"))
        log_to_firestore(task_id, "Saving processed link to brain", data={"finalTitle": final_title})
        ref.update({"status": "saving"})

        # Determine source type
        is_youtube = scraped.get("content_type") == "youtube"
        yt_meta = scraped.get("youtube_metadata", {})

        # Compute read/watch time
        if is_youtube and analysis.get("videoDurationMinutes"):
            estimated_time = max(1, int(analysis["videoDurationMinutes"]))
        elif is_image:
            estimated_time = 1
        else:
            estimated_time = _estimate_read_time(scraped.get("text", ""))

        link_data = {
            "url": url,
            "title": final_title,
            "summary": analysis.get("summary", "No summary available"),
            "detailedSummary": analysis.get("detailedSummary"),
            "tags": analysis.get("tags", []),
            "concepts": analysis.get("concepts", []),
            "embedding_vector": Vector(embedding),
            "relatedLinks": related_links,
            "category": analysis.get("category", "General"),
            "sourceName": scraped.get("source_name") or analysis.get("sourceName") or ("Screenshot" if is_image else None),
            "sourceType": "youtube" if is_youtube else ("image" if is_image else "web"),
            "language": analysis.get("language", "en"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", "Image Upload" if is_image else ""),
                "estimatedReadTime": estimated_time,
                "actionableTakeaway": analysis.get("actionableTakeaway")
            }
        }

        # Add YouTube-specific metadata
        if is_youtube:
            _apply_youtube_metadata(link_data, yt_meta, analysis, estimated_time)

        # 5. Save to Firestore — flip the placeholder card to its ready state in
        # place (preserving its id) so it transitions processing → ready without
        # flicker. If the placeholder couldn't be created, fall back to a new doc.
        if card_ref is not None:
            card_ref.set(link_data)
            link_id = card_id
        else:
            link_id = save_link_to_firestore(uid, link_data)
        db.collection('users').document(uid).update({'lastSavedLinkId': link_id})

        # 6. Check for reminder intent
        reminder_time = handle_reminder_intent(original_body)
        if reminder_time:
            reply = original_body.strip().lower()
            profile = "spaced" if ("spaced" in reply or reply == "s") else "once"
            set_reminder(uid, link_id, reminder_time, profile=profile)

        # Notify via WhatsApp only when the item came from WhatsApp.
        # Share-sheet / connector items have no phone number and must not trigger a reply.
        if from_number:
            user_tz = None
            try:
                _udoc = db.collection('users').document(uid).get()
                user_tz = _udoc.to_dict().get('timezone') if _udoc.exists else None
            except Exception:
                pass
            msg = format_success_message(link_data, reminder_time, language=analysis.get("language", "en"), link_id=link_id, tz=user_tz)
            logger.info(f"Processing complete, sending message to {from_number}")
            send_whatsapp_message(from_number, msg)
        else:
            logger.info(f"Processing complete for {data.get('source', 'unknown')} item (no WhatsApp notification)")

        # Successful cleanup
        ref.delete()

    except Exception as e:
        logger.error(f"Background processing error: {e}", exc_info=True)

        # M3 — never drop a capture. Mark the visible card as a retryable FAILED
        # state carrying the original URL + a short error, rather than leaving a
        # confusing "Processing Failed"-tagged card or (worse) nothing at all. The
        # frontend renders this as a "couldn't analyze — retry" card.
        failed_data = {
            "url": original_url,
            "title": scraped.get("title") or _capture_placeholder_title(original_url, is_image),
            "summary": "",
            "tags": [],
            "category": "",
            "status": LinkStatus.FAILED.value,
            "sourceType": "image" if is_image else "web",
            "error": str(e)[:300],
            "failedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": 0
            }
        }
        try:
            if card_ref is not None:
                card_ref.set(failed_data)
            else:
                save_link_to_firestore(uid, failed_data)
        except Exception as write_err:
            logger.error(f"Failed to write FAILED card record: {write_err}", exc_info=True)

        # The retryable failed card now lives in the library; drop the queue doc so
        # no orphaned pending_processing record is left behind.
        try:
            ref.delete()
        except Exception:
            pass

        if from_number:
            send_whatsapp_message(from_number, f"⚠️ Saved: {url}\n\nNote: Detailed AI analysis encountered an issue ({str(e)[:50]}...).")
