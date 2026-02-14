"""
Database Initialization Module
Consolidates Firestore client access into a single module.
"""

from firebase_admin import initialize_app, firestore

_db = None


def get_db():
    """Get the Firestore client singleton."""
    global _db
    if _db is None:
        try:
            from firebase_admin import get_app
            get_app()
        except ValueError:
            initialize_app()
        _db = firestore.client()
    return _db
