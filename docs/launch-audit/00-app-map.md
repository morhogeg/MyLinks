# Machina: app map (launch audit, 2026-10-05)

A shared picture of the product before the audit. `SOURCE_OF_TRUTH.md` stays the
project's tracker; this folder holds the launch audit only (owner's request).

## What it is

One product, three clients, one backend:

| Surface | What it is | Where |
|---|---|---|
| iOS app | Capacitor 8 shell (WKWebView) loading the Next.js **static export**, plus a native Swift **Share Extension** | `web/ios/App` |
| Web app | The same Next.js app, built natively on Vercel (`mymachina.app`) | `web/` |
| Browser extension | MV3 popup that posts the current tab to the share endpoint; Safari wrapper for the Mac App Store | `extension/`, `safari/` |
| Backend | Python 3.13 Firebase Cloud Functions (`secondbrain-app-94da2`, us-central1) | `functions/` |
| Data | Firestore (vector search for embeddings) + Cloud Storage; Firebase Auth (Google, Apple) | `firestore.rules`, `storage.rules` |
| AI | Gemini `gemini-3.1-flash-lite` (analysis, vision, Ask, synthesis), `gemini-embedding-001` (search) | `functions/ai_service.py`, `functions/search.py` |
| Billing | RevenueCat + App Store IAP (keys not configured yet: paywall degrades to "not available in this build") | `functions/entitlement.py`, `web/lib/purchases.ts` |

## Screens (one route: `web/app/page.tsx`)

The app is a single page; a `feedTab` state swaps the content. Public routes
(`/privacy`, `/terms`, `/welcome`, landing) skip the auth gate
(`web/lib/publicRoutes.tsx`).

**Gate sequence** (`AuthProvider.tsx`): boot screen → sign-in (`LoginScreen` on
iPhone, `SignedOutWeb`/`LandingPage` on web) → workspace claim
(`/api/claim-workspace`, falls back to creating a fresh workspace) → AI consent
(`AIConsentNotice`, names Google Gemini) → one-screen welcome (`Onboarding`) →
app → first-run tour (`OnboardingTour`).

**Bottom tabs** (`BottomTabBar.tsx`) + the `+` button:

| Tab | Content | Key files |
|---|---|---|
| Home | Library: standing search field, filters/sort/sources sheets, views **Card / List / Graph / My notes** | `Feed.tsx`, `Card.tsx`, `ListCard.tsx`, `KnowledgeGraph.tsx`, `NotesView.tsx`, `feed/*` |
| Collections | Gallery, suggestions, private (PIN) collections, share pages, "Ask about this" | `CollectionsGallery.tsx`, `collections.ts` |
| Ask | RAG chat over the library with cited source chips, history sidebar, save/share answer | `AskBrain.tsx`, `ChatHistorySidebar.tsx`, `ShareAnswerSheet.tsx` |
| Revisit | Due reminders, "Do this" tasks, weekly synthesis, curated digests, review deck | `DigestView.tsx`, `SynthesisCard.tsx`, `SwipeDeck.tsx` |
| `+` | Link / Image (up to 5 screenshots → one card) / Note tabs; bookmarks import | `AddLinkForm.tsx`, `ImportSheet.tsx` |

**Overlays:** card detail (`LinkDetailModal.tsx`: summary, key points, Do this,
notes, related cards, tags, reminders, share, screenshot completion), card
action sheet, Settings (`SettingsModal.tsx` + `settings/*`: account, plan,
notifications, digest schedule, insights, browser extension, export, story,
delete account), Paywall, PIN lock, reminder picker, collection sheets.

## Core flows

**Capture (every source lands on the same pipeline):**

1. *Share sheet (iOS):* `ShareViewController.swift` reads the ingest token from
   the shared Keychain (`KeychainStore.swift`, App Group
   `group.com.morhogeg.machina`), POSTs `/api/share` (`share_ingest`), shows
   honest phases; the app's `AnalyzingBanner` resumes the same progress ramp
   (`shareProgress.ts`).
2. *In app:* `AddLinkForm` → `/api/share` for links (queued, async) or
   `/api/analyze-image` / `/api/analyze` for images and notes (sync). Offline
   saves queue locally (`offlineSave.ts`).
3. *Extension:* popup → `/api/share` with the ingest token.
4. *Backend:* `share_ingest` writes a `processing` placeholder card + a queue doc →
   `process_link_background` (Firestore trigger) scrapes (`scraper.py`, SSRF-guarded
   `safe_get`), analyzes (`ai_service.py`), embeds (`search.py`
   `sync_link_embedding` trigger), links related cards (`graph_service.py`) → card
   flips to a ready status or `failed` (Retry). Past the plan's monthly
   allowance the card is kept as `waiting` and analyzed later
   (`deferred_capture.py`). A janitor (`sweep_stuck_processing`, every 5 min)
   fails cards stuck in `processing`.

**Recall:** keyword search over the loaded window + semantic search over the
whole library (`/api/search` → `search_links_http`); Ask (`/api/chat` →
`ask_brain`, SSE on web, buffered JSON in WKWebView) with chat history in
`users/{uid}/chats`; graph from `relatedLinks`; reminders (`check_reminders`,
every 2 min), curated digests + weekly synthesis (`send_digests`, every 5 min),
push via FCM/APNs (`push_service.py`).

**Account:** Google/Apple sign-in (native plugin credential bridged into the JS
SDK, `lib/auth.ts`); `delete_account(_http)` wipes the workspace; sign-out
purges local caches and the native share token.

**Billing:** `entitlements/{uid}` (functions-only) is the source of truth;
14-day server-side reverse trial; free = 100 saves + 20 asks/month
(`quota.py`); RevenueCat webhook + `/api/entitlement/sync`.

## Data model (Firestore)

- `users/{uid}`: workspace doc (settings, `authUids[]`, consent, tour, tokens).
  `uid` is a phone number for legacy workspaces, the auth uid for new ones.
  - `links/{id}`: the card (`web/lib/types.ts` `Link`; status
    `unread|favorite|archived|processing|failed|waiting`)
  - `chats`, `collections`, `syntheses`, `digests`, `capture_snapshots`
- Top-level public snapshots: `shared_cards`, `shared_collections`,
  `shared_answers` (read-public); functions-only: `shared_owners`,
  `entitlements`, `synthesis_vault`, `usage_quotas`, `deleted_accounts`,
  rate-limit and task-log collections.
- Storage: `screenshots/{storageKey}/…`.

## Request routing

Web (Vercel) and the iOS app call `/api/*`. Vercel rewrites most of them to
Firebase Hosting, which rewrites to the functions (`firebase.json`); `/api/chat`
is a Vercel route that proxies to the function's direct URL (no SSE buffering).
The iOS app calls the Hosting origin (`NEXT_PUBLIC_API_BASE`). `/s`, `/c`, `/a`
are server-rendered public share pages (`share_page`).

## Deploy surfaces

| What | How |
|---|---|
| Web | Vercel, auto on push to `main` |
| Functions | GitHub Actions on `main` pushes touching `functions/**` |
| Rules | GitHub Actions on `main` pushes touching `firestore.rules` / `storage.rules` (emulator suite first) |
| iOS | `git push -f origin main:trigger/testflight` → macOS runner → TestFlight |

## Tests that exist

- `functions/tests`: 1348 pytest cases (offline, Gemini mocked).
- `firestore-rules-test`: emulator suite (CI only; the emulator JAR can't
  download in cloud sessions).
- `e2e/`: 69 Playwright journeys against Auth + Firestore emulators with the
  live rules, functions stubbed (CI on `main`/PRs).
- `web/lib/__tests__`: 7 small node test files (55 cases).
- `extension/*.test.mjs` + extension Playwright suite.
- Not covered by automation: the Swift share extension, WKWebView behavior,
  StoreKit, push delivery, real Gemini output quality.
