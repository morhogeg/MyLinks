"""run_reminder_check — the collection-group scan, grouping-by-uid, and delivery.

Offline: a tiny in-memory Firestore fake stands in for the real client at the
``reminder_service.get_db`` boundary, and ``push_service`` is stubbed in
sys.modules (its real module-top ``from firebase_admin import messaging`` can't
import under the conftest fakes). Exercises the new bounded
``collection_group('links')`` query, uid derivation from the doc path, the
per-user settings/push resolution, defensive non-numeric handling, and the
status/schedule transitions — all the behavior the send path must preserve.
"""

import sys
import types
from datetime import datetime, timezone

import pytest

import reminder_service as rs


# ── In-memory Firestore fake ──────────────────────────────────────────────
#
# Shape mirrors the real paths the code walks:
#   users/{uid}                        (user doc: settings, fcmTokens, …)
#   users/{uid}/links/{link_id}        (link doc: reminder fields)
# so uid derivation via reference.parent.parent.id works exactly as in prod.


class FakeCollectionRef:
    def __init__(self, id, parent):
        self.id = id
        self.parent = parent  # a FakeDocRef, or None for a root collection


class FakeDocRef:
    def __init__(self, id, parent_collection, store, uid=None, link_id=None):
        self.id = id
        self.parent = parent_collection  # FakeCollectionRef
        self._store = store
        self._uid = uid
        self._link_id = link_id

    @property
    def path(self):
        if self._link_id is not None:
            return f"users/{self._uid}/links/{self._link_id}"
        return f"users/{self._uid}"

    def update(self, updates):
        self._store["users"][self._uid]["links"][self._link_id].update(updates)

    def get(self):
        # Only used for the per-user users/{uid} fetch.
        data = self._store["users"].get(self._uid)
        return FakeDocSnapshot(
            self.id,
            self,
            None if data is None else {k: v for k, v in data.items() if k != "links"},
        )


class FakeDocSnapshot:
    def __init__(self, id, reference, data):
        self.id = id
        self.reference = reference
        self._data = data

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class FakeQuery:
    def __init__(self, docs):
        self._docs = docs
        self._filters = []
        self._limit = None

    def where(self, field, op, value):
        self._filters.append((field, op, value))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _match(self, data):
        for field, op, value in self._filters:
            actual = data.get(field)
            if op == "==":
                if actual != value:
                    return False
            elif op == "<=":
                # Firestore only matches a numeric field against a numeric
                # operand — a stale Timestamp/string simply isn't returned.
                if not isinstance(actual, (int, float)):
                    return False
                if not actual <= value:
                    return False
            else:  # pragma: no cover - unused ops
                raise NotImplementedError(op)
        return True

    def get(self):
        out = [d for d in self._docs if self._match(d.to_dict())]
        if self._limit is not None:
            out = out[: self._limit]
        return out


class FakeDB:
    def __init__(self, store):
        self._store = store
        self._users_col = FakeCollectionRef("users", None)

    def collection(self, name):
        assert name == "users"
        return _FakeUsersCollection(self._store, self._users_col)

    def collection_group(self, name):
        assert name == "links"
        docs = []
        for uid, udata in self._store["users"].items():
            links_col = FakeCollectionRef(
                "links", FakeDocRef(uid, self._users_col, self._store, uid=uid)
            )
            for link_id, ldata in udata.get("links", {}).items():
                ref = FakeDocRef(
                    link_id, links_col, self._store, uid=uid, link_id=link_id
                )
                docs.append(FakeDocSnapshot(link_id, ref, ldata))
        return FakeQuery(docs)

    def get_all(self, refs):
        # Batched user-doc fetch (mirrors Firestore db.get_all): each ref is a
        # users/{uid} FakeDocRef; return its snapshot (exists=False when missing).
        out = []
        for ref in refs:
            data = self._store["users"].get(ref._uid)
            snap = FakeDocSnapshot(
                ref.id, ref,
                None if data is None else {k: v for k, v in data.items() if k != "links"},
            )
            snap.exists = data is not None
            out.append(snap)
        return out


class _FakeUsersCollection:
    def __init__(self, store, users_col):
        self._store = store
        self._users_col = users_col

    def document(self, uid):
        return FakeDocRef(uid, self._users_col, self._store, uid=uid)


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def past_ms():
    return int(datetime.now(timezone.utc).timestamp() * 1000) - 60_000


@pytest.fixture
def future_ms():
    return int(datetime.now(timezone.utc).timestamp() * 1000) + 3_600_000


@pytest.fixture
def push_calls(monkeypatch):
    """Stub push_service so `from push_service import send_push` resolves to a
    recording fake. Returns the call list; each entry is (uid, title, body, data)."""
    calls = []

    def _send_push(uid, title, body, data=None):
        calls.append((uid, title, body, data))
        return {"sent": 1}

    stub = types.ModuleType("push_service")
    stub.send_push = _send_push
    monkeypatch.setitem(sys.modules, "push_service", stub)
    return calls


def _install_db(monkeypatch, store):
    db = FakeDB(store)
    monkeypatch.setattr(rs, "get_db", lambda: db)
    return db


# ── Tests ─────────────────────────────────────────────────────────────────


def test_groups_due_links_by_uid_and_fetches_each_user_once(monkeypatch, past_ms, future_ms, push_calls):
    store = {
        "users": {
            "alice": {
                "settings": {},  # reminders default enabled, channel default push
                "fcmTokens": ["tok-a"],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "Due one", "reminderProfile": "once", "reminderCount": 0},
                    "l2": {"reminderStatus": "pending", "nextReminderAt": future_ms,
                           "title": "Not yet", "reminderProfile": "smart", "reminderCount": 0},
                },
            },
            "bob": {
                "settings": {},
                "fcmTokens": [],  # no tokens → in-app surface only
                "links": {
                    "l3": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "Bob due", "reminderProfile": "smart", "reminderCount": 0},
                },
            },
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()

    # Only the two users with DUE links were checked (future-only users skipped).
    assert report["users_checked"] == 2
    assert report["users_with_reminders_enabled"] == 2
    assert report["reminders_found"] == 2  # l1 + l3, not the future l2
    # Alice has a live token → push; Bob has none → surfaced in-app.
    assert report["reminders_sent"] == 1
    assert report["reminders_surfaced"] == 1
    assert [c[0] for c in push_calls] == ["alice"]

    # l1 was a 'once' → completed; l2 (future) untouched.
    assert store["users"]["alice"]["links"]["l1"]["reminderStatus"] == "completed"
    assert store["users"]["alice"]["links"]["l1"]["nextReminderAt"] is None
    assert store["users"]["alice"]["links"]["l2"]["reminderStatus"] == "pending"
    # Every delivered link gets the in-app flag.
    assert store["users"]["alice"]["links"]["l1"]["reminderDue"] is True
    assert store["users"]["bob"]["links"]["l3"]["reminderDue"] is True


def test_disabled_user_due_docs_are_snoozed_not_delivered(monkeypatch, past_ms, push_calls):
    store = {
        "users": {
            "carol": {
                "settings": {"reminders_enabled": False},
                "fcmTokens": ["tok-c"],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "x", "reminderProfile": "smart", "reminderCount": 0},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()

    assert report["users_checked"] == 1
    assert report["users_with_reminders_enabled"] == 0
    assert report["reminders_found"] == 0
    assert push_calls == []
    link = store["users"]["carol"]["links"]["l1"]
    # Nothing delivered — still pending, not flagged due.
    assert link["reminderStatus"] == "pending"
    assert "reminderDue" not in link
    # But SNOOZED off the batch head: nextReminderAt pushed ~1h into the future so
    # it stops being re-fetched every tick and starving deliverable users.
    assert isinstance(link["nextReminderAt"], int)
    assert link["nextReminderAt"] > past_ms


def test_per_user_cap_limits_deliveries(monkeypatch, past_ms, push_calls):
    # A user with more than REMINDER_PER_USER_LIMIT due docs delivers only the cap
    # this tick; the rest stay pending (untouched) for subsequent ticks.
    n = rs.REMINDER_PER_USER_LIMIT + 5
    links = {
        f"l{i}": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                  "title": f"due {i}", "reminderProfile": "smart", "reminderCount": 0}
        for i in range(n)
    }
    store = {"users": {"hank": {"settings": {}, "fcmTokens": ["tok-h"], "links": links}}}
    _install_db(monkeypatch, store)

    rs.run_reminder_check()

    # Exactly REMINDER_PER_USER_LIMIT were delivered (smart → rescheduled, count 1).
    delivered = [l for l in store["users"]["hank"]["links"].values()
                 if l.get("reminderCount") == 1]
    assert len(delivered) == rs.REMINDER_PER_USER_LIMIT
    # The leftovers are untouched (still count 0, still due in the past).
    untouched = [l for l in store["users"]["hank"]["links"].values()
                 if l.get("reminderCount") == 0]
    assert len(untouched) == 5


def test_smart_profile_recurs_not_completed(monkeypatch, past_ms, push_calls):
    store = {
        "users": {
            "dan": {
                "settings": {},
                "fcmTokens": ["tok-d"],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "Recur", "reminderProfile": "smart", "reminderCount": 0},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    rs.run_reminder_check()

    link = store["users"]["dan"]["links"]["l1"]
    assert link["reminderStatus"] == "pending"  # smart recurs, not completed
    assert link["reminderCount"] == 1
    assert isinstance(link["nextReminderAt"], int)
    assert link["nextReminderAt"] > past_ms  # rescheduled into the future


def test_whatsapp_channel_migrated_to_push(monkeypatch, past_ms, push_calls):
    store = {
        "users": {
            "erin": {
                "settings": {"reminders_channel": ["whatsapp"]},
                "fcmTokens": ["tok-e"],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "x", "reminderProfile": "once", "reminderCount": 0},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()
    # Legacy 'whatsapp' normalizes to 'push' at read time → push sent.
    assert report["reminders_sent"] == 1
    assert [c[0] for c in push_calls] == ["erin"]


def test_non_numeric_next_reminder_is_defensively_skipped(monkeypatch, past_ms, push_calls):
    # A stale string nextReminderAt would never pass the '<=' filter in real
    # Firestore; the fake enforces the same, and the read-time isinstance guard
    # is belt-and-suspenders. Confirm nothing fires and the doc is untouched.
    store = {
        "users": {
            "fay": {
                "settings": {},
                "fcmTokens": ["tok-f"],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": "2021-01-01",
                           "title": "x", "reminderProfile": "smart", "reminderCount": 0},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()
    assert report["reminders_found"] == 0
    assert push_calls == []
    assert store["users"]["fay"]["links"]["l1"]["reminderStatus"] == "pending"


def test_uid_derivation_from_reference():
    store = {"users": {"u1": {"links": {"lk": {}}}}}
    db = FakeDB(store)
    snap = db.collection_group("links").get()[0]
    assert rs._uid_from_link_ref(snap.reference) == "u1"


def test_missing_index_error_detection():
    # By class name (google.api_core.exceptions.FailedPrecondition).
    err = type("FailedPrecondition", (Exception,), {})("boom")
    assert rs._is_missing_index_error(err) is True
    # By gRPC status text in the message.
    assert rs._is_missing_index_error(
        Exception("400 The query requires an index. Create it here: ...")) is True
    assert rs._is_missing_index_error(
        Exception("9 FAILED_PRECONDITION: needs index")) is True
    # An unrelated error is NOT treated as a missing index.
    assert rs._is_missing_index_error(Exception("connection reset")) is False


# ── _coerce_reminder_ms (pure legacy-value normalization) ─────────────────────

def test_coerce_int_is_left_alone():
    assert rs._coerce_reminder_ms(1_700_000_000_000) == (None, "ok")


def test_coerce_float_converts_to_int():
    new, status = rs._coerce_reminder_ms(1_700_000_000_000.0)
    assert status == "converted"
    assert new == 1_700_000_000_000
    assert isinstance(new, int)


def test_coerce_numeric_string():
    assert rs._coerce_reminder_ms("1700000000000") == (1_700_000_000_000, "converted")


def test_coerce_iso_string():
    new, status = rs._coerce_reminder_ms("2021-01-01T00:00:00Z")
    assert status == "converted"
    # 2021-01-01T00:00:00Z == 1609459200 s == 1609459200000 ms.
    assert new == 1_609_459_200_000


def test_coerce_timestamp_like_object():
    class FakeTimestamp:
        def timestamp(self):
            return 1_609_459_200.0  # epoch seconds
    new, status = rs._coerce_reminder_ms(FakeTimestamp())
    assert status == "converted"
    assert new == 1_609_459_200_000


def test_coerce_unparseable_string_left():
    assert rs._coerce_reminder_ms("not a date") == (None, "unparseable")


def test_coerce_bool_is_unparseable():
    # bool is an int subclass but never a valid ms value.
    assert rs._coerce_reminder_ms(True) == (None, "unparseable")


def test_coerce_none_is_unparseable():
    assert rs._coerce_reminder_ms(None) == (None, "unparseable")


def test_coerce_pending_reminder_times_rewrites_legacy(monkeypatch):
    class FakeTimestamp:
        def timestamp(self):
            return 1_609_459_200.0
    store = {
        "users": {
            "u1": {
                "links": {
                    "int_ok": {"reminderStatus": "pending", "nextReminderAt": 123},
                    "ts": {"reminderStatus": "pending", "nextReminderAt": FakeTimestamp()},
                    "str": {"reminderStatus": "pending", "nextReminderAt": "2021-01-01T00:00:00Z"},
                    "bad": {"reminderStatus": "pending", "nextReminderAt": "garbage"},
                    "done": {"reminderStatus": "completed", "nextReminderAt": "2021-01-01T00:00:00Z"},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    report = rs.coerce_pending_reminder_times()

    assert report["scanned"] == 4  # only pending docs (not the completed one)
    assert report["already_int"] == 1
    assert report["converted"] == 2
    assert report["unparseable"] == 1
    links = store["users"]["u1"]["links"]
    assert links["ts"]["nextReminderAt"] == 1_609_459_200_000
    assert links["str"]["nextReminderAt"] == 1_609_459_200_000
    assert links["bad"]["nextReminderAt"] == "garbage"  # left in place
    assert links["done"]["nextReminderAt"] == "2021-01-01T00:00:00Z"  # untouched


# ── Corrupt-doc resilience: one bad doc must never take down the tick ───────
#
# These pin the blast-radius contract: a malformed field on ONE link or ONE
# user degrades that item only. Before the fix, each of these aborted the
# ENTIRE tick — and since the doc stayed due, every subsequent tick died the
# same way (a permanent, self-sustaining reminder outage).


def test_null_title_link_does_not_abort_tick(monkeypatch, past_ms, push_calls):
    store = {
        "users": {
            "alice": {
                "settings": {}, "fcmTokens": [],
                "links": {
                    "bad": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                            "title": None, "reminderProfile": "smart", "reminderCount": 0},
                },
            },
            "bob": {
                "settings": {}, "fcmTokens": [],
                "links": {
                    "ok": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "fine", "reminderProfile": "smart", "reminderCount": 0},
                },
            },
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()  # must not raise (is_hebrew(None) used to)

    # BOTH links delivered — including the null-title one, as "Untitled".
    assert store["users"]["bob"]["links"]["ok"]["reminderDue"] is True
    assert store["users"]["alice"]["links"]["bad"]["reminderDue"] is True
    assert report["errors"] == []


def test_null_profile_does_not_push_spam(monkeypatch, past_ms, push_calls):
    # reminderProfile: None used to crash AFTER the push was sent but BEFORE
    # the schedule advanced — so the doc stayed due and the user was pushed
    # again on every 2-minute tick, forever.
    store = {
        "users": {
            "dana": {
                "settings": {}, "fcmTokens": ["tok-d"],
                "links": {
                    "l": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                          "title": "t", "reminderProfile": None, "reminderCount": 0},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    rs.run_reminder_check()
    rs.run_reminder_check()

    assert len(push_calls) == 1  # second tick must NOT re-push
    assert store["users"]["dana"]["links"]["l"]["nextReminderAt"] != past_ms


def test_non_int_reminder_count_still_advances_schedule(monkeypatch, past_ms, push_calls):
    store = {
        "users": {
            "erin": {
                "settings": {}, "fcmTokens": [],
                "links": {
                    "l": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                          "title": "t", "reminderProfile": "smart", "reminderCount": "2"},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()

    assert report["errors"] == []
    # "2" coerces to 2 → third fire → completed (the 3-fire cap).
    assert store["users"]["erin"]["links"]["l"]["reminderStatus"] == "completed"


def test_non_dict_settings_only_affects_that_user(monkeypatch, past_ms, push_calls):
    store = {
        "users": {
            "corrupt": {
                "settings": "on",  # truthy non-dict — used to AttributeError the tick
                "fcmTokens": [],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "x", "reminderProfile": "smart", "reminderCount": 0},
                },
            },
            "healthy": {
                "settings": {}, "fcmTokens": [],
                "links": {
                    "l2": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "y", "reminderProfile": "smart", "reminderCount": 0},
                },
            },
        }
    }
    _install_db(monkeypatch, store)

    rs.run_reminder_check()  # must not raise

    assert store["users"]["healthy"]["links"]["l2"]["reminderDue"] is True


def test_string_reminders_channel_still_pushes(monkeypatch, past_ms, push_calls):
    # A bare-string channel setting ("push" instead of ["push"]) used to
    # iterate as characters and silently disable push while everything else
    # looked healthy.
    store = {
        "users": {
            "fred": {
                "settings": {"reminders_channel": "push"},
                "fcmTokens": ["tok-f"],
                "links": {
                    "l": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                          "title": "t", "reminderProfile": "once", "reminderCount": 0},
                },
            }
        }
    }
    _install_db(monkeypatch, store)

    report = rs.run_reminder_check()

    assert report["reminders_sent"] == 1
    assert [c[0] for c in push_calls] == ["fred"]
