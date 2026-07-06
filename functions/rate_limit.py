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
import ipaddress
import logging

from google.cloud import firestore

from db import get_db

logger = logging.getLogger(__name__)

_COLLECTION = "rate_limits"


def _safe_key(key: str) -> str:
    # Firestore document IDs can't contain '/' and have a length cap.
    return key.replace("/", "_")[:1400]


def check_rate_limit(key: str, limit: int, window_seconds: int,
                     fail_closed: bool = False) -> bool:
    """Return True if the call is allowed, False if the limit is exceeded.

    On a backend error the default is to fail OPEN (return True), so a transient
    Firestore problem degrades to "no rate limiting" rather than taking the
    endpoint down. Pass `fail_closed=True` for buckets where unlimited traffic
    is worse than downtime — the paid Gemini endpoints deny requests during a
    Firestore outage instead of becoming a cost-abuse hole (audit M7).
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
        logger.error("Rate limit check failed (failing %s): %s",
                     "closed" if fail_closed else "open", e)
        return not fail_closed


def client_ip(req) -> str:
    """Best-effort client IP, resistant to X-Forwarded-For spoofing.

    The old implementation returned the LEFTMOST X-Forwarded-For value, which is
    fully client-controlled: an attacker can send any `X-Forwarded-For: 1.2.3.4`
    and rotate it to reset the per-IP rate-limit window (cost-abuse on the paid
    Gemini endpoints). On GCP the front end APPENDS the real peer IP to the right
    of the header, so any values the client injects sit to the left. We walk the
    header from the right and return the first PUBLIC IP, skipping internal proxy
    hops, and fall back to the socket peer. The client can prepend spoofed
    entries but cannot control the rightmost, infra-appended one.
    """
    fwd = req.headers.get("X-Forwarded-For", "") or ""
    parts = [p.strip() for p in fwd.split(",") if p.strip()]
    for candidate in reversed(parts):
        ip_str = candidate
        if ip_str.startswith("["):          # [IPv6]:port
            ip_str = ip_str[1:].split("]")[0]
        elif ip_str.count(":") == 1:        # IPv4:port
            ip_str = ip_str.split(":")[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if not (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_unspecified):
            return str(ip)
    # No public IP in the chain — fall back to the socket peer.
    return getattr(req, "remote_addr", None) or "unknown"
