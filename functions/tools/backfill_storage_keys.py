"""Backfill: move a workspace's Storage objects off the uid-keyed prefix.

New images are written under `screenshots/{storageKey}/` and
`post_thumbs/{storageKey}/` (link_service.storage_key_for), where storageKey
is a random per-workspace value on the user doc. Objects written before
2026-09-16 still live under `screenshots/{uid}/` and `post_thumbs/{uid}/`,
and for the phone-keyed owner workspace their public download URLs (which
reach world-readable share snapshots) therefore carry the phone number.

Per workspace this script:
  1. mints `storageKey` on the user doc if absent;
  2. copies every blob under the two uid prefixes to the storageKey prefix
     with a FRESH download token;
  3. rewrites every stored URL that pointed at an old blob:
       users/{uid}/links/*    url, imageUrls[], metadata.thumbnailUrl
       users/{uid}/digests/*  cards[].thumbnailUrl / cards[].url
       shared_cards / shared_collections owned by the workspace
                              card.url, card.thumbnailUrl, cards[].url,
                              cards[].thumbnailUrl
  4. leaves the old blobs in place (delete them with --delete-old on a later
     run, once the app has been seen serving the new URLs).

Idempotent: a blob already copied is skipped, a URL already rewritten is
left alone. Dry run by default.

Owner-run (or via the Maintenance workflow), needs prod credentials:
    python tools/backfill_storage_keys.py <uid>                 # dry run
    python tools/backfill_storage_keys.py --all                 # every workspace, dry run
    python tools/backfill_storage_keys.py --all --apply
    python tools/backfill_storage_keys.py --all --apply --delete-old
The bucket is read from an existing stored URL (--bucket <name> overrides).

Public repo => stdout stays structural (counts); no uid, URL or title is printed.
"""

import os
import secrets
import sys
import uuid
from urllib.parse import quote

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import firebase_admin  # noqa: E402
from firebase_admin import firestore, storage  # noqa: E402

PROJECT = "secondbrain-app-94da2"
PREFIXES = ("screenshots", "post_thumbs")


def _token_url(bucket_name: str, path: str, token: str) -> str:
    return (f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
            f"{quote(path, safe='')}?alt=media&token={token}")


def _rewrite(value, mapping):
    """Rewrite one URL-ish value through `mapping` (old url -> new url)."""
    if isinstance(value, str):
        return mapping.get(value, value)
    return value


def _bucket_from_stored_urls(db) -> str:
    """The bucket name every stored image URL already names."""
    import re
    for user in db.collection("users").limit(50).stream():
        for snap in user.reference.collection("links").limit(200).stream():
            data = snap.to_dict() or {}
            for cand in [data.get("url"), (data.get("metadata") or {}).get("thumbnailUrl")] + list(data.get("imageUrls") or []):
                m = re.match(r"https://firebasestorage\.googleapis\.com/v0/b/([^/]+)/o/", str(cand or ""))
                if m:
                    return m.group(1)
    raise SystemExit("No stored Storage URL found to read the bucket from; pass --bucket <name>")


def main() -> int:
    argv = sys.argv[1:]
    bucket_name = None
    if "--bucket" in argv:
        i = argv.index("--bucket")
        bucket_name = argv[i + 1]
        del argv[i:i + 2]
    args = [a for a in argv if not a.startswith("--")]
    everyone = "--all" in argv
    if not args and not everyone:
        print(__doc__)
        return 2
    apply = "--apply" in argv
    delete_old = "--delete-old" in argv

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()
    if not bucket_name:
        bucket_name = _bucket_from_stored_urls(db)
    bucket = storage.bucket(bucket_name)

    uids = [args[0]] if args else [d.id for d in db.collection("users").stream()]
    print(f"workspaces={len(uids)} mode={'apply' if apply else 'dry-run'}")
    rc = 0
    for uid in uids:
        try:
            _migrate_one(db, bucket, uid, apply, delete_old)
        except Exception as e:  # keep going; one bad workspace must not stop the rest
            print(f"workspace failed: {type(e).__name__}")
            rc = 1
    return rc


def _migrate_one(db, bucket, uid: str, apply: bool, delete_old: bool) -> None:
    user_ref = db.collection("users").document(uid)
    user = user_ref.get().to_dict() or {}
    key = user.get("storageKey")
    if not isinstance(key, str) or not key:
        key = secrets.token_hex(16)
        print("storageKey: minting" + ("" if apply else " (dry run)"))
        if apply:
            user_ref.set({"storageKey": key}, merge=True)

    # 1. Copy blobs, building old-url -> new-url. The old URL's token is in
    #    the blob metadata, so the exact stored URL can be reconstructed.
    mapping = {}
    copied = 0
    for kind in PREFIXES:
        for blob in bucket.list_blobs(prefix=f"{kind}/{uid}/"):
            old_token = (blob.metadata or {}).get("firebaseStorageDownloadTokens")
            if not old_token:
                continue
            name = blob.name.split("/")[-1]
            new_path = f"{kind}/{key}/{name}"
            new_blob = bucket.blob(new_path)
            new_token = uuid.uuid4().hex
            if new_blob.exists():
                new_blob.reload()
                new_token = (new_blob.metadata or {}).get("firebaseStorageDownloadTokens") or new_token
            elif apply:
                copy = bucket.copy_blob(blob, bucket, new_path)
                copy.metadata = {"firebaseStorageDownloadTokens": new_token}
                copy.patch()
            for tok in str(old_token).split(","):
                mapping[_token_url(bucket.name, blob.name, tok)] = _token_url(bucket.name, new_path, new_token)
            copied += 1
    print(f"blobs={copied} mapped_urls={len(mapping)}")
    if not mapping:
        return

    # 2. Rewrite Firestore references.
    rewritten = 0

    def _fix_card(card: dict) -> bool:
        changed = False
        for f in ("url", "thumbnailUrl"):
            if f in card and _rewrite(card[f], mapping) != card[f]:
                card[f] = _rewrite(card[f], mapping); changed = True
        if isinstance(card.get("imageUrls"), list):
            new = [_rewrite(u, mapping) for u in card["imageUrls"]]
            if new != card["imageUrls"]:
                card["imageUrls"] = new; changed = True
        meta = card.get("metadata")
        if isinstance(meta, dict) and "thumbnailUrl" in meta:
            new = _rewrite(meta["thumbnailUrl"], mapping)
            if new != meta["thumbnailUrl"]:
                meta["thumbnailUrl"] = new; changed = True
        return changed

    for snap in user_ref.collection("links").stream():
        data = snap.to_dict() or {}
        if _fix_card(data):
            rewritten += 1
            if apply:
                snap.reference.update({k: data[k] for k in ("url", "imageUrls", "metadata") if k in data})
    for snap in user_ref.collection("digests").stream():
        data = snap.to_dict() or {}
        cards = data.get("cards")
        # A list, not any(): every card must be rewritten, not just the first.
        if isinstance(cards, list) and any([_fix_card(c) for c in cards if isinstance(c, dict)]):
            rewritten += 1
            if apply:
                snap.reference.update({"cards": cards})
    owners = db.collection("shared_owners").where("ownerUid", "==", uid).stream()
    for owner in owners:
        share_type = (owner.to_dict() or {}).get("type")
        coll = {"card": "shared_cards", "collection": "shared_collections"}.get(share_type)
        if not coll:
            continue
        ref = db.collection(coll).document(owner.id)
        data = ref.get().to_dict() or {}
        changed = False
        if isinstance(data.get("card"), dict):
            changed = _fix_card(data["card"]) or changed
        if isinstance(data.get("cards"), list):
            for c in data["cards"]:
                if isinstance(c, dict):
                    changed = _fix_card(c) or changed
        if changed:
            rewritten += 1
            if apply:
                ref.update({k: data[k] for k in ("card", "cards") if k in data})
    print(f"docs_rewritten={rewritten} mode={'apply' if apply else 'dry-run'}")

    # 3. Optionally delete the old blobs.
    if apply and delete_old:
        removed = 0
        for kind in PREFIXES:
            for blob in bucket.list_blobs(prefix=f"{kind}/{uid}/"):
                blob.delete(); removed += 1
        print(f"old_blobs_deleted={removed}")


if __name__ == "__main__":
    sys.exit(main())
