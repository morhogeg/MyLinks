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


def _safe_key(key: str) -> str:
    # Firestore document IDs can't contain '/' and have a length cap.
    return key.replace("/", "_")[:1400]


def check_rate_limit(
    key: str, limit: int, window_seconds: int, fail_closed: bool = False
) -> bool:
    """Return True if the call is allowed, False if the limit is exceeded.

    On a backend error the behavior depends on `fail_closed`:
    - `fail_closed=False` (default): fail OPEN (return True) so a transient
      Firestore problem degrades to "no rate limiting" rather than taking a
      cheap endpoint down.
    - `fail_closed=True`: fail CLOSED (return False). Use this for the paid
      Gemini buckets — a Firestore blip must NOT silently disable throttling on
      the money-spending endpoints (that turns a transient error into unbounded
      spend).
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
        mode = "failing closed" if fail_closed else "failing open"
        logger.error("Rate limit check failed (%s): %s", mode, e)
        return not fail_closed


def client_ip(req) -> str:
    """Best-effort client IP for rate-limit keying.

    NOTE: `X-Forwarded-For` is a chain `<client-supplied…>, <infra-appended>`.
    The LEFTMOST entries are attacker-controlled (a client can send any
    `X-Forwarded-For` and the platform appends to the right), so keying on the
    leftmost value lets an attacker rotate it to defeat every limit. We instead
    take the RIGHTMOST hop, which is appended by Google's front end and cannot
    be forged by the client. This is still only best-effort — the durable fix is
    per-uid keying on authenticated endpoints (see `rate_limit_identity`).
    """
    fwd = req.headers.get("X-Forwarded-For", "")
    if fwd:
        hops = [h.strip() for h in fwd.split(",") if h.strip()]
        if hops:
            return hops[-1]
    return getattr(req, "remote_addr", None) or "unknown"


def rate_limit_identity(req, uid: str = None) -> str:
    """Identity to key a rate-limit bucket on.

    Prefer the verified workspace `uid` when the caller is authenticated (a
    stable, un-spoofable identity that also stops one abuser behind a shared IP
    from exhausting everyone's budget). Fall back to the spoof-resistant client
    IP for anonymous callers.
    """
    if uid:
        return f"uid:{uid}"
    return f"ip:{client_ip(req)}"
