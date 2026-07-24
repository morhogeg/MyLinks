"""
SecondBrain Cloud Functions — Entry Point
Handles link ingestion (share sheet / web) and AI processing.

All business logic is extracted into dedicated modules:
- scraper.py: URL content extraction
- ai_service.py: Gemini AI analysis & embeddings
- link_service.py: Firestore user/link operations
- reminder_service.py: Spaced repetition reminders
- search.py: Semantic vector search
- graph_service.py: Knowledge graph / related links
- db.py: Shared Firestore client singleton
"""

import os
import re
import json
import hmac
import hashlib
import html as _html
import logging
import requests
from typing import Optional
from datetime import datetime, timezone, timedelta

# Firebase Functions framework
from firebase_functions import https_fn, scheduler_fn, firestore_fn, options
from firebase_admin import storage, auth as admin_auth
from google.cloud import firestore as gc_firestore
from google.cloud.firestore_v1.vector import Vector

# Cost ceiling (report 3.1): a hard cap on total concurrent instances across
# EVERY function in this codebase, so a traffic spike or abuse can never fan out
# into unbounded paid Gemini calls. Set BEFORE the internal-module imports below
# on purpose: firebase_functions computes each function's deploy spec at
# DECORATION time, so functions decorated while those modules import (notably
# search.py's search_links / sync_link_embedding) only inherit this global
# default if it's already set. Per-function decorators tighten it further on the
# paid/admin surfaces; a function still overrides any field it sets explicitly
# (e.g. process_link_background keeps its own memory/timeout).
options.set_global_options(max_instances=20)

# Internal modules
from db import get_db, ensure_app
from models import LinkStatus, ReminderStatus
from ai_service import GeminiService, AnalysisError
from link_service import (
    save_link_to_firestore, get_user_tags, is_hebrew,
    ensure_ingest_token, find_user_by_ingest_token, link_exists_for_url,
    pending_exists_for_url, find_data_uid_by_auth_uid, delete_user_data,
    create_workspace,
)
from reminder_service import handle_reminder_intent, set_reminder, run_reminder_check, format_local_time
from graph_service import GraphService
# NOTE: `scraper` is imported lazily inside the functions that actually scrape
# URLs, not at module top-level. That keeps it (and the scraping helpers it
# pulls in, e.g. BeautifulSoup) off the import path of functions that never
# scrape — like the hot image-analysis path in analyze_image — so their cold
# starts stay lighter.
from search import (
    sync_link_embedding, search_links, perform_search_logic, perform_hybrid_search,
    build_embedding_text, rerank_candidates, keyword_query_tokens,
    keyword_match_score, keyword_scan_cards, EmbeddingService, EMBED_TEXT_VERSION,
    extract_quoted_phrases, pin_title_phrases, missing_title_phrases,
    anchor_phrases_for, is_exclusion_question, demote_cards_by_titles,
    is_recency_question, recent_cards, category_cards,
    private_collection_ids, strip_private_cards, apply_distance_threshold,
)
from rate_limit import check_rate_limit, client_ip
# Monthly per-user soft quotas (report 3.2). Imports only db + stdlib (no cycle).
from quota import check_and_increment_quota, refund_quota, quota_message
# Public share-page subsystem (renderers + publish/unpublish logic). The three
# HTTP endpoints (publish_share_http, unpublish_share_http, share_page) stay in
# this file — Firebase discovers deployables by scanning main.py — and call into
# these helpers. share_service imports only db + stdlib (never main → no cycle).
from share_service import (
    _publish_share_logic, _unpublish_share_logic,
    _render_shared_card, _render_shared_collection, _share_not_found_html,
)

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


# How long a server_errors record lives before the janitor (or a Firestore TTL
# policy on `expireAt`) removes it. Matches the task_logs retention.
_SERVER_ERROR_TTL_DAYS = 14


def _record_server_error(fn: str, exc: Exception, uid: str = None) -> None:
    """Best-effort durable record of a server-side failure (`server_errors`).

    Cloud Logging keeps the stack trace, but nobody is watching Cloud Logging —
    a production 5xx surfaces to the user as a sanitized message and then
    vanishes. This writes a small, bounded record to the top-level
    ``server_errors`` collection so failures are visible from the app side:
    `debug_status` returns the recent ones, and the janitor prunes them on the
    same 14-day policy as ``task_logs`` (docs carry a TTL-compatible
    ``expireAt``). Admin-SDK-only, like ``rate_limits``/``usage_quotas`` — the
    locked ruleset denies all client access. Never raises.
    """
    try:
        now = datetime.now(timezone.utc)
        get_db().collection("server_errors").add({
            "fn": fn,
            "type": type(exc).__name__,
            "error": str(exc)[:500],
            # Admin-only collection, so the workspace uid is safe to store here
            # (needed to correlate a user's report with the failure).
            "uid": uid,
            "timestamp": now.isoformat(),
            "expireAt": now + timedelta(days=_SERVER_ERROR_TTL_DAYS),
        })
    except Exception as log_exc:
        # Observability must never take the request down with it.
        logger.warning("server_errors write failed (ignored): %s", log_exc)


def _ask_diag(exc: Exception) -> str:
    """TEMPORARY owner-facing diagnostic tail for the Ask error message.

    Ask keeps failing in prod for one owner-reported query and the recorded
    cause lives in `server_errors`, which is unreadable from a cloud session
    (no egress, ADMIN_TOKEN unset). Until the real cause is confirmed, append a
    compact, bounded reason (exception type + trimmed message — which now names
    the Gemini finish_reason/block_reason) to the sanitized Ask error so the
    owner can read it straight off the screen. REMOVE once the cause is fixed."""
    try:
        detail = str(exc).strip()
        detail = re.sub(r"\s+", " ", detail)[:180]
        return f" (diag: {type(exc).__name__}: {detail})" if detail else f" (diag: {type(exc).__name__})"
    except Exception:
        return ""


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
        # The Admin SDK's default app is otherwise only initialized by get_db(),
        # which every authenticated endpoint calls AFTER this check — so a cold
        # instance had no app here and every token verification failed.
        ensure_app()
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


def _mask_uid(uid) -> str:
    """A non-PII, log-safe tag for a uid.

    The data-doc uid IS the user's E.164 phone number, so logging it in plaintext
    (Cloud Logging) leaks PII. This returns a short, stable, non-reversible tag
    (`uid#<8 hex>`) that still lets operators correlate a user's log lines within
    a session without exposing the number.
    """
    if not uid:
        return "uid#none"
    digest = hashlib.sha256(str(uid).encode("utf-8")).hexdigest()[:8]
    return f"uid#{digest}"


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
# Base64 inflates 3 bytes → 4 chars, so an inline image string this long already
# exceeds MAX_IMAGE_BYTES once decoded. Checking the STRING length before
# base64.b64decode rejects an oversized payload without first materializing the
# full decoded buffer in memory (an attacker could otherwise force a ~24 MB
# allocation up to Cloud Run's body limit before the post-decode size check).
# The +1024 slack covers data-URI prefixes and base64 padding/whitespace.
MAX_IMAGE_B64_CHARS = (MAX_IMAGE_BYTES * 4) // 3 + 1024


# Per-bucket rate limits: (max_requests, window_seconds, fail_open). The analyze
# / image / chat buckets are deliberately tight because each call spends money on
# Gemini. The `*-uid` twins mirror their IP buckets so paid endpoints are limited
# BOTH per source IP (catches anonymous/rotating-IP abuse and shared NAT) AND per
# resolved workspace uid (a single account can't just rotate IPs to bypass the
# limit). See _rate_limited call sites in analyze_link / analyze_image / ask_brain.
#
# `fail_open` is the bucket's Firestore-outage policy and lives HERE, on the same
# row as the limit, so a newly added bucket can't silently default to fail-open by
# being forgotten from a parallel set (report 3.5). Paid buckets (every call
# spends money on Gemini, or writes attacker-influenceable data) fail CLOSED:
# reject on a limiter backend error rather than strip the last cost ceiling.
# Cheap / IP-only buckets (article scrape, device-token writes) fail OPEN so a
# Firestore hiccup doesn't take those harmless paths down.
_RATE_LIMITS = {
    "analyze": (30, 3600, False),
    "analyze-uid": (30, 3600, False),
    "image": (30, 3600, False),
    "image-uid": (30, 3600, False),
    "chat": (60, 3600, False),
    "chat-uid": (60, 3600, False),
    "article": (120, 3600, True),
    "share": (120, 3600, False),
    # Per-uid ceiling on the share-extension token path (report 3.3): the IP
    # `share` bucket alone can't stop a leaked ingest token from spamming the
    # paid pipeline from rotating IPs. 60/hr comfortably covers real share usage.
    "share-uid": (60, 3600, False),
    # Per-uid ceiling on public-share publishing (report 3.4): each publish
    # writes a client-built snapshot, so bound how fast one account can create/
    # overwrite them (on top of the serialized-size cap in publish_share_http).
    "publish": (30, 3600, False),
    # Per-IP ceiling on publish/unpublish. The per-uid `publish` bucket alone is
    # bypassable by a rotating client-supplied uid pre-cutover, so mirror the
    # IP+uid double-bucket the paid endpoints use. Writes admin-SDK snapshots to
    # a world-readable collection → fail CLOSED.
    "publish-ip": (60, 3600, False),
    "device_token": (30, 3600, True),
    # Home search bar (native HTTP twin). Debounced client-side, but a user can
    # still fire many queries in a session, so keep the ceilings generous. Mirror
    # the IP + uid double-bucket the paid endpoints use (an embedding call per
    # query has a small cost).
    "search": (120, 3600, False),
    "search-uid": (120, 3600, False),
}

# Input caps for client-supplied fields that flow into the Gemini prompt, so a
# hostile/oversized payload can't inflate prompt cost or widen the injection
# surface. Enforced by _sanitize_history / _sanitize_tags below.
MAX_HISTORY_ITEMS = 6            # ai_service._build_rag_prompt uses the last 6 turns
MAX_HISTORY_CONTENT_LENGTH = 4000
MAX_TAGS = 50
MAX_TAG_LENGTH = 60

# How many head-of-list cards ride into the Ask prompt WITH their deep content
# (detailedSummary / recipe steps / video highlights), and how much of a long
# detailedSummary each may carry. Retrieval order puts the cards the answer
# will actually use at the front (rerank → recency merge → quoted-title pin),
# so depth on the head is depth where it matters; the tail stays summary-only
# to bound prompt cost.
ASK_DEEP_CARDS = 6
ASK_DETAIL_MAX_CHARS = 3500
# Hard cap on how many cards reach the Ask prompt after ALL merges (vector +
# keyword + concept + recency + category). Bounds token cost and keeps the
# context signal-dense; demoted (excluded) cards sit at the back, so they are
# the first to fall off.
ASK_CONTEXT_CARDS = 20
# Caps for the structured chip hints (see _sanitize_hints). Titles cap at 8:
# a "what else" chip excludes EVERY cited card of the answer it follows, and
# multi-card recap answers routinely cite 5-6 — capping below that let a
# just-discussed card slip back in.
MAX_HINT_TEXT_LENGTH = 60
MAX_HINT_TITLE_LENGTH = 120
MAX_HINT_TITLES = 8


def _sanitize_history(history) -> list:
    """Clamp client-supplied chat history before it reaches the Gemini prompt.

    ai_service._build_rag_prompt concatenates the last few turns verbatim, so
    unbounded history items are both a cost and a prompt-injection surface. Keep
    only the last MAX_HISTORY_ITEMS turns, drop anything that isn't a dict,
    whitelist the role to user/assistant (default user), and truncate each
    turn's content to MAX_HISTORY_CONTENT_LENGTH chars. Non-list → [].
    """
    if not isinstance(history, list):
        return []
    cleaned = []
    for item in history[-MAX_HISTORY_ITEMS:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in ("user", "assistant"):
            role = "user"
        content = item.get("content")
        if not isinstance(content, str):
            content = "" if content is None else str(content)
        cleaned.append({"role": role, "content": content[:MAX_HISTORY_CONTENT_LENGTH]})
    return cleaned


def _sanitize_hints(hints) -> dict:
    """Validate the client's structured Ask-chip hints before they steer
    retrieval or reach the prompt.

    Chips are machine-generated with PROVABLE intent — the anchor card, the
    category, the concept, a recency window, cards to exclude ("what else…").
    Sending only the prose question forced the backend to re-infer that intent
    from text and sometimes lose it (the "what else did I save on X?" chip
    re-presenting the very card just discussed). `hints` carries the intent
    explicitly; this clamps every field (types, counts, lengths) since it is
    still client-supplied input feeding Firestore queries and the prompt.
    Anything malformed is dropped, never errored — hints only ever improve a
    request. Non-dict → {}.
    """
    if not isinstance(hints, dict):
        return {}
    out = {}
    for key in ("category", "concept"):
        v = hints.get(key)
        if isinstance(v, str) and v.strip():
            out[key] = v.strip()[:MAX_HINT_TEXT_LENGTH]
    if hints.get("recency"):
        out["recency"] = True
    for key in ("anchorTitles", "excludeTitles"):
        v = hints.get(key)
        if isinstance(v, list):
            clean = [
                s.strip()[:MAX_HINT_TITLE_LENGTH]
                for s in v[:MAX_HINT_TITLES] if isinstance(s, str) and s.strip()
            ]
            if clean:
                out[key] = clean
    return out


def _sanitize_tags(tags) -> list:
    """Validate client-supplied existingTags before they reach the Gemini prompt.

    The tags are concatenated into the analysis prompt, so cap the count and per-
    tag length and drop anything that isn't a non-empty string. Keep at most
    MAX_TAGS items, coerce each to a str, truncate to MAX_TAG_LENGTH chars, drop
    empties. Anything that isn't a list → [].
    """
    if not isinstance(tags, list):
        return []
    cleaned = []
    for tag in tags[:MAX_TAGS]:
        s = (tag if isinstance(tag, str) else str(tag)).strip()[:MAX_TAG_LENGTH]
        if s:
            cleaned.append(s)
    return cleaned


def _rate_limited(bucket: str, identity: str, headers: dict = None):
    """Return a 429 Response if `identity` exceeds the bucket's limit, else None.

    The bucket's limit, window, AND fail-open policy all come from the single
    _RATE_LIMITS row — no parallel fail-closed set to keep in sync (report 3.5).
    """
    limit, window, fail_open = _RATE_LIMITS[bucket]
    if not check_rate_limit(f"{bucket}:{identity}", limit, window, fail_open=fail_open):
        # Log the bucket only — the identity is an IP or workspace uid (PII).
        logger.warning("Rate limit exceeded: %s", bucket)
        return _error_response("Too many requests. Please slow down.", 429, headers)
    return None


# Serialized-payload cap for publish_share_http (report 3.4). A share snapshot is
# a single card or a small curated collection; 200 KB is generous headroom while
# blocking large-doc spam / storage abuse. Over-cap → 413.
MAX_PUBLISH_BYTES = 200 * 1024

def _quota_blocked(uid: str, kind: str, headers: dict = None):
    """Meter one `kind` unit against `uid`'s monthly quota; 429 Response if over.

    Soft cap (report 3.2): a None uid (pre-cutover soft auth, nothing to meter)
    or any Firestore error fails OPEN inside check_and_increment_quota, so this
    only ever blocks a real, over-limit workspace — the rate limiter (fail-closed)
    and max_instances are the hard backstops. Increments the counter as a side
    effect when the call is allowed, so callers invoke it exactly once, before
    the paid work / enqueue.
    """
    if not uid:
        return None
    ok, _ = check_and_increment_quota(uid, kind)
    if not ok:
        logger.warning("Monthly quota exceeded (kind=%s)", kind)
        return _error_response(quota_message(kind), 429, headers)
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

# Cost cap for YouTube native video ingestion (~100 tokens/sec at LOW media
# resolution ≈ $0.09 per hour of video, and the model has no pre-call limit of
# its own). Videos longer than this get the honest metadata-only card instead
# of being watched end-to-end. Duration comes from a best-effort watch-page
# probe (scraper._probe_youtube_duration); unknown duration fails OPEN — the
# model's context window still bounds that worst case. 0 disables the cap.
YOUTUBE_MAX_VIDEO_MINUTES = int(os.environ.get("YOUTUBE_MAX_VIDEO_MINUTES", "180") or "0")


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
    """Append an honest note to detailedSummary when the scraper could only read
    a partial preview (Facebook's truncated og:description, a social-teaser
    fallback on a JS shell) or nothing at all (login wall, PDF). Either way the
    summary is incomplete for a reason the user can't see, so we say so and
    suggest the workaround. Wording is source-agnostic — every `truncated`
    scrape rides this channel now, not just Facebook. Rendered as a trailing
    blockquote, so it never violates the 'start with ## Key Points' rule."""
    he = (language or "").lower().startswith("he")
    if he:
        note = ("> ⚠️ **הערה:** לא ניתן היה לקרוא את הטקסט המלא של התוכן הזה. "
                "לסיכום מלא, נסו לשמור צילום מסך במקום את הקישור.")
    else:
        note = ("> ⚠️ **Note:** The full text of this content couldn't be read. "
                "For a complete summary, try saving a screenshot instead.")
    detailed = (detailed or "").rstrip()
    return f"{detailed}\n\n{note}" if detailed else note


# Images embedded in a shared post (e.g. photos on an X post) that we fetch and
# feed to vision alongside the text. Bounded so a single save can't balloon in
# latency or cost: only the first few photos, only reasonably-sized ones.
_MAX_POST_IMAGES = 2
_MAX_POST_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB — skip anything larger
_POST_IMAGE_FETCH_TIMEOUT = 10  # seconds per image (sync path has a 60s budget)


def _fetch_post_images(image_urls: list) -> list:
    """Download up to _MAX_POST_IMAGES post images as (bytes, mime_type) tuples.

    Routed through scraper.safe_get for the same SSRF guard the image-ingest path
    uses (per-redirect re-validation) — scraped URLs are externally-controlled and
    must not be able to make us fetch an internal/metadata endpoint. Best-effort:
    any URL that fails, is oversized, or isn't an image is skipped, so a flaky
    media host degrades to a text-only card instead of failing the whole save.
    """
    if not image_urls:
        return []
    from scraper import safe_get

    images = []
    for raw_url in image_urls:
        if len(images) >= _MAX_POST_IMAGES:
            break
        if not isinstance(raw_url, str) or not raw_url.startswith(("http://", "https://")):
            continue
        try:
            resp = safe_get(raw_url, timeout=_POST_IMAGE_FETCH_TIMEOUT)
            resp.raise_for_status()
            content = resp.content
            if not content or len(content) > _MAX_POST_IMAGE_BYTES:
                logger.warning(f"Skipping post image (empty or > cap): {raw_url}")
                continue
            mime = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if not mime.startswith("image/"):
                mime = "image/jpeg"  # media CDNs sometimes omit/mislabel the type
            images.append((content, mime))
        except Exception as e:
            logger.warning(f"Failed to fetch post image {raw_url}: {e}")
            continue
    return images


def _analyze_scraped(ai, scraped: dict, existing_tags: list, attempts: int = None):
    """Run the right analysis for scraped content.

    For YouTube, use Gemini native video ingestion; if that fails (private /
    unlisted / over-quota / region-blocked), fall back to an honest
    metadata-only text analysis rather than fabricating a summary.

    When the scraped post carries embedded images (e.g. photos on an X post),
    fetch them and run a single multimodal analysis so the card reflects what the
    images show — falling back to text-only if the fetch or vision call fails.

    `attempts` threads the Gemini retry budget: the SYNCHRONOUS analyze_link path
    passes 2 (stay under the 60s function timeout), while the background pipeline
    leaves it None so ai_service's default (3) applies.
    """
    # None → let ai_service use its default retry count (3, the background value).
    kw = {} if attempts is None else {"attempts": attempts}
    content_type = scraped.get("content_type")
    if content_type == "youtube":
        yt_meta = scraped.get("youtube_metadata", {})
        watch_url = yt_meta.get("watch_url")
        length_seconds = yt_meta.get("length_seconds")
        over_cap = bool(YOUTUBE_MAX_VIDEO_MINUTES and length_seconds
                        and length_seconds > YOUTUBE_MAX_VIDEO_MINUTES * 60)
        if over_cap:
            logger.warning(
                f"YouTube video over duration cap ({length_seconds}s > "
                f"{YOUTUBE_MAX_VIDEO_MINUTES}min) — using metadata-only card")
        elif watch_url:
            try:
                analysis = ai.analyze_youtube(watch_url, existing_tags=existing_tags, **kw)
                # The probed duration is ground truth; the model's is an estimate.
                if isinstance(analysis, dict) and length_seconds:
                    analysis["videoDurationMinutes"] = max(1, (length_seconds + 59) // 60)
                return analysis
            except AnalysisError as e:
                logger.warning(f"Native YouTube analysis failed, using metadata-only fallback: {e}")
        # Fallback: analyze the lightweight oEmbed metadata text honestly.
        analysis = ai.analyze_text(scraped.get("text") or scraped.get("html", ""),
                                   existing_tags=existing_tags, **kw)
        # The fallback model never saw the video, so its duration would be a
        # fabrication — use the probed one when we have it.
        if isinstance(analysis, dict) and length_seconds:
            analysis["videoDurationMinutes"] = max(1, (length_seconds + 59) // 60)
        return analysis

    content_text = scraped.get("text") or scraped.get("html", "")

    # If the post carries embedded photos, read them with vision in the SAME call
    # as the text so the summary reflects both. Any failure (fetch or analysis)
    # falls back to the text-only card — an image must never break a working save.
    post_images = _fetch_post_images(scraped.get("image_urls"))
    if post_images:
        try:
            analysis = ai.analyze_text_with_images(
                content_text, post_images, existing_tags=existing_tags,
                content_type=content_type,
                # Instagram marks its cover as image-first (screenshot carrying the
                # real text) → read at higher res + trust the image over the
                # caption. X leaves this unset: text stays primary, image low-res.
                image_is_primary=bool(scraped.get("image_primary")),
                **kw)
            if isinstance(analysis, dict) and scraped.get("truncated"):
                analysis["detailedSummary"] = _append_capture_note(
                    analysis.get("detailedSummary"), analysis.get("language"))
            # Keep the cover image we just read so the card can SHOW it, not just
            # summarize it. The caller persists a downscaled copy (never the
            # expiring social CDN URL). First image only — the card header is one.
            scraped["_post_thumbnail"] = post_images[0]
            return analysis
        except AnalysisError as e:
            logger.warning(f"Multimodal post analysis failed, using text-only fallback: {e}")

    analysis = ai.analyze_text(content_text,
                               existing_tags=existing_tags, content_type=content_type, **kw)
    # When the scraper could only get a truncated preview (Facebook text posts),
    # tell the user plainly rather than presenting a thin summary as complete.
    if isinstance(analysis, dict) and scraped.get("truncated"):
        analysis["detailedSummary"] = _append_capture_note(
            analysis.get("detailedSummary"), analysis.get("language"))
    # Video posts (X / Instagram reels / LinkedIn / Facebook) have no embedded
    # photo to run vision on, but often expose a poster frame. Fetch that single
    # image purely to SHOW as the card banner — no model call — so they get a
    # thumbnail like YouTube. The caller re-hosts it via `_apply_post_thumbnail`.
    # Best-effort: no poster URL, or a failed fetch, leaves the card media-less.
    if not scraped.get("_post_thumbnail"):
        poster_url = scraped.get("video_thumbnail_url")
        if poster_url:
            poster = _fetch_post_images([poster_url])
            if poster:
                scraped["_post_thumbnail"] = poster[0]
                # Mark it a video poster so the card renders it at the fixed
                # YouTube-style banner height (center crop) instead of sizing the
                # banner to a tall portrait frame.
                scraped["_post_thumbnail_is_video"] = True
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


# A stored social-post thumbnail renders as a small card header, so a 600px long
# edge at JPEG q80 is ample — and keeps stored/served bytes ~4-10x smaller than the
# up-to-8MB source we already fetched for vision.
_POST_THUMB_MAX_EDGE = 600
_POST_THUMB_JPEG_QUALITY = 80


def _downscale_thumbnail(image_bytes: bytes, mime_type: str) -> tuple:
    """Downscale a post cover image to a small JPEG card thumbnail.

    Returns (bytes, mime_type, aspect) where aspect = width/height rounded to 4dp
    (or None if it couldn't be measured). The frontend uses `aspect` to size the
    card banner to the image so most shapes show whole (only extreme portraits get
    clamped + top-anchored) instead of a fixed center-crop. Best-effort: on any
    decode/encode failure (or if Pillow is unavailable) returns the ORIGINAL
    bytes/mime and aspect None — a thumbnail must never break a working save.
    Transparency is flattened onto white so PNGs with alpha don't go black when
    re-encoded as JPEG.
    """
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        img.thumbnail((_POST_THUMB_MAX_EDGE, _POST_THUMB_MAX_EDGE))
        w, h = img.size
        aspect = round(w / h, 4) if h else None
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=_POST_THUMB_JPEG_QUALITY, optimize=True)
        return out.getvalue(), "image/jpeg", aspect
    except Exception as e:
        logger.warning(f"Thumbnail downscale failed, storing original: {e}")
        return image_bytes, mime_type, None


# A real video frame is at least a few hundred px on its short edge; anything
# smaller is a favicon/avatar-scale image, not a usable banner.
_VIDEO_POSTER_MIN_EDGE = 200


def _video_poster_looks_like_junk(image_bytes: bytes) -> bool:
    """True when a video 'poster' is really an avatar / logo / icon on a plain
    background, or too small to be a real frame — cases that look worse than a
    clean text card, so we suppress them (the card falls back to text-only).

    Two signals: (1) too small on the short edge; (2) a near-SQUARE frame whose
    four corners are each visually flat AND match one another — i.e. a subject
    centered on a uniform background (the classic avatar/logo/title-card shape).
    Real photographic frames vary corner-to-corner and are usually 16:9/9:16, so
    they pass. Wide letterboxed frames are intentionally NOT caught (the square
    gate excludes them) to avoid suppressing legitimate video. Best-effort: any
    decode/measure failure returns False (keep the poster)."""
    try:
        import io
        from PIL import Image, ImageStat
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        if min(w, h) < _VIDEO_POSTER_MIN_EDGE:
            return True
        if not (0.8 <= w / h <= 1.25):  # not square-ish → treat as a real frame
            return False
        cw, ch = max(1, w // 6), max(1, h // 6)
        corners = [img.crop((0, 0, cw, ch)), img.crop((w - cw, 0, w, ch)),
                   img.crop((0, h - ch, cw, h)), img.crop((w - cw, h - ch, w, h))]
        stats = [ImageStat.Stat(c) for c in corners]
        flat_each = all(max(s.stddev) < 14 for s in stats)  # each corner uniform
        spread = max(max(s.mean[i] for s in stats) - min(s.mean[i] for s in stats)
                     for i in range(3))                      # corners agree
        return flat_each and spread < 18
    except Exception:
        return False


def _apply_post_thumbnail(link_data: dict, scraped: dict, uid: str, key: str = None) -> None:
    """Persist the social-post cover image we already fetched for vision and record
    it as the card's `metadata.thumbnailUrl`, so X/Instagram cards SHOW the image
    they were summarized from — not just the text.

    The bytes come off `scraped['_post_thumbnail']` (stashed by `_analyze_scraped`
    when multimodal analysis succeeded). We downscale and upload via `_store_image`
    rather than hotlinking the og:image: social CDN URLs are signed/expiring and
    would rot to broken images within days. Best-effort — any failure leaves the
    card text-only rather than breaking the save; no new model call, and no new
    image fetch (the bytes are already in hand).
    """
    thumb = scraped.pop("_post_thumbnail", None)
    is_video_poster = scraped.pop("_post_thumbnail_is_video", False)
    if not thumb or not uid:
        return
    # Auto-suppress obviously-bad video posters (avatar/logo/too small) so junk
    # never shows by default — the card degrades to a clean text card. Photo
    # covers are the post's actual content, so they're never gated here.
    if is_video_poster and _video_poster_looks_like_junk(thumb[0]):
        logger.info("Suppressing low-quality video poster (avatar/logo/too small)")
        return
    try:
        import uuid
        image_bytes, mime, aspect = _downscale_thumbnail(thumb[0], thumb[1])
        blob_key = key or uuid.uuid4().hex
        url = _store_image(f"post_thumbs/{uid}/{blob_key}.jpg", image_bytes, mime)
        meta = link_data.setdefault("metadata", {})
        meta["thumbnailUrl"] = url
        if is_video_poster:
            # Video posters render at the fixed YouTube-style banner height, so we
            # omit the per-image aspect (which would size a portrait frame tall)
            # and flag it so the card uses the video banner treatment.
            meta["thumbnailIsVideo"] = True
        elif aspect:
            meta["thumbnailAspect"] = aspect
    except Exception as e:
        logger.warning(f"Failed to store post thumbnail: {e}")


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


# Sentinel marking a link_data field the caller wants OMITTED entirely (distinct
# from passing None, which would still write the key). Used to preserve the
# per-call-site drift in `relatedLinks` / `confidence` / `keyEntities` presence.
_OMIT = object()


def _build_link_data(*, url, title, summary, detailed_summary, source_type,
                     source_name, original_title, estimated_read_time, analysis,
                     related_links=_OMIT, confidence=_OMIT, key_entities=_OMIT):
    """Build the link document shared by analyze_link / analyze_image /
    process_link_background.

    The three call sites had drifted near-identical copies of this dict; this is
    the single builder. Fields that legitimately differ per site (url, title,
    summary/detailedSummary defaults, sourceType/sourceName, the metadata
    originalTitle/estimatedReadTime) are passed in already-computed. The KNOWN
    drift is preserved verbatim rather than reconciled — `confidence` is passed
    per site (0.8 for analyze_link, 0.9 for analyze_image) and OMITTED for the
    background pipeline; `relatedLinks` and `keyEntities` are likewise present or
    omitted via the `_OMIT` sentinel to keep each site's exact output. Embedding
    handling (embedding_vector / needsEmbedding) stays at the background call
    site since only it writes those.
    """
    data = {
        "url": url,
        "title": title,
        "summary": summary,
        "detailedSummary": detailed_summary,
        "tags": analysis.get("tags", []),
        "category": analysis.get("category", "General"),
        "status": LinkStatus.UNREAD.value,
        "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        "language": analysis.get("language", "en"),
        "metadata": {
            "originalTitle": original_title,
            "estimatedReadTime": estimated_read_time,
            "actionableTakeaway": analysis.get("actionableTakeaway"),
        },
        "concepts": analysis.get("concepts", []),
        "sourceType": source_type,
        "sourceName": source_name,
    }
    if related_links is not _OMIT:
        data["relatedLinks"] = related_links
    if confidence is not _OMIT:
        data["confidence"] = confidence
    if key_entities is not _OMIT:
        data["keyEntities"] = key_entities
    return data


def _first_line(text: str, limit: int = 120) -> str:
    """The first non-empty line of a note, trimmed — used as an honest title
    fallback when the AI doesn't return one (never a fabricated headline)."""
    for line in (text or "").splitlines():
        line = line.strip()
        if line:
            return line[:limit]
    return ""


# A URL-less thought/note is a first-class card. It has NO url and is NOT scraped
# — sourceType 'note' tells the frontend to render it as a note (no source link,
# no reader, no "open original"), and 'Note' is the byline.
NOTE_SOURCE_TYPE = "note"
MAX_NOTE_LENGTH = 30000


def _note_link_data(analysis: dict, text: str, *, related_links=_OMIT) -> dict:
    """Build a link document for a URL-less text note (a first-class 'note' card).

    Reuses the shared builder but pins the note-specific shape: empty url (no
    source to open), sourceType 'note', sourceName 'Note', and a title that
    falls back to the note's first line when the model returns none. Read time is
    estimated from the note text itself since there is no scraped article."""
    title = analysis.get("title") or _first_line(text) or "Note"
    return _build_link_data(
        url="",
        title=title,
        summary=analysis.get("summary", ""),
        detailed_summary=analysis.get("detailedSummary", ""),
        source_type=NOTE_SOURCE_TYPE,
        source_name=analysis.get("sourceName") or "Note",
        original_title=_first_line(text),
        estimated_read_time=_estimate_read_time(text),
        analysis=analysis,
        related_links=related_links,
        confidence=0.8,
        key_entities=[],
    )


def _embedding_text_from_analysis(analysis: dict) -> str:
    """Map a fresh AI `analysis` dict onto the shared v2 embedding recipe.

    Both new-card embed sites (the synchronous web-add preview and the async
    background pipeline) embed the SAME rich text the Firestore trigger and the
    backfill use — title + summary + detailedSummary + takeaway + concepts +
    video highlights — so a card's stored vector and its live find_related_links
    query vector are always built the identical way.
    """
    return build_embedding_text({
        "title": analysis.get("title", ""),
        "summary": analysis.get("summary", ""),
        "detailedSummary": analysis.get("detailedSummary", ""),
        "tags": analysis.get("tags", []),
        "concepts": analysis.get("concepts", []),
        "metadata": {"actionableTakeaway": analysis.get("actionableTakeaway")},
        "videoHighlights": analysis.get("videoHighlights", []),
    })


def _card_source_name(c: dict):
    """Best byline for a card: the YouTube channel when present, else the stored
    publisher/source name. Mirrors the web card so Ask citations show the same
    identity (e.g. the channel name, not just 'YouTube')."""
    meta = c.get("metadata") or {}
    return meta.get("youtubeChannel") or c.get("sourceName")


@https_fn.on_request(max_instances=1)
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


@https_fn.on_request(max_instances=1)
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


@https_fn.on_request(max_instances=1)
def backfill_embeddings(req: https_fn.Request) -> https_fn.Response:
    """One-off migration: re-embed existing cards with the RICH v2 recipe.

    The embedding recipe changed (see search.build_embedding_text /
    EMBED_TEXT_VERSION): the old vector was built from title + short summary +
    tags ONLY, so any detail that lived in detailedSummary was invisible to Ask
    and semantic search. This endpoint recomputes the embedding for every card
    still stamped below EMBED_TEXT_VERSION and stamps the new version, so the
    whole existing library becomes findable by its details.

    Optional ?uid=… (or JSON {uid}) limits to one user; otherwise all users.
    ?force=1 re-embeds even cards already at the current version. Idempotent and
    re-runnable — a re-run with no ?force skips cards already migrated (they're
    at the current version), so it's safe to run again if it times out partway.

    OWNER STEP: after deploying functions, call this ONCE (admin-guarded, same as
    backfill_related_links):
        curl -X POST "https://<region>-<project>.cloudfunctions.net/backfill_embeddings" \
             -H "Authorization: Bearer $ADMIN_TOKEN"
    Then (optionally) re-run rebuild_connections/backfill_related_links so the
    "See also" graph reflects the new vectors.
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
        service = EmbeddingService()
        user_refs = ([db.collection("users").document(uid)] if uid
                     else list(db.collection("users").list_documents()))
        totals = {"users": 0, "reembedded": 0, "skipped": 0, "failed": 0}
        for uref in user_refs:
            totals["users"] += 1
            for doc in uref.collection("links").stream():
                d = doc.to_dict() or {}
                # Skip cards not yet in a searchable state (processing/failed) —
                # the pipeline/trigger embeds those when they settle.
                if d.get("status") in ("processing", "failed"):
                    totals["skipped"] += 1
                    continue
                if not force and d.get("embeddingVersion") == EMBED_TEXT_VERSION:
                    totals["skipped"] += 1
                    continue
                text = build_embedding_text(d)
                if not text:
                    totals["skipped"] += 1
                    continue
                try:
                    vector = service.generate_embedding(text)
                except Exception as e:
                    logger.error(f"Backfill embed failed for {doc.id}: {e}")
                    vector = None
                if vector:
                    doc.reference.update({
                        "embedding_vector": Vector(vector),
                        "embeddingVersion": EMBED_TEXT_VERSION,
                        "needsEmbedding": gc_firestore.DELETE_FIELD,
                    })
                    totals["reembedded"] += 1
                else:
                    doc.reference.update({"needsEmbedding": True})
                    totals["failed"] += 1
        return https_fn.Response(
            json.dumps(totals), status=200, headers=headers, mimetype="application/json",
        )
    except Exception as e:
        return _server_error(headers, e, "Backfill embeddings failed")


# ─────────────────────────────────────────────
# HTTP Endpoints
# ─────────────────────────────────────────────

@https_fn.on_request()
def ping(req: https_fn.Request) -> https_fn.Response:
    """Simple health check function."""
    return https_fn.Response("pong")


@https_fn.on_request(max_instances=1)
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

        # Recent production 5xx records (see _record_server_error) — the
        # queryable trail for "a user reported an error" without Cloud Logging.
        errs = db.collection('server_errors').order_by(
            'timestamp', direction='DESCENDING').limit(20).get()
        errors_data = [d.to_dict() for d in errs]

        status = {
            "status": "online",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "environment": {
                "project": os.environ.get("GCLOUD_PROJECT"),
                "has_gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
            },
            "system_check": {
                "pending_tasks_count": len(pending_data),
            },
            "recent_pending_tasks": pending_data,
            "recent_server_errors": errors_data,
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


@https_fn.on_request(max_instances=10, timeout_sec=120)
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

    # (refund_uid, kind) of a quota unit charged by THIS request, so the 5xx
    # handler can refund it — a failed save must not permanently consume a unit.
    # Stays None on the 4xx/rate-limit paths that never charged.
    charged = None

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        url = data.get('url')
        text = data.get('text') or data.get('note')
        existing_tags = _sanitize_tags(data.get('existingTags'))

        # NOTE PATH — a URL-less thought captured from the "Note" tab. Analyze the
        # text directly (no scraping) and return a first-class 'note' card. The
        # client saves the returned link_data exactly like the link/image tabs, so
        # the embedding trigger fills the vector in on create. Self-contained
        # (its own auth + per-uid rate-limit) so the URL flow below is untouched.
        if not url and text and text.strip():
            note_uid, note_auth_err = _authed_uid(req, headers, data.get('uid'))
            if note_auth_err:
                return note_auth_err
            if note_uid:
                rl = _rate_limited("analyze-uid", note_uid, headers)
                if rl:
                    return rl
                # Monthly save quota (a note is a save) — meter before the paid
                # Gemini analysis below.
                q = _quota_blocked(note_uid, "saves", headers)
                if q:
                    return q
                charged = (note_uid, "saves")

            note_text = text.strip()[:MAX_NOTE_LENGTH]
            logger.info("Analyzing note text synchronously (%d chars)", len(note_text))
            ai = GeminiService()
            # Synchronous path: cap Gemini at 2 attempts to stay under the 60s
            # function budget (report 3.6).
            analysis = ai.analyze_text(note_text, existing_tags=existing_tags, attempts=2)

            related_links = []
            if note_uid:
                embedding = ai.embed_text(_embedding_text_from_analysis(analysis))
                graph_service = GraphService(get_db())
                related_links = graph_service.find_related_links(
                    new_link_id="preview",
                    title=analysis.get("title", ""),
                    summary=analysis.get("summary", ""),
                    embedding=embedding,
                    new_concepts=analysis.get("concepts", []),
                    uid=note_uid,
                )

            link_data = _note_link_data(analysis, note_text, related_links=related_links)
            return https_fn.Response(
                json.dumps({"success": True, "link": link_data}),
                status=200, headers=headers, mimetype='application/json'
            )

        if not url:
            return _error_response("URL is required", 400, headers)
        if len(url) > MAX_URL_LENGTH:
            return _error_response("URL is too long", 400, headers)

        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid).
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err

        # Second rate-limit bucket, keyed per workspace uid (the IP bucket above
        # can't stop a single account rotating IPs). Only when a uid resolves.
        if uid:
            rl = _rate_limited("analyze-uid", uid, headers)
            if rl:
                return rl
            # Monthly save quota — meter before scraping + paid Gemini analysis.
            #
            # NOTE (report 3.2c retry double-charge): a Retry of a failed card
            # (web/lib/storage.ts retryFailedLink) POSTs the SAME body shape as a
            # fresh add — { url, existingTags, uid } — with NO distinguishing field
            # (no linkId / retry flag). The backend therefore cannot tell a retry
            # from a new save, so it charges again. Left as-is deliberately: the
            # only clean fixes are client-side (send a retry marker) or accepting
            # the rare double-charge; the failed original now REFUNDS its unit (see
            # the 5xx handler below), so most retries follow a refund and net to one
            # charge anyway.
            q = _quota_blocked(uid, "saves", headers)
            if q:
                return q
            charged = (uid, "saves")

        logger.info(f"Analyzing URL synchronously: {url}")

        # 1. Scrape content (scraper imported lazily — see top-of-file note).
        from scraper import scrape_url
        scraped = scrape_url(url)
        if not scraped.get("text") and not scraped.get("html"):
            return _error_response("Failed to scrape content", 500, headers)

        # 2. Analyze with AI (YouTube → native video ingestion w/ fallback)
        ai = GeminiService()
        content_type = scraped.get("content_type")
        # Synchronous path: 2 Gemini attempts (stay under the 60s budget, report 3.6).
        analysis = _analyze_scraped(ai, scraped, existing_tags, attempts=2)

        # 3. Generate Embedding & Find Connections
        # Rich v2 recipe (see _embedding_text_from_analysis). Used here only as
        # the query vector for find_related_links — the stored embedding_vector
        # is written server-side by the sync_link_embedding trigger.
        embedding_text = _embedding_text_from_analysis(analysis)
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

        # NB: no `embedding_vector` here on purpose. It used to be returned and
        # round-tripped through the client, which stored it as a plain list —
        # invisible to `find_nearest`. The `sync_link_embedding` Firestore trigger
        # now owns the embedding server-side (writes a real Vector on create AND on
        # the retry update). The `embedding` computed above is still used locally
        # for `find_related_links`.
        link_data = _build_link_data(
            url=url,
            title=analysis.get("title", scraped.get("title", "Untitled")),
            summary=analysis.get("summary", ""),
            detailed_summary=analysis.get("detailedSummary", ""),
            source_type="youtube" if is_youtube else "web",
            source_name=scraped.get("source_name") or analysis.get("sourceName"),
            original_title=scraped.get("title", ""),
            estimated_read_time=estimated_time,
            analysis=analysis,
            related_links=related_links,
            confidence=0.8,
            key_entities=[],
        )

        # Mirror the background pipeline's YouTube enrichment so web-added
        # videos get the same rich metadata (channel, thumbnail, highlights).
        if is_youtube:
            _apply_youtube_metadata(link_data, yt_meta, analysis, estimated_time)
        else:
            # X/Instagram photo posts: show the cover image we read for vision.
            _apply_post_thumbnail(link_data, scraped, uid)

        return https_fn.Response(
            json.dumps({"success": True, "link": link_data}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        # Server-side failure (AnalysisError / unexpected) → refund the save unit
        # this request charged so a failed analysis doesn't burn quota.
        if charged:
            refund_quota(*charged)
        return _server_error(headers, e)


@https_fn.on_request(max_instances=10, timeout_sec=120)
def ask_brain(req: https_fn.Request) -> https_fn.Response:
    """HTTP endpoint: conversational RAG over the user's saved links.

    "Ask Your Brain" — retrieves the most relevant saved cards via semantic
    search, then has Gemini answer the question grounded ONLY in those cards,
    returning the source ids it cited so the UI can link straight back to them.

    Body: { uid, question, history?: [{role, content}] }
    Returns: { success, answer, citedIds, sources: [{id, title, category, sourceName}], ungrounded }
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("chat", client_ip(req), headers)
    if rl:
        return rl

    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)

    # (uid, kind) of a quota unit charged by THIS request, so the failure paths
    # can refund it — a failed ask must not consume a unit (mirrors analyze_*).
    charged = None
    uid = None

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid).
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err

        # Second rate-limit bucket, keyed per workspace uid (the IP bucket above
        # can't stop a single account rotating IPs). Only when a uid resolves.
        if uid:
            rl = _rate_limited("chat-uid", uid, headers)
            if rl:
                return rl

        question = (data.get('question') or '').strip()
        # Clamp client-supplied history before it reaches the Gemini prompt
        # (last few turns, per-item length cap, roles whitelisted).
        history = _sanitize_history(data.get('history'))
        # Structured chip intent (anchor/category/concept/recency/exclusions) —
        # optional, clamped. See _sanitize_hints for why chips send this.
        hints = _sanitize_hints(data.get('hints'))
        # Opt-in token streaming (SSE). Only honored for POST so the JSON path is
        # 100% unchanged when not explicitly requested.
        want_stream = bool(data.get('stream')) and req.method == 'POST'

        if not uid:
            return _error_response("uid is required", 400, headers)
        if not question:
            return _error_response("question is required", 400, headers)
        if len(question) > MAX_QUESTION_LENGTH:
            return _error_response("question is too long", 400, headers)

        # Monthly ask quota — meter before the retrieval + paid Gemini answer.
        q = _quota_blocked(uid, "asks", headers)
        if q:
            return q
        charged = (uid, "asks")

        # 1. Retrieve the most relevant saved cards (reuses the vector search
        #    that already powers the search bar). Degrade gracefully: if
        #    retrieval fails, answer_from_context returns a friendly "nothing
        #    saved yet" reply rather than erroring the whole request.
        #
        #    Retrieve DEEP (top-30) then rerank down to ~10 for the model. Pure
        #    vector rank alone buries a card that literally answers the question
        #    but scores slightly lower; reranking blends vector rank with keyword
        #    overlap + recency to pull it back into context (no extra model call).
        # Both retrieval halves can fail transiently (Firestore hiccup,
        # embedding API down). Track it: if EVERY retrieval path failed and
        # nothing was assembled, the honest response is a retryable error with
        # the ask unit refunded — NOT the canned "your library is empty"
        # answer, which gaslights a user with hundreds of saves.
        retrieval_errors = 0
        try:
            candidates = perform_search_logic(uid, question, limit=30)
            # Quality-gate the nearest-neighbour output exactly like the
            # search bar does: find_nearest always returns `limit` results no
            # matter how far away, so for an off-library question ungated
            # "sources" are 30 unrelated cards — and the citation invariant
            # then pressures the model to cite one. Gated, the model honestly
            # says the library has nothing on it.
            candidates = apply_distance_threshold(candidates)
            cards = rerank_candidates(question, candidates, top_k=10)
        except Exception as e:
            logger.error(f"ask_brain retrieval failed: {e}")
            retrieval_errors += 1
            cards = []

        # 1b. Hybrid retrieval: add lexical keyword matches vector search may
        #     have missed (e.g. a word literally in a card's title, or a card
        #     with no embedding yet). Merge, keeping reranked vector results
        #     first, then keyword hits, deduped. Shared scan lives in search.py
        #     (same one the search bar's hybrid path uses).
        try:
            have = {c.get("id") for c in cards}
            cards = cards + keyword_scan_cards(uid, question, exclude_ids=have, limit=5)
        except Exception as e:
            logger.error(f"ask_brain keyword fallback failed: {e}")
            retrieval_errors += 1

        # 1c. Concept hint: the chip promised "what I saved on <concept>" — a
        #     lexical scan on the concept label itself catches cards whose
        #     concept never surfaces in title/summary (haystack includes
        #     concepts), independent of how the full question embeds. Merged
        #     IN FRONT: these are the provable concept carriers the chip is
        #     about (any already-discussed ones are demoted again below).
        if hints.get("concept"):
            try:
                have = {c.get("id") for c in cards}
                cards = keyword_scan_cards(
                    uid, hints["concept"], exclude_ids=have, limit=6) + cards
            except Exception as e:
                logger.error(f"ask_brain concept-hint scan failed: {e}")

        # 1d. Recency questions ("catch me up on this week's saves", "recap my
        #     recent saves") are time-anchored, not topic-anchored — pure
        #     semantic retrieval on such phrasing returns topically arbitrary
        #     cards. Merge the actually-newest cards IN FRONT (they're the
        #     ground truth the question is about); the prompt's saved-dates +
        #     today's-date rules let the model answer the time window honestly.
        #     Chips assert this explicitly (hints.recency); typed questions
        #     are matched by phrasing.
        try:
            if hints.get("recency") or is_recency_question(question):
                recents = recent_cards(uid, limit=12)
                recent_ids = {c.get("id") for c in recents}
                cards = recents + [c for c in cards if c.get("id") not in recent_ids]
        except Exception as e:
            logger.error(f"ask_brain recency retrieval failed: {e}")

        # 1e. Category hint: "my Tech saves" chips name a stored category
        #     verbatim — fetch that category's newest cards directly and put
        #     them FIRST (in front of the recency merge), so "key takeaways
        #     from my Tech saves" and "my latest Tech save" are grounded in
        #     actual Tech cards, not semantic near-misses.
        if hints.get("category"):
            try:
                cats = category_cards(uid, hints["category"], limit=10)
                cat_ids = {c.get("id") for c in cats}
                cards = cats + [c for c in cards if c.get("id") not in cat_ids]
            except Exception as e:
                logger.error(f"ask_brain category retrieval failed: {e}")

        # 1f. Exclusions ("What else did I save on X?"): the already-discussed
        #     cards must not dominate the answer again. Chips name them
        #     explicitly (hints.excludeTitles); typed "besides X" questions
        #     contribute their quoted titles. Matching cards are demoted to
        #     the BACK of context (still referenceable, never the headline)
        #     and the prompt gets an explicit already-discussed list.
        excluded_titles = list(hints.get("excludeTitles") or [])
        if excluded_titles or is_exclusion_question(question):
            if is_exclusion_question(question):
                excluded_titles += extract_quoted_phrases(question)
            try:
                cards, _ = demote_cards_by_titles(excluded_titles, cards)
            except Exception as e:
                logger.error(f"ask_brain exclusion demote failed: {e}")

        # 1g. Chip-anchor guarantee: EVERY anchored card (question-quoted title
        #     or hints.anchorTitles, minus exclusions) must reach the model at
        #     the front (inside the deep-content window below) — a chip we
        #     offered that then can't see its own card is a broken promise.
        #     Each anchor retrieval missed is rescued with its own lexical
        #     scan (a compare question carries TWO anchors; rescuing only when
        #     none matched would let one silently vanish).
        try:
            anchors = anchor_phrases_for(
                question, hints.get("anchorTitles"), excluded_titles)
            if anchors:
                for phrase in missing_title_phrases(anchors, cards):
                    have = {c.get("id") for c in cards}
                    cards = cards + keyword_scan_cards(
                        uid, phrase, exclude_ids=have, limit=2)
                cards, _ = pin_title_phrases(anchors, cards)
        except Exception as e:
            logger.error(f"ask_brain anchor pinning failed: {e}")

        # 1h. PRIVACY: strip effectively-private cards (own isPrivate flag or
        #     membership in a private collection) from the assembled context.
        #     The client keeps them out of feed/search/facets; Ask answers
        #     QUOTE card content, so the server must enforce the same promise —
        #     a private card must never reach the model or the citations.
        #     Runs after ALL merges so every retrieval source is covered, and
        #     before the cap so the context refills with public cards.
        try:
            cards = strip_private_cards(cards, private_collection_ids(uid))
        except Exception as e:
            # Belt-and-braces: never serve un-stripped context on a filter bug.
            logger.error(f"ask_brain privacy strip failed: {e}")
            cards = [c for c in cards if not c.get("isPrivate")]

        # 1i. Bound the assembled context (excluded cards sit at the back and
        #     fall off first).
        cards = cards[:ASK_CONTEXT_CARDS]

        # 1j. Retrieval infrastructure failed AND nothing was assembled → this
        #     is an outage, not an empty library. Refund and return a
        #     retryable error instead of "try saving a few links" (which is a
        #     lie to a user with hundreds of cards). A PARTIAL failure with
        #     usable cards still answers normally.
        if not cards and retrieval_errors >= 2:
            if charged:
                refund_quota(*charged)
                charged = None
            return _error_response(
                "Machina couldn't search your library right now. Please try again in a minute.",
                503, headers)

        # 2. Slim the cards to what the model needs (bounded tokens/cost).
        #    Every card carries its headline fields; the FIRST few additionally
        #    carry their stored deep content — detailedSummary, structured
        #    recipe ingredients/steps, video highlights, the takeaway — which
        #    is what lets "walk me through the steps" answer with the actual
        #    steps instead of re-paraphrasing the two-sentence summary. Bounded:
        #    deep fields ride only on the head of the list (where retrieval,
        #    recency, and pinning put the cards the answer will actually use)
        #    and detailedSummary is truncated.
        # Every text field is CAPPED before it can reach the prompt: card docs
        # can be up to 1 MB (and pre-cutover rules leave links world-writable),
        # so uncapped notes/summaries × 20 cards would be a token/cost blowup —
        # or a hard Gemini input error — from a single pathological card.
        def _cap_list(val, max_items, max_chars):
            if not isinstance(val, list):
                return []
            return [str(x)[:max_chars] for x in val[:max_items] if str(x).strip()]

        slim = []
        for i, c in enumerate(cards):
            notes = c.get("userNotes")
            s = {
                "id": c.get("id"),
                "title": str(c.get("title", "Untitled"))[:300],
                "summary": str(c.get("summary", ""))[:1500],
                "category": str(c.get("category", "General"))[:60],
                "tags": _cap_list(c.get("tags"), 15, 60),
                # Publisher/source so the model can answer questions that name it
                # (e.g. "the CNN fact-check") — it's not in the title/summary text.
                "sourceName": _card_source_name(c),
                "url": c.get("url"),
                # When it was saved (unix ms) — grounds "this week"/"recent" asks.
                "createdAt": c.get("createdAt"),
                # The user's own notes — passed through so the model can ground an
                # answer in what the user personally wrote about the card. Both the
                # legacy string and the multi-note array travel so ai_service's
                # _rag_card_block (via collect_notes_text) surfaces every note.
                "userNote": str(c.get("userNote") or "")[:800],
                "userNotes": [
                    {"text": str(n.get("text") or "")[:400]}
                    for n in (notes if isinstance(notes, list) else [])[:6]
                    if isinstance(n, dict) and str(n.get("text") or "").strip()
                ],
            }
            if i < ASK_DEEP_CARDS:
                detail = (c.get("detailedSummary") or "").strip()
                if detail:
                    s["detailedSummary"] = detail[:ASK_DETAIL_MAX_CHARS]
                takeaway = (c.get("actionableTakeaway") or "").strip()
                if takeaway:
                    s["actionableTakeaway"] = takeaway[:600]
                recipe = c.get("recipe")
                if isinstance(recipe, dict) and (
                    recipe.get("ingredients") or recipe.get("instructions")
                ):
                    s["recipe"] = {
                        "ingredients": _cap_list(recipe.get("ingredients"), 40, 200),
                        "instructions": _cap_list(recipe.get("instructions"), 40, 500),
                        **{k: str(recipe.get(k))[:60]
                           for k in ("servings", "prep_time", "cook_time")
                           if recipe.get(k)},
                    }
                highlights = _cap_list(c.get("videoHighlights"), 8, 200)
                if highlights:
                    s["videoHighlights"] = highlights
                speakers = _cap_list(c.get("speakers"), 6, 80)
                if speakers:
                    s["speakers"] = speakers
            slim.append(s)

        # 3. Generate a grounded answer with citations.
        ai = GeminiService()

        # 3a. Opt-in streaming branch (SSE). Same retrieval/slimming as above —
        #     only generation + response shape differ. The non-streaming JSON
        #     path below is left completely untouched.
        if want_stream:
            by_id = {c.get("id"): c for c in cards}

            def _event_stream():
                try:
                    for kind, payload in ai.answer_from_context_stream(
                            question, slim, history, excluded_titles=excluded_titles):
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
                        elif kind == "ungrounded":
                            # The answer couldn't be tied to any saved card. The
                            # prose is already streamed, so tell the UI to
                            # downgrade the "grounded" promise after the fact.
                            yield "data: " + json.dumps(
                                {"type": "ungrounded"}
                            ) + "\n\n"
                    yield "data: " + json.dumps({"type": "done"}) + "\n\n"
                except Exception as stream_exc:
                    # Mirror _server_error: log full detail, emit a sanitized
                    # message — but a DISTINGUISHABLE one (an AI-generation
                    # failure is not the same bug as anything else), record it
                    # durably, and refund the ask unit this request charged.
                    logger.error("ask_brain stream error: %s", stream_exc, exc_info=True)
                    _record_server_error("ask_brain (stream)", stream_exc, uid=uid)
                    if charged:
                        refund_quota(*charged)
                    msg = (
                        "Machina couldn't generate an answer right now. Please try again in a minute."
                        + _ask_diag(stream_exc)  # TEMPORARY diagnostic — remove once cause fixed
                        if isinstance(stream_exc, AnalysisError)
                        else "Internal server error"
                    )
                    yield "data: " + json.dumps(
                        {"type": "error", "error": msg}
                    ) + "\n\n"

            stream_headers = dict(headers)
            stream_headers["Cache-Control"] = "no-cache"
            return https_fn.Response(
                _event_stream(),
                status=200,
                headers=stream_headers,
                mimetype="text/event-stream",
            )

        # Synchronous path: 2 Gemini attempts (stay under the 60s budget, report 3.6).
        result = ai.answer_from_context(question, slim, history, attempts=2,
                                        excluded_titles=excluded_titles)

        # If the answer only succeeded after filter-probe isolation dropped
        # card(s) (Gemini prompt filter rejects their text — see
        # _drop_prompt_blocked_cards), leave a durable trail naming the poison
        # cards so the owner can find and fix/re-save them. Not an error — the
        # request SUCCEEDED — but server_errors is the queryable admin trail.
        dropped_card_ids = result.get("droppedCardIds") or []
        if dropped_card_ids:
            titles = {c.get("id"): str(c.get("title", ""))[:80] for c in cards}
            _record_server_error(
                "ask_brain (filter-blocked cards dropped)",
                Exception(", ".join(
                    f"{cid}: {titles.get(cid, '?')}" for cid in dropped_card_ids)),
                uid=uid)

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
                # True when the answer could not be tied to any saved card (even
                # after a stricter re-ask). The client downgrades the "grounded"
                # promise for this message instead of showing source chips.
                "ungrounded": bool(result.get("ungrounded", False)),
            }),
            status=200, headers=headers, mimetype='application/json'
        )

    except AnalysisError as e:
        # The Gemini answer call failed even after the in-service model
        # fallback. Refund the metered unit, record the failure durably, and
        # return a message that names the failing subsystem (still sanitized —
        # no exception detail crosses to the client).
        if charged:
            refund_quota(*charged)
        _record_server_error("ask_brain", e, uid=uid)
        return _server_error(
            headers, e,
            "Machina couldn't generate an answer right now. Please try again in a minute."
            + _ask_diag(e),  # TEMPORARY diagnostic — remove once cause fixed
            502,
        )
    except Exception as e:
        if charged:
            refund_quota(*charged)
        _record_server_error("ask_brain", e, uid=uid)
        return _server_error(headers, e)


@https_fn.on_request(max_instances=10)
def search_links_http(req: https_fn.Request) -> https_fn.Response:
    """HTTP twin of the `search_links` callable, for the native iOS shell.

    The Firebase callable transport issues a CORS preflight that the managed
    callable endpoint rejects from `capacitor://localhost`, so
    httpsCallable('search_links') silently fails inside the WKWebView — the exact
    failure that moved claim_workspace / ask_brain off the callable/Hosting paths.
    On the iPhone that meant the home search bar's semantic half never ran and it
    degraded to keyword-only. This endpoint sets CORS from the same
    `_allowed_origins()` allowlist (which includes `capacitor://localhost`),
    verifies the caller exactly like the other /api/* twins (bearer ID token,
    flag-aware fallback to the client-supplied uid pre-cutover via `_authed_uid`),
    enforces App Check + rate limits like its peers, and runs the identical
    `perform_search_logic` so results match the web callable exactly. Web keeps
    the callable.

    Body: { query: str, limit?: int, uid?: str }. Returns { links: [...] }.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("search", client_ip(req), headers)
    if rl:
        return rl

    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)

    try:
        data = req.get_json(silent=True) or {}

        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid) — same as the peer twins.
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err

        # Second rate-limit bucket, keyed per workspace uid (the IP bucket above
        # can't stop a single account rotating IPs). Only when a uid resolves.
        if uid:
            rl = _rate_limited("search-uid", uid, headers)
            if rl:
                return rl

        query_text = (data.get('query') or '').strip()
        if not query_text:
            return _error_response("query is required", 400, headers)
        if len(query_text) > MAX_QUESTION_LENGTH:
            return _error_response("query is too long", 400, headers)

        try:
            limit = int(data.get('limit', 10))
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))

        links = perform_hybrid_search(uid, query_text, limit)
        return https_fn.Response(
            json.dumps({"links": links}),
            status=200, headers=headers, mimetype='application/json',
        )
    except Exception as e:
        return _server_error(headers, e, "Search failed")


@https_fn.on_request(max_instances=10)
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


@https_fn.on_request(max_instances=10, timeout_sec=120)
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

    # (refund_uid, kind) of a quota unit charged by THIS request, so the 5xx
    # handler can refund it — a failed image save must not consume a unit.
    charged = None

    try:
        data = req.get_json()
        if not data:
            return _error_response("Invalid JSON body", 400, headers)

        image_url = data.get('imageUrl')
        image_b64 = data.get('imageBytes')
        existing_tags = _sanitize_tags(data.get('existingTags'))
        # Identity: prefer the verified ID token; falls back to the body uid only
        # while REQUIRE_AUTH is off (see _authed_uid).
        uid, auth_err = _authed_uid(req, headers, data.get('uid'))
        if auth_err:
            return auth_err

        # Validate the request has an image BEFORE charging quota — an imageless
        # (400) request must never burn a save unit.
        if not image_url and not image_b64:
            return _error_response("imageBytes or imageUrl is required", 400, headers)

        # Second rate-limit bucket, keyed per workspace uid (the IP bucket above
        # can't stop a single account rotating IPs). Only when a uid resolves.
        if uid:
            rl = _rate_limited("image-uid", uid, headers)
            if rl:
                return rl
            # Monthly save quota (an image is a save) — metered only after input
            # validation passes, so a rejected request doesn't consume a unit.
            q = _quota_blocked(uid, "saves", headers)
            if q:
                return q
            charged = (uid, "saves")

        # 1. Obtain image bytes.
        # Preferred path: the client sends the (already compressed) bytes inline,
        # so we skip the slow upload→re-download round trip entirely.
        if image_b64:
            # Reject an oversized payload by its ENCODED length before decoding,
            # so a hostile request can't force a large in-memory decode first.
            if len(image_b64) > MAX_IMAGE_B64_CHARS:
                return _error_response("Image is too large", 413, headers)
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
        # Synchronous path: 2 Gemini attempts (stay under the 60s budget, report 3.6).
        analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags, attempts=2)

        # 2b. Persist the image via the admin SDK (bypasses storage.rules, which
        # denies client writes). This is how screenshots are stored elsewhere
        # (see process_link_background). The public URL becomes the link's url
        # so the card can display the image later.
        stored_url = image_url or ""
        if image_b64 and uid:
            try:
                import uuid
                stored_url = _store_image(f"screenshots/{uid}/{uuid.uuid4().hex}.jpg", image_bytes, mime_type)
                # Don't log stored_url — the object path embeds the uid (phone #).
                logger.info(f"Stored screenshot for {_mask_uid(uid)}")
            except Exception as e:
                # Non-fatal: analysis still succeeds, card just won't show the image.
                logger.error(f"Failed to store screenshot: {e}")

        # 3. Construct Link Object
        link_data = _build_link_data(
            url=stored_url,
            title=analysis.get("title", "Image Analysis"),
            summary=analysis.get("summary", ""),
            detailed_summary=analysis.get("detailedSummary", ""),
            source_type="image",
            source_name=analysis.get("sourceName") or "Screenshot",
            original_title="Image Upload",
            estimated_read_time=1,
            analysis=analysis,
            confidence=0.9,
            key_entities=[],
        )

        return https_fn.Response(
            json.dumps({"success": True, "link": link_data}),
            status=200, headers=headers, mimetype='application/json'
        )

    except Exception as e:
        # Server-side failure → refund the save unit this request charged so a
        # failed image analysis doesn't burn quota.
        if charged:
            refund_quota(*charged)
        return _server_error(headers, e, "Image analysis failed")


# ─────────────────────────────────────────────
# Share Ingestion (iOS Share Extension / browser extension)
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


def _pending_url_doc(uid: str, url: str, *, card_id: Optional[str] = None,
                     body: str = "", source: str = "share") -> dict:
    """Build the ``pending_processing`` queue doc for a URL capture.

    Shared by the iOS share sheet (``source='share'``) and the durable
    web-capture flow (``source='web'``). When ``card_id`` is set the WEB CLIENT
    has ALREADY written a ``processing`` placeholder card into its library;
    ``process_link_background`` reuses that card (instead of creating a fresh
    one) so a slow scrape never loses the capture, never duplicates it, and never
    rides the synchronous ``/api/analyze`` request that used to time out at 60s.
    """
    doc = {
        "uid": uid,
        "url": url,
        "source": source,
        "body": body,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "attempts": 0,
    }
    if card_id:
        doc["cardId"] = card_id
    return doc


@https_fn.on_request(max_instances=10)
def share_ingest(req: https_fn.Request) -> https_fn.Response:
    """
    HTTP endpoint for the iOS Share Extension (and any share-sheet client).
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
        if token:
            uid = find_user_by_ingest_token(token)
            if not uid:
                return _error_response("Invalid ingest token", 403, headers)
            # Per-uid ceiling on the token path (report 3.3): the IP `share`
            # bucket above can't stop a leaked token spamming from rotating IPs.
            rl = _rate_limited("share-uid", uid, headers)
            if rl:
                return rl
        else:
            # Web / in-app client path (durable web capture — no share-extension
            # token). Authenticate like the other first-party endpoints: App Check
            # + (soft) ID token. This lets AddLinkForm enqueue a URL into the SAME
            # background pipeline the iOS share sheet uses, instead of blocking on
            # the synchronous /api/analyze request that could time out at 60s.
            if not _require_app_check(req, headers):
                return _error_response("App Check verification failed", 401, headers)
            uid, auth_err = _authed_uid(req, headers, data.get('uid'))
            if auth_err:
                return auth_err

        # Image share path: the native Share Extension can send a raw image
        # (base64) when the user shares a photo/screenshot rather than a link.
        # Store it, then queue an image job — the background pipeline already
        # knows how to analyse images (isImage=True).
        image_b64 = data.get('image') or data.get('imageBytes')
        if image_b64:
            try:
                import base64, uuid
                # Tolerate a "data:image/jpeg;base64,...." data-URI prefix.
                if ',' in image_b64 and image_b64.strip().startswith('data:'):
                    image_b64 = image_b64.split(',', 1)[1]
                # Reject by encoded length before decoding (see MAX_IMAGE_B64_CHARS)
                # so an oversized payload can't force a large decode first.
                if len(image_b64) > MAX_IMAGE_B64_CHARS:
                    return _error_response("Image is too large", 413, headers)
                image_bytes = base64.b64decode(image_b64)
            except Exception:
                return _error_response("Invalid image data", 400, headers)

            if not image_bytes:
                return _error_response("Empty image data", 400, headers)
            if len(image_bytes) > MAX_IMAGE_BYTES:
                return _error_response("Image is too large", 413, headers)

            # Monthly save quota — a shared image becomes a save; meter before we
            # store it and enqueue the paid background job.
            q = _quota_blocked(uid, "saves", headers)
            if q:
                return q

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
            logger.info(f"Share ingest queued image for {_mask_uid(uid)}")
            return https_fn.Response(
                json.dumps({"success": True, "queued": True, "id": process_ref.id, "image": True}),
                status=200, headers=headers, mimetype='application/json'
            )

        url = _extract_url(data.get('url'), data.get('text'), data.get('shared'))
        if not url:
            # NOTE PATH — shared plain text with no URL is a first-class note card,
            # not an error. Analyze the text directly (no scraping) and write the
            # card straight into the user's library; the embedding trigger fires on
            # create and vectorizes it. (The web "Note" tab hits /api/analyze and
            # lets the client save — here there is no client, so we persist here.)
            note_text = (data.get('text') or data.get('shared') or data.get('note') or '').strip()
            if not note_text:
                return _error_response("No URL or text found in shared content", 400, headers)
            # Monthly save quota (a note is a save) — meter before the paid
            # Gemini analysis + write below.
            q = _quota_blocked(uid, "saves", headers)
            if q:
                return q
            note_text = note_text[:MAX_NOTE_LENGTH]
            try:
                ai = GeminiService()
                analysis = ai.analyze_text(note_text, existing_tags=get_user_tags(uid))
                link_data = _note_link_data(analysis, note_text)
                # A fresh note has no vector yet — flag it so sync_link_embedding
                # (which fires on this create) generates one.
                link_data["needsEmbedding"] = True
                card_ref = get_db().collection('users').document(uid).collection('links').document()
                card_ref.set(link_data)
                logger.info(f"Share ingest saved note for {_mask_uid(uid)}")
                return https_fn.Response(
                    json.dumps({"success": True, "saved": True, "id": card_ref.id, "note": True}),
                    status=200, headers=headers, mimetype='application/json'
                )
            except Exception as e:
                logger.error(f"Share ingest note failed: {e}", exc_info=True)
                return _error_response("Failed to analyze note", 500, headers)

        # Dedup: skip if already saved or already queued for this user.
        #
        # EXCEPTION — the durable web path supplies a `cardId`: AddLinkForm has
        # already run its own pre-write dedup AND written a `processing`
        # placeholder card at this exact URL. Re-checking link_exists here would
        # match that very placeholder and wrongly drop a legitimate new save, so
        # when a cardId is present we skip the dedup and let the trigger finalize
        # the client's card in place.
        card_id = data.get('cardId')
        if not card_id and (link_exists_for_url(uid, url) or pending_exists_for_url(uid, url)):
            logger.info(f"Share ingest skipped (duplicate): {url}")
            return https_fn.Response(
                json.dumps({"success": True, "duplicate": True, "url": url}),
                status=200, headers=headers, mimetype='application/json'
            )

        # Monthly save quota — a genuinely new (non-duplicate) URL becomes a save;
        # meter before enqueuing the paid background job. Duplicates returned
        # above are NOT counted.
        q = _quota_blocked(uid, "saves", headers)
        if q:
            return q

        db = get_db()
        process_ref = db.collection('pending_processing').document()
        process_ref.set(_pending_url_doc(
            uid, url, card_id=card_id, body=data.get('note', ''),
            source="web" if card_id else "share",
        ))

        logger.info(f"Share ingest queued: {url} for {_mask_uid(uid)}")
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
    (generating one on first use). Used by Settings to configure the browser extension.
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
# link-preview crawlers (iMessage, Slack, X…) per-card OpenGraph tags —
# they don't run JS, so every shared link previewed as the generic app. These
# functions OWN the /s (single card) and /c (collection) routes via Hosting
# rewrites and return real HTML: correct og:title/description/image for crawlers,
# and a readable card for humans with no JS required.


# min_instances=1 keeps ONE instance warm. The card-share flow (web/lib/
# useLinkActions.handleShareCard) opens the OS share sheet immediately and
# publishes this snapshot in parallel, so the publish must land before the
# messaging app's link-preview crawler fetches /s?id= (which happens a few
# seconds later, after the user picks a recipient). A cold Python start (~3-6s)
# lost that race and the crawler cached an empty preview. Warm ⇒ sub-second
# publish ⇒ the snapshot is live well before the crawl. Only the publish path
# needs warming: /s (share_page) can cold-start freely — crawlers wait for it,
# and previews rendered fine while it was cold; the race was purely the write.
@https_fn.on_request(min_instances=1)
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
    # Per-IP rate limit + App Check BEFORE any work — the publish surface writes
    # admin-SDK snapshots to a world-readable collection, so gate it like the
    # paid endpoints (the per-uid `publish` bucket below is bypassable by a
    # rotating client-supplied uid pre-cutover).
    rl = _rate_limited("publish-ip", client_ip(req), headers)
    if rl:
        return rl
    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)
    # Serialized-payload cap (report 3.4): reject an oversized client snapshot
    # before parsing/storing it. 413 with a plain message.
    raw = req.get_data(cache=True) or b""
    if len(raw) > MAX_PUBLISH_BYTES:
        return _error_response("Share payload too large", 413, headers)
    try:
        data = req.get_json(silent=True) or {}
    except Exception:
        data = {}
    uid, auth_err = _authed_uid(req, headers, data.get("uid"))
    if auth_err:
        return auth_err
    # Per-uid publish rate bucket (report 3.4) — bound how fast one account can
    # create/overwrite public snapshots.
    if uid:
        rl = _rate_limited("publish", uid, headers)
        if rl:
            return rl
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
    # Per-IP rate limit + App Check (unpublish had neither) — same world-readable
    # write surface as publish; gate it identically.
    rl = _rate_limited("publish-ip", client_ip(req), headers)
    if rl:
        return rl
    if not _require_app_check(req, headers):
        return _error_response("App Check verification failed", 401, headers)
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
# Background Processing
# ─────────────────────────────────────────────

def log_to_firestore(task_id: str, message: str, level: str = "INFO", data: dict = None):
    """Log a heartbeat to Firestore for visibility."""
    try:
        db = get_db()
        now = datetime.now(timezone.utc)
        log_entry = {
            "taskId": task_id,
            "message": message,
            "level": level,
            "timestamp": now.isoformat(),
            # A real datetime → stored as a Firestore Timestamp, so a Firestore TTL
            # policy on this field can auto-expire the doc (TTL only works on
            # Timestamp fields, not the ISO `timestamp` string). The janitor prune
            # also matches on it (expireAt <= now) — see run_processing_janitor.
            "expireAt": now + timedelta(days=14),
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
    timeout_sec=300,
    max_instances=10,
)
def process_link_background(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """
    Background Task: Scrapes URL, runs AI analysis, and saves final link.
    """
    # Heavy/external deps imported lazily (see top-of-file note).
    from scraper import scrape_url
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
    original_body = data.get("body")

    log_to_firestore(task_id, "Background processing started", data={"url": url, "uid": uid, "isImage": is_image})

    # The URL we were handed before any reassignment (the image path rewrites `url`
    # to the stored Storage URL below). Kept so a FAILED card records the original.
    original_url = url

    # M3 — durable capture lifecycle. A captured item becomes a visible
    # "processing" card the instant work is queued, then updates THIS SAME card to
    # ready (on success) or a retryable "failed" state (on error). A capture is
    # therefore never invisible and never silently dropped, even if analysis fails.
    #
    # WEB durable path (Weakness #5): AddLinkForm has ALREADY written the
    # `processing` placeholder card itself (instant feed feedback, no synchronous
    # 60s wait) and passes its `cardId` through the queue doc — reuse that card so
    # we neither duplicate it nor overwrite the client's createdAt/ordering.
    # SHARE path: no cardId, so we create the placeholder card here.
    existing_card_id = data.get("cardId")
    if existing_card_id:
        card_ref = get_db().collection('users').document(uid).collection('links').document(existing_card_id)
        card_id = existing_card_id
    else:
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
                # When processing began — the janitor uses this (not createdAt,
                # which a retry preserves) to age out cards stuck in `processing`.
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

            # Route through scraper.safe_get (SSRF guard + per-redirect
            # re-validation): the pending_processing queue doc is attacker-
            # influenceable, so a hostile imageUrl must not be able to make us
            # fetch an internal/metadata endpoint. Normal share-ingest images are
            # public Firebase Storage URLs, which pass the guard fine.
            from scraper import safe_get
            img_response = safe_get(url, timeout=30)
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
        # Rich v2 recipe (see _embedding_text_from_analysis) — fold in
        # detailedSummary/takeaway/concepts so the card is findable by its
        # details, not just its headline.
        embedding_text = _embedding_text_from_analysis(analysis)
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

        link_data = _build_link_data(
            url=url,
            title=final_title,
            summary=analysis.get("summary", "No summary available"),
            detailed_summary=analysis.get("detailedSummary"),
            source_type="youtube" if is_youtube else ("image" if is_image else "web"),
            source_name=scraped.get("source_name") or analysis.get("sourceName") or ("Screenshot" if is_image else None),
            original_title=scraped.get("title", "Image Upload" if is_image else ""),
            estimated_read_time=estimated_time,
            analysis=analysis,
            related_links=related_links,
        )

        # Embedding: only store a real Vector. If the embed failed (None), omit
        # the field and flag the card so a backfill repairs it later — never
        # write a poisoned near-zero vector that looks embedded but isn't.
        if embedding:
            link_data["embedding_vector"] = Vector(embedding)
            # Stamp the recipe version so the trigger/backfill know this vector is
            # already on the current (v2) recipe and skip re-embedding it.
            link_data["embeddingVersion"] = EMBED_TEXT_VERSION
        else:
            link_data["needsEmbedding"] = True

        # Add YouTube-specific metadata
        if is_youtube:
            _apply_youtube_metadata(link_data, yt_meta, analysis, estimated_time)
        elif not is_image:
            # X/Instagram photo posts: show the cover image we read for vision.
            # task_id keys the blob so a retry reuses the same path (idempotent).
            _apply_post_thumbnail(link_data, scraped, uid, task_id)

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

        logger.info(f"Processing complete for {data.get('source', 'unknown')} item")

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


# ─────────────────────────────────────────────
# Scheduled Functions
# ─────────────────────────────────────────────

@scheduler_fn.on_schedule(schedule="every 2 minutes", max_instances=1)
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

    # Bounded task_logs pruning (report 3.7). task_logs is a TOP-LEVEL collection
    # of heartbeat docs written by log_to_firestore. New docs carry a Timestamp
    # `expireAt` (TTL-policy compatible); pre-existing docs only have the ISO-8601
    # `timestamp` string. Age out docs older than 14 days from BOTH sources so the
    # existing backlog still drains while new docs prune (and/or TTL-expire) on the
    # Timestamp field. Each query is bounded; deletes go through a single batch
    # commit (<= 200 ops) instead of a round trip per doc.
    report["logs_pruned"] = 0
    now_dt = datetime.now(timezone.utc)
    cutoff_dt = now_dt - timedelta(days=14)
    stale_refs = []
    seen_ids = set()

    # Primary: Timestamp `expireAt` <= now (what a TTL policy keys on too).
    try:
        for doc in db.collection("task_logs").where(
            "expireAt", "<=", now_dt
        ).limit(200).stream():
            if doc.id not in seen_ids:
                seen_ids.add(doc.id)
                stale_refs.append(doc.reference)
    except Exception as e:
        logger.error(f"task_logs expireAt prune query failed: {e}")
        report["errors"].append(f"task_logs expireAt: {e}")

    # Fallback: legacy docs with no expireAt — match on the ISO `timestamp` string
    # (ISO-8601 UTC sorts lexicographically, so a string range query is correct).
    # Bounded to whatever batch headroom remains (<= 200 total ops per commit).
    remaining = max(0, 200 - len(stale_refs))
    if remaining:
        try:
            cutoff_iso = cutoff_dt.isoformat()
            for doc in db.collection("task_logs").where(
                "timestamp", "<", cutoff_iso
            ).limit(remaining).stream():
                if doc.id not in seen_ids:
                    seen_ids.add(doc.id)
                    stale_refs.append(doc.reference)
        except Exception as e:
            logger.error(f"task_logs timestamp prune query failed: {e}")
            report["errors"].append(f"task_logs timestamp: {e}")

    if stale_refs:
        try:
            batch = db.batch()
            for ref in stale_refs:
                batch.delete(ref)
            batch.commit()
            report["logs_pruned"] = len(stale_refs)
        except Exception as e:
            logger.error(f"task_logs batch delete failed: {e}")
            report["errors"].append(f"task_logs delete: {e}")

    # server_errors pruning — same 14-day policy. Every doc carries a Timestamp
    # `expireAt` from birth (no legacy fallback needed). Bounded + one batch.
    report["server_errors_pruned"] = 0
    try:
        err_refs = [
            doc.reference
            for doc in db.collection("server_errors").where(
                "expireAt", "<=", now_dt
            ).limit(200).stream()
        ]
        if err_refs:
            batch = db.batch()
            for ref in err_refs:
                batch.delete(ref)
            batch.commit()
            report["server_errors_pruned"] = len(err_refs)
    except Exception as e:
        logger.error(f"server_errors prune failed: {e}")
        report["errors"].append(f"server_errors: {e}")

    if report["failed_out"] or report["logs_pruned"] or report["server_errors_pruned"]:
        logger.info(f"Processing janitor: {report}")
    return report


@scheduler_fn.on_schedule(schedule="every 5 minutes", max_instances=1)
def sweep_stuck_processing(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 5 min: age out captures stuck in `processing` (see run_processing_janitor)."""
    run_processing_janitor()


@https_fn.on_request(max_instances=1)
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


@https_fn.on_request(max_instances=1)
def force_check_reminders(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for reminder check to debug without waiting for schedule.

    Optional ?coerce=1 runs a bounded one-time repair pass FIRST that rewrites
    legacy non-int nextReminderAt values (Firestore Timestamp / string) to int ms
    so they stop being stranded by the '<=' int filter — see
    reminder_service.coerce_pending_reminder_times. Its counts are returned under
    the "coercion" key alongside the normal run report."""
    guard = _require_admin(req)
    if guard:
        return guard
    try:
        result = {}
        coerce = (req.args.get("coerce") or "").lower() in ("1", "true", "yes")
        if coerce:
            from reminder_service import coerce_pending_reminder_times
            result["coercion"] = coerce_pending_reminder_times()
        result["check"] = run_reminder_check()
        return https_fn.Response(json.dumps(result, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual trigger failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)


# ─────────────────────────────────────────────
# Curated Digest (push)
# ─────────────────────────────────────────────

# Cadence MUST match DIGEST_CADENCE_MINUTES in digest_service.py — is_due() uses
# it as the match window, so a mismatch means missed or double-checked sends.
# Every 15 min keeps the user-doc scan cost at 1/3 of the old 5-min cadence
# (it grows linearly with user count); delivery lands within one tick of the
# chosen digest_hour:digest_minute, and the daily 20h / weekly 6d dup-guard
# prevents double-sends.
@scheduler_fn.on_schedule(schedule="every 15 minutes", max_instances=1)
def send_digests(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 15 min: deliver curated digests to users whose schedule is due now."""
    from digest_service import run_digest_check
    run_digest_check()


@https_fn.on_request(max_instances=1)
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
    if overrides:
        user_data.setdefault("settings", {})
        user_data["settings"] = {**user_data.get("settings", {}), **overrides}

    try:
        result = build_and_send_digest(uid, user_data, force=True)
        return result
    except Exception as e:
        logger.error(f"send_digest_now failed for {_mask_uid(uid)}: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))
