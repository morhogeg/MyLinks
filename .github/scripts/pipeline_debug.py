"""Pipeline debug harness — 2026-08-26 analysis-stall root cause.

The sandbox can reach nothing but GitHub, so this runner (repo secrets
GEMINI_API_KEY + FIREBASE_SERVICE_ACCOUNT) is the eyes: it reads the failed
cards' real `error` strings, the task_logs trail (the last step a background
run logged before dying), pending_processing / rate_limits / usage_quotas /
server_errors state, probes Gemini with the PRODUCTION key on the exact model
and call shape the pipeline uses, and re-runs the scraper on the failed URLs.

Public repo ⇒ stdout prints structural findings only (booleans, counts, error
CLASSES, masked ids). Full detail — error strings, URLs — goes to the
auth-gated `pipeline-debug-report` artifact.

Trigger: push to `trigger/pipeline-debug` (same control channel as
trigger/testflight). DELETE with the workflow once the incident is resolved.
"""

import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "functions"))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402

PROJECT = "secondbrain-app-94da2"

report = {"generatedAt": datetime.now(timezone.utc).isoformat()}


def mask(uid):
    return (uid[:4] + "…" + uid[-2:]) if isinstance(uid, str) and len(uid) > 8 else "?"


def redact(text):
    """Strip URLs/emails so stdout stays structural on a public repo."""
    if not isinstance(text, str):
        return text
    text = re.sub(r"https?://\S+", "<url>", text)
    return re.sub(r"\S+@\S+", "<email>", text)


def section(title):
    print(f"\n=== {title} " + "=" * max(0, 60 - len(title)))


def main():
    db = firestore.Client(project=PROJECT)

    # 1. Failed cards: the error field is the actual evidence.
    section("FAILED CARDS (collection_group links, status==failed)")
    failed = list(
        db.collection_group("links")
        .where("status", "==", "failed")
        .limit(50)
        .stream()
    )
    rows = []
    for doc in failed:
        d = doc.to_dict() or {}
        rows.append({
            "path": doc.reference.path,
            "uid": doc.reference.path.split("/")[1],
            "url": d.get("url"),
            "error": d.get("error"),
            "failedAt": d.get("failedAt"),
            "sourceType": d.get("sourceType"),
        })
    rows.sort(key=lambda r: r.get("failedAt") or 0, reverse=True)
    report["failed_cards"] = rows
    print(f"count={len(rows)}")
    for r in rows[:15]:
        print(f"  uid={mask(r['uid'])} at={r['failedAt']} type={r['sourceType']} "
              f"error={redact(str(r['error']))[:160]!r}")

    # 2. Cards still stuck in processing.
    section("PROCESSING CARDS")
    proc = list(
        db.collection_group("links").where("status", "==", "processing").limit(20).stream()
    )
    report["processing_cards"] = [
        {"path": p.reference.path, **{k: (p.to_dict() or {}).get(k)
                                      for k in ("url", "processingStartedAt", "processingStage")}}
        for p in proc
    ]
    print(f"count={len(proc)}")
    for p in report["processing_cards"]:
        print(f"  uid={mask(p['path'].split('/')[1])} stage={p.get('processingStage')} started={p.get('processingStartedAt')}")

    # 3. task_logs: the last line a background run wrote before dying.
    section("TASK LOGS (newest 40)")
    logs = list(
        db.collection("task_logs")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(40)
        .stream()
    )
    log_rows = [l.to_dict() for l in logs]
    report["task_logs"] = log_rows
    for l in log_rows[:25]:
        print(f"  {l.get('timestamp')} task={str(l.get('taskId'))[:8]} {redact(str(l.get('message')))[:100]}")

    # 4. server_errors: sanitized 5xx trail.
    section("SERVER ERRORS (newest 20)")
    errs = list(
        db.collection("server_errors")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(20)
        .stream()
    )
    err_rows = [e.to_dict() for e in errs]
    report["server_errors"] = err_rows
    print(f"count={len(err_rows)}")
    for e in err_rows[:15]:
        print(f"  {e.get('timestamp')} fn={e.get('fn')} uid={mask(e.get('uid') or '')} "
              f"{redact(str(e.get('error')))[:140]}")

    # 5. Queue + limiter + quota state.
    section("PENDING_PROCESSING QUEUE")
    q = list(db.collection("pending_processing").limit(20).stream())
    report["pending_processing"] = [{"id": d.id, **(d.to_dict() or {})} for d in q]
    print(f"count={len(q)}")
    for d in report["pending_processing"]:
        print(f"  status={d.get('status')} created={d.get('createdAt')} uid={mask(d.get('uid') or '')}")

    section("RATE_LIMITS (analyze*/share*/image* buckets)")
    rl = list(db.collection("rate_limits").limit(300).stream())
    rl_rows = []
    for d in rl:
        if d.id.startswith(("analyze", "share", "image")):
            rl_rows.append({"id": d.id, **(d.to_dict() or {})})
    report["rate_limits"] = rl_rows
    print(f"matching={len(rl_rows)} of {len(rl)}")
    for d in rl_rows[:15]:
        bucket = d["id"].split(":", 1)[0]
        print(f"  bucket={bucket} idlen={len(d['id'])} data_keys={sorted(k for k in d if k != 'id')} "
              f"count={d.get('count')} window={d.get('window_start') or d.get('windowStart')}")

    section("USAGE_QUOTAS")
    uq = list(db.collection("usage_quotas").limit(20).stream())
    report["usage_quotas"] = [{"uid": d.id, **(d.to_dict() or {})} for d in uq]
    for d in uq:
        print(f"  uid={mask(d.id)} {json.dumps(d.to_dict() or {})[:120]}")

    # 6. Gemini probes with the PRODUCTION key — model list, the exact
    #    analysis call shape, and the embedding call.
    section("GEMINI PROBES")
    from ai_service import GeminiService, GEMINI_ANALYSIS_MODEL, EMBEDDING_MODEL

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"],
                          http_options={"timeout": 60000})
    probes = {}
    try:
        models = [m.name for m in client.models.list()]
        target_listed = any(GEMINI_ANALYSIS_MODEL in m for m in models)
        probes["models_listed"] = len(models)
        probes["analysis_model_listed"] = target_listed
        print(f"models.list ok: {len(models)} models; {GEMINI_ANALYSIS_MODEL} listed: {target_listed}")
    except Exception as e:
        probes["models_list_error"] = f"{type(e).__name__}: {e}"
        print(f"models.list FAILED: {type(e).__name__}: {redact(str(e))[:200]}")

    try:
        svc = GeminiService()
        analysis = svc.analyze_text(
            "OpenAI and Anthropic both released research on interpretability this week; "
            "the papers examine how large models represent concepts internally."
        )
        probes["analyze_text_ok"] = True
        probes["analyze_text_keys"] = sorted(analysis.keys())
        print(f"analyze_text OK — keys: {sorted(analysis.keys())}")
    except Exception as e:
        probes["analyze_text_error"] = f"{type(e).__name__}: {e}"
        probes["analyze_text_trace"] = traceback.format_exc()
        print(f"analyze_text FAILED: {type(e).__name__}: {redact(str(e))[:300]}")

    try:
        emb = GeminiService().embed_text("hello world")
        probes["embed_ok"] = bool(emb)
        probes["embed_dims"] = len(emb) if emb else 0
        print(f"embed_text ok={bool(emb)} dims={len(emb) if emb else 0} (model {EMBEDDING_MODEL})")
    except Exception as e:
        probes["embed_error"] = f"{type(e).__name__}: {e}"
        print(f"embed_text FAILED: {type(e).__name__}: {redact(str(e))[:200]}")
    report["gemini_probes"] = probes

    # 7. Scrape probe on the failed cards' own URLs (runner has open network).
    section("SCRAPE PROBES (failed cards' URLs)")
    from scraper import scrape_url
    scrape_results = []
    seen = set()
    for r in rows:
        u = r.get("url")
        if not u or u in seen or not u.startswith("http"):
            continue
        seen.add(u)
        if len(scrape_results) >= 4:
            break
        try:
            s = scrape_url(u)
            ok = bool((s.get("text") or s.get("html") or "").strip())
            scrape_results.append({"url": u, "ok": ok, "title": s.get("title"),
                                   "text_len": len(s.get("text") or "")})
            print(f"  ok={ok} text_len={len(s.get('text') or '')} title_len={len(s.get('title') or '')}")
        except Exception as e:
            scrape_results.append({"url": u, "ok": False, "error": f"{type(e).__name__}: {e}"})
            print(f"  FAILED: {type(e).__name__}: {redact(str(e))[:160]}")
    report["scrape_probes"] = scrape_results

    # 8. Infrastructure state — is the pipeline's plumbing alive? The newest
    #    task_log being days old + queue docs sitting `queued` for hours says
    #    process_link_background never FIRES, so inspect the GCF v2 function
    #    states, the Eventarc triggers behind Firestore/scheduled functions,
    #    and the Cloud Scheduler jobs (state + last attempt result).
    section("CLOUD FUNCTIONS v2 STATE")
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    sess = AuthorizedSession(creds)

    infra = {"functions": [], "eventarc": [], "scheduler": []}
    try:
        r = sess.get(
            f"https://cloudfunctions.googleapis.com/v2/projects/{PROJECT}/locations/-/functions",
            timeout=30)
        r.raise_for_status()
        for f in r.json().get("functions", []):
            name = f.get("name", "").split("/")[-1]
            et = f.get("eventTrigger") or {}
            row = {
                "name": name,
                "state": f.get("state"),
                "updateTime": f.get("updateTime"),
                "eventType": et.get("eventType"),
                "trigger": et.get("trigger"),
                "stateMessages": f.get("stateMessages"),
            }
            infra["functions"].append(row)
            flag = "" if f.get("state") == "ACTIVE" else "  <-- NOT ACTIVE"
            if et or f.get("state") != "ACTIVE":
                print(f"  {name}: state={f.get('state')} event={et.get('eventType')}{flag}")
                if f.get("stateMessages"):
                    print(f"    stateMessages: {json.dumps(f.get('stateMessages'))[:300]}")
    except Exception as e:
        infra["functions_error"] = f"{type(e).__name__}: {e}"
        print(f"  functions.list FAILED: {type(e).__name__}: {redact(str(e))[:200]}")

    section("EVENTARC TRIGGERS")
    for loc in ("us-central1", "nam5", "eur3"):
        try:
            r = sess.get(
                f"https://eventarc.googleapis.com/v1/projects/{PROJECT}/locations/{loc}/triggers",
                timeout=30)
            if r.status_code == 200:
                for t in r.json().get("triggers", []):
                    row = {"location": loc, "name": t.get("name", "").split("/")[-1],
                           "conditions": t.get("conditions"), "updateTime": t.get("updateTime")}
                    infra["eventarc"].append(row)
                    print(f"  [{loc}] {row['name']} conditions={json.dumps(t.get('conditions'))[:200]}")
            else:
                print(f"  [{loc}] list -> HTTP {r.status_code}")
        except Exception as e:
            print(f"  [{loc}] FAILED: {type(e).__name__}: {redact(str(e))[:120]}")

    section("CLOUD SCHEDULER JOBS")
    for loc in ("us-central1",):
        try:
            r = sess.get(
                f"https://cloudscheduler.googleapis.com/v1/projects/{PROJECT}/locations/{loc}/jobs",
                timeout=30)
            r.raise_for_status()
            for j in r.json().get("jobs", []):
                row = {"name": j.get("name", "").split("/")[-1], "state": j.get("state"),
                       "schedule": j.get("schedule"),
                       "lastAttemptTime": j.get("lastAttemptTime"),
                       "status": j.get("status")}
                infra["scheduler"].append(row)
                print(f"  {row['name']}: state={row['state']} sched={row['schedule']!r} "
                      f"lastAttempt={row['lastAttemptTime']} status={json.dumps(row['status'])[:120]}")
        except Exception as e:
            infra["scheduler_error"] = f"{type(e).__name__}: {e}"
            print(f"  scheduler.list FAILED: {type(e).__name__}: {redact(str(e))[:200]}")
    report["infra"] = infra

    # 9. Cloud Logging — the actual crash. Scheduler reports code 13 (INTERNAL)
    #    for sweep_stuck_processing/send_digests and process_link_background
    #    never logs a start, so pull the ERROR-severity log entries for those
    #    Cloud Run services (+ eventarc delivery failures) from the last 3 days.
    section("CLOUD RUN ERROR LOGS (last 3 days)")
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    log_filter = (
        f'timestamp >= "{since}" AND severity >= ERROR AND '
        'resource.type = "cloud_run_revision" AND '
        'resource.labels.service_name = ('
        '"process-link-background" OR "sweep-stuck-processing" OR '
        '"send-digests" OR "check-reminders" OR "sync-link-embedding" OR "analyze-link")'
    )
    entries = []
    try:
        body = {"resourceNames": [f"projects/{PROJECT}"], "filter": log_filter,
                "orderBy": "timestamp desc", "pageSize": 60}
        r = sess.post("https://logging.googleapis.com/v2/entries:list",
                      json=body, timeout=45)
        r.raise_for_status()
        for e in r.json().get("entries", []):
            svc = ((e.get("resource") or {}).get("labels") or {}).get("service_name")
            msg = e.get("textPayload")
            if msg is None and isinstance(e.get("jsonPayload"), dict):
                msg = e["jsonPayload"].get("message") or json.dumps(e["jsonPayload"])
            entries.append({"ts": e.get("timestamp"), "service": svc,
                            "severity": e.get("severity"), "message": msg})
        print(f"entries={len(entries)}")
        seen_msgs = set()
        for e in entries:
            key = (e["service"], str(e["message"])[:80])
            if key in seen_msgs:
                continue
            seen_msgs.add(key)
            print(f"  {e['ts']} [{e['service']}] {e['severity']}: {redact(str(e['message']))[:260]}")
    except Exception as e:
        entries.append({"error": f"{type(e).__name__}: {e}"})
        print(f"  entries.list FAILED: {type(e).__name__}: {redact(str(e))[:300]}")
    report["error_logs"] = entries

    json.dump(report, open("pipeline-debug-report.json", "w"),
              indent=2, ensure_ascii=False, default=str)
    print("\nreport written: pipeline-debug-report.json")


if __name__ == "__main__":
    main()
