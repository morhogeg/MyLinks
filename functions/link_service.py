"""
Link Service
Handles Firestore operations for links and users.
"""

import secrets
import logging
from datetime import datetime, timezone
from typing import Optional

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from db import get_db
from log_safe import mask_uid

logger = logging.getLogger(__name__)

# How many of the user's tags may ride into a Gemini analysis prompt. Mirrors
# main.MAX_TAGS, which caps the client-supplied `existingTags` on the twin path
# — the server-side builder (get_user_tags) went uncapped until 2026-07-27.
MAX_PROMPT_TAGS = 50

# Categories are a much smaller vocabulary than tags by design — one per card,
# high-level, meant to be reused. A cap well below MAX_PROMPT_TAGS keeps the
# reuse list short enough that the model treats it as a menu rather than as
# noise; a long list of near-duplicates would defeat the point.
MAX_PROMPT_CATEGORIES = 20

# Defaults for a brand-new workspace. Mirrors DEFAULT_SETTINGS in
# web/lib/useUserSettings.ts — keep the two in sync.
DEFAULT_USER_SETTINGS = {
    "theme": "dark",
    "daily_digest": False,
    "reminders_enabled": True,
    "reminder_frequency": "smart",
    # Push flips true client-side once the user grants the OS permission.
    "push_enabled": False,
    "reminders_channel": ["push"],
    # Weekly digest is ON by default for NEW workspaces (retention loop). This
    # default is only written into a brand-new user doc; existing users keep
    # whatever they had (a missing digest_enabled is treated as off by
    # digest_service.run — see the `if not settings.get("digest_enabled")`
    # guards), so nobody is force-enabled retroactively.
    "digest_enabled": True,
    "digest_frequency": "weekly",
    "digest_channels": ["push"],
    "digest_mode": "smart",
    "digest_topics": [],
    "digest_topic": None,
    "digest_count": 5,
    "digest_hour": 9,
    "digest_minute": 0,
    "digest_day": 0,
    "digest_skip_empty": True,
    # Weekly synthesis (M12) — its own toggle, independent of the digest.
    "synthesis_enabled": False,
    "synthesis_day": 6,  # Sunday, at the digest hour
}


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
        .where(filter=FieldFilter('authUids', 'array_contains', auth_uid))
        .limit(1)
        .get()
    )
    if docs:
        return docs[0].id
    return None


def create_workspace(auth_uid: str, email: Optional[str] = None) -> str:
    """Create a fresh, empty workspace for a brand-new signed-in account.

    Legacy data docs are keyed by phone number, but nothing requires that for
    new users — the doc ID is the Firebase Auth uid (collision-free, known at
    sign-in; WhatsApp/phone linking can be layered on later by setting the
    phone fields on this same doc). The doc carries `authUids` so every
    existing lookup path (rules, `find_data_uid_by_auth_uid`) works unchanged.

    Idempotent: if the doc already exists (e.g. a retried partial create), the
    account is merge-linked instead of overwritten. Also mints the ingest token
    so the iOS Share Extension works immediately for the new workspace.
    """
    db = get_db()
    user_ref = db.collection('users').document(auth_uid)
    snapshot = user_ref.get()

    if snapshot.exists:
        update = {'authUids': firestore.ArrayUnion([auth_uid])}
        if email and not (snapshot.to_dict() or {}).get('email'):
            update['email'] = email
        user_ref.set(update, merge=True)
        logger.info("Re-linked existing doc as workspace for new account")
    else:
        doc = {
            'authUids': [auth_uid],
            'createdAt': int(datetime.now(timezone.utc).timestamp() * 1000),
            'settings': dict(DEFAULT_USER_SETTINGS),
            # First-run onboarding pending; the client flips this to True.
            'onboarded': False,
        }
        if email:
            doc['email'] = email
        user_ref.set(doc)
        logger.info("Created fresh workspace for new account")

    # Share Extension auth — mint the token now so the share sheet works
    # before the user ever opens Settings.
    ensure_ingest_token(auth_uid)
    return auth_uid


def delete_user_data(uid: str) -> int:
    """Hard-delete a user's Firestore workspace: the links/chats/collections
    subcollections and the top-level user doc. Returns the number of documents
    deleted (best-effort). Storage objects are removed separately by the caller.
    """
    db = get_db()
    user_ref = db.collection('users').document(uid)
    deleted = 0
    # 'syntheses' holds the M12 weekly recaps at users/{uid}/syntheses/{week_id};
    # they're a subcollection so they survive the parent user doc's deletion and
    # must be swept explicitly.
    for sub in ('links', 'chats', 'collections', 'syntheses'):
        for doc in user_ref.collection(sub).stream():
            doc.reference.delete()
            deleted += 1
    # Any queued processing rows for this user.
    for doc in db.collection('pending_processing').where(filter=FieldFilter('uid', '==', uid)).stream():
        doc.reference.delete()
        deleted += 1
    # Background-processing heartbeats for this user. The uid is stored nested
    # under `data.uid` (see log_to_firestore in main.py), so query on that path.
    for doc in db.collection('task_logs').where(filter=FieldFilter('data.uid', '==', uid)).stream():
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


# ── Category canonicalisation ────────────────────────────────────────────────
#
# ONE spelling per category, in Title Case. Categories used to be stored exactly
# as the model or the user wrote them, so `sports` and `Sports` were two
# categories with two counts and two chips in the filter sheet (owner,
# 2026-08-05). Matching is case-insensitive now and the stored form is always
# canonical, so a category can only exist once.
#
# MIRRORED IN `web/lib/category.ts` (canonicalCategory). Both sides write
# categories — this one when analysis produces one, the client when the user
# edits one — so they must agree or each would re-split what the other merged.
# tests/test_category_case.py reads the TS file and asserts the two lists match.

# Kept fully upper-case: title-casing alone gives "Tv Series", which reads as a
# typo. Deliberately short — anything here overrides normal casing wherever it
# appears, so only forms plausible as a category word belong.
_CATEGORY_ACRONYMS = {
    "AI", "API", "AR", "VR", "UI", "UX", "TV", "US", "UK", "EU", "DIY",
    "F1", "NBA", "NFL", "PC", "IT", "HR",
}

# Kept lower-case unless they lead, so "cost of living" becomes "Cost of Living"
# rather than the robotic "Cost Of Living".
_CATEGORY_MINOR_WORDS = {
    "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor",
    "of", "on", "or", "the", "to", "vs", "with",
}


def category_key(category: str) -> str:
    """The key two categories share when they differ only by case or spacing."""
    return " ".join((category or "").split()).lower()


def canonical_category(category: str) -> str:
    """Canonical Title Case form. Empty input returns '' — callers own the
    fallback ('General' on the write paths), so this never invents one."""
    cleaned = " ".join((category or "").split())
    if not cleaned:
        return ""

    out = []
    for i, word in enumerate(cleaned.split(" ")):
        bare = word.lower()
        if bare.upper() in _CATEGORY_ACRONYMS:
            out.append(bare.upper())
        elif i > 0 and bare in _CATEGORY_MINOR_WORDS:
            out.append(bare)
        else:
            # Hyphenated compounds capitalise each part ("Sci-Fi"); taking the
            # rest from the lowered form makes "SPORTS" normalise like "sports".
            out.append("-".join(p[:1].upper() + p[1:] for p in bare.split("-")))
    return " ".join(out)


# One-shot backfill id. Bumping it re-runs the migration for everybody, so
# only bump it if the canonical form itself changes in a way that needs
# re-applying — normal ACRONYMS edits do not (new saves pick them up, and
# re-running would rewrite every card for a cosmetic tweak).
CATEGORY_MIGRATION_ID = "category_case_v1"


def migrate_user_categories(uid: str) -> dict:
    """Canonicalise one workspace's categories, merging case-variants.

    Groups the user's cards by `category_key`, so `sports` and `Sports` land in
    the same bucket, then rewrites every card in a bucket to the canonical Title
    Case spelling. Cards already canonical are left untouched, which makes this
    idempotent and cheap to re-run.

    Deliberately DERIVES the target rather than picking the best-looking
    existing spelling: the owner asked for Title Case, and deriving is
    predictable. Where a well-cased variant already exists (`International
    Relations` beside `international relations`) the derived form equals it, so
    nothing is renamed — and `_CATEGORY_ACRONYMS` is the escape hatch for
    spellings plain title-casing would get wrong.
    """
    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    updated = 0
    merged = {}

    for doc in links_ref.stream():
        current = (doc.to_dict() or {}).get("category")
        if not isinstance(current, str) or not current.strip():
            continue
        target = canonical_category(current)
        if not target or target == current:
            continue
        doc.reference.update({"category": target})
        updated += 1
        merged.setdefault(target, set()).add(current)

    return {
        "cardsUpdated": updated,
        # {canonical: [old spellings folded into it]} — the audit trail for what
        # this actually merged, so a surprising result is explainable later.
        "merges": {k: sorted(v) for k, v in merged.items()},
    }


def run_category_migration() -> dict:
    """Run `migrate_user_categories` for every workspace, exactly once.

    Guarded by a single global marker doc rather than a per-user flag: the
    scheduled caller fires every few minutes forever, and this way the steady
    state costs ONE document read per tick instead of one per user. New
    workspaces never need it — categories are canonicalised on write.

    Never raises: this rides a scheduled job whose real work must not fail
    because a backfill hiccuped. A per-user error is recorded and skipped, and
    the marker is only set when the pass completes.
    """
    db = get_db()
    marker = db.collection("migrations").document(CATEGORY_MIGRATION_ID)
    try:
        snap = marker.get()
        if snap.exists and (snap.to_dict() or {}).get("done"):
            return {"skipped": True}
    except Exception as e:
        logger.warning("Category migration marker unreadable (skipping): %s", e)
        return {"skipped": True, "error": str(e)[:200]}

    report = {"users": 0, "cardsUpdated": 0, "errors": []}
    try:
        for user_doc in db.collection("users").stream():
            report["users"] += 1
            try:
                result = migrate_user_categories(user_doc.id)
                report["cardsUpdated"] += result["cardsUpdated"]
            except Exception as e:
                # One broken workspace must not block the rest.
                report["errors"].append(str(e)[:200])
                logger.warning("Category migration failed for a workspace: %s", e)

        marker.set({
            "done": True,
            "at": int(datetime.now(timezone.utc).timestamp() * 1000),
            "cardsUpdated": report["cardsUpdated"],
            "users": report["users"],
        })
        logger.info("Category migration complete: %s cards across %s workspaces",
                    report["cardsUpdated"], report["users"])
    except Exception as e:
        # Marker stays unset, so the next tick retries.
        logger.error("Category migration pass failed: %s", e)
        report["errors"].append(str(e)[:200])
    return report


def get_user_tags(uid: str) -> list:
    """The user's tag vocabulary, for the "reuse these tags" half of the
    analysis prompt.

    PRIVACY (2026-07-27): this list is interpolated into EVERY Gemini analysis
    prompt, so it is the one field that travels with an unrelated save. Two
    rules follow from that, and both are load-bearing:

      * Tags that exist ONLY on effectively-private cards are dropped. Tags are
        the most self-describing data in the app ("fertility", "layoff"), and
        a private card's vocabulary must not ride along with a public save —
        the same promise `search.strip_private_cards` enforces for Ask. A tag
        the user also applied to a non-private card stays: it is already part
        of their open vocabulary and withholding it would only fragment tagging.
      * The result is CAPPED and ranked by usage instead of returned whole.
        The old version returned every tag ever created, alphabetically, so the
        prompt grew without bound and an `a`-heavy vocabulary crowded out the
        tags actually worth reusing. MAX_PROMPT_TAGS mirrors main._sanitize_tags'
        MAX_TAGS, which has always capped the client-supplied twin of this list.

    Ties break alphabetically so the list is deterministic run to run.
    """
    # Lazy import: `search` pulls in ai_service/genai, and this module is
    # imported on cold paths that never need them (house pattern — see
    # digest_service's lazy ai_service/push_service imports).
    from search import is_effectively_private, private_collection_ids

    db = get_db()
    links_ref = db.collection('users').document(uid).collection('links')
    docs = links_ref.get()

    private_ids = private_collection_ids(uid)
    counts = {}
    for doc in docs:
        data = doc.to_dict() or {}
        if is_effectively_private(data, private_ids):
            continue
        link_tags = data.get('tags') or []
        if not isinstance(link_tags, list):
            continue
        for tag in link_tags:
            if isinstance(tag, str) and tag.strip():
                counts[tag] = counts.get(tag, 0) + 1

    # Counting only non-private cards gives the private-only exclusion for
    # free: a tag shared with a public card still lands here, with the private
    # card's use of it simply not counted toward its rank.
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [tag for tag, _ in ranked[:MAX_PROMPT_TAGS]]


def get_user_vocabulary(uid: str) -> tuple:
    """The user's tag AND category vocabulary, from ONE pass over their cards.

    Categories drifted because the analysis prompt had never been told which
    ones already exist: tags got an "Existing Tags" list with a reuse rule,
    categories got nothing, so every card invented one from scratch (owner,
    2026-08-05 — a household-economics article landed in "Business").

    Same privacy contract as `get_user_tags`, for the same reason: this list is
    interpolated into every Gemini prompt, so categories that exist ONLY on
    effectively-private cards are dropped. Ranked by usage, capped, ties broken
    alphabetically. Returns `(tags, categories)`.

    Deliberately one function rather than two: both come from the same full
    collection read, and a separate `get_user_categories` would double the
    Firestore cost of every save.
    """
    from search import is_effectively_private, private_collection_ids

    db = get_db()
    links_ref = db.collection('users').document(uid).collection('links')
    docs = links_ref.get()

    private_ids = private_collection_ids(uid)
    tag_counts = {}
    cat_counts = {}
    for doc in docs:
        data = doc.to_dict() or {}
        if is_effectively_private(data, private_ids):
            continue
        link_tags = data.get('tags') or []
        if isinstance(link_tags, list):
            for tag in link_tags:
                if isinstance(tag, str) and tag.strip():
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
        category = data.get('category')
        if isinstance(category, str) and category.strip():
            cat_counts[category.strip()] = cat_counts.get(category.strip(), 0) + 1

    def _ranked(counts, cap):
        return [k for k, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:cap]]

    return _ranked(tag_counts, MAX_PROMPT_TAGS), _ranked(cat_counts, MAX_PROMPT_CATEGORIES)


def get_user_categories(uid: str) -> list:
    """The user's category vocabulary alone. Prefer `get_user_vocabulary` when
    the caller also needs tags — this re-scans the collection on its own."""
    return get_user_vocabulary(uid)[1]


def is_hebrew(text: str) -> bool:
    """Check if text contains Hebrew characters."""
    return any("\u0590" <= char <= "\u05FF" for char in text)


# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
# Share Ingestion (iOS Share Extension / browser extension)
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
    logger.info(f"Generated new ingest token for user {mask_uid(uid)}")
    return token


def find_user_by_ingest_token(token: str) -> Optional[str]:
    """Look up a user UID by their ingest token."""
    if not token:
        return None
    db = get_db()
    docs = db.collection('users').where(filter=FieldFilter('ingestToken', '==', token)).limit(1).get()
    if docs:
        return docs[0].id
    return None


def link_exists_for_url(uid: str, url: str) -> bool:
    """Return True if the user already has a saved link with this exact URL."""
    if not url:
        return False
    db = get_db()
    links_ref = db.collection('users').document(uid).collection('links')
    docs = links_ref.where(filter=FieldFilter('url', '==', url)).limit(1).get()
    return len(docs) > 0


def pending_exists_for_url(uid: str, url: str) -> bool:
    """Return True if there's already a queued/processing item for this URL."""
    if not url:
        return False
    db = get_db()
    docs = (
        db.collection('pending_processing')
        .where(filter=FieldFilter('uid', '==', uid))
        .where(filter=FieldFilter('url', '==', url))
        .limit(1)
        .get()
    )
    return len(docs) > 0
