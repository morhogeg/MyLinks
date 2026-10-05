"""tools/normalize_created_at.py: the one-time repair that stores every card's
`createdAt` as epoch ms, so Firestore's type-first ordering stops pinning
Timestamp / string cards to the top of the feed."""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import normalize_created_at as tool  # noqa: E402

MS = 1_759_700_000_000  # 2025-10-05 in ms


class _Snap:
    def __init__(self, store, doc_id):
        self._store, self.id = store, doc_id
        self.reference = self

    def to_dict(self):
        return {"createdAt": self._store[self.id].get("createdAt")}

    def update(self, data):
        self._store[self.id].update(data)


class _FakeDB:
    """users/{uid}/links with select().stream() and batched updates."""

    def __init__(self, links):
        self.links = links
        self.commits = 0
        self.selected = None

    def collection(self, _name):
        return self

    def document(self, _uid):
        return self

    def select(self, fields):
        self.selected = fields
        return self

    def stream(self):
        return [_Snap(self.links, k) for k in list(self.links)]

    def batch(self):
        db = self

        class _B:
            def __init__(self):
                self.ops = []

            def update(self, ref, data):
                self.ops.append((ref, data))

            def commit(self):
                db.commits += 1
                for ref, data in self.ops:
                    ref.update(data)
        return _B()


def test_to_epoch_ms_reads_every_stored_shape():
    dt = datetime.fromtimestamp(MS / 1000, tz=timezone.utc)
    assert tool.to_epoch_ms(MS) == MS                      # already ms
    assert tool.to_epoch_ms(MS // 1000) == MS              # unix seconds
    assert tool.to_epoch_ms(dt) == MS                      # Firestore Timestamp (a datetime)
    assert tool.to_epoch_ms(dt.replace(tzinfo=None)) == MS  # naive = UTC
    assert tool.to_epoch_ms("2025-10-05T21:33:20Z") == MS  # legacy ISO string
    assert tool.to_epoch_ms("2025-10-05T21:33:20+00:00") == MS


def test_to_epoch_ms_refuses_what_it_cannot_read():
    for bad in (None, True, False, 0, -5, "", "   ", "not a date", {}, []):
        assert tool.to_epoch_ms(bad) is None, bad


def test_only_non_ms_values_need_work():
    assert not tool.needs_normalizing(MS)
    assert not tool.needs_normalizing(float(MS))
    assert tool.needs_normalizing(MS // 1000)
    assert tool.needs_normalizing("2025-10-05T21:33:20Z")
    assert tool.needs_normalizing(datetime.now(timezone.utc))
    assert tool.needs_normalizing(None)
    assert tool.needs_normalizing(True)


def test_dry_run_counts_and_writes_nothing():
    dt = datetime.fromtimestamp(MS / 1000, tz=timezone.utc)
    links = {
        "ms": {"createdAt": MS},
        "ts": {"createdAt": dt},
        "iso": {"createdAt": "2025-10-05T21:33:20Z"},
        "sec": {"createdAt": MS // 1000},
        "junk": {"createdAt": "yesterday"},
    }
    db = _FakeDB(links)
    c = tool.normalize_workspace(db, "u1", apply=False)
    assert db.selected == ["createdAt"]  # field mask: cheap reads
    assert c["scanned"] == 5
    assert c["fixed"] == 3
    assert (c["fix_timestamp"], c["fix_string"], c["fix_seconds"]) == (1, 1, 1)
    assert c["unreadable"] == 1
    assert db.commits == 0
    assert links["ts"]["createdAt"] == dt  # untouched


def test_apply_converts_in_place_and_is_idempotent():
    dt = datetime.fromtimestamp(MS / 1000, tz=timezone.utc)
    links = {
        "ms": {"createdAt": MS},
        "ts": {"createdAt": dt},
        "iso": {"createdAt": "2025-10-05T21:33:20Z"},
        "sec": {"createdAt": MS // 1000},
        "junk": {"createdAt": "yesterday"},
    }
    db = _FakeDB(links)
    tool.normalize_workspace(db, "u1", apply=True)
    for key in ("ms", "ts", "iso", "sec"):
        assert links[key]["createdAt"] == MS, key
    assert links["junk"]["createdAt"] == "yesterday"  # never guessed
    again = tool.normalize_workspace(db, "u1", apply=True)
    assert again["fixed"] == 0
