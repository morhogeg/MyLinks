"""Backfill: stamp `urlKey` on every link card that has a URL but no key.

Dedupe now matches on the canonical `urlKey` (url_key.py) instead of the exact
stored `url` string. New cards get the key when they are written; cards saved
before 2026-09-24 don't have one, so dedupe falls back to an exact `url`
match for them (link_service.link_exists_for_url, web/lib/storage.ts
findLinkIdByUrl). This script closes that gap so a tracking-param or
www./http variant of an OLD card is caught too.

Per card: `urlKey = url_key(url)` when `url` is an http(s) URL and the card
has no `urlKey` yet. Notes (empty url) are skipped. Image cards (Storage URLs)
get a key too, which is harmless. Nothing else on the card is touched.

It also reports (never merges or deletes) how many existing cards now collide
on one key, i.e. duplicates the old exact-match dedupe let through.

Idempotent: a card that already carries `urlKey` is left alone. Dry run by
default. Owner-run with prod credentials:
    python tools/backfill_url_keys.py <uid>            # one workspace, dry run
    python tools/backfill_url_keys.py --all            # every workspace, dry run
    python tools/backfill_url_keys.py --all --apply

Public repo => stdout stays structural (counts); no uid, URL or title is printed.
"""

import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import firebase_admin  # noqa: E402
from firebase_admin import firestore  # noqa: E402

from url_key import url_key  # noqa: E402

PROJECT = "secondbrain-app-94da2"
BATCH_SIZE = 400  # under Firestore's 500-writes-per-batch ceiling


def _backfill_one(db, uid: str, apply: bool) -> tuple:
    """Returns (scanned, stamped, duplicate_cards) for one workspace."""
    links = db.collection("users").document(uid).collection("links")
    scanned = stamped = 0
    keys = Counter()
    batch, pending = db.batch(), 0
    for snap in links.stream():
        scanned += 1
        data = snap.to_dict() or {}
        existing = data.get("urlKey")
        key = existing or url_key(data.get("url") or "")
        if not key:
            continue
        keys[key] += 1
        if existing:
            continue
        stamped += 1
        if apply:
            batch.update(snap.reference, {"urlKey": key})
            pending += 1
            if pending >= BATCH_SIZE:
                batch.commit()
                batch, pending = db.batch(), 0
    if apply and pending:
        batch.commit()
    duplicates = sum(n - 1 for n in keys.values() if n > 1)
    return scanned, stamped, duplicates


def main() -> int:
    argv = sys.argv[1:]
    args = [a for a in argv if not a.startswith("--")]
    everyone = "--all" in argv
    if not args and not everyone:
        print(__doc__)
        return 2
    apply = "--apply" in argv

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()

    uids = [args[0]] if args else [d.id for d in db.collection("users").stream()]
    print(f"workspaces={len(uids)} mode={'apply' if apply else 'dry-run'}")
    totals = Counter()
    rc = 0
    for uid in uids:
        try:
            scanned, stamped, dups = _backfill_one(db, uid, apply)
            totals.update(scanned=scanned, stamped=stamped, duplicates=dups)
        except Exception as e:  # keep going; one bad workspace must not stop the rest
            print(f"workspace failed: {type(e).__name__}")
            rc = 1
    print(f"cards_scanned={totals['scanned']} "
          f"{'stamped' if apply else 'would_stamp'}={totals['stamped']} "
          f"existing_duplicate_cards={totals['duplicates']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
