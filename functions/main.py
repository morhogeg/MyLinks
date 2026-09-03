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
from google.cloud.firestore_v1.base_query import FieldFilter
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
from log_safe import mask_uid
from models import LinkStatus, ReminderStatus
from ai_service import GeminiService, AnalysisError
from link_service import (
    save_link_to_firestore, get_user_tags, get_user_vocabulary, is_hebrew,
    canonical_category, run_category_migration,
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
    resolve_followup, conversation_language,
    pin_cards_by_ids, cards_by_ids,
)
from rate_limit import check_rate_limit, client_ip, RateLimitBackendError
# Monthly per-user soft quotas (report 3.2). Imports only db + stdlib (no cycle).
from quota import meter as meter_quota, refund_quota, quota_message
from entitlement import (
    plan_for, entitlement_summary, sync_from_revenuecat, resolve_workspace_for_app_user,
    rc_configured, RevenueCatError, run_trial_nudges,
)
# Public share-page subsystem (renderers + publish/unpublish logic). The three
# HTTP endpoints (publish_share_http, unpublish_share_http, share_page) stay in
# this file — Firebase discovers deployables by scanning main.py — and call into
# these helpers. share_service imports only db + stdlib (never main → no cycle).
from share_service import (
    _publish_share_logic, _unpublish_share_logic,
    _render_shared_card, _render_shared_collection, _render_shared_answer,
    _share_not_found_html,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API origin — the Firebase Hosting host whose rewrites reach these functions.
# Used for the share-extension ingest endpoint and the CORS allowlist, both of
# which are machine-to-machine, so the unbranded project host is fine here.
APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")

# Public BRAND origin — the only one a person ever reads. Kept separate from
# APP_URL on purpose: pointing the ingest endpoint at the brand domain would add
# a Vercel proxy hop to the share extension's critical path for no gain, while
# leaving user-visible links on APP_URL puts `secondbrain-…` in front of every
# share recipient (BRANDING D-3). Mirrors `share_service.WEB_URL`.
WEB_URL = os.environ.get("WEB_URL", "https://mymachina.app")

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
        # The desktop web app is served from the brand domain, so its /api/*
        # calls arrive with that Origin (Vercel forwards it through the rewrite).
        WEB_URL,
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


# Sentinel so a memoized `None` ("checked, no valid token") is distinguishable
# from "not checked yet". A plain `None` default would re-verify every time for
# exactly the anonymous callers we most want to keep cheap.
_BEARER_UNSET = object()


def _verify_bearer(req):
    """Verify the Firebase ID token from the Authorization: Bearer header.

    Returns the decoded token dict on success, or None if the header is missing
    or the token is invalid/expired. The caller derives the user identity from
    the returned token — never from the request body.

    Memoized per request. `_rate_limit_identity` now needs the caller's identity
    BEFORE the body is parsed, and `_authed_uid` verifies again a few lines
    later; without this the token would be verified twice per request and the
    "verification failed" warning logged twice for one bad token.
    """
    cached = getattr(req, "_machina_bearer", _BEARER_UNSET)
    if cached is not _BEARER_UNSET:
        return cached

    decoded = _verify_bearer_uncached(req)
    try:
        req._machina_bearer = decoded
    except Exception:
        # Some request implementations don't accept new attributes. Caching is
        # an optimization, never a correctness requirement — fall through.
        pass
    return decoded


def _verify_bearer_uncached(req):
    """The actual verification. Call `_verify_bearer`, not this."""
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


# The masker now lives in `log_safe` so the service modules (digest, reminder,
# graph, search, link) can share ONE implementation without importing main.py —
# they were logging raw uids, i.e. phone numbers (AUDIT.md H-4 residue). Kept
# under the original private name so main.py's call sites read unchanged.
_mask_uid = mask_uid


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
# Multi-screenshot cards: how many ordered images may make up ONE card (e.g. the
# slides of a screenshotted carousel). 5 covers the bulk of real text carousels;
# a request above the cap is REJECTED with a clear message, never silently
# trimmed — silent truncation is the exact failure this feature exists to kill.
MAX_CARD_IMAGES = 5


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
# NAMING NOTE (S-12 fix, 2026-07-27): the bare buckets below ("analyze", "chat",
# "share", "publish-ip", …) are the PRE-BODY gate. They used to be keyed on the
# client IP, which is where the name comes from; they are now keyed by
# `_rate_limit_identity(req)` — the verified auth uid when the caller presents a
# bearer token, the IP only when they don't. The `-uid` buckets are unchanged and
# are still keyed on the resolved WORKSPACE uid after the body is parsed. The
# names are kept as-is deliberately: renaming them would change every Firestore
# key a second time for no behavioural gain.
_RATE_LIMITS = {
    "analyze": (30, 3600, False),
    "analyze-uid": (30, 3600, False),
    "image": (30, 3600, False),
    "image-uid": (30, 3600, False),
    "chat": (60, 3600, False),
    "chat-uid": (60, 3600, False),
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
    # Entitlement reads (plan + quota meter) fire on launch, foreground, and
    # after each ask; the sync endpoint only after a purchase/restore. Cheap
    # Firestore reads, so fail open.
    "entitlement": (240, 3600, True),
    # Home search bar (native HTTP twin). Debounced client-side, but a user can
    # still fire many queries in a session, so keep the ceilings generous. Mirror
    # the IP + uid double-bucket the paid endpoints use (an embedding call per
    # query has a small cost).
    "search": (120, 3600, False),
    "search-uid": (120, 3600, False),
    # Warmup pings (search_links_http `{warmup: true}`): fired when the search
    # bar OPENS so the cold start runs while the user types. A no-op 204 —
    # costs an invocation, nothing else — on its OWN bucket so pings never eat
    # real search quota. Per-IP, fail closed (public unauthenticated surface).
    "search-warm": (120, 3600, False),
    # Unauthenticated crash reports (client_error_http). Per-IP only — a caller
    # with no workspace has no uid to bucket on — and fail CLOSED, because this
    # is a public write surface. The client already caps itself at 20 reports
    # per session and de-dupes identical messages, so 30/hr is generous for a
    # real device and tight for anything else.
    "client-error": (30, 3600, False),
}

# Input caps for client-supplied fields that flow into the Gemini prompt, so a
# hostile/oversized payload can't inflate prompt cost or widen the injection
# surface. Enforced by _sanitize_history / _sanitize_tags below.
MAX_HISTORY_ITEMS = 6            # ai_service._build_rag_prompt uses the last 6 turns
MAX_HISTORY_CONTENT_LENGTH = 4000
# Cards the recent answers cited, sent by the client so a follow-up can be
# grounded in what was actually on screen. Each one is a Firestore read, so the
# count is bounded; a couple of answers' worth of citations is the useful window.
MAX_CONTEXT_IDS = 6
MAX_CONTEXT_ID_LENGTH = 200
MAX_TAGS = 50
MAX_TAG_LENGTH = 60
# Client-supplied `existingCategories` — the category twin of the tag caps
# above. Mirrors link_service.MAX_PROMPT_CATEGORIES (the server-derived
# list); keep the two in step so both paths feed the prompt the same shape.
MAX_CATEGORIES = 20
MAX_CATEGORY_LENGTH = 40

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
# Exclusive anchor ids (graph "ask about these"): matches ASK_CONTEXT_CARDS —
# the whole point is that the named set IS the context.
MAX_HINT_IDS = 20


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
        turn = {"role": role, "content": content[:MAX_HISTORY_CONTENT_LENGTH]}
        # Chip-composed turns are marked so the answer-language decision can
        # ignore them (their wording is Machina's boilerplate, not the user's —
        # see search.conversation_language). Absent on older clients, which the
        # helper falls back for.
        if item.get("generated"):
            turn["generated"] = True
        cleaned.append(turn)
    return cleaned


def _sanitize_context_ids(value) -> list:
    """Clamp the client's `contextIds` — the card ids the recent answers in this
    conversation actually CITED, i.e. what "this"/"it"/"that" refers to.

    These become Firestore document reads and steer the model's context, so
    they are clamped like every other client input: strings only, deduped,
    length-capped (Firestore ids are short), and bounded in count. Anything
    malformed is dropped rather than errored — context ids only ever improve a
    request, and a request without them still answers.
    """
    if not isinstance(value, list):
        return []
    out, seen = [], set()
    for item in value[:MAX_CONTEXT_IDS * 2]:
        if not isinstance(item, str):
            continue
        cid = item.strip()[:MAX_CONTEXT_ID_LENGTH]
        if not cid or cid in seen:
            continue
        seen.add(cid)
        out.append(cid)
        if len(out) >= MAX_CONTEXT_IDS:
            break
    return out


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
    # Exact card ids the question is about (graph "ask about these"). With
    # `exclusive` they REPLACE retrieval as the whole context, so the model
    # can neither miscount the set nor cite a topic-matched stranger.
    # `exclusive` is only meaningful alongside ids.
    v = hints.get("anchorIds")
    if isinstance(v, list):
        clean = [
            s.strip()[:128]
            for s in v[:MAX_HINT_IDS] if isinstance(s, str) and s.strip()
        ]
        if clean:
            out["anchorIds"] = clean
            if hints.get("exclusive"):
                out["exclusive"] = True
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


def _sanitize_categories(categories) -> list:
    """Validate client-supplied existingCategories before they reach the prompt.

    Exact twin of `_sanitize_tags`: the values are concatenated into the analysis
    prompt, so cap the count and per-item length, coerce to str, drop empties,
    and treat a non-list as absent. See SYSTEM_PROMPT rule 6 (category reuse).
    """
    if not isinstance(categories, list):
        return []
    cleaned = []
    for c in categories[:MAX_CATEGORIES]:
        s = (c if isinstance(c, str) else str(c)).strip()[:MAX_CATEGORY_LENGTH]
        if s:
            cleaned.append(s)
    return cleaned


def _rate_limit_identity(req) -> str:
    """Identity for the pre-body rate-limit gate: per USER when we know who the
    caller is, per IP only when we don't.

    WHY THIS IS NOT JUST `client_ip(req)` (audit S-12). Several surfaces reach
    these endpoints through a SERVER-SIDE hop, and `client_ip` deliberately
    returns the LAST `X-Forwarded-For` entry because that is the only one a
    caller cannot forge (`rate_limit.py:74-87`). For a proxied request that last
    hop is the PROXY's egress IP — identical for every user behind it.

    `/api/chat` is the proven case: it is deliberately NOT a `vercel.json`
    rewrite (SSE needs a streaming pass-through), so `web/app/api/chat/route.ts`
    fetches the Cloud Function server-side from Vercel. Every desktop-web Ask
    therefore arrived wearing Vercel's egress IP, which turned the fail-CLOSED
    60/hr `chat` bucket into ONE ceiling shared by the entire web user base —
    and let a single script lock out every web user. The `vercel.json` rewrites
    (`analyze`, `image`, `share`, …) add a Firebase Hosting hop with the same
    shape; that chain could not be verified from a cloud sandbox, so treat it as
    likely-affected rather than proven, which is another reason to fix this at
    the identity level rather than per-endpoint.

    Keying on the verified auth uid when a bearer token is present fixes it
    without weakening anything: anonymous callers are still bounded per IP,
    identified ones are bounded per ACCOUNT (harder to rotate than an IP), and
    nobody is left unbounded. The web client already sends `authHeaders()` on
    these calls and the Vercel route forwards `Authorization`, so this takes
    effect today — it does not wait on the auth cutover.

    Keys are namespaced (`auth:` / `ip:`) so an auth uid can never collide with
    an IP string. NOTE: this changes existing Firestore keys (`chat:1.2.3.4` →
    `chat:ip:1.2.3.4`), so every fixed window resets once on deploy. Harmless —
    the worst case is one extra window's allowance for one hour.
    """
    decoded = _verify_bearer(req)
    auth_uid = decoded.get("uid") if decoded else None
    return f"auth:{auth_uid}" if auth_uid else f"ip:{client_ip(req)}"


def _rate_limited(bucket: str, identity: str, headers: dict = None):
    """Return a 429 Response if `identity` exceeds the bucket's limit, else None.

    The bucket's limit, window, AND fail-open policy all come from the single
    _RATE_LIMITS row — no parallel fail-closed set to keep in sync (report 3.5).
    """
    limit, window, fail_open = _RATE_LIMITS[bucket]
    try:
        allowed = check_rate_limit(f"{bucket}:{identity}", limit, window, fail_open=fail_open)
    except RateLimitBackendError as e:
        # The limiter's OWN Firestore check failed — still refuse (fail-closed
        # buckets keep their cost ceiling) but say the truth: 503, not 429.
        # During the 2026-08-26 outage the old 429 sent the investigation
        # chasing rate limits while the database was down (§9 round 15).
        logger.error("Rate limiter backend error on bucket %s", bucket)
        _record_server_error("rate_limiter", e)
        return _error_response(
            "Service temporarily unavailable. Please try again in a minute.",
            503, headers)
    if not allowed:
        # Log the bucket only — the identity is an IP or workspace uid (PII).
        logger.warning("Rate limit exceeded: %s", bucket)
        return _error_response("Too many requests. Please slow down.", 429, headers)
    return None


# Serialized-payload cap for publish_share_http (report 3.4). A share snapshot is
# a single card or a small curated collection; 200 KB is generous headroom while
# blocking large-doc spam / storage abuse. Over-cap → 413.
MAX_PUBLISH_BYTES = 200 * 1024

def _quota_blocked(uid: str, kind: str, headers: dict = None, plan: str = None):
    """Meter one `kind` unit against `uid`'s monthly quota; 429 Response if over.

    Plan-aware (Machina Pro): the limit is the workspace's plan's, resolved
    here from the entitlement doc unless the caller already has it (`plan`).
    Soft cap (report 3.2): a None uid (pre-cutover soft auth, nothing to meter)
    or any Firestore error fails OPEN inside quota.meter, so this only ever
    blocks a real, over-limit workspace — the rate limiter (fail-closed) and
    max_instances are the hard backstops. Increments the counter as a side
    effect when the call is allowed, so callers invoke it exactly once, before
    the paid work / enqueue.

    The 429 body carries `upgrade`/`kind`/`used`/`limit` next to `error` so the
    client can open the paywall (free plan) instead of a plain error toast.
    """
    if not uid:
        return None
    if plan is None:
        plan = plan_for(uid)
    r = meter_quota(uid, kind, plan=plan)
    if not r["ok"]:
        logger.warning("Monthly quota exceeded (kind=%s plan=%s)", kind, plan)
        body = {
            "success": False,
            "error": quota_message(kind, plan, r["limit"]),
            "upgrade": plan != "pro",
            "kind": kind,
            "used": r["used"],
            "limit": r["limit"],
        }
        return https_fn.Response(
            json.dumps(body), status=429, headers=headers or _cors_headers(),
            mimetype='application/json',
        )
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


# NOTE: `_append_capture_note` was removed 2026-07-27 at the owner's request.
# It appended a "⚠️ the full text couldn't be read, try a screenshot" blockquote
# to detailedSummary whenever `scraped['truncated']` was set (Facebook's
# truncated og:description, social-teaser fallbacks, login walls, PDFs). The
# owner does not want it on cards. The scraper still SETS `truncated` — it is
# read elsewhere and is worth keeping as a signal — nothing appends user-facing
# text from it any more.


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


def _analyze_scraped(ai, scraped: dict, existing_tags: list, attempts: int = None,
                     existing_categories: list = None, pro: bool = True):
    """Run the right analysis for scraped content.

    For YouTube, use Gemini native video ingestion; if that fails (private /
    unlisted / over-quota / region-blocked), fall back to an honest
    metadata-only text analysis rather than fabricating a summary. Video
    ingestion is a Machina Pro feature: a free workspace (`pro=False`) gets the
    same metadata-only card without the model ever watching the video. The
    caller stamps `proFeature: 'youtube'` on the link doc so the client can say
    so in one line; the decision itself stays here, next to the cost.

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
        elif not pro:
            logger.info("YouTube video ingestion skipped for a free workspace (Pro feature); metadata-only card")
        elif watch_url:
            try:
                analysis = ai.analyze_youtube(watch_url, existing_tags=existing_tags,
                                              existing_categories=existing_categories, **kw)
                # The probed duration is ground truth; the model's is an estimate.
                if isinstance(analysis, dict) and length_seconds:
                    analysis["videoDurationMinutes"] = max(1, (length_seconds + 59) // 60)
                return analysis
            except AnalysisError as e:
                logger.warning(f"Native YouTube analysis failed, using metadata-only fallback: {e}")
        # Fallback: analyze the lightweight oEmbed metadata text honestly.
        analysis = ai.analyze_text(scraped.get("text") or scraped.get("html", ""),
                                   existing_tags=existing_tags,
                                   existing_categories=existing_categories, **kw)
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
                existing_categories=existing_categories,
                content_type=content_type,
                # Instagram marks its cover as image-first (screenshot carrying the
                # real text) → read at higher res + trust the image over the
                # caption. X leaves this unset: text stays primary, image low-res.
                image_is_primary=bool(scraped.get("image_primary")),
                # X post whose own words are thin: text stays primary, but the
                # photo is carrying the content, so read it at MEDIUM instead of
                # LOW — an unreadable screenshot is what the model fills in from
                # training knowledge.
                image_text_dense=bool(scraped.get("image_text_likely")),
                **kw)
            # Keep the cover image we just read so the card can SHOW it, not just
            # summarize it. The caller persists a downscaled copy (never the
            # expiring social CDN URL). First image only — the card header is one.
            scraped["_post_thumbnail"] = post_images[0]
            return analysis
        except AnalysisError as e:
            logger.warning(f"Multimodal post analysis failed, using text-only fallback: {e}")

    analysis = ai.analyze_text(content_text,
                               existing_tags=existing_tags, content_type=content_type,
                               existing_categories=existing_categories, **kw)
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


# Hosts where the app itself legitimately IS the publisher (its own web pages).
# Only on these may a "Machina"-containing sourceName survive the sanitizer.
_MACHINA_HOSTS = ("secondbrain-app-94da2.web.app", "my-links-sable.vercel.app")


def _prettified_host(url: str) -> str:
    """Registrable host of a URL with a leading ``www.`` stripped, or ""."""
    from urllib.parse import urlparse
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _ground_source_name(candidate, url, fallback=None):
    """Reject an assistant/app name hallucinated as the publisher.

    Gemini seeds its own name ("Machina") from the system prompt and emits it
    as the publisher when the real one is unclear. Any candidate containing
    "machina" is rejected — unless the link genuinely lives on a Machina host —
    and replaced with the prettified URL host (or ``fallback`` when no host is
    available, e.g. images keep "Screenshot"). A clean candidate passes through.
    """
    if candidate and "machina" in str(candidate).lower():
        if _prettified_host(url) in _MACHINA_HOSTS:
            return candidate
        return _prettified_host(url) or fallback
    return candidate or fallback


def _pick_source_name(scraped_name, model_name, url):
    """Choose the publisher name, preferring deterministic extraction.

    For LinkedIn the model's guess is NEVER used. Company-page posts carry no
    author in their meta tags — their og:title is the post's own opening line —
    so Gemini fills the gap with that sentence and it lands in the byline
    ("Introducing Three New Certifica…" instead of "Claude for Business").
    The scraper already falls back to the URL slug, which is authoritative for
    who posted, so if it produced nothing there is genuinely no author to show
    and an empty byline beats a sentence masquerading as a publisher.
    """
    if scraped_name:
        return scraped_name
    host = _prettified_host(url)
    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        return None
    return model_name


def _write_stage(card_ref, stage: str) -> None:
    """Mirror a pipeline stage onto the user-visible card doc (best-effort).

    The card may not exist yet on edge paths, and a progress hint is never worth
    failing a capture over — so a failed stage write is logged and swallowed.
    """
    if card_ref is None:
        return
    try:
        card_ref.update({"processingStage": stage})
    except Exception as e:
        logger.warning(f"Stage write '{stage}' failed (non-fatal): {e}")


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
        # Canonicalised here because this is the ONE place analysis becomes a
        # stored card — so no model answer can reintroduce a case-variant of a
        # category that already exists (link_service.canonical_category).
        "category": canonical_category(analysis.get("category", "")) or "General",
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

# Shared TEXT (a paragraph sent in from the iOS share sheet or the extension) is
# a note whose words are the POINT. `captureType: 'text'` marks those cards so
# the byline reads "Text" rather than "Note" and the frontend knows the body is
# the user's own verbatim text, not AI prose.
TEXT_CAPTURE_TYPE = "text"


def _note_link_data(analysis: dict, text: str, *, related_links=_OMIT,
                    verbatim: bool = False) -> dict:
    """Build a link document for a URL-less text note (a first-class 'note' card).

    Reuses the shared builder but pins the note-specific shape: empty url (no
    source to open), sourceType 'note', sourceName 'Note', and a title that
    falls back to the note's first line when the model returns none. Read time is
    estimated from the note text itself since there is no scraped article.

    **`verbatim=True` (shared text) inverts what the body is.** An article or a
    video is worth paraphrasing because the card stands in for something you'd
    have to go open; a paragraph the user deliberately kept is not — replacing it
    with a summary destroys the only copy of the thing they saved. So a verbatim
    card stores the text UNTOUCHED in `summary` (the field every note surface
    already renders as the note's body, so search, Ask, editing and the embedding
    all keep working on the real words), keeps the AI only for the `title`
    heading, and parks the AI's summary in `aiSummary`/`aiDetailedSummary` —
    written but NOT displayed until the user taps the Machina mark on the card.
    Nothing is thrown away and nothing is silently substituted.
    """
    title = analysis.get("title") or _first_line(text) or "Note"
    data = _build_link_data(
        url="",
        title=title,
        summary=text if verbatim else analysis.get("summary", ""),
        detailed_summary="" if verbatim else analysis.get("detailedSummary", ""),
        source_type=NOTE_SOURCE_TYPE,
        source_name=analysis.get("sourceName") or "Note",
        original_title=_first_line(text),
        estimated_read_time=_estimate_read_time(text),
        analysis=analysis,
        related_links=related_links,
        confidence=0.8,
        key_entities=[],
    )
    if verbatim:
        data["captureType"] = TEXT_CAPTURE_TYPE
        data["sourceName"] = "Text"
        # Held back, not lost: the standard summary the rest of the app produces,
        # revealed on demand by the Machina mark instead of replacing the text.
        data["aiSummary"] = analysis.get("summary", "")
        data["aiDetailedSummary"] = analysis.get("detailedSummary", "")
    return data


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

    rl = _rate_limited("analyze", _rate_limit_identity(req), headers)
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
        existing_categories = _sanitize_categories(data.get('existingCategories'))

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
            analysis = ai.analyze_text(note_text, existing_tags=existing_tags,
                                       existing_categories=existing_categories, attempts=2)

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
            plan = plan_for(uid)
            q = _quota_blocked(uid, "saves", headers, plan=plan)
            if q:
                return q
            charged = (uid, "saves")
        else:
            plan = "free"
        pro = plan == "pro"

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
        analysis = _analyze_scraped(ai, scraped, existing_tags, attempts=2,
                                    existing_categories=existing_categories, pro=pro)

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
            source_name=_ground_source_name(
                _pick_source_name(scraped.get("source_name"), analysis.get("sourceName"), url),
                url=url,
            ),
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
            if not pro:
                link_data["proFeature"] = "youtube"
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

    rl = _rate_limited("chat", _rate_limit_identity(req), headers)
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
        # The cards the recent answers cited — what a follow-up's "this"/"it"
        # actually refers to. Structured truth from the client, so the backend
        # doesn't have to infer the subject from prose.
        context_ids = _sanitize_context_ids(data.get('contextIds'))
        # Did the APP compose this question (a tapped chip) or did the user type
        # it? Explicit from newer clients; `hints` is the legacy signal, since
        # chips have always carried structured intent and typed text never does.
        client_marks_turns = bool(data.get('generated'))
        question_generated = client_marks_turns or bool(hints)
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

        # 0. What this turn is actually ABOUT. Normally the question itself;
        #    for a follow-up that carries no topic of its own ("in Hebrew",
        #    "shorter", "why?") it becomes the last user turn that did, so
        #    retrieval doesn't embed two meta words and hand the model a
        #    context set unrelated to the subject it just answered (see
        #    search.followup_retrieval_query). Steers RETRIEVAL ONLY — the
        #    model is still asked the raw `question`, with `history`.
        followup = resolve_followup(question, history)
        retrieval_query = followup["query"]
        # A resolved subject means this turn borrowed it from an earlier one —
        # the signal step 1g-2 uses to decide whether the previously-cited cards
        # are the headline or just background. `followup` also travels to the
        # prompt, which must NAME that subject: the standing "follow-ups must
        # add value" rule otherwise reads as "go find a different source", and
        # for a restate request ("in Hebrew, briefly") that rule is suspended
        # outright.
        is_followup = bool(followup["subject"])
        # Does this turn want sources it has NOT seen? "What else … besides
        # this" is a follow-up AND a request to move past what was just shown,
        # so the cited cards must not be promoted for it. Demoting them later
        # isn't enough: when every card in context is already-discussed the
        # demote has nothing to reorder, and whatever was pinned stays pinned.
        wants_new_sources = (bool(hints.get("excludeTitles"))
                             or is_exclusion_question(retrieval_query))
        if is_followup:
            logger.info("ask_brain: follow-up (restate=%s) — resolved against the conversation",
                        followup["restate"])

        # 0b. A conversation must not change language because the user tapped a
        #     suggestion. Chip questions are Machina's own English boilerplate
        #     around a card title, so judging language from their wording (the
        #     normal rule) flipped a Hebrew thread to English mid-conversation.
        #     `hints` is the chip marker — it is machine-generated intent, only
        #     ever attached to a question the app composed, never to typed
        #     text — so on those turns the answer language comes from what the
        #     USER has written here instead. None (all-Latin conversations, or
        #     a chip that opens a thread) leaves the prompt rule untouched.
        answer_language = (conversation_language(history, marked=client_marks_turns)
                           if question_generated else None)
        if answer_language:
            logger.info("ask_brain: generated question — answering in %s (conversation language)",
                        answer_language)

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
            candidates = perform_search_logic(uid, retrieval_query, limit=30)
            # Quality-gate the nearest-neighbour output exactly like the
            # search bar does: find_nearest always returns `limit` results no
            # matter how far away, so for an off-library question ungated
            # "sources" are 30 unrelated cards — and the citation invariant
            # then pressures the model to cite one. Gated, the model honestly
            # says the library has nothing on it.
            candidates = apply_distance_threshold(candidates)
            cards = rerank_candidates(retrieval_query, candidates, top_k=10)
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
            cards = cards + keyword_scan_cards(uid, retrieval_query, exclude_ids=have, limit=5)
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
            if hints.get("recency") or is_recency_question(retrieval_query):
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

        # 1e-2. CONVERSATION GUARANTEE: the cards the recent answers actually
        #     CITED are in context for the next turn. Everything above infers
        #     the subject from the question's prose, which is exactly what a
        #     follow-up doesn't state — the owner hit this twice (a "בעברית"
        #     that was told the library holds nothing on the recipe just cited,
        #     and a "מי פירסם את זה?" told the same about a LinkedIn card).
        #     `contextIds` is not an inference: it's the ids the client rendered
        #     as source chips, so no phrasing can defeat it.
        #     On a detected follow-up (the retrieval query was resolved against
        #     an earlier turn) they're PINNED to the front — that's what the
        #     question is about, and the deep-content window lives there. On any
        #     other turn they're appended at the BACK: present and referenceable
        #     if the answer needs them, never crowding a genuine new topic.
        #     Runs BEFORE the exclusion and anchor steps ON PURPOSE. A turn can
        #     be a follow-up AND a "what else … besides this" — pinning after
        #     the exclusion demote would put the very cards the user is trying
        #     to move past back at the front. Ordering it here lets the existing
        #     machinery have the last word in both directions.
        #     Bounded (MAX_CONTEXT_IDS) and best-effort — a failure here leaves
        #     the retrieval above exactly as it was.
        if context_ids:
            try:
                have = {c.get("id") for c in cards}
                missing = [i for i in context_ids if i not in have]
                fetched = cards_by_ids(uid, missing) if missing else []
                if is_followup and not wants_new_sources:
                    cards = pin_cards_by_ids(context_ids, fetched + cards)
                else:
                    cards = cards + fetched
            except Exception as e:
                logger.error(f"ask_brain context-id merge failed: {e}")

        # 1f. Exclusions ("What else did I save on X?"): the already-discussed
        #     cards must not dominate the answer again. Chips name them
        #     explicitly (hints.excludeTitles); typed "besides X" questions
        #     contribute their quoted titles. Matching cards are demoted to
        #     the BACK of context (still referenceable, never the headline)
        #     and the prompt gets an explicit already-discussed list.
        excluded_titles = list(hints.get("excludeTitles") or [])
        if wants_new_sources:
            if is_exclusion_question(retrieval_query):
                excluded_titles += extract_quoted_phrases(retrieval_query)
            # The cards the recent answers cited ARE the already-discussed set,
            # known exactly — better than recovering it from quoted titles, and
            # the reason "what else besides this?" can now name what "this" is.
            if context_ids:
                wanted = set(context_ids)
                excluded_titles += [str(c.get("title") or "") for c in cards
                                    if c.get("id") in wanted and c.get("title")]
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
                retrieval_query, hints.get("anchorTitles"), excluded_titles)
            if anchors:
                for phrase in missing_title_phrases(anchors, cards):
                    have = {c.get("id") for c in cards}
                    cards = cards + keyword_scan_cards(
                        uid, phrase, exclude_ids=have, limit=2)
                cards, _ = pin_title_phrases(anchors, cards)
        except Exception as e:
            logger.error(f"ask_brain anchor pinning failed: {e}")

        # 1g-2. EXCLUSIVE ANCHORS (graph "ask about these"): the client named
        #     the exact cards the question is about, by id. Context becomes
        #     THOSE cards and nothing else — topic retrieval above pulled in
        #     look-alike strangers, and the model then counted and cited them
        #     as if they were the asked set (owner bug: asked about a 3-card
        #     cluster, answer discussed 6 and cited 7). Replace, don't merge;
        #     the privacy strip, askExcluded filter, and cap below still apply.
        #     An empty fetch (all ids deleted) keeps the retrieved context —
        #     degraded is better than blank.
        if hints.get("exclusive") and hints.get("anchorIds"):
            try:
                exclusive_cards = cards_by_ids(uid, hints["anchorIds"])
                if exclusive_cards:
                    cards = exclusive_cards
            except Exception as e:
                logger.error(f"ask_brain exclusive-anchor fetch failed: {e}")

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

        # Cards flagged out of Ask context (`askExcluded` on the link doc).
        # 2026-07-24 incident: ONE card's stored text trips Gemini's
        # non-configurable prompt filter and poisons EVERY ask that retrieves
        # it (CI-verified: with it removed the full context passes in the
        # original schema mode). The flag removes such a card from the model's
        # context only — it stays in the feed, search, and collections.
        cards = [c for c in cards if not c.get("askExcluded")]

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
                            question, slim, history, excluded_titles=excluded_titles,
                            answer_language=answer_language, followup=followup):
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
                                        excluded_titles=excluded_titles,
                                        answer_language=answer_language,
                                        followup=followup)

        # If the answer only succeeded after filter-probe isolation excluded or
        # partially filtered card(s) (Gemini's prompt filter rejects their text
        # — see _drop_prompt_blocked_cards/_best_clean_variant), leave a durable
        # trail naming the poison cards + fields so the owner can find and
        # fix/re-save them. Not an error — the request SUCCEEDED — but
        # server_errors is the queryable admin trail.
        dropped_card_ids = result.get("droppedCardIds") or []
        filtered = result.get("filteredCards") or []
        if dropped_card_ids or filtered:
            titles = {c.get("id"): str(c.get("title", ""))[:80] for c in cards}
            parts = [f"dropped {cid}: {titles.get(cid, '?')}"
                     for cid in dropped_card_ids]
            parts += [
                f"filtered {f.get('id')}: {str(f.get('title', '?'))[:80]} "
                f"(removed: {', '.join(f.get('removedFields') or [])})"
                for f in filtered]
            _record_server_error(
                "ask_brain (filter-blocked content)",
                Exception("; ".join(parts)), uid=uid)

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

    # Warmup ping — the client fires this the moment the search bar OPENS, so
    # the cold start (module import, Firebase init) runs while the user is
    # still typing instead of in front of the first real query. Deliberately
    # BEFORE auth and App Check: it does no work, reads no data, and answers
    # 204 — the whole point is that reaching this line is the work. Own rate
    # bucket so pings never consume real search quota.
    if (req.get_json(silent=True) or {}).get('warmup'):
        rl = _rate_limited("search-warm", _rate_limit_identity(req), headers)
        if rl:
            return rl
        return https_fn.Response('', status=204, headers=headers)

    rl = _rate_limited("search", _rate_limit_identity(req), headers)
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


@https_fn.on_request(max_instances=10, timeout_sec=120)
def analyze_image(req: https_fn.Request) -> https_fn.Response:
    """HTTP endpoint for analyzing Images immediately (Synchronous)."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    rl = _rate_limited("image", _rate_limit_identity(req), headers)
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
        existing_categories = _sanitize_categories(data.get('existingCategories'))
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
        analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags,
                                    existing_categories=existing_categories, attempts=2)

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
            source_name=_ground_source_name(analysis.get("sourceName"), url="", fallback="Screenshot"),
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

    # Pre-body gate identity. The share-extension path carries no bearer, and
    # through the Hosting rewrite the last X-Forwarded-For hop is the PROXY's
    # egress IP — one bucket silently shared by every share-sheet user (S-12
    # flagged this chain as likely-affected; proven 2026-08-26 when a brand-new
    # account's first shares 429'd). When the caller presents an ingest token,
    # key the gate on a HASH of it (it's a secret; never a Firestore doc id in
    # the clear) so each device gets its own ceiling. The token is validated
    # immediately below, and the share-uid bucket still caps the resolved
    # workspace, so an invalid token buys nothing but its own private bucket.
    _pre_tok = req.headers.get('X-Ingest-Token') or ''
    _pre_identity = (
        f"tok:{hashlib.sha256(_pre_tok.encode()).hexdigest()[:16]}"
        if _pre_tok else _rate_limit_identity(req)
    )
    rl = _rate_limited("share", _pre_identity, headers)
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

        # MULTI-IMAGE path (web capture): up to MAX_CARD_IMAGES ordered
        # screenshots that become ONE card (e.g. a screenshotted carousel). Two
        # request shapes, both writing ONE queue doc and charging ONE save unit:
        #   images:    [{data: <b64>, mimeType}, ...] — inline bytes, stored here
        #              in list order (the order the user confirmed in the picker)
        #   imageUrls: [<storage url>, ...] — images ALREADY in our Storage; the
        #              retry path re-enqueues a failed multi-image card this way
        images_in = data.get('images')
        image_urls_in = data.get('imageUrls')
        if isinstance(images_in, list) and images_in:
            if len(images_in) > MAX_CARD_IMAGES:
                return _error_response(f"Up to {MAX_CARD_IMAGES} images per card", 400, headers)
            import base64, uuid
            decoded = []
            for entry in images_in:
                if not isinstance(entry, dict):
                    return _error_response("Invalid image data", 400, headers)
                b64 = entry.get('data') or ''
                if isinstance(b64, str) and ',' in b64 and b64.strip().startswith('data:'):
                    b64 = b64.split(',', 1)[1]
                # Reject by encoded length before decoding (see MAX_IMAGE_B64_CHARS).
                if not b64 or not isinstance(b64, str) or len(b64) > MAX_IMAGE_B64_CHARS:
                    return _error_response("Image is too large", 413, headers)
                try:
                    img_bytes = base64.b64decode(b64)
                except Exception:
                    return _error_response("Invalid image data", 400, headers)
                if not img_bytes:
                    return _error_response("Invalid image data", 400, headers)
                if len(img_bytes) > MAX_IMAGE_BYTES:
                    return _error_response("Image is too large", 413, headers)
                decoded.append((img_bytes, entry.get('mimeType') or 'image/jpeg'))

            # ONE save unit for the whole set — a multi-screenshot card is one save.
            q = _quota_blocked(uid, "saves", headers)
            if q:
                return q

            stored_urls = []
            try:
                for img_bytes, mime in decoded:
                    ext = 'png' if 'png' in mime else 'jpg'
                    stored_urls.append(_store_image(
                        f"screenshots/{uid}/{uuid.uuid4().hex}.{ext}", img_bytes, mime))
            except Exception as e:
                logger.error(f"Multi-image store failed: {e}", exc_info=True)
                refund_quota(uid, "saves")
                return _server_error(headers, e)

            process_ref = get_db().collection('pending_processing').document()
            queue_doc = {
                "uid": uid,
                "url": stored_urls[0],
                "imageUrls": stored_urls,
                "isImage": True,
                "mimeType": decoded[0][1],
                "source": "web" if data.get('cardId') else "share",
                "body": data.get('note', ''),
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "status": "queued",
                "attempts": 0,
            }
            if data.get('cardId'):
                queue_doc["cardId"] = data.get('cardId')
            process_ref.set(queue_doc)
            logger.info(f"Share ingest queued {len(stored_urls)}-image card for {_mask_uid(uid)}")
            return https_fn.Response(
                json.dumps({"success": True, "queued": True, "id": process_ref.id,
                            "image": True, "count": len(stored_urls)}),
                status=200, headers=headers, mimetype='application/json'
            )

        if isinstance(image_urls_in, list) and image_urls_in:
            # Re-enqueue of ALREADY-STORED images (multi-image retry). Only our
            # own Storage objects under the CALLER's screenshots/ prefix are
            # accepted — never an arbitrary URL. The worker's safe_get is the
            # SSRF backstop; this prefix check is the front gate.
            if len(image_urls_in) > MAX_CARD_IMAGES:
                return _error_response(f"Up to {MAX_CARD_IMAGES} images per card", 400, headers)
            from urllib.parse import quote
            bucket_name = storage.bucket().name
            required_prefix = (f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
                               + quote(f"screenshots/{uid}/", safe=""))
            for u in image_urls_in:
                if not isinstance(u, str) or len(u) > MAX_URL_LENGTH or not u.startswith(required_prefix):
                    return _error_response("Invalid image URL", 400, headers)
            q = _quota_blocked(uid, "saves", headers)
            if q:
                return q
            process_ref = get_db().collection('pending_processing').document()
            queue_doc = {
                "uid": uid,
                "url": image_urls_in[0],
                "imageUrls": list(image_urls_in),
                "isImage": True,
                "mimeType": data.get('mimeType', 'image/jpeg'),
                "source": "web",
                "body": data.get('note', ''),
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "status": "queued",
                "attempts": 0,
            }
            if data.get('cardId'):
                queue_doc["cardId"] = data.get('cardId')
            process_ref.set(queue_doc)
            logger.info(f"Share ingest re-queued {len(image_urls_in)}-image card for {_mask_uid(uid)}")
            return https_fn.Response(
                json.dumps({"success": True, "queued": True, "id": process_ref.id,
                            "image": True, "count": len(image_urls_in)}),
                status=200, headers=headers, mimetype='application/json'
            )

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
                note_tags, note_cats = get_user_vocabulary(uid)
                analysis = ai.analyze_text(note_text, existing_tags=note_tags,
                                           existing_categories=note_cats)
                # verbatim: shared text is kept as the user sent it (see
                # _note_link_data) — the AI supplies the heading and a summary
                # that waits behind the Machina mark, never the body.
                link_data = _note_link_data(analysis, note_text, verbatim=True)
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


@https_fn.on_request()
def get_share_config_http(req: https_fn.Request) -> https_fn.Response:
    """HTTP twin of `get_share_config`, for the native iOS shell.

    Same reason claim_workspace / delete_account have twins: the callable
    transport's CORS preflight is rejected from `capacitor://localhost`, so
    the ShareExt token bridge's callable fallback could never run on device.
    That gap became real 2026-08-26: a workspace created by the client-side
    fallback (AuthProvider.createWorkspaceClientSide) has no ingestToken yet,
    and without this twin the share sheet had no way to get one. Verifies the
    caller via Authorization: Bearer; no body needed.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)

    headers = _cors_headers(req)

    decoded = _verify_bearer(req)
    if not decoded:
        return _error_response("User must be signed in", 401, headers)

    uid = find_data_uid_by_auth_uid(decoded.get("uid"))
    if not uid:
        return _error_response("No workspace for this account", 403, headers)

    try:
        token = ensure_ingest_token(uid)
        return https_fn.Response(
            json.dumps({"endpoint": f"{APP_URL}/api/share", "token": token}),
            status=200, headers=headers, mimetype='application/json',
        )
    except Exception as e:
        return _server_error(headers, e, "Share config failed")


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


def _owner_email_matches(email, token_claims: dict = None) -> bool:
    """True when `email` is the configured OWNER_EMAIL, for the legacy claim.

    Fails CLOSED when OWNER_EMAIL is unset — the same policy `_require_admin`
    states ("a prod misconfiguration must not open the door"), which this gate
    previously inverted: `not owner_email or email == owner_email` meant that
    with the variable unset (its state in prod today, SOURCE_OF_TRUTH §4 task 5)
    ANY verified account reaching claim_workspace linked itself to the first
    users/ doc lacking `authUids` — i.e. the owner's whole library. Setting
    OWNER_EMAIL is already step (2) of the cutover order, so requiring it here
    aligns the code with the documented sequence instead of trusting it.

    Also compares case-insensitively (mailbox providers treat the local part as
    case-insensitive, and a token can carry a differently-cased address) and
    refuses an address the identity provider marked unverified.
    """
    owner_email = (os.environ.get("OWNER_EMAIL", "") or "").strip().lower()
    if not owner_email:
        logger.warning("OWNER_EMAIL is unset — refusing the legacy workspace claim")
        return False
    if not email or str(email).strip().lower() != owner_email:
        return False
    # Only reject an email the provider EXPLICITLY flagged unverified; a token
    # that simply omits the claim (some Apple ID tokens) still passes.
    if token_claims is not None and token_claims.get("email_verified") is False:
        logger.warning("Legacy claim refused: provider reports the email unverified")
        return False
    return True


def _claim_workspace_logic(auth_uid: str, email: str = None,
                           token_claims: dict = None) -> dict:
    """Resolve (or set up) the data workspace for a verified account.

    Shared core for both the `claim_workspace` callable and the
    `claim_workspace_http` endpoint — identical behavior, only the transport /
    auth extraction differs. Runs with Admin privileges (bypasses Firestore
    rules), so it still works after the rules are locked. Resolution order:

    1. Already linked (`authUids array-contains` the caller) → return it.
    2. Legacy owner claim: link the single pre-auth unclaimed doc, gated by the
       OWNER_EMAIL allowlist (see `_owner_email_matches` — with OWNER_EMAIL
       unset this step is DENIED, not opened, so a missed cutover step can't
       hand the owner's workspace to whoever signs in first).
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

    if _owner_email_matches(email, token_claims):
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
    claims = getattr(req.auth, "token", None) or None
    email = claims.get("email") if claims else None
    return _claim_workspace_logic(auth_uid, email, claims)


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
        result = _claim_workspace_logic(auth_uid, email, decoded)
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

    rl = _rate_limited("device_token", _rate_limit_identity(req), headers)
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


@https_fn.on_request(max_instances=2)
def send_test_push_http(req: https_fn.Request) -> https_fn.Response:
    """Send the verified caller a real push RIGHT NOW, and report what happened.

    Diagnostic for the one chain whose failures are otherwise silent: the
    response relays send_push's summary ({sent, failed, pruned, skipped,
    tokens}) so the client can name the broken link — no registered token,
    stale tokens, or an FCM-side failure — instead of showing nothing.
    Bearer-authed and rate-limited like the token endpoints; sends only to the
    caller's own workspace, so it can't be aimed at anyone else.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    if req.method != 'POST':
        return _error_response("Method not allowed", 405, headers)

    rl = _rate_limited("device_token", _rate_limit_identity(req), headers)
    if rl:
        return rl

    decoded = _verify_bearer(req)
    if not decoded:
        return _error_response("User must be signed in", 401, headers)
    uid = find_data_uid_by_auth_uid(decoded.get("uid"))
    if not uid:
        return _error_response("No workspace linked to this account", 403, headers)

    try:
        snap = get_db().collection("users").document(uid).get()
        tokens = [
            t for t in ((snap.to_dict() or {}).get("fcmTokens") or [])
            if isinstance(t, str) and t
        ]
        from push_service import send_push
        result = send_push(
            uid,
            "Machina test notification",
            "Push is working. Digests and reminders will arrive like this.",
            {"view": "digest"},
        )
        result["tokens"] = len(tokens)
        return https_fn.Response(
            json.dumps(result),
            status=200, headers=headers, mimetype='application/json',
        )
    except Exception as e:
        return _server_error(headers, e, "Test push failed")


# ─────────────────────────────────────────────
# Machina Pro: entitlements + RevenueCat
# ─────────────────────────────────────────────
#
# Plain HTTP endpoints for the same reason as the device-token twins: the
# native shell (where purchases happen) can't clear a callable's CORS
# preflight from `capacitor://localhost`. The workspace uid is derived from the
# verified ID token; the RevenueCat app user id is the Firebase Auth uid (never
# the workspace uid, which is a phone number for the legacy workspace).


def _entitlement_caller(req, headers):
    """(uid, auth_uid, None) for the verified caller, or (None, None, error)."""
    rl = _rate_limited("entitlement", _rate_limit_identity(req), headers)
    if rl:
        return None, None, rl
    decoded = _verify_bearer(req)
    if not decoded:
        return None, None, _error_response("User must be signed in", 401, headers)
    auth_uid = decoded.get("uid")
    uid = find_data_uid_by_auth_uid(auth_uid)
    if not uid:
        return None, None, _error_response("No workspace linked to this account", 403, headers)
    return uid, auth_uid, None


@https_fn.on_request()
def entitlement_http(req: https_fn.Request) -> https_fn.Response:
    """GET /api/entitlement: the caller's plan, grant dates, and this month's
    quota usage. Lazily creates the founder/trial grant on first call."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    uid, _auth_uid, err = _entitlement_caller(req, headers)
    if err:
        return err
    try:
        return https_fn.Response(
            json.dumps(entitlement_summary(uid)),
            status=200, headers=headers, mimetype='application/json',
        )
    except Exception as e:
        return _server_error(headers, e, "Entitlement lookup failed")


@https_fn.on_request()
def entitlement_sync_http(req: https_fn.Request) -> https_fn.Response:
    """POST /api/entitlement/sync: re-read the caller's subscription from
    RevenueCat right after a purchase or restore, and rewrite the entitlement.

    The client's own copy of the receipt is never trusted; the server asks
    RevenueCat. 503 when the secret key is not configured yet, so a build that
    ships before the owner-side setup fails loudly instead of silently free."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    if req.method != 'POST':
        return _error_response("Method not allowed", 405, headers)
    uid, auth_uid, err = _entitlement_caller(req, headers)
    if err:
        return err
    if not rc_configured():
        return _error_response(
            "Subscriptions are not set up on the server yet (REVENUECAT_SECRET_KEY missing)",
            503, headers)
    try:
        sync_from_revenuecat(uid, auth_uid)
        return https_fn.Response(
            json.dumps(entitlement_summary(uid)),
            status=200, headers=headers, mimetype='application/json',
        )
    except RevenueCatError as e:
        logger.warning("RevenueCat sync failed for %s: %s", _mask_uid(uid), e)
        return _error_response("Could not reach the subscription service. Please try again.", 503, headers)
    except Exception as e:
        return _server_error(headers, e, "Entitlement sync failed")


# RevenueCat event types that change whether the `pro` entitlement is active.
# Anything else (TEST, TRANSFER, SUBSCRIBER_ALIAS, …) is acknowledged and ignored.
_RC_EVENTS = frozenset((
    "INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "CANCELLATION",
    "EXPIRATION", "BILLING_ISSUE", "UNCANCELLATION",
))


@https_fn.on_request(max_instances=2)
def revenuecat_webhook(req: https_fn.Request) -> https_fn.Response:
    """POST target for RevenueCat's webhook (no user auth).

    Authenticates by comparing the `Authorization` header with
    REVENUECAT_WEBHOOK_AUTH (constant-time); 401 otherwise, 503 while the
    secret is unset so the owner sees a misconfiguration rather than a silent
    200. The event body is trusted only for WHICH user changed: dates come from
    a fresh REST lookup (sync_from_revenuecat). Always 200 once handled, so
    RevenueCat doesn't retry a user we simply don't know."""
    if req.method != 'POST':
        return _error_response("Method not allowed", 405)
    expected = (os.environ.get("REVENUECAT_WEBHOOK_AUTH") or "").strip()
    if not expected:
        logger.warning("revenuecat_webhook called but REVENUECAT_WEBHOOK_AUTH is unset")
        return _error_response("Webhook not configured", 503)
    provided = (req.headers.get("Authorization") or "").strip()
    if not hmac.compare_digest(provided, expected):
        logger.warning("revenuecat_webhook: bad Authorization header")
        return _error_response("Unauthorized", 401)
    if not rc_configured():
        return _error_response("REVENUECAT_SECRET_KEY is not set", 503)

    body = req.get_json(silent=True) or {}
    event = body.get("event") if isinstance(body, dict) else None
    if not isinstance(event, dict):
        return _error_response("Invalid event body", 400)
    etype = str(event.get("type") or "")
    if etype not in _RC_EVENTS:
        logger.info("revenuecat_webhook: ignoring event type %s", etype or "?")
        return https_fn.Response(json.dumps({"ok": True, "ignored": etype}), status=200,
                                 mimetype='application/json')

    app_user_id = event.get("app_user_id") or event.get("original_app_user_id")
    aliases = event.get("aliases") or []
    try:
        uid = resolve_workspace_for_app_user(app_user_id, aliases)
    except Exception as e:
        logger.error("revenuecat_webhook: workspace resolve failed: %s", e)
        return _error_response("Lookup failed", 500)
    if not uid:
        # Not an error worth retrying: the account may have been deleted.
        logger.info("revenuecat_webhook: %s for an unknown app user", etype)
        return https_fn.Response(json.dumps({"ok": True, "unknown_user": True}), status=200,
                                 mimetype='application/json')
    try:
        doc = sync_from_revenuecat(uid, app_user_id)
    except RevenueCatError as e:
        # 5xx makes RevenueCat retry with backoff, which is what we want here.
        logger.warning("revenuecat_webhook: sync failed for %s: %s", _mask_uid(uid), e)
        return _error_response("Subscription service unavailable", 502)
    except Exception as e:
        return _server_error(None, e, "Webhook processing failed")
    logger.info("revenuecat_webhook: %s handled for %s (plan=%s)", etype, _mask_uid(uid), doc.get("plan"))
    return https_fn.Response(json.dumps({"ok": True, "plan": doc.get("plan")}), status=200,
                             mimetype='application/json')


# How long a client_error_reports record lives. Same policy as server_errors.
_CLIENT_ERROR_TTL_DAYS = 14
# Whole-body cap. A report is a message + stack + a few short fields; anything
# larger is malformed or abusive. Checked before parsing, so a huge body is
# rejected without being deserialized.
MAX_CLIENT_ERROR_BYTES = 16 * 1024


@https_fn.on_request(max_instances=3)
def client_error_http(req: https_fn.Request) -> https_fn.Response:
    """Record a client error that could NOT be written to Firestore.

    WHY THIS EXISTS: `lib/errorReporter.ts` normally writes to
    ``users/{uid}/client_errors``, which the locked rules gate behind
    ``owns(uid)``. That works right up until the failure that matters most —
    when workspace resolution itself fails, there is no uid, the rules would
    deny the write anyway, and the reports die in a memory buffer that never
    flushes. That is exactly what happened with ungated builds 1266/1267: the
    app was dead on device for a day and the only detector was the owner
    noticing. A client with no workspace needs a way to say so.

    Deliberately accepts UNAUTHENTICATED reports, because "I could not sign in"
    is one of the states worth hearing about. That makes it a public write
    surface, so it is bounded on every axis: per-IP rate limit that fails
    CLOSED, a pre-parse body-size cap, server-side truncation of every field,
    and a fixed schema (nothing the caller sends is echoed back or trusted into
    a query). Records land in the top-level ``client_error_reports``, which is
    Admin-SDK-only — clients can neither read nor write it directly.
    """
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    if req.method != 'POST':
        return _error_response("Method not allowed", 405, headers)

    # Per-IP only: the whole point is that the caller may have no identity.
    rl = _rate_limited("client-error", client_ip(req), headers)
    if rl:
        return rl

    raw = req.get_data(cache=False) or b""
    if len(raw) > MAX_CLIENT_ERROR_BYTES:
        return _error_response("Report too large", 413, headers)

    try:
        data = json.loads(raw.decode("utf-8") or "{}") or {}
        if not isinstance(data, dict):
            raise ValueError("body is not an object")
    except Exception:
        return _error_response("Invalid JSON", 400, headers)

    def field(name: str, limit: int) -> str:
        value = data.get(name)
        return str(value)[:limit] if isinstance(value, (str, int, float)) else ""

    message = field("message", 500)
    if not message:
        return _error_response("Missing message", 400, headers)

    # Identity is optional and NEVER taken from the body — an unsigned report is
    # recorded as anonymous rather than being allowed to claim a uid.
    decoded = _verify_bearer(req)
    auth_uid = decoded.get("uid") if decoded else None

    try:
        now = datetime.now(timezone.utc)
        get_db().collection("client_error_reports").add({
            "message": message,
            "stack": field("stack", 2000),
            "url": field("url", 300),
            "source": field("source", 100),
            "platform": field("platform", 16),
            # Which bundle produced this — the build-info.json fields, so a
            # report identifies the build without a device round-trip.
            "buildNumber": field("buildNumber", 32),
            "commit": field("commit", 64),
            "requireAuth": bool(data.get("requireAuth")),
            # Why the client fell back to this endpoint (e.g. "restricted").
            "reason": field("reason", 64),
            # Admin-only collection, so an auth uid is safe to store here; it is
            # the verified one or None, never client-supplied.
            "authUid": auth_uid,
            "ip": client_ip(req),
            "timestamp": now.isoformat(),
            "expireAt": now + timedelta(days=_CLIENT_ERROR_TTL_DAYS),
        })
    except Exception as e:
        # Never fail the caller on an observability write — it is already in a
        # degraded state, and a 5xx here would just be noise it can't act on.
        logger.warning("client_error_reports write failed (ignored): %s", e)

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
# functions OWN the /s (single card), /c (collection) and /a (Ask answer) routes
# via Hosting rewrites and return real HTML: correct og:title/description/image
# for crawlers, and a readable page for humans with no JS required.


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
    """Publish (or re-publish) a card/collection/answer as a public snapshot.

    HTTP (not callable) so the native WKWebView can reach it (callable CORS
    preflight fails from `capacitor://localhost` — see claim_workspace_http).
    Body: { type: 'card'|'collection'|'answer', shareId: str, payload: object, uid?: str }.
    `payload` is the snapshot the client built (e.g. toSharedCard); the server
    strips any `ownerUid` and stamps shareId/publishedAt. Returns { shareId }."""
    if req.method == 'OPTIONS':
        return _cors_preflight(req)
    headers = _cors_headers(req)
    # Per-IP rate limit + App Check BEFORE any work — the publish surface writes
    # admin-SDK snapshots to a world-readable collection, so gate it like the
    # paid endpoints (the per-uid `publish` bucket below is bypassable by a
    # rotating client-supplied uid pre-cutover).
    rl = _rate_limited("publish-ip", _rate_limit_identity(req), headers)
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
    rl = _rate_limited("publish-ip", _rate_limit_identity(req), headers)
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
    """Server-rendered public page for a shared card (/s), collection (/c) or
    Ask answer (/a).

    Owns those routes via Hosting rewrites so link-preview crawlers get real
    per-item OpenGraph tags (the static export can't). Always returns HTML.
    """
    html_headers = {
        "Content-Type": "text/html; charset=utf-8",
        # Let CDNs/crawlers cache briefly; cards are immutable snapshots.
        "Cache-Control": "public, max-age=300, s-maxage=600",
    }
    # Not-found must NEVER be CDN-cached: the share flow opens the OS share
    # sheet while the publish is still in flight, so a link-preview crawler can
    # legitimately arrive seconds before the snapshot exists — a cached 404
    # would then serve "not found" to the human recipient too.
    nf_headers = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
    }
    try:
        share_id = (req.args.get("id") or "").strip()
        # Which of the three public pages this is. One function owns all three
        # routes, and Hosting/Vercel rewrite each of /s, /c and /a to it.
        path = req.path or ""
        kind = "collection" if "/c" in path else "answer" if "/a" in path else "card"
        route = {"collection": "/c", "answer": "/a", "card": "/s"}[kind]
        # og:url — read by every link preview, so it must be the brand domain.
        share_url = f"{WEB_URL}{route}?id={share_id}"

        if not share_id:
            return https_fn.Response(_share_not_found_html(), status=404, headers=nf_headers)

        db = get_db()
        collection = {
            "collection": "shared_collections",
            "answer": "shared_answers",
            "card": "shared_cards",
        }[kind]
        snap = db.collection(collection).document(share_id).get()
        if not snap.exists:
            return https_fn.Response(_share_not_found_html(), status=404, headers=nf_headers)

        data = snap.to_dict() or {}
        if kind == "collection":
            html_out = _render_shared_collection(data, share_url)
        elif kind == "answer":
            html_out = _render_shared_answer(data, share_url)
        else:
            html_out = _render_shared_card(data.get("card", {}) or {}, share_url,
                                           og_preview=data.get("ogPreview"))
        return https_fn.Response(html_out, status=200, headers=html_headers)

    except Exception as e:
        logger.error(f"share_page failed: {e}", exc_info=True)
        return https_fn.Response(_share_not_found_html(), status=200, headers=nf_headers)


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
    # Must exceed the worst INTERNAL worst case (scrape + 3 capped Gemini
    # attempts + 2 capped embed attempts ≈ 8–9 min of pure timeouts — see
    # GEMINI_CALL_TIMEOUT_MS) so the except below always runs and writes the
    # retryable FAILED card. At 300s the platform killed the function first and
    # the placeholder stranded at `processing` with no error anywhere
    # (2026-08-26 demo-account stall).
    timeout_sec=540,
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
    # Assumed Pro until the video path reads the plan; only YouTube cares.
    pro = True

    try:
        # Mark the queue doc as in-flight. Kept inside the try so that if this
        # write throws, the failure hits the except below and the visible card
        # is marked FAILED — rather than the capture being lost silently.
        ref.update({"status": "processing", "startedAt": datetime.now(timezone.utc).isoformat()})

        # 1. Scrape content (only once)
        log_to_firestore(task_id, f"Scraping content for: {url}")
        ref.update({"status": "scraping"})
        if not is_image:
            _write_stage(card_ref, "scraping")
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
        existing_tags, existing_categories = get_user_vocabulary(uid)
        ai = GeminiService()

        _write_stage(card_ref, "analyzing")

        if is_image:
            # Route through scraper.safe_get (SSRF guard + per-redirect
            # re-validation): the pending_processing queue doc is attacker-
            # influenceable, so a hostile imageUrl must not be able to make us
            # fetch an internal/metadata endpoint. Normal share-ingest images are
            # public Firebase Storage URLs, which pass the guard fine.
            from scraper import safe_get

            queued_image_urls = data.get("imageUrls") if isinstance(data.get("imageUrls"), list) else None
            if queued_image_urls and len(queued_image_urls) > 1:
                # MULTI-IMAGE card: ordered screenshots of ONE post, already in
                # our Storage (share_ingest stored them in the user's confirmed
                # order). Fetch each back — through the same SSRF guard, per URL
                # — and analyze the whole set as one document.
                image_urls = queued_image_urls[:MAX_CARD_IMAGES]
                log_to_firestore(task_id, f"Downloading {len(image_urls)} images")
                ref.update({"status": "downloading_image"})
                image_parts = []
                for img_url in image_urls:
                    img_response = safe_get(img_url, timeout=30)
                    img_response.raise_for_status()
                    part_mime = img_response.headers.get('Content-Type') or 'image/jpeg'
                    image_parts.append((img_response.content, part_mime))

                url = image_urls[0]
                log_to_firestore(task_id, f"Starting AI analysis of {len(image_parts)} images")
                ref.update({"status": "analyzing_image", "storageUrl": url})
                analysis = ai.analyze_images(image_parts, existing_tags=existing_tags,
                                             existing_categories=existing_categories)
            else:
                log_to_firestore(task_id, f"Downloading image bytes from: {url}")
                ref.update({"status": "downloading_image"})
                img_response = safe_get(url, timeout=30)
                img_response.raise_for_status()
                image_bytes = img_response.content

                # Upload to Firebase Storage
                log_to_firestore(task_id, "Uploading image to Firebase Storage")
                public_url = _store_image(f"screenshots/{uid}/{task_id}.jpg", image_bytes, mime_type)

                url = public_url

                log_to_firestore(task_id, "Starting AI image analysis")
                ref.update({"status": "analyzing_image", "storageUrl": public_url})
                analysis = ai.analyze_image(image_bytes, mime_type, existing_tags=existing_tags,
                                            existing_categories=existing_categories)
        else:
            # Analyze with AI (YouTube → native video ingestion w/ fallback).
            # The plan is read here, once per capture, and only for videos: it
            # is the one content type whose analysis is Pro-gated.
            pro = plan_for(uid) == "pro" if scraped.get("content_type") == "youtube" else True
            analysis = _analyze_scraped(ai, scraped, existing_tags,
                                        existing_categories=existing_categories, pro=pro)

        # Final Defensive check for analysis
        if not isinstance(analysis, dict):
            logger.warning(f"Final analysis check failed. Type: {type(analysis)}")
            analysis = {}

        # 3. Generate Embedding & Find Connections
        # Rich v2 recipe (see _embedding_text_from_analysis) — fold in
        # detailedSummary/takeaway/concepts so the card is findable by its
        # details, not just its headline.
        _write_stage(card_ref, "connecting")
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
            source_name=_ground_source_name(
                _pick_source_name(
                    scraped.get("source_name"),
                    analysis.get("sourceName"),
                    "" if is_image else original_url,
                ),
                url="" if is_image else original_url,
                fallback="Screenshot" if is_image else None,
            ),
            original_title=scraped.get("title", "Image Upload" if is_image else ""),
            estimated_read_time=estimated_time,
            analysis=analysis,
            related_links=related_links,
        )

        # Multi-image card: the ordered set behind it. `url` stays the FIRST
        # image (set above), so every existing reader — cardThumbnailUrl, the
        # byline, stats, the Ask citation chip — is already correct; imageUrls
        # is the additive field only the gallery surfaces read.
        if is_image and isinstance(data.get("imageUrls"), list) and len(data["imageUrls"]) > 1:
            link_data["imageUrls"] = data["imageUrls"][:MAX_CARD_IMAGES]

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
            if not pro:
                link_data["proFeature"] = "youtube"
        elif not is_image:
            # X/Instagram photo posts: show the cover image we read for vision.
            # task_id keys the blob so a retry reuses the same path (idempotent).
            _apply_post_thumbnail(link_data, scraped, uid, task_id)

        # 5. Save to Firestore — flip the placeholder card to its ready state in
        # place (preserving its id) so it transitions processing → ready without
        # flicker. If the placeholder couldn't be created, fall back to a new doc.
        # The full set() replaces the doc, so any prior processingStage is dropped
        # from the ready card without a separate delete.
        _write_stage(card_ref, "organizing")
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
        # A failed multi-image card keeps its ordered set so Retry can re-enqueue
        # ALL the images (via share_ingest's imageUrls path), not just the first.
        if is_image and isinstance(data.get("imageUrls"), list) and len(data["imageUrls"]) > 1:
            failed_data["imageUrls"] = data["imageUrls"][:MAX_CARD_IMAGES]
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

    Uses a collection-group query so it doesn't scan every user. NOTE: the
    default single-field indexes cover COLLECTION scope only — this query needs
    the `status` field enabled at COLLECTION_GROUP scope, declared as a
    fieldOverride in firestore.indexes.json (it 400'd in prod without it,
    every 5 minutes, until 2026-07-28). Age is measured from
    `processingStartedAt` when present (a retry preserves the old `createdAt`),
    falling back to `createdAt`.
    """
    db = get_db()
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    cutoff = now_ms - _PROCESSING_TIMEOUT_MS
    report = {"scanned": 0, "failed_out": 0, "errors": []}

    try:
        stuck = db.collection_group("links").where(
            filter=FieldFilter("status", "==", LinkStatus.PROCESSING.value)
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
                "processingStage": gc_firestore.DELETE_FIELD,
            })
            report["failed_out"] += 1
        except Exception as e:
            logger.error(f"Janitor failed to update {doc.id}: {e}")
            report["errors"].append(f"{doc.id}: {e}")

    # Stale pending_processing queue docs. A hard-killed job (timeout/OOM) never
    # reaches the trigger's cleanup `ref.delete()`, so its queue doc lives
    # forever — and `pending_exists_for_url` then reports every future save of
    # that URL as a duplicate: share_ingest acks "duplicate", no new card ever
    # appears, and the user cannot re-save the link at all (2026-08-26
    # demo-account stall, second-order bug). The card janitor above owns the
    # VISIBLE card; deleting the aged queue doc only unblocks re-saves.
    # `createdAt` is written as an ISO-8601 UTC string (_pending_url_doc), which
    # sorts lexicographically, so a string range query is correct.
    report["queue_pruned"] = 0
    try:
        cutoff_iso = datetime.fromtimestamp(cutoff / 1000, tz=timezone.utc).isoformat()
        stale_jobs = db.collection("pending_processing").where(
            filter=FieldFilter("createdAt", "<", cutoff_iso)
        ).limit(200).stream()
        for doc in stale_jobs:
            doc.reference.delete()
            report["queue_pruned"] += 1
    except Exception as e:
        logger.error(f"pending_processing prune failed: {e}")
        report["errors"].append(f"pending_processing: {e}")

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
            filter=FieldFilter("expireAt", "<=", now_dt)
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
                filter=FieldFilter("timestamp", "<", cutoff_iso)
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
                filter=FieldFilter("expireAt", "<=", now_dt)
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

    if report["failed_out"] or report["queue_pruned"] or report["logs_pruned"] or report["server_errors_pruned"]:
        logger.info(f"Processing janitor: {report}")
    return report


@scheduler_fn.on_schedule(schedule="every 5 minutes", max_instances=1)
def sweep_stuck_processing(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 5 min: age out captures stuck in `processing` (see run_processing_janitor).

    Also carries the one-shot category-case backfill. It rides an existing tick
    rather than getting its own schedule because it runs once and then costs a
    single marker read forever after; a dedicated job would be permanent
    infrastructure for a one-time fix. It never raises, so the janitor's real
    work is unaffected either way.
    """
    run_processing_janitor()
    run_category_migration()


@https_fn.on_request(max_instances=1)
def force_category_migration(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for the category-case backfill (admin-gated).

    The scheduled tick runs it within ~5 minutes of deploy, so this exists for
    the two cases that need a human: verifying the result immediately, and
    re-running after the marker doc has been cleared by hand.
    """
    guard = _require_admin(req)
    if guard:
        return guard
    try:
        report = run_category_migration()
        return https_fn.Response(json.dumps(report, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual category migration failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)


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
# UNIX-CRON, deliberately, not "every 5 minutes": the App Engine syntax
# anchors the tick to DEPLOY time, so ticks landed at arbitrary offsets
# (:06/:21/:36/:51 in prod) and a user-chosen minute could never line up
# with them. Unix-cron is anchored to the clock, so the grid matches the
# Schedule picker's 5-minute increments and delivery lands ON the chosen
# minute. MUST stay in sync with digest_service.DIGEST_CADENCE_MINUTES.
@scheduler_fn.on_schedule(schedule="*/5 * * * *", max_instances=1)
def send_digests(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 15 min: deliver curated digests to users whose schedule is due now."""
    from digest_service import run_digest_check
    run_digest_check()


# Trial nudge: one push, 48h before a reverse trial ends (entitlement.py).
# Six-hourly is plenty: the window is two days wide and the doc is stamped
# (nudgedAt) so nobody is pinged twice.
@scheduler_fn.on_schedule(schedule="0 */6 * * *", max_instances=1)
def trial_nudges(event: scheduler_fn.ScheduledEvent) -> None:
    """Every 6h: warn trials that end within 48h (Machina Pro)."""
    run_trial_nudges()


@https_fn.on_request(max_instances=1)
def force_trial_nudges(req: https_fn.Request) -> https_fn.Response:
    """Manual trigger for the trial-nudge sweep (admin-gated)."""
    guard = _require_admin(req)
    if guard:
        return guard
    try:
        report = run_trial_nudges()
        return https_fn.Response(json.dumps(report, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual trial nudge trigger failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)


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
