"""Offline unit tests for entitlement.py: the grant rules, the effective-plan
clock, the RevenueCat subscriber reduction, and the nudge copy. Pure functions
only; Firestore-touching paths are exercised through fakes at get_db."""

from datetime import datetime, timezone

import entitlement as ent


DAY = 24 * 60 * 60 * 1000


def _ms(iso):
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def test_founder_grant_for_pre_launch_workspace():
    launch = _ms(ent.PRO_LAUNCH_AT)
    g = ent.grant_for(launch - 30 * DAY)
    assert g["plan"] == "pro" and g["source"] == "founder"
    assert g["proUntil"] == launch + 365 * DAY
    assert g["trialEndsAt"] is None


def test_missing_created_at_is_a_founder():
    g = ent.grant_for(None)
    assert g["source"] == "founder"


def test_trial_grant_counts_from_created_at_not_now():
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 3 * DAY
    g = ent.grant_for(created)
    assert g["source"] == "trial"
    assert g["trialEndsAt"] == created + 14 * DAY
    assert g["proUntil"] == g["trialEndsAt"]
    # A reinstall three weeks later gets the SAME (already-expired) grant.
    assert ent.effective_plan(g, now_ms=created + 21 * DAY) == "free"
    assert ent.effective_plan(g, now_ms=created + 13 * DAY) == "pro"


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
    assert body.startswith("You saved 12 things and asked 1 question.")
    assert "—" not in title + body
    title, _ = ent.trial_nudge_copy(now + DAY, 1, 0, "UTC", now)
    assert title == "Your Pro trial ends tomorrow"
    title, body = ent.trial_nudge_copy(now + 3600 * 1000, 1, 2, "UTC", now)
    assert title == "Your Pro trial ends today"
    assert "1 thing " in body and "2 questions" in body


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
    assert doc["trialEndsAt"] == launch + 16 * DAY
    assert doc["nudgedAt"] is None
    assert "u1" in created
    # Second call reads the stored doc rather than recreating it.
    assert ent.get_entitlement("u1")["trialEndsAt"] == doc["trialEndsAt"]
