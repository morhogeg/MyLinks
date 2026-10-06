"""One-time: store every card's `createdAt` as epoch milliseconds.

The feed pages the library with `orderBy('createdAt', 'desc')`. Firestore
orders values by TYPE first (numbers < timestamps < strings), so a card whose
`createdAt` is not a number sorts above every numeric card, whatever its date:

  * Firestore `Timestamp`: notes, single screenshots saved from the Image tab
    and saved Ask answers were written with `serverTimestamp()` until
    2026-10-05 (web/lib/storage.ts, web/lib/answerCards.ts). They sat on top
    of page 0 forever and pushed newer link cards down, and the client's
    relative time read "just now" for them.
  * ISO strings: legacy cards from before the int-ms convention.
  * Unix SECONDS (a number below 1e11): legacy ingest paths. These sort as if
    from 1970, at the very bottom.

The writers now all store `Date.now()`-style ms, and the client normalizes on
read (`toLink`), so this only repairs existing docs. Idempotent: a card whose
`createdAt` is already ms is skipped. Values that can't be read as a date are
left alone and counted as `unreadable`. Dry run by default.

Owner-run with prod credentials (or the Maintenance workflow):
    python tools/normalize_created_at.py --uid <uid>     # one workspace, dry run
    python tools/normalize_created_at.py --all           # every workspace, dry run
    python tools/normalize_created_at.py --all --apply

Public repo => stdout stays structural: workspaces are printed masked
(log_safe.mask_uid), never a title, URL or full uid.
"""

import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PROJECT = "secondbrain-app-94da2"
BATCH_SIZE = 400  # under Firestore's 500-writes-per-batch ceiling
SECONDS_CEILING = 100_000_000_000  # below this a number is seconds, not ms (1973 in ms)


def to_epoch_ms(value):
    """The ms value `createdAt` should hold, or None when it can't be read.

    Returns the input unchanged (as int) when it is already epoch ms.
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        v = int(value)
        return v * 1000 if v < SECONDS_CEILING else v
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    if hasattr(value, "timestamp"):  # DatetimeWithNanoseconds and friends
        try:
            return int(value.timestamp() * 1000)
        except Exception:
            return None
    if isinstance(value, str) and value.strip():
        try:
            dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    return None


def needs_normalizing(value) -> bool:
    """True when `createdAt` is not already a positive int/float in ms."""
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return value < SECONDS_CEILING
    return True


def kind_of(value) -> str:
    if isinstance(value, bool) or value is None:
        return "missing"
    if isinstance(value, (int, float)):
        return "seconds"
    if isinstance(value, str):
        return "string"
    if isinstance(value, datetime) or hasattr(value, "timestamp"):
        return "timestamp"
    return "other"


def normalize_workspace(db, uid: str, apply: bool) -> Counter:
    """Counts for one workspace: scanned, fixed (or would fix) per kind,
    unreadable."""
    counts = Counter()
    links = db.collection("users").document(uid).collection("links")
    batch, pending = db.batch(), 0
    # Field mask: only createdAt is needed, so a big library reads cheap docs.
    for snap in links.select(["createdAt"]).stream():
        counts["scanned"] += 1
        value = (snap.to_dict() or {}).get("createdAt")
        if not needs_normalizing(value):
            continue
        ms = to_epoch_ms(value)
        if ms is None:
            counts["unreadable"] += 1
            continue
        counts[f"fix_{kind_of(value)}"] += 1
        counts["fixed"] += 1
        if apply:
            batch.update(snap.reference, {"createdAt": ms})
            pending += 1
            if pending >= BATCH_SIZE:
                batch.commit()
                batch, pending = db.batch(), 0
    if apply and pending:
        batch.commit()
    return counts


def _arg_uid(argv):
    if "--uid" in argv:
        i = argv.index("--uid")
        return argv[i + 1] if i + 1 < len(argv) else None
    positional = [a for a in argv if not a.startswith("--")]
    return positional[0] if positional else None


def main() -> int:
    argv = sys.argv[1:]
    uid = _arg_uid(argv)
    everyone = "--all" in argv
    if not uid and not everyone:
        print(__doc__)
        return 2
    apply = "--apply" in argv

    import firebase_admin
    from firebase_admin import firestore
    from log_safe import mask_uid

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()

    uids = [uid] if uid else [d.id for d in db.collection("users").stream()]
    print(f"workspaces={len(uids)} mode={'apply' if apply else 'dry-run'}")
    verb = "fixed" if apply else "would_fix"
    totals = Counter()
    rc = 0
    for u in uids:
        try:
            c = normalize_workspace(db, u, apply)
        except Exception as e:  # keep going; one bad workspace must not stop the rest
            print(f"workspace {mask_uid(u)} failed: {type(e).__name__}")
            rc = 1
            continue
        totals.update(c)
        if c["fixed"] or c["unreadable"]:
            print(f"workspace {mask_uid(u)}: scanned={c['scanned']} {verb}={c['fixed']} "
                  f"(timestamp={c['fix_timestamp']} string={c['fix_string']} "
                  f"seconds={c['fix_seconds']}) unreadable={c['unreadable']}")
    print(f"total: scanned={totals['scanned']} {verb}={totals['fixed']} "
          f"(timestamp={totals['fix_timestamp']} string={totals['fix_string']} "
          f"seconds={totals['fix_seconds']}) unreadable={totals['unreadable']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
