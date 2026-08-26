"""Post-deploy end-to-end canary for the analysis pipeline (§9 round 15/16).

"Deploy green" only proves deployment succeeded — the 2026-08-26 outage shipped
containers whose every Firestore call failed while the deploy workflow stayed
green for two days. This canary proves the DEPLOYED runtime actually works,
end to end, after every functions deploy: it writes a real `pending_processing`
doc for a dedicated canary workspace and waits for `process_link_background`
to flip it into a finished card — exercising Firestore writes, the Eventarc
trigger, scraping, Gemini analysis, and embeddings inside the new containers.
Anything else fails this script, which fails the deploy run, which emails the
owner.

Cost per run: one flash-lite analysis + one embedding (a fraction of a cent)
and a handful of Firestore ops. The canary card is deleted afterwards; the
canary uid is not a real user and charges no usage quota (the queue doc is
written directly, bypassing share_ingest's metering).
"""

import sys
import time
from datetime import datetime, timezone

from google.cloud import firestore

PROJECT = "secondbrain-app-94da2"
CANARY_UID = "ci-canary"
# The app's own landing page: stable, content-bearing, and ours.
CANARY_URL = "https://mymachina.app/"
# The trigger normally finishes in seconds; 300s of grace covers a cold start
# plus Gemini retries without masking a genuinely dead pipeline for long.
TIMEOUT_S = 300
POLL_S = 5


def main() -> int:
    db = firestore.Client(project=PROJECT)
    user_ref = db.collection("users").document(CANARY_UID)
    links = user_ref.collection("links")

    # The trigger's final `users/{uid}.update(lastSavedLinkId)` needs the
    # workspace doc to exist; create-or-keep it (never a real user's doc).
    user_ref.set({"canary": True}, merge=True)

    # Purge leftovers from any earlier (possibly failed) canary run so this
    # run's card is unambiguous, and so pending-dedup can't skip us.
    for doc in links.stream():
        doc.reference.delete()
    for doc in (db.collection("pending_processing")
                .where("uid", "==", CANARY_UID).stream()):
        doc.reference.delete()

    queue_ref = db.collection("pending_processing").document()
    queue_ref.set({
        "uid": CANARY_UID,
        "url": CANARY_URL,
        "source": "canary",
        "body": "",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "attempts": 0,
    })
    print(f"canary queue doc {queue_ref.id} written; waiting for the pipeline…")

    deadline = time.time() + TIMEOUT_S
    last = None
    while time.time() < deadline:
        time.sleep(POLL_S)
        cards = list(links.stream())
        if not cards:
            last = "no card yet"
        else:
            d = cards[0].to_dict() or {}
            status = d.get("status")
            last = f"card status={status}"
            if status == "failed":
                print(f"CANARY FAILED: analysis errored: {str(d.get('error'))[:300]}")
                return 1
            if status not in (None, "processing"):
                elapsed = int(time.time() - (deadline - TIMEOUT_S))
                print(f"CANARY OK: card resolved to status={status!r} "
                      f"(title_len={len(d.get('title') or '')}, "
                      f"summary_len={len(d.get('summary') or '')}, "
                      f"embedded={'embedding_vector' in d}) after ~{elapsed}s")
                for c in cards:
                    c.reference.delete()
                return 0
        print(f"  …{last}")

    print(f"CANARY FAILED: pipeline did not resolve the card within {TIMEOUT_S}s "
          f"(last: {last}). The deployed runtime is NOT healthy — "
          f"see .github/scripts/pipeline_debug.py to diagnose.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
