"""
Push Service
============
Delivers native iOS push notifications via Firebase Cloud Messaging (APNs is
bridged automatically — the APNs auth key lives in the Firebase console).

Device tokens are stored on the user doc as `fcmTokens: list[str]`, written
ONLY by the authenticated /api/register-device-token endpoint (main.py) — the
client never writes the field directly. Dead tokens (uninstalled app, expired
registration) are pruned here on send, so the list is self-healing.

Uses the firebase_admin SDK already initialized by db.get_db(); no extra
dependency or init.
"""

import logging
from typing import Optional

from firebase_admin import messaging, exceptions
from google.cloud import firestore

from db import get_db

logger = logging.getLogger(__name__)


def _mask_token(token: str) -> str:
    """Redact an FCM token for logging — a full token is a send-to-this-device
    capability and must never land in logs."""
    s = str(token or "")
    return f"{s[:6]}…{s[-4:]}" if len(s) > 12 else "***"


# Notification text ceilings. APNs caps the whole payload at 4 KB and FCM
# rejects an oversized message with INVALID_ARGUMENT for EVERY token in the
# batch; the title/body here come from card titles and model-generated
# synthesis titles, which a hostile page can inflate. Truncating keeps a
# single bad card from killing delivery, and `_is_dead_token` below no longer
# treats a payload rejection as a dead token.
MAX_PUSH_TITLE_CHARS = 200
MAX_PUSH_BODY_CHARS = 500

_CONTROL_CHARS = {c: " " for c in range(0x20)}
_CONTROL_CHARS[0x7F] = " "


def _clean_text(value, limit: int) -> str:
    """Notification text: control characters (incl. newlines) collapsed to a
    space, whitespace squeezed, truncated to `limit`."""
    s = str(value or "").translate(_CONTROL_CHARS)
    s = " ".join(s.split())
    return s[:limit]


def _is_dead_token(exc) -> bool:
    """True when FCM says the TOKEN will never work again (safe to prune).

    INVALID_ARGUMENT is ambiguous: FCM uses it for a malformed registration
    token AND for a rejected payload (too large, bad field). Only the former
    is about the token; pruning on the latter used to drop every device of a
    user whose card title happened to push the payload over the limit."""
    if isinstance(exc, messaging.UnregisteredError):
        return True
    if isinstance(exc, exceptions.FirebaseError):
        if exc.code == "NOT_FOUND":
            return True
        if exc.code == "INVALID_ARGUMENT":
            return "registration token" in str(exc).lower()
    return False


def send_push(uid: str, title: str, body: str, data: Optional[dict] = None) -> dict:
    """Send a push notification to every registered device of `uid`.

    `data` values are coerced to strings (FCM requires string-only data) and
    carry deep-link hints for the app, e.g. {"view": "digest"} or
    {"linkId": "<id>"}. Returns a summary dict:
    {sent, failed, pruned, skipped} — `skipped` is set when nothing was
    attempted (no user / no tokens / transport failure).
    """
    db = get_db()
    user_ref = db.collection("users").document(uid)
    result = {"sent": 0, "failed": 0, "pruned": 0, "skipped": None}

    snap = user_ref.get()
    if not snap.exists:
        result["skipped"] = "no_user"
        return result

    tokens = [
        t for t in ((snap.to_dict() or {}).get("fcmTokens") or [])
        if isinstance(t, str) and t
    ]
    if not tokens:
        result["skipped"] = "no_tokens"
        return result

    str_data = {str(k): str(v) for k, v in (data or {}).items() if v is not None}
    title = _clean_text(title, MAX_PUSH_TITLE_CHARS)
    body = _clean_text(body, MAX_PUSH_BODY_CHARS)

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=str_data,
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound="default", badge=1),
            ),
        ),
    )

    try:
        batch = messaging.send_each_for_multicast(message)
    except Exception as e:
        logger.error(f"Push send failed for user (tokens={len(tokens)}): {e}")
        result["skipped"] = "send_failed"
        result["errors"] = [type(e).__name__]
        return result

    dead = []
    # Error NAMES (never tokens) of the first few failures, so a diagnostic
    # caller can say WHY a send failed — 'ThirdPartyAuthError' is an APNs-key
    # problem, 'UnregisteredError' a dead/mismatched token, 'SenderIdMismatchError'
    # a wrong Firebase config in the app. Without this, every failure collapses
    # into an unactionable count.
    result["errors"] = []
    for token, resp in zip(tokens, batch.responses):
        if resp.success:
            result["sent"] += 1
            continue
        result["failed"] += 1
        exc = resp.exception
        if len(result["errors"]) < 3:
            result["errors"].append(type(exc).__name__ if exc else "UnknownError")
        if _is_dead_token(exc):
            dead.append(token)
        else:
            logger.warning(
                f"Push to {_mask_token(token)} failed (transient): {exc}"
            )

    if dead:
        try:
            user_ref.update({"fcmTokens": firestore.ArrayRemove(dead)})
            result["pruned"] = len(dead)
            logger.info(f"Pruned {len(dead)} dead FCM token(s) for user")
        except Exception as e:
            logger.warning(f"Failed to prune dead FCM tokens: {e}")

    return result
