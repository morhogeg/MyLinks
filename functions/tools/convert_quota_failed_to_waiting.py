"""One-time: turn cards that FAILED at the old free save limit into waiting cards.

Before 2026-10-05 a save past the monthly allowance got a 429 after the client
had already written its placeholder card, so the card flipped to `failed` with
the quota message as its `error` and a Retry that could only hit the same wall
(SOURCE_OF_TRUTH §4 E2). Saves past the allowance are now kept as `waiting`
cards instead (deferred_capture.py). This script moves those old casualties
over: same card, `status: 'waiting'`, so the normal release (upgrade, or the
daily sweep next month, within the allowance) reads them.

A card is converted only when ALL hold:
  * `status == 'failed'`;
  * its `error` is one of the save-limit messages the backend ever sent
    (quota.py / main.py history; see SAVE_WALL_PATTERNS) and nothing else;
  * it has something to read: an http(s) `url`, or stored images for an image
    card. A multi-screenshot placeholder that failed before its images were
    stored has nothing, and is left as it is (counted as `unreadable`).

No Gemini, no scraping, no quota charge here: the cards have no snapshot, so
the page is read live when the card is released, and that release charges one
unit like any other. `waitingAt` keeps the card's original failure time, so the
oldest-first order stays honest.

Idempotent (a converted card is no longer `failed`). Dry run by default.
Owner-run with prod credentials:
    python tools/convert_quota_failed_to_waiting.py --uid <uid>          # one workspace, dry run
    python tools/convert_quota_failed_to_waiting.py --all                # every workspace, dry run
    python tools/convert_quota_failed_to_waiting.py --all --apply

Public repo => stdout stays structural: workspaces are printed masked
(log_safe.mask_uid), never a URL, title or full uid.
"""

import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PROJECT = "secondbrain-app-94da2"
BATCH_SIZE = 400  # under Firestore's 500-writes-per-batch ceiling

# Every wording of the monthly SAVE wall the backend has sent (git history of
# functions/quota.py and main.py):
#   "You've used all {N} free saves this month. Upgrade to Machina Pro for
#    unlimited saves, or wait for the 1st."           (free, 2026-09-02 on)
#   "Monthly save limit reached. Resets on the 1st."  (pro, and pre-Pro)
#   "Monthly save limit reached — resets on the 1st." (pre-Pro, em dash era)
#   "Monthly limit reached."                          (generic fallback)
# The question wall ("Monthly question limit reached") never lands on a card,
# and is deliberately not matched.
SAVE_WALL_PATTERNS = (
    re.compile(r"you['’]?ve used all \d+ free saves this month", re.I),
    re.compile(r"monthly save limit reached", re.I),
    re.compile(r"^\s*monthly limit reached\.?\s*$", re.I),
)


def is_save_wall_error(error) -> bool:
    """True when a failed card's `error` is the old save-limit message."""
    if not isinstance(error, str) or not error.strip():
        return False
    return any(p.search(error) for p in SAVE_WALL_PATTERNS)


def _readable(card: dict) -> bool:
    if card.get("sourceType") == "image":
        urls = [u for u in (card.get("imageUrls") or []) if isinstance(u, str) and u]
        return bool(urls) or bool(card.get("url"))
    url = card.get("url")
    return isinstance(url, str) and url.startswith(("http://", "https://"))


def _ms(v):
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def conversion_update(card: dict, delete_field, now_ms: int) -> dict:
    """The update that turns a quota-failed card into a waiting one."""
    return {
        "status": "waiting",
        "waitingAt": _ms(card.get("failedAt")) or _ms(card.get("createdAt")) or now_ms,
        "error": delete_field,
        "failedAt": delete_field,
        "processingStartedAt": delete_field,
        "processingStage": delete_field,
        "queuedAt": delete_field,
        "pendingEnqueue": delete_field,
    }


def convert_workspace(db, uid: str, apply: bool, delete_field, now_ms: int) -> Counter:
    """Returns counts for one workspace: failed (cards scanned as failed),
    matched, converted (or would convert), unreadable."""
    from google.cloud.firestore_v1.base_query import FieldFilter

    counts = Counter()
    links = db.collection("users").document(uid).collection("links")
    batch, pending = db.batch(), 0
    for snap in links.where(filter=FieldFilter("status", "==", "failed")).stream():
        counts["failed"] += 1
        card = snap.to_dict() or {}
        if not is_save_wall_error(card.get("error")):
            continue
        counts["matched"] += 1
        if not _readable(card):
            counts["unreadable"] += 1
            continue
        counts["converted"] += 1
        if apply:
            batch.update(snap.reference, conversion_update(card, delete_field, now_ms))
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

    import time
    import firebase_admin
    from firebase_admin import firestore
    from log_safe import mask_uid

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()
    now_ms = int(time.time() * 1000)

    uids = [uid] if uid else [d.id for d in db.collection("users").stream()]
    print(f"workspaces={len(uids)} mode={'apply' if apply else 'dry-run'}")
    verb = "converted" if apply else "would_convert"
    totals = Counter()
    rc = 0
    for u in uids:
        try:
            c = convert_workspace(db, u, apply, firestore.DELETE_FIELD, now_ms)
        except Exception as e:  # keep going; one bad workspace must not stop the rest
            print(f"workspace {mask_uid(u)} failed: {type(e).__name__}")
            rc = 1
            continue
        totals.update(c)
        if c["matched"]:
            print(f"workspace {mask_uid(u)}: failed={c['failed']} quota_failed={c['matched']} "
                  f"{verb}={c['converted']} unreadable={c['unreadable']}")
    print(f"total: failed={totals['failed']} quota_failed={totals['matched']} "
          f"{verb}={totals['converted']} unreadable={totals['unreadable']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
