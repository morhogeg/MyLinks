"""Give a demo workspace a few weeks of real weekly syntheses.

The weekly synthesis only ever covers the last 7 days, so a demo account
(the App Review account, the one the App Store screenshots are taken on) has
at most one, and only after a Sunday run. This writes several past weeks at
once, each produced by the real pipeline (GeminiService.synthesize_week, then
digest_service._write_inapp_synthesis), so what the screenshots and Apple's
reviewer see is genuine output, not hand-written copy.

How the cards are split into weeks:
  * cards saved in the last 14 days become LAST week's synthesis;
  * every older card is grouped by category, and each group (3+ cards; smaller
    ones join the newest group) becomes one earlier week, newest group first.
Each doc's `createdAt` is set to the Sunday that closes its week, so the
archive orders the way a real run of Sundays would.

Never run this on a real person's workspace: it is for demo accounts only,
which is why it takes an email (the account is named on purpose) and refuses
to overwrite a week that already has a synthesis unless --force is given.

    python tools/demo_weekly_synthesis.py --email demo@example.com             # dry run
    python tools/demo_weekly_synthesis.py --email demo@example.com --apply
    python tools/demo_weekly_synthesis.py --email demo@example.com --weeks 3 --apply

Needs prod credentials and GEMINI_API_KEY (the Maintenance workflow provides
both). Public repo => stdout stays structural: week ids and card counts, the
workspace masked, never a title.
"""

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PROJECT = "secondbrain-app-94da2"
RECENT_DAYS = 14
MIN_CARDS = 3
DAY_MS = 86_400_000


def _arg(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def _ms(value) -> int:
    if isinstance(value, bool) or value is None:
        return 0
    if isinstance(value, (int, float)):
        v = int(value)
        return v * 1000 if v < 100_000_000_000 else v
    if hasattr(value, "timestamp"):
        return int(value.timestamp() * 1000)
    return 0


def iso_week_id(d: datetime) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def week_closing_sunday_ms(d: datetime) -> int:
    """18:00 UTC on the Sunday that ends d's ISO week."""
    monday = (d - timedelta(days=d.isoweekday() - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday = monday + timedelta(days=6, hours=18)
    return int(sunday.timestamp() * 1000)


def plan_weeks(cards: list, now: datetime, max_weeks: int) -> list:
    """[(week_id, closing_ms, [cards newest first])], newest week first. Pure."""
    now_ms = int(now.timestamp() * 1000)
    recent = [c for c in cards if _ms(c.get("createdAt")) >= now_ms - RECENT_DAYS * DAY_MS]
    older = [c for c in cards if c not in recent]

    by_cat = defaultdict(list)
    for c in older:
        by_cat[str(c.get("category") or "General")].append(c)
    groups = sorted(by_cat.values(), key=lambda g: max(_ms(c.get("createdAt")) for c in g), reverse=True)
    big = [g for g in groups if len(g) >= MIN_CARDS]
    small = [c for g in groups if len(g) < MIN_CARDS for c in g]
    if small:
        if big:
            big[0] = big[0] + small
        elif len(small) >= MIN_CARDS:
            big = [small]

    buckets = ([recent] if len(recent) >= MIN_CARDS else []) + big
    plan = []
    for i, bucket in enumerate(buckets[:max_weeks]):
        week_day = now - timedelta(days=7 * (i + 1))
        bucket = sorted(bucket, key=lambda c: _ms(c.get("createdAt")), reverse=True)
        plan.append((iso_week_id(week_day), week_closing_sunday_ms(week_day), bucket))
    return plan


def main() -> int:
    argv = sys.argv[1:]
    email = _arg(argv, "--email")
    if not email:
        print(__doc__)
        return 2
    weeks = int(_arg(argv, "--weeks", "4"))
    apply = "--apply" in argv
    force = "--force" in argv

    import firebase_admin
    from firebase_admin import auth as admin_auth

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})

    from db import get_db
    from log_safe import mask_uid
    from link_service import find_data_uid_by_auth_uid
    import digest_service

    auth_uid = admin_auth.get_user_by_email(email).uid
    uid = find_data_uid_by_auth_uid(auth_uid)
    if not uid:
        print("no workspace for that account")
        return 1

    cards = digest_service.fetch_candidate_links(uid)
    plan = plan_weeks(cards, datetime.now(timezone.utc), weeks)
    print(f"workspace {mask_uid(uid)}: cards={len(cards)} weeks={len(plan)} mode={'apply' if apply else 'dry-run'}")

    col = get_db().collection("users").document(uid).collection("syntheses")
    gemini = None
    rc = 0
    # Oldest first, so a failure part-way leaves the newest weeks for a re-run.
    for week_id, closing_ms, bucket in reversed(plan):
        exists = col.document(week_id).get().exists
        if exists and not force:
            print(f"{week_id}: cards={len(bucket)} exists, skipped")
            continue
        if not apply:
            print(f"{week_id}: cards={len(bucket)} would write")
            continue
        if gemini is None:
            from ai_service import GeminiService
            gemini = GeminiService()
        try:
            synth = gemini.synthesize_week(bucket)
        except Exception as e:
            print(f"{week_id}: synthesis failed ({type(e).__name__})")
            rc = 1
            continue
        if not digest_service._write_inapp_synthesis(uid, synth, bucket, week_id, pro=True):
            print(f"{week_id}: write failed")
            rc = 1
            continue
        col.document(week_id).update({"createdAt": closing_ms})
        print(f"{week_id}: cards={len(bucket)} themes={len(synth.get('themes') or [])} written")
    return rc


if __name__ == "__main__":
    sys.exit(main())
