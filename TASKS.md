# MyLinks / Second Brain — Task Tracker (Single Source of Truth)

> This is the canonical backlog for the project. Every open task lives here.
> When work starts, link the branch/PR next to the task. When it ships, check
> the box and note the commit/PR. Keep this file in sync — it is the map we
> drive from.

**Last reviewed:** 2026-06-22
**Active branch:** `claude/multi-platform-auto-save-44qkmq`

---

## 0. Where the project stands today

A working-but-fragile MVP. Core loop works in production: capture a link/image
(web UI or WhatsApp) → Python Cloud Function scrapes + Gemini analyzes →
structured card saved to Firestore → real-time feed, semantic search, reminders.

**Stack:** Next.js 15 static export (PWA) on Firebase Hosting · Python 3.13
Firebase Cloud Functions · Firestore (+ vector index) · Gemini (analysis +
`gemini-embedding-001`) · Twilio (WhatsApp).

**Capture channels live:** Web add-link, web image upload, WhatsApp (links +
images + reminder commands, EN/HE), YouTube deep analysis.

**Known structural facts that shape the backlog:**
- **No real auth.** `AuthProvider` loads the first user doc; Firestore rules are
  `allow read, write: if true`. Effectively single-user.
- **Duplicated analysis logic.** TypeScript (`web/lib/ai-service.ts` +
  `app/api/analyze/route.ts`) reimplements what the Python functions do. In
  production, `firebase.json` rewrites `/api/analyze` and `/api/analyze-image`
  to the Python functions — so the TS path is dev-only/parallel and drifts.
- **Thin tests.** Only `functions/test_yt_scrape.py`. The AI/scrape pipeline has
  needed repeated regression fixes.

---

## 1. The North Star (new direction)

**Get content the user saves elsewhere into MyLinks automatically.**

### Reality check (researched June 2026) — pull vs. push
We investigated *pulling* saved items from services and hit a wall: most personal
"saved" collections are **not exposed by any legitimate API**:
- ❌ **Instagram / Facebook saved** — not in the Graph API (only ToS-violating scraping).
- ❌ **YouTube "Watch Later"** — dead via API since 2016 (only Likes/playlists readable).
- ❌ **Safari bookmarks / Reading List** — iOS sandbox, no third-party read API.
- ❌ **Google Maps saved places** — no API; only a manual Google Takeout CSV export.
- ✅ Only **Reddit (free)**, **X/Twitter (paid since 2026)**, **Mastodon** expose "saved".

So the universal path is **push (share-to-app)**, not pull. Since an iOS PWA cannot be a
share-sheet target, we ship an **iOS Shortcut** that posts shared links into the existing
pipeline — covering Safari, Maps, Instagram, X, anything with a Share button. See **T14**.

**Pull connectors** (Reddit/X/Mastodon) remain a *possible future add-on* (Epic E1 below)
for the narrow case of "saved inside an app you'd never bother to share from."

---

## 2. Priorities at a glance

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| T14 | Universal share capture (iOS Shortcut → share_ingest) | P1 | ◐ Implemented, pending deploy/test |
| T1 | Real authentication (Firebase Auth + locked Firestore rules) | P0 | ☐ Not started |
| T2 | Consolidate analysis pipeline to one source of truth | P0 | ☐ Not started |
| T3 | Test harness for scrape + analyze + search | P1 | ☐ Not started |
| T4 | Multi-user data model & isolation | P1 | ☐ Not started |
| E1 | Active bookmark sync from external services (MCP) | P1 (epic) | ☐ Not started |
| T5 | Connector framework + sync engine (E1 foundation) | P1 | ☐ Not started |
| T6 | YouTube saved/liked sync | P2 | ☒ Won't do (Watch Later dead via API) |
| T7 | Instagram saved sync | P2 | ☒ Won't do (no legitimate API) |
| T8 | Facebook saved sync | P2 | ☒ Won't do (no legitimate API) |
| T9 | Browser extension capture | P2 | ☐ Not started |
| T10 | Reading view + export (MD/PDF/HTML) | P3 | ☐ Not started |
| T11 | Highlights & annotations | P3 | ☐ Not started |
| T12 | README ↔ reality reconciliation | P3 | ☐ Not started |
| T13 | Code-debt TODOs cleanup | P3 | ☐ Ongoing |

---

## 2.5 T14 — Universal share capture (◐ implemented, pending deploy)

First shipped capture path for the North Star. An iOS Shortcut posts shared links to a new
`share_ingest` endpoint, which queues them into the existing `process_link_background` pipeline.
- [x] `functions/link_service.py`: `ensure_ingest_token`, `find_user_by_ingest_token`,
      `link_exists_for_url`, `pending_exists_for_url` (dedup).
- [x] `functions/main.py`: `share_ingest` (token-auth HTTP), `get_share_config` (callable),
      and a guard so non-WhatsApp items skip the WhatsApp reply.
- [x] `firebase.json`: rewrite `/api/share` → `share_ingest`.
- [x] `web/components/SettingsModal.tsx`: "Share to Second Brain" section (endpoint + token).
- [x] `SHORTCUT_SETUP.md`: iOS Shortcut build guide.
- [ ] Deploy (`firebase deploy`) and run the end-to-end test (share from Safari + Maps).
- Hardening later: token currently lives on the (open-rules) user doc — tightens with T1.

---

## 3. P0 — Must do before building new features

### T1 — Real authentication
**Why:** Everything below assumes "the right user." Today anyone can read/write
any user's data; sync connectors will hold OAuth tokens that *cannot* sit behind
open rules.
- [ ] Add Firebase Auth (Google Sign-In is the obvious first provider).
- [ ] Replace `AuthProvider` "first user doc" lookup with the real `auth.uid`.
- [ ] Lock `firestore.rules`: `allow read, write: if request.auth.uid == uid`.
- [ ] Lock `storage.rules` to the owning user.
- [ ] Migrate the existing single user doc to a real auth UID.
- Files: `web/components/AuthProvider.tsx`, `firestore.rules`, `storage.rules`,
  `web/lib/firebase.ts`, WhatsApp phone→uid mapping in `link_service.py`.

### T2 — Consolidate the analysis pipeline
**Why:** Two implementations of "scrape + prompt + build link" drift apart
(e.g. the TS `/api/analyze` route doesn't produce `embedding_vector`/`concepts`/
`relatedLinks`, but `AddLinkForm` saves those fields — only the Python function
fills them).
- [ ] Decide the single runtime path. Recommendation: **Python Cloud Functions
      are canonical**; keep the TS route only as a thin dev proxy or delete it.
- [ ] Remove/redirect `web/lib/ai-service.ts` analysis duplication.
- [ ] Document the one prompt + one link-schema builder.
- Files: `web/lib/ai-service.ts`, `web/app/api/analyze/route.ts`,
  `web/components/AddLinkForm.tsx`, `functions/main.py`, `functions/ai_service.py`.

---

## 4. P1 — Reliability & the platform for the North Star

### T3 — Test harness
- [ ] Unit tests for `scraper.py` (web, Twitter/X, YouTube paths) with fixtures.
- [ ] Tests for `ai_service.py` JSON-shape contract (golden outputs / schema).
- [ ] Tests for `search.py` (embedding dim, find_nearest wiring, empty-state).
- [ ] A smoke test for the WhatsApp webhook payload parsing.
- [ ] Wire into a SessionStart hook / CI so web sessions can run them.

### T4 — Multi-user data model
- [ ] Confirm Firestore layout (`users/{uid}/links/...`) holds up for N users.
- [ ] Per-user settings, tag namespaces, and quota considerations.
- Depends on: T1.

### E1 — ACTIVE BOOKMARK SYNC FROM EXTERNAL SERVICES *(the big one)*
**Goal:** User saves content in Instagram/Facebook/YouTube → MyLinks pulls it in
automatically and analyzes it. Connectors envisioned via MCP + OAuth, driven by
a scheduled poller.

Broken into T5 (framework) + T6/T7/T8 (per-service connectors). Read the
feasibility notes — the three services are **not** equally accessible.

#### T5 — Connector framework + sync engine (foundation for E1)
- [ ] Define a `Connector` interface: `authorize()`, `listSavedItems(since)`,
      `normalizeToLink(item)`.
- [ ] OAuth token storage per user (encrypted; **requires T1**).
- [ ] New Firestore collections: `users/{uid}/connections/{provider}` and a
      `sync_cursor` per connection for incremental pulls.
- [ ] Scheduled poller (Cloud Scheduler / `scheduler_fn`) that runs each active
      connection, dedups against existing links (by source URL/external id),
      and feeds new items into the **existing** `pending_processing` →
      `process_link_background` pipeline (reuse, don't reinvent).
- [ ] Decide the MCP boundary: are MCP servers the fetch layer the app calls, or
      is MCP only for the dev/agent side? Write this down before coding.
- [ ] Per-connection UI in Settings: connect/disconnect, last-sync, status.

#### T6 — YouTube connector *(do this first — most feasible)*
- [ ] OAuth via Google (YouTube Data API v3).
- [ ] Pull **Liked videos** playlist (`LL`) and user-created/saved playlists.
      ⚠️ "Watch Later" is **not** available via the API (deprecated).
- [ ] Map each video → existing YouTube deep-analysis path.
- [ ] Incremental sync via `publishedAfter` / stored cursor.

#### T7 — Instagram saved sync *(blocked — verify before scoping)*
- [ ] ⚠️ **Feasibility risk:** Instagram Graph API does **not** expose a user's
      "Saved" collection for personal accounts. Investigate options:
  - [ ] Official API surface (Business/Creator accounts only, limited).
  - [ ] Manual data-export ingestion (user downloads their IG data → we import).
  - [ ] Unofficial/scraping route — **ToS + account-ban risk; document before any work.**
- [ ] Decision gate: pick an approach (or de-scope) before implementation.

#### T8 — Facebook saved sync *(blocked — verify before scoping)*
- [ ] ⚠️ Same constraint as IG: no official "Saved items" API endpoint.
      Evaluate Graph API permissions and data-export import as the realistic path.
- [ ] Decision gate before implementation.

> **Honest framing for E1:** YouTube (T6) is achievable with official APIs.
> Instagram/Facebook "saved" is the hard part — Meta does not expose saved
> collections via official APIs. Realistic near-term paths there are
> data-export import or a (risky) unofficial route. Recommend: ship T6 to prove
> the framework, then make a deliberate call on T7/T8.

---

## 5. P2 — Additional capture channels

### T9 — Browser extension
- [ ] Manifest v3 extension: "Save to MyLinks" on any page.
- [ ] Calls the canonical analyze endpoint (post-T2).

---

## 6. P3 — Product roadmap (from README) & polish

- [ ] **T10** — Clean reading view + export (Markdown / PDF / HTML).
- [ ] **T11** — Highlights & annotations (Readwise-style).
- [ ] Text-to-speech for articles.
- [ ] Reading time / reading progress tracking.
- [ ] Public profile / sharing.
- [ ] Daily digest email.
- [ ] RSS import.
- [ ] **T12 — README ↔ reality:** README claims a `GraphView.tsx` and knowledge
      graph as shipped; component doesn't exist (we have `InsightsFeed.tsx`,
      `SmartPulse.tsx`, and graph logic in `functions/graph_service.py`). Align
      docs with what's actually built.

---

## 7. T13 — Code-debt TODOs (tracked, ongoing)

Inline TODOs found in the codebase:
- [ ] `firestore.rules:6` — lock down with real auth (folded into **T1**).
- [ ] `web/lib/types.ts:82` — replace placeholder `User` type with Firebase Auth user.
- [ ] `web/components/AuthProvider.tsx:28` — real Firebase Auth (**T1**).
- [ ] `web/components/Feed.tsx:31` — stale comment ("localStorage polling");
      it already uses Firestore `onSnapshot`. Fix the comment.
- [ ] `web/lib/storage.ts:130` — Firestore ID generation note; verify/clean.

---

## How we work from here

1. Pick the next task by ID.
2. If it's a **decision gate** (T7, T8, the MCP boundary in T5), resolve the
   decision first — don't code into a blocked path.
3. Branch, build, check the box here with the PR link, then move on.
