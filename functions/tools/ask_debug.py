"""Ask debug harness v4 — run the REAL answer_from_context ladder against the
reconstructed failing context.

v3 proved the retrieval-reconstructed context (vector top-12 + keyword +
recency) reproduces PROHIBITED_CONTENT in ALL simple modes — schema, plain,
paraphrase, even plain headline — so a retrieved card's headline text is
itself a trigger. v4 executes the actual production code path
(GeminiService.answer_from_context, with the new plain-mode ladder + plain
salvage final stage) on that context: if it returns an answer here, the
deployed fix will too.

Public repo ⇒ stdout structural only; full detail → auth-gated artifact.
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

from ai_service import GeminiService, EMBEDDING_MODEL  # noqa: E402

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


def stage_markers(msg):
    out = []
    if "in plain mode" in msg:
        out.append("plain-mode")
    for m in re.findall(r"\[stage: [^\]]{0,140}\]", msg):
        out.append(m)
    if "block_reason" in msg:
        out.append("has-block_reason")
    return out


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
        print(f"vector retrieval failed: {type(e).__name__}: {str(e)[:150]}")
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
    print(f"reconstructed context: {len(ctx)} cards "
          f"(vec={len(vec_cards)} kw={len(kw)} rec={len(rec5)})")

    svc = GeminiService()
    try:
        out = svc.answer_from_context(QUESTION, ctx, attempts=2)
        report["ladder_result"] = out
        print(f"LADDER OK: answer_len={len(out.get('answer') or '')} "
              f"cited={out.get('citedIds')} dropped={out.get('droppedCardIds')} "
              f"filtered={len(out.get('filteredCards') or [])} "
              f"ungrounded={out.get('ungrounded')}")
    except Exception as exc:
        report["ladder_error"] = str(exc)
        print(f"LADDER FAILED: {type(exc).__name__} markers={stage_markers(str(exc))}")

    json.dump(report, open("ask-debug-report.json", "w"),
              ensure_ascii=False, indent=1, default=str)
    print("done")


if __name__ == "__main__":
    main()
