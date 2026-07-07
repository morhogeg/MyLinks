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
import hmac
import html as _html
import logging
import requests
from typing import Optional
from datetime import datetime, timezone

# Firebase Functions framework
from firebase_functions import https_fn, scheduler_fn, firestore_fn, options
from firebase_admin import storage, auth as admin_auth
from google.cloud import firestore as gc_firestore
from google.cloud.firestore_v1.vector import Vector

# Internal modules
from db import get_db
from models import WebhookPayload, LinkStatus, ReminderStatus
from ai_service import GeminiService, AnalysisError
from link_service import (
    find_user_by_phone, save_link_to_firestore, get_user_tags, is_hebrew,
    ensure_ingest_token, find_user_by_ingest_token, link_exists_for_url,
    pending_exists_for_url, find_data_uid_by_auth_uid, delete_user_data,
    create_workspace,
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
# Defaults to the app's own Firebase Hosting + firebaseapp.com origins, plus the
# native iOS shell's WebView origins, when unset. Set CORS_ORIGIN to "*" only for
# local debugging — never in prod.
#
# The bundled iOS app (Capacitor) serves the WebView from `capacitor://localhost`
# (older builds / iOS configs may use `https://localhost` or `ionic://localhost`),
# so its cross-origin /api/* fetches send that as the Origin. Without these on the
# allowlist the CORS preflight is rejected and the WebView fails every call with a
# bare "Load failed". These are defense-in-depth only — the endpoints still enforce
# App Check + rate limits + POST-only.
def _allowed_origins() -> list:
    raw = os.environ.get("CORS_ORIGIN", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        APP_URL,
        "https://secondbrain-app-94da2.firebaseapp.com",
        "capacitor://localhost",
        "ionic://localhost",
        "https://localhost",
    ]


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
        'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Token, X-Firebase-AppCheck, Authorization',
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


def _mask_phone(value) -> str:
    """Redact a phone number for logging — keep only the last 4 digits.

    Inbound WhatsApp numbers are PII; never log them in the clear.
    """
    s = str(value or "")
    return f"***{s[-4:]}" if len(s) >= 4 else "***"


def _verify_bearer(req):
    """Verify the Firebase ID token from the Authorization: Bearer header.

    Returns the decoded token dict on success, or None if the header is missing
    or the token is invalid/expired. The caller derives the user identity from
    the returned token — never from the request body.
    """
    header = req.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    try:
        return admin_auth.verify_id_token(token)
    except Exception as e:
        logger.warning("ID token verification failed: %s", e)
        return None


def _authed_uid(req, headers: dict = None, body_uid: str = None):
    """Resolve the caller's DATA-doc uid, preferring a verified ID token.

    Returns (uid, None) on success or (None, error_response) to return directly.
    When REQUIRE_AUTH is ON, a valid token is mandatory (401) and it must map to
    a workspace (403); the client-supplied uid is ignored. When OFF (pre-cutover)
    a verified token still wins, but we fall back to the client-supplied uid so
    the current app keeps working. This kills the cross-tenant IDOR once enforced.
    """
    decoded = _verify_bearer(req)
    if decoded:
        uid = find_data_uid_by_auth_uid(decoded.get("uid"))
        if uid:
            return uid, None
        if REQUIRE_AUTH:
            return None, _error_response("No workspace linked to this account", 403, headers)
    elif REQUIRE_AUTH:
        return None, _error_response("Authentication required", 401, headers)

    # Soft mode (or verified-but-unlinked while not enforcing): trust the client.
    if body_uid:
        return body_uid, None
    return None, _error_response("Authentication required", 401, headers)


def _require_admin(req, headers: dict = None):
    """Gate internal/admin/debug endpoints behind a shared ADMIN_TOKEN.

    These endpoints expose internal task data or trigger backend spend / mass
    sends, so they must never be reachable anonymously. Fail closed: deny when
    ADMIN_TOKEN is unset (a prod misconfiguration must not open the door).
    Returns an error Response when unauthorized, or None to proceed. Responds
    404 so the endpoint's existence isn't confirmed to a probing caller.
    """
    expected = os.environ.get("ADMIN_TOKEN", "")
    provided = req.headers.get("X-Admin-Token", "")
    if not expected or not hmac.compare_digest(provided, expected):
        logger.warning("Blocked unauthorized admin endpoint access")
        return _error_response("Not found", 404, headers)
    return None


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
    "device_token": (30, 3600),
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

# Auth enforcement flag for the staged multi-user rollout. When OFF (default),
# the backend still accepts a client-supplied uid so the current app keeps
# working; a verified ID token is preferred when present. When ON, every data
# endpoint/callable REQUIRES a valid ID token and derives the workspace uid from
# it (client-supplied uids are rejected). Flip to true only after sign-in is
# confirmed working end-to-end. See NATIVE_AUTH_SETUP.md ("Cutover order").
REQUIRE_AUTH = os.environ.get("REQUIRE_AUTH", "").lower() in ("1", "true", "yes")


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


def _append_capture_note(detailed: str, language: str) -> str:
    """Append an honest note to detailedSummary when Facebook gave the scraper
    only a partial caption (a truncated ~200-char og:description) or nothing at
    all (a login wall). Either way the summary is incomplete for a reason the user
    can't see, so we say so and tell them how to get the full one. Rendered as a
    trailing blockquote, so it never violates the 'start with ## Key Points' rule."""
    he = (language or "").lower().startswith("he")
    if he:
        note = ("> ⚠️ **הערה:** פייסבוק לא סיפקה לאפליקציה את הטקסט המלא של הפוסט. "
                "לסיכום מלא, שמרו צילום מסך של הפוסט במקום את הקישור.")
    else:
        note = ("> ⚠️ **Note:** Facebook didn't provide this post's full text to the app. "
                "For a complete summary, save a screenshot of the post instead.")
    detailed = (detailed or "").rstrip()
    return f"{detailed}\n\n{note}" if detailed else note


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

    analysis = ai.analyze_text(scraped.get("text") or scraped.get("html", ""),
                               existing_tags=existing_tags, content_type=content_type)
    # When the scraper could only get a truncated preview (Facebook text posts),
    # tell the user plainly rather than presenting a thin summary as complete.
    if isinstance(analysis, dict) and scraped.get("truncated"):
        analysis["detailedSummary"] = _append_capture_note(
            analysis.get("detailedSummary"), analysis.get("language"))
    return analysis


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
    # Prefer the REAL channel from YouTube oEmbed over the AI's guess — the model
    # sometimes returns a thematic phrase ("It's a mindset") instead of the
    # creator's channel. Fall back to the AI value, then the generic default.
    _yt_channel = yt_meta.get("channel")
    _real_channel = _yt_channel if (_yt_channel and _yt_channel.strip().lower() != "youtube") else None
    meta["youtubeChannel"] = _real_channel or analysis.get("sourceName") or _yt_channel
    meta["durationDisplay"] = _format_duration(minutes)
    meta["videoHighlights"] = analysis.get("videoHighlights", [])
    meta["speakers"] = analysis.get("speakers", [])


def _card_source_name(c: dict):
    """Best byline for a card: the YouTube channel when present, else the stored
    publisher/source name. Mirrors the web card so Ask citations show the same
    identity (e.g. the channel name, not just 'YouTube')."""
    meta = c.get("metadata") or {}
    return meta.get("youtubeChannel") or c.get("sourceName")


@https_fn.on_request()
def backfill_youtube_channels(req: https_fn.Request) -> https_fn.Response:
    """One-off repair: set metadata.youtubeChannel (and sourceName) from YouTube
    oEmbed for existing YouTube cards that are missing a real channel — older
    saves stored the AI's guess or the generic 'YouTube'. Optional ?uid=… (or
    JSON {uid}) limits to one user; otherwise all users. Idempotent; re-runnable.
    """
    import re
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=headers)
    guard = _require_admin(req, headers)
    if guard:
        return guard
    try:
        uid = req.args.get("uid") or (req.get_json(silent=True) or {}).get("uid")
        db = get_db()
        user_refs = ([db.collection("users").document(uid)] if uid
                     else list(db.collection("users").list_documents()))
        yt_re = re.compile(
            r'(?:youtube\.com/(?:watch\?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})'
        )
        updated = skipped = failed = 0
        for uref in user_refs:
            for doc in uref.collection("links").stream():
                d = doc.to_dict() or {}
                m = yt_re.search(d.get("url") or "")
                if not m:
                    continue
                cur = ((d.get("metadata") or {}).get("youtubeChannel") or "").strip()
                if cur and cur.lower() != "youtube":
                    skipped += 1
                    continue
                try:
                    watch = f"https://www.youtube.com/watch?v={m.group(1)}"
                    r = requests.get(f"https://www.youtube.com/oembed?url={watch}&format=json", timeout=8)
                    channel = r.json().get("author_name") if r.ok else None
                except Exception:
                    channel = None
                if channel and channel.strip().lower() != "youtube":
                    doc.reference.update({"metadata.youtubeChannel": channel, "sourceName": channel})
                    updated += 1
                else:
                    failed += 1
        return https_fn.Response(
            json.dumps({"updated": updated, "skipped": skipped, "failed": failed}),
            status=200, headers=headers, mimetype="application/json",
        )
    except Exception as e:
        return _server_error(headers, e, "Backfill failed")


@https_fn.on_request()
def backfill_related_links(req: https_fn.Request) -> https_fn.Response:
    """One-off repair: compute link.relatedLinks (the "See also" graph, M9) for
    existing cards that predate graph_service, and backfill any missing
    embedding_vector so older cards can be found as neighbors too. Optional
    ?uid=… (or JSON {uid}) limits to one user; otherwise all users. ?force=1
    recomputes even where relatedLinks already exist. Idempotent; re-runnable.
    """
    headers = _cors_headers(req)
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=headers)
    guard = _require_admin(req, headers)
    if guard:
        return guard
    try:
        uid = req.args.get("uid") or (req.get_json(silent=True) or {}).get("uid")
        force = str(req.args.get("force") or "").lower() in ("1", "true", "yes")
        db = get_db()
        graph = GraphService(db)
        user_refs = ([db.collection("users").document(uid)] if uid
                     else list(db.collection("users").list_documents()))
        totals = {"users": 0, "embedded": 0, "updated": 0, "skipped": 0, "failed": 0}
        for uref in user_refs:
            res = graph.backfill_related_links(uref.id, force=force)
            for k in ("embedded", "updated", "skipped", "failed"):
                totals[k] += res.get(k, 0)
            totals["users"] += 1
        return https_fn.Response(
            json.dumps(totals), status=200, headers=headers, mimetype="application/json",
        )
    except Exception as e:
        return _server_error(headers, e, "Backfill related links failed")


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
    guard = _require_admin(req)
    if guard:
        return guard
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
        return _server_error(exc=e, message="Debug failed")


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

        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid).
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err

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
            # NB: no `embedding_vector` here on purpose. It used to be returned
            # and round-tripped through the client, which stored it as a plain
            # list — invisible to `find_nearest`. The `sync_link_embedding`
            # Firestore trigger now owns the embedding server-side (writes a real
            # Vector on create AND on the retry update). The `embedding` computed
            # above is still used locally for `find_related_links`.
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

        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid).
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err
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
            "sourceName": _card_source_name(c),
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
                                "sourceName": _card_source_name(by_id[cid]),
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
            "sourceName": _card_source_name(by_id[cid]),
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
        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid).
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err

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
            # SSRF guard: block private/internal/metadata targets before fetch,
            # and re-validate on every redirect hop via safe_get.
            from scraper import validate_public_url, UnsafeURLError, safe_get
            try:
                validate_public_url(image_url)
            except UnsafeURLError:
                return _error_response("Invalid image URL", 400, headers)
            try:
                img_response = safe_get(image_url, timeout=20)
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
        return _server_error(headers, e, "Image analysis failed")


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

        # Image share path: the native Share Extension can send a raw image
        # (base64) when the user shares a photo/screenshot rather than a link.
        # Store it, then queue an image job — the background pipeline already
        # knows how to analyse images (isImage=True), same as the WhatsApp flow.
        image_b64 = data.get('image') or data.get('imageBytes')
        if image_b64:
            try:
                import base64, uuid
                # Tolerate a "data:image/jpeg;base64,...." data-URI prefix.
                if ',' in image_b64 and image_b64.strip().startswith('data:'):
                    image_b64 = image_b64.split(',', 1)[1]
                image_bytes = base64.b64decode(image_b64)
            except Exception:
                return _error_response("Invalid image data", 400, headers)

            if not image_bytes:
                return _error_response("Empty image data", 400, headers)
            if len(image_bytes) > MAX_IMAGE_BYTES:
                return _error_response("Image is too large", 413, headers)

            mime_type = data.get('mimeType', 'image/jpeg')
            ext = 'png' if 'png' in mime_type else 'jpg'
            try:
                stored_url = _store_image(
                    f"screenshots/{uid}/{uuid.uuid4().hex}.{ext}", image_bytes, mime_type
                )
            except Exception as e:
                logger.error(f"Share image store failed: {e}", exc_info=True)
                return _server_error(headers, e)

            db = get_db()
            process_ref = db.collection('pending_processing').document()
            process_ref.set({
                "uid": uid,
                "url": stored_url,
                "isImage": True,
                "mimeType": mime_type,
                "source": "share",
                "body": data.get('note', ''),
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "status": "queued",
                "attempts": 0,
            })
            logger.info(f"Share ingest queued image for user {uid}")
            return https_fn.Response(
                json.dumps({"success": True, "queued": True, "id": process_ref.id, "image": True}),
                status=200, headers=headers, mimetype='application/json'
            )

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
    # Prefer the verified caller; fall back to the client uid only while
    # REQUIRE_AUTH is off (staged rollout).
    uid = find_data_uid_by_auth_uid(req.auth.uid) if req.auth else None
    if not uid and not REQUIRE_AUTH and req.data:
        uid = req.data.get("uid") or req.data.get("test_uid")
    if not uid:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="User must be identified",
        )

    token = ensure_ingest_token(uid)
    return {
        "endpoint": f"{APP_URL}/api/share",
        "token": token
    }


@https_fn.on_call()
def rebuild_connections(req: https_fn.CallableRequest) -> dict:
    """Recompute the knowledge graph for the CALLER's own library, one page at
    a time (the client loops until `done`). Backfills embeddings for old cards
    that predate the pipeline, then their `relatedLinks` — so the "See also"
    connections appear on cards saved before the graph existed. Scoped to the
    caller's workspace, so no admin token; safe to re-run (idempotent).

    Body: { phase: 'embed'|'relate', cursor?: str, force?: bool, uid?: str }.
    The `uid` fallback applies only pre-cutover (REQUIRE_AUTH off), matching
    get_share_config.
    """
    uid = find_data_uid_by_auth_uid(req.auth.uid) if req.auth else None
    if not uid and not REQUIRE_AUTH and req.data:
        uid = req.data.get("uid") or req.data.get("test_uid")
    if not uid:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="User must be identified",
        )

    phase = (req.data or {}).get("phase", "embed")
    if phase not in ("embed", "relate"):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="phase must be 'embed' or 'relate'",
        )
    cursor = (req.data or {}).get("cursor")
    force = bool((req.data or {}).get("force"))
    # 'relate' is heavier (vector search + LLM per card) → smaller page so a
    # single call stays well under the callable timeout.
    limit = 20 if phase == "embed" else 8

    graph = GraphService(get_db())
    return graph.backfill_batch(uid, phase, cursor=cursor, limit=limit, force=force)


def _claim_workspace_logic(auth_uid: str, email: str = None) -> dict:
    """Resolve (or set up) the data workspace for a verified account.

    Shared core for both the `claim_workspace` callable and the
    `claim_workspace_http` endpoint — identical behavior, only the transport /
    auth extraction differs. Runs with Admin privileges (bypasses Firestore
    rules), so it still works after the rules are locked. Resolution order:

    1. Already linked (`authUids array-contains` the caller) → return it.
    2. Legacy owner claim: link the single pre-auth unclaimed doc, gated by the
       OWNER_EMAIL allowlist when set (only the owner email may claim it).
    3. New-user path (REQUIRE_AUTH on only): create a fresh, empty workspace
       keyed by the Firebase Auth uid (see link_service.create_workspace) and
       return it with `created: True` so the client can show onboarding.

    With REQUIRE_AUTH off (pre-cutover live state) step 3 is skipped, so a
    non-owner account still gets `uid: None` (restricted screen) — the live
    app's behavior is unchanged until the flag flips.
    """
    existing = find_data_uid_by_auth_uid(auth_uid)
    if existing:
        return {"uid": existing, "created": False}

    owner_email = os.environ.get("OWNER_EMAIL", "")
    if not owner_email or email == owner_email:
        db = get_db()
        # Claim the first doc that has no authUids yet (bounded scan). In the
        # single-owner migration there is exactly one such doc.
        for doc in db.collection("users").limit(50).stream():
            d = doc.to_dict() or {}
            if not d.get("authUids"):
                update = {"authUids": [auth_uid]}
                if email:
                    update["email"] = email
                doc.reference.set(update, merge=True)
                logger.info("Claimed workspace for signed-in account")
                return {"uid": doc.id, "created": False}

    # Nothing to claim (non-owner, or the owner doc is already linked to a
    # different account) → self-serve sign-up. Flag-gated: only once the
    # auth cutover is live.
    if not REQUIRE_AUTH:
        return {"uid": None, "created": False}

    new_uid = create_workspace(auth_uid, email)
    return {"uid": new_uid, "created": True}


@https_fn.on_call()
def claim_workspace(req: https_fn.CallableRequest) -> dict:
    """Resolve (or set up) the data workspace for a signed-in account (callable).

    Web uses this callable. Native uses the `claim_workspace_http` HTTP twin
    instead — the Firebase callable transport's CORS preflight is rejected from
    the Capacitor `capacitor://localhost` WebView origin, so the request never
    reaches the function (same failure that moved get_share_config and /api/chat
    off the managed callable/Hosting paths). Both share `_claim_workspace_logic`.
    """
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="User must be signed in",
        )
    auth_uid = req.auth.uid
    email = req.auth.token.get("email") if getattr(req.auth, "token", None) else None
    return _claim_workspace_logic(auth_uid, email)


@https_fn.on_request()
def claim_workspace_http(req: https_fn.Request) -> https_fn.Response:
    """HTTP twin of the `claim_workspace` callable, for the native iOS shell.

    The Firebase callable transport issues a CORS preflight that the managed
    callable endpoint rejects from `capacitor://localhost`, so httpsCallable()
    silently fails inside the WKWebView (no execution logs, request never lands).
    This endpoint sets CORS from the same `_allowed_origins()` allowlist (which
    includes `capacitor://localhost`) and verifies the caller via the Firebase ID
    token in the Authorization: Bearer header — the exact pattern the other
    /api/* endpoints use — then runs the identical `_claim_workspace_logic`.

    Body: none required. Returns { uid: str|null, created: bool }.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    decoded = _verify_bearer(req)
    if not decoded:
        return _error_response("User must be signed in", 401, headers)

    try:
        auth_uid = decoded.get("uid")
        email = decoded.get("email")
        result = _claim_workspace_logic(auth_uid, email)
        return https_fn.Response(
            json.dumps(result),
            status=200, headers=headers, mimetype='application/json',
        )
    except Exception as e:
        return _server_error(headers, e, "Workspace claim failed")


class _DeleteAccountError(Exception):
    """Raised by _delete_account_logic when a deletion step fails.

    Carries a client-safe message so each transport (callable / HTTP) can map it
    to its own error shape without leaking internals.
    """


def _delete_account_logic(auth_uid: str) -> dict:
    """Permanently delete the account keyed by `auth_uid` and all its data.

    Shared core for the `delete_account` callable and the `delete_account_http`
    endpoint. Deletes the Firestore workspace, Storage objects, and Firebase Auth
    user. Idempotent-ish: a missing workspace is not an error (the Auth user is
    still removed) so a partially-completed deletion can be retried. Raises
    `_DeleteAccountError` with a client-safe message on a hard failure.
    """
    uid = find_data_uid_by_auth_uid(auth_uid)

    if uid:
        try:
            delete_user_data(uid)
        except Exception as e:
            logger.error("Failed to delete Firestore data for account: %s", e)
            raise _DeleteAccountError("Failed to delete account data")
        # Best-effort: remove the user's screenshots from Storage.
        try:
            bucket = storage.bucket()
            for blob in bucket.list_blobs(prefix=f"screenshots/{uid}/"):
                blob.delete()
        except Exception as e:
            logger.warning("Failed to delete storage objects for account: %s", e)

    # Delete the Firebase Auth user last so the login can't be reused.
    try:
        admin_auth.delete_user(auth_uid)
    except Exception as e:
        logger.error("Failed to delete auth user: %s", e)
        raise _DeleteAccountError("Failed to delete account")

    return {"success": True}


@https_fn.on_call()
def delete_account(req: https_fn.CallableRequest) -> dict:
    """Permanently delete the signed-in user's account and all their data.

    Required in-app by App Store guideline 5.1.1(v). Web uses this callable;
    native uses the `delete_account_http` twin (the callable transport's CORS
    preflight is rejected from `capacitor://localhost` — see claim_workspace).
    Both share `_delete_account_logic`.
    """
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="User must be signed in",
        )
    try:
        return _delete_account_logic(req.auth.uid)
    except _DeleteAccountError as e:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=str(e),
        )


@https_fn.on_request()
def delete_account_http(req: https_fn.Request) -> https_fn.Response:
    """HTTP twin of the `delete_account` callable, for the native iOS shell.

    Same rationale as claim_workspace_http: the callable transport's CORS
    preflight fails from `capacitor://localhost`. CORS comes from
    `_allowed_origins()`; the caller is verified via the Authorization: Bearer ID
    token. Runs the identical `_delete_account_logic`.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    decoded = _verify_bearer(req)
    if not decoded:
        return _error_response("User must be signed in", 401, headers)

    try:
        result = _delete_account_logic(decoded.get("uid"))
        return https_fn.Response(
            json.dumps(result),
            status=200, headers=headers, mimetype='application/json',
        )
    except _DeleteAccountError as e:
        return _error_response(str(e), 500, headers)
    except Exception as e:
        return _server_error(headers, e, "Account deletion failed")


# ─────────────────────────────────────────────
# Device tokens (iOS push notifications)
# ─────────────────────────────────────────────
#
# Plain HTTP endpoints (not callables) for the same reason as
# claim_workspace_http: the callable transport's CORS preflight is rejected
# from `capacitor://localhost`, so the native shell must use /api/* twins.
# These are the ONLY write path for `users/{uid}.fcmTokens` — the client never
# writes the field directly (see firestore.rules note).

# Bound how many device tokens a single workspace can accumulate. iOS rotates
# tokens occasionally and dead ones are pruned on send (push_service), so a
# small cap comfortably covers real devices while blocking unbounded growth.
MAX_DEVICE_TOKENS = 10

# FCM registration tokens are ~150-320 chars today; reject anything wildly off.
MAX_DEVICE_TOKEN_LENGTH = 512


def _device_token_request(req):
    """Shared validation for the register/unregister endpoints.

    Returns (uid, token, None) on success or (None, None, error_response).
    """
    headers = _cors_headers(req)

    rl = _rate_limited("device_token", client_ip(req), headers)
    if rl:
        return None, None, rl

    decoded = _verify_bearer(req)
    if not decoded:
        return None, None, _error_response("User must be signed in", 401, headers)
    uid = find_data_uid_by_auth_uid(decoded.get("uid"))
    if not uid:
        return None, None, _error_response("No workspace linked to this account", 403, headers)

    data = req.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token or len(token) > MAX_DEVICE_TOKEN_LENGTH:
        return None, None, _error_response("Missing or invalid token", 400, headers)

    return uid, token, None


@https_fn.on_request()
def register_device_token_http(req: https_fn.Request) -> https_fn.Response:
    """Register an FCM device token for the verified caller's workspace.

    Body: { "token": "<fcm registration token>" }. ArrayUnion dedupes, so
    re-registering the same token on every app launch is a cheap no-op.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    if req.method != 'POST':
        return _error_response("Method not allowed", 405, headers)

    uid, token, err = _device_token_request(req)
    if err:
        return err

    try:
        user_ref = get_db().collection("users").document(uid)
        user_ref.set({"fcmTokens": gc_firestore.ArrayUnion([token])}, merge=True)
        # Trim the oldest entries if a workspace somehow accumulates too many.
        tokens = (user_ref.get().to_dict() or {}).get("fcmTokens") or []
        if len(tokens) > MAX_DEVICE_TOKENS:
            user_ref.update({"fcmTokens": tokens[-MAX_DEVICE_TOKENS:]})
        return https_fn.Response(
            json.dumps({"success": True}),
            status=200, headers=headers, mimetype='application/json',
        )
    except Exception as e:
        return _server_error(headers, e, "Token registration failed")


@https_fn.on_request()
def unregister_device_token_http(req: https_fn.Request) -> https_fn.Response:
    """Remove an FCM device token (sign-out / permission revoked).

    Body: { "token": "<fcm registration token>" }. Removing a token that is
    not registered is a success (idempotent).
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    if req.method != 'POST':
        return _error_response("Method not allowed", 405, headers)

    uid, token, err = _device_token_request(req)
    if err:
        return err

    try:
        get_db().collection("users").document(uid).update(
            {"fcmTokens": gc_firestore.ArrayRemove([token])}
        )
    except Exception as e:
        # A missing user doc means there is nothing to remove — idempotent.
        logger.info("Device token unregister skipped: %s", e)
    return https_fn.Response(
        json.dumps({"success": True}),
        status=200, headers=headers, mimetype='application/json',
    )


# ─────────────────────────────────────────────
# Public share pages (server-rendered OG previews)
# ─────────────────────────────────────────────
#
# The web app is a static export, so a client-rendered /s?id=… page can't give
# link-preview crawlers (WhatsApp, iMessage, Slack, X…) per-card OpenGraph tags —
# they don't run JS, so every shared link previewed as the generic app. These
# functions OWN the /s (single card) and /c (collection) routes via Hosting
# rewrites and return real HTML: correct og:title/description/image for crawlers,
# and a readable card for humans with no JS required.

def _esc(value) -> str:
    """HTML-escape a value for safe interpolation (handles None)."""
    return _html.escape(str(value), quote=True) if value is not None else ""


# Inline markdown patterns, applied AFTER the whole string is HTML-escaped.
# Order matters: bold (**/__) before italic (*/_) so we don't eat the inner stars.
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
_MD_BOLD_RE = re.compile(r"(?<!\*)\*\*(?!\s)(.+?)(?<!\s)\*\*(?!\*)|(?<!_)__(?!\s)(.+?)(?<!\s)__(?!_)")
# Note: no \w lookbehind on the * form, so emphasis works flush against
# letters in RTL scripts (e.g. Hebrew "ו*נטוי*"). Bold (**) runs first, and
# the (?<!\*)/(?!\*) guards keep us from eating bold's leftover stars. The _
# form keeps word-boundary guards to avoid mangling snake_case identifiers.
_MD_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)|(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])")
_MD_CODE_RE = re.compile(r"`([^`]+)`")


def _md_inline(text: str) -> str:
    """Render inline markdown for a SINGLE already-HTML-escaped line.

    Input MUST be pre-escaped (see _md_to_html). We only translate a fixed set
    of markdown markers into a fixed set of safe tags, so no untrusted text ever
    becomes markup. Links are restricted to http(s) and rel-hardened.
    """
    # Inline code first so markers inside backticks aren't reinterpreted.
    text = _MD_CODE_RE.sub(lambda m: f"<code>{m.group(1)}</code>", text)

    def _link(m):
        label, href = m.group(1), m.group(2)
        return f'<a href="{href}" rel="noopener nofollow" target="_blank">{label}</a>'

    text = _MD_LINK_RE.sub(_link, text)
    text = _MD_BOLD_RE.sub(lambda m: f"<strong>{m.group(1) or m.group(2)}</strong>", text)
    text = _MD_ITALIC_RE.sub(lambda m: f"<em>{m.group(1) or m.group(2)}</em>", text)
    return text


def _md_to_html(value) -> str:
    """Convert stored markdown to safe HTML for the public share pages.

    XSS-safe by construction: every character of the user/AI-authored text is
    HTML-escaped FIRST (via _esc, line-by-line), and only then do we apply a
    small, fixed grammar (headings, bullet/numbered lists, blockquotes, bold,
    italic, inline code, http(s) links, paragraphs, line breaks). The escaped
    text can never reopen a tag, so no markup injection is possible.
    """
    if not value:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    html_parts: list[str] = []
    list_stack: list[str] = []  # "ul" or "ol" currently open
    para: list[str] = []

    def _flush_para():
        if para:
            html_parts.append(f'<p dir="auto">{"<br>".join(para)}</p>')
            para.clear()

    def _close_lists():
        while list_stack:
            html_parts.append(f"</{list_stack.pop()}>")

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            _flush_para()
            _close_lists()
            continue

        # Headings: ## .. ###### (h1 reserved for the card title).
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            _flush_para()
            _close_lists()
            level = min(max(len(m.group(1)), 2), 4)  # clamp to h2–h4
            html_parts.append(
                f'<h{level} dir="auto">{_md_inline(_esc(m.group(2).strip()))}</h{level}>'
            )
            continue

        # Blockquote.
        m = re.match(r"^>\s?(.*)$", stripped)
        if m:
            _flush_para()
            _close_lists()
            html_parts.append(
                f'<blockquote dir="auto">{_md_inline(_esc(m.group(1).strip()))}</blockquote>'
            )
            continue

        # Unordered list item: - / * / • bullet.
        m = re.match(r"^[-*•]\s+(.*)$", stripped)
        if m:
            _flush_para()
            if list_stack[-1:] != ["ul"]:
                _close_lists()
                list_stack.append("ul")
                html_parts.append("<ul>")
            html_parts.append(
                f'<li dir="auto">{_md_inline(_esc(m.group(1).strip()))}</li>'
            )
            continue

        # Ordered list item: 1. / 1)
        m = re.match(r"^\d+[.)]\s+(.*)$", stripped)
        if m:
            _flush_para()
            if list_stack[-1:] != ["ol"]:
                _close_lists()
                list_stack.append("ol")
                html_parts.append("<ol>")
            html_parts.append(
                f'<li dir="auto">{_md_inline(_esc(m.group(1).strip()))}</li>'
            )
            continue

        # Plain text → accumulate into the current paragraph.
        _close_lists()
        para.append(_md_inline(_esc(stripped)))

    _flush_para()
    _close_lists()
    return "".join(html_parts)


def _share_card_image(card: dict) -> str:
    """Best preview image for a card; falls back to the Machina icon."""
    thumb = card.get("thumbnailUrl")
    if thumb and str(thumb).startswith("http"):
        return thumb
    url = card.get("url") or ""
    # Image/screenshot cards store the (public) image itself as the url.
    if card.get("sourceType") == "image" and url.startswith("http"):
        return url
    return f"{APP_URL}/icon-512.png"


def _share_html_shell(*, title: str, description: str, image: str, url: str, body: str) -> str:
    """Wrap rendered body in a full HTML doc with OpenGraph + Twitter cards."""
    t, d = _esc(title), _esc(description)
    img, u = _esc(image), _esc(url)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t} · Machina</title>
<meta name="description" content="{d}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Machina">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{img}">
<meta property="og:url" content="{u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{img}">
<link rel="icon" href="{_esc(APP_URL)}/icon-192.png">
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#070708; color:#ededed;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         line-height:1.6; }}
  .wrap {{ max-width:640px; margin:0 auto; padding:32px 20px 64px; }}
  .brand {{ display:flex; align-items:center; gap:10px; margin-bottom:28px; }}
  .brand img {{ width:32px; height:32px; border-radius:8px; }}
  .brand span {{ font-weight:600; letter-spacing:.2px; }}
  .badge {{ display:inline-block; font-size:12px; font-weight:700; letter-spacing:.6px;
           text-transform:uppercase; color:#c4b5fd; background:rgba(139,92,246,.14);
           padding:5px 10px; border-radius:999px; margin-bottom:16px; }}
  h1 {{ font-size:26px; line-height:1.25; margin:0 0 16px; }}
  .hero {{ width:100%; border-radius:14px; margin:8px 0 22px; display:block; }}
  .summary {{ font-size:17px; color:#d4d4d8; }}
  .detail {{ margin-top:16px; color:#a1a1aa; }}
  /* Rendered markdown blocks (summary / detailed / collection items). */
  .md > :first-child {{ margin-top:0; }}
  .md > :last-child {{ margin-bottom:0; }}
  .md p {{ margin:0 0 12px; }}
  .md h2 {{ font-size:20px; line-height:1.3; margin:22px 0 10px; }}
  .md h3 {{ font-size:17px; line-height:1.3; margin:18px 0 8px; }}
  .md h4 {{ font-size:15px; line-height:1.3; margin:16px 0 6px; color:#e4e4e7; }}
  .md ul, .md ol {{ margin:8px 0 14px; padding-inline-start:22px; }}
  .md li {{ margin:4px 0; }}
  .md strong {{ color:#fafafa; font-weight:700; }}
  .md em {{ font-style:italic; }}
  .md code {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9em;
             background:#161618; border:1px solid #262629; border-radius:6px; padding:1px 5px; }}
  .md blockquote {{ margin:12px 0; padding:4px 0 4px 14px; border-inline-start:3px solid #3a3a3f;
                   color:#a1a1aa; }}
  .md a {{ color:#c4b5fd; }}
  .tags {{ margin:22px 0 0; display:flex; flex-wrap:wrap; gap:8px; }}
  .tag {{ font-size:13px; color:#a1a1aa; background:#161618; border:1px solid #262629;
         padding:4px 10px; border-radius:999px; }}
  .actions {{ margin-top:32px; display:flex; flex-wrap:wrap; gap:12px; }}
  .btn {{ display:inline-block; padding:12px 20px; border-radius:12px; font-weight:600;
         text-decoration:none; font-size:15px; }}
  .btn-primary {{ background:linear-gradient(135deg,#8b5cf6,#d946ef); color:#fff; }}
  .btn-ghost {{ background:#161618; color:#ededed; border:1px solid #262629; }}
  .card {{ background:#0e0e10; border:1px solid #1c1c1f; border-radius:18px; padding:24px; }}
  .col-item {{ padding:18px 0; border-top:1px solid #1c1c1f; }}
  .col-item h3 {{ margin:0 0 6px; font-size:18px; }}
  .col-item p {{ margin:0; color:#a1a1aa; font-size:15px; }}
  .foot {{ margin-top:40px; font-size:13px; color:#71717a; text-align:center; }}
  a {{ color:#c4b5fd; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><img src="{_esc(APP_URL)}/icon-192.png" alt="Machina"><span>Machina</span></div>
    {body}
    <div class="foot">Saved on <a href="{_esc(APP_URL)}">Machina</a> — your AI knowledge base.</div>
  </div>
</body>
</html>"""


def _render_shared_card(card: dict, share_url: str) -> str:
    title = card.get("title") or "Shared card"
    summary = card.get("summary") or ""
    detailed = card.get("detailedSummary") or ""
    source = card.get("sourceName") or card.get("category") or ""
    image = _share_card_image(card)
    original = card.get("url") or ""
    tags = card.get("tags") or []

    has_real_image = image and not image.endswith("/icon-512.png")
    hero = f'<img class="hero" src="{_esc(image)}" alt="">' if has_real_image else ""
    badge = f'<div class="badge">{_esc(source)}</div>' if source else ""
    detail_html = f'<div class="detail md" dir="auto">{_md_to_html(detailed)}</div>' if detailed else ""
    tags_html = ""
    if tags:
        chips = "".join(f'<span class="tag">{_esc(t)}</span>' for t in tags[:8])
        tags_html = f'<div class="tags">{chips}</div>'

    # "View original" only for real external links (not stored screenshot images).
    original_btn = ""
    if original.startswith("http") and card.get("sourceType") != "image":
        original_btn = f'<a class="btn btn-ghost" href="{_esc(original)}" rel="noopener nofollow" target="_blank">View original</a>'

    body = f"""<div class="card">
      {badge}
      <h1 dir="auto">{_esc(title)}</h1>
      {hero}
      <div class="summary md" dir="auto">{_md_to_html(summary)}</div>
      {detail_html}
      {tags_html}
      <div class="actions">
        <a class="btn btn-primary" href="{_esc(APP_URL)}">Open in Machina</a>
        {original_btn}
      </div>
    </div>"""
    return _share_html_shell(
        title=title, description=summary or detailed or "Shared from Machina",
        image=image, url=share_url, body=body,
    )


def _render_shared_collection(data: dict, share_url: str) -> str:
    name = data.get("name") or "Shared collection"
    description = data.get("description") or ""
    cards = data.get("cards") or []
    image = _share_card_image(cards[0]) if cards else f"{APP_URL}/icon-512.png"

    items = "".join(
        f'<div class="col-item"><h3 dir="auto">{_esc(c.get("title"))}</h3>'
        f'<div class="md" dir="auto">{_md_to_html(c.get("summary"))}</div></div>'
        for c in cards[:50]
    )
    desc_html = f'<div class="summary md" dir="auto">{_md_to_html(description)}</div>' if description else ""
    count = len(cards)
    body = f"""<div class="card">
      <div class="badge">Collection · {count} card{'s' if count != 1 else ''}</div>
      <h1 dir="auto">{_esc(name)}</h1>
      {desc_html}
      {items}
      <div class="actions"><a class="btn btn-primary" href="{_esc(APP_URL)}">Open in Machina</a></div>
    </div>"""
    return _share_html_shell(
        title=name, description=description or f"A collection of {count} cards on Machina",
        image=image, url=share_url, body=body,
    )


def _share_not_found_html() -> str:
    body = """<div class="card">
      <h1>This page isn’t available</h1>
      <div class="summary">The shared card or collection may have been removed.</div>
      <div class="actions"><a class="btn btn-primary" href="%s">Open Machina</a></div>
    </div>""" % _esc(APP_URL)
    return _share_html_shell(
        title="Not available", description="This shared page may have been removed.",
        image=f"{APP_URL}/icon-512.png", url=APP_URL, body=body,
    )


# ─────────────────────────────────────────────
# Publishing public shares (Admin-SDK; keeps ownerUid out of world-readable docs)
# ─────────────────────────────────────────────
#
# The world-readable `shared_cards`/`shared_collections` docs must NOT carry
# `ownerUid` — for the phone-keyed owner workspace that value is a phone number
# (PII), and any client could `getDoc` a share id and read it. Rules can't hide a
# field, so the fix is structural: publish via these Admin-SDK endpoints, which
# write the public snapshot WITHOUT `ownerUid` and keep the owner mapping in the
# functions-only `shared_owners/{shareId}` collection (rules deny all client
# access). The locked ruleset denies direct client writes to `shared_*`, so these
# endpoints (Admin SDK bypasses rules) are the only writers.

_SHARE_COLLECTIONS = {"card": "shared_cards", "collection": "shared_collections"}


def _share_owner_uid(db, share_id: str, public_coll: str) -> Optional[str]:
    """Resolve who owns a share id. Prefers the functions-only `shared_owners`
    mapping; falls back to a legacy public doc's `ownerUid` (pre-migration shares
    still carry it) so ownership checks keep working during the transition."""
    owner_snap = db.collection("shared_owners").document(share_id).get()
    if owner_snap.exists:
        return (owner_snap.to_dict() or {}).get("ownerUid")
    legacy = db.collection(public_coll).document(share_id).get()
    if legacy.exists:
        return (legacy.to_dict() or {}).get("ownerUid")
    return None


def _publish_share_logic(uid: str, share_type: str, share_id: str, payload: dict) -> dict:
    """Write a public share snapshot for `uid` WITHOUT `ownerUid`, plus the
    functions-only owner mapping. Rejects overwriting a share id owned by someone
    else (the server-side equivalent of the rules' anti-takeover guard)."""
    public_coll = _SHARE_COLLECTIONS.get(share_type)
    if not public_coll:
        raise ValueError("invalid share type")
    if not share_id or not isinstance(payload, dict):
        raise ValueError("shareId and payload are required")

    db = get_db()
    existing_owner = _share_owner_uid(db, share_id, public_coll)
    if existing_owner is not None and existing_owner != uid:
        raise PermissionError("This share id belongs to another account")

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    doc = {k: v for k, v in payload.items() if v is not None}
    doc.pop("ownerUid", None)  # never persist PII in the world-readable doc
    doc["shareId"] = share_id
    doc["publishedAt"] = now_ms

    db.collection(public_coll).document(share_id).set(doc)
    db.collection("shared_owners").document(share_id).set({
        "ownerUid": uid, "type": share_type, "publishedAt": now_ms,
    })
    return {"shareId": share_id}


def _unpublish_share_logic(uid: str, share_type: str, share_id: str) -> dict:
    """Delete a public share + its owner mapping, if `uid` owns it."""
    public_coll = _SHARE_COLLECTIONS.get(share_type)
    if not public_coll:
        raise ValueError("invalid share type")
    if not share_id:
        raise ValueError("shareId is required")

    db = get_db()
    owner = _share_owner_uid(db, share_id, public_coll)
    if owner is not None and owner != uid:
        raise PermissionError("This share id belongs to another account")

    db.collection(public_coll).document(share_id).delete()
    db.collection("shared_owners").document(share_id).delete()
    return {"success": True}


@https_fn.on_request()
def publish_share_http(req: https_fn.Request) -> https_fn.Response:
    """Publish (or re-publish) a card/collection as a public snapshot.

    HTTP (not callable) so the native WKWebView can reach it (callable CORS
    preflight fails from `capacitor://localhost` — see claim_workspace_http).
    Body: { type: 'card'|'collection', shareId: str, payload: object, uid?: str }.
    `payload` is the snapshot the client built (e.g. toSharedCard); the server
    strips any `ownerUid` and stamps shareId/publishedAt. Returns { shareId }."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    try:
        data = req.get_json(silent=True) or {}
    except Exception:
        data = {}
    uid, auth_err = _authed_uid(req, headers, data.get("uid"))
    if auth_err:
        return auth_err
    try:
        result = _publish_share_logic(
            uid, data.get("type"), data.get("shareId"), data.get("payload"),
        )
        return https_fn.Response(json.dumps(result), status=200, headers=headers, mimetype='application/json')
    except PermissionError as e:
        return _error_response(str(e), 403, headers)
    except ValueError as e:
        return _error_response(str(e), 400, headers)
    except Exception as e:
        return _server_error(headers, e, "Publish failed")


@https_fn.on_request()
def unpublish_share_http(req: https_fn.Request) -> https_fn.Response:
    """Stop sharing a card/collection (delete the public snapshot + owner map).
    Body: { type: 'card'|'collection', shareId: str, uid?: str }."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    try:
        data = req.get_json(silent=True) or {}
    except Exception:
        data = {}
    uid, auth_err = _authed_uid(req, headers, data.get("uid"))
    if auth_err:
        return auth_err
    try:
        result = _unpublish_share_logic(uid, data.get("type"), data.get("shareId"))
        return https_fn.Response(json.dumps(result), status=200, headers=headers, mimetype='application/json')
    except PermissionError as e:
        return _error_response(str(e), 403, headers)
    except ValueError as e:
        return _error_response(str(e), 400, headers)
    except Exception as e:
        return _server_error(headers, e, "Unpublish failed")


@https_fn.on_request()
def share_page(req: https_fn.Request) -> https_fn.Response:
    """Server-rendered public page for a shared card (/s) or collection (/c).

    Owns those routes via Hosting rewrites so link-preview crawlers get real
    per-item OpenGraph tags (the static export can't). Always returns HTML.
    """
    html_headers = {
        "Content-Type": "text/html; charset=utf-8",
        # Let CDNs/crawlers cache briefly; cards are immutable snapshots.
        "Cache-Control": "public, max-age=300, s-maxage=600",
    }
    try:
        share_id = (req.args.get("id") or "").strip()
        is_collection = "/c" in req.path
        share_url = f"{APP_URL}{'/c' if is_collection else '/s'}?id={share_id}"

        if not share_id:
            return https_fn.Response(_share_not_found_html(), status=404, headers=html_headers)

        db = get_db()
        collection = "shared_collections" if is_collection else "shared_cards"
        snap = db.collection(collection).document(share_id).get()
        if not snap.exists:
            return https_fn.Response(_share_not_found_html(), status=404, headers=html_headers)

        data = snap.to_dict() or {}
        if is_collection:
            html_out = _render_shared_collection(data, share_url)
        else:
            html_out = _render_shared_card(data.get("card", {}) or {}, share_url)
        return https_fn.Response(html_out, status=200, headers=html_headers)

    except Exception as e:
        logger.error(f"share_page failed: {e}", exc_info=True)
        return https_fn.Response(_share_not_found_html(), status=200, headers=html_headers)


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
        # Fail CLOSED in production: an unsigned webhook lets anyone POST a
        # victim's phone number and act as them. Only allow the unverified path
        # under the local Functions emulator, never on deployed Cloud Run.
        if os.environ.get("FUNCTIONS_EMULATOR", "").lower() in ("1", "true", "yes"):
            logger.warning("TWILIO_AUTH_TOKEN not set — skipping signature check (emulator only)")
            return True
        logger.error("TWILIO_AUTH_TOKEN not set in production — rejecting webhook")
        return False

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


def _seen_message_sid(sid: str) -> bool:
    """Idempotency guard for Twilio webhook retries.

    Twilio re-POSTs the same message (same MessageSid) ~15s later if it doesn't
    get a fast 200, so without a guard every retry re-runs the whole handler —
    duplicate sends and, for the `digest` command, a duplicate multi-second
    Gemini synthesis + spend. We record each MessageSid in `processed_messages`
    the first time we see it and treat any later sighting as a no-op.

    Returns True if this sid was already processed (caller should no-op), False
    if it's new (and now recorded). Fails OPEN (returns False) on any backend
    error so a transient Firestore issue degrades to "process it" rather than
    dropping the message.
    """
    if not sid:
        return False
    try:
        from google.api_core import exceptions as gcloud_exceptions
        db = get_db()
        doc_ref = db.collection('processed_messages').document(sid)
        # create() fails if the doc already exists → atomic first-writer-wins.
        try:
            doc_ref.create({"seenAt": datetime.now(timezone.utc).isoformat()})
            return False
        except gcloud_exceptions.AlreadyExists:
            # Doc already present → this is a Twilio retry of a message we've
            # already processed.
            return True
    except Exception as e:
        logger.error(f"MessageSid dedup check failed (failing open): {e}")
        return False


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

        # Do NOT log the raw payload — it carries the sender's phone number
        # (From) and full message body (PII). Log only routing metadata.
        logger.info(
            "Received webhook payload (sid=%s, num_media=%s, fields=%d)",
            (data or {}).get("MessageSid") or (data or {}).get("SmsMessageSid") or "?",
            (data or {}).get("NumMedia", "0"),
            len(data) if isinstance(data, dict) else 0,
        )
        payload = WebhookPayload(**data)
    except Exception as e:
        logger.error(f"Payload parse error: {e}")
        return https_fn.Response(json.dumps({"error": "Invalid payload"}), status=400, mimetype="application/json")

    # Idempotency: Twilio retries the same MessageSid (~15s) until it gets a
    # fast 200. Without this guard each retry re-runs everything — duplicate
    # sends and a duplicate synchronous Gemini digest synthesis. No-op on a sid
    # we've already handled and just ack 200 so Twilio stops retrying.
    if _seen_message_sid(payload.message_sid):
        logger.info("Duplicate WhatsApp webhook (MessageSid already processed) — no-op")
        return https_fn.Response(json.dumps({"success": True, "duplicate": True}), status=200, mimetype="application/json")

    db = get_db()

    # Find user by phone number
    uid = find_user_by_phone(payload.from_number)

    # Normalize UID
    if uid and uid.startswith("whatsapp:"):
        uid = uid.replace("whatsapp:", "")

    # Detect language from incoming message
    user_msg_is_hebrew = is_hebrew(payload.body)

    if not uid:
        logger.warning(f"Unauthorized number: {_mask_phone(payload.from_number)}")
        msg = "❌ מצטערים, מספר הטלפון שלך לא מזוהה. אנא וודא שהוא תואם להגדרות." if user_msg_is_hebrew else "❌ Sorry, your phone number is not recognized. Please make sure it matches the number in your Machina AI settings."
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

    # Dedup: skip if already saved or already queued for this user (mirrors the
    # share_ingest path). Prevents Twilio dupes / re-sent links from stacking.
    if link_exists_for_url(uid, url) or pending_exists_for_url(uid, url):
        logger.info(f"WhatsApp ingest skipped (duplicate): {url}")
        msg = ("✅ הלינק הזה כבר שמור אצלך." if user_msg_is_hebrew
               else "✅ You've already saved that link.")
        send_whatsapp_message(payload.from_number, msg)
        return https_fn.Response(
            json.dumps({"success": True, "duplicate": True, "url": url}),
            status=200, mimetype="application/json"
        )

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
            # When processing began — the janitor uses this (not createdAt, which
            # a retry preserves) to age out cards stuck in `processing`.
            "processingStartedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
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
        # Mark the queue doc as in-flight. Kept inside the try so that if this
        # write throws, the failure hits the except below and the visible card
        # is marked FAILED — rather than the capture being lost silently.
        ref.update({"status": "processing", "startedAt": datetime.now(timezone.utc).isoformat()})

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

        # Embedding: only store a real Vector. If the embed failed (None), omit
        # the field and flag the card so a backfill repairs it later — never
        # write a poisoned near-zero vector that looks embedded but isn't.
        if embedding:
            link_data["embedding_vector"] = Vector(embedding)
        else:
            link_data["needsEmbedding"] = True

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


# ─────────────────────────────────────────────
# Scheduled Functions
# ─────────────────────────────────────────────

@scheduler_fn.on_schedule(schedule="every 2 minutes")
def check_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """Scheduled function that runs every 2 minutes to check for pending reminders."""
    run_reminder_check()


# How long a card may sit in `processing` before the janitor rules it dead.
# Real analysis finishes in seconds to ~1 min; 15 min is comfortably past any
# legitimate run, so this only catches genuinely-stuck captures.
_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000


def _to_ms(value) -> Optional[int]:
    """Coerce a Firestore timestamp field to epoch-ms. Handles our int-ms writes
    and Firestore `Timestamp`/`datetime` (from `serverTimestamp()`); returns None
    for anything unrecognised (or a still-unresolved pending server timestamp)."""
    if isinstance(value, (int, float)):
        return int(value)
    if hasattr(value, "timestamp"):
        try:
            return int(value.timestamp() * 1000)
        except Exception:
            return None
    return None


def run_processing_janitor() -> dict:
    """Flip cards stuck in `processing` past the timeout to a retryable FAILED.

    A timeout/OOM kill of `process_link_background` (or a client that dies mid
    `/api/analyze` retry) never reaches the `except` that marks the card FAILED,
    so the placeholder rots at `processing` forever — an eternal spinner the user
    can't retry. This sweep is the backstop: it ages those out so they become
    visible, retryable failed cards.

    Uses a collection-group query (equality-only → served by the default
    single-field index) so it doesn't scan every user. Age is measured from
    `processingStartedAt` when present (a retry preserves the old `createdAt`),
    falling back to `createdAt`.
    """
    db = get_db()
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    cutoff = now_ms - _PROCESSING_TIMEOUT_MS
    report = {"scanned": 0, "failed_out": 0, "errors": []}

    try:
        stuck = db.collection_group("links").where(
            "status", "==", LinkStatus.PROCESSING.value
        ).limit(200).stream()
    except Exception as e:
        logger.error(f"Janitor query failed: {e}")
        report["errors"].append(str(e))
        return report

    for doc in stuck:
        report["scanned"] += 1
        d = doc.to_dict() or {}
        started = _to_ms(d.get("processingStartedAt")) or _to_ms(d.get("createdAt"))
        # No usable timestamp → treat as stuck (a processing card with no age is
        # already anomalous); otherwise only act once it's past the cutoff.
        if started is not None and started > cutoff:
            continue
        try:
            doc.reference.update({
                "status": LinkStatus.FAILED.value,
                "error": "Processing timed out — tap to retry.",
                "failedAt": now_ms,
            })
            report["failed_out"] += 1
        except Exception as e:
            logger.error(f"Janitor failed to update {doc.id}: {e}")
            report["errors"].append(f"{doc.id}: {e}")

    if report["failed_out"]:
        logger.info(f"Processing janitor: {report}")
    return report


@scheduler_fn.on_schedule(schedule="every 5 minutes")
def sweep_stuck_processing(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 5 min: age out captures stuck in `processing` (see run_processing_janitor)."""
    run_processing_janitor()


@https_fn.on_request()
def force_sweep_stuck_processing(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for the processing janitor (admin-gated) — verify without
    waiting for the schedule."""
    guard = _require_admin(req)
    if guard:
        return guard
    try:
        report = run_processing_janitor()
        return https_fn.Response(json.dumps(report, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual janitor trigger failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)


@https_fn.on_request()
def force_check_reminders(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for reminder check to debug without waiting for schedule."""
    guard = _require_admin(req)
    if guard:
        return guard
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
    guard = _require_admin(req)
    if guard:
        return guard
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

    # Prefer the verified caller; fall back to the client uid only while
    # REQUIRE_AUTH is off (staged rollout).
    uid = find_data_uid_by_auth_uid(req.auth.uid) if req.auth else None
    if not uid and not REQUIRE_AUTH and req.data:
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
    # NOTE: the delivery address is always the user's own stored email — we do
    # NOT honor a client-supplied "email" override (that allowed exfiltrating a
    # digest to an arbitrary address).
    if overrides:
        user_data.setdefault("settings", {})
        user_data["settings"] = {**user_data.get("settings", {}), **overrides}

    try:
        result = build_and_send_digest(uid, user_data, force=True)
        return result
    except Exception as e:
        logger.error(f"send_digest_now failed for {uid}: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))
