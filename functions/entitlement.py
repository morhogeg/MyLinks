"""Machina Pro entitlements: who is on the Pro plan, and until when.

Source of truth is the functions-only top-level collection
``entitlements/{workspaceUid}`` (denied to every client by the locked ruleset,
exactly like ``usage_quotas``). One doc per workspace::

    plan           'free' | 'pro'        the granted plan (see effective_plan)
    source         'trial'|'revenuecat'
    proUntil       ms                    plan is honoured only while now < proUntil
    trialEndsAt    ms | None             when the trial ends; None until it starts
    trialAnchorAt  ms | None             when the 10th card landed (the clock start)
    trialCeilingAt ms                    the hard end of the trial whatever happens
    migratedAt     ms | None             set once on a pre-launch workspace (below)
    rcAppUserId    str | None            RevenueCat app user id (= Firebase Auth uid)
    productId      str | None            App Store product id, when subscribed
    nudgedAt       ms | None             trial_nudges stamps this once
    updatedAt      ms

Where the grant comes from, in order:

1. **Reverse trial** (every workspace): 14 days of Pro whose clock starts when
   the library reaches ``TRIAL_ANCHOR_CARDS`` cards, not at sign-up. A trial
   spent on an empty library teaches nothing, so the 14 days begin the moment
   the 10th card is written (``maybe_start_trial``, called from the links
   trigger) and ``trialAnchorAt`` records that moment. Until then the plan
   resolves as trial-Pro, bounded by a hard ceiling so a dormant account cannot
   sit on Pro forever: ``trialEndsAt = min(anchor + 14d, trialCeilingAt)``, and
   before the anchor exists ``proUntil`` is the ceiling alone. The ceiling is
   ``createdAt + 60d`` and is stored on the doc; the anchor is stored too, never
   recomputed from "now", so deleting and reinstalling the app cannot restart
   the clock. Entitlement docs written before the anchor rule shipped already
   carry a ``trialEndsAt`` and are left exactly as they are.
2. **RevenueCat** (a real App Store subscription): ``sync_from_revenuecat``
   reads the subscriber from RevenueCat's REST API and writes ``proUntil`` from
   the ``pro`` entitlement's expiry. The client calls it after a purchase or a
   restore; the webhook calls it on every billing event. Event bodies are never
   trusted for dates, only for "which user changed".

**Pre-launch workspaces** (the owner and the TestFlight testers, created before
``PRO_LAUNCH_AT``) used to hold a 365-day "founding member" grant. That grant is
gone. Because their ``createdAt`` is months old, a naive "everyone is on the
trial" would put them on Free the instant this deploys, so the first read after
deploy migrates them instead (``_migrate_legacy``): a doc with ``source:
'founder'``, or no doc at all for a workspace created before launch (or with no
``createdAt``, which only the legacy phone workspace lacks), becomes an ordinary
trial whose 60-day ceiling is measured from the migration moment, anchored
right then if the library already has ten cards. The write flips ``source`` to
``'trial'`` and stamps ``migratedAt``, so it runs exactly once per workspace.

Fail OPEN to the free tier: any Firestore or network error here yields the
free-plan limits and a warning. Nothing in this module may take a save or an
ask down; the free caps are the generous, friendly wall, so a broken lookup
costs the user features rather than data.

The workspace uid is PII (a phone number for the legacy workspace), so every
log line goes through ``mask_uid`` and the uid never reaches RevenueCat: the
RevenueCat app user id is the Firebase Auth uid, mapped back here through the
same ``authUids array-contains`` lookup ``_authed_uid`` uses.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import requests
from google.cloud import firestore

from db import get_db
from log_safe import mask_uid

logger = logging.getLogger(__name__)

_COLLECTION = "entitlements"
_VAULT_COLLECTION = "synthesis_vault"

# The day Pro shipped. Only used to recognise a pre-launch workspace that has
# no entitlement doc yet, so it gets the migration below instead of a trial
# clock measured from a months-old createdAt. ISO date, UTC midnight.
PRO_LAUNCH_AT = "2026-09-02"

TRIAL_DAYS = 14

# How many cards a library needs before the 14-day trial clock starts.
TRIAL_ANCHOR_CARDS = 10
# Hard ceiling from workspace creation (or from migration, for a pre-launch
# workspace), so an account that never reaches ten cards still stops being
# Pro. Without it "the clock starts at 10 saves" would read as "Pro forever if
# you save nine things".
TRIAL_CEILING_DAYS = 60

PLAN_FREE = "free"
PLAN_PRO = "pro"

# RevenueCat identifiers. The owner creates these to match (SOURCE_OF_TRUTH §4
# item 26); nothing else in the codebase may invent a different one.
RC_ENTITLEMENT_ID = "pro"
RC_API_BASE = "https://api.revenuecat.com/v1"
_RC_TIMEOUT_S = 10

_DAY_MS = 24 * 60 * 60 * 1000


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _launch_ms() -> int:
    return int(datetime.fromisoformat(PRO_LAUNCH_AT).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _to_ms(value) -> Optional[int]:
    """Coerce a Firestore-ish timestamp (int ms, datetime, ISO string) to ms."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        v = int(value)
        # Seconds vs ms: anything before 1973 in ms is really seconds.
        return v * 1000 if v < 100_000_000_000 else v
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    if isinstance(value, str):
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return None
    # google.cloud Timestamp / DatetimeWithNanoseconds expose .timestamp()
    ts = getattr(value, "timestamp", None)
    if callable(ts):
        try:
            return int(ts() * 1000)
        except Exception:
            return None
    return None


def free_entitlement() -> dict:
    """The fail-open shape: free plan, no grant, no dates."""
    return {
        "plan": PLAN_FREE,
        "source": None,
        "proUntil": None,
        "trialEndsAt": None,
        "trialAnchorAt": None,
        "trialCeilingAt": None,
        "rcAppUserId": None,
        "productId": None,
    }


def is_pre_launch(user_created_at_ms) -> bool:
    """True for a workspace that existed before Pro shipped. A missing
    createdAt predates the feature by definition (only the legacy phone
    workspace lacks one)."""
    created = _to_ms(user_created_at_ms)
    return created is None or created < _launch_ms()


def trial_ceiling_for(user_created_at_ms, now_ms: Optional[int] = None) -> int:
    """The hard end of a trial: 60 days from workspace creation. A workspace
    with no createdAt measures from now (it is the migration case, or a doc
    that should not exist; either way "60 days from here" is the safe read)."""
    created = _to_ms(user_created_at_ms)
    base = created if created is not None else (now_ms if now_ms is not None else _now_ms())
    return base + TRIAL_CEILING_DAYS * _DAY_MS


def trial_end_for(anchor_ms: int, ceiling_ms: int) -> int:
    """When a trial anchored at `anchor_ms` ends: 14 days later, or the hard
    ceiling, whichever comes first. Pure."""
    return min(anchor_ms + TRIAL_DAYS * _DAY_MS, ceiling_ms)


def grant_for(user_created_at_ms: Optional[int],
              trial_anchor_at_ms: Optional[int] = None,
              trial_ends_at_ms: Optional[int] = None,
              trial_ceiling_at_ms: Optional[int] = None,
              now_ms: Optional[int] = None) -> dict:
    """The server-side trial grant a workspace is owed, given its creation date
    and where its clock stands. Every workspace is on the reverse trial:

    - ``trial_anchor_at_ms`` set: the 10th card has landed, so the trial ends at
      ``min(anchor + 14d, ceiling)``.
    - no anchor but ``trial_ends_at_ms`` set: a grandfathered doc from before the
      anchor rule shipped. Its end date stands, untouched.
    - neither: the clock has not started. Pro holds until the ceiling and
      ``trialEndsAt`` is None, which is how every caller reads "not started yet".

    The ceiling is the stored ``trialCeilingAt`` when the doc has one (a
    migrated pre-launch workspace measures it from migration, not creation),
    else ``createdAt + 60d``. Pure: no I/O, so the rule is unit-testable.
    """
    created = _to_ms(user_created_at_ms)
    ceiling = _to_ms(trial_ceiling_at_ms)
    if ceiling is None:
        ceiling = trial_ceiling_for(created, now_ms)
    anchor = _to_ms(trial_anchor_at_ms)
    if anchor is not None:
        trial_ends = trial_end_for(anchor, ceiling)
    else:
        trial_ends = _to_ms(trial_ends_at_ms)
    return {
        "plan": PLAN_PRO,
        "source": "trial",
        "proUntil": trial_ends if trial_ends is not None else ceiling,
        "trialEndsAt": trial_ends,
        "trialAnchorAt": anchor,
        "trialCeilingAt": ceiling,
    }


def effective_plan(doc: Optional[dict], now_ms: Optional[int] = None) -> str:
    """'pro' only while the granted plan is pro AND proUntil is in the future."""
    if not doc or doc.get("plan") != PLAN_PRO:
        return PLAN_FREE
    until = _to_ms(doc.get("proUntil"))
    if until is None:
        # A pro grant with no expiry (lifetime / RevenueCat lifetime product).
        return PLAN_PRO
    return PLAN_PRO if until > (now_ms or _now_ms()) else PLAN_FREE


def _user_created_at(uid: str) -> Optional[int]:
    snap = get_db().collection("users").document(uid).get()
    if not snap.exists:
        return None
    return _to_ms((snap.to_dict() or {}).get("createdAt"))


def count_cards(uid: str, cap: int) -> int:
    """How many cards `uid` has, counted only up to `cap`.

    Projected to one small field and limited, so this is at most `cap` cheap
    document reads and never pages a library of thousands.
    """
    query = (
        get_db()
        .collection("users").document(uid).collection("links")
        .select(["createdAt"])
        .limit(cap)
    )
    return len(list(query.get()))


def legacy_trial_fields(uid: str, now_ms: int) -> dict:
    """The trial a pre-launch workspace is moved onto (see the module docstring).

    The 60-day ceiling runs from `now_ms`, not from the months-old createdAt,
    and the clock is anchored right away when the library already holds ten
    cards (it almost always does for the owner and the testers), so they get
    the same 14 days a new user gets from their tenth save. Counts up to ten
    cards: one small read, once per workspace, ever.
    """
    ceiling = now_ms + TRIAL_CEILING_DAYS * _DAY_MS
    anchored = count_cards(uid, TRIAL_ANCHOR_CARDS) >= TRIAL_ANCHOR_CARDS
    anchor = now_ms if anchored else None
    ends = trial_end_for(anchor, ceiling) if anchor is not None else None
    return {
        "plan": PLAN_PRO,
        "source": "trial",
        "proUntil": ends if ends is not None else ceiling,
        "trialEndsAt": ends,
        "trialAnchorAt": anchor,
        "trialCeilingAt": ceiling,
        "migratedAt": now_ms,
    }


def _migrate_legacy(uid: str, ref, data: dict) -> dict:
    """Rewrite a stored ``source: 'founder'`` doc as a trial, once.

    Merge-write, so rcAppUserId/nudgedAt and friends survive. After this the
    doc's source is 'trial', which is what makes the migration idempotent: the
    next read takes the ordinary path and never lands here again.
    """
    now = _now_ms()
    fields = legacy_trial_fields(uid, now)
    fields["updatedAt"] = now
    ref.set(fields, merge=True)
    merged = {**data, **fields}
    logger.info("Migrated founder grant to a trial for %s: anchored=%s until %s",
                mask_uid(uid), fields["trialAnchorAt"] is not None, fields["proUntil"])
    return merged


def get_entitlement(uid: str, user_created_at_ms: Optional[int] = None) -> dict:
    """The entitlement doc for `uid`, lazily creating the trial grant.

    `user_created_at_ms` saves a user-doc read when the caller already has it;
    otherwise it is fetched. Returns the free shape (never raises) on any error.
    """
    if not uid:
        return free_entitlement()
    try:
        ref = get_db().collection(_COLLECTION).document(uid)
        snap = ref.get()
        if snap.exists:
            data = snap.to_dict() or {}
            data.setdefault("plan", PLAN_FREE)
            if data.get("source") == "founder":
                return _migrate_legacy(uid, ref, data)
            return data
        created = user_created_at_ms if user_created_at_ms is not None else _user_created_at(uid)
        now = _now_ms()
        if is_pre_launch(created):
            # A pre-launch workspace that never read its entitlement before
            # this deploy: same migration, minus the doc to rewrite.
            doc = legacy_trial_fields(uid, now)
        else:
            # A brand-new trial has no anchor yet: the clock starts at the
            # 10th card (maybe_start_trial), not here.
            doc = dict(grant_for(created, now_ms=now))
            doc["migratedAt"] = None
        doc.update({
            "rcAppUserId": None,
            "productId": None,
            "nudgedAt": None,
            "updatedAt": now,
        })
        # create() rather than set(): two concurrent first requests must not
        # both "create" and race each other's updatedAt.
        try:
            ref.create(doc)
            logger.info("Entitlement created for %s: %s until %s (migrated=%s)",
                        mask_uid(uid), doc["source"], doc["proUntil"],
                        doc.get("migratedAt") is not None)
        except Exception:
            again = ref.get()
            if again.exists:
                return again.to_dict() or doc
            raise
        return doc
    except Exception as e:
        logger.warning("Entitlement lookup failed (failing open to free) for %s: %s",
                       mask_uid(uid), e)
        return free_entitlement()


def plan_for(uid: str) -> str:
    """'pro' | 'free' for the quota gate and feature gates. Never raises."""
    return effective_plan(get_entitlement(uid))


def is_pro(uid: str) -> bool:
    return plan_for(uid) == PLAN_PRO


# ── Trial clock ───────────────────────────────────────────────────────────────
#
# Per-instance memo of workspaces whose trial clock needs no further attention.
# Cloud Functions instances are reused across invocations, so this turns the
# common case (every card write after the tenth) into zero Firestore reads. It
# is a cache of a ONE-WAY fact: a uid is added only once its anchor (or a
# grandfathered end date) is STORED, and neither is ever cleared, so a cold
# instance re-reading the doc reaches the same answer. Nothing else is cached:
# a subscriber's `source` can flip back to 'trial' when the subscription lapses
# (sync_from_revenuecat), and a fail-open read has no source at all, so neither
# of those may settle a uid. Bounded so a busy instance cannot grow it without
# limit.
_TRIAL_SETTLED: set = set()
_TRIAL_SETTLED_MAX = 2000


def _mark_trial_settled(uid: str) -> None:
    if len(_TRIAL_SETTLED) >= _TRIAL_SETTLED_MAX:
        _TRIAL_SETTLED.clear()
    _TRIAL_SETTLED.add(uid)


def trial_clock_settled(doc: dict) -> bool:
    """True once the clock can never need starting: the anchor is stored, or
    the doc predates the anchor rule and carries its own end date."""
    return bool(doc.get("trialAnchorAt") or doc.get("trialEndsAt"))


def _stamp_trial_anchor(uid: str, now_ms: int, ceiling_ms: int) -> bool:
    """Write trialAnchorAt exactly once, inside a transaction.

    Ten cards arriving in one import fire ten triggers at once, and each of
    them can count ten cards; only the first may win. The transaction re-reads
    the doc and gives up if an anchor is already there. On a trial doc the
    anchor also fixes the end of the grant; on a subscriber's doc only the
    anchor and trialEndsAt are recorded, so that a lapse later resolves to the
    right remaining trial (grant_for) without ever restarting the 14 days.
    """
    db = get_db()
    ref = db.collection(_COLLECTION).document(uid)

    @firestore.transactional
    def _txn(txn):
        snap = ref.get(transaction=txn)
        data = (snap.to_dict() or {}) if snap.exists else {}
        if trial_clock_settled(data):
            return False
        ends = trial_end_for(now_ms, ceiling_ms)
        update = {"trialAnchorAt": now_ms, "trialEndsAt": ends, "updatedAt": now_ms}
        if data.get("source") == "trial":
            update.update({"proUntil": ends, "plan": PLAN_PRO})
        txn.set(ref, update, merge=True)
        return True

    return bool(_txn(db.transaction()))


def maybe_start_trial(uid: str) -> bool:
    """Start the 14-day trial clock if this workspace just reached ten cards.

    Called from the links trigger on every card CREATE, which is the cheapest
    correct place: it is the one choke point every capture path passes through
    (share sheet, web add, note, import), and it needs no scheduler. Almost
    every call costs nothing at all thanks to the settled memo above; the ones
    that do work read one entitlement doc and, at most, ten card ids.

    Returns True only on the write that actually starts the clock. Never raises:
    a failure here means the trial simply starts on a later save.
    """
    if not uid or uid in _TRIAL_SETTLED:
        return False
    try:
        doc = get_entitlement(uid)
        if doc.get("source") is None:
            # The fail-open shape: Firestore was unreachable. Nothing is known,
            # so nothing is settled; the next card checks again.
            return False
        if trial_clock_settled(doc):
            _mark_trial_settled(uid)
            return False
        if count_cards(uid, TRIAL_ANCHOR_CARDS) < TRIAL_ANCHOR_CARDS:
            return False

        now = _now_ms()
        ceiling = _to_ms(doc.get("trialCeilingAt"))
        if ceiling is None:
            # A doc from before the ceiling was stored: measure it from the
            # workspace's own creation date (one read, once per workspace).
            ceiling = trial_ceiling_for(_user_created_at(uid), now)
        started = _stamp_trial_anchor(uid, now, ceiling)
        _mark_trial_settled(uid)
        if started:
            logger.info("Trial clock started for %s at %d cards, ends %s",
                        mask_uid(uid), TRIAL_ANCHOR_CARDS, trial_end_for(now, ceiling))
        return started
    except Exception as e:
        logger.warning("Trial anchor check failed (ignored) for %s: %s", mask_uid(uid), e)
        return False


def entitlement_summary(uid: str) -> dict:
    """What GET /api/entitlement returns (plan is the EFFECTIVE plan)."""
    from quota import quota_usage, quota_limit  # lazy: keeps import graph flat

    doc = get_entitlement(uid)
    plan = effective_plan(doc)
    used = quota_usage(uid)
    # Additive only: `trialAnchorAt`, `trialAnchorCards` and the `imports` meter
    # are new fields on an otherwise unchanged shape, so an older client that
    # does not read them keeps working exactly as it did. A trial with a null
    # trialAnchorAt has not started its 14 days yet.
    return {
        "plan": plan,
        "source": doc.get("source"),
        "proUntil": _to_ms(doc.get("proUntil")),
        "trialEndsAt": _to_ms(doc.get("trialEndsAt")),
        "trialAnchorAt": _to_ms(doc.get("trialAnchorAt")),
        "trialAnchorCards": TRIAL_ANCHOR_CARDS,
        "quotas": {
            "saves": {"used": used.get("saves", 0), "limit": quota_limit("saves", plan)},
            "asks": {"used": used.get("asks", 0), "limit": quota_limit("asks", plan)},
            "imports": {"used": used.get("imports", 0), "limit": quota_limit("imports", plan)},
        },
    }


# ── RevenueCat ────────────────────────────────────────────────────────────────

def _rc_secret() -> str:
    return (os.environ.get("REVENUECAT_SECRET_KEY") or "").strip()


def rc_configured() -> bool:
    return bool(_rc_secret())


class RevenueCatError(Exception):
    """RevenueCat REST call failed (network, auth, or malformed response)."""


def fetch_subscriber(app_user_id: str) -> dict:
    """GET /v1/subscribers/{app_user_id}; returns the `subscriber` object.

    RevenueCat creates the subscriber on first GET, so an unknown id is not an
    error (it comes back with empty entitlements). Never logs the key.
    """
    if not rc_configured():
        raise RevenueCatError("REVENUECAT_SECRET_KEY is not set")
    if not app_user_id:
        raise RevenueCatError("missing app_user_id")
    url = f"{RC_API_BASE}/subscribers/{requests.utils.quote(app_user_id, safe='')}"
    try:
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {_rc_secret()}", "Accept": "application/json"},
            timeout=_RC_TIMEOUT_S,
        )
    except requests.RequestException as e:
        raise RevenueCatError(f"request failed: {e.__class__.__name__}") from e
    if resp.status_code != 200:
        raise RevenueCatError(f"HTTP {resp.status_code}")
    try:
        body = resp.json()
    except ValueError as e:
        raise RevenueCatError("non-JSON response") from e
    subscriber = body.get("subscriber") if isinstance(body, dict) else None
    if not isinstance(subscriber, dict):
        raise RevenueCatError("malformed response")
    return subscriber


def pro_from_subscriber(subscriber: dict, now_ms: Optional[int] = None) -> dict:
    """Reduce a RevenueCat subscriber object to {active, proUntil, productId}.

    Pure (unit-testable). `expires_date` is None for a lifetime purchase, which
    counts as active with no expiry.
    """
    ent = ((subscriber or {}).get("entitlements") or {}).get(RC_ENTITLEMENT_ID) or {}
    if not ent:
        return {"active": False, "proUntil": None, "productId": None}
    until = _to_ms(ent.get("expires_date"))
    product = ent.get("product_identifier")
    active = until is None or until > (now_ms or _now_ms())
    return {"active": active, "proUntil": until, "productId": product}


def resolve_workspace_for_app_user(app_user_id: str, aliases=None) -> Optional[str]:
    """Map a RevenueCat app user id (a Firebase Auth uid) to the workspace uid.

    Anonymous RevenueCat ids (``$RCAnonymousID:…``) can appear in webhook
    events before a logIn; the event's `aliases` then carry the real id.
    """
    from link_service import find_data_uid_by_auth_uid  # lazy: avoids a cycle

    candidates = [app_user_id] + list(aliases or [])
    for cand in candidates:
        if not cand or not isinstance(cand, str) or cand.startswith("$RCAnonymousID"):
            continue
        uid = find_data_uid_by_auth_uid(cand)
        if uid:
            return uid
    return None


def sync_from_revenuecat(uid: str, app_user_id: str) -> dict:
    """Re-read the subscriber from RevenueCat and rewrite the entitlement doc.

    Active `pro` entitlement → plan pro, source revenuecat, proUntil = expiry.
    Not active → fall back to whatever remains of the server-side trial, else
    free. Restores any vaulted synthesis when the result is
    pro. Raises RevenueCatError when RevenueCat can't be reached; the caller
    decides how to answer (503 for the client, 502 for the webhook).
    """
    subscriber = fetch_subscriber(app_user_id)
    state = pro_from_subscriber(subscriber)
    now = _now_ms()

    ref = get_db().collection(_COLLECTION).document(uid)
    existing = get_entitlement(uid)
    if state["active"]:
        doc = {
            "plan": PLAN_PRO,
            "source": "revenuecat",
            "proUntil": state["proUntil"],
            "trialEndsAt": existing.get("trialEndsAt"),
            "trialAnchorAt": existing.get("trialAnchorAt"),
            "productId": state["productId"],
        }
    else:
        # Subscription lapsed (or never existed): whatever is left of the
        # trial is still theirs. The trial clock and its ceiling are carried
        # through from the doc, never recomputed: a subscriber who lapses does
        # not get a fresh 14 days, and a migrated pre-launch workspace keeps
        # the ceiling it was given at migration.
        grant = grant_for(_user_created_at(uid), existing.get("trialAnchorAt"),
                          existing.get("trialEndsAt"), existing.get("trialCeilingAt"),
                          now)
        if effective_plan(grant, now) == PLAN_PRO:
            doc = {**grant, "productId": None}
        else:
            doc = {
                "plan": PLAN_FREE,
                "source": "revenuecat" if existing.get("source") == "revenuecat" else grant["source"],
                "proUntil": state["proUntil"] or grant["proUntil"],
                "trialEndsAt": grant.get("trialEndsAt"),
                "trialAnchorAt": grant.get("trialAnchorAt"),
                "trialCeilingAt": grant.get("trialCeilingAt"),
                "productId": None,
            }
    doc.update({"rcAppUserId": app_user_id, "updatedAt": now})
    ref.set(doc, merge=True)
    logger.info("Entitlement synced from RevenueCat for %s: plan=%s source=%s",
                mask_uid(uid), doc["plan"], doc["source"])

    if effective_plan(doc, now) == PLAN_PRO:
        restore_vaulted_syntheses(uid)
    merged = {**existing, **doc}
    return merged


# ── Synthesis vault ───────────────────────────────────────────────────────────
#
# A free workspace still gets its weekly synthesis GENERATED (it costs a
# fraction of a cent and the teaser is the upgrade moment), but the readable
# doc is written locked, and the full payload waits here under
# synthesis_vault/{uid}__{weekId}. Going Pro restores it in place.

def vault_doc_id(uid: str, week_id: str) -> str:
    return f"{uid}__{week_id}"


def stash_synthesis(uid: str, week_id: str, full_doc: dict) -> None:
    payload = dict(full_doc)
    payload.update({"uid": uid, "weekId": week_id, "vaultedAt": _now_ms()})
    get_db().collection(_VAULT_COLLECTION).document(vault_doc_id(uid, week_id)).set(payload)


def restore_vaulted_syntheses(uid: str, limit: int = 8) -> int:
    """Overwrite locked syntheses/{week} docs with their vaulted full payload.

    Restores every vaulted week for the workspace (bounded), newest first, so a
    user who upgrades after two locked weeks gets both. The vault doc is kept:
    a lapse followed by a re-subscribe must not need a regeneration. Returns
    the number of docs restored; never raises.
    """
    if not uid:
        return 0
    restored = 0
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter

        db = get_db()
        docs = (
            db.collection(_VAULT_COLLECTION)
            .where(filter=FieldFilter("uid", "==", uid))
            .limit(limit)
            .get()
        )
        user_syntheses = db.collection("users").document(uid).collection("syntheses")
        for d in docs:
            data = d.to_dict() or {}
            week_id = data.get("weekId")
            if not week_id:
                continue
            full = {k: v for k, v in data.items() if k not in ("uid", "vaultedAt")}
            full["locked"] = False
            user_syntheses.document(week_id).set(full)
            restored += 1
        if restored:
            logger.info("Restored %d vaulted synthesis doc(s) for %s", restored, mask_uid(uid))
    except Exception as e:
        logger.warning("Vault restore failed (ignored) for %s: %s", mask_uid(uid), e)
    return restored


# ── Trial nudge ───────────────────────────────────────────────────────────────

NUDGE_WINDOW_MS = 48 * 60 * 60 * 1000


def _weekday_phrase(ends_ms: int, tz_name: Optional[str], now_ms: int) -> str:
    """'today' / 'tomorrow' / 'Sunday' in the user's local time."""
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except Exception:
        tz = timezone.utc
    ends = datetime.fromtimestamp(ends_ms / 1000, tz)
    now = datetime.fromtimestamp(now_ms / 1000, tz)
    delta_days = (ends.date() - now.date()).days
    if delta_days <= 0:
        return "today"
    if delta_days == 1:
        return "tomorrow"
    return ends.strftime("%A")


def trial_nudge_copy(ends_ms: int, saves: int, asks: int, tz_name: Optional[str],
                     now_ms: Optional[int] = None) -> tuple:
    """(title, body) for the trial-ending push. No em dashes (build tripwire)."""
    when = _weekday_phrase(ends_ms, tz_name, now_ms or _now_ms())
    title = f"Your Pro trial ends {when}"
    things = "thing" if saves == 1 else "things"
    questions = "question" if asks == 1 else "questions"
    body = (f"You saved {saves} {things} and asked {asks} {questions}. "
            "Keep unlimited saves, Ask, and your weekly synthesis with Machina Pro.")
    return title, body


def run_trial_nudges() -> dict:
    """Push a one-time heads-up to trials ending within the next 48 hours.

    Queries entitlements where source == 'trial' and trialEndsAt falls in
    (now, now + 48h]; `nudgedAt` is filtered in Python so the query needs only
    the (source, trialEndsAt) composite index. Stamps nudgedAt whether or not
    the device had a push token, so nobody is retried every six hours.

    A trial whose clock has not started yet has a null trialEndsAt, which a
    range filter excludes by definition: nobody is warned about an end date
    they do not have. They become candidates the moment the tenth card anchors
    the clock (maybe_start_trial writes the date this query looks at).
    """
    from google.cloud.firestore_v1.base_query import FieldFilter
    from push_service import send_push
    from quota import quota_usage

    now = _now_ms()
    report = {"candidates": 0, "nudged": 0, "no_tokens": 0, "errors": 0}
    db = get_db()
    docs = (
        db.collection(_COLLECTION)
        .where(filter=FieldFilter("source", "==", "trial"))
        .where(filter=FieldFilter("trialEndsAt", ">", now))
        .where(filter=FieldFilter("trialEndsAt", "<=", now + NUDGE_WINDOW_MS))
        .limit(500)
        .get()
    )
    for d in docs:
        data = d.to_dict() or {}
        if data.get("nudgedAt"):
            continue
        if data.get("plan") != PLAN_PRO:
            continue
        uid = d.id
        report["candidates"] += 1
        try:
            user = db.collection("users").document(uid).get()
            tz_name = (user.to_dict() or {}).get("timezone") if user.exists else None
            usage = quota_usage(uid)
            title, body = trial_nudge_copy(
                int(data.get("trialEndsAt")), int(usage.get("saves", 0)),
                int(usage.get("asks", 0)), tz_name, now,
            )
            result = send_push(uid, title, body, {"view": "settings"})
            if result.get("sent"):
                report["nudged"] += 1
            elif result.get("skipped") == "no_tokens":
                report["no_tokens"] += 1
            d.reference.set({"nudgedAt": now, "updatedAt": now}, merge=True)
        except Exception as e:
            report["errors"] += 1
            logger.warning("Trial nudge failed for %s: %s", mask_uid(uid), e)
    logger.info("Trial nudges: %s", report)
    return report
