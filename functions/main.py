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
from ai_service import GeminiService, AnalysisError
from link_service import (
    find_user_by_phone, save_link_to_firestore, get_user_tags, is_hebrew,
    ensure_ingest_token, find_user_by_ingest_token, link_exists_for_url,
    pending_exists_for_url,
)
from reminder_service import handle_reminder_intent, set_reminder, calculate_next_reminder, run_reminder_check, format_local_time
from graph_service import GraphService
# NOTE: `scraper` (pulls youtube_transcript_api) and `whatsapp_handler` (pulls
# the Twilio SDK) are imported lazily inside the functions that use them. Both
# are heavy and irrelevant to the hot image-analysis path, so deferring them
# keeps cold starts lighter for functions like analyze_image.
from search import sync_link_embedding, search_links, perform_search_logic
from rate_limit import check_rate_limit, client_ip

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")

# Comma-separated allowlist of origins permitted to call these endpoints.
# Defaults to the app's own Firebase Hosting + firebaseapp.com origins when
# unset. Set CORS_ORIGIN to "*" only for local debugging — never in prod.
def _allowed_origins() -> list:
    raw = os.environ.get("CORS_ORIGIN", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [APP_URL, "https://secondbrain-app-94da2.firebaseapp.com"]


def _resolve_origin(req=None) -> str:
    """Pick the Access-Control-Allow-Origin value.

    Echoes the caller's Origin only if it's on the allowlist; otherwise falls
    back to the primary app origin. Never reflects an arbitrary/untrusted
    Origin (which would defeat the point of pinning CORS).
    """
    allowed = _allowed_origins()
    if "*" in allowed:
        return "*"
    origin = req.headers.get("Origin") if req is not None else None
    if origin and origin in allowed:
        return origin
    return allowed[0]


def _cors_headers(req=None) -> dict:
    """Return standard CORS headers, pinned to the allowlist."""
    return {
        'Access-Control-Allow-Origin': _resolve_origin(req),
        'Vary': 'Origin',
    }


def _cors_preflight(req=None) -> https_fn.Response:
    """Handle CORS preflight OPTIONS request."""
    headers = {
        'Access-Control-Allow-Origin': _resolve_origin(req),
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Token, X-Firebase-AppCheck',
        'Access-Control-Max-Age': '3600'
    }
    return https_fn.Response('', status=204, headers=headers)


def _error_response(message: str, status: int = 400, headers: dict = None) -> https_fn.Response:
    """Standardized JSON error response.

    Use this for *intentional* client-facing messages (e.g. validation errors).
    For unexpected exceptions use `_server_error`, which never echoes the raw
    exception to the caller.
    """
    return https_fn.Response(
        json.dumps({"success": False, "error": message}),
        status=status,
        headers=headers or _cors_headers(),
        mimetype='application/json'
    )


def _server_error(headers: dict = None, exc: Exception = None,
                  message: str = "Internal server error",
                  status: int = 500) -> https_fn.Response:
    """Log the full exception server-side; return a generic error to the client.

    Prevents leaking stack traces / internal error detail / infrastructure
    specifics to callers (OWASP A09; fail-safe error handling).
    """
    if exc is not None:
        logger.error("Unhandled error: %s", exc, exc_info=True)
    return _error_response(message, status, headers)


# Input size caps to reject abusive/oversized payloads before any paid work.
MAX_URL_LENGTH = 2048
MAX_QUESTION_LENGTH = 2000
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


# Per-bucket rate limits: (max_requests, window_seconds). The analyze / image /
# chat buckets are deliberately tight because each call spends money on Gemini.
_RATE_LIMITS = {
    "analyze": (30, 3600),
    "image": (30, 3600),
    "chat": (60, 3600),
    "article": (120, 3600),
    "share": (120, 3600),
    "whatsapp": (60, 60),
}


def _rate_limited(bucket: str, identity: str, headers: dict = None):
    """Return a 429 Response if `identity` exceeds the bucket's limit, else None."""
    limit, window = _RATE_LIMITS[bucket]
    if not check_rate_limit(f"{bucket}:{identity}", limit, window):
        logger.warning("Rate limit exceeded: %s:%s", bucket, identity)
        return _error_response("Too many requests. Please slow down.", 429, headers)
    return None


# App Check enforcement flag. When falsy, verification is attempted and logged
# but never blocks (soft rollout) — lets us confirm the web client is sending
# tokens before flipping APPCHECK_ENFORCE=true to start rejecting.
APPCHECK_ENFORCE = os.environ.get("APPCHECK_ENFORCE", "").lower() in ("1", "true", "yes")


def _require_app_check(req, headers: dict = None) -> bool:
    """Verify the Firebase App Check token (X-Firebase-AppCheck header).

    Returns True if the request should proceed. Attests that calls to the paid
    Gemini endpoints come from the real app rather than a script. In soft mode
    (APPCHECK_ENFORCE off) always allows but logs; in enforce mode rejects a
    missing/invalid token.
    """
    token = req.headers.get("X-Firebase-AppCheck")
    if not token:
        if APPCHECK_ENFORCE:
            logger.warning("App Check token missing — rejecting")
            return False
        logger.info("App Check token missing (soft mode — allowing)")
        return True
    try:
        from firebase_admin import app_check
        app_check.verify_token(token)
        return True
    except Exception as e:
        logger.warning("App Check verification failed: %s", e)
        return not APPCHECK_ENFORCE


def _estimate_read_time(text: str, words_per_minute: int = 200) -> int:
    """Estimate read time in minutes from word count.

    Counts words rather than characters so the estimate holds for non-Latin
    scripts (e.g. Hebrew), where the old `len(text) // 1500` heuristic was off.
    """
    if not text:
        return 1
    words = len(text.split())
    return max(1, round(words / words_per_minute))


def _analyze_scraped(ai, scraped: dict, existing_tags: list):
    """Run the right analysis for scraped content.

    For YouTube, use Gemini native video ingestion; if that fails (private /
    unlisted / over-quota / region-blocked), fall back to an honest
    metadata-only text analysis rather than fabricating a summary.
    """
    content_type = scraped.get("content_type")
    if content_type == "youtube":
        watch_url = scraped.get("youtube_metadata", {}).get("watch_url")
        if watch_url:
            try:
                return ai.analyze_youtube(watch_url, existing_tags=existing_tags)
            except AnalysisError as e:
                logger.warning(f"Native YouTube analysis failed, using metadata-only fallback: {e}")
        # Fallback: analyze the lightweight oEmbed metadata text honestly.
        return ai.analyze_text(scraped.get("text") or scraped.get("html", ""), existing_tags=existing_tags)

    return ai.analyze_text(scraped.get("text") or scraped.get("html", ""), existing_tags=existing_tags, content_type=content_type)


def _format_duration(minutes: int) -> str:
    """Render a watch-time label, e.g. 12 -> '12 min', 75 -> '1h 15m'."""
    if not minutes or minutes < 1:
        return ""
    if minutes < 60:
        return f"{minutes} min"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins:02d}m"


def _store_image(blob_path: str, image_bytes: bytes, mime_type: str) -> str:
    """Upload an image to Storage and return a public Firebase download URL.

    Uses a Firebase download token (firebaseStorageDownloadTokens) rather than
    blob.make_public(): make_public() sets a legacy object ACL, which raises on
    buckets with uniform bucket-level access enabled. The token URL is served
    publicly by Firebase regardless of ACL mode — the same format the web SDK's
    getDownloadURL() returns.
    """
    import uuid
    from urllib.parse import quote
    bucket = storage.bucket()
    blob = bucket.blob(blob_path)
    token = uuid.uuid4().hex
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(image_bytes, content_type=mime_type)
    encoded = quote(blob_path, safe="")
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded}?alt=media&token={token}"


def _apply_youtube_metadata(link_data: dict, yt_meta: dict, analysis: dict, minutes: int):
    """Attach video-shaped metadata (thumbnail, channel, highlights, speakers)
    to a link document so the frontend can render a proper video card."""
    meta = link_data["metadata"]
    meta["videoId"] = yt_meta.get("video_id")
    meta["watchUrl"] = yt_meta.get("watch_url")
    meta["thumbnailUrl"] = yt_meta.get("thumbnail_url")
    meta["youtubeChannel"] = analysis.get("sourceName") or yt_meta.get("channel")
    meta["durationDisplay"] = _format_duration(minutes)
    meta["videoHighlights"] = analysis.get("videoHighlights", [])
    meta["speakers"] = analysis.get("speakers", [])


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
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("analyze", client_ip(req), headers)
    if rl:
        return rl

    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        url = data.get('url')
        existing_tags = data.get('existingTags', [])

        if not url:
            return _error_response("URL is required", 400, headers)
        if len(url) > MAX_URL_LENGTH:
            return _error_response("URL is too long", 400, headers)

        logger.info(f"Analyzing URL synchronously: {url}")

        # 1. Scrape content (scraper imported lazily — see top-of-file note).
        from scraper import scrape_url
        scraped = scrape_url(url)
        if not scraped.get("text") and not scraped.get("html"):
            return _error_response("Failed to scrape content", 500, headers)

        # 2. Analyze with AI (YouTube → native video ingestion w/ fallback)
        ai = GeminiService()
        content_type = scraped.get("content_type")
        analysis = _analyze_scraped(ai, scraped, existing_tags)

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
        is_youtube = content_type == "youtube"
        yt_meta = scraped.get("youtube_metadata", {})

        if is_youtube and analysis.get("videoDurationMinutes"):
            estimated_time = max(1, int(analysis["videoDurationMinutes"]))
        else:
            estimated_time = _estimate_read_time(scraped.get("text", ""))

        link_data = {
            "url": url,
            "title": analysis.get("title", scraped.get("title", "Untitled")),
            "summary": analysis.get("summary", ""),
            "detailedSummary": analysis.get("detailedSummary", ""),
            "tags": analysis.get("tags", []),
            "category": analysis.get("category", "General"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "language": analysis.get("language", "en"),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": estimated_time,
                "actionableTakeaway": analysis.get("actionableTakeaway")
            },
            "concepts": analysis.get("concepts", []),
            "embedding_vector": embedding,
            "relatedLinks": related_links,
            "sourceType": "youtube" if is_youtube else "web",
            "sourceName": scraped.get("source_name") or analysis.get("sourceName"),
            "confidence": 0.8,
            "keyEntities": []
        }

        # Mirror the background pipeline's YouTube enrichment so web-added
        # videos get the same rich metadata (channel, thumbnail, highlights).
        if is_youtube:
            _apply_youtube_metadata(link_data, yt_meta, analysis, estimated_time)

        return https_fn.Response(
            json.dumps({"success": True, "link": link_data}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        return _server_error(headers, e)


# Words to ignore when keyword-matching a question against saved cards.
_ASK_STOPWORDS = {
    "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "and", "or",
    "is", "are", "was", "were", "be", "been", "this", "that", "these", "those",
    "what", "whats", "which", "who", "whom", "how", "why", "when", "where",
    "do", "does", "did", "done", "can", "could", "would", "should", "will",
    "i", "me", "my", "you", "your", "it", "its", "they", "them", "their",
    "about", "with", "from", "into", "as", "any", "some", "all", "have", "has",
}


def _keyword_fallback_cards(uid: str, question: str, exclude_ids: set, limit: int = 5) -> list:
    """Lexical retrieval to back up vector search.

    Vector search can miss a card whose text literally contains the query's
    keywords (ranking, or a card with no embedding yet). This scans the user's
    links for the question's keywords across title/summary/tags/source/category
    and returns the best matches not already retrieved — so an obvious title
    hit like "fact check" is never dropped.
    """
    tokens = {
        t for t in re.split(r"[^a-z0-9]+", question.lower())
        if len(t) >= 3 and t not in _ASK_STOPWORDS
    }
    if not tokens:
        return []

    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")

    scored = []
    for doc in links_ref.limit(300).stream():
        if doc.id in exclude_ids:
            continue
        data = doc.to_dict() or {}
        haystack = " ".join(str(x) for x in [
            data.get("title", ""), data.get("summary", ""),
            " ".join(data.get("tags", []) or []),
            data.get("sourceName", ""), data.get("category", ""),
        ]).lower()
        # Weight title hits higher so a keyword in the title wins.
        title_l = str(data.get("title", "")).lower()
        score = sum((2 if t in title_l else 0) + (1 if t in haystack else 0) for t in tokens)
        if score > 0:
            data.pop("embedding_vector", None)
            data["id"] = doc.id
            scored.append((score, data))

    scored.sort(key=lambda s: s[0], reverse=True)
    return [d for _, d in scored[:limit]]


@https_fn.on_request()
def ask_brain(req: https_fn.Request) -> https_fn.Response:
    """HTTP endpoint: conversational RAG over the user's saved links.

    "Ask Your Brain" — retrieves the most relevant saved cards via semantic
    search, then has Gemini answer the question grounded ONLY in those cards,
    returning the source ids it cited so the UI can link straight back to them.

    Body: { uid, question, history?: [{role, content}] }
    Returns: { success, answer, citedIds, sources: [{id, title, category, sourceName}] }
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("chat", client_ip(req), headers)
    if rl:
        return rl

    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        uid = data.get('uid')
        question = (data.get('question') or '').strip()
        history = data.get('history') or []
        # Opt-in token streaming (SSE). Only honored for POST so the JSON path is
        # 100% unchanged when not explicitly requested.
        want_stream = bool(data.get('stream')) and req.method == 'POST'

        if not uid:
            return _error_response("uid is required", 400, headers)
        if not question:
            return _error_response("question is required", 400, headers)
        if len(question) > MAX_QUESTION_LENGTH:
            return _error_response("question is too long", 400, headers)

        # 1. Retrieve the most relevant saved cards (reuses the vector search
        #    that already powers the search bar). Degrade gracefully: if
        #    retrieval fails, answer_from_context returns a friendly "nothing
        #    saved yet" reply rather than erroring the whole request.
        try:
            cards = perform_search_logic(uid, question, limit=8)
        except Exception as e:
            logger.error(f"ask_brain retrieval failed: {e}")
            cards = []

        # 1b. Hybrid retrieval: add lexical keyword matches vector search may
        #     have missed (e.g. a word literally in a card's title). Merge,
        #     keeping vector results first, then keyword hits, deduped.
        try:
            have = {c.get("id") for c in cards}
            cards = cards + _keyword_fallback_cards(uid, question, have, limit=5)
        except Exception as e:
            logger.error(f"ask_brain keyword fallback failed: {e}")

        # 2. Slim the cards to just what the model needs (bounded tokens/cost).
        slim = [{
            "id": c.get("id"),
            "title": c.get("title", "Untitled"),
            "summary": c.get("summary", ""),
            "category": c.get("category", "General"),
            "tags": c.get("tags", []),
            # Publisher/source so the model can answer questions that name it
            # (e.g. "the CNN fact-check") — it's not in the title/summary text.
            "sourceName": c.get("sourceName"),
            "url": c.get("url"),
        } for c in cards]

        # 3. Generate a grounded answer with citations.
        ai = GeminiService()

        # 3a. Opt-in streaming branch (SSE). Same retrieval/slimming as above —
        #     only generation + response shape differ. The non-streaming JSON
        #     path below is left completely untouched.
        if want_stream:
            by_id = {c.get("id"): c for c in cards}

            def _event_stream():
                try:
                    for kind, payload in ai.answer_from_context_stream(question, slim, history):
                        if kind == "token":
                            yield "data: " + json.dumps(
                                {"type": "token", "text": payload}
                            ) + "\n\n"
                        elif kind == "citedIds":
                            sources = [{
                                "id": cid,
                                "title": by_id[cid].get("title", "Untitled"),
                                "category": by_id[cid].get("category", "General"),
                                "sourceName": by_id[cid].get("sourceName"),
                                "url": by_id[cid].get("url"),
                            } for cid in payload if cid in by_id]
                            yield "data: " + json.dumps(
                                {"type": "sources", "sources": sources}
                            ) + "\n\n"
                    yield "data: " + json.dumps({"type": "done"}) + "\n\n"
                except Exception as stream_exc:
                    # Mirror _server_error: log full detail, emit a sanitized message.
                    logger.error("ask_brain stream error: %s", stream_exc, exc_info=True)
                    yield "data: " + json.dumps(
                        {"type": "error", "error": "Internal server error"}
                    ) + "\n\n"

            stream_headers = dict(headers)
            stream_headers["Cache-Control"] = "no-cache"
            return https_fn.Response(
                _event_stream(),
                status=200,
                headers=stream_headers,
                mimetype="text/event-stream",
            )

        result = ai.answer_from_context(question, slim, history)

        # 4. Return only the cited sources for the UI (clickable chips).
        cited_ids = result.get("citedIds", [])
        by_id = {c.get("id"): c for c in cards}
        sources = [{
            "id": cid,
            "title": by_id[cid].get("title", "Untitled"),
            "category": by_id[cid].get("category", "General"),
            "sourceName": by_id[cid].get("sourceName"),
            # url lets the UI brand each citation by platform (YouTube, X, …).
            "url": by_id[cid].get("url"),
        } for cid in cited_ids if cid in by_id]

        return https_fn.Response(
            json.dumps({
                "success": True,
                "answer": result.get("answer", ""),
                "citedIds": cited_ids,
                "sources": sources,
            }),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        return _server_error(headers, e)


@https_fn.on_request()
def get_article(req: https_fn.Request) -> https_fn.Response:
    """HTTP endpoint: extract a clean, readable version of an article for the
    in-app reading mode. Body: { url }. Returns { success, title, paragraphs }.

    Fetched on demand so it works for every saved link (including old ones)
    without a schema migration or backfill.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("article", client_ip(req), headers)
    if rl:
        return rl

    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)

    try:
        data = req.get_json()
        url = (data or {}).get('url')
        if not url:
            return _error_response("url is required", 400, headers)
        if len(url) > MAX_URL_LENGTH:
            return _error_response("URL is too long", 400, headers)

        from scraper import extract_readable_article
        article = extract_readable_article(url)

        if not article.get("paragraphs"):
            return _error_response(
                "Couldn't extract readable text from this page.", 422, headers
            )

        return https_fn.Response(
            json.dumps({"success": True, **article}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        return _server_error(headers, e)


@https_fn.on_request()
def analyze_image(req: https_fn.Request) -> https_fn.Response:
    """HTTP endpoint for analyzing Images immediately (Synchronous)."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("image", client_ip(req), headers)
    if rl:
        return rl

    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        image_url = data.get('imageUrl')
        image_b64 = data.get('imageBytes')
        existing_tags = data.get('existingTags', [])
        uid = data.get('uid')

        if not image_url and not image_b64:
            return _error_response("imageBytes or imageUrl is required", 400, headers)

        # 1. Obtain image bytes.
        # Preferred path: the client sends the (already compressed) bytes inline,
        # so we skip the slow upload→re-download round trip entirely.
        if image_b64:
            try:
                import base64
                image_bytes = base64.b64decode(image_b64)
                mime_type = data.get('mimeType', 'image/jpeg')
                logger.info(f"Analyzing inline image ({len(image_bytes)} bytes)")
            except Exception as e:
                logger.error("Invalid image bytes: %s", e)
                return _error_response("Invalid image bytes", 400, headers)
        else:
            if len(image_url) > MAX_URL_LENGTH:
                return _error_response("URL is too long", 400, headers)
            logger.info(f"Analyzing Image by URL: {image_url}")
            # SSRF guard: block private/internal/metadata targets before fetch.
            from scraper import validate_public_url, UnsafeURLError
            try:
                validate_public_url(image_url)
            except UnsafeURLError:
                return _error_response("Invalid image URL", 400, headers)
            try:
                img_response = requests.get(image_url, timeout=20)
                img_response.raise_for_status()
                image_bytes = img_response.content
                mime_type = img_response.headers.get('Content-Type', 'image/jpeg')
            except Exception as e:
                logger.error("Failed to download image: %s", e)
                return _error_response("Failed to download image", 502, headers)

        if len(image_bytes) > MAX_IMAGE_BYTES:
            return _error_response("Image is too large", 413, headers)

        # 2. Analyze with AI
        ai = GeminiService()
        analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags)

        # 2b. Persist the image via the admin SDK (bypasses storage.rules, which
        # denies client writes). This is how screenshots are stored elsewhere
        # (see process_link_background). The public URL becomes the link's url
        # so the card can display the image later.
        stored_url = image_url or ""
        if image_b64 and uid:
            try:
                import uuid
                stored_url = _store_image(f"screenshots/{uid}/{uuid.uuid4().hex}.jpg", image_bytes, mime_type)
                logger.info(f"Stored screenshot at {stored_url}")
            except Exception as e:
                # Non-fatal: analysis still succeeds, card just won't show the image.
                logger.error(f"Failed to store screenshot: {e}")

        # 3. Construct Link Object
        link_data = {
            "url": stored_url,
            "title": analysis.get("title", "Image Analysis"),
            "summary": analysis.get("summary", ""),
            "detailedSummary": analysis.get("detailedSummary", ""),
            "tags": analysis.get("tags", []),
            "category": analysis.get("category", "General"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "language": analysis.get("language", "en"),
            "metadata": {
                "originalTitle": "Image Upload",
                "estimatedReadTime": 1,
                "actionableTakeaway": analysis.get("actionableTakeaway")
            },
            "concepts": analysis.get("concepts", []),
            "sourceType": "image",
            "sourceName": analysis.get("sourceName") or "Screenshot",
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
# Share Ingestion (iOS Shortcut / share sheet)
# ─────────────────────────────────────────────

def _extract_url(*candidates: str) -> str:
    """Return the first http(s) URL found across the candidate strings."""
    for candidate in candidates:
        if not candidate:
            continue
        match = re.search(r'https?://[^\s]+', candidate)
        if match:
            return match.group(0)
    return ""


@https_fn.on_request()
def share_ingest(req: https_fn.Request) -> https_fn.Response:
    """
    HTTP endpoint for the iOS share Shortcut (and any share-sheet client).
    Authenticates with a per-user ingest token, then queues the shared URL
    into the existing background processing pipeline.

    Accepts JSON: { "url" | "text" | "shared": <string>, "token"?: <string> }
    Token may also be provided via the 'X-Ingest-Token' header.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("share", client_ip(req), headers)
    if rl:
        return rl

    try:
        data = req.get_json(silent=True) or {}

        token = req.headers.get('X-Ingest-Token') or data.get('token')
        if not token:
            return _error_response("Missing ingest token", 401, headers)

        uid = find_user_by_ingest_token(token)
        if not uid:
            return _error_response("Invalid ingest token", 403, headers)

        url = _extract_url(data.get('url'), data.get('text'), data.get('shared'))
        if not url:
            return _error_response("No URL found in shared content", 400, headers)

        # Dedup: skip if already saved or already queued for this user.
        if link_exists_for_url(uid, url) or pending_exists_for_url(uid, url):
            logger.info(f"Share ingest skipped (duplicate): {url}")
            return https_fn.Response(
                json.dumps({"success": True, "duplicate": True, "url": url}),
                status=200, headers=headers, mimetype='application/json'
            )

        db = get_db()
        process_ref = db.collection('pending_processing').document()
        process_ref.set({
            "uid": uid,
            "url": url,
            "source": "share",
            "body": data.get('note', ''),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": "queued",
            "attempts": 0
        })

        logger.info(f"Share ingest queued: {url} for user {uid}")
        return https_fn.Response(
            json.dumps({"success": True, "queued": True, "id": process_ref.id, "url": url}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        logger.error(f"Share ingest failed: {e}", exc_info=True)
        return _error_response("Internal server error", 500, headers)


@https_fn.on_call()
def get_share_config(req: https_fn.CallableRequest) -> dict:
    """
    Returns the share-ingest endpoint and the caller's personal ingest token
    (generating one on first use). Used by Settings to configure the Shortcut.
    """
    uid = req.auth.uid if req.auth else None
    if not uid and req.data:
        uid = req.data.get("uid") or req.data.get("test_uid")

    if not uid:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="User must be identified"
        )

    token = ensure_ingest_token(uid)
    return {
        "endpoint": f"{APP_URL}/api/share",
        "token": token
    }


# ─────────────────────────────────────────────
# WhatsApp Webhook
# ─────────────────────────────────────────────

def _verify_twilio_signature(request) -> bool:
    """Validate an inbound Twilio webhook via the X-Twilio-Signature header.

    Returns True if the signature is valid, OR if verification is not configured
    (no TWILIO_AUTH_TOKEN) so local/dev testing still works. Returns False only
    when a token IS configured and the signature is missing/invalid — which is
    how we reject spoofed webhooks (anyone could otherwise POST a victim's phone
    number and act as them).
    """
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not auth_token:
        logger.warning("TWILIO_AUTH_TOKEN not set — skipping webhook signature verification")
        return True

    from twilio.request_validator import RequestValidator
    validator = RequestValidator(auth_token)

    signature = request.headers.get("X-Twilio-Signature", "")
    # Twilio signs against the public HTTPS URL it posted to. Behind Cloud Run /
    # Hosting the internally-seen scheme can be http, so normalize to https.
    url = request.url
    if request.headers.get("X-Forwarded-Proto") == "https" and url.startswith("http://"):
        url = "https://" + url[len("http://"):]

    params = request.form.to_dict() if request.form else {}
    return validator.validate(url, params, signature)


@https_fn.on_request()
def whatsapp_webhook(request):
    """
    WhatsApp webhook endpoint.
    Respond-First Pattern: Saves to pending_processing and returns 200 immediately.
    """
    # whatsapp_handler pulls the Twilio SDK — imported lazily (see top-of-file note).
    from whatsapp_handler import send_whatsapp_message

    # Reject spoofed webhooks before doing any work (phone-number impersonation).
    if not _verify_twilio_signature(request):
        logger.warning("Rejected WhatsApp webhook: invalid/missing Twilio signature")
        return https_fn.Response(
            json.dumps({"error": "Forbidden"}), status=403, mimetype="application/json"
        )

    if check_rate_limit(f"whatsapp:{client_ip(request)}", *_RATE_LIMITS["whatsapp"]) is False:
        logger.warning("Rate limit exceeded: whatsapp:%s", client_ip(request))
        return https_fn.Response(
            json.dumps({"error": "Too many requests"}), status=429, mimetype="application/json"
        )

    try:
        if request.content_type == 'application/x-www-form-urlencoded':
            data = request.form.to_dict()
        else:
            data = request.get_json()

        logger.info(f"Received webhook payload: {json.dumps(data)}")
        payload = WebhookPayload(**data)
    except Exception as e:
        logger.error(f"Payload parse error: {e}")
        return https_fn.Response(json.dumps({"error": "Invalid payload"}), status=400, mimetype="application/json")

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

        # Digest controls over WhatsApp: pause / resume the curated digest.
        if msg_lower in ("stop digest", "pause digest", "digest off"):
            db.collection('users').document(uid).set(
                {"settings": {"digest_enabled": False}}, merge=True
            )
            msg = ("✅ Digest paused. Reply *START DIGEST* to turn it back on, "
                   "or manage it anytime in Settings.")
            if user_msg_is_hebrew:
                msg = "✅ הדייג'סט הושהה. השב/י *START DIGEST* כדי להפעיל מחדש."
            send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        if msg_lower in ("start digest", "resume digest", "digest on"):
            db.collection('users').document(uid).set(
                {"settings": {"digest_enabled": True}}, merge=True
            )
            msg = "✅ Digest resumed. You'll get your curated cards on schedule."
            if user_msg_is_hebrew:
                msg = "✅ הדייג'סט חזר לפעול. תקבל/י כרטיסים נבחרים לפי לוח הזמנים."
            send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        if msg_lower in ("digest", "digest now", "דייג'סט"):
            # On-demand digest. Since the request came over WhatsApp, always
            # reply over WhatsApp regardless of the user's configured channels.
            from digest_service import build_and_send_digest
            user_doc = db.collection('users').document(uid).get()
            user_data = user_doc.to_dict() or {}
            user_data["settings"] = {**user_data.get("settings", {}), "digest_channels": ["whatsapp"]}
            res = build_and_send_digest(uid, user_data, force=True)
            if not res.get("sent"):
                msg = ("📭 אין עדיין מה לאסוף — שמור/י כמה לינקים קודם!" if user_msg_is_hebrew
                       else "📭 Nothing to curate yet — save a few links first!")
                send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"success": True, **res}), status=200, mimetype="application/json")

        if msg_lower == "reminder" or msg_lower == "תזכורת":
            is_he = (msg_lower == "תזכורת") or user_msg_is_hebrew
            if is_he:
                menu = "מתי להזכיר לך?\nהשב/י עם מספר הימים — *1*, *2*, *3* או *7*\nאו *S* לחזרה מרווחת (spaced repetition)"
            else:
                menu = "When should I remind you?\nReply with the number of days — *1*, *2*, *3* or *7*\nOr *S* for spaced repetition"
            send_whatsapp_message(payload.from_number, menu)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        reminder_time = handle_reminder_intent(payload.body)

        if reminder_time:
            user_doc = db.collection('users').document(uid).get()
            last_link_id = user_doc.to_dict().get('lastSavedLinkId')
            if last_link_id:
                link_doc = db.collection('users').document(uid).collection('links').document(last_link_id).get()
                if link_doc.exists:
                    reply = payload.body.strip().lower()
                    is_spaced = reply in ("s", "spaced")
                    profile = "spaced" if is_spaced else "once"
                    set_reminder(uid, last_link_id, reminder_time, profile=profile)

                    link_data = link_doc.to_dict()
                    title = link_data.get('title', 'Unknown Link')
                    category = link_data.get('category', 'General')

                    user_tz = user_doc.to_dict().get('timezone')
                    date_str = format_local_time(reminder_time, user_tz, user_msg_is_hebrew)

                    if user_msg_is_hebrew:
                        extra = "\n🔁 חזרה מרווחת — אזכיר שוב בהמשך" if is_spaced else ""
                        change = "\n\n_טעית במספר? השב/י מספר אחר (1/2/3/7) או S לעדכון._"
                        msg = f"⏰ *התזכורת נקבעה*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}{extra}{change}"
                    else:
                        extra = "\n🔁 Spaced repetition — I'll keep nudging you" if is_spaced else ""
                        change = "\n\n_Wrong number? Reply a different one (1/2/3/7) or S to change it._"
                        msg = f"⏰ *Reminder Set*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}{extra}{change}"

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

        # 5. Save to Firestore
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
        if from_number:
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


# ─────────────────────────────────────────────
# Curated Digest (email + WhatsApp)
# ─────────────────────────────────────────────

@scheduler_fn.on_schedule(schedule="every 60 minutes")
def send_digests(event: scheduler_fn.ScheduledEvent) -> None:
    """Hourly: deliver curated digests to users whose schedule is due now."""
    from digest_service import run_digest_check
    run_digest_check()


@https_fn.on_request()
def force_send_digests(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for the digest sweep (debug, ignores nothing-due skips)."""
    from digest_service import run_digest_check
    try:
        report = run_digest_check()
        return https_fn.Response(json.dumps(report, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual digest trigger failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)


@https_fn.on_call()
def send_digest_now(req: https_fn.CallableRequest) -> dict:
    """
    Build and deliver a digest immediately, using the user's saved (or
    just-edited) preferences. Powers the "Send one now" / preview button in
    Settings. Optional req.data overrides: mode, topic, count, channels,
    frequency — so the UI can preview a config before saving it.
    """
    from digest_service import build_and_send_digest

    uid = req.auth.uid if req.auth else None
    if not uid and req.data:
        uid = req.data.get("uid") or req.data.get("test_uid")
    if not uid:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="User must be identified",
        )

    db = get_db()
    snap = db.collection("users").document(uid).get()
    if not snap.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND, message="User not found"
        )
    user_data = snap.to_dict() or {}

    # Allow the caller to preview an unsaved configuration.
    overrides = {}
    for key in ("digest_mode", "digest_topic", "digest_topics", "digest_count", "digest_channels", "digest_frequency"):
        short = key.replace("digest_", "")
        if req.data and short in req.data:
            overrides[key] = req.data[short]
    if req.data and req.data.get("email"):
        user_data["email"] = req.data["email"]
    if overrides:
        user_data.setdefault("settings", {})
        user_data["settings"] = {**user_data.get("settings", {}), **overrides}

    try:
        result = build_and_send_digest(uid, user_data, force=True)
        return result
    except Exception as e:
        logger.error(f"send_digest_now failed for {uid}: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))
