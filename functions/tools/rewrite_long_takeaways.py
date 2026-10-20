"""Shorten the Revisit "Do this" tasks saved before the two-row rule.

A card's task is its actionable takeaway (`metadata.actionableTakeaway`).
Cards analyzed before 2026-10-20 carry tasks of up to 36 words, three to five
rows in Revisit on an iPhone (owner: "looks super busy, make each item 1-2 rows
max"). New saves follow the tighter rule (ai_service.TAKEAWAY_RULE_BULLETS: one
verb-first sentence of about 14 words, built on one concrete detail), but
nothing re-analyzes an old card. This rewrites each over-long open task from
the card's own stored title, summary and detailedSummary, under that same
rule, through GeminiService.rewrite_takeaway.

What it changes, and what it leaves alone:
  * Only a task that doesn't fit two rows (ai_service.takeaway_fits: over 80
    characters or 15 words) and is still OPEN. A done or "Not for me" task
    keeps its words: it is history, shown in the collapsed Done list.
  * Never the demo account (App Review, App Store screenshots), whose tasks
    were set by hand; never a private card (its own flag or a private
    collection), whose text stays away from the model; never a saved Ask
    answer or a card still processing.
  * The old task is kept in `metadata.takeawayRewrite` ({prev, new, at}),
    which also marks the card as done, so a re-run skips it and --revert puts
    every old task back (unless the task changed again since).
  * A write only lands if the card is unchanged since it was read; a model
    answer that is still too long, switches language or declines leaves the
    card as it was. Each is counted.
  * The takeaway is part of the card's embedding text, but cards are NOT
    re-embedded: the action is the same, and re-embedding many cards at once
    would spend the shared embed budget that new saves need.

    python tools/rewrite_long_takeaways.py --all                 # dry run: counts only, no Gemini
    python tools/rewrite_long_takeaways.py --uid <uid>           # one workspace
    python tools/rewrite_long_takeaways.py --all --preview 30    # + draft 30 rewrites to an admin-only doc
    python tools/rewrite_long_takeaways.py --all --apply
    python tools/rewrite_long_takeaways.py --all --revert        # dry run of putting old tasks back
    python tools/rewrite_long_takeaways.py --all --revert --apply
    python tools/rewrite_long_takeaways.py --selftest [--repeat 3]

Needs prod credentials and GEMINI_API_KEY (the Maintenance workflow provides
both). Public repo => stdout stays structural: counts, lengths and masked
workspaces, never a title or a task. Two deliberate exceptions: --selftest
prints the model's tasks for the made-up sample articles at the bottom of this
file (no user data), and --preview writes real before/after pairs to
`migrations/takeaway_rewrite_preview`, which no client rule can read (Admin SDK
only; read it in the console or with the Firebase MCP). An --apply run deletes
that doc when it finishes.
"""

import os
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PROJECT = "secondbrain-app-94da2"
# Resolved to its workspace at run time; the run aborts if that fails, so the
# hand-set screenshot tasks can never be rewritten by accident.
DEMO_EMAILS = ("machinareviewer@gmail.com",)
MARKER = "takeawayRewrite"
PREVIEW_DOC = ("migrations", "takeaway_rewrite_preview")
MAX_PREVIEW = 50
WORKERS = 6
FIELDS = ["title", "summary", "detailedSummary", "status", "captureType", "createdAt",
          "isPrivate", "collectionIds", "takeawayDoneAt", "takeawayDismissedAt",
          "actionableTakeaway", "metadata.actionableTakeaway", f"metadata.{MARKER}"]


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


def _meta(data: dict) -> dict:
    meta = data.get("metadata")
    return meta if isinstance(meta, dict) else {}


def displayed_task(data: dict) -> str:
    """The task Revisit shows: a top-level value first, else metadata's
    (web/lib/takeaway.ts getActionableTakeaway)."""
    for value in (data.get("actionableTakeaway"), _meta(data).get("actionableTakeaway")):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _closed(data: dict) -> bool:
    """Done or "Not for me" (web/lib/takeaway.ts isTakeawayDone/Dismissed)."""
    return any(isinstance(data.get(k), (int, float)) and not isinstance(data.get(k), bool)
               and data.get(k) > 0 for k in ("takeawayDoneAt", "takeawayDismissedAt"))


def classify(data: dict, private_ids) -> str:
    """Why a card's task is or isn't rewritten. Pure.

    "no_task" and "fits" are the common cases; every other answer is about a
    task too long for two rows: "candidate", or the reason it is skipped.
    `private_ids` is search.private_collection_ids' answer (None fails closed).
    """
    from ai_service import takeaway_fits
    from models import UNANALYZED_STATUSES
    from search import is_effectively_private

    task = displayed_task(data)
    if not task:
        return "no_task"
    if takeaway_fits(task):
        return "fits"
    if isinstance(data.get("actionableTakeaway"), str) and data["actionableTakeaway"].strip():
        return "top_level"  # an old flattened shape nothing writes today; left alone
    if isinstance(_meta(data).get(MARKER), dict):
        return "rewritten_before"
    if str(data.get("captureType")) == "answer":
        return "answer"
    if data.get("status") in UNANALYZED_STATUSES:
        return "unsettled"
    if _closed(data):
        return "closed"
    if is_effectively_private(data, private_ids):
        return "private"
    if not (str(data.get("summary") or "").strip() or str(data.get("detailedSummary") or "").strip()):
        return "no_source"
    return "candidate"


def revert_action(data: dict) -> str:
    """For --revert: "restore" when the task is still the one this tool wrote,
    "changed_since" when something rewrote it after, "" when never rewritten."""
    marker = _meta(data).get(MARKER)
    if not isinstance(marker, dict) or not isinstance(marker.get("prev"), str):
        return ""
    return "restore" if _meta(data).get("actionableTakeaway") == marker.get("new") else "changed_since"


def _stats(texts) -> str:
    """Length percentiles for a set of tasks: structural, never the text."""
    if not texts:
        return "none"
    words = sorted(len(t.split()) for t in texts)
    chars = sorted(len(t) for t in texts)

    def pct(xs, p):
        return xs[min(len(xs) - 1, int(p * len(xs)))]
    return (f"n={len(texts)} words p50={pct(words, .5)} p90={pct(words, .9)} max={words[-1]}; "
            f"chars p50={pct(chars, .5)} p90={pct(chars, .9)} max={chars[-1]}")


_local = threading.local()


def _gemini():
    if not hasattr(_local, "svc"):
        from ai_service import GeminiService
        _local.svc = GeminiService()
    return _local.svc


def _rewrite(card: dict, previous: str):
    try:
        return _gemini().rewrite_takeaway(card, previous)
    except Exception:
        return None, "error"


# ── selftest ─────────────────────────────────────────────────────────────────

def selftest(repeat: int) -> int:
    """Run the real analysis prompt (analyze_text, what every text save uses)
    and the rewrite on the made-up samples below, and print what comes back.
    Exit 1 when a task breaks the two-row rule, a language, or appears where
    the content supports none."""
    from ai_service import GeminiService, takeaway_fits, text_script

    svc = GeminiService()
    fails = Counter()
    runs = Counter()

    def check(task: str, script: str) -> str:
        if "—" in task:
            return "EM DASH"
        if text_script(task) != script:
            return "LANGUAGE"
        if not takeaway_fits(task):
            return "TOO LONG"
        return "ok"

    for name, expect_task, text in SAMPLE_ARTICLES:
        for _ in range(repeat):
            runs["analysis"] += 1
            try:
                task = str(svc.analyze_text(text).get("actionableTakeaway") or "").strip()
            except Exception as e:
                print(f"[analysis] {name}: ERROR {type(e).__name__}")
                fails["analysis"] += 1
                continue
            if not task:
                verdict = "ok" if not expect_task else "NO TASK"
                print(f"[analysis] {name}: (no task) {verdict}")
            else:
                verdict = check(task, text_script(text)) if expect_task else "UNEXPECTED TASK"
                print(f'[analysis] {name}: "{task}" words={len(task.split())} chars={len(task)} {verdict}')
            fails["analysis"] += verdict != "ok"

    for name, card, previous in SAMPLE_LEGACY_CARDS:
        for _ in range(repeat):
            runs["rewrite"] += 1
            task, reason = _rewrite(card, previous)
            verdict = check(task, text_script(previous)) if task else reason.upper()
            shown = f'"{task}" words={len(task.split())} chars={len(task)}' if task else "(none)"
            print(f"[rewrite] {name}: {shown} {verdict}")
            fails["rewrite"] += verdict != "ok"

    print(f"selftest: analysis {runs['analysis'] - fails['analysis']}/{runs['analysis']} ok, "
          f"rewrite {runs['rewrite'] - fails['rewrite']}/{runs['rewrite']} ok")
    return 1 if sum(fails.values()) else 0


# ── production run ───────────────────────────────────────────────────────────

def _demo_workspaces() -> set:
    from firebase_admin import auth as admin_auth
    from link_service import find_data_uid_by_auth_uid

    out = set()
    for email in DEMO_EMAILS:
        auth_uid = admin_auth.get_user_by_email(email).uid  # raises => the run aborts
        out.add(auth_uid)
        data_uid = find_data_uid_by_auth_uid(auth_uid)
        if data_uid:
            out.add(data_uid)
    return out


def main() -> int:
    argv = sys.argv[1:]
    if "--selftest" in argv:
        return selftest(max(1, int(_arg(argv, "--repeat", "1"))))
    uid = _arg(argv, "--uid")
    if not uid and "--all" not in argv:
        print(__doc__)
        return 2
    apply = "--apply" in argv
    revert = "--revert" in argv
    preview = min(MAX_PREVIEW, max(0, int(_arg(argv, "--preview", "0"))))
    if preview and (apply or revert):
        print("--preview is a dry-run option")
        return 2

    import firebase_admin
    from firebase_admin import firestore
    from google.api_core import exceptions as gexc
    from log_safe import mask_uid
    from search import private_collection_ids

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": PROJECT})
    db = firestore.client()

    try:
        demo = _demo_workspaces()
    except Exception as e:
        print(f"demo account lookup failed ({type(e).__name__}); refusing to run")
        return 1
    if uid in demo:
        print("that is the demo workspace; its tasks are hand-set and never rewritten")
        return 2
    uids = [uid] if uid else [r.id for r in db.collection("users").list_documents()]
    uids = [u for u in uids if u not in demo]
    mode = ("revert-" if revert else "") + ("apply" if apply else "dry-run")
    print(f"mode={mode} workspaces={len(uids)} demo_excluded={len(demo)}")

    totals = Counter()
    long_now = []          # every over-long task's text, for length stats only
    jobs = []              # (uid, snap, data, task) for candidates
    restores = []          # (uid, snap, marker) for --revert
    rc = 0
    for u in uids:
        c = Counter()
        try:
            private_ids = None
            private_read = False
            links = db.collection("users").document(u).collection("links")
            for snap in links.select(FIELDS).stream():
                data = snap.to_dict() or {}
                c["cards"] += 1
                if revert:
                    action = revert_action(data)
                    if action:
                        c[action] += 1
                        if action == "restore":
                            restores.append((u, snap, _meta(data)[MARKER]))
                    continue
                if not private_read and data.get("collectionIds"):
                    private_ids, private_read = private_collection_ids(u, db=db), True
                kind = classify(data, private_ids)
                if kind == "no_task":
                    continue
                c["tasks"] += 1
                if kind == "fits":
                    continue
                c["long"] += 1
                c[kind] += 1
                long_now.append(displayed_task(data))
                if kind == "candidate":
                    jobs.append((u, snap, data, displayed_task(data)))
        except Exception as e:  # keep going; one bad workspace must not stop the rest
            print(f"workspace {mask_uid(u)} failed: {type(e).__name__}")
            rc = 1
            continue
        totals.update(c)
        if revert and (c["restore"] or c["changed_since"]):
            print(f"workspace {mask_uid(u)}: cards={c['cards']} restore={c['restore']} "
                  f"changed_since={c['changed_since']}")
        elif not revert and c["long"]:
            print(f"workspace {mask_uid(u)}: cards={c['cards']} tasks={c['tasks']} long={c['long']} "
                  f"candidates={c['candidate']} (closed={c['closed']} private={c['private']} "
                  f"answer={c['answer']} unsettled={c['unsettled']} no_source={c['no_source']} "
                  f"top_level={c['top_level']} rewritten_before={c['rewritten_before']})")

    if revert:
        print(f"total: cards={totals['cards']} restore={totals['restore']} changed_since={totals['changed_since']}")
        if apply:
            done = Counter()
            for u, snap, marker in restores:
                try:
                    snap.reference.update(
                        {"metadata.actionableTakeaway": marker["prev"],
                         f"metadata.{MARKER}": firestore.DELETE_FIELD},
                        option=db.write_option(last_update_time=snap.update_time))
                    done["restored"] += 1
                except gexc.FailedPrecondition:
                    done["changed"] += 1
                except Exception:
                    done["error"] += 1
            print(f"reverted: restored={done['restored']} changed={done['changed']} error={done['error']}")
            rc = rc or (1 if done["error"] else 0)
        return rc

    print(f"total: cards={totals['cards']} tasks={totals['tasks']} long={totals['long']} "
          f"candidates={totals['candidate']} (closed={totals['closed']} private={totals['private']} "
          f"answer={totals['answer']} unsettled={totals['unsettled']} no_source={totals['no_source']} "
          f"top_level={totals['top_level']} rewritten_before={totals['rewritten_before']})")
    print(f"long tasks now: {_stats(long_now)}")

    if not apply and not preview:
        return rc

    if preview:
        # Newest first per workspace, then round-robin, so one big library
        # doesn't fill the whole sample.
        by_ws = {}
        for job in sorted(jobs, key=lambda j: _ms(j[2].get("createdAt")), reverse=True):
            by_ws.setdefault(job[0], []).append(job)
        picked = []
        while len(picked) < preview and any(by_ws.values()):
            for q in by_ws.values():
                if q and len(picked) < preview:
                    picked.append(q.pop(0))
        jobs = picked

    def work(job):
        u, snap, data, previous = job
        task, reason = _rewrite(data, previous)
        if task is None or preview:
            return job, task, reason
        try:
            snap.reference.update(
                {"metadata.actionableTakeaway": task,
                 f"metadata.{MARKER}": {"prev": previous, "new": task, "at": int(time.time() * 1000)}},
                option=db.write_option(last_update_time=snap.update_time))
            return job, task, "ok"
        except gexc.FailedPrecondition:
            return job, None, "changed"
        except Exception:
            return job, None, "write_error"

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(work, jobs))

    outcome = Counter(reason for _, _, reason in results)
    new_tasks = [task for _, task, reason in results if reason == "ok"]
    verb = "drafted" if preview else "rewritten"
    print(f"{verb}={outcome['ok']} declined={outcome['declined']} too_long={outcome['too_long']} "
          f"language={outcome['language']} em_dash={outcome['em_dash']} changed={outcome['changed']} "
          f"error={outcome['error'] + outcome['write_error']}")
    print(f"new tasks: {_stats(new_tasks)}")

    doc = db.collection(PREVIEW_DOC[0]).document(PREVIEW_DOC[1])
    if preview:
        doc.set({
            "createdAt": int(time.time() * 1000),
            "note": "Drafts from tools/rewrite_long_takeaways.py --preview; nothing was written to cards.",
            "items": [{"workspace": job[0], "card": job[1].id, "old": job[3], "new": task, "outcome": reason}
                      for job, task, reason in results],
        })
        print(f"preview: {len(results)} drafts in {'/'.join(PREVIEW_DOC)} (admin-only)")
    else:
        doc.delete()
    if outcome["error"] or outcome["write_error"]:
        rc = 1
    return rc


# ── made-up samples for --selftest (no user data) ────────────────────────────

SAMPLE_ARTICLES = [
    ("caffeine", True, """Why your morning coffee should wait

Most people reach for coffee the moment they wake up, but sleep researchers suggest holding off. In the first hour after waking, the body's own cortisol is near its daily peak, so caffeine adds little alertness then. Waiting 90 to 120 minutes lets adenosine, the molecule that builds sleep pressure, rise again, and adenosine is what caffeine actually blocks. Timing at the other end matters too: caffeine has a half-life of about five to six hours, so half of a 3 PM espresso is still in your bloodstream at 9 PM. The researchers recommend a cutoff around eight hours before bedtime, which for most people means no caffeine after 2 PM."""),
    ("grayscale", True, """The grayscale trick for a calmer phone

App icons and notification badges come in bright, saturated colors because color grabs attention. Turning the whole screen gray removes that pull. Both iOS and Android have a grayscale setting in their accessibility menus; on iPhone it is under Display & Text Size, Color Filters. In a small university experiment, students who used grayscale mode for two weeks cut their daily screen time by about 40 minutes on average, and many said social apps felt duller and easier to close. Adding the filter to the Accessibility Shortcut lets a triple-click of the side button bring color back when you need it, for example to edit photos."""),
    ("recipe", True, """Spaghetti al limone (serves 2)

Ingredients: 200 g spaghetti, 1 large lemon (zest and juice), 40 g butter, 50 g finely grated Parmigiano Reggiano, black pepper, salt.

Steps: 1. Boil the spaghetti in well-salted water until just shy of al dente. 2. Before draining, save a full cup of the starchy pasta water. 3. Melt the butter with the lemon zest in a wide pan over low heat. 4. Add the drained pasta, half the lemon juice and a splash of pasta water, and toss. 5. Take the pan off the heat and add the cheese gradually, tossing hard and adding pasta water until the sauce turns glossy. The starch in the water is what keeps the cheese from clumping."""),
    ("travel", True, """Eating your way through Tokyo: practical tips

The outer market at Tsukiji still draws crowds even though the wholesale fish market moved to Toyosu in 2018. Stalls open around 5 AM and the best tamagoyaki and grilled scallops sell out before 9, so arrive early. Several small schools near the market run two-hour sushi-making classes in English; they cap groups at eight people and often fill up three to four weeks ahead, so book before your trip. Many stalls take cash only. For dinner, the narrow alleys of Omoide Yokocho in Shinjuku have tiny yakitori counters that seat six to ten people."""),
    ("news", False, """City council approves new river bridge

The city council voted 7 to 2 on Tuesday to approve funding for a new pedestrian bridge over the river, ending a debate that lasted more than two years. The bridge will cost an estimated 48 million dollars, about half of it from a regional transport grant. Construction is scheduled to begin next spring and take roughly 30 months. Two council members who voted against the plan said the money should go to road repairs instead. The mayor called the vote a milestone for the waterfront district."""),
    ("hebrew_sleep", True, """איך לישון טוב יותר בלילות חמים

חוקרי שינה ממליצים לשמור על חדר השינה בטמפרטורה של 18 עד 20 מעלות. כשהגוף נרדם, טמפרטורת הליבה שלו יורדת, וחדר חם מדי מקשה על הירידה הזאת ומוביל ליקיצות באמצע הלילה. מקלחת חמה כשעה לפני השינה עוזרת דווקא לקרר את הגוף, כי הדם זורם אל העור ומשחרר חום. כדאי גם להחשיך את החדר לגמרי ולהשאיר את הטלפון מחוץ לחדר. מי שמתקשה להירדם יכול לנסות לקום באותה שעה בכל בוקר, גם בסופי שבוע, כדי לייצב את השעון הביולוגי."""),
    ("savings", True, """Pay yourself first, automatically

The most reliable way to save is to never see the money. Set up an automatic transfer that moves a fixed share of your salary, many planners suggest 10 to 15 percent, into a separate savings account on the day your paycheck lands. Because the transfer happens before you can spend, you adjust your spending to what is left, instead of saving whatever remains at the end of the month, which is usually nothing. Keep the savings account at a different bank so it is slightly inconvenient to dip into, and raise the percentage by one point with every raise."""),
    ("two_minute_rule", True, """The two-minute rule against procrastination

The two-minute rule has two parts. First, if a task takes less than two minutes, such as answering a short email or putting a dish in the dishwasher, do it right away instead of adding it to a list. Second, when a big habit feels overwhelming, shrink its start to two minutes: "read before bed" becomes "read one page", and "go running" becomes "put on your running shoes". The point is not the two minutes themselves but making the first step so easy that you cannot say no. Once started, most people keep going well past the two minutes."""),
]

SAMPLE_LEGACY_CARDS = [
    ("coffee", {
        "title": "Why your morning coffee should wait",
        "summary": "Cortisol peaks in the first hour after waking, so **caffeine** adds little then.\n\nWaiting **90 to 120 minutes** and stopping **8 hours before bed** protects sleep.",
        "detailedSummary": "## Key Points\n- **Cortisol** is near its daily peak in the first hour after waking.\n- Waiting **90 to 120 minutes** lets **adenosine** rise, which is what caffeine blocks.\n- Caffeine's **half-life** is about **5 to 6 hours**.\n- A cutoff **8 hours before bedtime** usually means no caffeine after **2 PM**.",
    }, "Consider delaying your first cup of coffee by 90 to 120 minutes after waking up and avoid consuming caffeine late in the afternoon, ideally stopping around 2 PM, to support better sleep quality and steadier energy levels."),
    ("hebrew_sleep", {
        "title": "איך לישון טוב יותר בלילות חמים",
        "summary": "חוקרי שינה ממליצים על חדר שינה ב-**18 עד 20 מעלות**.\n\n**מקלחת חמה** כשעה לפני השינה עוזרת לקרר את הגוף.",
        "detailedSummary": "## נקודות עיקריות\n- טמפרטורה של **18 עד 20 מעלות** בחדר השינה.\n- **מקלחת חמה** כשעה לפני השינה מקררת את הגוף.\n- **חושך מלא** וטלפון מחוץ לחדר.\n- קימה באותה שעה בכל בוקר, גם ב**סופי שבוע**.",
    }, "שמרו על טמפרטורה של 18 עד 20 מעלות בחדר השינה, התקלחו במים חמים כשעה לפני השינה, החשיכו את החדר והשאירו את הטלפון מחוצה לו כדי לשפר את איכות השינה שלכם."),
    ("pasta", {
        "title": "Spaghetti al limone",
        "summary": "A two-person **spaghetti al limone** built on butter, lemon zest and **Parmigiano Reggiano**.\n\nThe sauce turns glossy thanks to **starchy pasta water** added off the heat.",
        "detailedSummary": "## Ingredients\n- 200 g spaghetti\n- 1 large lemon\n- 40 g butter\n- 50 g Parmigiano Reggiano\n## Steps\n1. Boil the spaghetti until just shy of al dente.\n2. Save a full cup of **pasta water** before draining.\n3. Melt the butter with the lemon zest.\n4. Toss the pasta with half the juice and a splash of water.\n5. Off the heat, add the cheese gradually with more water until glossy.",
    }, "When making a lemon pasta sauce, remember to reserve a full cup of the starchy pasta water before draining and add it gradually together with the cheese off the heat so that the sauce turns glossy instead of clumpy."),
]


if __name__ == "__main__":
    sys.exit(main())
