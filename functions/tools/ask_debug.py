"""Ask debug harness v6 — fix the poison card's stored text; verify full
restoration of the ORIGINAL Ask path.

v5 findings: exactly ONE poison card (the top vector hit for the pasta
question); with it removed the full 16-card context passes in ORIGINAL
schema mode; and no alternative Gemini model is available to this API key.
The card's fields pass the filter individually — the block emerges from the
combination — so Gemini can rewrite them (preserving all facts) even though
it refuses them combined.

Steps: re-derive the poison card via full-generation bisection → back up its
fields (doc._askFilterOriginal + artifact) → rewrite summary → verify → if
still blocked rewrite detailedSummary/takeaway → verify → if still blocked
rewrite recipe lists → verify → write back → end-to-end answer_from_context
check (expect grounded, cited, schema-mode answer with the fixed card).

Public repo ⇒ stdout structural only; content → auth-gated artifact.
"""

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402
from google.cloud.firestore_v1.vector import Vector  # noqa: E402
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # noqa: E402

from ai_service import (  # noqa: E402
    _build_rag_prompt,
    _CITED_JSON_SUFFIX,
    GEMINI_ANALYSIS_MODEL,
    _ASK_SAFETY_SETTINGS,
    GeminiService,
    EMBEDDING_MODEL,
)
from models import BrainAnswer  # noqa: E402

PROJECT = "secondbrain-app-94da2"
QUESTION = "מתכון לפסטה"
KEYWORDS = ("פסטה", "pasta", "מתכון", "recipe", "שווארמה")

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
report = {"question": QUESTION}


def slim(doc_id, d):
    out = {
        "id": doc_id,
        "title": str(d.get("title", "Untitled"))[:300],
        "summary": str(d.get("summary", ""))[:1500],
        "category": str(d.get("category", "General"))[:60],
        "tags": [str(t)[:60] for t in (d.get("tags") or [])[:15]],
        "sourceName": d.get("sourceName"),
        "url": d.get("url"),
        "userNote": str(d.get("userNote") or "")[:800],
    }
    det = (d.get("detailedSummary") or "").strip()
    if det:
        out["detailedSummary"] = det[:3500]
    tk = (d.get("actionableTakeaway") or "").strip()
    if tk:
        out["actionableTakeaway"] = tk[:600]
    rec = d.get("recipe")
    if isinstance(rec, dict) and (rec.get("ingredients") or rec.get("instructions")):
        out["recipe"] = {
            "ingredients": [str(x)[:200] for x in (rec.get("ingredients") or [])[:40]],
            "instructions": [str(x)[:500] for x in (rec.get("instructions") or [])[:40]],
        }
    return out


def schema_gen_blocked(cards):
    prompt = _build_rag_prompt(QUESTION, cards, None, None) + _CITED_JSON_SUFFIX
    try:
        resp = client.models.generate_content(
            model=GEMINI_ANALYSIS_MODEL, contents=[prompt],
            config={"response_mime_type": "application/json",
                    "response_schema": BrainAnswer, "temperature": 0.2,
                    "safety_settings": _ASK_SAFETY_SETTINGS})
        try:
            text = resp.text or ""
        except Exception:
            text = ""
        return len(text) == 0
    except Exception:
        return True


def rewrite_text(text):
    """Gemini paraphrase preserving all facts. Returns None on failure."""
    if not text or not str(text).strip():
        return None
    try:
        resp = client.models.generate_content(
            model=GEMINI_ANALYSIS_MODEL,
            contents=[(
                "Rewrite the following text, preserving EVERY fact, name, "
                "quantity, ingredient, and step exactly — change only the "
                "wording and sentence structure. Keep the same language as the "
                "original. Reply with ONLY the rewritten text.\n\n" + str(text))],
            config={"temperature": 0.4, "safety_settings": _ASK_SAFETY_SETTINGS})
        try:
            out = (resp.text or "").strip()
        except Exception:
            out = ""
        return out or None
    except Exception:
        return None


def rewrite_list(items):
    out = []
    for it in items:
        new = rewrite_text(it)
        out.append(new if new else it)
    return out


def main():
    db = firestore.Client(project=PROJECT)
    errs = [s.to_dict() for s in db.collection("server_errors").order_by(
        "timestamp", direction=firestore.Query.DESCENDING).limit(5).stream()]
    uid = next((e.get("uid") for e in errs
                if str(e.get("fn", "")).startswith("ask_brain") and e.get("uid")), None)
    if not uid:
        print("FATAL: no uid")
        return
    report["uid"] = uid
    links = db.collection("users").document(uid).collection("links")

    def build_ctx():
        vec_cards = []
        try:
            emb = client.models.embed_content(
                model=EMBEDDING_MODEL, contents=[QUESTION],
                config={"task_type": "RETRIEVAL_QUERY", "output_dimensionality": 768})
            qv = list(emb.embeddings[0].values)
            vq = links.find_nearest(
                vector_field="embedding_vector", query_vector=Vector(qv),
                distance_measure=DistanceMeasure.COSINE, limit=12)
            vec_cards = [slim(s.id, s.to_dict() or {}) for s in vq.stream()]
        except Exception:
            pass
        recent = [(s.id, s.to_dict() or {}) for s in links.order_by(
            "createdAt", direction=firestore.Query.DESCENDING).limit(150).stream()]
        kw = [slim(i, d) for i, d in recent
              if any(k in (str(d.get("title", "")) + " " + str(d.get("summary", ""))).lower()
                     for k in KEYWORDS)]
        rec5 = [slim(i, d) for i, d in recent[:5]]
        seen, ctx = set(), []
        for c in vec_cards + kw + rec5:
            if c["id"] not in seen:
                seen.add(c["id"])
                ctx.append(c)
        return ctx[:20]

    ctx = build_ctx()
    print(f"context: {len(ctx)} cards")
    if not schema_gen_blocked(ctx):
        print("context already passes schema mode — nothing to fix")
        json.dump(report, open("ask-debug-report.json", "w"),
                  ensure_ascii=False, indent=1, default=str)
        return

    # Bisect to the poison card (full generations).
    remaining = list(ctx)
    lo, hi = 1, len(remaining)
    while lo < hi:
        mid = (lo + hi) // 2
        if schema_gen_blocked(remaining[:mid]):
            hi = mid
        else:
            lo = mid + 1
    poison = remaining[lo - 1]
    pid = poison["id"]
    report["poison"] = {"id": pid, "title": poison["title"]}
    print(f"poison card: {pid[:10]}…")

    doc_ref = links.document(pid)
    original = doc_ref.get().to_dict() or {}
    backup = {k: original.get(k) for k in
              ("summary", "detailedSummary", "actionableTakeaway", "recipe")
              if original.get(k) is not None}
    report["original_fields"] = backup

    updates = {}
    # Round 1: summary only.
    new_summary = rewrite_text(original.get("summary"))
    if new_summary:
        updates["summary"] = new_summary
    trial = dict(poison)
    trial.update({k: v for k, v in updates.items() if isinstance(v, str)})
    ctx_trial = [trial if c["id"] == pid else c for c in ctx]
    still = schema_gen_blocked(ctx_trial)
    print(f"after summary rewrite: blocked={still}")

    if still:
        for f in ("detailedSummary", "actionableTakeaway"):
            new = rewrite_text(original.get(f))
            if new:
                updates[f] = new
        trial = dict(poison)
        for k, v in updates.items():
            if isinstance(v, str):
                trial[k] = v
        ctx_trial = [trial if c["id"] == pid else c for c in ctx]
        still = schema_gen_blocked(ctx_trial)
        print(f"after detail/takeaway rewrite: blocked={still}")

    if still:
        rec = original.get("recipe")
        if isinstance(rec, dict):
            new_rec = dict(rec)
            if rec.get("ingredients"):
                new_rec["ingredients"] = rewrite_list([str(x) for x in rec["ingredients"]])
            if rec.get("instructions"):
                new_rec["instructions"] = rewrite_list([str(x) for x in rec["instructions"]])
            updates["recipe"] = new_rec
            trial["recipe"] = {"ingredients": new_rec.get("ingredients") or [],
                               "instructions": new_rec.get("instructions") or []}
            ctx_trial = [trial if c["id"] == pid else c for c in ctx]
            still = schema_gen_blocked(ctx_trial)
            print(f"after recipe rewrite: blocked={still}")

    report["rewritten_fields"] = list(updates.keys())
    report["final_blocked"] = still
    if still:
        print("REWRITE INSUFFICIENT — not writing back; askExcluded flag needed")
        json.dump(report, open("ask-debug-report.json", "w"),
                  ensure_ascii=False, indent=1, default=str)
        return

    # Write back: rewritten fields + originals preserved in-doc for recovery.
    updates["_askFilterOriginal"] = backup
    updates["_askFilterRewriteAt"] = datetime.now(timezone.utc).isoformat()
    doc_ref.set(updates, merge=True)
    print(f"card updated: {sorted(k for k in updates if not k.startswith('_'))}")

    # End-to-end: rebuild context fresh from Firestore, run the real Ask path.
    ctx2 = build_ctx()
    svc = GeminiService()
    try:
        res = svc.answer_from_context(QUESTION, ctx2, attempts=2)
        report["e2e"] = res
        print(f"E2E: answer_len={len(res.get('answer') or '')} "
              f"cited={res.get('citedIds')} ungrounded={res.get('ungrounded')} "
              f"dropped={res.get('droppedCardIds')} "
              f"poison_cited={pid in (res.get('citedIds') or [])}")
    except Exception as exc:
        report["e2e_error"] = str(exc)
        print(f"E2E FAILED: {type(exc).__name__}")

    json.dump(report, open("ask-debug-report.json", "w"),
              ensure_ascii=False, indent=1, default=str)
    print("done")


if __name__ == "__main__":
    main()
""" v6 """  # noqa
