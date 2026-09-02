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
    monkeypatch.setattr(ds, "is_pro", lambda uid: True)
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


# ── Machina Pro: curated digests are Pro-only; synthesis locks for free ────

def test_curated_digest_skipped_for_free_workspace(monkeypatch):
    rec = RecordingDB()
    monkeypatch.setattr(ds, "get_db", lambda: rec)
    monkeypatch.setattr(ds, "is_pro", lambda uid: False)
    monkeypatch.setattr(ds, "fetch_candidate_links", lambda uid: _recent_cards())

    res = ds.build_and_send_digest(
        "u1", {"settings": {"digest_mode": "smart", "digest_frequency": "daily"}}, force=True,
    )
    assert res["sent"] is False
    assert res["skipped"] == "pro_required"
    assert rec.written == {}


def test_synthesis_for_free_workspace_is_locked_teaser_and_vaulted(monkeypatch):
    import ai_service

    rec = RecordingDB()
    vault = {}
    monkeypatch.setattr(ds, "get_db", lambda: rec)
    monkeypatch.setattr(ds, "is_pro", lambda uid: False)
    monkeypatch.setattr(ai_service, "GeminiService", lambda: type("G", (), {
        "synthesize_week": lambda self, c: {
            "title": "Three threads", "narrative": "You kept circling one idea. Then two more joined it.",
            "themes": [{"title": "T", "insight": "i", "cardIds": ["c0"]}], "openQuestion": "Why?",
        }})())
    import entitlement
    monkeypatch.setattr(entitlement, "stash_synthesis", lambda uid, wk, doc: vault.__setitem__(wk, doc))

    res = ds.build_and_send_synthesis("u1", {"settings": {}}, _recent_cards(), force=True)

    assert res["sent"] is True and res["locked"] is True
    (week_id, visible), = rec.written.items()
    assert visible["locked"] is True
    assert visible["title"] == "Three threads"
    assert visible["teaser"] == "You kept circling one idea."
    # Nothing readable leaks past the teaser.
    assert visible["narrative"] == "" and visible["themes"] == [] and visible["openQuestion"] == ""
    assert visible["cards"] == []
    # The full payload waits in the vault under the same week.
    assert vault[week_id]["narrative"].startswith("You kept circling")
    assert vault[week_id]["themes"][0]["cardIds"] == ["c0"]


def test_synthesis_for_pro_workspace_is_written_in_full(monkeypatch):
    import ai_service

    rec = RecordingDB()
    monkeypatch.setattr(ds, "get_db", lambda: rec)
    monkeypatch.setattr(ds, "is_pro", lambda uid: True)
    monkeypatch.setattr(ai_service, "GeminiService", lambda: type("G", (), {
        "synthesize_week": lambda self, c: {"title": "T", "narrative": "Full text."}})())

    res = ds.build_and_send_synthesis("u1", {"settings": {}}, _recent_cards(), force=True)
    assert res["locked"] is False
    (_, visible), = rec.written.items()
    assert "locked" not in visible
    assert visible["narrative"] == "Full text."


def test_synthesis_teaser_is_one_sentence():
    assert ds.synthesis_teaser("First. Second.") == "First."
    assert ds.synthesis_teaser("No terminal punctuation here") == "No terminal punctuation here"
    long = "word " * 60
    t = ds.synthesis_teaser(long)
    assert len(t) <= 164 and t.endswith("...")
    assert ds.synthesis_teaser("") == ""
