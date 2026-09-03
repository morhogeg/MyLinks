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


def test_trial_without_an_anchor_has_not_started_its_clock():
    """Under 10 cards: still Pro, but with no end date and only the ceiling."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + 3 * DAY
    g = ent.grant_for(created)
    assert g["source"] == "trial"
    assert g["trialEndsAt"] is None
    assert g["trialAnchorAt"] is None
    assert g["proUntil"] == created + ent.TRIAL_CEILING_DAYS * DAY
    # The 14 days have not begun, so day 20 is still Pro...
    assert ent.effective_plan(g, now_ms=created + 20 * DAY) == "pro"
    # ...but the ceiling still ends it, so a dormant account is not Pro forever.
    assert ent.effective_plan(g, now_ms=created + 61 * DAY) == "free"


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


def test_founders_ignore_the_trial_clock_entirely():
    launch = _ms(ent.PRO_LAUNCH_AT)
    g = ent.grant_for(launch - DAY, launch + 5 * DAY, launch + 9 * DAY)
    assert g["source"] == "founder"
    assert g["proUntil"] == launch + 365 * DAY
    assert g["trialEndsAt"] is None and g["trialAnchorAt"] is None


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
    # A fresh trial has no clock yet: it starts at the 10th card.
    assert doc["trialEndsAt"] is None
    assert doc["trialAnchorAt"] is None
    assert doc["proUntil"] == launch + (2 + ent.TRIAL_CEILING_DAYS) * DAY
    assert doc["nudgedAt"] is None
    assert "u1" in created
    # Second call reads the stored doc rather than recreating it.
    assert ent.get_entitlement("u1")["proUntil"] == doc["proUntil"]


# ── maybe_start_trial: the clock starts at the 10th card ─────────────────────

class _AnchorDB:
    """Fake Firestore with a users doc, an entitlements doc, and N link docs."""

    def __init__(self, ent_doc, card_count, created_at):
        self.ent_doc = ent_doc
        self.card_count = card_count
        self.created_at = created_at
        self.writes = []
        self.card_reads = 0

    # users/{uid}/links -> a query that only ever reports its length
    class _Links:
        def __init__(self, outer):
            self.outer = outer
            self.cap = None

        def select(self, _fields):
            return self

        def limit(self, n):
            self.cap = n
            return self

        def get(self):
            self.outer.card_reads += 1
            return [object()] * min(self.outer.card_count, self.cap or self.outer.card_count)

    class _UserRef:
        def __init__(self, outer):
            self.outer = outer

        def get(self):
            class _S:
                exists = True

                def to_dict(_self):
                    return {"createdAt": self.outer.created_at}
            return _S()

        def collection(self, name):
            assert name == "links"
            return _AnchorDB._Links(self.outer)

    class _EntRef:
        def __init__(self, outer):
            self.outer = outer

        def get(self):
            data = self.outer.ent_doc

            class _S:
                exists = data is not None

                def to_dict(_self):
                    return dict(data) if data is not None else None
            return _S()

        def create(self, doc):
            self.outer.ent_doc = dict(doc)

        def set(self, doc, merge=False):
            self.outer.writes.append(dict(doc))
            self.outer.ent_doc = {**(self.outer.ent_doc or {}), **doc} if merge else dict(doc)

    def collection(self, name):
        outer = self

        class _Col:
            def document(self, _id):
                return _AnchorDB._UserRef(outer) if name == "users" else _AnchorDB._EntRef(outer)
        return _Col()


def _anchor_env(monkeypatch, cards, ent_doc=None, created_offset=3 * DAY):
    launch = _ms(ent.PRO_LAUNCH_AT)
    created = launch + created_offset
    if ent_doc is None:
        ent_doc = {"plan": "pro", "source": "trial", "proUntil": created + 60 * DAY,
                   "trialEndsAt": None, "trialAnchorAt": None}
    db = _AnchorDB(ent_doc, cards, created)
    monkeypatch.setattr(ent, "get_db", lambda: db)
    ent._TRIAL_SETTLED.clear()
    return db, created


def test_trial_clock_does_not_start_below_ten_cards(monkeypatch):
    db, _created = _anchor_env(monkeypatch, cards=9)
    assert ent.maybe_start_trial("u1") is False
    assert db.writes == []
    # Still unsettled: the next card must check again.
    assert "u1" not in ent._TRIAL_SETTLED


def test_trial_clock_starts_on_exactly_ten_cards(monkeypatch):
    db, created = _anchor_env(monkeypatch, cards=10)
    now = _ms("2026-09-20")
    monkeypatch.setattr(ent, "_now_ms", lambda: now)

    assert ent.maybe_start_trial("u1") is True
    written = db.writes[0]
    assert written["trialAnchorAt"] == now
    assert written["trialEndsAt"] == min(now + 14 * DAY, created + 60 * DAY)
    assert written["proUntil"] == written["trialEndsAt"]
    assert written["plan"] == "pro" and written["source"] == "trial"
    # Settled, so the eleventh card costs no Firestore read at all.
    assert "u1" in ent._TRIAL_SETTLED
    reads_before = db.card_reads
    assert ent.maybe_start_trial("u1") is False
    assert db.card_reads == reads_before


def test_a_late_anchor_is_capped_by_the_sixty_day_ceiling(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    db, created = _anchor_env(monkeypatch, cards=12)
    now = created + 55 * DAY
    monkeypatch.setattr(ent, "_now_ms", lambda: now)
    assert launch < created < now

    assert ent.maybe_start_trial("u1") is True
    assert db.writes[0]["trialEndsAt"] == created + ent.TRIAL_CEILING_DAYS * DAY


def test_founders_and_subscribers_are_never_anchored(monkeypatch):
    for doc in (
        {"plan": "pro", "source": "founder", "proUntil": 1, "trialEndsAt": None},
        {"plan": "pro", "source": "revenuecat", "proUntil": 1, "trialEndsAt": None},
    ):
        db, _ = _anchor_env(monkeypatch, cards=50, ent_doc=doc)
        assert ent.maybe_start_trial("u1") is False
        assert db.writes == []
        assert db.card_reads == 0          # short-circuits before counting
        assert "u1" in ent._TRIAL_SETTLED


def test_an_already_started_trial_is_left_alone(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    already = {"plan": "pro", "source": "trial", "proUntil": launch + 20 * DAY,
               "trialEndsAt": launch + 20 * DAY, "trialAnchorAt": launch + 6 * DAY}
    db, _ = _anchor_env(monkeypatch, cards=50, ent_doc=already)
    assert ent.maybe_start_trial("u1") is False
    assert db.writes == []


def test_grandfathered_trial_without_an_anchor_is_left_alone(monkeypatch):
    """A doc written before this rule shipped has trialEndsAt but no anchor.
    Re-anchoring it would silently extend a trial that is already running."""
    launch = _ms(ent.PRO_LAUNCH_AT)
    legacy = {"plan": "pro", "source": "trial", "proUntil": launch + 17 * DAY,
              "trialEndsAt": launch + 17 * DAY}
    db, _ = _anchor_env(monkeypatch, cards=50, ent_doc=legacy)
    assert ent.maybe_start_trial("u1") is False
    assert db.writes == []


def test_anchor_failure_is_swallowed(monkeypatch):
    class Boom:
        def collection(self, _n):
            raise RuntimeError("firestore down")

    monkeypatch.setattr(ent, "get_db", lambda: Boom())
    ent._TRIAL_SETTLED.clear()
    # get_entitlement fails open to free, so there is no trial to anchor.
    assert ent.maybe_start_trial("u1") is False


def test_entitlement_summary_adds_the_trial_and_import_fields(monkeypatch):
    launch = _ms(ent.PRO_LAUNCH_AT)
    doc = {"plan": "pro", "source": "trial", "proUntil": launch + 60 * DAY,
           "trialEndsAt": None, "trialAnchorAt": None}
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: dict(doc))
    import quota
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {"saves": 2, "asks": 1, "imports": 40})

    summary = ent.entitlement_summary("u1")
    # Backward compatible: every field the shipped client reads is still here.
    for key in ("plan", "source", "proUntil", "trialEndsAt", "quotas"):
        assert key in summary
    assert summary["plan"] == "pro"
    assert summary["trialEndsAt"] is None
    assert summary["trialAnchorAt"] is None
    assert summary["trialAnchorCards"] == ent.TRIAL_ANCHOR_CARDS
    assert summary["quotas"]["imports"]["used"] == 40
    assert summary["quotas"]["saves"]["used"] == 2
