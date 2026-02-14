"""
SecondBrain Cloud Functions — Entry Point
Handles WhatsApp webhook ingestion and AI processing.

All business logic is extracted into dedicated modules:
- scraper.py: URL content extraction
- ai_service.py: Gemini AI analysis & embeddings
- link_service.py: Firestore user/link operations
- reminder_service.py: Spaced repetition reminders
- whatsapp_handler.py: WhatsApp messaging via Twilio
- search.py: Semantic vector search
- graph_service.py: Knowledge graph / related links
- db.py: Shared Firestore client singleton
"""

import os
import re
import json
import logging
import requests
from datetime import datetime, timezone

# Firebase Functions framework
from firebase_functions import https_fn, scheduler_fn, firestore_fn, options
from firebase_admin import storage
from google.cloud.firestore_v1.vector import Vector

# Internal modules
from db import get_db
from models import WebhookPayload, LinkStatus, ReminderStatus
from ai_service import GeminiService
from scraper import scrape_url
from link_service import find_user_by_phone, save_link_to_firestore, get_user_tags, is_hebrew
from reminder_service import handle_reminder_intent, set_reminder, calculate_next_reminder, run_reminder_check
from whatsapp_handler import send_whatsapp_message, format_success_message
from graph_service import GraphService
from search import sync_link_embedding, search_links

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")


def _cors_headers() -> dict:
    """Return standard CORS headers."""
    return {'Access-Control-Allow-Origin': CORS_ORIGIN}


def _cors_preflight() -> https_fn.Response:
    """Handle CORS preflight OPTIONS request."""
    headers = {
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
    }
    return https_fn.Response('', status=204, headers=headers)


def _error_response(message: str, status: int = 400, headers: dict = None) -> https_fn.Response:
    """Standardized JSON error response."""
    return https_fn.Response(
        json.dumps({"success": False, "error": message}),
        status=status,
        headers=headers or _cors_headers(),
        mimetype='application/json'
    )


# ─────────────────────────────────────────────
# HTTP Endpoints
# ─────────────────────────────────────────────

@https_fn.on_request()
def ping(req: https_fn.Request) -> https_fn.Response:
    """Simple health check function."""
    return https_fn.Response("pong")


@https_fn.on_request()
def debug_status(req: https_fn.Request) -> https_fn.Response:
    """Debug endpoint to inspect system state."""
    try:
        db = get_db()

        pending = db.collection('pending_processing').order_by('createdAt', direction='DESCENDING').limit(5).get()
        pending_data = [{**d.to_dict(), "id": d.id} for d in pending]

        logs = db.collection('task_logs').order_by('timestamp', direction='DESCENDING').limit(10).get()
        logs_data = [d.to_dict() for d in logs]

        status = {
            "status": "online",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "environment": {
                "project": os.environ.get("GCLOUD_PROJECT"),
                "has_gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
                "has_twilio_sid": bool(os.environ.get("TWILIO_ACCOUNT_SID")),
            },
            "system_check": {
                "pending_tasks_count": len(pending_data),
            },
            "recent_pending_tasks": pending_data,
            "recent_logs": logs_data
        }

        def serialize_firestore(obj):
            if hasattr(obj, 'isoformat'):
                return obj.isoformat()
            if isinstance(obj, dict):
                return {k: serialize_firestore(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [serialize_firestore(i) for i in obj]
            return obj

        status = serialize_firestore(status)

        return https_fn.Response(
            json.dumps(status, indent=2),
            mimetype="application/json"
        )
    except Exception as e:
        return https_fn.Response(f"Debug failed: {str(e)}", status=500)


@https_fn.on_request()
def analyze_link(req: https_fn.Request) -> https_fn.Response:
    """
    HTTP endpoint for analyzing URLs immediately (Synchronous).
    Used by the frontend "Add Link" form.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight()

    headers = _cors_headers()

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        url = data.get('url')
        existing_tags = data.get('existingTags', [])

        if not url:
            return _error_response("URL is required", 400, headers)

        logger.info(f"Analyzing URL synchronously: {url}")

        # 1. Scrape content
        scraped = scrape_url(url)
        if not scraped.get("text") and not scraped.get("html"):
            return _error_response("Failed to scrape content", 500, headers)

        # 2. Analyze with AI
        ai = GeminiService()
        content_type = scraped.get("content_type")
        analysis = ai.analyze_text(scraped["text"] or scraped["html"], existing_tags=existing_tags, content_type=content_type)

        # 3. Generate Embedding & Find Connections
        embedding_text = f"{analysis.get('title', '')}\n{analysis.get('summary', '')}"
        embedding = ai.embed_text(embedding_text)

        uid = data.get('uid')
        related_links = []
        if uid:
            graph_service = GraphService(get_db())
            related_links = graph_service.find_related_links(
                new_link_id="preview",
                title=analysis.get("title", ""),
                summary=analysis.get("summary", ""),
                embedding=embedding,
                new_concepts=analysis.get("concepts", []),
                uid=uid
            )

        # 4. Construct Link Object
        link_data = {
            "url": url,
            "title": analysis.get("title", scraped.get("title", "Untitled")),
            "summary": analysis.get("summary", ""),
            "detailedSummary": analysis.get("detailedSummary", ""),
            "tags": analysis.get("tags", []),
            "category": analysis.get("category", "General"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": max(1, len(scraped.get("text", "")) // 1500),
                "actionableTakeaway": analysis.get("actionableTakeaway")
            },
            "concepts": analysis.get("concepts", []),
            "embedding_vector": embedding,
            "relatedLinks": related_links,
            "sourceType": "web",
            "sourceName": analysis.get("sourceName"),
            "confidence": 0.8,
            "keyEntities": []
        }

        return https_fn.Response(
            json.dumps({"success": True, "link": link_data}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        return _error_response(str(e), 500, headers)


@https_fn.on_request()
def analyze_image(req: https_fn.Request) -> https_fn.Response:
    """HTTP endpoint for analyzing Images immediately (Synchronous)."""
    if req.method == 'OPTIONS':
        return _cors_preflight()

    headers = _cors_headers()

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        image_url = data.get('imageUrl')
        existing_tags = data.get('existingTags', [])

        if not image_url:
            return _error_response("Image URL is required", 400, headers)

        logger.info(f"Analyzing Image: {image_url}")

        # 1. Download Image
        try:
            img_response = requests.get(image_url, timeout=20)
            img_response.raise_for_status()
            image_bytes = img_response.content
            mime_type = img_response.headers.get('Content-Type', 'image/jpeg')
        except Exception as e:
            return _error_response(f"Failed to download image: {str(e)}", 500, headers)

        # 2. Analyze with AI
        ai = GeminiService()
        analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags)


        # 3. Construct Link Object
        link_data = {
            "url": image_url,
            "title": analysis.get("title", "Image Analysis"),
            "summary": analysis.get("summary", ""),
            "detailedSummary": analysis.get("detailedSummary", ""),
            "tags": analysis.get("tags", []),
            "category": analysis.get("category", "General"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "metadata": {
                "originalTitle": "Image Upload",
                "estimatedReadTime": 1,
                "actionableTakeaway": analysis.get("actionableTakeaway")
            },
            "sourceType": "image",
            "sourceName": "Screenshot",
            "confidence": 0.9,
            "keyEntities": []
        }

        return https_fn.Response(
            json.dumps({"success": True, "link": link_data}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        logger.error(f"Image analysis failed: {e}")
        return _error_response(str(e), 500, headers)


# ─────────────────────────────────────────────
# WhatsApp Webhook
# ─────────────────────────────────────────────

@https_fn.on_request()
def whatsapp_webhook(request):
    """
    WhatsApp webhook endpoint.
    Respond-First Pattern: Saves to pending_processing and returns 200 immediately.
    """
    try:
        if request.content_type == 'application/x-www-form-urlencoded':
            data = request.form.to_dict()
        else:
            data = request.get_json()

        logger.info(f"Received webhook payload: {json.dumps(data)}")
        payload = WebhookPayload(**data)
    except Exception as e:
        logger.error(f"Payload parse error: {e}")
        return https_fn.Response(json.dumps({"error": f"Invalid payload: {str(e)}"}), status=400, mimetype="application/json")

    db = get_db()

    # Find user by phone number
    uid = find_user_by_phone(payload.from_number)

    # Normalize UID
    if uid and uid.startswith("whatsapp:"):
        uid = uid.replace("whatsapp:", "")

    # Detect language from incoming message
    user_msg_is_hebrew = is_hebrew(payload.body)

    if not uid:
        logger.warning(f"Unauthorized number: {payload.from_number}")
        msg = "❌ מצטערים, מספר הטלפון שלך לא מזוהה. אנא וודא שהוא תואם להגדרות." if user_msg_is_hebrew else "❌ Sorry, your phone number is not recognized. Please make sure it matches the number in your Second Brain settings."
        send_whatsapp_message(payload.from_number, msg)
        return https_fn.Response(json.dumps({"error": "User not found"}), status=403, mimetype="application/json")

    # Extract URL from message body
    url_match = re.search(r'https?://[^\s]+', payload.body)

    # 1. Image Support: Check if media is attached
    if payload.num_media > 0 and payload.media_url0:
        logger.info(f"Media detected: {payload.media_url0} (Type: {payload.media_content_type0})")

        process_ref = db.collection('pending_processing').document()
        process_ref.set({
            "uid": uid,
            "url": payload.media_url0,
            "mimeType": payload.media_content_type0,
            "fromNumber": payload.from_number,
            "body": payload.body,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": "queued",
            "isImage": True,
            "attempts": 0
        })
        return https_fn.Response(json.dumps({"success": True, "queued": True, "id": process_ref.id}), status=200, mimetype="application/json")

    if not url_match:
        # Handling conversational commands (Reminders)
        logger.info("No URL found, checking for commands")

        msg_lower = payload.body.lower().strip()
        if msg_lower == "reminder" or msg_lower == "תזכורת":
            is_he = (msg_lower == "תזכורת") or user_msg_is_hebrew
            if is_he:
                menu = "מתי להזכיר לך?\n1. מחר\n2. בעוד 3 ימים\n3. בעוד שבוע"
            else:
                menu = "When should I remind you?\n1. Tomorrow\n2. In 3 days\n3. In 1 week"
            send_whatsapp_message(payload.from_number, menu)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        reminder_time = handle_reminder_intent(payload.body)

        if reminder_time:
            user_doc = db.collection('users').document(uid).get()
            last_link_id = user_doc.to_dict().get('lastSavedLinkId')
            if last_link_id:
                link_doc = db.collection('users').document(uid).collection('links').document(last_link_id).get()
                if link_doc.exists:
                    profile = "spaced" if payload.body.strip() == "2" else "smart"
                    set_reminder(uid, last_link_id, reminder_time, profile=profile)

                    link_data = link_doc.to_dict()
                    title = link_data.get('title', 'Unknown Link')
                    category = link_data.get('category', 'General')

                    date_str = reminder_time.strftime('%d/%m %H:%M') if user_msg_is_hebrew else reminder_time.strftime('%b %d at %I:%M %p')

                    if user_msg_is_hebrew:
                        msg = f"⏰ *התזכורת נקבעה*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}"
                    else:
                        msg = f"⏰ *Reminder Set*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}"

                    send_whatsapp_message(payload.from_number, msg)
                    return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

            msg = "❌ לא נמצא לינק קודם. שלח לינק קודם!" if user_msg_is_hebrew else "❌ No previous link found. Send a link first!"
            send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"error": "No context"}), status=200, mimetype="application/json")

        msg = "אני יכול לשמור לינקים או לקבוע תזכורות. נסה לשלוח לינק!" if user_msg_is_hebrew else "I can save links or set reminders. Try sending a URL!"
        send_whatsapp_message(payload.from_number, msg)
        return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

    # URL FOUND -> Save to pending_processing for Background Processing
    url = url_match.group(0)
    logger.info(f"Queueing URL for processing: {url}")

    process_ref = db.collection('pending_processing').document()
    process_ref.set({
        "uid": uid,
        "url": url,
        "fromNumber": payload.from_number,
        "body": payload.body,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "attempts": 0
    })

    return https_fn.Response(json.dumps({"success": True, "queued": True, "id": process_ref.id}), status=200, mimetype="application/json")


# ─────────────────────────────────────────────
# Background Processing
# ─────────────────────────────────────────────

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


@firestore_fn.on_document_created(
    document="pending_processing/{doc_id}",
    memory=1024,
    timeout_sec=300
)
def process_link_background(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """
    Background Task: Scrapes URL, runs AI analysis, and saves final link.
    """
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

    log_to_firestore(task_id, "Background processing started", data={"url": url, "uid": uid, "isImage": is_image})
    ref.update({"status": "processing", "startedAt": datetime.now(timezone.utc).isoformat()})

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
            bucket = storage.bucket()
            blob_path = f"screenshots/{uid}/{task_id}.jpg"
            blob = bucket.blob(blob_path)
            blob.upload_from_string(image_bytes, content_type=mime_type)
            blob.make_public()
            public_url = blob.public_url

            url = public_url

            log_to_firestore(task_id, "Starting AI image analysis")
            ref.update({"status": "analyzing_image", "storageUrl": public_url})
            analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags)
        else:
            # Analyze with AI
            content_type = scraped.get("content_type")  # e.g. "youtube"
            analysis = ai.analyze_text(scraped.get("text") or scraped.get("html", ""), existing_tags=existing_tags, content_type=content_type)
        
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
        if is_youtube and yt_meta.get("duration_seconds"):
            estimated_time = max(1, yt_meta["duration_seconds"] // 60)
        elif is_image:
            estimated_time = 1
        else:
            estimated_time = max(1, len(scraped.get("text", "")) // 1500)

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
            "sourceName": analysis.get("sourceName") or ("Screenshot" if is_image else None),
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
            link_data["metadata"]["youtubeChannel"] = yt_meta.get("channel")
            link_data["metadata"]["durationDisplay"] = yt_meta.get("duration_display")
            link_data["metadata"]["durationSeconds"] = yt_meta.get("duration_seconds")
            link_data["metadata"]["viewCount"] = yt_meta.get("view_count")
            link_data["metadata"]["viewDisplay"] = yt_meta.get("view_display")
            link_data["metadata"]["hasTranscript"] = yt_meta.get("has_transcript")
            link_data["metadata"]["videoHighlights"] = analysis.get("videoHighlights", [])
            link_data["metadata"]["speakers"] = analysis.get("speakers", [])

        # 5. Save to Firestore
        link_id = save_link_to_firestore(uid, link_data)
        db.collection('users').document(uid).update({'lastSavedLinkId': link_id})

        # 6. Check for reminder intent
        reminder_time = handle_reminder_intent(original_body)
        if reminder_time:
            profile = "spaced" if "2" in original_body else "smart"
            set_reminder(uid, link_id, reminder_time, profile=profile)

        msg = format_success_message(link_data, reminder_time, language=analysis.get("language", "en"), link_id=link_id)

        logger.info(f"Processing complete, sending message to {from_number}")
        send_whatsapp_message(from_number, msg)

        # Successful cleanup
        ref.delete()

    except Exception as e:
        logger.error(f"Background processing error: {e}", exc_info=True)
        ref.update({"status": "failed", "error": str(e)})

        fallback_data = {
            "url": url,
            "title": scraped.get("title", url),
            "summary": f"Cloud processing error: {str(e)}",
            "tags": ["Processing Failed"],
            "category": "Uncategorized",
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": 0
            }
        }
        save_link_to_firestore(uid, fallback_data)
        send_whatsapp_message(from_number, f"⚠️ Saved: {url}\n\nNote: Detailed AI analysis encountered an issue ({str(e)[:50]}...).")


# ─────────────────────────────────────────────
# Scheduled Functions
# ─────────────────────────────────────────────

@scheduler_fn.on_schedule(schedule="every 2 minutes")
def check_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """Scheduled function that runs every 2 minutes to check for pending reminders."""
    run_reminder_check()


@https_fn.on_request()
def force_check_reminders(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for reminder check to debug without waiting for schedule."""
    try:
        report = run_reminder_check()
        return https_fn.Response(json.dumps(report, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual trigger failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)
