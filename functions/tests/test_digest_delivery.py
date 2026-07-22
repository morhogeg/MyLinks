"""Delivery-path reliability for digest_service — the orchestration around
curation, exercised offline with a tiny recording fake at the get_db boundary.

Covers the reliability guards added in the 2026-07-22 digest audit:
  • synthesis reports skipped (not sent) when the in-app write fails, so a
    swallowed Firestore error never fakes success or suppresses the retry;
  • synthesis is idempotent per ISO week, so mode=synthesis + a daily schedule
    can't re-generate + re-push the same recap every day;
  • the curated digest's period id is derived in the user's LOCAL time, not UTC.
"""

from datetime import datetime, timezone

import pytest

import digest_service as ds


# ── recording fake at the get_db() boundary ───────────────────────────────

class FakeDoc:
    def __init__(self, exists):
        self._exists = exists

    @property
    def exists(self):
        return self._exists


class FakeSubDocRef:
    """A doc inside users/{uid}/{digests|syntheses}."""
    def __init__(self, rec, doc_id):
        self.rec = rec
        self.doc_id = doc_id

    def get(self):
        return FakeDoc(self.rec.synth_exists)

    def set(self, doc):
        self.rec.written[self.doc_id] = doc

    def delete(self):  # pragma: no cover - pruning yields nothing here
        pass


class FakeSubCol:
    """users/{uid}/digests or /syntheses — also the query surface pruning uses."""
    def __init__(self, rec):
        self.rec = rec

    def document(self, doc_id):
        return FakeSubDocRef(self.rec, doc_id)

    def order_by(self, *a, **k):
        return self

    def offset(self, *a, **k):
        return self

    def stream(self):
        return iter(())


class FakeUserDocRef:
    def __init__(self, rec):
        self.rec = rec

    def collection(self, name):
        assert name in ("digests", "syntheses"), name
        return FakeSubCol(self.rec)

    def get(self):
        return FakeDoc(False)

    def set(self, data, merge=False):
        self.rec.user_merge = data


class FakeUsersCol:
    def __init__(self, rec):
        self.rec = rec

    def document(self, uid):
        return FakeUserDocRef(self.rec)


class RecordingDB:
    def __init__(self, synth_exists=False):
        self.synth_exists = synth_exists
        self.written = {}       # doc_id -> doc body
        self.user_merge = None  # last users/{uid}.set(merge=True) payload

    def collection(self, name):
        assert name == "users", name
        return FakeUsersCol(self)


class FakeGeminiRaises:
    """synthesize_week must NOT be called on the idempotent-skip path."""
    def synthesize_week(self, cards):  # pragma: no cover
        raise AssertionError("synthesize_week called despite an existing weekly synthesis")


def _recent_cards(n=3):
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    return [
        {"id": f"c{i}", "title": f"Card {i}", "summary": "s", "category": "General",
         "status": "active", "isRead": False, "createdAt": now_ms - i * 3_600_000}
        for i in range(n)
    ]


# ── synthesis: a failed in-app write is reported, not swallowed ────────────

def test_synthesis_write_failure_is_reported_not_marked_sent(monkeypatch):
    import ai_service

    monkeypatch.setattr(ai_service, "GeminiService",
                        lambda: type("G", (), {"synthesize_week": lambda self, c: {"title": "T", "narrative": "n"}})())
    # The persisting write fails (returns False, mirroring a swallowed exception).
    monkeypatch.setattr(ds, "_write_inapp_synthesis", lambda *a, **k: False)

    res = ds.build_and_send_synthesis(
        "u1", {"settings": {"digest_channels": ["push"]}}, _recent_cards(), force=True,
    )

    assert res["sent"] is False
    assert res["skipped"] == "write_failed"
    assert "in_app" not in res["channels"]


# ── synthesis: idempotent per ISO week (blocks daily re-fire) ──────────────

def test_synthesis_skips_when_week_already_delivered(monkeypatch):
    import ai_service

    monkeypatch.setattr(ai_service, "GeminiService", FakeGeminiRaises)
    monkeypatch.setattr(ds, "get_db", lambda: RecordingDB(synth_exists=True))

    res = ds.build_and_send_synthesis(
        "u1", {"settings": {"digest_channels": ["push"]}}, _recent_cards(), force=False,
    )

    assert res["sent"] is False
    assert res["skipped"] == "already_sent_this_week"


def test_synthesis_force_bypasses_week_dedupe(monkeypatch):
    import ai_service

    # Even with an existing week doc, the preview button (force=True) regenerates.
    called = {"synth": False}

    class G:
        def synthesize_week(self, cards):
            called["synth"] = True
            return {"title": "T", "narrative": "n"}

    monkeypatch.setattr(ai_service, "GeminiService", G)
    monkeypatch.setattr(ds, "get_db", lambda: RecordingDB(synth_exists=True))
    monkeypatch.setattr(ds, "_write_inapp_synthesis", lambda *a, **k: True)

    res = ds.build_and_send_synthesis(
        "u1", {"settings": {"digest_channels": ["push"]}}, _recent_cards(), force=True,
    )

    assert called["synth"] is True
    assert res["sent"] is True


# ── curated digest: period id derived in the user's LOCAL time, not UTC ─────

def test_daily_digest_id_uses_local_day(monkeypatch):
    rec = RecordingDB()
    monkeypatch.setattr(ds, "get_db", lambda: rec)
    monkeypatch.setattr(ds, "fetch_candidate_links", lambda uid: _recent_cards())

    # Pin the user's LOCAL "now" to 23:30 on the 21st. If the id were built from
    # UTC (a fresh now()), it would land on a different date; from local time it
    # must be exactly the 21st. Capture the tz the code threads through.
    captured = {}

    def fake_local_now(tz_name):
        captured["tz"] = tz_name
        return datetime(2026, 7, 21, 23, 30, tzinfo=timezone.utc)

    monkeypatch.setattr(ds, "_local_now", fake_local_now)

    user_data = {"settings": {"digest_mode": "smart", "digest_frequency": "daily"},
                 "timezone": "America/Los_Angeles"}
    res = ds.build_and_send_digest("u1", user_data, force=True)

    assert captured["tz"] == "America/Los_Angeles"
    assert res.get("digest_id") == "2026-07-21"
    assert "2026-07-21" in rec.written
