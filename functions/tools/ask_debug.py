"""Ask debug harness v5 — model sweep + full-generation poison bisection.

Goal: restore IDENTICAL-to-before Ask behavior. Two levers, both measured
with FULL generations (probe verdicts proven unreliable):
 1. MODEL SWEEP — the content filter is model-specific: find an available
    Gemini model that passes the real failing context in FULL schema mode.
    If one passes, a one-line GEMINI_ASK_MODEL change restores everything.
 2. POISON BISECTION — prefix-bisect the failing context with full
    generations on the baseline model to name the exact poison card(s).

Public repo ⇒ stdout structural only; ids/titles/answers → artifact.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402
from google.cloud.firestore_v1.vector import Vector  # noqa: E402
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # noqa: E402

import ai_service  # noqa: E402
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


def full_gen(model, prompt, schema=True):
    cfg = ({"response_mime_type": "application/json", "response_schema": BrainAnswer,
            "temperature": 0.2, "safety_settings": _ASK_SAFETY_SETTINGS}
           if schema else
           {"temperature": 0.2, "safety_settings": _ASK_SAFETY_SETTINGS})
    try:
        resp = client.models.generate_content(model=model, contents=[prompt], config=cfg)
        fb = getattr(resp, "prompt_feedback", None)
        block = getattr(fb, "block_reason", None) if fb else None
        cands = getattr(resp, "candidates", None) or []
        finish = getattr(cands[0], "finish_reason", None) if cands else None
        try:
            text = resp.text or ""
        except Exception:
            text = ""
        return {"block": str(block) if block else None,
                "finish": str(finish) if finish else None,
                "len": len(text), "text": text[:800]}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}


def main():
    db = firestore.Client(project=PROJECT)
    errs = [{**s.to_dict(), "_doc": s.id} for s in
            db.collection("server_errors").order_by(
                "timestamp", direction=firestore.Query.DESCENDING).limit(5).stream()]
    uid = next((e.get("uid") for e in errs
                if str(e.get("fn", "")).startswith("ask_brain") and e.get("uid")), None)
    if not uid:
        print("FATAL: no uid")
        return
    report["uid"] = uid
    links = db.collection("users").document(uid).collection("links")

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
    except Exception as e:
        print(f"vector retrieval failed: {type(e).__name__}")
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
    ctx = ctx[:20]
    report["context_ids"] = [(c["id"], c["title"]) for c in ctx]
    print(f"context: {len(ctx)} cards")
    prompt = _build_rag_prompt(QUESTION, ctx, None, None) + _CITED_JSON_SUFFIX

    # 1. MODEL SWEEP — which available models pass the full schema context?
    try:
        available = [m.name.replace("models/", "") for m in client.models.list()
                     if "gemini" in m.name and "embedding" not in m.name]
    except Exception as e:
        available = []
        print(f"ListModels failed: {type(e).__name__}: {str(e)[:120]}")
    report["available_models"] = available
    print(f"available gemini models: {len(available)}")
    seen_m, candidates = set(), []
    for m in [GEMINI_ANALYSIS_MODEL] + available:
        base = m.split("-preview")[0]
        if m not in seen_m and base not in seen_m and "latest" not in m and "exp" not in m:
            seen_m.add(m)
            seen_m.add(base)
            candidates.append(m)
    candidates = candidates[:10]
    passing = []
    report["model_sweep"] = {}
    for m in candidates:
        out = full_gen(m, prompt, schema=True)
        report["model_sweep"][m] = out
        verdict = "PASS" if (out.get("len") or 0) > 0 else "FAIL"
        if verdict == "PASS":
            passing.append(m)
        print(f"model {m}: {verdict} block={out.get('block')} "
              f"finish={out.get('finish')} len={out.get('len')} err={out.get('error')}")

    # 2. Verify end-to-end with the best passing model patched in.
    if passing:
        best = passing[0]
        ai_service.GEMINI_ASK_MODEL = best
        svc = GeminiService()
        try:
            res = svc.answer_from_context(QUESTION, ctx, attempts=2)
            report["e2e_with_best_model"] = res
            print(f"E2E with {best}: answer_len={len(res.get('answer') or '')} "
                  f"cited={res.get('citedIds')} ungrounded={res.get('ungrounded')} "
                  f"dropped={res.get('droppedCardIds')}")
        except Exception as exc:
            report["e2e_with_best_model_error"] = str(exc)
            print(f"E2E with {best} FAILED: {type(exc).__name__}")

    # 3. POISON BISECTION on the baseline model (full generations).
    def blocked(subset):
        out = full_gen(GEMINI_ANALYSIS_MODEL,
                       _build_rag_prompt(QUESTION, subset, None, None) + _CITED_JSON_SUFFIX,
                       schema=True)
        return (out.get("len") or 0) == 0
    remaining = list(ctx)
    poison = []
    for _ in range(3):
        if not remaining or not blocked(remaining):
            break
        lo, hi = 1, len(remaining)
        while lo < hi:
            mid = (lo + hi) // 2
            if blocked(remaining[:mid]):
                hi = mid
            else:
                lo = mid + 1
        poison.append(remaining[lo - 1])
        print(f"poison card found: {remaining[lo - 1]['id'][:10]}… (position {lo - 1})")
        remaining = remaining[:lo - 1] + remaining[lo:]
    report["poison_cards"] = [(c["id"], c["title"]) for c in poison]
    report["clean_after_removal"] = not blocked(remaining) if poison else True
    print(f"poison cards: {len(poison)}; clean after removal: "
          f"{report['clean_after_removal']}")

    json.dump(report, open("ask-debug-report.json", "w"),
              ensure_ascii=False, indent=1, default=str)
    print("done")


if __name__ == "__main__":
    main()
""" v5 """  # noqa
