"""Machina Pro entitlements: who is on the Pro plan, and until when.

Source of truth is the functions-only top-level collection
``entitlements/{workspaceUid}`` (denied to every client by the locked ruleset,
exactly like ``usage_quotas``). One doc per workspace::

    plan          'free' | 'pro'        the granted plan (see effective_plan)
    source        'trial'|'owner'|'revenuecat'
    proUntil      ms | None             plan is honoured only while now < proUntil
                                        (None = no expiry: the owner, a lifetime)
    trialEndsAt   ms | None              when the trial ends; None until it starts
    trialAnchorAt ms | None              when the 10th card landed (the clock start)
    rcAppUserId   str | None             RevenueCat app user id (= Firebase Auth uid)
    productId     str | None             App Store product id, when subscribed
    nudgedAt      ms | None              trial_nudges stamps this once
    updatedAt     ms

Where the grant comes from, in order:

1. **Owner**: the workspace whose linked sign-in account carries the verified
   ``OWNER_EMAIL`` is Pro with no expiry. Nobody else gets a standing grant:
   the pre-launch founders' year was removed on 2026-10-13 (owner's call), and
   any stored ``source: 'founder'`` doc is recomputed on its next read.
2. **Reverse trial** (every other workspace): 14 days of Pro from the day the
   workspace was created (owner's call, 2026-10-13: a countdown people can see
   from day one beats a clock that starts at an invisible 10th save). The end
   date is stored at creation and never recomputed from "now", and createdAt
   survives delete-and-recreate (``_created_at_for_new_grant``), so neither a
   reinstall nor a new account restarts it. Docs written under the old
   10th-save rule whose clock never started get their 14 days from their next
   read, never past the Pro they were already granted
   (``_start_unstarted_trial``).
3. **RevenueCat** (a real App Store subscription): ``sync_from_revenuecat``
   reads the subscriber from RevenueCat's REST API and writes ``proUntil`` from
   the ``pro`` entitlement's expiry. The client calls it after a purchase or a
   restore; the webhook calls it on every billing event. Event bodies are never
   trusted for dates, only for "which user changed".

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

from db import get_db
from log_safe import mask_uid

logger = logging.getLogger(__name__)

_COLLECTION = "entitlements"
_VAULT_COLLECTION = "synthesis_vault"

# The day Pro shipped. ISO date, UTC midnight. Kept for reference and tests:
# since 2026-10-13 nothing is granted for being created before it.
PRO_LAUNCH_AT = "2026-09-02"

TRIAL_DAYS = 14

# The old rule's trigger (the 14 days used to start at the 10th card). Kept
# only because older app builds still read `trialAnchorCards`.
TRIAL_ANCHOR_CARDS = 10
# Hard ceiling from workspace creation, so an account that never reaches ten
# cards still stops being Pro. Without it "the clock starts at 10 saves" would
# read as "Pro forever if you save nine things".
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
        "rcAppUserId": None,
        "productId": None,
    }


def trial_ends_from_anchor(created_ms: int, anchor_ms: int) -> int:
    """When a trial anchored at `anchor_ms` ends: 14 days later, or the hard
    ceiling from workspace creation, whichever comes first. Pure."""
    return min(anchor_ms + TRIAL_DAYS * _DAY_MS,
               created_ms + TRIAL_CEILING_DAYS * _DAY_MS)


def owner_grant() -> dict:
    """The owner's standing grant: Pro, no expiry. Pure."""
    return {
        "plan": PLAN_PRO,
        "source": "owner",
        "proUntil": None,
        "trialEndsAt": None,
        "trialAnchorAt": None,
    }


def grant_for(user_created_at_ms: Optional[int],
              trial_anchor_at_ms: Optional[int] = None,
              trial_ends_at_ms: Optional[int] = None,
              owner: bool = False) -> dict:
    """The server-side grant a workspace is owed, given its creation date and
    (for a trial) where its clock stands.

    The owner gets ``owner_grant()`` and ignores everything else. A workspace
    with no createdAt at all gets nothing (the free plan): there is no date to
    measure a trial from. Everyone else is on the reverse trial, measured from
    their own createdAt, so a workspace created long ago finds its trial
    ceiling already passed and reads as free:

    - ``trial_anchor_at_ms`` set: the 10th card has landed, so the trial ends at
      ``min(anchor + 14d, createdAt + 60d)``.
    - no anchor but ``trial_ends_at_ms`` set: a grandfathered doc from before the
      anchor rule shipped. Its end date stands, untouched.
    - neither: the clock has not started. Pro holds until the ceiling and
      ``trialEndsAt`` is None, which is how every caller reads "not started yet".

    Pure: no I/O, so the rule is unit-testable.
    """
    if owner:
        return owner_grant()
    created = _to_ms(user_created_at_ms)
    if created is None:
        return {
            "plan": PLAN_FREE,
            "source": None,
            "proUntil": None,
            "trialEndsAt": None,
            "trialAnchorAt": None,
        }
    anchor = _to_ms(trial_anchor_at_ms)
    if anchor is not None:
        trial_ends = trial_ends_from_anchor(created, anchor)
    else:
        trial_ends = _to_ms(trial_ends_at_ms)
    if trial_ends is None:
        # The rule since 2026-10-13: the 14 days run from creation.
        anchor = created
        trial_ends = trial_ends_from_anchor(created, created)
    return {
        "plan": PLAN_PRO,
        "source": "trial",
        "proUntil": trial_ends,
        "trialEndsAt": trial_ends,
        "trialAnchorAt": anchor,
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


# Marker on users/{uid}: the deleted-account tombstone lookup has been applied
# to this workspace's createdAt. link_service.create_workspace stamps it at
# birth (it applies the lookup itself); a workspace created by the client-side
# fallback (AuthProvider.createWorkspaceClientSide, which cannot read the
# functions-only tombstones) gets it here, once, before its first grant.
TRIAL_CLOCK_CHECKED = "trialClockChecked"


def _verified_account_email(auth_uid: str) -> Optional[str]:
    """The email on Firebase Auth account `auth_uid`, as its sign-in provider
    (Google / Apple) verified it. None when the account has no email or no
    longer exists; any other Auth error raises."""
    from firebase_admin import auth as admin_auth  # lazy: only a first grant needs it
    try:
        user = admin_auth.get_user(auth_uid)
    except admin_auth.UserNotFoundError:
        return None
    email = getattr(user, "email", None)
    return email if isinstance(email, str) and email else None


def _created_at_for_new_grant(uid: str) -> Optional[int]:
    """`createdAt` to base a brand-new grant on. For a workspace that skipped
    the server's creation path, first apply the deleted-account lookup
    (link_service.inherited_created_at — the same rule create_workspace uses),
    so deleting an account and signing up again through the client fallback
    cannot restart the trial clock. Writes the corrected createdAt and the
    marker back, so the lookup runs at most once per workspace.

    The email the lookup keys on comes from the Firebase Auth account linked
    to the workspace, never from the doc. The client fallback writes the doc
    itself, so its `email` was whatever the client chose: naming a deleted
    account's address inherited THAT account's createdAt (a creation-date
    oracle), and leaving it out reset the clock."""
    ref = get_db().collection("users").document(uid)
    snap = ref.get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    created = _to_ms(data.get("createdAt"))
    if data.get(TRIAL_CLOCK_CHECKED) or created is None:
        return created
    try:
        # Same rule as link_service.inherited_created_at, read through this
        # module's get_db so both stay on one client (and one test seam).
        from link_service import email_tombstone_id, TOMBSTONE_COLLECTION  # lazy: avoids a cycle
        inherited = created
        # A fallback-created doc is keyed by its own auth uid (the create rule
        # insists); a legacy phone-keyed doc names its account in authUids.
        linked = data.get("authUids")
        auth_uid = uid
        if isinstance(linked, list) and linked and uid not in linked and isinstance(linked[0], str):
            auth_uid = linked[0]
        tid = email_tombstone_id(_verified_account_email(auth_uid))
        if tid:
            tomb = get_db().collection(TOMBSTONE_COLLECTION).document(tid).get()
            first = (tomb.to_dict() or {}).get("firstCreatedAt") if tomb.exists else None
            if isinstance(first, (int, float)) and 0 < first < created:
                inherited = int(first)
        update = {TRIAL_CLOCK_CHECKED: True}
        if inherited < created:
            update["createdAt"] = inherited
            logger.info("Workspace %s inherits its trial clock from a deleted account",
                        mask_uid(uid))
            created = inherited
        ref.set(update, merge=True)
    except Exception as e:
        logger.warning("Trial clock inheritance check failed for %s: %s", mask_uid(uid), e)
    return created


def _owner_email() -> str:
    return (os.environ.get("OWNER_EMAIL") or "").strip().lower()


def is_owner_workspace(uid: str) -> bool:
    """True when a sign-in account linked to workspace `uid` has OWNER_EMAIL as
    its provider-verified email. The email comes from Firebase Auth, never from
    the workspace doc (which a client-side fallback could have written). Fails
    CLOSED: unset OWNER_EMAIL, a missing doc or any Auth error means False."""
    owner = _owner_email()
    if not uid or not owner:
        return False
    try:
        snap = get_db().collection("users").document(uid).get()
        data = (snap.to_dict() or {}) if snap.exists else {}
        linked = data.get("authUids")
        candidates = [a for a in linked if isinstance(a, str) and a] if isinstance(linked, list) else []
        if uid not in candidates:
            candidates.append(uid)
        for auth_uid in candidates:
            email = _verified_account_email(auth_uid)
            if email and email.strip().lower() == owner:
                return True
    except Exception as e:
        logger.warning("Owner check failed for %s (treating as not owner): %s", mask_uid(uid), e)
    return False


# Stamped on an entitlement doc once the owner check has run for it, so the
# check (one user-doc read plus a Firebase Auth lookup per linked account)
# happens at most once per workspace, ever.
OWNER_CHECKED = "ownerChecked"


def _check_existing_for_owner(uid: str, ref, data: dict) -> dict:
    """A doc written before the owner grant existed (a trial, a free plan):
    if this workspace is the owner's, move it onto the owner grant; either way
    stamp it so this never runs again for it."""
    if is_owner_workspace(uid):
        doc = {**owner_grant(), OWNER_CHECKED: True, "updatedAt": _now_ms()}
        logger.info("Owner grant applied to existing entitlement for %s", mask_uid(uid))
    else:
        doc = {OWNER_CHECKED: True}
    ref.set(doc, merge=True)
    return {**data, **doc}


def _start_unstarted_trial(uid: str, ref, data: dict) -> dict:
    """A trial doc from the old 10th-save rule whose clock never started: start
    its 14 days now, but never past the Pro it already held (its 60-day
    ceiling), so this grants nothing an account didn't already have. One that
    already lapsed is only marked, so it stays on the free plan."""
    now = _now_ms()
    held = _to_ms(data.get("proUntil"))
    if held is not None and held > now:
        ends = min(now + TRIAL_DAYS * _DAY_MS, held)
        doc = {"trialAnchorAt": now, "trialEndsAt": ends, "proUntil": ends, "updatedAt": now}
    else:
        # Lapsed (or a malformed doc with no date at all, which would otherwise
        # read as Pro forever): end it where it stands, today at the latest.
        ends = held if held is not None else now
        doc = {"trialEndsAt": ends, "proUntil": ends, "updatedAt": now}
    ref.set(doc, merge=True)
    logger.info("Unstarted trial clock started for %s", mask_uid(uid))
    return {**data, **doc}


def _replace_founder_doc(uid: str, ref, data: dict) -> dict:
    """A doc written while the founders' year existed: recompute it under the
    current rule (owner, or the reverse trial from createdAt) and store that.
    Runs at most once per such workspace."""
    grant = grant_for(_user_created_at(uid), owner=is_owner_workspace(uid))
    doc = {**grant, OWNER_CHECKED: True, "updatedAt": _now_ms()}
    ref.set(doc, merge=True)
    logger.info("Founder entitlement replaced for %s: %s", mask_uid(uid), doc["source"])
    return {**data, **doc}


def get_entitlement(uid: str, user_created_at_ms: Optional[int] = None) -> dict:
    """The entitlement doc for `uid`, lazily creating the owner/trial grant.

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
            if data.get("source") == "founder":
                return _replace_founder_doc(uid, ref, data)
            if (not data.get(OWNER_CHECKED) and data.get("source") not in ("owner", "revenuecat")
                    and _owner_email()):
                data = _check_existing_for_owner(uid, ref, data)
            if _trial_clock_unstarted(data):
                data = _start_unstarted_trial(uid, ref, data)
            data.setdefault("plan", PLAN_FREE)
            return data
        created = (user_created_at_ms if user_created_at_ms is not None
                   else _created_at_for_new_grant(uid))
        # A brand-new trial's 14 days are fixed here, from createdAt.
        doc = dict(grant_for(created, owner=is_owner_workspace(uid)))
        doc.update({
            OWNER_CHECKED: True,
            "rcAppUserId": None,
            "productId": None,
            "nudgedAt": None,
            "updatedAt": _now_ms(),
        })
        # create() rather than set(): two concurrent first requests must not
        # both "create" and race each other's updatedAt.
        try:
            ref.create(doc)
            logger.info("Entitlement created for %s: %s until %s",
                        mask_uid(uid), doc["source"], doc["proUntil"])
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


# Sources that represent a real commitment (money, or the owner's own account).
# A reverse trial is also "pro" for feature gates, but it is free to obtain
# (create an account, delete it, create another), so the two costliest paid
# surfaces — native video ingestion and the 10,000-link import ceiling — key
# on the SOURCE, not just the plan.
_COMMITTED_SOURCES = frozenset({"revenuecat", "owner"})


def entitlement_source(uid: str) -> Optional[str]:
    """'trial' | 'owner' | 'revenuecat' | None for a workspace (never raises)."""
    doc = get_entitlement(uid)
    if effective_plan(doc) != PLAN_PRO:
        return None
    src = doc.get("source")
    return src if isinstance(src, str) else None


def is_committed_pro(uid: str) -> bool:
    """Pro through a subscription or the owner grant — never a trial."""
    return entitlement_source(uid) in _COMMITTED_SOURCES


def plan_for_imports(uid: str) -> str:
    """The plan whose LIFETIME import allowance applies. A trial gets the free
    allowance: the Pro ceiling (10,000) is an abuse ceiling for paying users,
    and a disposable trial account with 10,000 imports of 3-hour videos was
    the cheapest way to spend the Gemini budget."""
    return _import_plan_for(entitlement_source(uid))


def _import_plan_for(source: Optional[str]) -> str:
    """`plan_for_imports` from an already-known source (None unless Pro is on)."""
    return PLAN_PRO if source in _COMMITTED_SOURCES else PLAN_FREE


# ── Trial clock ───────────────────────────────────────────────────────────────
#
# Since 2026-10-13 a trial's 14 days are fixed when its doc is created
# (grant_for). The only clock left to start is an old doc from the 10th-save
# rule, which _start_unstarted_trial handles on its next read.

def _run_transaction(db, fn):
    """Run ``fn(transaction)`` in a Firestore transaction (retried on
    contention, so ``fn`` reads and writes only through the transaction).
    Tests swap this for a direct call."""
    from google.cloud import firestore  # lazy: the hot paths here never need it

    @firestore.transactional
    def _txn(tx):
        return fn(tx)
    return _txn(db.transaction())


def _trial_clock_unstarted(doc: Optional[dict]) -> bool:
    """True only for a trial doc from the old 10th-save rule whose 14-day clock
    never started. Every doc written since carries trialEndsAt."""
    doc = doc or {}
    return (doc.get("source") == "trial"
            and not doc.get("trialAnchorAt") and not doc.get("trialEndsAt"))


def entitlement_summary(uid: str) -> dict:
    """What GET /api/entitlement returns (plan is the EFFECTIVE plan)."""
    from quota import quota_usage, quota_limit  # lazy: keeps import graph flat

    doc = get_entitlement(uid)
    plan = effective_plan(doc)
    # The import meter reports the allowance import_links_http enforces: a
    # trial is Pro for saves and asks but gets the free 500 imports.
    import_plan = _import_plan_for(doc.get("source") if plan == PLAN_PRO else None)
    used = quota_usage(uid)
    # Additive only: `trialAnchorAt`, `trialAnchorCards` and the `imports` meter
    # are new fields on an otherwise unchanged shape, so an older client that
    # does not read them keeps working exactly as it did. A trial with a null
    # trialAnchorAt has not started its 14 days yet. `waiting` is how many
    # saves past the monthly allowance are kept unread (deferred_capture);
    # the paywall says so.
    return {
        "plan": plan,
        "source": doc.get("source"),
        "proUntil": _to_ms(doc.get("proUntil")),
        "trialEndsAt": _to_ms(doc.get("trialEndsAt")),
        "trialAnchorAt": _to_ms(doc.get("trialAnchorAt")),
        "trialAnchorCards": TRIAL_ANCHOR_CARDS,
        # A subscription's plan and whether Apple will charge again, so the
        # app can say "Renews Nov 13" or "Ends Nov 13" instead of guessing.
        "productId": doc.get("productId"),
        "willRenew": doc.get("willRenew"),
        "billingIssue": bool(doc.get("billingIssue")),
        # The free plan's numbers, so no client hardcodes them.
        "freeLimits": {k: quota_limit(k, "free") for k in ("saves", "asks", "imports")},
        "quotas": {
            "saves": {"used": used.get("saves", 0), "limit": quota_limit("saves", plan)},
            "asks": {"used": used.get("asks", 0), "limit": quota_limit("asks", plan)},
            "imports": {"used": used.get("imports", 0), "limit": quota_limit("imports", import_plan)},
        },
        "waiting": _count_waiting(uid),
    }


def _count_waiting(uid: str) -> int:
    from deferred_capture import count_waiting  # lazy: keeps the import graph flat
    return count_waiting(uid)


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
        return {"active": False, "proUntil": None, "productId": None,
                "willRenew": None, "billingIssue": False}
    until = _to_ms(ent.get("expires_date"))
    product = ent.get("product_identifier")
    active = until is None or until > (now_ms or _now_ms())
    # The product's own subscription record says whether Apple will charge
    # again: a cancellation sets unsubscribe_detected_at, a failed charge
    # billing_issues_detected_at. Unknown (no record) stays None.
    sub = ((subscriber or {}).get("subscriptions") or {}).get(product) if product else None
    will_renew = None
    billing_issue = False
    if isinstance(sub, dict):
        will_renew = until is not None and not sub.get("unsubscribe_detected_at")
        billing_issue = bool(sub.get("billing_issues_detected_at"))
    return {"active": active, "proUntil": until, "productId": product,
            "willRenew": will_renew, "billingIssue": billing_issue}


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
    Not active → fall back to whatever server-side grant (owner/trial) is
    still running, else free. Restores any vaulted synthesis when the result is
    pro. Raises RevenueCatError when RevenueCat can't be reached; the caller
    decides how to answer (503 for the client, 502 for the webhook).
    """
    subscriber = fetch_subscriber(app_user_id)
    state = pro_from_subscriber(subscriber)
    now = _now_ms()

    ref = get_db().collection(_COLLECTION).document(uid)
    existing = get_entitlement(uid)
    if is_owner_workspace(uid):
        # The owner stays on the owner grant whatever RevenueCat says, so a
        # test purchase that lapses (sandbox subscriptions expire in minutes)
        # can never leave the owner's own account on the free plan.
        doc = {**owner_grant(), "productId": state["productId"] if state["active"] else None,
               "willRenew": None, "billingIssue": False}
    elif state["active"]:
        doc = {
            "plan": PLAN_PRO,
            "source": "revenuecat",
            "proUntil": state["proUntil"],
            "trialEndsAt": existing.get("trialEndsAt"),
            "trialAnchorAt": existing.get("trialAnchorAt"),
            "productId": state["productId"],
            "willRenew": state["willRenew"],
            "billingIssue": state["billingIssue"],
        }
    else:
        # Subscription lapsed (or never existed): the free-standing grant, if
        # any, is still theirs (the owner stays Pro). The trial clock is
        # carried through, never recomputed: a subscriber who lapses does not
        # get a fresh 14 days.
        grant = grant_for(_user_created_at(uid), existing.get("trialAnchorAt"),
                          existing.get("trialEndsAt"), owner=is_owner_workspace(uid))
        if effective_plan(grant, now) == PLAN_PRO:
            doc = {**grant, "productId": None, "willRenew": None, "billingIssue": False}
        else:
            doc = {
                "plan": PLAN_FREE,
                "source": "revenuecat" if existing.get("source") == "revenuecat" else grant["source"],
                "proUntil": state["proUntil"] or grant["proUntil"],
                "trialEndsAt": grant.get("trialEndsAt"),
                "trialAnchorAt": grant.get("trialAnchorAt"),
                "productId": None,
                "willRenew": None,
                "billingIssue": False,
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

# Local hours a trial nudge may land in: 09:00 to 20:59 on the user's own
# clock (users/{uid}.timezone, written from the device). The sweep runs
# hourly (main.trial_nudges), so a workspace outside these hours is simply
# left for a later sweep. The window opens 48 hours before the trial ends and
# any 24 hours hold every local hour once, so a trial that enters it with a
# day or more left is always reached in daytime.
NUDGE_LOCAL_HOURS = range(9, 21)

# Candidates per query page, and the most pages one sweep reads. Already
# nudged docs still match the query (nudgedAt is filtered in Python, so the
# existing (source, trialEndsAt) index serves it), so a sweep pages through
# the whole window rather than stopping at one page.
_NUDGE_PAGE = 500
_NUDGE_MAX_PAGES = 20


def _user_zone(tz_name):
    """ZoneInfo for an IANA zone name, or None when missing or unknown."""
    if not isinstance(tz_name, str) or not tz_name:
        return None
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(tz_name)
    except Exception:
        return None


def nudge_hour_ok(tz_name: Optional[str], now_ms: int) -> bool:
    """May a trial nudge go out now? Only between 09:00 and 20:59 local.

    A workspace with no usable zone is sent on the first sweep. That is rare
    (the app writes the device zone on every sign-in when the doc has none),
    and it is still a sane hour: the window opens exactly 48 hours before
    trialEndsAt, which was set at the moment of the tenth save (or of sign-up,
    for the 60-day ceiling), so the first hourly sweep after it opens lands
    within about an hour of a clock time this user was active. A fixed
    fallback zone would only guess: daytime in UTC or Israel is the middle of
    the night in the Americas."""
    zone = _user_zone(tz_name)
    if zone is None:
        return True
    return datetime.fromtimestamp(now_ms / 1000, zone).hour in NUDGE_LOCAL_HOURS


def _claim_nudge(db, ref, now_ms: int) -> bool:
    """Stamp `nudgedAt` in a transaction BEFORE the push goes out, so two
    sweeps that overlap (Cloud Scheduler delivers at least once, and the admin
    trigger can run beside the hourly one) never both send. False when the doc
    is already stamped, or is no longer a running Pro trial (a purchase that
    landed after the sweep's query)."""
    def _claim(tx) -> bool:
        snap = ref.get(transaction=tx)
        cur = (snap.to_dict() or {}) if snap.exists else {}
        ends = _to_ms(cur.get("trialEndsAt"))
        if (cur.get("nudgedAt") or cur.get("source") != "trial" or cur.get("plan") != PLAN_PRO
                or ends is None or ends <= now_ms):
            return False
        tx.set(ref, {"nudgedAt": now_ms, "updatedAt": now_ms}, merge=True)
        return True
    return _run_transaction(db, _claim)


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
    # The counts used to be this month's metered usage, which read as the
    # library size and was wrong for anyone past their first month. The body
    # now says what changes and that nothing is lost.
    del saves, asks
    body = ("After that you keep everything you saved on the free plan. "
            "Keep unlimited saves, Ask and your weekly synthesis with Machina Pro.")
    return title, body


def run_trial_nudges() -> dict:
    """Push a one-time heads-up to trials ending within the next 48 hours, in
    the user's local daytime (see NUDGE_LOCAL_HOURS / nudge_hour_ok).

    Queries entitlements where source == 'trial' and trialEndsAt falls in
    (now, now + 48h]; `nudgedAt` is filtered in Python so the query needs only
    the (source, trialEndsAt) composite index. A candidate outside its local
    daytime is skipped and seen again by the next hourly sweep. One that is
    sent is claimed first (_claim_nudge), and the claim stands whether or not
    the device had a push token, so nobody is retried every hour; only a push
    that raises releases it for the next sweep.

    Every trial carries its end date from creation, so every trial is a
    candidate once; an old 10th-save doc gets its date on its next read.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter
    from push_service import send_push
    from quota import quota_usage

    now = _now_ms()
    report = {"candidates": 0, "nudged": 0, "no_tokens": 0, "deferred": 0, "errors": 0}
    db = get_db()
    query = (
        db.collection(_COLLECTION)
        .where(filter=FieldFilter("source", "==", "trial"))
        .where(filter=FieldFilter("trialEndsAt", ">", now))
        .where(filter=FieldFilter("trialEndsAt", "<=", now + NUDGE_WINDOW_MS))
        .order_by("trialEndsAt")
    )
    last = None
    for _page in range(_NUDGE_MAX_PAGES):
        page = query.start_after(last) if last is not None else query
        docs = list(page.limit(_NUDGE_PAGE).get())
        for d in docs:
            _nudge_one(db, d, now, report, send_push, quota_usage)
        if len(docs) < _NUDGE_PAGE:
            break
        last = docs[-1]
    logger.info("Trial nudges: %s", report)
    return report


def _nudge_one(db, d, now: int, report: dict, send_push, quota_usage) -> None:
    """One candidate of run_trial_nudges. Never raises; failures are counted."""
    data = d.to_dict() or {}
    if data.get("nudgedAt") or data.get("plan") != PLAN_PRO:
        return
    uid = d.id
    report["candidates"] += 1
    try:
        user = db.collection("users").document(uid).get()
        tz_name = (user.to_dict() or {}).get("timezone") if user.exists else None
        if not nudge_hour_ok(tz_name, now):
            report["deferred"] += 1
            return
        if not _claim_nudge(db, d.reference, now):
            return
        try:
            usage = quota_usage(uid)
            title, body = trial_nudge_copy(
                int(data.get("trialEndsAt")), int(usage.get("saves", 0)),
                int(usage.get("asks", 0)), tz_name, now,
            )
            result = send_push(uid, title, body, {"view": "settings"})
        except Exception:
            # Nothing went out: release the claim so the next sweep retries.
            try:
                d.reference.set({"nudgedAt": None}, merge=True)
            except Exception as release_err:
                logger.warning("Trial nudge claim not released for %s: %s",
                               mask_uid(uid), release_err)
            raise
        if result.get("sent"):
            report["nudged"] += 1
        elif result.get("skipped") == "no_tokens":
            report["no_tokens"] += 1
    except Exception as e:
        report["errors"] += 1
        logger.warning("Trial nudge failed for %s: %s", mask_uid(uid), e)
