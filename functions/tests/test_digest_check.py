"""run_digest_check — the slimmed scan (field-masked select + stream).

Offline: a tiny fake stands in at the ``digest_service.get_db`` boundary and
records the field mask the scan requests, and is_due / build_and_send_digest are
monkeypatched so the test exercises the *scan/iteration* contract (mask + stream
+ due-gating) without curation or network. Confirms the field mask covers every
field the send path reads, so no per-DUE-user re-fetch is needed.
"""

from datetime import datetime, timezone

import pytest

import digest_service as ds


class FakeUserDoc:
    def __init__(self, uid, data):
        self.id = uid
        self._data = data

    def to_dict(self):
        return dict(self._data)


class FakeUsersCollection:
    def __init__(self, docs, recorder):
        self._docs = docs
        self._recorder = recorder
        self._selected = None

    def select(self, fields):
        self._recorder["selected"] = list(fields)
        self._selected = list(fields)
        return self

    def stream(self):
        self._recorder["streamed"] = True
        for uid, data in self._docs:
            # Emulate the field mask: only selected fields survive the scan.
            masked = {k: v for k, v in data.items() if self._selected is None or k in self._selected}
            yield FakeUserDoc(uid, masked)

    # get() must NOT be used by the slim scan — fail loudly if it is.
    def get(self):  # pragma: no cover
        raise AssertionError("run_digest_check must stream(), not get() the users collection")


class FakeDB:
    def __init__(self, docs, recorder):
        self._docs = docs
        self._recorder = recorder

    def collection(self, name):
        assert name == "users"
        return FakeUsersCollection(self._docs, self._recorder)


def test_slim_scan_uses_field_mask_and_streams(monkeypatch):
    recorder = {}
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    docs = [
        ("alice", {"settings": {"digest_enabled": True}, "timezone": "UTC",
                   "lastDigestSentAt": now_ms, "fcmTokens": ["t"], "bulky": "x" * 1000}),
        ("bob", {"settings": {"digest_enabled": False}, "bulky": "y" * 1000}),
        ("carol", {"settings": {"digest_enabled": True}, "timezone": None,
                   "lastDigestSentAt": None, "fcmTokens": []}),
    ]
    monkeypatch.setattr(ds, "get_db", lambda: FakeDB(docs, recorder))

    # Only carol is "due"; alice enabled-but-not-due; bob disabled.
    def fake_is_due(settings, tz, last):
        return settings.get("digest_enabled") and last is None

    sent_for = []

    def fake_build(uid, user_data, force=False):
        sent_for.append(uid)
        # The send path must find its fields present in the masked doc.
        assert "settings" in user_data
        return {"sent": True, "card_count": 3}

    monkeypatch.setattr(ds, "is_due", fake_is_due)
    monkeypatch.setattr(ds, "build_and_send_digest", fake_build)

    report = ds.run_digest_check()

    # Field mask requested exactly the fields is_due + the send path need.
    assert set(recorder["selected"]) == {"settings", "timezone", "lastDigestSentAt", "fcmTokens"}
    assert recorder["streamed"] is True
    # The bulky field never reached the send path (masked out).
    assert report["users_checked"] == 3
    assert report["users_enabled"] == 2  # alice + carol enabled
    assert sent_for == ["carol"]         # only the due one
    assert report["digests_sent"] == 1
    assert report["cards_delivered"] == 3
