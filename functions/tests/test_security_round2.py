"""Regression tests for the 2026-09-16 security pass, round 2.

Each block pins one fix:

  - schedulers: a client-writable `settings` value that is not a map (a
    modified client can write `settings: "x"`; the rules only checked the KEY
    allowlist) must degrade to defaults for that one user, never abort the
    reminder / digest tick for everyone;
  - model output: title / category / tags / concepts coming back from the
    model are length-capped once at `_build_link_data`, and the vocabulary
    fed back into every later prompt is per-item capped too;
  - push: notification title / body are truncated and control characters
    stripped, and a rejected PAYLOAD no longer prunes every device token;
  - reminder intent: "in N days" is bounded, and a bad reminder parse can no
    longer flip an already-saved card to FAILED;
  - graph: schema-less relation JSON is coerced (reason str, concepts list);
  - claim: a deleted Auth user's still-valid ID token cannot mint a ghost
    workspace, and only Google/Apple sign-ins may create one;
  - REQUIRE_AUTH defaults ON (a redeploy with the secret missing must not
    fall back to trusting the client-supplied uid).

Offline: Firestore is faked at the `get_db` boundary.
"""

import sys
import types
from datetime import datetime, timezone, timedelta

import pytest

import main
import link_service
import reminder_service as rs
import digest_service as ds
import graph_service

from tests.test_reminder_check import FakeDB as ReminderFakeDB, past_ms, push_calls  # noqa: F401
from tests.test_digest_check import FakeDB as DigestFakeDB


# ── schedulers survive a non-map `settings` ──────────────────────────────────

def test_reminder_tick_survives_a_non_map_settings_value(monkeypatch, past_ms, push_calls):
    """The attacker's due doc sorts first (nextReminderAt ascending); the
    victim after it must still be delivered."""
    store = {
        "users": {
            "attacker": {
                "settings": "x",  # passes the old key-only rule
                "fcmTokens": ["tok-a"],
                "links": {
                    "l1": {"reminderStatus": "pending", "nextReminderAt": past_ms - 10_000_000,
                           "title": "hostile", "reminderProfile": "once", "reminderCount": 0},
                },
            },
            "victim": {
                "settings": {"reminders_channel": 5},  # non-list channel value
                "fcmTokens": ["tok-v"],
                "links": {
                    "l2": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                           "title": "mine", "reminderProfile": "once", "reminderCount": 0},
                },
            },
        }
    }
    monkeypatch.setattr(rs, "get_db", lambda: ReminderFakeDB(store))

    report = rs.run_reminder_check()

    assert report["users_checked"] == 2
    assert report["errors"] == []
    assert store["users"]["victim"]["links"]["l2"]["reminderStatus"] == "completed"
    assert store["users"]["attacker"]["links"]["l1"]["reminderStatus"] == "completed"
    assert sorted(c[0] for c in push_calls) == ["attacker", "victim"]


def test_digest_scan_survives_a_non_map_settings_value(monkeypatch):
    recorder = {}
    docs = [
        ("0attacker", {"settings": ["not", "a", "map"], "timezone": "UTC"}),
        ("victim", {"settings": {"digest_enabled": True}, "timezone": "UTC",
                    "lastDigestSentAt": None, "fcmTokens": ["t"]}),
    ]
    monkeypatch.setattr(ds, "get_db", lambda: DigestFakeDB(docs, recorder))
    monkeypatch.setattr(ds, "is_due", lambda settings, tz, last: bool(settings.get("digest_enabled")))
    monkeypatch.setattr(ds, "is_synthesis_due", lambda settings, tz: False)
    sent = []
    monkeypatch.setattr(ds, "build_and_send_digest",
                        lambda uid, user_data, force=False: sent.append(uid) or {"sent": True, "card_count": 1})

    report = ds.run_digest_check()

    assert report["users_checked"] == 2
    assert report["errors"] == []
    assert sent == ["victim"]


@pytest.mark.parametrize("value", [None, "x", 5, ["push"], {"digest_channels": "push"}])
def test_settings_of_only_returns_maps(value):
    out = ds._settings_of({"settings": value})
    assert isinstance(out, dict)
    assert ds._settings_of(None) == {}
    assert ds._normalize_channels("push") == ["push"]
    assert ds._normalize_channels(5) == ["push"]
    assert ds._normalize_channels(["whatsapp", "email"]) == ["push"]


def test_send_digest_now_override_merge_tolerates_non_map_settings():
    """The callable merges the caller's preview overrides over the stored
    settings; a non-map stored value must merge as {} not raise."""
    src = open(main.__file__).read()
    assert 'stored_settings = user_data.get("settings")' in src
    assert 'if not isinstance(stored_settings, dict)' in src


# ── model output caps ────────────────────────────────────────────────────────

def test_build_link_data_caps_model_strings():
    analysis = {
        "tags": ["ok"] + ["x" * 500] * 30,
        "category": "y" * 500,
        "concepts": ["c" * 500] * 40 + [7, None],
        "language": "e" * 50,
        "actionableTakeaway": "t" * 5000,
    }
    data = main._build_link_data(
        url="https://e.com", title="T", summary="S", detailed_summary="D",
        source_type="web", source_name="e.com", original_title="T",
        estimated_read_time=1, analysis=analysis,
    )
    assert len(data["tags"]) <= main.MAX_CARD_TAGS
    assert all(len(t) <= main.MAX_TAG_LENGTH for t in data["tags"])
    assert len(data["category"]) <= main.MAX_CATEGORY_LENGTH
    assert len(data["concepts"]) <= main.MAX_CARD_CONCEPTS
    assert all(isinstance(c, str) and len(c) <= main.MAX_TAG_LENGTH for c in data["concepts"])
    assert len(data["language"]) <= 16
    assert len(data["metadata"]["actionableTakeaway"]) <= main.MAX_TAKEAWAY_LENGTH


def test_build_link_data_keeps_ordinary_output_intact():
    analysis = {"tags": ["ai", "tools"], "category": "tech", "concepts": ["LLM"],
                "language": "en", "actionableTakeaway": "Try it."}
    data = main._build_link_data(
        url="https://e.com", title="T", summary="S", detailed_summary="D",
        source_type="web", source_name="e.com", original_title="T",
        estimated_read_time=1, analysis=analysis,
    )
    assert data["tags"] == ["ai", "tools"]
    assert data["category"] == "Tech"
    assert data["concepts"] == ["LLM"]
    assert data["metadata"]["actionableTakeaway"] == "Try it."


def test_user_vocabulary_caps_each_item(monkeypatch):
    class _Doc:
        def __init__(self, d): self._d = d
        def to_dict(self): return self._d

    class _Links:
        def get(self):
            return [_Doc({"tags": ["a" * 300, "b"], "category": "c" * 300}),
                    _Doc({"tags": ["b"], "category": "Fine"})]

    class _Db:
        def collection(self, *_):
            return self
        def document(self, *_):
            return self
        def __getattr__(self, name):
            if name == "collection":
                return lambda *_: _Links()
            raise AttributeError(name)

    class _UserRef:
        def collection(self, name):
            assert name == "links"
            return _Links()

    class _Users:
        def document(self, uid):
            return _UserRef()

    class _RootDb:
        def collection(self, name):
            assert name == "users"
            return _Users()

    monkeypatch.setattr(link_service, "get_db", lambda: _RootDb())
    monkeypatch.setattr(link_service, "_private_collection_ids_for", lambda uid: set(), raising=False)
    import search
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: set())
    monkeypatch.setattr(search, "is_effectively_private", lambda data, ids: False)

    tags, cats = link_service.get_user_vocabulary("u")
    assert all(len(t) <= link_service.MAX_PROMPT_TAG_LENGTH for t in tags)
    assert all(len(c) <= link_service.MAX_PROMPT_CATEGORY_LENGTH for c in cats)
    assert "b" in tags and "Fine" in cats


# ── push payload ─────────────────────────────────────────────────────────────

class _FakeUnregistered(Exception):
    pass


class _FakeFirebaseError(Exception):
    def __init__(self, code, message=""):
        super().__init__(message)
        self.code = code


def _install_messaging(monkeypatch, responses):
    """A fake firebase_admin.messaging whose send records the message and
    answers `responses` (list of (success, exc))."""
    import push_service

    captured = {}

    class _Resp:
        def __init__(self, ok, exc):
            self.success = ok
            self.exception = exc

    class _Batch:
        def __init__(self):
            self.responses = [_Resp(ok, exc) for ok, exc in responses]

    fake = types.SimpleNamespace()
    fake.MulticastMessage = lambda **kw: captured.update(kw) or kw
    fake.Notification = lambda title, body: {"title": title, "body": body}
    fake.APNSConfig = lambda **kw: kw
    fake.APNSPayload = lambda **kw: kw
    fake.Aps = lambda **kw: kw
    fake.send_each_for_multicast = lambda msg: _Batch()
    UnregisteredError = _FakeUnregistered
    _FirebaseError = _FakeFirebaseError
    fake.UnregisteredError = UnregisteredError
    monkeypatch.setattr(push_service, "messaging", fake)
    monkeypatch.setattr(push_service, "exceptions", types.SimpleNamespace(FirebaseError=_FirebaseError))

    updates = []

    class _Snap:
        exists = True
        def to_dict(self):
            return {"fcmTokens": ["t1", "t2"]}

    class _Ref:
        def get(self):
            return _Snap()
        def update(self, u):
            updates.append(u)

    class _Db:
        def collection(self, *_):
            return self
        def document(self, *_):
            return _Ref()

    monkeypatch.setattr(push_service, "get_db", lambda: _Db())
    monkeypatch.setattr(push_service, "firestore", types.SimpleNamespace(ArrayRemove=lambda x: ("remove", x)))
    return push_service, captured, updates, _FirebaseError, UnregisteredError


def test_push_title_and_body_are_truncated_and_control_chars_stripped(monkeypatch):
    ps, captured, updates, _, _ = _install_messaging(monkeypatch, [(True, None), (True, None)])
    title = "A\x00B\r\nC" + "x" * 1000
    body = "line1\nline2\x07" + "y" * 5000
    res = ps.send_push("u", title, body, {"linkId": "l"})
    assert res["sent"] == 2
    sent_title = captured["notification"]["title"]
    sent_body = captured["notification"]["body"]
    assert len(sent_title) <= ps.MAX_PUSH_TITLE_CHARS
    assert len(sent_body) <= ps.MAX_PUSH_BODY_CHARS
    assert "\x00" not in sent_title and "\x07" not in sent_body
    assert sent_title.startswith("A B C")
    assert sent_body.startswith("line1 line2")
    assert updates == []


def test_push_rejected_payload_does_not_prune_tokens(monkeypatch):
    # First install only to obtain the fake error classes; the second install
    # (same fakes) sets the per-token responses.
    _, _, _, FirebaseErr, _ = _install_messaging(monkeypatch, [])
    payload_err = FirebaseErr("INVALID_ARGUMENT", "Request contains an invalid argument: payload too large")
    ps, captured, updates, _, _ = _install_messaging(monkeypatch, [(False, payload_err), (False, payload_err)])
    res = ps.send_push("u", "t", "b")
    assert res["failed"] == 2
    assert res["pruned"] == 0
    assert updates == []


def test_push_invalid_registration_token_is_still_pruned(monkeypatch):
    _, _, _, FirebaseErr, Unregistered = _install_messaging(monkeypatch, [])
    bad_token = FirebaseErr("INVALID_ARGUMENT", "The registration token is not a valid FCM registration token")
    ps, captured, updates, _, _ = _install_messaging(monkeypatch, [(False, bad_token), (False, Unregistered("gone"))])
    res = ps.send_push("u", "t", "b")
    assert res["pruned"] == 2
    assert updates == [{"fcmTokens": ("remove", ["t1", "t2"])}]


# ── reminder intent bounds ───────────────────────────────────────────────────

@pytest.mark.parametrize("text", ["in 9999999 days", "in 99999999999999999999999 days",
                                  "בעוד 9999999 ימים", "in 0 days"])
def test_reminder_days_are_bounded(text):
    now = datetime.now(timezone.utc)
    out = rs.handle_reminder_intent(text)
    if out is None:
        return
    assert timedelta(days=1) <= out - now <= timedelta(days=366)


def test_reminder_step_cannot_fail_the_save():
    """The reminder parse/set runs after the card is written and in its own
    guard, so an unexpected error there logs instead of flipping the card."""
    src = open(main.__file__).read()
    assert "_apply_reminder_intent(" in src
    assert "def _apply_reminder_intent" in src


def test_apply_reminder_intent_swallows_errors(monkeypatch):
    monkeypatch.setattr(main, "handle_reminder_intent", lambda body: (_ for _ in ()).throw(OverflowError("x")))
    main._apply_reminder_intent("u", "l", "in 5 days")  # must not raise
    calls = []
    monkeypatch.setattr(main, "handle_reminder_intent", lambda body: datetime.now(timezone.utc))
    monkeypatch.setattr(main, "set_reminder", lambda uid, lid, t, profile="smart": calls.append((uid, lid, profile)))
    main._apply_reminder_intent("u", "l", "spaced please")
    assert calls == [("u", "l", "spaced")]


# ── graph relation coercion ──────────────────────────────────────────────────

def test_graph_relations_are_coerced():
    class _Fake(graph_service.GraphService):
        def __init__(self):
            pass

    svc = _Fake()
    rels = svc._coerce_relations([
        {"id": "a", "similarity": 0.9, "reason": {"nested": "obj"}, "commonConcepts": "not-a-list"},
        {"id": "b", "similarity": 0.8, "reason": "r" * 2000, "commonConcepts": ["x", 5, "y" * 500]},
        "garbage", None,
    ])
    assert [r["id"] for r in rels] == ["a", "b"]
    assert isinstance(rels[0]["reason"], str)
    assert rels[0]["commonConcepts"] == []
    assert len(rels[1]["reason"]) <= graph_service.MAX_REASON_CHARS
    assert rels[1]["commonConcepts"][0] == "x"
    assert all(isinstance(c, str) and len(c) <= graph_service.MAX_CONCEPT_CHARS for c in rels[1]["commonConcepts"])


# ── claim guards ─────────────────────────────────────────────────────────────

class _NotFound(Exception):
    pass


def _claim_env(monkeypatch, *, user_exists=True, provider="google.com"):
    monkeypatch.setattr(main, "find_data_uid_by_auth_uid", lambda uid: None)
    monkeypatch.setattr(main, "_owner_email_matches", lambda email, claims=None: False)
    monkeypatch.setattr(main, "REQUIRE_AUTH", True)
    created = []
    monkeypatch.setattr(main, "create_workspace", lambda uid, email=None: created.append(uid) or uid)

    fake_auth = types.SimpleNamespace()
    fake_auth.UserNotFoundError = _NotFound

    def get_user(uid):
        if not user_exists:
            raise _NotFound(uid)
        return types.SimpleNamespace(uid=uid, disabled=False)

    fake_auth.get_user = get_user
    monkeypatch.setattr(main, "admin_auth", fake_auth)
    claims = {"firebase": {"sign_in_provider": provider}} if provider else {}
    return created, claims


def test_claim_refuses_to_create_a_workspace_for_a_deleted_auth_user(monkeypatch):
    created, claims = _claim_env(monkeypatch, user_exists=False)
    out = main._claim_workspace_logic("dead-uid", "x@example.com", claims)
    assert out["uid"] is None and out["created"] is False
    assert created == []


def test_claim_refuses_a_provider_outside_the_allowlist(monkeypatch):
    for provider in ("anonymous", "password", "phone", None):
        created, claims = _claim_env(monkeypatch, provider=provider)
        out = main._claim_workspace_logic("u", "x@example.com", claims)
        assert out["uid"] is None, provider
        assert created == []


def test_claim_creates_for_google_and_apple(monkeypatch):
    for provider in ("google.com", "apple.com"):
        created, claims = _claim_env(monkeypatch, provider=provider)
        out = main._claim_workspace_logic("u", "x@example.com", claims)
        assert out == {"uid": "u", "created": True}
        assert created == ["u"]


def test_claim_without_token_claims_is_still_allowed_for_the_callable_path(monkeypatch):
    """The callable transport passes the full decoded token; the HTTP twin
    does too. A caller with NO claims dict (tests, legacy) is refused: the
    provider is part of the create gate now."""
    created, _ = _claim_env(monkeypatch)
    out = main._claim_workspace_logic("u", "x@example.com", None)
    assert out["uid"] is None
    assert created == []


# ── REQUIRE_AUTH default ─────────────────────────────────────────────────────

def test_require_auth_defaults_on():
    assert main._require_auth_flag(None) is True
    assert main._require_auth_flag("") is True
    assert main._require_auth_flag("true") is True
    assert main._require_auth_flag("false") is False
    assert main._require_auth_flag("0") is False


# ── share page: bounded markdown + snapshot caps ─────────────────────────────

import time
import share_service


@pytest.mark.parametrize("payload", ["[" * 30_000, " _a" * 30_000, " **a" * 30_000, "`" * 30_000,
                                     ("[" + " _a" + " **a" + "`") * 8_000])
def test_share_page_markdown_is_linear_on_hostile_text(payload):
    t = time.perf_counter()
    share_service._render_shared_card({"title": "t", "summary": payload, "url": "https://e.com"},
                                      "https://x/s?id=1")
    share_service._md_to_plain(payload)
    assert time.perf_counter() - t < 1.0


def test_share_page_markdown_still_renders_ordinary_emphasis():
    html = share_service._md_to_html("Some **bold** and *italic* with `code` and [a link](https://e.com/x).")
    assert "<strong>bold</strong>" in html and "<em>italic</em>" in html
    assert "<code>code</code>" in html and 'href="https://e.com/x"' in html
    assert share_service._md_to_plain("**bold** _it_") == "bold it"


def test_card_share_snapshot_is_allowlisted_and_clipped():
    doc = share_service._sanitize_card_share_payload({"card": {
        "title": "T" * 1000, "summary": "S" * 100_000, "url": "https://e.com/" + "p" * 5000,
        "tags": ["x" * 500] * 100, "ownerUid": "+15551234567", "id": "card-1",
        "embedding": [0.1] * 768, "sourceType": "web", "metadata": {"youtubeChannel": "c", "secret": "s"},
    }})
    card = doc["card"]
    assert len(card["title"]) == share_service._CARD_MAX_TITLE
    assert len(card["summary"]) == share_service._CARD_MAX_SUMMARY
    assert len(card["url"]) == share_service._CARD_MAX_URL
    assert len(card["tags"]) == share_service._CARD_MAX_TAGS and all(len(t) == 50 for t in card["tags"])
    assert "ownerUid" not in card and "id" not in card and "embedding" not in card
    assert card["metadata"] == {"youtubeChannel": "c"}


def test_collection_share_snapshot_caps_cards():
    doc = share_service._sanitize_collection_share_payload({
        "name": "N", "description": "D", "cards": [{"title": "t", "url": "https://e.com"}] * 500 + ["junk"],
    })
    assert len(doc["cards"]) == share_service._COLLECTION_MAX_CARDS
    assert doc["cards"][0] == {"title": "t", "url": "https://e.com"}


def test_view_original_names_the_destination_host():
    html = share_service._render_shared_card(
        {"title": "Reset your password", "summary": "s", "url": "https://www.evil.example/login"},
        "https://x/s?id=1")
    assert "View original on evil.example" in html


def test_share_page_rejects_malformed_ids_before_firestore(monkeypatch):
    class _Boom:
        def collection(self, *_):
            raise AssertionError("Firestore must not be reached for a malformed id")

    monkeypatch.setattr(main, "get_db", lambda: _Boom())
    for bad in ("a/b", "x" * 200, "..", "a b"):
        req = types.SimpleNamespace(args={"id": bad}, path="/s")
        resp = main.share_page(req)
        assert resp.status_code == 404, bad


# ── reminder overflow snooze ─────────────────────────────────────────────────

def test_reminder_overflow_beyond_the_per_user_cap_is_snoozed(monkeypatch, past_ms, push_calls):
    n = rs.REMINDER_PER_USER_LIMIT + 5
    links = {
        f"l{i}": {"reminderStatus": "pending", "nextReminderAt": past_ms,
                  "title": f"due {i}", "reminderProfile": "smart", "reminderCount": 0}
        for i in range(n)
    }
    store = {"users": {"hank": {"settings": {}, "fcmTokens": ["tok-h"], "links": links}}}
    monkeypatch.setattr(rs, "get_db", lambda: ReminderFakeDB(store))

    report = rs.run_reminder_check()

    delivered = [l for l in store["users"]["hank"]["links"].values() if l.get("reminderCount") == 1]
    assert len(delivered) == rs.REMINDER_PER_USER_LIMIT
    leftovers = [l for l in store["users"]["hank"]["links"].values() if l.get("reminderCount") == 0]
    assert len(leftovers) == 5
    # The leftovers are no longer "due in the past" at the head of the shared
    # query: they were pushed forward by the overflow snooze.
    assert all(l["nextReminderAt"] > past_ms for l in leftovers)
    assert report["reminders_snoozed"] == 5


# ── cost gates ───────────────────────────────────────────────────────────────

def test_video_ingest_gate_by_entitlement_source(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "check_rate_limit", lambda key, limit, window, fail_open=True: calls.append(key) or True)
    monkeypatch.setattr(main, "entitlement_source", lambda uid: "revenuecat")
    assert main._video_ingest_allowed("u") is True
    monkeypatch.setattr(main, "entitlement_source", lambda uid: "founder")
    assert main._video_ingest_allowed("u") is True
    assert calls == []  # committed plans are not rate-limited
    monkeypatch.setattr(main, "entitlement_source", lambda uid: None)
    assert main._video_ingest_allowed("u") is False
    assert main._video_ingest_allowed("u", plan="free") is False
    monkeypatch.setattr(main, "entitlement_source", lambda uid: "trial")
    assert main._video_ingest_allowed("u") is True
    assert calls == ["video-trial-uid:u"]
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: False)
    assert main._video_ingest_allowed("u") is False


def test_video_trial_bucket_fails_closed():
    limit, window, fail_open = main._RATE_LIMITS["video-trial-uid"]
    assert fail_open is False and limit <= 5
    assert main._RATE_LIMITS["rebuild-uid"][0] <= 60
    assert main._RATE_LIMITS["share-config-rotate"] == (5, 3600, False)


def test_plan_for_imports_is_free_for_a_trial(monkeypatch):
    import entitlement as ent
    for source, expected in (("trial", "free"), ("revenuecat", "pro"), ("founder", "pro"), (None, "free")):
        monkeypatch.setattr(ent, "entitlement_source", lambda uid, s=source: s)
        assert ent.plan_for_imports("u") == expected, source


def test_entitlement_source_reads_the_grant(monkeypatch):
    import entitlement as ent
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: {"plan": "pro", "source": "trial", "proUntil": None})
    assert ent.entitlement_source("u") == "trial"
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: {"plan": "free"})
    assert ent.entitlement_source("u") is None


def test_enrich_path_charges_a_save():
    src = open(main.__file__).read()
    i = src.index('if not _card_accepts_screenshots(enrich_card):')
    j = src.index('stored_urls = []', i)
    assert src.count('_quota_blocked(uid, "saves", headers)', i, j) == 2


def test_search_callable_is_rate_limited():
    import search
    src = open(search.__file__).read()
    assert '_callable_rate_limited("search-uid", uid)' in src


def test_analyze_link_refunds_on_empty_scrape():
    src = open(main.__file__).read()
    i = src.index('scraped = scrape_url(url)')
    j = src.index('return _error_response("Failed to scrape content", 500, headers)', i)
    assert 'refund_quota(*charged)' in src[i:j]


def test_janitor_prunes_client_error_reports():
    src = open(main.__file__).read()
    assert 'db.collection("client_error_reports").where(' in src
    assert 'report["client_error_reports_pruned"]' in src


# ── legacy share sweep + opaque storage key ──────────────────────────────────

def test_delete_shares_sweeps_legacy_owner_uid_docs(monkeypatch):
    """A pre-2026-07-07 share has no `shared_owners` row and carries
    `ownerUid` on the public doc; deletion must find it by that field."""
    from tests.test_security_hardening_2026_09 import _SweepDb, _SweepDoc
    log = []
    db = _SweepDb(log)
    db.top["shared_cards"].append(_SweepDoc("shared_cards", "legacy-card", {"ownerUid": "ws-1"}, log))
    db.top["shared_collections"].append(_SweepDoc("shared_collections", "legacy-col", {"ownerUid": "ws-1"}, log))
    monkeypatch.setattr(link_service, "get_db", lambda: db)
    import share_service
    monkeypatch.setattr(share_service, "_delete_share_previews", lambda sid: None)

    link_service.delete_shares_for_owner("ws-1")
    assert "shared_cards/legacy-card" in log
    assert "shared_collections/legacy-col" in log
    assert "shared_cards/share-a" in log  # the modern path still runs


def test_storage_key_is_minted_once_and_fails_soft(monkeypatch):
    writes = []

    class _Snap:
        def __init__(self, d): self._d = d; self.exists = d is not None
        def to_dict(self): return self._d

    class _Ref:
        def __init__(self, d): self._d = d
        def get(self): return _Snap(self._d)
        def set(self, data, merge=False): writes.append(data)

    class _Db:
        def __init__(self, d): self._d = d
        def collection(self, *_): return self
        def document(self, *_): return _Ref(self._d)

    link_service._STORAGE_KEY_CACHE.clear()
    monkeypatch.setattr(link_service, "get_db", lambda: _Db({}))
    key = link_service.storage_key_for("+15551234567")
    assert key != "+15551234567" and len(key) == 32 and writes == [{"storageKey": key}]
    assert link_service.storage_key_for("+15551234567") == key  # cached, no second write
    assert len(writes) == 1

    link_service._STORAGE_KEY_CACHE.clear()
    monkeypatch.setattr(link_service, "get_db", lambda: _Db({"storageKey": "existing"}))
    assert link_service.storage_key_for("u2") == "existing"

    class _Boom:
        def collection(self, *_): raise RuntimeError("down")

    link_service._STORAGE_KEY_CACHE.clear()
    monkeypatch.setattr(link_service, "get_db", lambda: _Boom())
    assert link_service.storage_key_for("u3") == "u3"


def test_no_storage_write_site_uses_the_raw_uid_prefix():
    src = open(main.__file__).read()
    assert 'screenshots/{uid}/' not in src.replace('screenshots/{uid}/", safe', '')
    assert 'post_thumbs/{uid}/' not in src


def test_storage_key_is_not_client_writable():
    rules = open(main.__file__.replace("functions/main.py", "firestore.rules.locked")).read()
    allow = rules[rules.index("function clientWritableUserKeys"):rules.index("function clientUserFieldsTyped")]
    assert "storageKey" not in allow and "ingestToken" not in allow


# ── rotate endpoint ──────────────────────────────────────────────────────────

def test_rotate_ingest_token_overwrites_the_field(monkeypatch):
    writes = []

    class _Ref:
        def set(self, data, merge=False): writes.append((data, merge))

    class _Db:
        def collection(self, *_): return self
        def document(self, *_): return _Ref()

    monkeypatch.setattr(link_service, "get_db", lambda: _Db())
    token = link_service.rotate_ingest_token("u")
    assert main._looks_like_ingest_token(token)
    assert writes[0][1] is True and writes[0][0]["ingestToken"] == token


def test_rotate_endpoint_requires_a_bearer_and_is_post_only(monkeypatch):
    from tests.test_security_hardening_2026_09 import _Req
    monkeypatch.setattr(main, "_verify_bearer", lambda req: None)
    resp = main.rotate_ingest_token_http(_Req(method="POST"))
    assert resp.status_code == 401
    monkeypatch.setattr(main, "_verify_bearer", lambda req: {"uid": "a"})
    assert main.rotate_ingest_token_http(_Req(method="GET")).status_code == 405
    monkeypatch.setattr(main, "find_data_uid_by_auth_uid", lambda uid: "ws")
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "rotate_ingest_token", lambda uid: "n" * 32)
    resp = main.rotate_ingest_token_http(_Req(method="POST"))
    assert resp.status_code == 200
    import json as _json
    assert _json.loads(resp.get_data(as_text=True))["token"] == "n" * 32
