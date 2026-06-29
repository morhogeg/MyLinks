"""One-time data migration: re-home a prototype user's data to a real auth uid.

WHY: the single-user prototype stored data under a Firestore doc id that was NOT
a Firebase Auth uid. When you enable real auth and sign in with Google/Apple,
Firebase mints a *different* uid. Without this migration your links/chats/
settings appear empty after first login.

WHAT IT DOES: copies, under a batch:
  users/{OLD}                         -> users/{NEW}   (top-level fields)
  users/{OLD}/links/**                -> users/{NEW}/links/**
  users/{OLD}/chats/**                -> users/{NEW}/chats/**
  (any other users/{OLD}/* subcollections are copied generically)
Storage screenshots are handled separately (see note at the bottom).

IT DOES NOT delete the old tree — verify first, then delete manually.

HOW TO RUN (locally, with service-account credentials — NOT from the app):
  1. Find your real auth uid: Firebase Console -> Authentication -> Users, after
     signing in once. (Or temporarily console.log(uid) in the web app.)
  2. Back up first:
       gcloud firestore export gs://<your-bucket>/pre-auth-backup
  3. From functions/ with the venv active and GOOGLE_APPLICATION_CREDENTIALS set
     to a service-account key for the project:
       python migrate_user.py --old <OLD_DOC_ID> --new <REAL_AUTH_UID>
     Add --commit to actually write (default is a dry run).
"""

import argparse
import sys

from db import get_db

# Subcollections to copy explicitly (others are auto-discovered too).
KNOWN_SUBCOLLECTIONS = ["links", "chats"]


def _copy_collection(db, src_parent, dst_parent, name, commit):
    """Copy every doc in src_parent/<name> to dst_parent/<name>. Returns count."""
    src = src_parent.collection(name)
    dst = dst_parent.collection(name)
    count = 0
    batch = db.batch()
    for doc in src.stream():
        batch.set(dst.document(doc.id), doc.to_dict())
        count += 1
        # Firestore batches cap at 500 ops; flush periodically.
        if commit and count % 400 == 0:
            batch.commit()
            batch = db.batch()
    if commit and count % 400 != 0:
        batch.commit()
    return count


def migrate(old_uid, new_uid, commit):
    db = get_db()
    old_ref = db.collection("users").document(old_uid)
    new_ref = db.collection("users").document(new_uid)

    old_snap = old_ref.get()
    if not old_snap.exists:
        print(f"ERROR: source user doc users/{old_uid} does not exist.")
        sys.exit(1)
    if new_ref.get().exists:
        print(f"WARNING: target users/{new_uid} already exists; fields will be merged.")

    print(f"{'COMMIT' if commit else 'DRY RUN'}: users/{old_uid} -> users/{new_uid}")

    # 1) Top-level user fields (settings, email, phone_number, timezone, ingestToken…)
    fields = old_snap.to_dict() or {}
    print(f"  user doc fields: {list(fields.keys())}")
    if commit:
        new_ref.set(fields, merge=True)

    # 2) Subcollections — known ones plus any others present.
    names = list(dict.fromkeys(KNOWN_SUBCOLLECTIONS + [c.id for c in old_ref.collections()]))
    for name in names:
        n = _copy_collection(db, old_ref, new_ref, name, commit)
        print(f"  {name}: {n} docs")

    print("Done." if commit else "Dry run complete — re-run with --commit to apply.")
    print(
        "\nNEXT: 1) verify the new tree in the console; "
        "2) re-home Storage screenshots: gsutil -m cp -r "
        f"gs://<bucket>/screenshots/{old_uid} gs://<bucket>/screenshots/{new_uid}; "
        "3) re-run backfill_embeddings.py if link embeddings need regenerating; "
        "4) delete the old users/" + old_uid + " tree once satisfied."
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Re-home prototype user data to a real auth uid.")
    p.add_argument("--old", required=True, help="Existing Firestore user doc id (prototype uid)")
    p.add_argument("--new", required=True, help="Real Firebase Auth uid to migrate to")
    p.add_argument("--commit", action="store_true", help="Apply changes (default: dry run)")
    args = p.parse_args()
    migrate(args.old, args.new, args.commit)
