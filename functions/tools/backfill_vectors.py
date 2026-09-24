"""Backfill: mirror every card's embedding vector to users/{uid}/vectors/{id}.

Phase 1 of moving vectors off card docs (see functions/vector_store.py). The
functions deploy starts DUAL-WRITING (every server vector write also writes
the sibling doc); this script copies the vectors of cards embedded BEFORE that
deploy, reconciles siblings that differ from their card, and deletes orphan
siblings (card gone, or card has no valid vector).

It then, and only on request, flips `config/vector_store.siblingReady`, which
moves server vector search (search bar, Ask, See-also, related/graph
similarity) onto the sibling collection.

Owner-run with prod credentials, in this order:
    python tools/backfill_vectors.py --all                 # dry run: counts only
    python tools/backfill_vectors.py --all --apply         # write siblings
    python tools/backfill_vectors.py --all --apply         # 2nd pass: expect 0 changes
    python tools/backfill_vectors.py --all --mark-ready    # verify + flip siblingReady
One workspace: replace --all with a uid.

--mark-ready refuses unless a fresh dry-run pass over EVERY workspace finds
nothing to write, and a find_nearest probe on the `vectors` collection
succeeds (i.e. the vector index in firestore.indexes.json is built — check the
Firebase console → Firestore → Indexes shows it READY first). To undo:
    python tools/backfill_vectors.py --unmark-ready
(search falls back to the card field within a minute: flags are cached 60s).

Refuses to run once `cardVectorsRemoved` is set (phase 3): cards no longer
carry vectors then, so "card has no vector" would wrongly delete siblings.

Idempotent. Public repo => stdout stays structural (counts); no uid, id or
title is printed.
"""

import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import firebase_admin  # noqa: E402
from firebase_admin import firestore  # noqa: E402
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # noqa: E402
from google.cloud.firestore_v1.vector import Vector  # noqa: E402

from ai_service import embedding_needs_repair  # noqa: E402
from vector_store import (  # noqa: E402
    CONFIG_COLLECTION, CONFIG_DOC, VECTOR_FIELD, VECTORS_COLLECTION,
)

PROJECT = "secondbrain-app-94da2"
# Each sibling carries ~768 doubles (~7 KB); 200 writes keeps a commit well
# under the 10 MB request ceiling and the 500-writes-per-batch limit.
BATCH_SIZE = 200


def _same(a, b) -> bool:
    try:
        return list(a) == list(b)
    except Exception:
        return False


def backfill_one(db, uid: str, apply: bool) -> Counter:
    """Returns counts for one workspace: cards, set (missing), fixed (differed),
    orphans (sibling with no valid card vector), unembedded (card needs repair)."""
    user_ref = db.collection("users").document(uid)
    siblings = {s.id: (s.to_dict() or {}) for s in user_ref.collection(VECTORS_COLLECTION).stream()}
    c = Counter()
    batch, pending = db.batch(), 0

    def _flush(force=False):
        nonlocal batch, pending
        if apply and pending and (force or pending >= BATCH_SIZE):
            batch.commit()
            batch, pending = db.batch(), 0

    seen = set()
    for snap in user_ref.collection("links").stream():
        c["cards"] += 1
        seen.add(snap.id)
        data = snap.to_dict() or {}
        raw = data.get(VECTOR_FIELD)
        if embedding_needs_repair(raw):
            c["unembedded"] += 1  # the embed trigger / Rebuild repairs these
            if snap.id in siblings:
                c["orphans"] += 1
                if apply:
                    batch.delete(user_ref.collection(VECTORS_COLLECTION).document(snap.id))
                    pending += 1
            _flush()
            continue
        existing = siblings.get(snap.id)
        if existing is not None and _same(existing.get(VECTOR_FIELD), raw):
            continue
        c["fixed" if existing is not None else "set"] += 1
        if apply:
            payload = {VECTOR_FIELD: raw if isinstance(raw, Vector) else Vector(list(raw)),
                       "updatedAt": firestore.SERVER_TIMESTAMP}
            version = data.get("embeddingVersion")
            if isinstance(version, int) and not isinstance(version, bool):
                payload["embeddingVersion"] = version
            batch.set(user_ref.collection(VECTORS_COLLECTION).document(snap.id), payload)
            pending += 1
        _flush()
    for sid in siblings:
        if sid not in seen:
            c["orphans"] += 1
            if apply:
                batch.delete(user_ref.collection(VECTORS_COLLECTION).document(sid))
                pending += 1
            _flush()
    _flush(force=True)
    return c


def _flags_ref(db):
    return db.collection(CONFIG_COLLECTION).document(CONFIG_DOC)


def _index_probe(db, uids) -> bool:
    """A find_nearest on some workspace's vectors collection succeeds."""
    for uid in uids:
        coll = db.collection("users").document(uid).collection(VECTORS_COLLECTION)
        first = list(coll.limit(1).stream())
        if not first:
            continue
        vec = (first[0].to_dict() or {}).get(VECTOR_FIELD)
        try:
            coll.find_nearest(vector_field=VECTOR_FIELD, query_vector=vec,
                              distance_measure=DistanceMeasure.COSINE, limit=1).get()
            return True
        except Exception as e:
            print(f"index probe failed: {type(e).__name__}")
            return False
    print("index probe: no sibling docs anywhere")
    return False


def main() -> int:
    argv = sys.argv[1:]
    args = [a for a in argv if not a.startswith("--")]
    everyone = "--all" in argv
    apply = "--apply" in argv
    mark = "--mark-ready" in argv
    unmark = "--unmark-ready" in argv

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()

    if unmark:
        _flags_ref(db).set({"siblingReady": False}, merge=True)
        print("siblingReady=false")
        return 0
    if not args and not everyone:
        print(__doc__)
        return 2
    if mark and (apply or not everyone):
        print("--mark-ready is a verification pass: use it with --all and without --apply")
        return 2

    flags = _flags_ref(db).get()
    if flags.exists and (flags.to_dict() or {}).get("cardVectorsRemoved") is True:
        print("refusing: cardVectorsRemoved is set (phase 3) — cards no longer carry vectors")
        return 2

    uids = [args[0]] if args else [d.id for d in db.collection("users").stream()]
    print(f"workspaces={len(uids)} mode={'apply' if apply else ('verify' if mark else 'dry-run')}")
    totals = Counter()
    rc = 0
    for uid in uids:
        try:
            totals.update(backfill_one(db, uid, apply))
        except Exception as e:  # keep going; one bad workspace must not stop the rest
            print(f"workspace failed: {type(e).__name__}")
            rc = 1
    verb = "" if apply else "would_"
    print(f"cards={totals['cards']} {verb}set={totals['set']} {verb}fix={totals['fixed']} "
          f"{verb}delete_orphans={totals['orphans']} unembedded_cards={totals['unembedded']}")

    if mark:
        pending = totals["set"] + totals["fixed"] + totals["orphans"]
        if rc or pending:
            print(f"NOT marking ready: failures={rc} pending_changes={pending} — run --apply again")
            return 1
        if not _index_probe(db, uids):
            print("NOT marking ready: vector index on `vectors` not usable yet")
            return 1
        _flags_ref(db).set({"siblingReady": True, "siblingReadyAt": firestore.SERVER_TIMESTAMP}, merge=True)
        print("siblingReady=true (takes effect within ~60s)")
    return rc


if __name__ == "__main__":
    sys.exit(main())
