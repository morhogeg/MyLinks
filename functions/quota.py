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

_KINDS = ("saves", "asks")

# Sentinel "remaining" when the check is disabled or fails open. Callers gate on
# `ok` only; a large number reads correctly as "plenty left".
_UNLIMITED = 1_000_000


def _limit_for(kind: str) -> int:
    """Monthly limit for `kind` from env. 0 (or negative / unparseable) disables
    the check entirely (always allow)."""
    if kind == "saves":
        raw = os.environ.get("MONTHLY_SAVE_QUOTA", "150")
    else:  # "asks"
        raw = os.environ.get("MONTHLY_ASK_QUOTA", "100")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


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


def check_and_increment_quota(uid: str, kind: str, amount: int = 1):
    """Atomically check + increment the caller's monthly `kind` counter.

    Returns ``(ok, remaining)``:
    - ``ok`` is ``False`` (and ``remaining`` 0) only when this increment would
      exceed the month's limit — the counter is then NOT incremented.
    - Otherwise ``ok`` is ``True`` and ``remaining`` is how many are left AFTER
      this increment.

    ``kind`` must be one of ``{"saves", "asks"}``. A limit of 0 disables the check
    (always allows). Prunes month-maps older than the two most recent at write
    time so the doc stays bounded.

    Fails OPEN on any Firestore error (soft cap — see module docstring): returns
    ``(True, _UNLIMITED)`` and logs a warning (never the uid — it can be PII).
    """
    if kind not in _KINDS:
        raise ValueError(f"unknown quota kind: {kind}")
    if not uid:
        # No workspace resolved (soft auth pre-cutover) — nothing to meter.
        return True, _UNLIMITED

    limit = _limit_for(kind)
    if limit <= 0:
        return True, _UNLIMITED

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
                # Over the cap — do NOT increment; report nothing remaining.
                # Still persist the prune so the doc shrinks over time.
                txn.set(doc_ref, data)
                return False, 0
            month_map[kind] = current + amount
            data[month] = month_map
            txn.set(doc_ref, data)
            return True, max(0, limit - (current + amount))

        return _txn(db.transaction())
    except Exception as e:
        logger.warning("Quota check failed (failing open) for kind=%s: %s", kind, e)
        return True, _UNLIMITED
