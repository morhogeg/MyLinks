"""Minimal repro for the 2026-08-26 `400 Invalid database id %28default%29`.

Runs ONE Firestore read through either the raw google-cloud-firestore client
("direct") or the exact production path (functions/db.py -> firebase_admin,
"admin"/"admin-env"). Invoked repeatedly by the pipeline-debug workflow inside
venvs with different dependency pins to find which transitive release broke
the deployed containers built since Aug 25.
"""

import sys

MODE = sys.argv[1] if len(sys.argv) > 1 else "direct"
PROJECT = "secondbrain-app-94da2"

try:
    if MODE == "direct":
        from google.cloud import firestore
        db = firestore.Client(project=PROJECT)
    else:
        sys.path.insert(0, "functions")
        from db import get_db
        db = get_db()
    docs = list(db.collection("task_logs").limit(1).get())
    print(f"PROBE {MODE}: OK ({len(docs)} docs)")
except Exception as e:
    print(f"PROBE {MODE}: FAIL {type(e).__name__}: {str(e)[:220]}")
