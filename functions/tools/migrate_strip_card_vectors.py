"""Phase 3: remove `embedding_vector` from card docs (vectors stay in users/{uid}/vectors).

This is the step that actually stops shipping vectors to clients (the feed
listener downloads whole card docs; ~7 KB of floats per card). DO NOT RUN until
all of these are true:
  1. tools/backfill_vectors.py --all --mark-ready succeeded (siblingReady=true),
     and search / Ask / See-also have run on siblings for a while without
     regressions (client_errors, owner QA);
  2. the web client that asks the server for related/graph similarity is live
     on web AND in the shipped iOS build (lib/similarity.ts) — older clients
     fall back to card vectors, which this script removes, so on those builds
     live related-card ties degrade to concept-only matches.
See functions/vector_store.py for the phase model.

Dry run by default (counts only). Owner-run with prod credentials:
    python tools/migrate_strip_card_vectors.py --all             # dry run
    python tools/migrate_strip_card_vectors.py --all --apply     # strip
    python tools/migrate_strip_card_vectors.py --restore --all --apply   # rollback
One workspace: replace --all with a uid.

--apply first sets `config/vector_store.cardVectorsRemoved=true` and waits out
the functions' 60s flag cache, so from then on writers stop putting vectors on
cards and "needs embedding?" checks the sibling (without that, every card write
after the strip would re-embed the card). Per card it then makes sure the
sibling holds the card's vector (writing it if missing/different) BEFORE
deleting the card field, so no vector is ever lost.

--restore --apply copies every sibling vector back onto its card, then clears
cardVectorsRemoved (writers resume dual-writing within ~60s). Both directions
are idempotent and resumable. Public repo => stdout stays structural (counts).
"""

import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import firebase_admin  # noqa: E402
from firebase_admin import firestore  # noqa: E402
from google.cloud.firestore_v1.vector import Vector  # noqa: E402

from ai_service import embedding_needs_repair  # noqa: E402
from vector_store import (  # noqa: E402
    CONFIG_COLLECTION, CONFIG_DOC, VECTOR_FIELD, VECTORS_COLLECTION, _FLAG_TTL_S,
)

PROJECT = "secondbrain-app-94da2"
BATCH_SIZE = 200


def _same(a, b) -> bool:
    try:
        return list(a) == list(b)
    except Exception:
        return False


def strip_one(db, uid: str, apply: bool) -> Counter:
    user_ref = db.collection("users").document(uid)
    vectors = user_ref.collection(VECTORS_COLLECTION)
    siblings = {s.id: (s.to_dict() or {}) for s in vectors.stream()}
    c = Counter()
    batch, pending = db.batch(), 0
    for snap in user_ref.collection("links").stream():
        data = snap.to_dict() or {}
        if VECTOR_FIELD not in data:
            continue
        c["with_vector"] += 1
        raw = data[VECTOR_FIELD]
        if not embedding_needs_repair(raw):
            existing = siblings.get(snap.id)
            if existing is None or not _same(existing.get(VECTOR_FIELD), raw):
                c["sibling_written"] += 1
                if apply:
                    payload = {VECTOR_FIELD: raw if isinstance(raw, Vector) else Vector(list(raw)),
                               "updatedAt": firestore.SERVER_TIMESTAMP}
                    if isinstance(data.get("embeddingVersion"), int):
                        payload["embeddingVersion"] = data["embeddingVersion"]
                    batch.set(vectors.document(snap.id), payload)
                    pending += 1
        # A drift/degenerate vector is dropped too: it was never searchable,
        # and the embed trigger re-embeds the card (into the sibling) on its
        # next write, or Settings → Connections → Rebuild does it now.
        c["stripped"] += 1
        if apply:
            # Same batch, after the sibling write: both land or neither does.
            batch.update(user_ref.collection("links").document(snap.id),
                         {VECTOR_FIELD: firestore.DELETE_FIELD})
            pending += 1
            if pending >= BATCH_SIZE:
                batch.commit()
                batch, pending = db.batch(), 0
    if apply and pending:
        batch.commit()
    return c


def restore_one(db, uid: str, apply: bool) -> Counter:
    user_ref = db.collection("users").document(uid)
    c = Counter()
    batch, pending = db.batch(), 0
    for sib in user_ref.collection(VECTORS_COLLECTION).stream():
        raw = (sib.to_dict() or {}).get(VECTOR_FIELD)
        if embedding_needs_repair(raw):
            continue
        card_ref = user_ref.collection("links").document(sib.id)
        card = card_ref.get()
        if not card.exists:
            continue
        if _same((card.to_dict() or {}).get(VECTOR_FIELD), raw):
            continue
        c["restored"] += 1
        if apply:
            batch.update(card_ref, {VECTOR_FIELD: raw})
            pending += 1
            if pending >= BATCH_SIZE:
                batch.commit()
                batch, pending = db.batch(), 0
    if apply and pending:
        batch.commit()
    return c


def main() -> int:
    argv = sys.argv[1:]
    args = [a for a in argv if not a.startswith("--")]
    everyone = "--all" in argv
    apply = "--apply" in argv
    restore = "--restore" in argv
    if not args and not everyone:
        print(__doc__)
        return 2

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()
    flags_ref = db.collection(CONFIG_COLLECTION).document(CONFIG_DOC)
    snap = flags_ref.get()
    flags = (snap.to_dict() or {}) if snap.exists else {}

    if not restore and flags.get("siblingReady") is not True:
        print("refusing: siblingReady is not set — run tools/backfill_vectors.py --all --mark-ready first")
        return 2

    uids = [args[0]] if args else [d.id for d in db.collection("users").stream()]
    print(f"workspaces={len(uids)} mode={'restore' if restore else 'strip'} "
          f"{'apply' if apply else 'dry-run'}")

    if apply and not restore and flags.get("cardVectorsRemoved") is not True:
        flags_ref.set({"cardVectorsRemoved": True,
                       "cardVectorsRemovedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        wait = int(_FLAG_TTL_S * 2) + 30
        print(f"cardVectorsRemoved=true; waiting {wait}s for function flag caches to expire")
        time.sleep(wait)

    totals = Counter()
    rc = 0
    for uid in uids:
        try:
            totals.update((restore_one if restore else strip_one)(db, uid, apply))
        except Exception as e:  # keep going; the run is resumable
            print(f"workspace failed: {type(e).__name__}")
            rc = 1
    print(" ".join(f"{k}={v}" for k, v in sorted(totals.items())) or "nothing to do")

    if apply and restore and not rc and everyone:
        flags_ref.set({"cardVectorsRemoved": False}, merge=True)
        print("cardVectorsRemoved=false (writers dual-write again within ~60s)")
    return rc


if __name__ == "__main__":
    sys.exit(main())
