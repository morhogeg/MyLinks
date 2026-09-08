"""Offline unit tests for entitlement.py: the trial grant rules, the
effective-plan clock, the pre-launch migration, the exactly-once trial anchor,
the RevenueCat subscriber reduction, and the nudge sweep. Pure functions are
tested directly; Firestore-touching paths run against the fake at get_db."""

import sys
import types
from datetime import datetime, timezone

import entitlement as ent


DAY = 24 * 60 * 60 * 1000


def _ms(iso):
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


LAUNCH = _ms(ent.PRO_LAUNCH_AT)


# ── grant_for: the pure rule ─────────────────────────────────────────────────

def test_there_is_no_founder_grant_any_more():
    """Every workspace is on the trial; the only sources are trial and revenuecat."""
    assert not hasattr(ent, "FOUNDER_DAYS")
    for created in (LAUNCH - 30 * DAY, None, LAUNCH + 3 * DAY):
        assert ent.grant_for(created, now_ms=LAUNCH + 10 * DAY)["source"] == "trial"


def test_trial_without_an_anchor_has_not_started_its_clock():
    """Under 10 cards: still Pro, but with no end date and only the ceiling."""
    created = LAUNCH + 3 * DAY
    g = ent.grant_for(created)
    assert g["source"] == "trial"
    assert g["trialEndsAt"] is None
    assert g["trialAnchorAt"] is None
    assert g["trialCeilingAt"] == created + ent.TRIAL_CEILING_DAYS * DAY
    assert g["proUntil"] == g["trialCeilingAt"]
    # The 14 days have not begun, so day 20 is still Pro...
    assert ent.effective_plan(g, now_ms=created + 20 * DAY) == "pro"
    # ...but the ceiling still ends it, so a dormant account is not Pro forever.
    assert ent.effective_plan(g, now_ms=created + 61 * DAY) == "free"


def test_trial_anchored_at_ten_cards_runs_fourteen_days_from_the_anchor():
    created = LAUNCH + 3 * DAY
    anchor = created + 9 * DAY          # the 10th card landed on day 9
    g = ent.grant_for(created, anchor)
    assert g["trialAnchorAt"] == anchor
    assert g["trialEndsAt"] == anchor + 14 * DAY
    assert g["proUntil"] == g["trialEndsAt"]
    assert ent.effective_plan(g, now_ms=anchor + 13 * DAY) == "pro"
    # The boundary itself: at the exact end instant the plan is free.
    assert ent.effective_plan(g, now_ms=anchor + 14 * DAY - 1) == "pro"
    assert ent.effective_plan(g, now_ms=anchor + 14 * DAY) == "free"
    # A reinstall re-reads the STORED anchor, so the clock cannot restart.
    assert ent.grant_for(created, anchor)["trialEndsAt"] == g["trialEndsAt"]


def test_the_sixty_day_ceiling_caps_a_late_anchor():
    created = LAUNCH + 3 * DAY
    anchor = created + 55 * DAY         # the 10th card landed on day 55
    g = ent.grant_for(created, anchor)
    # 55 + 14 = 69 days, but the ceiling lands first.
    assert g["trialEndsAt"] == created + ent.TRIAL_CEILING_DAYS * DAY
    assert ent.trial_end_for(anchor, g["trialCeilingAt"]) == g["trialEndsAt"]


def test_a_stored_ceiling_wins_over_created_at():
    """A migrated pre-launch workspace measures its ceiling from migration."""
    created = LAUNCH - 200 * DAY
    ceiling = LAUNCH + 70 * DAY
    g = ent.grant_for(created, None, None, ceiling)
    assert g["trialCeilingAt"] == ceiling and g["proUntil"] == ceiling
    anchored = ent.grant_for(created, LAUNCH + 60 * DAY, None, ceiling)
    assert anchored["trialEndsAt"] == ceiling            # 60 + 14 > 70
    early = ent.grant_for(created, LAUNCH + 20 * DAY, None, ceiling)
    assert early["trialEndsAt"] == LAUNCH + 34 * DAY


def test_a_pre_anchor_trial_doc_keeps_its_existing_end_date():
    """Docs written before the anchor rule shipped are grandfathered, untouched."""
    created = LAUNCH + 3 * DAY
    old_ends = created + 14 * DAY
    g = ent.grant_for(created, None, old_ends)
    assert g["trialEndsAt"] == old_ends
    assert g["proUntil"] == old_ends
    assert g["trialAnchorAt"] is None
    assert ent.effective_plan(g, now_ms=created + 21 * DAY) == "free"


def test_created_at_in_seconds_or_iso_is_normalised():
    created_s = (LAUNCH + DAY) // 1000
    g = ent.grant_for(created_s)
    assert g["trialCeilingAt"] == LAUNCH + DAY + ent.TRIAL_CEILING_DAYS * DAY
    assert ent.grant_for("2030-01-01T00:00:00Z")["trialCeilingAt"] == _ms("2030-01-01") + 60 * DAY
    # Firestore may hand back a datetime; the rule still speaks ms.
    dt = datetime.fromtimestamp((LAUNCH + DAY) / 1000, timezone.utc)
    assert ent.grant_for(dt)["trialCeilingAt"] == g["trialCeilingAt"]


def test_is_pre_launch():
    assert ent.is_pre_launch(LAUNCH - 1) is True
    assert ent.is_pre_launch(None) is True
    assert ent.is_pre_launch(LAUNCH) is False
    assert ent.is_pre_launch(LAUNCH + DAY) is False


def test_effective_plan_rules():
    now = _ms("2026-09-10")
    assert ent.effective_plan(None, now) == "free"
    assert ent.effective_plan({"plan": "free", "proUntil": now + DAY}, now) == "free"
    assert ent.effective_plan({"plan": "pro", "proUntil": now - 1}, now) == "free"
    assert ent.effective_plan({"plan": "pro", "proUntil": now + 1}, now) == "pro"
    # Lifetime: no expiry at all.
    assert ent.effective_plan({"plan": "pro", "proUntil": None}, now) == "pro"


# ── RevenueCat reduction ─────────────────────────────────────────────────────

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


def test_trial_nudge_weekday_uses_the_users_timezone():
    """22:00 UTC on a Wednesday is already Thursday in Jerusalem, so a trial
    ending exactly two days later is 'Saturday' there, not 'Friday'."""
    now = _ms("2026-09-09T22:00:00")           # Wednesday 22:00 UTC
    ends = now + 2 * DAY                        # Friday 22:00 UTC = Sat 01:00 IL
    assert ent._weekday_phrase(ends, "UTC", now) == "Friday"
    assert ent._weekday_phrase(ends, "Asia/Jerusalem", now) == "Saturday"
    # An unknown zone falls back to UTC rather than failing the push.
    assert ent._weekday_phrase(ends, "Mars/Olympus", now) == "Friday"


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


# ── A fake Firestore: users/{uid} (+ links), entitlements/{uid}, transactions ─

class _Snap:
    def __init__(self, data):
        self._d = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class _FakeDB:
    """Just enough Firestore for entitlement.py: one users doc with N link
    docs, one entitlements doc (create/set/get, also inside a transaction),
    and the trial-nudge query. Records every entitlement write."""

    def __init__(self, ent_doc=None, cards=0, created_at=None, user_exists=True,
                 timezone_name=None):
        self.ent_doc = ent_doc
        self.cards = cards
        self.created_at = created_at
        self.user_exists = user_exists
        self.timezone_name = timezone_name
        self.writes = []
        self.card_reads = 0
        self.ent_reads = 0
        # Other entitlement docs, keyed by uid, for the nudge sweep.
        self.others = {}

    # users/{uid}
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
            return [object()] * min(self.outer.cards, self.cap or self.outer.cards)

    class _UserRef:
        def __init__(self, outer):
            self.outer = outer

        def get(self):
            if not self.outer.user_exists:
                return _Snap(None)
            data = {}
            if self.outer.created_at is not None:
                data["createdAt"] = self.outer.created_at
            if self.outer.timezone_name:
                data["timezone"] = self.outer.timezone_name
            return _Snap(data)

        def collection(self, name):
            assert name == "links"
            return _FakeDB._Links(self.outer)

    # entitlements/{uid}
    class _EntRef:
        def __init__(self, outer, doc_id="u1"):
            self.outer = outer
            self.id = doc_id

        def get(self, transaction=None):
            self.outer.ent_reads += 1
            return _Snap(self.outer.ent_doc)

        def create(self, doc):
            if self.outer.ent_doc is not None:
                raise RuntimeError("already exists")
            self.outer.ent_doc = dict(doc)
            self.outer.writes.append(("create", dict(doc)))

        def set(self, doc, merge=False):
            self.outer.writes.append(("set", dict(doc)))
            self.outer.ent_doc = {**(self.outer.ent_doc or {}), **doc} if merge else dict(doc)

    class _EntQuery:
        def __init__(self, outer):
            self.outer = outer
            self.filters = []

        def where(self, filter=None):
            self.filters.append((filter.field_path, filter.op_string, filter.value))
            return self

        def limit(self, _n):
            return self

        def get(self):
            out = []
            for uid, data in self.outer.others.items():
                ok = True
                for field, op, value in self.filters:
                    v = data.get(field)
                    if op == "==":
                        ok = ok and v == value
                    elif op == ">":
                        ok = ok and v is not None and v > value
                    elif op == "<=":
                        ok = ok and v is not None and v <= value
                if ok:
                    out.append(_FakeDB._QueryDoc(self.outer, uid, data))
            return out

    class _QueryDoc:
        def __init__(self, outer, uid, data):
            self.id = uid
            self._data = data
            self.reference = _FakeDB._OtherRef(outer, uid)

        def to_dict(self):
            return dict(self._data)

    class _OtherRef:
        def __init__(self, outer, uid):
            self.outer, self.uid = outer, uid

        def set(self, doc, merge=False):
            self.outer.others[self.uid] = {**self.outer.others[self.uid], **doc}

    class _Txn:
        def set(self, ref, doc, merge=False):
            ref.set(doc, merge=merge)

    def transaction(self):
        return _FakeDB._Txn()

    def collection(self, name):
        outer = self

        class _Col:
            def document(self, doc_id):
                if name == "users":
                    return _FakeDB._UserRef(outer)
                if name == "entitlements":
                    return _FakeDB._EntRef(outer, doc_id)
                raise AssertionError(f"unexpected collection {name}")

            def where(self, filter=None):
                assert name == "entitlements"
                return _FakeDB._EntQuery(outer).where(filter=filter)
        return _Col()


def _install(monkeypatch, db, now=None):
    monkeypatch.setattr(ent, "get_db", lambda: db)
    # Run the transaction body directly (same seam test_quota uses).
    monkeypatch.setattr(ent.firestore, "transactional", lambda fn: fn)
    if now is not None:
        monkeypatch.setattr(ent, "_now_ms", lambda: now)
    ent._TRIAL_SETTLED.clear()
    return db


def _unstarted_trial(created):
    return {"plan": "pro", "source": "trial", "proUntil": created + 60 * DAY,
            "trialEndsAt": None, "trialAnchorAt": None,
            "trialCeilingAt": created + 60 * DAY}


# ── get_entitlement: lazy creation, fail-open, migration ─────────────────────

def test_get_entitlement_fails_open_to_free(monkeypatch):
    class Boom:
        def collection(self, name):
            raise RuntimeError("firestore down")

    monkeypatch.setattr(ent, "get_db", lambda: Boom())
    doc = ent.get_entitlement("u1")
    assert doc["plan"] == "free" and doc["source"] is None
    assert ent.plan_for("u1") == "free"
    assert ent.is_pro("u1") is False


def test_a_new_workspace_gets_an_unstarted_trial(monkeypatch):
    created = LAUNCH + 2 * DAY
    now = created + 3600 * 1000
    db = _install(monkeypatch, _FakeDB(cards=0, created_at=created), now)
    doc = ent.get_entitlement("u1")
    assert doc["source"] == "trial" and doc["plan"] == "pro"
    # A fresh trial has no clock yet: it starts at the 10th card.
    assert doc["trialEndsAt"] is None
    assert doc["trialAnchorAt"] is None
    assert doc["trialCeilingAt"] == created + ent.TRIAL_CEILING_DAYS * DAY
    assert doc["proUntil"] == doc["trialCeilingAt"]
    assert doc["migratedAt"] is None
    assert doc["nudgedAt"] is None
    assert [w[0] for w in db.writes] == ["create"]
    # Second call reads the stored doc rather than recreating it.
    assert ent.get_entitlement("u1")["proUntil"] == doc["proUntil"]
    assert len(db.writes) == 1
    assert ent.plan_for("u1") == "pro"


def test_a_stored_founder_doc_with_ten_cards_becomes_a_trial_anchored_now(monkeypatch):
    """The owner and the testers: months-old workspaces, full libraries."""
    now = _ms("2026-09-09T12:00:00")
    founder = {"plan": "pro", "source": "founder", "proUntil": LAUNCH + 365 * DAY,
               "trialEndsAt": None, "trialAnchorAt": None, "rcAppUserId": "auth-1",
               "nudgedAt": None}
    db = _install(monkeypatch, _FakeDB(ent_doc=founder, cards=40, created_at=LAUNCH - 150 * DAY), now)

    doc = ent.get_entitlement("u1")
    assert doc["source"] == "trial" and doc["plan"] == "pro"
    assert doc["trialAnchorAt"] == now
    assert doc["trialEndsAt"] == now + 14 * DAY
    assert doc["proUntil"] == now + 14 * DAY
    # The ceiling is measured from the migration, not the months-old createdAt.
    assert doc["trialCeilingAt"] == now + 60 * DAY
    assert doc["migratedAt"] == now
    assert doc["rcAppUserId"] == "auth-1"           # merge-write keeps the rest
    assert ent.effective_plan(doc, now) == "pro"
    assert ent.effective_plan(doc, now + 13 * DAY) == "pro"
    assert ent.effective_plan(doc, now + 14 * DAY) == "free"
    assert [w[0] for w in db.writes] == ["set"]

    # Idempotent: the next read is an ordinary read, no write, same answer.
    again = ent.get_entitlement("u1")
    assert again == doc
    assert len(db.writes) == 1
    # And the anchor hook has nothing to do for it.
    assert ent.maybe_start_trial("u1") is False
    assert len(db.writes) == 1


def test_a_stored_founder_doc_under_ten_cards_becomes_an_unstarted_trial(monkeypatch):
    now = _ms("2026-09-09T12:00:00")
    founder = {"plan": "pro", "source": "founder", "proUntil": LAUNCH + 365 * DAY,
               "trialEndsAt": None, "trialAnchorAt": None}
    db = _install(monkeypatch, _FakeDB(ent_doc=founder, cards=4, created_at=LAUNCH - 150 * DAY), now)

    doc = ent.get_entitlement("u1")
    assert doc["source"] == "trial"
    assert doc["trialAnchorAt"] is None and doc["trialEndsAt"] is None
    assert doc["trialCeilingAt"] == now + 60 * DAY
    assert doc["proUntil"] == now + 60 * DAY
    assert ent.effective_plan(doc, now + 59 * DAY) == "pro"
    assert ent.effective_plan(doc, now + 60 * DAY) == "free"

    # Six cards later the clock starts from THAT moment, capped by the
    # migration ceiling, never by createdAt + 60d (which is long past).
    later = now + 50 * DAY
    monkeypatch.setattr(ent, "_now_ms", lambda: later)
    db.cards = 10
    assert ent.maybe_start_trial("u1") is True
    assert db.ent_doc["trialAnchorAt"] == later
    assert db.ent_doc["trialEndsAt"] == now + 60 * DAY        # 50 + 14 > 60
    assert db.ent_doc["proUntil"] == now + 60 * DAY
    assert ent.effective_plan(db.ent_doc, later) == "pro"


def test_a_pre_launch_workspace_with_no_doc_is_migrated_on_first_read(monkeypatch):
    now = _ms("2026-09-09T12:00:00")
    for created in (LAUNCH - 90 * DAY, None):
        db = _install(monkeypatch, _FakeDB(cards=25, created_at=created), now)
        doc = ent.get_entitlement("u1")
        assert doc["source"] == "trial"
        assert doc["trialAnchorAt"] == now
        assert doc["trialEndsAt"] == now + 14 * DAY
        assert doc["trialCeilingAt"] == now + 60 * DAY
        assert doc["migratedAt"] == now
        assert [w[0] for w in db.writes] == ["create"]
        # Never silently Free on deploy.
        assert ent.plan_for("u1") == "pro"


def test_a_pre_launch_workspace_with_no_doc_and_few_cards_is_unanchored(monkeypatch):
    now = _ms("2026-09-09T12:00:00")
    db = _install(monkeypatch, _FakeDB(cards=2, created_at=LAUNCH - 90 * DAY), now)
    doc = ent.get_entitlement("u1")
    assert doc["source"] == "trial" and doc["trialAnchorAt"] is None
    assert doc["proUntil"] == now + 60 * DAY
    assert db.ent_doc["migratedAt"] == now


def test_a_missing_user_doc_after_launch_is_treated_as_pre_launch(monkeypatch):
    """No users doc at all means no createdAt, which only the legacy workspace
    has; it is migrated rather than handed a ceiling from 1970."""
    now = _ms("2026-09-09T12:00:00")
    _install(monkeypatch, _FakeDB(cards=0, user_exists=False), now)
    doc = ent.get_entitlement("u1")
    assert doc["proUntil"] == now + 60 * DAY
    assert ent.effective_plan(doc, now) == "pro"


def test_a_revenuecat_doc_is_never_migrated(monkeypatch):
    sub = {"plan": "pro", "source": "revenuecat", "proUntil": LAUNCH + 40 * DAY,
           "trialEndsAt": None, "trialAnchorAt": None}
    db = _install(monkeypatch, _FakeDB(ent_doc=sub, cards=50, created_at=LAUNCH - 100 * DAY))
    assert ent.get_entitlement("u1") == sub
    assert db.writes == []


# ── maybe_start_trial: the clock starts at the 10th card, exactly once ───────

def test_trial_clock_does_not_start_below_ten_cards(monkeypatch):
    created = LAUNCH + 3 * DAY
    db = _install(monkeypatch, _FakeDB(ent_doc=_unstarted_trial(created), cards=9, created_at=created))
    assert ent.maybe_start_trial("u1") is False
    assert db.writes == []
    # Still unsettled: the next card must check again.
    assert "u1" not in ent._TRIAL_SETTLED


def test_trial_clock_starts_on_exactly_ten_cards(monkeypatch):
    created = LAUNCH + 3 * DAY
    now = _ms("2026-09-20")
    db = _install(monkeypatch, _FakeDB(ent_doc=_unstarted_trial(created), cards=10, created_at=created), now)

    assert ent.maybe_start_trial("u1") is True
    kind, written = db.writes[0]
    assert kind == "set"
    assert written["trialAnchorAt"] == now
    assert written["trialEndsAt"] == min(now + 14 * DAY, created + 60 * DAY)
    assert written["proUntil"] == written["trialEndsAt"]
    assert written["plan"] == "pro"
    # Settled, so the eleventh card costs no Firestore read at all.
    assert "u1" in ent._TRIAL_SETTLED
    reads_before = (db.card_reads, db.ent_reads)
    assert ent.maybe_start_trial("u1") is False
    assert (db.card_reads, db.ent_reads) == reads_before


def test_the_anchor_is_stamped_once_even_when_ten_triggers_race(monkeypatch):
    """An import writes ten cards at once; ten triggers each count ten cards.
    The transaction re-reads the doc, so only the first write lands and the
    end date is never nudged later by the stragglers."""
    created = LAUNCH + 3 * DAY
    first = _ms("2026-09-20T10:00:00")
    db = _install(monkeypatch, _FakeDB(ent_doc=_unstarted_trial(created), cards=10, created_at=created), first)

    assert ent.maybe_start_trial("u1") is True
    # A cold instance (empty memo) racing a few ms later.
    ent._TRIAL_SETTLED.clear()
    monkeypatch.setattr(ent, "_now_ms", lambda: first + 40)
    assert ent.maybe_start_trial("u1") is False
    assert len(db.writes) == 1
    assert db.ent_doc["trialAnchorAt"] == first
    assert db.ent_doc["trialEndsAt"] == first + 14 * DAY

    # Even a stale in-memory read cannot write twice: the transaction body
    # itself gives up when the doc already carries an anchor.
    assert ent._stamp_trial_anchor("u1", first + 99, created + 60 * DAY) is False
    assert len(db.writes) == 1


def test_a_late_anchor_is_capped_by_the_sixty_day_ceiling(monkeypatch):
    created = LAUNCH + 3 * DAY
    now = created + 55 * DAY
    db = _install(monkeypatch, _FakeDB(ent_doc=_unstarted_trial(created), cards=12, created_at=created), now)
    assert ent.maybe_start_trial("u1") is True
    assert db.writes[0][1]["trialEndsAt"] == created + ent.TRIAL_CEILING_DAYS * DAY


def test_a_doc_without_a_stored_ceiling_measures_it_from_created_at(monkeypatch):
    """Trial docs written before trialCeilingAt existed still get the right end."""
    created = LAUNCH + 3 * DAY
    old = {"plan": "pro", "source": "trial", "proUntil": created + 60 * DAY,
           "trialEndsAt": None, "trialAnchorAt": None}
    now = created + 55 * DAY
    db = _install(monkeypatch, _FakeDB(ent_doc=old, cards=10, created_at=created), now)
    assert ent.maybe_start_trial("u1") is True
    assert db.ent_doc["trialEndsAt"] == created + 60 * DAY


def test_an_already_started_trial_is_left_alone(monkeypatch):
    already = {"plan": "pro", "source": "trial", "proUntil": LAUNCH + 20 * DAY,
               "trialEndsAt": LAUNCH + 20 * DAY, "trialAnchorAt": LAUNCH + 6 * DAY}
    db = _install(monkeypatch, _FakeDB(ent_doc=already, cards=50, created_at=LAUNCH + DAY))
    assert ent.maybe_start_trial("u1") is False
    assert db.writes == []
    assert db.card_reads == 0          # short-circuits before counting
    assert "u1" in ent._TRIAL_SETTLED


def test_grandfathered_trial_without_an_anchor_is_left_alone(monkeypatch):
    """A doc written before this rule shipped has trialEndsAt but no anchor.
    Re-anchoring it would silently extend a trial that is already running."""
    legacy = {"plan": "pro", "source": "trial", "proUntil": LAUNCH + 17 * DAY,
              "trialEndsAt": LAUNCH + 17 * DAY}
    db = _install(monkeypatch, _FakeDB(ent_doc=legacy, cards=50, created_at=LAUNCH + DAY))
    assert ent.maybe_start_trial("u1") is False
    assert db.writes == []
    assert "u1" in ent._TRIAL_SETTLED


def test_a_subscriber_gets_the_anchor_recorded_but_not_the_grant(monkeypatch):
    """Subscribed before the tenth card: the anchor is still a fact worth
    keeping (a lapse must not hand out a fresh 14 days), but plan/proUntil
    stay RevenueCat's. Not settled beforehand, because a lapse can turn this
    doc back into an unstarted trial."""
    created = LAUNCH + 3 * DAY
    now = created + 5 * DAY
    sub = {"plan": "pro", "source": "revenuecat", "proUntil": created + 400 * DAY,
           "trialEndsAt": None, "trialAnchorAt": None, "trialCeilingAt": created + 60 * DAY}
    db = _install(monkeypatch, _FakeDB(ent_doc=sub, cards=3, created_at=created), now)
    assert ent.maybe_start_trial("u1") is False
    assert "u1" not in ent._TRIAL_SETTLED          # a lapse could revive the clock
    db.cards = 10
    assert ent.maybe_start_trial("u1") is True
    assert db.ent_doc["trialAnchorAt"] == now
    assert db.ent_doc["trialEndsAt"] == now + 14 * DAY
    assert db.ent_doc["proUntil"] == created + 400 * DAY      # untouched
    assert db.ent_doc["source"] == "revenuecat"
    assert "u1" in ent._TRIAL_SETTLED


def test_a_fail_open_read_never_settles_the_memo(monkeypatch):
    """Firestore down on the tenth card: nothing is known, so the workspace
    must be checked again on the eleventh rather than skipped forever."""
    class Boom:
        def collection(self, _n):
            raise RuntimeError("firestore down")

    monkeypatch.setattr(ent, "get_db", lambda: Boom())
    ent._TRIAL_SETTLED.clear()
    assert ent.maybe_start_trial("u1") is False
    assert "u1" not in ent._TRIAL_SETTLED


def test_the_memo_is_bounded():
    ent._TRIAL_SETTLED.clear()
    for i in range(ent._TRIAL_SETTLED_MAX + 5):
        ent._mark_trial_settled(f"u{i}")
    assert len(ent._TRIAL_SETTLED) <= ent._TRIAL_SETTLED_MAX
    ent._TRIAL_SETTLED.clear()


# ── Expiry: the summary the client reads, and the quota caps ─────────────────

def test_entitlement_summary_across_the_three_trial_states(monkeypatch):
    import quota
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {"saves": 2, "asks": 1, "imports": 40})
    monkeypatch.delenv("FREE_SAVE_QUOTA", raising=False)
    monkeypatch.delenv("MONTHLY_SAVE_QUOTA", raising=False)
    monkeypatch.delenv("PRO_SAVE_QUOTA", raising=False)
    created = LAUNCH + 3 * DAY
    anchor = created + 5 * DAY

    # Not started: Pro, no dates, Pro caps.
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: _unstarted_trial(created))
    monkeypatch.setattr(ent, "_now_ms", lambda: created + 2 * DAY)
    s = ent.entitlement_summary("u1")
    assert s["plan"] == "pro" and s["source"] == "trial"
    assert s["trialEndsAt"] is None and s["trialAnchorAt"] is None
    assert s["trialAnchorCards"] == ent.TRIAL_ANCHOR_CARDS
    assert s["quotas"]["saves"]["limit"] == quota.quota_limit("saves", "pro")
    assert s["quotas"]["imports"]["used"] == 40

    # Running: Pro, dates set.
    running = dict(ent.grant_for(created, anchor))
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: dict(running))
    monkeypatch.setattr(ent, "_now_ms", lambda: anchor + 10 * DAY)
    s = ent.entitlement_summary("u1")
    assert s["plan"] == "pro"
    assert s["trialAnchorAt"] == anchor and s["trialEndsAt"] == anchor + 14 * DAY

    # Ended: the stored doc still says pro, the EFFECTIVE plan is free, the
    # caps are the free caps, and the dates stay so the client can say "ended".
    monkeypatch.setattr(ent, "_now_ms", lambda: anchor + 14 * DAY + 1)
    s = ent.entitlement_summary("u1")
    assert s["plan"] == "free" and s["source"] == "trial"
    assert s["trialEndsAt"] == anchor + 14 * DAY
    assert s["quotas"]["saves"]["limit"] == quota.quota_limit("saves", "free")
    assert s["quotas"]["asks"]["limit"] == quota.quota_limit("asks", "free")
    assert quota.quota_limit("saves", "free") < quota.quota_limit("saves", "pro")


def test_summary_of_a_fail_open_read_is_free_with_free_caps(monkeypatch):
    import quota
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {})
    monkeypatch.setattr(ent, "get_entitlement", lambda uid: ent.free_entitlement())
    s = ent.entitlement_summary("u1")
    assert s["plan"] == "free" and s["source"] is None
    assert s["quotas"]["asks"]["limit"] == quota.quota_limit("asks", "free")


# ── sync_from_revenuecat: a lapse keeps whatever trial is left ───────────────

def test_a_lapsed_subscriber_keeps_the_migrated_ceiling_not_created_at(monkeypatch):
    """A pre-launch tester who subscribed and lapsed inside the 60 days after
    migration is still on the remaining trial; createdAt + 60d (long past)
    must not be what decides it."""
    now = _ms("2026-09-20")
    migrated = _ms("2026-09-09")
    doc = {"plan": "pro", "source": "revenuecat", "proUntil": now - DAY,
           "trialEndsAt": None, "trialAnchorAt": None,
           "trialCeilingAt": migrated + 60 * DAY, "migratedAt": migrated,
           "rcAppUserId": "auth-1"}
    db = _install(monkeypatch, _FakeDB(ent_doc=doc, cards=3, created_at=LAUNCH - 200 * DAY), now)
    monkeypatch.setattr(ent, "fetch_subscriber", lambda app_user_id: {"entitlements": {}})
    monkeypatch.setattr(ent, "restore_vaulted_syntheses", lambda uid: 0)

    merged = ent.sync_from_revenuecat("u1", "auth-1")
    assert merged["plan"] == "pro" and merged["source"] == "trial"
    assert merged["proUntil"] == migrated + 60 * DAY
    assert merged["trialCeilingAt"] == migrated + 60 * DAY
    assert ent.effective_plan(merged, now) == "pro"


def test_a_lapsed_subscriber_whose_trial_is_over_is_free(monkeypatch):
    now = _ms("2026-11-20")
    created = LAUNCH + 3 * DAY
    anchor = created + 4 * DAY
    doc = {"plan": "pro", "source": "revenuecat", "proUntil": now - DAY,
           "trialEndsAt": anchor + 14 * DAY, "trialAnchorAt": anchor,
           "trialCeilingAt": created + 60 * DAY, "rcAppUserId": "auth-1"}
    _install(monkeypatch, _FakeDB(ent_doc=doc, cards=30, created_at=created), now)
    monkeypatch.setattr(ent, "fetch_subscriber", lambda app_user_id: {"entitlements": {}})
    monkeypatch.setattr(ent, "restore_vaulted_syntheses", lambda uid: 0)

    merged = ent.sync_from_revenuecat("u1", "auth-1")
    assert merged["plan"] == "free" and merged["source"] == "revenuecat"
    # The clock is carried through, never restarted.
    assert merged["trialAnchorAt"] == anchor and merged["trialEndsAt"] == anchor + 14 * DAY
    assert ent.effective_plan(merged, now) == "free"


# ── run_trial_nudges: once, 48h before the end, trials only ──────────────────

def _stub_push(monkeypatch, result):
    """`from push_service import send_push` inside run_trial_nudges resolves to
    this recorder (the real module imports firebase_admin.messaging at top,
    which the offline harness cannot provide). Returns the call list."""
    calls = []

    def _send_push(uid, title, body, data=None):
        calls.append((uid, title, body))
        return dict(result)

    stub = types.ModuleType("push_service")
    stub.send_push = _send_push
    monkeypatch.setitem(sys.modules, "push_service", stub)
    return calls


def test_trial_nudges_fire_once_for_trials_ending_within_48h(monkeypatch):
    import quota

    now = _ms("2026-09-10T09:00:00")
    db = _install(monkeypatch, _FakeDB(cards=0, created_at=LAUNCH + DAY, timezone_name="UTC"), now)
    db.others = {
        "ending-soon": {"plan": "pro", "source": "trial", "trialEndsAt": now + 30 * 3600 * 1000,
                        "trialAnchorAt": now - 12 * DAY, "nudgedAt": None},
        "far-off":     {"plan": "pro", "source": "trial", "trialEndsAt": now + 10 * DAY,
                        "trialAnchorAt": now - 4 * DAY, "nudgedAt": None},
        "unstarted":   {"plan": "pro", "source": "trial", "trialEndsAt": None,
                        "trialAnchorAt": None, "nudgedAt": None},
        "ended":       {"plan": "pro", "source": "trial", "trialEndsAt": now - 3600 * 1000,
                        "trialAnchorAt": now - 15 * DAY, "nudgedAt": None},
        "subscriber":  {"plan": "pro", "source": "revenuecat", "trialEndsAt": now + DAY,
                        "trialAnchorAt": now - 13 * DAY, "nudgedAt": None},
    }
    sent = _stub_push(monkeypatch, {"sent": True})
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {"saves": 31, "asks": 14})

    report = ent.run_trial_nudges()
    assert [s[0] for s in sent] == ["ending-soon"]
    assert report["nudged"] == 1 and report["candidates"] == 1
    assert sent[0][1] == "Your Pro trial ends tomorrow"
    assert "31 things" in sent[0][2] and "14 questions" in sent[0][2]
    assert db.others["ending-soon"]["nudgedAt"] == now

    # Six hours later the same trial is still inside the window: no second push.
    monkeypatch.setattr(ent, "_now_ms", lambda: now + 6 * 3600 * 1000)
    report = ent.run_trial_nudges()
    assert len(sent) == 1
    assert report["nudged"] == 0 and report["candidates"] == 0


def test_trial_nudge_is_stamped_even_without_a_push_token(monkeypatch):
    import quota

    now = _ms("2026-09-10T09:00:00")
    db = _install(monkeypatch, _FakeDB(cards=0, created_at=LAUNCH + DAY), now)
    db.others = {"quiet": {"plan": "pro", "source": "trial", "trialEndsAt": now + DAY,
                           "trialAnchorAt": now - 13 * DAY, "nudgedAt": None}}
    _stub_push(monkeypatch, {"sent": False, "skipped": "no_tokens"})
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {})
    report = ent.run_trial_nudges()
    assert report["no_tokens"] == 1
    assert db.others["quiet"]["nudgedAt"] == now
