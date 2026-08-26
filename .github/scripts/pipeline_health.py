"""Scheduled production health check (§9 round 16).

The post-deploy canary guards deploy moments; this guards the time BETWEEN
deploys (build-cache rot, platform changes, quota walls). It asserts, against
live production state:

  1. Cloud Scheduler jobs (janitor / reminders / digests) are not failing —
     a clean job has no error `code` in its last-attempt status.
  2. No `pending_processing` queue doc is older than the janitor's 15-minute
     cutoff — stale docs mean the trigger or the janitor is dead (and they
     silently block re-saving those URLs as "duplicates").
  3. No card has been stuck in `processing` for over 30 minutes.

Any violation exits non-zero → the workflow run goes red → GitHub emails the
owner. Read-only except for nothing; a handful of Firestore reads per run.
"""

import sys
from datetime import datetime, timedelta, timezone

import google.auth
from google.auth.transport.requests import AuthorizedSession
from google.cloud import firestore

PROJECT = "secondbrain-app-94da2"
QUEUE_STALE_MIN = 15
CARD_STALE_MIN = 30


def to_ms(value):
    if isinstance(value, (int, float)):
        return int(value)
    if hasattr(value, "timestamp"):
        try:
            return int(value.timestamp() * 1000)
        except Exception:
            return None
    if isinstance(value, str):
        try:
            return int(datetime.fromisoformat(value).timestamp() * 1000)
        except Exception:
            return None
    return None


def main() -> int:
    problems = []
    db = firestore.Client(project=PROJECT)
    now = datetime.now(timezone.utc)
    now_ms = int(now.timestamp() * 1000)

    # 1. Scheduler jobs.
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    sess = AuthorizedSession(creds)
    r = sess.get(
        f"https://cloudscheduler.googleapis.com/v1/projects/{PROJECT}/locations/us-central1/jobs",
        timeout=30)
    r.raise_for_status()
    for j in r.json().get("jobs", []):
        name = j.get("name", "").split("/")[-1]
        status = j.get("status") or {}
        if status.get("code"):
            problems.append(
                f"scheduler job {name}: last attempt {j.get('lastAttemptTime')} "
                f"failed with code {status.get('code')}")
        else:
            print(f"ok: scheduler {name} (last attempt {j.get('lastAttemptTime')})")

    # 2. Stale queue docs. `createdAt` is an ISO-8601 UTC string, so a string
    #    range query is correct; docs with a non-string createdAt simply don't
    #    match and are caught by the card check instead.
    cutoff_iso = (now - timedelta(minutes=QUEUE_STALE_MIN)).isoformat()
    stale_q = list(db.collection("pending_processing")
                   .where("createdAt", "<", cutoff_iso).limit(10).stream())
    if stale_q:
        oldest = min((d.to_dict() or {}).get("createdAt", "?") for d in stale_q)
        problems.append(
            f"{len(stale_q)}+ pending_processing docs older than "
            f"{QUEUE_STALE_MIN}m (oldest {oldest}) — trigger or janitor is dead")
    else:
        print("ok: no stale pending_processing docs")

    # 3. Cards stuck in processing.
    stuck = []
    for doc in (db.collection_group("links")
                .where("status", "==", "processing").limit(50).stream()):
        d = doc.to_dict() or {}
        started = to_ms(d.get("processingStartedAt")) or to_ms(d.get("createdAt"))
        if started is None or now_ms - started > CARD_STALE_MIN * 60_000:
            stuck.append(doc.reference.path)
    if stuck:
        problems.append(
            f"{len(stuck)} cards stuck in processing over {CARD_STALE_MIN}m "
            f"— janitor is not rescuing them")
    else:
        print("ok: no cards stuck in processing")

    if problems:
        print("\nPIPELINE HEALTH: FAILING")
        for p in problems:
            print(f"  ✗ {p}")
        print("\nDiagnose with .github/scripts/pipeline_debug.py "
              "(push to trigger/pipeline-debug).")
        return 1
    print("\nPIPELINE HEALTH: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
