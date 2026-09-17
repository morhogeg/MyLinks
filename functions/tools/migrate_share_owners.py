"""One-off migration: move `ownerUid` off the PUBLIC share docs.

Shares published before 2026-07-07 carry `ownerUid` on the world-readable
`shared_cards` / `shared_collections` doc (for the phone-keyed owner workspace
that value is a phone number), and have no `shared_owners` row. The code has
read `shared_owners` first ever since, and falls back to the public field only
for those legacy docs (share_service._share_owner_uid). Account deletion now
sweeps them too (link_service.delete_shares_for_owner), but the field itself
is still readable by anyone who holds a legacy link until this runs.

For every public doc that still carries `ownerUid`: write the
`shared_owners/{shareId}` row (unless one exists) and delete the field from
the public doc. Idempotent; safe to re-run.

Owner-run, needs prod credentials:
    GOOGLE_APPLICATION_CREDENTIALS=... python tools/migrate_share_owners.py          # dry run
    GOOGLE_APPLICATION_CREDENTIALS=... python tools/migrate_share_owners.py --apply  # write

Public repo => stdout stays structural (ids + counts); no uid is printed.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google.cloud import firestore  # noqa: E402

PROJECT = "secondbrain-app-94da2"

COLLECTIONS = {
    "shared_cards": "card",
    "shared_collections": "collection",
    "shared_answers": "answer",
}


def main() -> int:
    apply = "--apply" in sys.argv[1:]
    db = firestore.Client(project=PROJECT)
    moved = 0
    scanned = 0
    for coll, share_type in COLLECTIONS.items():
        for snap in db.collection(coll).stream():
            scanned += 1
            data = snap.to_dict() or {}
            owner = data.get("ownerUid")
            if not owner:
                continue
            owner_ref = db.collection("shared_owners").document(snap.id)
            print(f"{coll}/{snap.id}: legacy ownerUid present -> {'moving' if apply else 'would move'}")
            if apply:
                batch = db.batch()
                if not owner_ref.get().exists:
                    batch.set(owner_ref, {
                        "ownerUid": owner,
                        "type": share_type,
                        "publishedAt": data.get("publishedAt") or 0,
                    })
                batch.update(snap.reference, {"ownerUid": firestore.DELETE_FIELD})
                batch.commit()
            moved += 1
    print(f"scanned={scanned} legacy={moved} mode={'apply' if apply else 'dry-run'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
