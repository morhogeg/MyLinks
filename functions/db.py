"""
Database Initialization Module
Consolidates Firestore client access into a single module.
"""

from firebase_admin import initialize_app, firestore

_db = None


def ensure_app():
    """Initialize the default Firebase app if it isn't already.

    Must run before ANY firebase_admin call, not just Firestore ones —
    `auth.verify_id_token` also needs the default app and raises
    "The default Firebase app does not exist" without it. Token verification
    happens before the first `get_db()` on every authenticated endpoint, so
    relying on `get_db()` to initialize left a cold instance unable to verify
    any ID token (it 401'd instead, and the caught exception left no trace).
    """
    try:
        from firebase_admin import get_app
        get_app()
    except ValueError:
        initialize_app()


def get_db():
    """Get the Firestore client singleton."""
    global _db
    if _db is None:
        ensure_app()
        _db = firestore.client()
    return _db
