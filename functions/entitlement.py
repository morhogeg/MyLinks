"""Machina Pro entitlements: who is on the Pro plan, and until when.

Source of truth is the functions-only top-level collection
``entitlements/{workspaceUid}`` (denied to every client by the locked ruleset,
exactly like ``usage_quotas``). One doc per workspace::

    plan        'free' | 'pro'          the granted plan (see effective_plan)
    source      'trial' | 'founder' | 'revenuecat'
    proUntil    ms                      plan is honoured only while now < proUntil
    trialEndsAt ms                      set for source == 'trial'
    rcAppUserId str | None              RevenueCat app user id (= Firebase Auth uid)
    productId   str | None              App Store product id, when subscribed
    nudgedAt    ms | None               trial_nudges stamps this once
    updatedAt   ms

Where the grant comes from, in order:

1. **Founders** (every workspace created before ``PRO_LAUNCH_AT``): 365 days of
   Pro, so the owner and the TestFlight testers never hit a wall the day this
   ships. A legacy doc with no ``createdAt`` at all predates the feature by
   definition and is a founder too.
2. **Reverse trial** (every workspace created on/after launch): 14 days of Pro
   counted from the workspace's ``createdAt`` (never from "now", so deleting and
   reinstalling the app cannot restart the clock), then free.
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

# The day Pro shipped. Workspaces created before this get the founders grant.
# ISO date, UTC midnight. Set to the day the feature branch was pushed.
PRO_LAUNCH_AT = "2026-09-02"

TRIAL_DAYS = 14
FOUNDER_DAYS = 365

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
        "rcAppUserId": None,
        "productId": None,
    }


def grant_for(user_created_at_ms: Optional[int]) -> dict:
    """The server-side grant a workspace is owed from its creation date alone.

    Founders (created before launch, or with no createdAt at all) get 365 days
    from launch day. Everyone else gets the 14-day reverse trial from their own
    createdAt. Pure: no I/O, so the rule is unit-testable.
    """
    launch = _launch_ms()
    created = _to_ms(user_created_at_ms)
    if created is None or created < launch:
        return {
            "plan": PLAN_PRO,
            "source": "founder",
            "proUntil": launch + FOUNDER_DAYS * _DAY_MS,
            "trialEndsAt": None,
        }
    trial_ends = created + TRIAL_DAYS * _DAY_MS
    return {
        "plan": PLAN_PRO,
        "source": "trial",
        "proUntil": trial_ends,
        "trialEndsAt": trial_ends,
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


def get_entitlement(uid: str, user_created_at_ms: Optional[int] = None) -> dict:
    """The entitlement doc for `uid`, lazily creating the founder/trial grant.

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
            return data
        created = user_created_at_ms if user_created_at_ms is not None else _user_created_at(uid)
        doc = dict(grant_for(created))
        doc.update({
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


def entitlement_summary(uid: str) -> dict:
    """What GET /api/entitlement returns (plan is the EFFECTIVE plan)."""
    from quota import quota_usage, quota_limit  # lazy: keeps import graph flat

    doc = get_entitlement(uid)
    plan = effective_plan(doc)
    used = quota_usage(uid)
    return {
        "plan": plan,
        "source": doc.get("source"),
        "proUntil": _to_ms(doc.get("proUntil")),
        "trialEndsAt": _to_ms(doc.get("trialEndsAt")),
        "quotas": {
            "saves": {"used": used.get("saves", 0), "limit": quota_limit("saves", plan)},
            "asks": {"used": used.get("asks", 0), "limit": quota_limit("asks", plan)},
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
    Not active → fall back to whatever server-side grant (trial/founder) is
    still running, else free. Restores any vaulted synthesis when the result is
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
            "productId": state["productId"],
        }
    else:
        # Subscription lapsed (or never existed): the free-standing grant, if
        # any, is still theirs. Recompute from createdAt so a lapsed founder
        # keeps the founders year.
        grant = grant_for(_user_created_at(uid))
        if effective_plan(grant, now) == PLAN_PRO:
            doc = {**grant, "productId": None}
        else:
            doc = {
                "plan": PLAN_FREE,
                "source": "revenuecat" if existing.get("source") == "revenuecat" else grant["source"],
                "proUntil": state["proUntil"] or grant["proUntil"],
                "trialEndsAt": grant.get("trialEndsAt"),
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
