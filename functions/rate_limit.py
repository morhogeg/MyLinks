"""Lightweight Firestore-backed rate limiting for Cloud Functions.

Cloud Functions instances are ephemeral and horizontally scaled, so in-memory
counters are unreliable. This implements a fixed-window limiter using a counter
document per key inside a Firestore transaction, so the limit holds across all
running instances without any external infrastructure.

The `rate_limits` collection is only ever touched by the Admin SDK here; client
access is denied by Firestore's default-deny (no security rule matches the
path), so there's nothing to add to firestore.rules.
"""

import time
import logging

from google.cloud import firestore

from db import get_db

logger = logging.getLogger(__name__)

_COLLECTION = "rate_limits"


class RateLimitBackendError(Exception):
    """The limiter's own Firestore check failed — NOT an exceeded limit.

    Raised only for fail-CLOSED buckets, so callers can refuse the request
    (the cost ceiling holds) while telling the truth: a 503 "temporarily
    unavailable", never a 429 "too many requests". During the 2026-08-26
    Firestore outage the old behavior (returning False) made every paid
    endpoint report rate limiting while the real failure was a dead database,
    which sent the whole investigation down the wrong path (§9 round 15).
    """


def _safe_key(key: str) -> str:
    # Firestore document IDs can't contain '/' and have a length cap.
    return key.replace("/", "_")[:1400]


def check_rate_limit(key: str, limit: int, window_seconds: int,
                     fail_open: bool = True) -> bool:
    """Return True if the call is allowed, False if the limit is exceeded.

    On a backend error the behavior depends on `fail_open`:
    - `fail_open=True` (default) returns True — a transient Firestore problem
      degrades to "no rate limiting" rather than taking the endpoint down. Use
      for cheap / IP-only buckets where an outage is harmless.
    - `fail_open=False` raises RateLimitBackendError — the request is still
      refused for PAID buckets (analyze/ask/search/share/publish) so an outage
      can't strip the last cost ceiling (report 3.5), but the caller can
      surface an honest 503 instead of a misleading 429.
    """
    try:
        db = get_db()
        doc_ref = db.collection(_COLLECTION).document(_safe_key(key))
        now = int(time.time())

        @firestore.transactional
        def _txn(txn):
            snap = doc_ref.get(transaction=txn)
            if snap.exists:
                data = snap.to_dict() or {}
                window_start = data.get("window_start", now)
                count = data.get("count", 0)
            else:
                window_start = now
                count = 0

            # Roll the window over once it has elapsed.
            if now - window_start >= window_seconds:
                window_start = now
                count = 0

            count += 1
            txn.set(doc_ref, {"window_start": window_start, "count": count})
            return count <= limit

        return _txn(db.transaction())
    except Exception as e:
        logger.error("Rate limit check failed (%s): %s",
                     "failing open" if fail_open else "failing closed", e)
        if fail_open:
            return True
        raise RateLimitBackendError(str(e)) from e


def client_ip(req) -> str:
    """Best-effort client IP from a Cloud Functions (Flask) request.

    On Cloud Run the only trustworthy entry in X-Forwarded-For is the LAST hop,
    which Google's front end (GFE) appends itself. Everything before it is
    client-supplied and therefore spoofable, so a caller could forge the first
    element to dodge or poison rate limiting. We take the last element instead.
    """
    fwd = req.headers.get("X-Forwarded-For", "")
    if fwd:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return getattr(req, "remote_addr", None) or "unknown"
