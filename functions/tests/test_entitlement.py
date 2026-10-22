"""Offline unit tests for entitlement.py: the grant rules, the effective-plan
clock, the RevenueCat subscriber reduction, and the nudge copy. Pure functions
only; Firestore-touching paths are exercised through fakes at get_db."""

from datetime import datetime, timezone

import entitlement as ent


DAY = 24 * 60 * 60 * 1000


def _ms(iso):
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def test_a_pre_launch_workspace_gets_no_founders_year():
    """The founders' year is gone (2026-10-13): an old workspace is measured
    like anyone else, so its trial ceiling has long passed and it reads free."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch - 30 * DAY
    g = ent.grant_for(created)
    assert g["source"] == "trial"
    assert g["proUntil"] == created + ent.TRIAL_DAYS * DAY
    assert ent.effective_plan(g, now_ms=launch + 40 * DAY) == "free"


def test_missing_created_at_is_free():
    g = ent.grant_for(None)
    assert g["plan"] == "free" and g["source"] is None
    assert ent.effective_plan(g) == "free"


def test_the_owner_is_pro_with_no_expiry():
    launch = _ms(ent.PRO_LAUNCH_AT)
    g = ent.grant_for(launch - 300 * DAY, launch, launch + DAY, owner=True)
    assert g == ent.owner_grant()
    assert g["source"] == "owner" and g["proUntil"] is None
    assert ent.effective_plan(g, now_ms=launch + 10_000 * DAY) == "pro"


def test_a_new_trial_runs_fourteen_days_from_creation():
    """Since 2026-10-13 the countdown starts at sign-up and is visible from day one."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 3 * DAY
    g = ent.grant_for(created)
    assert g["source"] == "trial"
    assert g["trialAnchorAt"] == created
    assert g["trialEndsAt"] == created + 14 * DAY
    assert g["proUntil"] == g["trialEndsAt"]
    assert ent.effective_plan(g, now_ms=created + 13 * DAY) == "pro"
    assert ent.effective_plan(g, now_ms=created + 15 * DAY) == "free"


def test_trial_anchored_at_ten_cards_runs_fourteen_days_from_the_anchor():
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 3 * DAY
    anchor = created + 9 * DAY          # the 10th card landed on day 9
    g = ent.grant_for(created, anchor)
    assert g["trialAnchorAt"] == anchor
    assert g["trialEndsAt"] == anchor + 14 * DAY
    assert g["proUntil"] == g["trialEndsAt"]
    assert ent.effective_plan(g, now_ms=anchor + 13 * DAY) == "pro"
    assert ent.effective_plan(g, now_ms=anchor + 15 * DAY) == "free"
    # A reinstall re-reads the STORED anchor, so the clock cannot restart.
    assert ent.grant_for(created, anchor)["trialEndsAt"] == g["trialEndsAt"]


def test_the_sixty_day_ceiling_caps_a_late_anchor():
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 3 * DAY
    anchor = created + 55 * DAY         # the 10th card landed on day 55
    g = ent.grant_for(created, anchor)
    # 55 + 14 = 69 days, but the ceiling lands first.
    assert g["trialEndsAt"] == created + ent.TRIAL_CEILING_DAYS * DAY
    assert ent.trial_ends_from_anchor(created, anchor) == g["trialEndsAt"]


def test_a_pre_anchor_trial_doc_keeps_its_existing_end_date():
    """Docs written before the anchor rule shipped are grandfathered, untouched."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 3 * DAY
    old_ends = created + 14 * DAY
    g = ent.grant_for(created, None, old_ends)
    assert g["trialEndsAt"] == old_ends
    assert g["proUntil"] == old_ends
    assert g["trialAnchorAt"] is None
    assert ent.effective_plan(g, now_ms=created + 21 * DAY) == "free"


def test_owner_counts_as_committed_pro(monkeypatch):
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: ent.owner_grant())
    assert ent.is_committed_pro("me") is True
    assert ent.plan_for_imports("me") == "pro"


def test_created_at_in_seconds_or_iso_is_normalised():
    launch = _ms(ent.PRO_LAUNCH_AT)
    created_s = (launch + DAY) // 1000
    assert ent.grant_for(created_s)["source"] == "trial"
    assert ent.grant_for("2030-01-01T00:00:00Z")["source"] == "trial"


def test_effective_plan_rules():
    now = _ms("2026-09-10")
    assert ent.effective_plan(None, now) == "free"
    assert ent.effective_plan({"plan": "free", "proUntil": now + DAY}, now) == "free"
    assert ent.effective_plan({"plan": "pro", "proUntil": now - 1}, now) == "free"
    assert ent.effective_plan({"plan": "pro", "proUntil": now + 1}, now) == "pro"
    # Lifetime: no expiry at all.
    assert ent.effective_plan({"plan": "pro", "proUntil": None}, now) == "pro"


def test_pro_from_subscriber_reads_the_pro_entitlement_only():
    now = _ms("2026-09-10")
    sub = {"entitlements": {"pro": {"expires_date": "2026-10-10T00:00:00Z",
                                    "product_identifier": "com.morhogeg.machina.pro.monthly"}}}
    r = ent.pro_from_subscriber(sub, now)
    assert r["active"] is True
    assert r["productId"] == "com.morhogeg.machina.pro.monthly"
    assert r["proUntil"] == _ms("2026-10-10")

    expired = {"entitlements": {"pro": {"expires_date": "2026-09-01T00:00:00Z"}}}
    assert ent.pro_from_subscriber(expired, now)["active"] is False
    assert ent.pro_from_subscriber({"entitlements": {"other": {}}}, now)["active"] is False
    assert ent.pro_from_subscriber({}, now)["active"] is False
    lifetime = {"entitlements": {"pro": {"expires_date": None}}}
    assert ent.pro_from_subscriber(lifetime, now)["active"] is True


def test_fetch_subscriber_requires_the_secret(monkeypatch):
    monkeypatch.delenv("REVENUECAT_SECRET_KEY", raising=False)
    assert ent.rc_configured() is False
    try:
        ent.fetch_subscriber("abc")
    except ent.RevenueCatError as e:
        assert "REVENUECAT_SECRET_KEY" in str(e)
    else:  # pragma: no cover
        raise AssertionError("expected RevenueCatError")


def test_trial_nudge_copy_is_plain_and_dash_free():
    now = _ms("2026-09-10")  # a Thursday
    title, body = ent.trial_nudge_copy(now + 3 * DAY, 12, 1, "UTC", now)
    assert title == "Your Pro trial ends Sunday"
    # No usage counts: this month's metered saves read as the library size.
    assert "12" not in body and "free plan" in body
    assert "—" not in title + body
    # A status notice, not an upsell (App Review 4.5.4: people opted into
    # reminders and digests, not marketing).
    assert "Machina Pro" not in body and "unlimited" not in body.lower()
    title, _ = ent.trial_nudge_copy(now + DAY, 1, 0, "UTC", now)
    assert title == "Your Pro trial ends tomorrow"
    title, body = ent.trial_nudge_copy(now + 3600 * 1000, 1, 2, "UTC", now)
    assert title == "Your Pro trial ends today"


def test_resolve_workspace_skips_anonymous_ids_and_uses_aliases(monkeypatch):
    import link_service
    seen = []

    def fake_find(auth_uid):
        seen.append(auth_uid)
        return "ws-1" if auth_uid == "firebase-uid" else None

    monkeypatch.setattr(link_service, "find_data_uid_by_auth_uid", fake_find)
    uid = ent.resolve_workspace_for_app_user("$RCAnonymousID:abc", ["firebase-uid"])
    assert uid == "ws-1"
    assert seen == ["firebase-uid"]
    assert ent.resolve_workspace_for_app_user(None, []) is None


def test_get_entitlement_fails_open_to_free(monkeypatch):
    class Boom:
        def collection(self, name):
            raise RuntimeError("firestore down")

    monkeypatch.setattr(ent, "get_db", lambda: Boom())
    doc = ent.get_entitlement("u1")
    assert doc["plan"] == "free" and doc["source"] is None
    assert ent.plan_for("u1") == "free"
    assert ent.is_pro("u1") is False


def test_get_entitlement_lazily_creates_the_grant(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = {}

    class Snap:
        def __init__(self, data):
            self._d = data
            self.exists = data is not None

        def to_dict(self):
            return dict(self._d) if self._d is not None else None

    class DocRef:
        def __init__(self, col, doc_id):
            self.col, self.doc_id = col, doc_id

        def get(self):
            if self.col == "users":
                return Snap({"createdAt": launch + 2 * DAY})
            return Snap(created.get(self.doc_id))

        def create(self, doc):
            created[self.doc_id] = doc

    class Col:
        def __init__(self, name):
            self.name = name

        def document(self, doc_id):
            return DocRef(self.name, doc_id)

    class DB:
        def collection(self, name):
            return Col(name)

    monkeypatch.setattr(ent, "get_db", lambda: DB())
    doc = ent.get_entitlement("u1")
    assert doc["source"] == "trial"
    # A fresh trial's 14 days run from createdAt.
    assert doc["trialAnchorAt"] == launch + 2 * DAY
    assert doc["trialEndsAt"] == launch + (2 + ent.TRIAL_DAYS) * DAY
    assert doc["proUntil"] == doc["trialEndsAt"]
    assert doc["nudgedAt"] is None
    assert "u1" in created
    # Second call reads the stored doc rather than recreating it.
    assert ent.get_entitlement("u1")["proUntil"] == doc["proUntil"]


def test_entitlement_summary_adds_the_trial_and_import_fields(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    doc = {"plan": "pro", "source": "trial", "proUntil": launch + 60 * DAY,
           "trialEndsAt": None, "trialAnchorAt": None}
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: dict(doc))
    import quota
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {"saves": 2, "asks": 1, "imports": 40})
    monkeypatch.setattr(ent, "_count_waiting", lambda uid: 0)

    summary = ent.entitlement_summary("u1")
    # Backward compatible: every field the shipped client reads is still here.
    for key in ("plan", "source", "proUntil", "trialEndsAt", "quotas"):
        assert key in summary
    assert summary["plan"] == "pro"
    assert summary["trialEndsAt"] is None
    assert summary["trialAnchorAt"] is None
    assert summary["trialAnchorCards"] == ent.TRIAL_ANCHOR_CARDS
    assert summary["quotas"]["imports"]["used"] == 40
    # A trial's import meter is the free allowance import_links_http enforces.
    assert summary["quotas"]["imports"]["limit"] == quota.quota_limit("imports", "free")
    assert summary["quotas"]["saves"]["used"] == 2
    assert summary["waiting"] == 0
    assert summary["freeLimits"] == {"saves": quota.quota_limit("saves", "free"),
                                     "asks": quota.quota_limit("asks", "free"),
                                     "imports": quota.quota_limit("imports", "free")}
    assert summary["willRenew"] is None and summary["billingIssue"] is False


def test_entitlement_summary_import_meter_is_pro_only_when_committed(monkeypatch):
    import quota
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {})
    monkeypatch.setattr(ent, "_count_waiting", lambda uid: 0)
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: ent.owner_grant())
    assert ent.entitlement_summary("me")["quotas"]["imports"]["limit"] == quota.quota_limit("imports", "pro")
    # A lapsed subscription is free for imports too.
    launch = _ms(ent.PRO_LAUNCH_AT)
    monkeypatch.setattr(ent, "get_entitlement",
                        lambda uid: {"plan": "pro", "source": "revenuecat", "proUntil": launch})
    assert ent.entitlement_summary("u")["quotas"]["imports"]["limit"] == quota.quota_limit("imports", "free")


# ── Owner grant and the founders' migration (2026-10-13) ─────────────────────

class _MemDB:
    """Just enough Firestore: collection/document get, create, set(merge)."""

    def __init__(self, docs):
        self.docs = {k: dict(v) for k, v in docs.items()}   # "col/id" -> data
        self.sets = []

    def collection(self, name):
        db = self

        class _Snap:
            def __init__(self, data):
                self._d, self.exists = data, data is not None

            def to_dict(self):
                return dict(self._d) if self._d is not None else None

        class _Ref:
            def __init__(self, doc_id):
                self.key = f"{name}/{doc_id}"

            def get(self, transaction=None):
                return _Snap(db.docs.get(self.key))

            def create(self, doc):
                db.docs[self.key] = dict(doc)

            def set(self, doc, merge=False):
                db.sets.append((self.key, dict(doc)))
                base = db.docs.get(self.key, {}) if merge else {}
                db.docs[self.key] = {**base, **doc}

        class _Col:
            def document(self, doc_id):
                return _Ref(doc_id)

        return _Col()


def _owner_env(monkeypatch, docs, emails, owner_email="me@example.com"):
    db = _MemDB(docs)
    monkeypatch.setattr(ent, "get_db", lambda: db)
    monkeypatch.setattr(ent, "_verified_account_email", lambda auth_uid: emails.get(auth_uid))
    if owner_email is None:
        monkeypatch.delenv("OWNER_EMAIL", raising=False)
    else:
        monkeypatch.setenv("OWNER_EMAIL", owner_email)
    return db


def test_owner_is_matched_through_a_linked_account_email(monkeypatch):
    _owner_env(monkeypatch, {"users/+972": {"authUids": ["a1", "a2"]}},
               {"a1": "relay@privaterelay.appleid.com", "a2": "Me@Example.com"})
    assert ent.is_owner_workspace("+972") is True


def test_owner_check_ignores_the_email_written_on_the_doc(monkeypatch):
    _owner_env(monkeypatch, {"users/u1": {"authUids": ["a1"], "email": "me@example.com"}},
               {"a1": "someone@else.com"})
    assert ent.is_owner_workspace("u1") is False


def test_owner_check_fails_closed_without_owner_email(monkeypatch):
    _owner_env(monkeypatch, {"users/u1": {"authUids": ["a1"]}}, {"a1": "me@example.com"},
               owner_email=None)
    assert ent.is_owner_workspace("u1") is False


def test_a_stored_founder_doc_becomes_the_owner_grant_for_the_owner(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    db = _owner_env(monkeypatch, {
        "users/+972": {"authUids": ["a1"], "createdAt": launch - 200 * DAY},
        "entitlements/+972": {"plan": "pro", "source": "founder",
                              "proUntil": launch + 365 * DAY, "trialEndsAt": None},
    }, {"a1": "me@example.com"})
    doc = ent.get_entitlement("+972")
    assert doc["source"] == "owner" and doc["proUntil"] is None
    assert db.docs["entitlements/+972"]["source"] == "owner"
    assert ent.effective_plan(doc) == "pro"


def test_a_stored_founder_doc_drops_to_free_for_anyone_else(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    db = _owner_env(monkeypatch, {
        "users/u2": {"authUids": ["b1"], "createdAt": launch - 100 * DAY},
        "entitlements/u2": {"plan": "pro", "source": "founder",
                            "proUntil": launch + 365 * DAY, "trialEndsAt": None},
    }, {"b1": "tester@example.com"})
    doc = ent.get_entitlement("u2")
    assert doc["source"] == "trial"
    assert ent.effective_plan(doc) == "free"
    assert db.docs["entitlements/u2"]["source"] == "trial"
    # Recomputed once: the next read is a plain read, no further write.
    writes = len(db.sets)
    ent.get_entitlement("u2")
    assert len(db.sets) == writes


def test_a_new_owner_workspace_is_created_on_the_owner_grant(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    _owner_env(monkeypatch, {"users/u3": {"authUids": ["c1"], "createdAt": launch + 30 * DAY,
                                          ent.TRIAL_CLOCK_CHECKED: True}},
               {"c1": "me@example.com"})
    doc = ent.get_entitlement("u3")
    assert doc["source"] == "owner" and doc["proUntil"] is None


def test_revenuecat_sync_never_moves_the_owner_off_the_owner_grant(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    db = _owner_env(monkeypatch, {
        "users/+972": {"authUids": ["a1"], "createdAt": launch - 200 * DAY},
        "entitlements/+972": dict(ent.owner_grant()),
    }, {"a1": "me@example.com"})
    monkeypatch.setattr(ent, "restore_vaulted_syntheses", lambda uid: 0)
    active = {"entitlements": {"pro": {"expires_date": "2099-01-01T00:00:00Z",
                                       "product_identifier": "com.morhogeg.machina.pro.monthly"}}}
    lapsed = {"entitlements": {"pro": {"expires_date": "2020-01-01T00:00:00Z"}}}
    for subscriber in (active, lapsed):
        monkeypatch.setattr(ent, "fetch_subscriber", lambda app_user_id, s=subscriber: s)
        doc = ent.sync_from_revenuecat("+972", "a1")
        assert doc["source"] == "owner" and doc["proUntil"] is None
        assert ent.effective_plan(db.docs["entitlements/+972"]) == "pro"


def test_an_existing_trial_doc_on_the_owner_account_moves_to_the_owner_grant(monkeypatch):
    """The owner's phone can be signed into a workspace whose trial doc predates
    the owner grant; its first read checks it once and promotes it."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    db = _owner_env(monkeypatch, {
        "users/a1": {"authUids": ["a1"], "createdAt": launch + 20 * DAY},
        "entitlements/a1": {"plan": "pro", "source": "trial", "proUntil": launch + 80 * DAY,
                            "trialEndsAt": None, "trialAnchorAt": None},
    }, {"a1": "me@example.com"})
    doc = ent.get_entitlement("a1")
    assert doc["source"] == "owner" and doc["proUntil"] is None
    assert db.docs["entitlements/a1"][ent.OWNER_CHECKED] is True


def test_the_owner_check_runs_once_per_existing_doc(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    calls = []
    db = _owner_env(monkeypatch, {
        "users/u9": {"authUids": ["z1"], "createdAt": launch + 20 * DAY},
        "entitlements/u9": {"plan": "pro", "source": "trial", "proUntil": launch + 80 * DAY},
    }, {"z1": "someone@else.com"})
    real = ent.is_owner_workspace
    monkeypatch.setattr(ent, "is_owner_workspace", lambda uid: calls.append(uid) or real(uid))
    assert ent.get_entitlement("u9")["source"] == "trial"
    ent.get_entitlement("u9")
    assert calls == ["u9"]
    assert db.docs["entitlements/u9"][ent.OWNER_CHECKED] is True


def test_no_owner_check_without_owner_email(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    db = _owner_env(monkeypatch, {
        "users/u9": {"authUids": ["z1"], "createdAt": launch + 20 * DAY},
        "entitlements/u9": {"plan": "pro", "source": "trial", "proUntil": launch + 34 * DAY,
                            "trialEndsAt": launch + 34 * DAY},
    }, {"z1": "me@example.com"}, owner_email=None)
    assert ent.get_entitlement("u9")["source"] == "trial"
    assert db.sets == []


# ── The old 10th-save clock, retired 2026-10-13 ──────────────────────────────

def test_an_unstarted_old_trial_starts_its_fourteen_days_on_read(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    now = launch + 30 * DAY
    monkeypatch.setattr(ent, "_now_ms", lambda: now)
    db = _owner_env(monkeypatch, {
        "users/u5": {"authUids": ["b5"], "createdAt": launch + 20 * DAY},
        "entitlements/u5": {"plan": "pro", "source": "trial", "proUntil": launch + 80 * DAY,
                            "trialEndsAt": None, "trialAnchorAt": None, ent.OWNER_CHECKED: True},
    }, {})
    doc = ent.get_entitlement("u5")
    assert doc["trialAnchorAt"] == now
    assert doc["trialEndsAt"] == now + 14 * DAY == doc["proUntil"]
    assert db.docs["entitlements/u5"]["trialEndsAt"] == now + 14 * DAY


def test_starting_an_old_trial_never_extends_the_pro_it_already_had(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    now = launch + 70 * DAY
    monkeypatch.setattr(ent, "_now_ms", lambda: now)
    _owner_env(monkeypatch, {
        "entitlements/u6": {"plan": "pro", "source": "trial", "proUntil": now + 3 * DAY,
                            "trialEndsAt": None, "trialAnchorAt": None, ent.OWNER_CHECKED: True},
    }, {})
    assert ent.get_entitlement("u6")["trialEndsAt"] == now + 3 * DAY


def test_a_lapsed_unstarted_trial_stays_free(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    now = launch + 90 * DAY
    monkeypatch.setattr(ent, "_now_ms", lambda: now)
    _owner_env(monkeypatch, {
        "entitlements/u7": {"plan": "pro", "source": "trial", "proUntil": launch + 60 * DAY,
                            "trialEndsAt": None, "trialAnchorAt": None, ent.OWNER_CHECKED: True},
    }, {})
    doc = ent.get_entitlement("u7")
    assert doc["trialEndsAt"] == launch + 60 * DAY
    assert ent.effective_plan(doc, now) == "free"


def test_pro_from_subscriber_reads_renewal_and_billing_state():
    sub = {
        "entitlements": {"pro": {"expires_date": "2099-01-01T00:00:00Z",
                                 "product_identifier": "com.morhogeg.machina.pro.annual"}},
        "subscriptions": {"com.morhogeg.machina.pro.annual": {"unsubscribe_detected_at": None,
                                                              "billing_issues_detected_at": None}},
    }
    state = ent.pro_from_subscriber(sub)
    assert state["willRenew"] is True and state["billingIssue"] is False
    sub["subscriptions"]["com.morhogeg.machina.pro.annual"]["unsubscribe_detected_at"] = "2026-10-01T00:00:00Z"
    sub["subscriptions"]["com.morhogeg.machina.pro.annual"]["billing_issues_detected_at"] = "2026-10-02T00:00:00Z"
    state = ent.pro_from_subscriber(sub)
    assert state["willRenew"] is False and state["billingIssue"] is True
    del sub["subscriptions"]
    assert ent.pro_from_subscriber(sub)["willRenew"] is None


def test_a_dateless_trial_doc_is_ended_not_left_as_pro_forever(monkeypatch):
    now = _ms(ent.PRO_LAUNCH_AT) + 50 * DAY
    monkeypatch.setattr(ent, "_now_ms", lambda: now)
    db = _owner_env(monkeypatch, {
        "entitlements/u8": {"plan": "pro", "source": "trial", "proUntil": None,
                            "trialEndsAt": None, "trialAnchorAt": None, ent.OWNER_CHECKED: True},
    }, {})
    doc = ent.get_entitlement("u8")
    assert doc["proUntil"] == now and ent.effective_plan(doc, now + 1) == "free"
    writes = len(db.sets)
    ent.get_entitlement("u8")
    assert len(db.sets) == writes
