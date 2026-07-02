"""
Link Service
Handles Firestore operations for links and users.
"""

import re
import secrets
import logging
from typing import Optional

from db import get_db

logger = logging.getLogger(__name__)


def find_user_by_phone(phone_number: str) -> Optional[str]:
    """
    Look up user UID by phone number in Firestore.
    Robust matching: searches both 'phone_number' and 'phoneNumber'.
    """
    db = get_db()
    clean_number = re.sub(r'\D', '', phone_number)

    logger.info(f"Searching for user with normalized phone: {clean_number}")

    users_ref = db.collection('users')

    formats = [f"+{clean_number}", clean_number]
    fields = ['phone_number', 'phoneNumber']

    for field in fields:
        for val in formats:
            query = users_ref.where(field, '==', val).limit(1)
            docs = query.get()
            if docs:
                logger.info(f"Found user {docs[0].id} via {field}={val}")
                return docs[0].id

    logger.warning(f"User not found for phone: {phone_number} (normalized: {clean_number})")
    return None


def find_data_uid_by_auth_uid(auth_uid: str) -> Optional[str]:
    """Resolve the data-doc ID (phone-number key) for a Firebase Auth uid.

    Data docs are keyed by phone number, not the Auth uid; a signed-in account
    is linked to its workspace via the `authUids` array (see AUTH_SPEC.md). The
    backend must NEVER trust a client-supplied data uid — it derives it here from
    the verified Auth uid instead.
    """
    if not auth_uid:
        return None
    db = get_db()
    docs = (
        db.collection('users')
        .where('authUids', 'array_contains', auth_uid)
        .limit(1)
        .get()
    )
    if docs:
        return docs[0].id
    return None


def delete_user_data(uid: str) -> int:
    """Hard-delete a user's Firestore workspace: the links/chats/collections
    subcollections and the top-level user doc. Returns the number of documents
    deleted (best-effort). Storage objects are removed separately by the caller.
    """
    db = get_db()
    user_ref = db.collection('users').document(uid)
    deleted = 0
    for sub in ('links', 'chats', 'collections'):
        for doc in user_ref.collection(sub).stream():
            doc.reference.delete()
            deleted += 1
    # Any queued processing rows for this user.
    for doc in db.collection('pending_processing').where('uid', '==', uid).stream():
        doc.reference.delete()
        deleted += 1
    user_ref.delete()
    deleted += 1
    logger.info(f"Deleted {deleted} docs for user workspace")
    return deleted


def save_link_to_firestore(uid: str, link_data: dict) -> str:
    """Save a new link document to Firestore."""
    db = get_db()
    doc_ref = db.collection('users').document(uid).collection('links').document()
    doc_ref.set(link_data)
    return doc_ref.id


def get_user_tags(uid: str) -> list:
    """Get all unique tags for a user from Firestore."""
    db = get_db()
    links_ref = db.collection('users').document(uid).collection('links')
    docs = links_ref.get()

    tags = set()
    for doc in docs:
        link_tags = doc.to_dict().get('tags', [])
        for tag in link_tags:
            tags.add(tag)

    return sorted(list(tags))


def is_hebrew(text: str) -> bool:
    """Check if text contains Hebrew characters."""
    return any("\u0590" <= char <= "\u05FF" for char in text)


# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
# Share Ingestion (iOS Shortcut / share sheet)
# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

def ensure_ingest_token(uid: str) -> str:
    """
    Return the user's personal ingest token, generating and persisting one
    on first use. This token authenticates share-sheet POSTs to share_ingest.
    """
    db = get_db()
    user_ref = db.collection('users').document(uid)
    snapshot = user_ref.get()

    if snapshot.exists:
        token = snapshot.to_dict().get('ingestToken')
        if token:
            return token

    token = secrets.token_urlsafe(24)
    user_ref.set({'ingestToken': token}, merge=True)
    logger.info(f"Generated new ingest token for user {uid}")
    return token


def find_user_by_ingest_token(token: str) -> Optional[str]:
    """Look up a user UID by their ingest token."""
    if not token:
        return None
    db = get_db()
    docs = db.collection('users').where('ingestToken', '==', token).limit(1).get()
    if docs:
        return docs[0].id
    return None


def link_exists_for_url(uid: str, url: str) -> bool:
    """Return True if the user already has a saved link with this exact URL."""
    if not url:
        return False
    db = get_db()
    links_ref = db.collection('users').document(uid).collection('links')
    docs = links_ref.where('url', '==', url).limit(1).get()
    return len(docs) > 0


def pending_exists_for_url(uid: str, url: str) -> bool:
    """Return True if there's already a queued/processing item for this URL."""
    if not url:
        return False
    db = get_db()
    docs = (
        db.collection('pending_processing')
        .where('uid', '==', uid)
        .where('url', '==', url)
        .limit(1)
        .get()
    )
    return len(docs) > 0
