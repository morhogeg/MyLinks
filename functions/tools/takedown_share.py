"""Operator takedown for a reported public share page (App Review 1.2).

Every /s, /c and /a page carries a "Report this page" link that emails
support@mymachina.app with the page's address. To act on a report:

    # dry run: shows what the page is and who would be affected
    GOOGLE_APPLICATION_CREDENTIALS=... python tools/takedown_share.py <shareId>
    # take the page down
    GOOGLE_APPLICATION_CREDENTIALS=... python tools/takedown_share.py <shareId> --apply
    # take it down, take down every other live page of the same account,
    # and stop that account from publishing again
    GOOGLE_APPLICATION_CREDENTIALS=... python tools/takedown_share.py <shareId> --ban --apply
    # lift a ban (the account is named by any share id it ever published)
    GOOGLE_APPLICATION_CREDENTIALS=... python tools/takedown_share.py <shareId> --unban --apply

<shareId> is the `id=` value of the reported link (mymachina.app/s?id=...).
A takedown goes through share_service._unpublish_share_logic as the owner,
so it behaves exactly like the owner's own "Stop sharing": the page 404s,
the owner row is tombstoned (nobody else can claim the id), the preview
images go, and the card or collection forgets its link. A ban is a
`share_bans/{uid}` doc, which matches no Firestore rule, so the account
can't lift it; share_service.share_banned checks it on every publish.

Public repo => stdout stays structural: no uid or page content is printed.
"""

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import share_service  # noqa: E402
from db import get_db  # noqa: E402

_PUBLIC = {"card": "shared_cards", "collection": "shared_collections", "answer": "shared_answers"}


def _owner_row(db, share_id: str):
    snap = db.collection("shared_owners").document(share_id).get()
    return (snap.to_dict() or {}) if snap.exists else None


def _collection_id_for(db, owner: str, share_id: str):
    """The owner's collection that holds this share, so its "Public" flag is
    cleared with the page (None when it can't be found)."""
    from google.cloud.firestore_v1.base_query import FieldFilter
    docs = (db.collection("users").document(owner).collection("collections")
            .where(filter=FieldFilter("shareId", "==", share_id)).limit(1).get())
    return docs[0].id if docs else None


def _take_down(db, owner: str, share_id: str, row: dict, apply: bool) -> bool:
    share_type = row.get("type")
    if share_type not in _PUBLIC:
        print(f"  {share_id}: unknown type, skipped")
        return False
    if row.get("unpublishedAt"):
        print(f"  {share_id}: {share_type} page already down")
        return False
    print(f"  {share_id}: {share_type} page {'taking down' if apply else 'would take down'}")
    if apply:
        share_service._unpublish_share_logic(
            owner, share_type, share_id,
            collection_id=_collection_id_for(db, owner, share_id) if share_type == "collection" else None,
            card_id=row.get("cardId") if share_type == "card" else None,
        )
    return True


def main(argv) -> int:
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    unknown = flags - {"--apply", "--ban", "--unban"}
    if len(args) != 1 or unknown or {"--ban", "--unban"} <= flags:
        print(__doc__)
        return 2
    share_id, apply = args[0], "--apply" in flags
    if not share_service._valid_share_id(share_id):
        print("Not a share id (expected the id= value of the link).")
        return 2

    db = get_db()
    row = _owner_row(db, share_id)
    if not row or not row.get("ownerUid"):
        print(f"{share_id}: no owner record; nothing to do.")
        return 1
    owner = row["ownerUid"]
    ban_ref = db.collection("share_bans").document(owner)

    if "--unban" in flags:
        print(f"Account behind {share_id}: {'lifting ban' if apply else 'would lift ban'}"
              f" (currently {'banned' if ban_ref.get().exists else 'not banned'})")
        if apply:
            ban_ref.delete()
        return 0

    _take_down(db, owner, share_id, row, apply)
    if "--ban" in flags:
        from google.cloud.firestore_v1.base_query import FieldFilter
        others = (db.collection("shared_owners")
                  .where(filter=FieldFilter("ownerUid", "==", owner)).get())
        live = [s for s in others if s.id != share_id and not (s.to_dict() or {}).get("unpublishedAt")]
        print(f"Same account: {len(live)} other live page(s)")
        for s in live:
            _take_down(db, owner, s.id, s.to_dict() or {}, apply)
        print(f"Account behind {share_id}: {'banning from publishing' if apply else 'would ban from publishing'}")
        if apply:
            ban_ref.set({"bannedAt": int(time.time() * 1000), "reportedShareId": share_id})
    if not apply:
        print("Dry run. Add --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
