"""Monthly per-user usage quotas (soft caps) for the paid Gemini surfaces.

A transactional counter in the top-level ``usage_quotas/{uid}`` collection holds
per-month sub-maps, e.g. ``{"2026-07": {"saves": 12, "asks": 3}}``. This is the
per-user-per-month spend ceiling that complements the per-request rate limits
(``rate_limit.py``) and the per-function ``max_instances`` caps.

Only the Admin SDK (this module) ever touches ``usage_quotas``; the locked
ruleset denies all client access (no rule matches, plus an explicit deny),
mirroring ``rate_limits``.

Soft cap by design: on any Firestore error we FAIL OPEN (allow the call) and log
a warning, because the hard backstops are the rate limiter (fail-closed on the
paid buckets) and ``max_instances``. A quota outage must never take saving or
asking down.
"""

import os
import logging
from datetime import datetime, timezone

from google.cloud import firestore

from db import get_db

logger = logging.getLogger(__name__)

_COLLECTION = "usage_quotas"

# Retain only the most-recent months in the counter doc; older month-maps are
# pruned at write time so the doc can't grow without bound.
_KEEP_MONTHS = 2

# Single source of truth for every metered quota kind: the env vars that
# override its monthly limit PER PLAN, those limits' defaults, and the
# user-facing 429 copy. Both _limit_for (here) and main.py's _quota_blocked read
# from this table (via quota_message), so adding a future kind can't half-work.
#
# Two plans (Machina Pro, 2026-09-02). Free is the friendly wall with an
# upgrade hint; Pro's limit is an ABUSE CEILING, not a product cap, so its copy
# never mentions upgrading. The legacy MONTHLY_* names stay as aliases for the
# free values so an already-deployed .env keeps its meaning.
_QUOTA_KINDS = {
    "saves": {
        "env": {"free": ("FREE_SAVE_QUOTA", "MONTHLY_SAVE_QUOTA"), "pro": ("PRO_SAVE_QUOTA",)},
        # 150 -> 100 with the Pro launch: 100 is the free tier's published cap.
        "default": {"free": 100, "pro": 1000},
        "message": {
            "free": "You've used all {limit} free saves this month. Upgrade to Machina Pro for unlimited saves, or wait for the 1st.",
            "pro": "Monthly save limit reached. Resets on the 1st.",
        },
    },
    "asks": {
        "env": {"free": ("FREE_ASK_QUOTA", "MONTHLY_ASK_QUOTA"), "pro": ("PRO_ASK_QUOTA",)},
        # History: 100 -> 1000 (2026-07-25, owner hit the cap mid-TestFlight),
        # 1000 -> 100 (2026-08-04, first outside testers), 100 -> 20 free /
        # 1000 pro (2026-09-02, Machina Pro). The per-user wall is the FRIENDLY
        # failure: one person loses Ask until the 1st. The Gemini spend cap is
        # the hostile one (every AI surface dies for everybody), so this
        # ceiling exists so the friendly failure always happens first.
        "default": {"free": 20, "pro": 1000},
        "message": {
            "free": "You've asked all {limit} free questions this month. Upgrade to Machina Pro for unlimited Ask, or wait for the 1st.",
            "pro": "Monthly question limit reached. Resets on the 1st.",
        },
    },
}

_KINDS = tuple(_QUOTA_KINDS)
_PLANS = ("free", "pro")

# Sentinel "remaining" when the check is disabled or fails open. Callers gate on
# `ok` only; a large number reads correctly as "plenty left".
_UNLIMITED = 1_000_000


def _normalize_plan(plan) -> str:
    return "pro" if plan == "pro" else "free"


def _limit_for(kind: str, plan: str = "free") -> int:
    """Monthly limit for `kind` on `plan` from env. 0 (or negative / unparseable)
    disables the check entirely (always allow). The first env name that is SET
    wins, so FREE_SAVE_QUOTA overrides the legacy MONTHLY_SAVE_QUOTA alias."""
    cfg = _QUOTA_KINDS.get(kind)
    if cfg is None:
        return 0
    plan = _normalize_plan(plan)
    raw = None
    for name in cfg["env"][plan]:
        if os.environ.get(name) is not None:
            raw = os.environ.get(name)
            break
    if raw is None:
        raw = str(cfg["default"][plan])
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def quota_limit(kind: str, plan: str = "free") -> int:
    """Public alias of _limit_for for the entitlement endpoint (0 = unmetered)."""
    return _limit_for(kind, plan)


def _metering_disabled(kind: str) -> bool:
    """True only when NO plan meters `kind` (so nothing was ever charged)."""
    return all(_limit_for(kind, p) <= 0 for p in _PLANS)


def quota_message(kind: str, plan: str = "free", limit: int = None) -> str:
    """User-facing 429 copy for `kind` on `plan` (single source of truth, see
    _QUOTA_KINDS). No em dashes: the copy is rendered verbatim by the client.

    Falls back to a generic message for an unknown kind rather than raising, so a
    caller can never trip a KeyError on the message lookup."""
    cfg = _QUOTA_KINDS.get(kind)
    if not cfg:
        return "Monthly limit reached."
    plan = _normalize_plan(plan)
    if limit is None:
        limit = _limit_for(kind, plan)
    return cfg["message"][plan].format(limit=limit)


def _current_month(now: datetime = None) -> str:
    """Current month key in ``YYYY-MM`` form (UTC)."""
    now = now or datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def _recent_months(current: str, keep: int = _KEEP_MONTHS) -> set:
    """The `keep` most-recent month keys ending at `current` (inclusive)."""
    year, month = int(current[:4]), int(current[5:7])
    months = set()
    for _ in range(keep):
        months.add(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return months


def meter(uid: str, kind: str, amount: int = 1, plan: str = "free") -> dict:
    """Atomically check + increment the caller's monthly `kind` counter.

    Returns ``{ok, remaining, used, limit, plan}``:
    - ``ok`` is ``False`` (and ``remaining`` 0) only when this increment would
      exceed the plan's monthly limit; the counter is then NOT incremented and
      ``used`` is the untouched current count.
    - Otherwise ``ok`` is ``True``, ``used`` includes this increment, and
      ``remaining`` is what's left after it.

    ``kind`` must be one of ``{"saves", "asks"}``. A limit of 0 disables the
    check (always allows). Prunes month-maps older than the two most recent at
    write time so the doc stays bounded.

    Fails OPEN on any Firestore error (soft cap, see module docstring): returns
    ok with ``_UNLIMITED`` remaining and logs a warning (never the uid, PII).
    """
    if kind not in _KINDS:
        raise ValueError(f"unknown quota kind: {kind}")
    plan = _normalize_plan(plan)
    limit = _limit_for(kind, plan)
    open_result = {"ok": True, "remaining": _UNLIMITED, "used": 0, "limit": limit, "plan": plan}
    if not uid:
        # No workspace resolved (soft auth pre-cutover): nothing to meter.
        return open_result
    if limit <= 0:
        return open_result

    try:
        db = get_db()
        doc_ref = db.collection(_COLLECTION).document(uid)
        month = _current_month()
        keep = _recent_months(month)

        @firestore.transactional
        def _txn(txn):
            snap = doc_ref.get(transaction=txn)
            data = (snap.to_dict() or {}) if snap.exists else {}
            # Prune stale months so the doc can't accumulate forever.
            data = {k: v for k, v in data.items() if k in keep}
            month_map = dict(data.get(month) or {})
            current = int(month_map.get(kind, 0) or 0)
            if current + amount > limit:
                # Over the cap: do NOT increment; report nothing remaining.
                # Still persist the prune so the doc shrinks over time.
                txn.set(doc_ref, data)
                return {"ok": False, "remaining": 0, "used": current, "limit": limit, "plan": plan}
            month_map[kind] = current + amount
            data[month] = month_map
            txn.set(doc_ref, data)
            return {"ok": True, "remaining": max(0, limit - (current + amount)),
                    "used": current + amount, "limit": limit, "plan": plan}

        return _txn(db.transaction())
    except Exception as e:
        logger.warning("Quota check failed (failing open) for kind=%s: %s", kind, e)
        return open_result


def check_and_increment_quota(uid: str, kind: str, amount: int = 1, plan: str = "free"):
    """``(ok, remaining)`` view of :func:`meter`, kept for existing callers."""
    r = meter(uid, kind, amount, plan)
    return r["ok"], r["remaining"]


def quota_usage(uid: str) -> dict:
    """Current-month counters ``{"saves": n, "asks": n}`` for `uid` (read-only).

    Zeros when there is no doc yet or on any error: this feeds a meter in the
    UI, never a gate, so a failed read must not raise."""
    out = {k: 0 for k in _KINDS}
    if not uid:
        return out
    try:
        snap = get_db().collection(_COLLECTION).document(uid).get()
        if not snap.exists:
            return out
        month_map = (snap.to_dict() or {}).get(_current_month()) or {}
        for k in _KINDS:
            try:
                out[k] = max(0, int(month_map.get(k, 0) or 0))
            except (TypeError, ValueError):
                out[k] = 0
    except Exception as e:
        logger.warning("Quota usage read failed (ignored) for kind=all: %s", e)
    return out


def refund_quota(uid: str, kind: str, amount: int = 1) -> None:
    """Refund `amount` units to `uid`'s current-month `kind` counter (floor 0).

    Called when metered work FAILS server-side (5xx) so a failed save/ask doesn't
    permanently consume a unit the user never got value for. Best-effort and
    transactional: swallows+logs every error (a refund is a courtesy, never worth
    failing the response over) and never logs the uid (PII). No-op when metering
    is disabled (limit <= 0 → nothing was charged) or the counter is already 0."""
    if kind not in _KINDS or not uid:
        return
    if _metering_disabled(kind):
        # Metering disabled on every plan → the request never charged, so
        # there's nothing to refund (and no counter doc to touch).
        return

    try:
        db = get_db()
        doc_ref = db.collection(_COLLECTION).document(uid)
        month = _current_month()

        @firestore.transactional
        def _txn(txn):
            snap = doc_ref.get(transaction=txn)
            if not snap.exists:
                return
            data = snap.to_dict() or {}
            month_map = dict(data.get(month) or {})
            current = int(month_map.get(kind, 0) or 0)
            if current <= 0:
                return
            month_map[kind] = max(0, current - amount)
            data[month] = month_map
            txn.set(doc_ref, data)

        _txn(db.transaction())
    except Exception as e:
        # A failed refund must never turn into a failed request — log and move on.
        logger.warning("Quota refund failed (ignored) for kind=%s: %s", kind, e)
