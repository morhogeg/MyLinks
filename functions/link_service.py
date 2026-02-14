"""
Link Service
Handles Firestore operations for links and users.
"""

import re
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
