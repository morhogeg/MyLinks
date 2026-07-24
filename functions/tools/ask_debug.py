"""Ask debug harness v2 — end-to-end against PRODUCTION, from CI.

v1 (probe-only) proved: the ask model id 404'd, and the schema-mode call is
what false-positives PROHIBITED_CONTENT on content that passes plain. The
deployed fix (plain-mode rescue) still fails the real pasta ask, so v2 closes
the two reproduction gaps:
 1. calls the REAL deployed ask_brain endpoint (CI has egress; a cloud session
    doesn't) so the true retrieval context + ladder run, then reads the fresh
    server_errors records to see exactly which stage died;
 2. runs mode experiments with FULL generation (not 1-token probes): a blocked
    CANDIDATE (finish_reason on output) is invisible to input-only probes.

Public repo ⇒ stdout prints only structural findings + our own static stage
markers. Full detail goes to the auth-gated artifact.
"""

import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402

from ai_service import (  # noqa: E402
    _build_rag_prompt,
    _CITED_JSON_SUFFIX,
    GEMINI_ANALYSIS_MODEL,
    _ASK_SAFETY_SETTINGS,
)
from models import BrainAnswer  # noqa: E402

PROJECT = "secondbrain-app-94da2"
ASK_URL = f"https://us-central1-{PROJECT}.cloudfunctions.net/ask_brain"
QUESTION = "מתכון לפסטה"

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
report = {"question": QUESTION}


def gen_outcome(model, prompt, config):
    """One full generation; returns structural outcome only."""
    try:
        resp = client.models.generate_content(model=model, contents=[prompt],
                                              config=config)
        fb = getattr(resp, "prompt_feedback", None)
        block = getattr(fb, "block_reason", None) if fb else None
        cands = getattr(resp, "candidates", None) or []
        finish = getattr(cands[0], "finish_reason", None) if cands else None
        try:
            text = resp.text or ""
        except Exception:
            text = ""
        return {"block_reason": str(block) if block else None,
                "finish_reason": str(finish) if finish else None,
                "text_len": len(text), "text": text[:2000]}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:300]}"}


def stage_markers(msg: str) -> list:
    """Extract only OUR static markers from an error message — safe to print."""
    out = []
    if "in plain mode" in msg:
        out.append("plain-mode")
    for m in re.findall(r"\[stage: [^\]]{0,120}\]", msg):
        out.append(m)
    if "block_reason" in msg:
        out.append("has-block_reason")
    if "finish_reason" in msg:
        out.append("has-finish_reason")
    if "404" in msg:
        out.append("has-404")
    return out


def fetch_server_errors(db, n=25):
    return [{**snap.to_dict(), "_doc": snap.id} for snap in
            db.collection("server_errors").order_by(
                "timestamp", direction=firestore.Query.DESCENDING).limit(n).stream()]


def main():
    db = firestore.Client(project=PROJECT)

    # 1. Existing trail: which ladder stages have been dying?
    errs = fetch_server_errors(db)
    report["server_errors_before"] = errs
    print(f"server_errors: {len(errs)} records")
    for e in errs[:12]:
        print(f"  {e.get('timestamp', '')[:19]} {e.get('fn')} {e.get('type')} "
              f"markers={stage_markers(str(e.get('error', '')))}")

    uid = next((e.get("uid") for e in errs
                if str(e.get("fn", "")).startswith("ask_brain") and e.get("uid")), None)
    if not uid:
        print("FATAL: no uid")
        json.dump(report, open("ask-debug-report.json", "w"),
                  ensure_ascii=False, indent=1, default=str)
        return
    report["uid"] = uid

    # 2. END-TO-END: the real deployed endpoint, real retrieval, real ladder.
    body = json.dumps({"uid": uid, "question": QUESTION}).encode()
    req = urllib.request.Request(
        ASK_URL, data=body, headers={"Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            status, payload = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        status, payload = e.code, e.read().decode()
    except Exception as e:
        status, payload = -1, f"{type(e).__name__}: {e}"
    report["e2e"] = {"status": status, "body": payload[:4000]}
    try:
        pj = json.loads(payload)
    except Exception:
        pj = {}
    if status == 200 and pj.get("success"):
        print(f"E2E ask: 200 success — answer_len={len(pj.get('answer') or '')} "
              f"cited={len(pj.get('citedIds') or [])} "
              f"ungrounded={pj.get('ungrounded')} "
              f"dropped={pj.get('droppedCardIds')}")
    else:
        print(f"E2E ask: status={status} markers={stage_markers(payload)}")

    # 3. Fresh trail records created by the E2E call.
    time.sleep(3)
    after = fetch_server_errors(db, 5)
    report["server_errors_after"] = after
    for e in after[:5]:
        print(f"  post-e2e {e.get('fn')} {e.get('type')} "
              f"markers={stage_markers(str(e.get('error', '')))}")

    # 4. Mode experiments on the newest-25 context (FULL generation, not
    #    1-token probes — a killed CANDIDATE is invisible to input probes).
    docs = list(db.collection("users").document(uid).collection("links")
                .order_by("createdAt", direction=firestore.Query.DESCENDING)
                .limit(25).stream())
    cards = []
    for s in docs:
        d = s.to_dict() or {}
        c = {"id": s.id, "title": str(d.get("title", ""))[:300],
             "summary": str(d.get("summary", ""))[:1500],
             "category": d.get("category"), "tags": d.get("tags"),
             "sourceName": d.get("sourceName"), "url": d.get("url")}
        det = (d.get("detailedSummary") or "").strip()
        if det:
            c["detailedSummary"] = det[:3500]
        rec = d.get("recipe")
        if isinstance(rec, dict):
            c["recipe"] = rec
        cards.append(c)
    prompt = _build_rag_prompt(QUESTION, cards[:20], None, None) + _CITED_JSON_SUFFIX

    schema_cfg = {"response_mime_type": "application/json",
                  "response_schema": BrainAnswer, "temperature": 0.2,
                  "safety_settings": _ASK_SAFETY_SETTINGS}
    plain_cfg = {"temperature": 0.2, "safety_settings": _ASK_SAFETY_SETTINGS}

    for name, cfg in (("schema_mode_full", schema_cfg), ("plain_mode_full", plain_cfg)):
        out = gen_outcome(GEMINI_ANALYSIS_MODEL, prompt, cfg)
        report[name] = out
        print(f"{name}: block={out.get('block_reason')} finish={out.get('finish_reason')} "
              f"text_len={out.get('text_len')} err={out.get('error')}")

    json.dump(report, open("ask-debug-report.json", "w"),
              ensure_ascii=False, indent=1, default=str)
    print("done — full detail in artifact")


if __name__ == "__main__":
    main()
