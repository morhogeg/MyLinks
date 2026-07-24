"""Ask debug harness v3 — verify the plain-mode ladder on a retrieval-like
context.

v2 findings: E2E is 401 (App Check enforced); newest-25 context passes BOTH
modes — the failing context is the RETRIEVED one (vector + keyword matches,
including cards older than the newest 25). v3 reconstructs that context the
way ask_brain retrieval does (vector top-12 + keyword scan + recency) and
tests all four ladder stages against it:
  schema full / plain full / plain paraphrase / plain headline.

Public repo ⇒ stdout prints only structural outcomes. Full detail (incl. the
retrieved card list) goes to the auth-gated artifact.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402
from google.cloud.firestore_v1.vector import Vector  # noqa: E402
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # noqa: E402

from ai_service import (  # noqa: E402
    _build_rag_prompt,
    _CITED_JSON_SUFFIX,
    _CITED_JSON_PARAPHRASE_SUFFIX,
    GEMINI_ANALYSIS_MODEL,
    _ASK_SAFETY_SETTINGS,
    _headline_cards,
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
    vh = d.get("videoHighlights")
    if isinstance(vh, list) and vh:
        out["videoHighlights"] = [str(x)[:200] for x in vh[:8]]
    return out


def gen_outcome(prompt, config):
    try:
        resp = client.models.generate_content(
            model=GEMINI_ANALYSIS_MODEL, contents=[prompt], config=config)
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
                "len": len(text), "text": text[:1500]}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:200]}"}


def main():
    db = firestore.Client(project=PROJECT)
    errs = [{**s.to_dict(), "_doc": s.id} for s in
            db.collection("server_errors").order_by(
                "timestamp", direction=firestore.Query.DESCENDING).limit(6).stream()]
    report["server_errors"] = errs
    uid = next((e.get("uid") for e in errs
                if str(e.get("fn", "")).startswith("ask_brain") and e.get("uid")), None)
    if not uid:
        print("FATAL: no uid")
        return
    report["uid"] = uid
    links = db.collection("users").document(uid).collection("links")

    # Vector half of retrieval.
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
        print(f"vector retrieval: {len(vec_cards)} cards")
    except Exception as e:
        print(f"vector retrieval failed: {type(e).__name__}: {str(e)[:150]}")

    # Keyword + recency halves.
    recent = [(s.id, s.to_dict() or {}) for s in links.order_by(
        "createdAt", direction=firestore.Query.DESCENDING).limit(150).stream()]
    kw_cards = [slim(i, d) for i, d in recent
                if any(k in (str(d.get("title", "")) + " " + str(d.get("summary", ""))).lower()
                       for k in KEYWORDS)]
    rec_cards = [slim(i, d) for i, d in recent[:5]]
    print(f"keyword matches: {len(kw_cards)}, recency: {len(rec_cards)}")

    seen, ctx = set(), []
    for c in vec_cards + kw_cards + rec_cards:
        if c["id"] not in seen:
            seen.add(c["id"])
            ctx.append(c)
    ctx = ctx[:20]
    report["context_ids"] = [(c["id"], c["title"]) for c in ctx]
    print(f"reconstructed context: {len(ctx)} cards")

    base = _build_rag_prompt(QUESTION, ctx, None, None)
    headline = _build_rag_prompt(QUESTION, _headline_cards(ctx), None, None)
    schema_cfg = {"response_mime_type": "application/json",
                  "response_schema": BrainAnswer, "temperature": 0.2,
                  "safety_settings": _ASK_SAFETY_SETTINGS}
    plain_cfg = {"temperature": 0.2, "safety_settings": _ASK_SAFETY_SETTINGS}

    stages = [
        ("schema_full", base + _CITED_JSON_SUFFIX, schema_cfg),
        ("plain_full", base + _CITED_JSON_SUFFIX, plain_cfg),
        ("plain_paraphrase", base + _CITED_JSON_PARAPHRASE_SUFFIX, plain_cfg),
        ("plain_headline", headline + _CITED_JSON_SUFFIX, plain_cfg),
    ]
    for name, prompt, cfg in stages:
        out = gen_outcome(prompt, cfg)
        report[name] = out
        print(f"{name}: block={out.get('block')} finish={out.get('finish')} "
              f"len={out.get('len')} err={out.get('error')}")

    json.dump(report, open("ask-debug-report.json", "w"),
              ensure_ascii=False, indent=1, default=str)
    print("done")


if __name__ == "__main__":
    main()
""" trailing marker """  # noqa
