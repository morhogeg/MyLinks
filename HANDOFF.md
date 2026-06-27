# Session Handoff — MyLinks ("Second Brain")

_Last updated: 2026-06-27. Branch: `claude/vibrant-leakey-694fc3` (merged to `main`)._

## Latest session — Facebook platform + Ask Your Brain polish & RAG fixes

Frontend changes are **live on Vercel** (auto-deploy on push to `main`). Backend changes
were **deployed** this session via `./deploy-functions.sh functions:ask_brain` (the only
function touched) — Ask Your Brain is fully live.

**Facebook platform** (`web/lib/platform.tsx`, `Card.tsx`, `SwipeDeck.tsx`, `LinkDetailModal.tsx`):
- New `FacebookLogo` (solid brand "f" SVG, `currentColor`), `'facebook'` added to `PlatformKey`,
  `PLATFORM_LABELS`, `getPlatform` (`facebook.com`/`fb.com`/`fb.watch`), `platformIcon`, and
  `PLATFORM_RGB` (`24, 119, 242`). Cards/detail/review show the brand logo in place of the muted
  source chip (same "logo only" treatment as LinkedIn). Source filter/sort chip is automatic
  (derived from `PLATFORM_LABELS`).

**Ask Your Brain — bug fixes (the important ones):**
- **Hebrew answers crashed** with `AI answer failed: Expecting ',' delimiter`. Cause: the RAG call
  used a bare `response_mime_type` so Gemini emitted unescaped quotes/newlines → invalid JSON.
  Fix: `answer_from_context` now routes through `_generate_json` with a **`BrainAnswer`
  response_schema** (`functions/ai_service.py`, `functions/models.py`) — schema-constrained,
  always-valid JSON, plus the existing retry.
- **"CNN fact-check" not found / "fact check" in the title not found** — two distinct bugs:
  1. The model never saw the **publisher**: card context was only title/summary/category/tags, and
     "CNN" isn't in that text. Fix: `ask_brain` passes `sourceName`/`url` through, and each card
     block in the prompt now includes `source: <publisher>` (falls back to URL host).
     (`functions/main.py`, `functions/ai_service.py`)
  2. Retrieval was **vector-only**, which can drop a card whose title literally matches (ranking,
     or no embedding yet). Fix: **hybrid retrieval** — `_keyword_fallback_cards` in `main.py` scans
     the user's links for the question's keywords (title weighted highest) and merges the best hits
     into the vector results.

**Ask Your Brain — UX/polish** (`web/components/AskBrain.tsx`, `Feed.tsx`):
- **Elevated Ask from a view toggle to its own button.** Removed `'ask'` from the Cards/Compact/
  Review segmented control (those are layouts); Ask is now a standalone toolbar button — solid
  accent when active, white bg + accent text when idle, icon `MessageCircleQuestion` (replaced the
  generic Sparkles, also in the empty state). Toggling Ask off returns to your last layout
  (`lastLayout` ref).
- **Ask mode hides grid-only chrome** — category chips, status/sort/source filters, active-tag
  chips, tag explorer (sidebar + mobile), bulk-selection. Kept: search bar + mode switcher.
- **Search from Ask mode** drops you back into the grid (results only render there).
- **Composer fits one viewport**: `h-[calc(100dvh-320px)] min-h-[340px]` (was `100vh-220px`, which
  pushed the input below the fold).
- **Citations are now "proof cards"** — accent icon tile + branded source tag (platform logo/brand,
  e.g. YouTube red, or publisher name like CNN) + **full title** (no truncation). Needs the `url`
  the backend now returns per source.
- **Chat persists** across tab switches and reloads (`localStorage`, keyed `askbrain:chat:<uid>`),
  cleared only via a new **Clear** button.

**Next up (per plan):** Sessions 3 (Highlights & Notes) and 4 (Proactive Resurfacing) remain;
Session 0 (auth, P0) is still the launch blocker.

---

## Earlier — Feature 5: Browser extension (one-click desktop capture)

Implemented from the roadmap in `~/.claude/plans/you-are-an-expert-prancy-origami.md` (Session 5).
**No web-app or backend changes** — a new, self-contained top-level **`/extension`** folder.

- **What it is:** a Manifest V3 Chromium extension (Chrome/Edge/Brave), vanilla JS/HTML/CSS,
  **no build step, no dependencies**. It's a *thin client* over the already-deployed
  `share_ingest` Cloud Function (`POST /api/share`, header `X-Ingest-Token`, body
  `{url, note?}`) — the same endpoint the iOS Share Shortcut uses. No new backend code.
- **Capture paths (all in the service worker, `background.js`):**
  - **Toolbar click** → save current tab. **Keyboard** `Ctrl/⌘+Shift+S` → same.
  - **Context menu "Save to MyLinks"** — on a **link** saves `info.linkUrl`; on a **selection**
    saves the page URL with the selection as `note` (stored as the link body); on the **page**
    saves the tab URL.
  - **Badge feedback** (clears after ~2s): **✓ purple** = queued, **✓ grey** = duplicate
    ("Already saved"), **✗ red** = error (no/invalid token or unsavable `chrome://`-type URL).
- **Settings** (`popup.html`/`popup.css`/`popup.js`, registered as `options_ui` so it renders as
  a popup window; auto-opens when no token is set): paste **ingest token** + optional **backend
  URL** (default `https://secondbrain-app-94da2.web.app`), persisted in `chrome.storage.sync`.
  **"Test connection"** posts a tokens-only request that **saves nothing** (share_ingest checks
  the token before the URL → 400 = valid, 401/403 = token problem). Also a "Save this page now"
  button. Friendly empty state: "Paste your MyLinks token to start saving."
- **Icons:** purple→pink brain mark, 16/48/128 (rendered from `icons/icon.svg`).
- **Permissions:** `contextMenus`, `activeTab`, `storage`; `host_permissions` for
  `https://secondbrain-app-94da2.web.app/*`. (`scripting` not needed.)
- **Note on highlights:** selected text is saved as the link **body/note**, not a structured
  highlight — structured highlights are the deferred Session 3 (Highlights & Notes) feature.
- **Verified:** manifest JSON + JS syntax check; live endpoint contract re-confirmed via curl
  (OPTIONS→204, no-token→401, bad-token→403). **Final end-to-end check is the user's:** load
  unpacked (`chrome://extensions` → Developer mode → Load unpacked → `/extension`), paste token,
  click the icon on an article → card appears in the app within seconds. See `extension/README.md`.
- **Distribution:** load-unpacked only for now (documented in the README); Chrome Web Store is a
  later optional step.

**Next up (per plan):** Sessions 3 (Highlights & Notes) and 4 (Proactive Resurfacing) remain;
Session 0 (auth, P0) is still the launch blocker.

---

## Earlier — Feature 2: Clean Reading Mode + Text-to-Speech

Implemented from the roadmap in `~/.claude/plans/you-are-an-expert-prancy-origami.md` (Session 2).

- **Backend extractor:** `extract_readable_article(url)` in `functions/scraper.py` — fetches the page and returns paragraph-structured blocks (`{type: p|h2|h3|li|blockquote, text}`), stripping script/nav/footer/aside and trimming leading nav-tab list items. Distinct from `scrape_url` (which space-joins + hard-truncates for AI). New HTTP function **`get_article`** in `functions/main.py` wraps it.
- **Routing:** `/api/article` → `get_article` in `firebase.json` + `web/vercel.json`; dev proxy `web/app/api/article/route.ts`. Fetched **on demand** so it works for every saved link with no schema migration/backfill.
- **UI:** new **`web/components/ReadingView.tsx`** — full-screen distraction-free reader: scroll **progress bar**, **font-size** controls (persisted to `localStorage` `reader-font-size`), **Listen (TTS)** via Web Speech API (`SpeechSynthesis`, one utterance per paragraph, play/pause/resume, `he-IL` for Hebrew), RTL-aware, serif-ish prose column, graceful loading/error states.
- **Entry point:** a **"Read"** button (BookOpen) in `LinkDetailModal.tsx` header, shown only for text articles (`canRead`: http(s) URL, not YouTube, not image). Opens `ReadingView` as a `z-[60]` overlay.
- Verify: open a web-article card → **Read** → clean reader loads; A−/A+ resize and persist; scrolling moves the progress bar; **Listen** reads aloud (pause/resume); a Hebrew article renders RTL. (Extractor already smoke-tested locally against a real Wikipedia article — 104 clean blocks.)

**Next up (per plan):** Session 3 = Highlights & Personal Notes.

---

## Previous — Feature 1: "Ask Your Brain" (RAG) + view-mode cleanup

Implemented from the roadmap in `~/.claude/plans/you-are-an-expert-prancy-origami.md` (Session 1). **Deployed this session** (hosting by user; functions via `firebase deploy --only functions`).

**Part A — cleanup (done):**
- View modes consolidated **5 → 4**: removed **Table** and the dead **Insights** tab; kept Cards / Compact / Review; added **Ask**. (`web/components/Feed.tsx`)
- Deleted dead components: `SmartPulse.tsx` (called a non-existent `/api/chat`), `InsightsFeed.tsx`, `TableView.tsx`.
  - _Note:_ `globals.css:325` still has a now-orphan "sticky columns in TableView" rule — harmless, clean later. The plan's "merge Compact into Cards as a density toggle" was **deferred** (kept Compact as its own mode for now).

**Part B — Ask Your Brain RAG (done):**
- Backend: new HTTP function **`ask_brain`** in `functions/main.py` — embeds the question, reuses `perform_search_logic` (`functions/search.py`, vector search), then `GeminiService.answer_from_context` (new, in `functions/ai_service.py`) answers grounded ONLY in retrieved cards and returns cited source ids. Hallucinated ids are filtered out.
- Routing: `/api/chat` → `ask_brain` added to **`firebase.json`** (hosting rewrite) and **`web/vercel.json`** (prod rewrite); thin dev proxy at **`web/app/api/chat/route.ts`** (mirrors `/api/analyze`).
- UI: new **`web/components/AskBrain.tsx`** — chat thread, suggested prompts, thinking indicator, RTL-aware (`getDirection`), and **citation chips that open the source card** via `onOpenLink` → `setActiveLinkId`. Empty-library state included. Wired into Feed's `ask` view (ignores list filters; queries the whole brain).
- Verify: open the **Ask** tab → ask something only your saved cards could answer → confirm grounded answer + citation chips open the right cards. Requires `GEMINI_API_KEY` + the existing Firestore vector index (both already used by search).

**Next up (per plan):** Session 2 = Clean Reading Mode + TTS.

---

_Earlier session — 2026-06-26 (session c). Branch: `claude/card-delivery-email-whatsapp-rcgq9w`, merged to `main` (tip `df0623b`). Frontend live on Vercel._

## TL;DR
This session shipped a new **Curated Digest** feature plus a batch of UX fixes:

- **Curated Digest** — deliver a hand-picked set of saved cards on a schedule (daily/weekly)
  to **email and/or WhatsApp**, with user-chosen curation. New `functions/digest_service.py`
  (curation engine + WhatsApp/email rendering + delivery), hourly scheduler, a
  "send one now" callable, and WhatsApp commands (`DIGEST`, `STOP/START DIGEST`).
  **WhatsApp path is the focus and is solid; email is deferred** (no provider configured yet).
- **Settings redesign for digest** — enable toggle + a **"Customize digest" sub-screen**
  (mode grid, multi-topic picker, count, schedule, channels, email, send-now). **Theme switch
  is now icon-only.** Removed the **iOS Shortcut** capture block. Removed the **"Link deleted"**
  toast.
- **Link analysis progress** — new `LinkScanProgress` gives a normal web link the same phased
  scan UX as images/videos (no more bare "Analyzing…" spinner).
- **LinkedIn = logo only** — the scraped author name was unreliable (often the first words of
  the post), so LinkedIn cards/detail/review now show just the brand logo.
- **Detail modal** — dropped the redundant top "gist"; now leads straight into the full
  write-up (Overview / Key Points), falling back to the short summary only if there's no
  detailed one. _(This reverses last session's "lead with the highlighted summary" choice.)_

---

## Project shape (orientation)
- **Frontend:** Next.js 16 + React 19 in `web/`. **Vercel** auto-deploys on push to `main`
  (`https://my-links-sable.vercel.app`). Tailwind v4 theme tokens (`text-text`,
  `text-text-secondary`, `text-text-muted`, `bg-card`, `bg-card-hover`, `border-border-subtle`,
  `bg-accent`, `var(--accent-gradient)`, `var(--shadow-card)`). **Use these tokens, not
  hardcoded white/black.**
- **Backend:** Python Firebase Cloud Functions in `functions/` (Gemini, Firestore, Storage).
- **Firebase project:** **`secondbrain-app-94da2`**. `web/vercel.json` routes `/api/*` there.
  Firestore data: `users/{uid}/links/{id}` (uid is the phone number, e.g. `+16462440305`).
- **Workflow this session:** develop → commit → **merge/rebase to `main`** (user tests on the
  live Vercel site). Pushing to `main` needs explicit user OK each time (classifier-gated).

---

## What changed this session (newest first)

### Detail modal — remove redundant summary (`web/components/LinkDetailModal.tsx`)
Open card now renders **only `detailedSummary`** (its markdown already has Overview / Key
Points sections); falls back to `summary` when there's no detailed version. Previously showed
both, which duplicated the gist (and the user had already seen it on the card).

### Link analysis progress (`web/components/LinkScanProgress.tsx` + `AddLinkForm.tsx`)
New stateless component mirroring `ImageScanProgress`/`VideoScanProgress`: scan line over a
faux page preview (favicon via `google.com/s2/favicons` + host + skeleton lines), simulated
progress bar, rotating phase labels (Fetching → Reading → Understanding → Writing summary →
Organizing → Done). `AddLinkForm` now animates plain links too (`isPlainLink`; factor `0.03`
vs image `0.04`, video `0.012`), sets a real milestone (90%) when analysis returns, and lands
on 100%. The submit button is hidden whenever `isLoading` (all three modes show a scan view).

### LinkedIn logo only (`Card.tsx`, `SwipeDeck.tsx`, `LinkDetailModal.tsx`)
Replaced `linkedinName`/`linkedinDisplayName(...)` byline with `const isLinkedIn = platform
=== 'linkedin'` and render **just** `platformIcon('linkedin')`. `linkedinDisplayName` /
`linkedinAuthor` remain exported in `platform.tsx` but are now unused (dead, harmless).

### Settings: remove iOS Shortcut block (`web/components/SettingsModal.tsx`)
Dropped the endpoint/token UI and its now-unused state/handlers (`shareConfig`, `loadShareConfig`,
`handleCopy`, `copied`, `get_share_config` call) and imports (`Copy`, `ShieldCheck`). Kept the
WhatsApp capture note. **Backend `share_ingest`/`get_share_config` left intact** so any existing
iOS Shortcut keeps working.

### Curated Digest — Settings UI (`web/components/SettingsModal.tsx`, `Dropdown.tsx`)
- Main list shows the **enable toggle** + a **"Customize digest"** row with a live summary
  (`digestSummary`) that opens a **sub-screen** (`view: 'main' | 'digest'`, back arrow in header).
- Sub-screen: mode grid (Smart/Random/Topic/Backlog/Favorites/Rediscover), **multi-select topic
  chips** (`digest_topics`), count, frequency, day+hour Dropdowns, channel chips (WhatsApp/Email),
  email input, skip-empty, **"Send one now"**.
- **Theme `Segmented` gained `iconOnly`** (icons only, w-10 cells, aria-label/title kept).
- Removed the **"Link deleted"** success toast in `Feed.tsx` (`performDelete`); error toast kept.

### Curated Digest — backend (`functions/digest_service.py`, `main.py`, `models.py`)
- **`digest_service.py`**: `curate(links, mode, count, topics)` (pure, unit-tested) — modes
  `smart` (backlog+rediscovery mix), `random`, `topic` (matches any of `topics`), `unread`,
  `favorites`, `rediscover` (older, untouched saves). `fetch_candidate_links` (excludes
  archived). WhatsApp rendering **chunks under Twilio's 1600-char limit**
  (`format_digest_whatsapp_messages`, greedy pack, part tags). Email rendering
  (`format_digest_email`, HTML+text). `send_email` via **SendGrid → SMTP → graceful no-op**.
  `is_due(settings, tz, last_sent)` (local hour/day + dedup guard). `run_digest_check()` sweep;
  `build_and_send_digest(uid, user_data, force)` for one user.
- **`main.py`**: `send_digests` **hourly scheduler**, `force_send_digests` (debug endpoint),
  `send_digest_now` (callable, powers "Send one now", accepts overrides). WhatsApp webhook
  handles `STOP/START/PAUSE DIGEST` and on-demand `DIGEST` (forces WhatsApp reply).
- **`models.py`**: `UserSettings` gains `digest_*` fields (incl. `digest_topics: List[str]`,
  legacy `digest_topic` kept as fallback); `UserDocument` gains `email`, `timezone`,
  `lastDigestSentAt`.
- Settings stored under `users/{uid}.settings.*`; email at top-level `users/{uid}.email`
  (`web/lib/storage.ts` `updateUserEmail`/`getUserEmail`); `lastDigestSentAt` top-level (ms).

---

## Deploy

### Frontend (automatic)
Push to `main` → Vercel rebuilds. All this session's **web** changes are **live**.

### Functions (manual — PENDING; required for digest + recent fixes)
Not redeployed this session. Needed for: the digest **scheduler/callables/WhatsApp commands**,
**multi-topic** (`digest_topics`) curation, and the image-URL fix (`c57aacb`, store via Firebase
download token). Deploy **all** functions (scheduler + webhook aren't in
`deploy-functions.sh`'s default targets):
```bash
cd ~/MyLinks && git checkout main && git pull
firebase use secondbrain-app-94da2
# Recreate gitignored locals first: functions/.env (GEMINI_API_KEY, TWILIO_*) and a venv
firebase deploy --only functions --project secondbrain-app-94da2   # ALL functions
```
⚠️ **Env gotchas (unchanged):** `GEMINI_API_KEY` and `TWILIO_*` are **PLAIN env vars** in
`functions/.env` (gitignored, absent in a fresh clone) — do NOT bind them as Secret Manager
secrets. Deploy needs a local venv so firebase-tools can import the source.

### Firebase Hosting (manual — separate from Vercel)
`secondbrain-app-94da2.web.app` (iOS Shortcut / share deep-links / `APP_URL`) is a **separate**
deploy: `cd ~/MyLinks && git pull && ./deploy-hosting.sh`.

---

## Verification
- Frontend source of truth: `cd web && npx tsc --noEmit` (kept clean every commit).
  `npm run build` fails **only** at Google-Fonts fetch in the sandbox (environmental) — it
  compiles all app code first; treat other build errors as real.
- Functions: `cd functions && python -m py_compile *.py`. Digest curation/formatting/`is_due`
  and WhatsApp chunking verified via an importable test with `db`/`link_service` stubbed
  (all modes, multi-topic, <1600-char chunks, schedule dedup).

---

## Open items / suggested next steps
- **Deploy the functions** (above) — highest priority; the digest backend, multi-topic, and the
  image-URL fix are written but dark.
- **Email digests** — deferred by user. To enable: set `SENDGRID_API_KEY` _or_ `SMTP_*` +
  `DIGEST_FROM_EMAIL` in `functions/.env` (documented in `.env.example`). Until then email is a
  logged no-op; WhatsApp works.
- **Digest niceties:** an "On this day" anniversary mode, per-digest open-rate/engagement, and a
  digest history are natural follow-ons. `INCLUDE_CONNECTIONS` in `whatsapp_handler.py` still
  gated off (unrelated to digest).
- **LinkedIn:** byline is now logo-only by design; the dead `linkedinDisplayName`/`linkedinAuthor`
  helpers in `platform.tsx` can be removed if you want to tidy.
- Older still-standing items: "Untitled (Analysis Failed)" cards need a distinct failed state;
  X/Instagram analysis still uses the generic scraper (lower quality than YouTube's native path).

## Out of scope (per user)
Auth/multi-user isolation, connectors/sync beyond the iOS Shortcut, export/highlights.
Email digest delivery (deferred, not cut).
