---
name: card-autopsy
description: Root-cause a bad Machina card end-to-end — wrong/hallucinated summary, wrong category, empty content, missed highlights — by reproducing the scrape, isolating scraper vs prompt vs pipeline, fixing the right layer, and verifying against the live pipeline. Use when the user shows a card that "reads wrong", says the summary is generic/invented/vague, a saved link produced garbage, or asks to improve summary quality.
---

# Card autopsy — find WHERE the pipeline lied

The save pipeline is: URL → `functions/scraper.py` (`scrape_url`) →
`functions/ai_service.py` (Gemini `gemini-3.1-flash-lite`, `SYSTEM_PROMPT`,
schema-enforced) → card doc. A bad card has exactly one of four causes, and the
fix differs completely per cause. The canonical case (2026-07-06): a 46-point X
Article summarized as a hallucinated generic blurb — everyone's instinct blamed
the prompt; the actual bug was the scraper reading `tweet.text` (empty for X
Articles) and falling through to thin OG metadata, which Gemini then "grounded"
on nothing. **Reproduce the scrape before touching any prompt.**

## 1. Capture the evidence

From the user (or the open card in the app): the **URL**, the stored
**summary/detailedSummary/category/tags**, and what specifically reads wrong
(invented facts? vague meta-opener? wrong language? list flattened to "this is a
list"? missing `**bold**` highlights?). If the complaint is about the OPEN view
vs the card, note that the open view leads with the card `summary` and
`detailedSummary` must start at `## Key Points` (legacy cards get their leading
overview sliced client-side in `LinkDetailModal`).

## 2. Reproduce the scrape — the decisive step

```bash
cd functions
# one-time if venv missing: python3.13 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python - <<'EOF'
from scraper import scrape_url
r = scrape_url("PASTE_URL")
content = (r.get("content") or "")
print("keys:", sorted(r.keys()))
print("title:", r.get("title"))
print("content length:", len(content))
print("--- first 1500 chars ---")
print(content[:1500])
EOF
```

Read the output like a doctor:

- **Content length < ~500 chars or obviously just OG metadata** → **scraper
  bug**. The model never saw the real content; no prompt can fix that. Go to §3.
- **Content rich and correct, summary still wrong** → **prompt/model issue**.
  Go to §4.
- **Scrape raises/blocked** → environment or host issue. Cloud-session egress is
  proxied — a fetch that fails here may work in prod; say so rather than
  concluding the scraper is broken. YouTube is special: transcripts are
  deliberately NOT scraped (cloud IPs are blocked); video understanding goes
  through Gemini's native `file_uri` path in `analyze_youtube`, and channel
  names come from oEmbed (which deliberately overrides the model's guess —
  don't reverse that). `functions/test_yt_scrape.py` exists for YT diagnostics.
- **Content rich but PLACEHOLDER-ish** ("JavaScript is disabled", cookie walls)
  → scraper bug of the fallback kind; treat as thin content.

Also check the platform branch actually taken: twitter/X → `_scrape_twitter_url`
(X Articles live in `tweet.article.content.blocks`, not `tweet.text`;
`_format_twitter_article` reconstructs them), instagram / linkedin / facebook /
youtube each have dedicated paths; everything else takes the generic
`safe_get` + readability path (SSRF-guarded — keep `validate_public_url`).

## 3. Scraper fix path

- Fix in `functions/scraper.py`, staying inside the existing structure: platform
  helpers hit fixed public bridge/API hosts; the generic path stays behind
  `validate_public_url`/`safe_get` (never weaken the SSRF guard; it re-validates
  every redirect hop).
- Re-run the §2 snippet until the printed content is the real article (the X
  Article fix went from a placeholder to 22K chars — that's the bar: real,
  substantial content).
- Add the failure shape to your report: which platform, which field the content
  actually lives in, what the fallback produced.

## 4. Prompt fix path (only after §2 proved the input was good)

`SYSTEM_PROMPT` in `functions/ai_service.py` is load-bearing and has named,
hard-won rules — **surgical edits only**, and never remove one silently:

- GROUNDING (no fabrication when content is thin/placeholder)
- substance-first (banned vague meta-openers like "This article examines…")
- lists/threads must surface 2–3 specific points
- `**bold**` scannability in summary AND detailedSummary
- `detailedSummary` starts at `## ` (no second overview — the card summary is
  the overview; `LinkDetailModal` composes them)
- `\n` between summary sentences; recipe-focus rule; JSON via `response_schema`
  (`AIAnalysis` in `models.py`) — don't break the schema contract

Verification: with `GEMINI_API_KEY` available (owner machine — it lives only in
gitignored `functions/.env`), run the model directly:

```bash
cd functions && venv/bin/python - <<'EOF'
from scraper import scrape_url
from ai_service import GeminiService
r = scrape_url("PASTE_URL")
a = GeminiService().analyze_text(r.get("content",""), url="PASTE_URL", title=r.get("title"))
print(a)
EOF
```

Check the output against the user's complaint AND the rules above (does the
summary lead with substance? are 2–3 specific points surfaced? bold present?
detailedSummary starts at `## `?). No key in this environment → verify the
scrape output + reasoning here, and do the live check post-deploy (§5).

Truncation awareness: analysis input is capped at 30 000 chars, embeddings at
9 000 — a "missing the end of the article" complaint on a huge page may be the
cap, not the prompt.

## 5. Deploy + close the loop

- Typecheck/compile: `python -m py_compile *.py` (+ `npx tsc --noEmit` if the
  fix touched the open-view rendering in `web/`).
- Deploy BOTH analysis functions — they share the pipeline:
  `./deploy-functions.sh functions:analyze_link,functions:process_link_background`
  (add `functions:analyze_image` if the vision path changed).
- **Re-save the failing URL in the app** (delete the bad card, share/save it
  again) and read the new card. Existing cards keep their stored text until
  re-saved — say this explicitly so nobody expects a retroactive fix.
- Record in SOURCE_OF_TRUTH §9: the root cause layer (scraper vs prompt vs
  pipeline vs rendering), the URL class it affects, the named prompt rules
  touched, and the verified before/after.

## Anti-patterns

- Editing the prompt because the summary is wrong, without reproducing the
  scrape (the #1 wasted-hours trap in this repo's history).
- "Fixing" hallucination by making the prompt longer instead of feeding it real
  content.
- Removing the GROUNDING/substance-first/bold rules while rewording — each one
  encodes a past user complaint.
- Concluding a scraper regression from inside a cloud sandbox where the fetch is
  proxy-blocked — distinguish "blocked here" from "broken in prod".
- Deploying `analyze_link` but not `process_link_background` (or vice versa) —
  web and share/WhatsApp saves would then disagree.
