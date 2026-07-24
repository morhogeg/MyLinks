"""One-off Ask debug harness — run from the `ask-debug` GitHub Actions workflow.

Reproduces the production Ask PROHIBITED_CONTENT prompt-block with the real
user data + real Gemini key (both available only in CI), and bisects down to
the exact card/field/sentence Gemini's filter rejects.

Output contract (the repo is PUBLIC, so Actions logs are public):
- stdout: ONLY structural findings — booleans, counts, truncated doc ids.
  NEVER card content, titles, or the uid.
- ask-debug-report.json (uploaded as a workflow artifact, auth-gated):
  the full findings including content snippets, for the session to download.
"""

import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402

from ai_service import (  # noqa: E402
    _build_rag_prompt,
    _CITED_JSON_SUFFIX,
    GEMINI_ANALYSIS_MODEL,
    GEMINI_ASK_MODEL,
    _ASK_SAFETY_SETTINGS,
)

PROJECT = "secondbrain-app-94da2"
QUESTION = "מתכון לפסטה"
MAX_PROBES = 150

probe_count = 0
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def probe(prompt: str, model: str = GEMINI_ANALYSIS_MODEL):
    """Returns (blocked: bool|None, reason: str). None = transport error."""
    global probe_count
    if probe_count >= MAX_PROBES:
        return None, "probe budget exhausted"
    probe_count += 1
    for attempt in range(2):
        try:
            resp = client.models.generate_content(
                model=model, contents=[prompt],
                config={"max_output_tokens": 1, "temperature": 0.0,
                        "safety_settings": _ASK_SAFETY_SETTINGS})
            fb = getattr(resp, "prompt_feedback", None)
            block = getattr(fb, "block_reason", None) if fb else None
            if block:
                return True, str(block)
            return False, ""
        except Exception as e:
            if attempt == 0:
                time.sleep(1.5)
                continue
            return None, f"{type(e).__name__}: {str(e)[:200]}"


def card_prompt(cards):
    return _build_rag_prompt(QUESTION, cards, None, None) + _CITED_JSON_SUFFIX


def slim(doc_id, d):
    """Approximate ask_brain's slimming closely enough for filter behavior."""
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
    detail = (d.get("detailedSummary") or "").strip()
    if detail:
        out["detailedSummary"] = detail[:3500]
    takeaway = (d.get("actionableTakeaway") or "").strip()
    if takeaway:
        out["actionableTakeaway"] = takeaway[:600]
    recipe = d.get("recipe")
    if isinstance(recipe, dict) and (recipe.get("ingredients") or recipe.get("instructions")):
        out["recipe"] = {
            "ingredients": [str(x)[:200] for x in (recipe.get("ingredients") or [])[:40]],
            "instructions": [str(x)[:500] for x in (recipe.get("instructions") or [])[:40]],
        }
    vh = d.get("videoHighlights")
    if isinstance(vh, list) and vh:
        out["videoHighlights"] = [str(x)[:200] for x in vh[:8]]
    return out


_SENT_SPLIT = re.compile(r"(?<=[.!?׃])\s+|\n+")


def safe_signals(text: str) -> dict:
    """Content-free structural fingerprint of a snippet, printable to the
    PUBLIC log: no words leak, but the character-class mix often names the
    culprit (e.g. invisible bidi control chars corrupting what the filter
    tokenizer sees)."""
    t = str(text)
    return {
        "len": len(t),
        "has_url": bool(re.search(r"https?://", t)),
        "bidi_ctrl": sum(1 for ch in t if ch in "‎‏‪‫‬‭‮⁦⁧⁨⁩"),
        "zero_width": sum(1 for ch in t if ch in "​‌‍﻿"),
        "other_ctrl": sum(1 for ch in t if ord(ch) < 32 and ch not in "\n\t\r"),
        "hebrew": sum(1 for ch in t if "֐" <= ch <= "׿"),
        "latin": sum(1 for ch in t if ch.isascii() and ch.isalpha()),
        "digits": sum(1 for ch in t if ch.isdigit()),
    }


def bisect_text_field(base_card, field, text):
    """Find the first sentence of `text` that makes the single-field card
    blocked. Returns dict with minimal snippet info."""
    sentences = [s for s in _SENT_SPLIT.split(text) if s.strip()]
    if len(sentences) <= 1:
        return {"sentences": len(sentences), "minimal": text[:300]}
    # Cumulative prefix probe: first prefix that blocks names the sentence.
    for i in range(1, len(sentences) + 1):
        cand = dict(base_card)
        cand[field] = " ".join(sentences[:i])
        blocked, _ = probe(card_prompt([cand]))
        if blocked:
            sent = sentences[i - 1]
            alone = dict(base_card)
            alone[field] = sent
            alone_blocked, _ = probe(card_prompt([alone]))
            print(f"    minimal blocked sentence #{i - 1}: signals={safe_signals(sent)}")
            return {"sentences": len(sentences), "index": i - 1,
                    "minimal": sent[:300], "blocked_alone": alone_blocked,
                    "signals": safe_signals(sent)}
        if probe_count >= MAX_PROBES:
            break
    return {"sentences": len(sentences), "minimal": None,
            "note": "no prefix blocked (order-dependent trigger?)"}


def main():
    report = {"question": QUESTION, "probes": {}}
    db = firestore.Client(project=PROJECT)

    # 1. server_errors trail (full detail → artifact only).
    errs = [{**snap.to_dict(), "_doc": snap.id} for snap in
            db.collection("server_errors").order_by(
                "timestamp", direction=firestore.Query.DESCENDING).limit(25).stream()]
    report["server_errors"] = errs
    ask_errs = [e for e in errs if str(e.get("fn", "")).startswith("ask_brain")]
    print(f"server_errors: {len(errs)} records, {len(ask_errs)} from ask_brain")

    uid = next((e.get("uid") for e in ask_errs if e.get("uid")), None)
    if not uid:
        print("FATAL: no ask_brain uid in server_errors")
        report["fatal"] = "no uid"
        json.dump(report, open("ask-debug-report.json", "w"), ensure_ascii=False,
                  indent=1, default=str)
        return
    report["uid"] = uid
    print("uid: found (redacted)")

    # 2. Newest cards for that user.
    docs = list(db.collection("users").document(uid).collection("links")
                .order_by("createdAt", direction=firestore.Query.DESCENDING)
                .limit(25).stream())
    cards = [slim(s.id, s.to_dict() or {}) for s in docs]
    print(f"cards loaded: {len(cards)}")

    # 3. Template / question baselines.
    b, r = probe(card_prompt([]))
    report["probes"]["question_no_cards"] = {"blocked": b, "reason": r}
    print(f"probe question+template, zero cards: blocked={b} {r}")

    # 4. Full context (top 20), both models.
    top = cards[:20]
    b, r = probe(card_prompt(top))
    report["probes"]["full_context_flash_lite"] = {"blocked": b, "reason": r}
    print(f"probe full context (flash-lite): blocked={b} {r}")
    b2, r2 = probe(card_prompt(top), model=GEMINI_ASK_MODEL)
    report["probes"]["full_context_flash"] = {"blocked": b2, "reason": r2}
    print(f"probe full context (flash): blocked={b2} {r2}")

    # 5. Per-card probes (each card alone).
    per_card = []
    blocked_cards = []
    for c in cards:
        b, r = probe(card_prompt([c]))
        per_card.append({"id": c["id"], "title": c["title"], "blocked": b, "reason": r})
        if b:
            blocked_cards.append(c)
        print(f"card {c['id'][:8]}…: blocked={b}")
    report["per_card"] = per_card
    print(f"blocked cards: {len(blocked_cards)}/{len(cards)}")

    # 6. Per-field + sentence bisect for each blocked card (bounded).
    field_findings = []
    for c in blocked_cards[:4]:
        base = {"id": c["id"], "title": "Card"}  # neutral shell
        finding = {"id": c["id"], "title": c["title"], "fields": {}}
        for field in ("title", "summary", "detailedSummary", "actionableTakeaway",
                      "userNote"):
            val = c.get(field)
            if not val or not str(val).strip():
                continue
            cand = dict(base)
            cand[field] = val
            fb, fr = probe(card_prompt([cand]))
            entry = {"blocked_alone": fb, "reason": fr}
            if fb:
                entry["bisect"] = bisect_text_field(base, field, str(val))
            finding["fields"][field] = entry
            print(f"  {c['id'][:8]}… field {field}: blocked={fb}")
        recipe = c.get("recipe")
        if isinstance(recipe, dict):
            for part in ("ingredients", "instructions"):
                items = recipe.get(part) or []
                if not items:
                    continue
                cand = dict(base)
                cand["recipe"] = {part: items}
                fb, fr = probe(card_prompt([cand]))
                entry = {"blocked_alone": fb, "reason": fr, "items": len(items)}
                if fb:
                    hits = []
                    for i, item in enumerate(items):
                        ib, _ = probe(card_prompt([{**base, "recipe": {part: [item]}}]))
                        if ib:
                            print(f"    blocked {part}[{i}]: signals={safe_signals(item)}")
                            hits.append({"index": i, "item": str(item)[:200],
                                         "signals": safe_signals(item)})
                        if probe_count >= MAX_PROBES:
                            break
                    entry["blocked_items"] = hits
                finding["fields"][f"recipe.{part}"] = entry
                print(f"  {c['id'][:8]}… recipe.{part}: blocked={fb}")
        field_findings.append(finding)
    report["field_findings"] = field_findings

    report["total_probes"] = probe_count
    json.dump(report, open("ask-debug-report.json", "w"), ensure_ascii=False,
              indent=1, default=str)
    print(f"done — {probe_count} probes; full detail in artifact")


if __name__ == "__main__":
    main()
