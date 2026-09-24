"""Server-side cleanup when a card is deleted (users/{uid}/links/{linkId}).

The client deletes a card with a plain `deleteDoc` (single and bulk), so
nothing on that path could take down the card's public /s page or remove the
screenshots and post thumbnails it stored. The `cleanup_deleted_card` trigger
in main.py calls `cleanup_deleted_card_logic` with the deleted doc's last data.

Rules this module keeps:
  * Idempotent: a retried delivery finds the share already tombstoned and the
    blobs already gone, and does nothing.
  * Never another user's data: a blob is deleted only when its path sits under
    THIS uid's own `screenshots/` or `post_thumbs/` prefix (the legacy
    uid-keyed prefix or the opaque storage key), in this project's bucket.
  * Never a blob still in use: if another of the user's cards references the
    same URL, the blob stays. A failed check keeps the blob (fail safe).
  * Account deletion owns its own sweep: when users/{uid} no longer exists,
    this does nothing (delete_account already removed the shares and every
    blob under the user's prefixes; unpublishing here would re-create an
    owner row for a deleted account).
"""

import logging
import re
from typing import Iterable, List, Optional, Set
from urllib.parse import unquote, urlsplit

from db import get_db
from log_safe import mask_uid

logger = logging.getLogger(__name__)

_STORAGE_HOST = "firebasestorage.googleapis.com"
_OWNED_ROOTS = ("screenshots", "post_thumbs")
# One path segment of the kind the writers mint (uuid hex, task ids, ext).
_SEGMENT_RE = re.compile(r"[A-Za-z0-9_.-]{1,200}")


def card_blob_urls(data: dict) -> List[str]:
    """Every Storage-candidate URL a card references: `url` (a screenshot
    card's image), `imageUrls` (multi-screenshot cards) and
    `metadata.thumbnailUrl` (stored social-post covers). Deduped, in order."""
    urls: List[str] = []
    candidates = [data.get("url")]
    imgs = data.get("imageUrls")
    if isinstance(imgs, list):
        candidates.extend(imgs)
    meta = data.get("metadata")
    if isinstance(meta, dict):
        candidates.append(meta.get("thumbnailUrl"))
    for u in candidates:
        if isinstance(u, str) and u.startswith("https://") and u not in urls:
            urls.append(u)
    return urls


def blob_path_for(url: str, bucket_name: str, owner_keys: Iterable[str]) -> Optional[str]:
    """The object path of a Firebase download URL IF it is one of the owner's
    own screenshots/post thumbnails in `bucket_name`; otherwise None.

    Accepts exactly `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/
    <root>/<key>/<file>` with root in screenshots|post_thumbs and key one of
    `owner_keys`. Anything else (another bucket, another user's key, a nested
    or `..` path, a hotlinked CDN image) is refused."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme != "https" or parts.hostname != _STORAGE_HOST:
        return None
    prefix = f"/v0/b/{bucket_name}/o/"
    if not bucket_name or not parts.path.startswith(prefix):
        return None
    path = unquote(parts.path[len(prefix):])
    segs = path.split("/")
    if len(segs) != 3:
        return None
    root, key, name = segs
    if root not in _OWNED_ROOTS or key not in set(k for k in owner_keys if k):
        return None
    if not _SEGMENT_RE.fullmatch(name) or name in (".", ".."):
        return None
    return path


def _url_still_referenced(links_ref, url: str) -> bool:
    """True when any remaining card of the user references `url`. Raises on a
    query failure so the caller keeps the blob."""
    from google.cloud.firestore_v1.base_query import FieldFilter
    for field, op in (("url", "=="), ("imageUrls", "array_contains"),
                      ("metadata.thumbnailUrl", "==")):
        hits = links_ref.where(filter=FieldFilter(field, op, url)).limit(1).get()
        if list(hits):
            return True
    return False


def _unpublish_card_share(db, uid: str, share_id) -> bool:
    """Take down the card's public page if `uid` still owns a live one."""
    from share_service import _valid_share_id, _delete_share_previews
    if not _valid_share_id(share_id):
        return False
    owner_snap = db.collection("shared_owners").document(share_id).get()
    if not owner_snap.exists:
        return False  # never published, or already swept with the account
    row = owner_snap.to_dict() or {}
    if row.get("ownerUid") != uid or row.get("type") != "card":
        return False
    if row.get("unpublishedAt"):
        return False  # already stopped: idempotent re-delivery
    # Same effect as share_service._unpublish_share_logic (page gone, owner
    # row tombstoned so the id stays this owner's), but the tombstone is an
    # UPDATE, not a merge-set: if account deletion removed the owner row in
    # the meantime, the batch fails instead of re-creating a row that names a
    # deleted account (account deletion then removes the page itself).
    from datetime import datetime, timezone
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    batch = db.batch()
    batch.delete(db.collection("shared_cards").document(share_id))
    batch.update(db.collection("shared_owners").document(share_id), {"unpublishedAt": now_ms})
    batch.commit()
    _delete_share_previews(share_id)
    return True


def cleanup_deleted_card_logic(uid: str, link_id: str, data: Optional[dict]) -> dict:
    """Unpublish the deleted card's share and delete its owned blobs.
    Best-effort per step; returns a small report (for logs and tests)."""
    report = {"unpublished": False, "deleted_blobs": 0, "kept_blobs": 0, "skipped": None}
    if not uid or not isinstance(data, dict):
        report["skipped"] = "no-data"
        return report
    db = get_db()
    user_ref = db.collection("users").document(uid)
    user_snap = user_ref.get()
    if not user_snap.exists:
        # Account deletion in progress/done: it sweeps shares and blobs itself.
        report["skipped"] = "no-user"
        return report

    try:
        report["unpublished"] = _unpublish_card_share(db, uid, data.get("shareId"))
    except Exception as e:
        logger.warning(f"Card-delete unpublish failed for {mask_uid(uid)}/{link_id}: {e}")

    urls = card_blob_urls(data)
    if not urls:
        return report
    storage_key = (user_snap.to_dict() or {}).get("storageKey")
    owner_keys: Set[str] = {uid}
    if isinstance(storage_key, str) and storage_key:
        owner_keys.add(storage_key)
    try:
        from firebase_admin import storage as fb_storage
        bucket = fb_storage.bucket()
    except Exception as e:
        logger.warning(f"Card-delete storage unavailable: {e}")
        return report
    links_ref = user_ref.collection("links")
    for url in urls:
        path = blob_path_for(url, bucket.name, owner_keys)
        if not path:
            continue
        try:
            if _url_still_referenced(links_ref, url):
                report["kept_blobs"] += 1
                continue
        except Exception as e:
            logger.warning(f"Card-delete reference check failed; keeping blob: {e}")
            report["kept_blobs"] += 1
            continue
        try:
            bucket.blob(path).delete()
            report["deleted_blobs"] += 1
        except Exception as e:
            # A missing blob (already deleted, retried delivery) is fine.
            if "404" in str(e) or "NotFound" in type(e).__name__ or "No such object" in str(e):
                continue
            logger.warning(f"Card-delete blob removal failed: {e}")
    return report
