"""`_record_server_error` — the durable production-failure trail.

A 5xx used to leave nothing but a Cloud Logging line nobody watches; now the
ask path (and future callers) writes a bounded record to the admin-only
``server_errors`` collection so `debug_status` can show recent failures.
These tests pin the two things that matter: the record's shape (fn/type/error/
uid/timestamp/expireAt for the TTL prune) and the fail-safe contract (a broken
Firestore write must never raise into the request path).

conftest installs the offline fakes so `import main` works with plain pytest;
Firestore is stubbed at the `main.get_db` boundary.
"""

from datetime import datetime, timedelta, timezone

import main


class _FakeCollection:
    def __init__(self, store):
        self._store = store

    def add(self, doc):
        self._store.append(doc)


class _FakeDb:
    def __init__(self, store):
        self._store = store

    def collection(self, name):
        assert name == "server_errors"
        return _FakeCollection(self._store)


def test_record_server_error_writes_bounded_record(monkeypatch):
    store = []
    monkeypatch.setattr(main, "get_db", lambda: _FakeDb(store))

    main._record_server_error("ask_brain", ValueError("boom " * 200), uid="+15551234567")

    assert len(store) == 1
    rec = store[0]
    assert rec["fn"] == "ask_brain"
    assert rec["type"] == "ValueError"
    assert len(rec["error"]) <= 500  # bounded — no unbounded exception dumps
    assert rec["uid"] == "+15551234567"
    # expireAt is a real Timestamp ~14 days out (TTL-policy compatible, and what
    # the janitor prunes on).
    delta = rec["expireAt"] - datetime.now(timezone.utc)
    assert timedelta(days=13) < delta <= timedelta(days=14)
    # timestamp is the ISO string debug_status orders by.
    assert isinstance(rec["timestamp"], str) and rec["timestamp"]


def test_record_server_error_never_raises(monkeypatch):
    def _explode():
        raise RuntimeError("firestore down")
    monkeypatch.setattr(main, "get_db", _explode)

    # Must swallow — observability can't take the request down with it.
    main._record_server_error("ask_brain", ValueError("original error"))
