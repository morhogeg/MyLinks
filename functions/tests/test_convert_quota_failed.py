"""tools/convert_quota_failed_to_waiting.py: the one-time owner script that
turns cards failed by the old save-limit 429 into waiting cards."""

import os
import sys

from google.cloud import firestore as gcf

import quota
from tests.test_capture_charge import FakeDB

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import convert_quota_failed_to_waiting as tool  # noqa: E402

DELETE = gcf.DELETE_FIELD
NOW = 1_800_000_000_000


class BatchDB(FakeDB):
    """FakeDB whose batch also does updates (the tool commits in batches)."""

    def __init__(self, docs):
        super().__init__(docs)
        self.commits = 0

    def batch(self):
        db = self

        class _B:
            def __init__(self):
                self.ops = []

            def update(self, ref, data):
                self.ops.append(lambda: ref.update(data))

            def commit(self):
                db.commits += 1
                for op in self.ops:
                    op()
        return _B()


def test_matches_every_historical_save_wall_wording():
    for msg in (
        quota.quota_message("saves", "free", 100),
        quota.quota_message("saves", "pro", 1000),
        "You’ve used all 100 free saves this month. Upgrade to Machina Pro for unlimited saves, or wait for the 1st.",
        "Monthly save limit reached. Resets on the 1st.",
        "Monthly save limit reached — resets on the 1st.",
        "Monthly save limit reached",
        "Monthly limit reached.",
    ):
        assert tool.is_save_wall_error(msg), msg


def test_does_not_match_other_failures():
    for msg in (
        None, "", "Processing timed out — tap to retry.", "Couldn't open this link.",
        quota.quota_message("asks", "free", 20),
        "Monthly question limit reached. Resets on the 1st.",
        "Too many requests. Please slow down.",
        "Could not start analysis. Please try again.",
        "Monthly limit reached for something else entirely",
    ):
        assert not tool.is_save_wall_error(msg), msg


def _docs():
    wall = quota.quota_message("saves", "free", 100)
    return {
        "users/u1": {},
        "users/u1/links/a": {"status": "failed", "error": wall, "url": "https://e.com/a",
                             "failedAt": 111, "processingStartedAt": 100, "createdAt": 90},
        "users/u1/links/b": {"status": "failed", "error": "Couldn't open this link.",
                             "url": "https://e.com/b"},
        "users/u1/links/c": {"status": "unread", "error": wall, "url": "https://e.com/c"},
        # A multi-screenshot placeholder that failed before its images were stored.
        "users/u1/links/d": {"status": "failed", "error": wall, "url": "", "sourceType": "image"},
        "users/u1/links/e": {"status": "failed", "error": wall, "url": "", "sourceType": "image",
                             "imageUrls": ["https://firebasestorage.googleapis.com/x"], "createdAt": 50},
    }


def test_dry_run_counts_and_writes_nothing():
    db = BatchDB(_docs())
    before = {k: dict(v) for k, v in db.docs.items()}
    c = tool.convert_workspace(db, "u1", False, DELETE, NOW)
    assert (c["failed"], c["matched"], c["converted"], c["unreadable"]) == (4, 3, 2, 1)
    assert db.docs == before and db.commits == 0


def test_apply_turns_quota_failed_cards_into_waiting_cards():
    db = BatchDB(_docs())
    c = tool.convert_workspace(db, "u1", True, DELETE, NOW)
    assert c["converted"] == 2
    a = db.docs["users/u1/links/a"]
    assert a["status"] == "waiting" and a["waitingAt"] == 111  # keeps its place in line
    for gone in ("error", "failedAt", "processingStartedAt"):
        assert gone not in a
    assert db.docs["users/u1/links/e"]["status"] == "waiting"
    assert db.docs["users/u1/links/e"]["waitingAt"] == 50
    assert db.docs["users/u1/links/b"]["status"] == "failed"   # a real failure stays
    assert db.docs["users/u1/links/d"]["status"] == "failed"   # nothing to read
    assert db.docs["users/u1/links/c"]["status"] == "unread"
    # Idempotent: a second run finds nothing left to convert.
    assert tool.convert_workspace(db, "u1", True, DELETE, NOW)["converted"] == 0
