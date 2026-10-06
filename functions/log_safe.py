"""Log-safe formatting for identifiers that are PII.

The data-doc uid IS the user's E.164 phone number for the legacy workspace, so
any `logger.info(f"... {uid}")` writes a phone number into Cloud Logging. The
2026-07-14 sweep added a masker to `main.py` but the service modules kept
interpolating the raw uid, so the leak survived in digest / reminder / graph /
search / link paths (AUDIT.md H-4 residue).

This module has no firebase/Firestore imports on purpose: every service module
can import it without any risk of an import cycle.
"""

import hashlib
import hmac
import os

__all__ = ["mask_uid"]


def _mask_key() -> bytes:
    """The key the tag is computed with. A plain hash of a phone number is
    reversible by brute force (the whole Israeli mobile range takes about two
    minutes; launch audit ACCT-9), so the tag is an HMAC under a secret every
    function already has: LOG_MASK_KEY when set, else derived from
    GEMINI_API_KEY (functions/.env, present in every deploy). Rotating that key
    only changes the tags. With neither set (tests, local tools) it falls back
    to the plain hash."""
    material = os.environ.get("LOG_MASK_KEY") or os.environ.get("GEMINI_API_KEY") or ""
    return ("machina-log-mask:" + material).encode("utf-8") if material else b""


def mask_uid(uid) -> str:
    """A non-PII, log-safe tag for a uid: `uid#<8 hex>`.

    Stable for a given uid (so operators can still correlate one user's lines)
    and not reversible without the key. Mirrors the tag format
    `main._mask_uid` already emits, so masked lines from every module read the
    same in the log stream.
    """
    if not uid:
        return "uid#none"
    data = str(uid).encode("utf-8")
    key = _mask_key()
    if key:
        digest = hmac.new(key, data, hashlib.sha256).hexdigest()[:8]
    else:
        digest = hashlib.sha256(data).hexdigest()[:8]
    return f"uid#{digest}"
