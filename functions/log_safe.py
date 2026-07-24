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

__all__ = ["mask_uid"]


def mask_uid(uid) -> str:
    """A non-PII, log-safe tag for a uid: `uid#<8 hex>`.

    Stable for a given uid (so operators can still correlate one user's lines)
    and non-reversible. Mirrors the tag format `main._mask_uid` already emits, so
    masked lines from every module read the same in the log stream.
    """
    if not uid:
        return "uid#none"
    digest = hashlib.sha256(str(uid).encode("utf-8")).hexdigest()[:8]
    return f"uid#{digest}"
