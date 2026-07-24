"""Ask debug harness v7 — flag the poison card askExcluded; verify the fully
restored ORIGINAL Ask path.

v5: exactly one poison card; context passes ORIGINAL schema mode without it.
v6: rewriting its summary/detail text was NOT sufficient (trigger lives in
other fields or pure combination) — nothing was written back.
v7: set `askExcluded: true` on that one doc (the deployed ask_brain filter
honors it; card stays in feed/search/collections), rebuild the context the
way prod now does (excluding flagged cards), and run the REAL
answer_from_context — expect a grounded, cited, schema-mode answer.

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
        "askExcluded": d.get("askExcluded"),
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

    def build_ctx(exclude_flagged):
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
                if not (exclude_flagged and c.get("askExcluded")):
                    ctx.append(c)
        return ctx[:20]

    ctx = build_ctx(exclude_flagged=False)
    print(f"context: {len(ctx)} cards")
    if schema_gen_blocked(ctx):
        # Bisect to the poison card (full generations) and flag it.
        remaining = list(ctx)
        lo, hi = 1, len(remaining)
        while lo < hi:
            mid = (lo + hi) // 2
            if schema_gen_blocked(remaining[:mid]):
                hi = mid
            else:
                lo = mid + 1
        poison = remaining[lo - 1]
        report["poison"] = {"id": poison["id"], "title": poison["title"]}
        print(f"poison card: {poison['id'][:10]}… — setting askExcluded")
        links.document(poison["id"]).set(
            {"askExcluded": True,
             "_askExcludedAt": datetime.now(timezone.utc).isoformat(),
             "_askExcludedReason": "gemini prompt filter (2026-07-24 incident)"},
            merge=True)
    else:
        print("context already passes — no flag needed")

    # Verify the restored path exactly as prod will run it.
    ctx2 = build_ctx(exclude_flagged=True)
    print(f"context after exclusion: {len(ctx2)} cards")
    blocked = schema_gen_blocked(ctx2)
    print(f"schema mode on excluded context: blocked={blocked}")
    svc = GeminiService()
    try:
        res = svc.answer_from_context(QUESTION, ctx2, attempts=2)
        report["e2e"] = res
        print(f"E2E: answer_len={len(res.get('answer') or '')} "
              f"cited={res.get('citedIds')} ungrounded={res.get('ungrounded')} "
              f"dropped={res.get('droppedCardIds')}")
    except Exception as exc:
        report["e2e_error"] = str(exc)
        print(f"E2E FAILED: {type(exc).__name__}")

    json.dump(report, open("ask-debug-report.json", "w"),
              ensure_ascii=False, indent=1, default=str)
    print("done")


if __name__ == "__main__":
    main()
""" v7 """  # noqa
