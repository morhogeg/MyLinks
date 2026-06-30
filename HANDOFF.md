# Session Handoff — MyLinks ("Second Brain")

_Last updated: 2026-06-30. Branch: `claude/eloquent-ptolemy-5e56be` (merged + pushed to `main`)._

## ⚠️ IN-FLIGHT — YouTube channel name + deploys (READ FIRST)

All code below is committed/pushed to `main`. The remaining work is **deploying + verifying**
(the user does deploys; the cloud session can't). Status as of this handoff:

**Problem being chased:** YouTube cards (and their Ask citations) show "YouTube" or a wrong name
(e.g. the AI returned "It's a mindset" instead of the real channel "Sprouht"/"Mark Manson").

**Root cause (fixed in code):** `functions/main.py:_apply_youtube_metadata` set
`youtubeChannel = analysis.sourceName or yt_meta.channel` — it **preferred the AI's guess** over
the authoritative YouTube **oEmbed** channel. Now flipped to prefer the real oEmbed channel
(`_real_channel or analysis.sourceName or _yt_channel`). Also: `ask_brain` now sends
`metadata.youtubeChannel` in citation source objects via `_card_source_name()` (it only sent
top-level `sourceName` before), and the Ask frontend (`AskBrain.tsx sourceTag`) shows the specific
identity (X `@handle` via `xHandle`, LinkedIn author, channel/publisher).

**New repair function:** `functions/main.py:backfill_youtube_channels` (HTTP, idempotent) re-fetches
oEmbed `author_name` for existing YouTube cards missing a real channel and writes
`metadata.youtubeChannel` + `sourceName`. Optional `?uid=`; no uid = all users (fine, single-user).

**Deploy status / TODO for next session:**
1. **Deploy the save functions** (channel fix only takes effect on deploy):
   `./deploy-functions.sh functions:ask_brain,functions:analyze_link,functions:process_link_background,functions:backfill_youtube_channels`
   - `analyze_link`, `ask_brain`, `backfill_youtube_channels` deployed OK last attempt.
   - **`process_link_background` failed with a transient HTTP 409** ("unable to queue the
     operation" — it's a Firestore-trigger fn; retry in ~60s: `./deploy-functions.sh
     functions:process_link_background`). It's only the iPhone-share/WhatsApp path; web saves use
     `analyze_link` which IS deployed.
2. **Run the backfill once** to repair existing cards:
   `curl https://us-central1-secondbrain-app-94da2.cloudfunctions.net/backfill_youtube_channels`
   (expect `{"updated":N,...}`; if 404 right after first deploy, use the `run.app` URL the deploy
   printed). **Not yet confirmed run/succeeded — verify this.**
3. **Verify** a fresh YouTube save shows the real channel, and that backfilled cards + Ask citations
   show it too. If still wrong, check: did `analyze_link` actually redeploy? did oEmbed return a real
   `author_name` (some videos/regions block it)?

**Deploy footgun (fixed):** `deploy-functions.sh` now auto-prefixes every target with `functions:`.
Previously `functions:a,b,c` silently deployed only `a` (b/c read as unknown target types) — that's
why an earlier deploy "did nothing". Either bare or prefixed names work now.

**Still NOT done (user may ask):** the **`/api/analyze` 60s timeout** on slow YouTube videos (the
"Analysis is taking longer than expected" message). It's the client `ANALYZE_TIMEOUT_MS=60_000` +
Firebase Hosting's hard 60s cap on function rewrites; video analysis exceeds it. Proposed fix: the
**same Hosting-bypass used for chat** — drop `/api/analyze` from `web/vercel.json` rewrites and route
it through `web/app/api/analyze/route.ts` to the function's direct URL, then raise the timeout. NOT
done (it touches all link-saving; needs care + can't be tested from the cloud session).

**Also pending from this session:** `./deploy-hosting.sh` for iPhone (the script now runs
`npm install` first — earlier it failed on the new `react-markdown` deps). Streaming + answer-language
were already deployed and confirmed working.

---

## Latest session — Card/Collections/toolbar UX polish + verified in-browser (2026-06-30)

Frontend-only round. Shipped to web (Vercel push + `./deploy-hosting.sh`), rebuilt the iOS bundle,
and **bumped both targets (App + ShareExt) to build 4**. No functions changed. Each fix was verified
against **real prod data** in a headless browser (mobile 375px + desktop), not just code review.

**Fixes (all on `main`):**
1. **Open-card toolbar (`LinkDetailModal.tsx`)** — the two-group header overflowed on iPhone and
   clipped the close X. Now one compact row that scrolls horizontally if needed (never clips), a
   divider between status toggles and item actions, and a **pinned, always-visible close** button.
   Added **edge-swipe-to-close** (`useEdgeSwipeBack`).
2. **App-logo halo (`page.tsx`)** — removed the pink accent-gradient blur behind the header icon
   (the `<img>` app icon stands alone now; subtler ring). Desktop + mobile.
3. **Mobile toolbar density (`Feed.tsx`)** — the "All Categories" selector now shares a row with
   "Filters" (one fewer row); the old full-width category button + the separate mobile Filters
   button were merged.
4. **Add-image copy (`AddLinkForm.tsx`)** — dropped the grey subtext under "Tap to add an image".
5. **Collections menu (`CollectionsGallery.tsx`)** — the per-tile "…" menu is now a **`document.body`
   portal** positioned from the trigger's screen rect (flips up near the viewport bottom), so it can
   never be clipped by a tile's bounds/stacking. Also **removed the dashed "New collection" tile**.
6. **Collections add affordance (`Feed.tsx`)** — the Collections header has an explicit **"+" button**
   (the only create entry point now), and the **add FAB is hidden in Collections** (new
   `onHideAddButton` signal from Feed → page, alongside the existing ask-mode signal).
7. **`CategoryInput.tsx`** — default value to `''` so the category input never flips
   controlled→uncontrolled (a React dev warning for links with no category).

**How to preview locally with real data (useful trick):** `firebase.ts` only connects to emulators
when `hostname === 'localhost' && protocol === 'http:'`. So `npm run dev` then open
**`http://127.0.0.1:3000`** (not `localhost`) — the IP hostname bypasses the emulator gate and hits
prod Firestore (reads work with no sign-in; AuthProvider just grabs the first user doc). Needs
`web/.env.local` (present in the main worktree, gitignored).

**Deployed:** Vercel (push), Firebase Hosting (`./deploy-hosting.sh`), iOS bundle (`./build-ios.sh`).
Build number = **4** on both targets. **Next: Xcode → Archive → Distribute → TestFlight.**

---

## Earlier — Collections UX polish (2026-06-30)

Iterated on the Collections feature after first user testing. Shipped to web (Vercel + Hosting) and
rebuilt the iOS bundle. All on `main`.

**Fixes / additions:**
1. **Cards show their collections** — subtle accent chips in the card footer (`Card.tsx`,
   `cardCollections` prop fed from `Feed.tsx`). Inside a scoped collection the chip becomes a one-tap
   **remove**; also added "Remove from <collection>" to the mobile `CardActionSheet`.
2. **Manage a collection's cards** — new `web/components/ManageCollectionCardsSheet.tsx`: searchable
   list of all cards with a membership checkbox (add **and** remove in bulk). Opened from the tile
   menu ("Manage cards") and from an **"Add cards"** button in the scoped-collection banner.
3. **Fixed the tile "…" menu** (`CollectionsGallery.tsx`) — it was clipped + flickering because it
   rendered inside two `overflow-hidden` containers (the cover and the tile). Moved the trigger +
   menu onto the tile root and stopped the root from clipping; menu now uses `z-50`.
4. **Removed the decorative Layers icon** from collection covers (plain color/cover only).
5. **Removed the redundant "New" button** in the Collections header (the gallery's "+ New collection"
   tile already creates one).
6. **Hid the category chips while scoped to a collection** (`Feed.tsx`, gated on
   `selectedCollections.size === 0`).

**Earlier this round (already live):** the collection-save bug — `firestore.rules` was missing a
`users/{uid}/collections` match (rules don't cascade to subcollections); added + deployed. Color
picker is now optional (random default + "Surprise me" shuffle).

**Deployed:** Vercel (push), Firebase Hosting (`./deploy-hosting.sh`), iOS bundle (`./build-ios.sh`,
`@capacitor/share` synced). No functions changed. **Next: Xcode → Archive → TestFlight.**

---

## Earlier — iOS "Load failed" CORS fix + app-icon header logo (2026-06-30)

Shipped end-to-end: pushed to `main` (Vercel desktop), deployed 5 Cloud Functions, and deployed
Firebase Hosting (iPhone). **Two earlier rounds of iOS UX polish are also already on `main`** —
this session's branch was based behind `main` and was fast-forwarded first.

**Three fixes (all live):**
1. **"Load failed" when adding a link/image (and the earlier Ask failure) — root cause: CORS.**
   Every `/api/*` fetch from the native app is cross-origin (`capacitor://localhost` → `*.web.app`)
   with a custom header (`X-Firebase-AppCheck`), so it triggers a CORS preflight. The backend
   allowlist (`functions/main.py` `_allowed_origins()`) only listed the web origins, so the
   preflight was rejected → bare "Load failed" on every call. **Fix:** added `capacitor://localhost`
   (+ `ionic://localhost`, `https://localhost`) to the allowlist. Verified live: `OPTIONS
   /api/analyze` with `Origin: capacitor://localhost` now returns `204` +
   `access-control-allow-origin: capacitor://localhost`. (This was the real blocker behind the
   Ask "Couldn't reach Machina" too — bigger than the SSE-buffering patch from the prior round.)
2. **In-app header logo now matches the app icon** (`web/app/page.tsx`). Replaced the monochrome
   `MachinaMark` SVG with the real iOS AppIcon, downscaled to `web/public/app-icon.png` (128px),
   in both the header brand and the loading screen. Shared header → desktop gets it too.
3. **Search placeholder** `Search your brain…` → `Search Machina…` (`web/components/Feed.tsx`).

**Deployed this session:**
- Functions: `analyze_link, analyze_image, ask_brain, get_article, share_ingest` (all ✔).
- Hosting (iPhone): ✔ — `app-icon.png` confirmed live (HTTP 200).
- Vercel (desktop): pushed to `main` (auto-deploy).

**For the iPhone app itself (TestFlight):** the CORS fix is server-side and takes effect for the
*existing* installed build immediately (no rebuild needed for "Load failed"). The new header logo +
search copy are bundled web assets, so they reach the phone via Hosting (PWA) but the **native
TestFlight build needs `./build-ios.sh` + Xcode archive** to embed them. Reopen / hard-refresh to
clear PWA cache.

---

## Earlier — Collections + outbound sharing (2026-06-30)

Shipped to web (Vercel + Firebase Hosting) and built a TestFlight-ready iOS bundle. All on `main`, pushed.

**What this adds:** users can group cards into collections (e.g. "Russian literature", "Tesla"),
filter the feed by collection, browse a dedicated Collections view, and **share** a whole collection
or a single card as a public read-only "Machina page."

**Data model:**
- Membership lives on the card: `collectionIds?: string[]` on `Link` (mirrors `tags`, so the feed
  filters in memory with no extra reads). See `web/lib/types.ts`.
- Collection metadata: `users/{uid}/collections/{id}` (`Collection` interface). Card counts are
  derived client-side, not stored.
- Public **frozen snapshots** at top-level `shared_collections/{shareId}` and `shared_cards/{shareId}`
  (denormalized `SharedCard[]`). Re-publishing refreshes the snapshot; "Stop sharing" deletes it.

**Key files (all new unless noted):**
- `web/lib/collections.ts` — CRUD, add/remove membership (`arrayUnion`/`arrayRemove`), publish/unpublish.
- `web/lib/share.ts` — `@capacitor/share` (native iOS) → Web Share API → clipboard fallback.
  Builds **absolute** URLs from `NEXT_PUBLIC_SHARE_BASE` (window.location is `capacitor://` in the app).
- `web/components/AddToCollectionSheet.tsx`, `CollectionsGallery.tsx`, `CollectionFormModal.tsx`,
  `PublicShare.tsx`.
- `web/app/c/page.tsx`, `web/app/s/page.tsx` — public, **client-rendered query-param** pages
  (`/c?id=`, `/s?id=`). Query params (not `/c/[id]`) because the app is a Next.js **static export**.
- `web/components/Feed.tsx` (modified) — collections `onSnapshot`, `selectedCollections` filter,
  new `'collections'` viewMode + toolbar button, scoped-collection banner with Share / Stop sharing.
- `Card.tsx`, `CardActionSheet.tsx`, `LinkDetailModal.tsx` (modified) — "Add to collection" + "Share".
- `web/lib/colors.ts` (modified) — exported `COLOR_KEYS` + `getColorStyleByKey` for the color picker.

**Deployed this session:**
- Vercel (desktop) — pushed to `main` (auto-deploy).
- Firebase Hosting (iPhone webview) — `./deploy-hosting.sh` ✓.
- **Firestore rules** — `firebase deploy --only firestore:rules` ✓ (added public read for
  `shared_collections` + `shared_cards`; **required** or publishing/share pages fail).
- iOS — `./build-ios.sh` ✓; `cap sync` registered `@capacitor/share@8.0.1` (SPM, no CocoaPods).
  **Next: open Xcode → Archive → Distribute → TestFlight.**

**Follow-up fix (same session):** first attempt to create a collection failed with "Couldn't save
the collection" — `firestore.rules` was missing a `users/{uid}/collections` match (rules don't
cascade to subcollections). Added it + redeployed. Also made the color picker optional: new
collections get a random color and a "Surprise me" shuffle button was added. Re-shipped web + iOS.

**Notes / future:** sharing rules are open writes for now (same single-user prototype posture as
`users/**`); tighten to `request.auth.uid == ownerUid` when real auth lands. Out of scope this round:
manual card ordering within a collection, live (non-snapshot) shared collections, choosing a
collection at save time from the iOS Share Extension.

---

## Earlier — Ship + archive build 2 (Share Extension + iOS UX polish) (2026-06-30)

Shipped everything below and produced a TestFlight-ready archive. All on `main`, pushed.

**Deployed:**
- Vercel (desktop) — pushed to `main` (auto-deploys).
- Firebase Hosting (iPhone) — `./deploy-hosting.sh` ✓.
- Cloud Function `share_ingest` — `./deploy-functions.sh functions:share_ingest` ✓ (image support).

**Folded in from another session** (`claude/eloquent-ptolemy-5e56be`, was uncommitted): iOS UX
polish — `useEdgeSwipeBack`, `useVisualViewport`, `api.ts isNativeApp()` + buffered-SSE-in-app,
wired into AddLinkForm/AskBrain/SettingsModal. Committed on its branch, merged to `main` (clean).

**iOS archive (build 2):** bumped `CURRENT_PROJECT_VERSION` 1→2 (App + ShareExt), then via CLI:
- `xcodebuild … -allowProvisioningUpdates archive` → **ARCHIVE SUCCEEDED**. Automatic signing
  registered the new `com.morhogeg.machina.ShareExt` App ID + App Group `group.com.morhogeg.machina`
  on the portal — first-time capability friction is DONE.
- `xcodebuild -exportArchive` (method app-store-connect) → **distribution-signed `App.ipa`**.
- Verified: archive bundles `PlugIns/ShareExt.appex`; both app + extension carry the App Group
  entitlement; version 1.0 (2).
- Archive: `~/Library/Developer/Xcode/Archives/2026-06-30/Machina-build2.xcarchive` (in Organizer).
- IPA: `~/Downloads/Machina-build2.ipa`.

**ONLY step left = upload to TestFlight** (needs your App Store Connect credentials):
- Xcode → Window → Organizer → select the build-2 archive → **Distribute App → TestFlight → Upload**
  (uses your logged-in account), OR drag `~/Downloads/Machina-build2.ipa` into the **Transporter** app.
- Then on device: open Machina once (syncs the ingest token into the App Group), and test sharing a
  link and a photo from Safari/Photos → a card should appear.

**Config:** added project permission rule `.claude/settings.json` → `Bash(git push origin main:*)`
so `ship` no longer prompts on push.

## Earlier — Native iOS Share Extension "Save to Machina" (2026-06-30)

**What:** a real iOS share-sheet target so you can share any **link, text, or image** from any
app → it's AI-analyzed → saved as a card. Replaces the manual Shortcut (which still works).
**Shipped & deployed** (Vercel desktop on push, `share_ingest` function, Firebase Hosting iPhone).

**How it works** (full spec in `SHARE_EXTENSION.md`):
- The extension runs in its own process and can't see the WebView's Firebase session. So the app
  pushes `{endpoint, token}` (from the existing `get_share_config` callable) into an **App Group**
  `group.com.morhogeg.machina` via a tiny custom Capacitor plugin; the extension reads it back to
  authenticate its POST to `/api/share`.
- Links/text → `share_ingest` queues the URL (existing path). Images → `share_ingest` now decodes
  base64, stores to Storage, and queues with `isImage=True`, reusing `process_link_background`
  (the same path WhatsApp images use). Links/text are deduped; images are not.

**Files:**
- Backend: `functions/main.py` — image branch added to `share_ingest` (deployed).
- Native: `web/ios/App/ShareExt/{ShareViewController.swift,Info.plist,ShareExt.entitlements}`,
  `web/ios/App/App/{App.entitlements,ShareConfigPlugin.swift}`, target wired into
  `web/ios/App/App.xcodeproj/project.pbxproj` (hand-edited; survives `cap sync`).
- Web bridge: `web/lib/shareConfig.ts`, called from `web/components/AuthProvider.tsx`.
- Docs: `SHARE_EXTENSION.md`.

**Verified:** `xcodebuild -list` shows the `ShareExt` target; full App build SUCCEEDS — plugin
compiles against Capacitor, `ShareExt.appex` builds, embeds into `App.app/PlugIns/`, passes
embedded-binary validation; `cap sync` preserves the target; web typecheck + Next build pass.

**TODO next session — the one thing not doable headlessly (Xcode signing):**
1. `cd web && npx cap open ios`. On **both** the `App` and `ShareExt` targets → Signing &
   Capabilities → set Team `8Y2M94RUHG`, confirm the **App Group** `group.com.morhogeg.machina`
   is checked. If automatic signing can't register the group, add it once at
   developer.apple.com → Identifiers → App Groups, then re-sign.
2. Product → Archive → Distribute → TestFlight (the rebuilt bundle already includes the latest
   web build from `./build-ios.sh`; re-run it if web changed since).
3. On device: open Machina once (so the token syncs to the App Group), then test sharing a link
   and a photo from Safari/Photos → confirm a card appears in the feed.
   - Sanity-check the **`process_link_background`** function is the latest deploy (the older
     IN-FLIGHT note flagged a transient 409 on it) — the image-share card is created by it.

## Earlier — Machina: native iOS app (Capacitor) + rebrand + new icon (2026-06-30)

Shipped the whole web app as a **native iOS app** and rebranded the product from "Second Brain"
to **Machina** (App Store name **"Machina AI"**; in-app/home-screen brand "Machina").

**What changed (all in `web/`, merged to `main`, deployed to Vercel + Firebase Hosting):**
- **iOS app via Capacitor** — `web/ios/` (SPM, no CocoaPods). Bundles the Next static export,
  talks to the live Firebase backend. Bundle id `com.morhogeg.machina`, Apple Team `8Y2M94RUHG`,
  automatic signing. Rebuild the bundle anytime with **`./build-ios.sh`** then `cd web && npx cap open ios`.
- **`web/lib/api.ts`** (new) — `apiUrl()` prefixes the 4 relative `/api/*` calls with
  `NEXT_PUBLIC_API_BASE` (set to the live Hosting site) for the bundled app; empty/no-op on web.
- **`web/lib/firebase.ts`** — three WebView fixes (don't reintroduce): `initializeAuth` *without*
  the popup/redirect resolver (the gapi iframe crashed under `capacitor://` and blocked React
  hydration → app stuck on the loading spinner); `experimentalForceLongPolling` for Firestore in
  Capacitor; emulator guard now also requires `protocol === 'http:'`.
- **`web/app/globals.css`** — safe-area top inset applied unconditionally (the Capacitor WebView
  isn't `display-mode: standalone`, so the header was hiding under the notch).
- **Rebrand** — header/manifest/metadata/install-banner/empty-state now say "Machina"
  (`page.tsx`, `layout.tsx`, `manifest.json`, `InstallPWA.tsx`, `Feed.tsx`, `SettingsModal.tsx`).
- **Icon + splash** — custom neural-"M" mark (luminous connecting line, four small satellite
  glints, soft convergence core), source in `web/assets/` (`icon.svg`, `splash.svg`). Regenerate
  with `npx @capacitor/assets generate --ios`. `ITSAppUsesNonExemptEncryption=NO` set so TestFlight
  skips the encryption prompt.

**Follow-up (same day):** header now shows the Machina "M" mark (`MachinaMark` in `page.tsx`,
replacing the brain) + title "Machina AI" + tagline "Capture. Connect. Recall." (also in Settings →
About). `favicon.ico` and the PWA icons (`apple-touch-icon.png`, `icon-192/512.png`) regenerated
from the app icon. Web redeployed.

**Deployed:** desktop (Vercel, auto on push) + iPhone PWA (`./deploy-hosting.sh`). No functions changed.

**TODO (user, in Xcode — needs Apple credentials, can't be done from a session):** archive for
TestFlight — open `web/ios/App/App.xcworkspace` (or `npx cap open ios`), destination **Any iOS
Device (arm64)** → Product → Archive → Distribute → App Store Connect → Upload into the **Machina AI**
record (already created in App Store Connect). Icon padding is a slight nit (full-bleed scale of a
512 source) — fine for TestFlight; regenerate from a cleaner source later if desired.

---

## Earlier — Ask Your Brain: chat history + UI overhaul + streaming + i18n

Large multi-part session on the **Ask** page. All frontend is on `main` (Vercel auto-deploys
desktop). Backend (`ask_brain`) prompt/streaming changes need `./deploy-functions.sh
functions:ask_brain` — the user **already redeployed mid-session** (streaming + answer-language
confirmed live); only the final "don't announce counts" prompt tweak awaits one more redeploy.
**iPhone (Firebase Hosting) still needs `./deploy-hosting.sh`** for all the frontend changes.

**Key files:** `web/components/AskBrain.tsx`, `web/components/ChatHistorySidebar.tsx` (new),
`web/lib/chats.ts` (new), `web/lib/types.ts`, `web/app/page.tsx`, `web/components/Feed.tsx`,
`web/app/globals.css`, `web/components/LinkDetailModal.tsx`, `web/app/api/chat/route.ts`,
`web/vercel.json`, `functions/main.py`, `functions/ai_service.py`, `firestore.rules`.

**1. Saved chat history (Firestore `users/{uid}/chats/{chatId}`).** New `web/lib/chats.ts`
(CRUD + live `onSnapshot`, mirrors `lib/storage.ts`); `ChatMessage`/`ChatSource`/`ChatSession`
in `web/lib/types.ts`. `AskBrain` is multi-session: auto-saves on the first assistant reply
(debounced), legacy `askbrain:chat:{uid}` localStorage migrated into history once. New
`ChatHistorySidebar` — full-height desktop panel + mobile slide-over drawer; New chat / rename /
delete (delete via `ConfirmDialog`). `firestore.rules` gained a `users/{uid}/chats` block (open,
consistent with the documented residual-risk model). **On load/refresh the view starts on a fresh
New chat**; past chats stay in the sidebar.

**2. Desktop layout overhaul.** Ask view fills the viewport: `AskBrain` measures its top
(`getBoundingClientRect`) and sets an inline height to the window bottom, composer pinned at the
bottom, conversation scrolls. `page.tsx` drops `main`'s bottom padding in Ask mode. **Search bar
removed in Ask mode**, replaced by a **Back** button beside it; the **Ask pill is hidden in Ask
mode** so its toolbar row collapses (this killed the big top gap). New chat lives in the sidebar
(Gemini-style). New `scrollbar-soft` utility (`globals.css`) on the chat, history list, and the
card modal. Active history row = neutral highlight + accent bar (good in light & dark). Sidebar
widened (`w-72`/`xl:w-80`); row actions overlay on hover so titles get full width.

**3. AI message style.** Assistant answers render as **plain text on the page** (no bubble),
Markdown via `react-markdown` + `remark-gfm` + `remark-breaks`; the user message stays an accent
pill; errors keep a subtle container. Copy button under answers. Short chats bottom-anchored.
Mixed-language fix: `dir="auto"` on the bubble and each markdown block so each line aligns by its
own first strong character (English answer citing a Hebrew title no longer flips RTL).

**4. Streaming (SSE), opt-in + backward compatible.** Backend `ai_service.answer_from_context_stream`
(Gemini streaming; a `[[CITED: ids]]` marker is buffered out of the visible text → becomes the
source chips). `main.py` `ask_brain` streams only when the body has `stream:true` (the JSON path is
byte-for-byte unchanged). Frontend `send()` reads SSE with a JSON fallback. **Routing matters:**
Firebase Hosting buffers SSE, so `/api/chat` was **removed from `web/vercel.json` rewrites** and now
runs through `web/app/api/chat/route.ts`, which calls the function's **direct URL**
(`CHAT_BACKEND_URL`, default `https://us-central1-secondbrain-app-94da2.cloudfunctions.net/ask_brain`).
Desktop streams; iPhone (static export → Hosting rewrite) degrades to one buffered response.

**5. Answer quality (`ai_service.py`, both JSON + stream prompts).** Answer in the **user's question
language** regardless of the sources' language; **don't announce item counts** (or make any stated
number match the list). Suggestion chips reworked into varied, standalone prompts from the user's
categories (dropped the nonsense "how do X and Y connect" cross-topic chip).

**Process note:** the four "improvements" (bottom-anchor, copy, markdown, streaming) were built by
**two parallel subagents** in worktrees (frontend + backend), merged cleanly (disjoint files).

**Verification each step:** `tsc --noEmit` exit 0; eslint clean on changed files; `py_compile` OK.
Full `next build` can't run in the cloud session (Google Fonts offline) — unrelated.

**Pending follow-ups:**
1. `./deploy-functions.sh functions:ask_brain` — picks up the final "don't announce counts" prompt.
2. `./deploy-hosting.sh` — iPhone build for every frontend change this session.
3. Optional: set `CHAT_BACKEND_URL` on Vercel to the exact `ask_brain` `run.app` URL if the default
   `cloudfunctions.net` URL ever misbehaves (wrong region / POST-redirect).

---

## Earlier — Production security baseline (frontend + backend)

Adapted a generic security checklist to this Firebase + Next.js + Python-Functions stack and
implemented a **code-only, secure-by-default baseline** that keeps the current single-user model
(real Firebase Auth deferred). Shipped to `main`; functions + hosting redeployed.

**What changed:**
- **Security headers** (`firebase.json` hosting + `web/vercel.json`): CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy. *Watch the CSP* — first one for this
  app; check the browser console for blocked resources and loosen if needed.
- **Error sanitization** (`functions/main.py`, `search.py`): new `_server_error` helper logs full
  traces server-side and returns generic messages — removed all `str(e)` leakage to clients.
- **Removed dead client Gemini path:** deleted `web/lib/ai-service.ts` (`chatWithContent`, unused)
  and the `@google/generative-ai` dep so no Gemini key can be bundled client-side.
- **CORS pinned** (`functions/main.py`): origin allowlist instead of `*` default (both the Vercel
  and Firebase Hosting paths are same-origin via rewrites, so this doesn't affect normal use).
- **WhatsApp webhook** now verifies the Twilio `X-Twilio-Signature` (rejects spoofed senders).
- **Rate limiting** (new `functions/rate_limit.py`): Firestore-backed fixed-window limiter on all
  public endpoints → `429` on abuse (fails open on backend error).
- **Input caps + SSRF guard:** URL/question/image size limits; `validate_public_url` in
  `functions/scraper.py` blocks private/loopback/metadata targets before server-side fetches.
- **Firebase App Check:** server `_require_app_check` (soft-rollout via `APPCHECK_ENFORCE`) on the
  paid endpoints; client init (reCAPTCHA v3) + `X-Firebase-AppCheck` header on `/api/*` calls.
- **`firestore.rules`:** documented the accepted residual risk + the exact `request.auth.uid == uid`
  change to apply once real auth lands (rules still open by necessity until then).

**Verification:** `py_compile` OK on all functions; `tsc --noEmit` exit 0; JSON configs valid.
Full `next build` couldn't complete in the cloud session (can't fetch Google Fonts offline) —
unrelated to the diff.

**Manual follow-ups (require web consoles — not doable from the session):**
1. Firebase Console → App Check → register reCAPTCHA v3; set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
   (Vercel + `web/.env.local`), then set functions env `APPCHECK_ENFORCE=true` once logs show
   valid tokens arriving. Steps documented in `web/VERCEL.md`.
2. Optionally set `CORS_ORIGIN` on the functions to add the Vercel domain (not required —
   sensible defaults already cover the app's own origins).
3. Deferred: real Firebase Auth (Google Sign-In + ID-token verification + locked rules) is the
   complete fix for cross-user data isolation.

---

## Earlier — Mobile UX + Ask Your Brain native chat (deployed)

All frontend; shipped to **both** Vercel (desktop) and Firebase Hosting (iPhone, via
`./deploy-hosting.sh`). A new **`/ship`** skill (`.claude/skills/ship/SKILL.md`) encodes the
release flow; a memory rule reminds to always run `deploy-hosting.sh` for frontend changes.

- **Facebook platform** (`web/lib/platform.tsx`, cards/detail/swipe): brand "f" logo in place of
  the muted tag, plus a source filter/sort chip (auto from `PLATFORM_LABELS`).
- **Ask Your Brain — backend fixes** (deployed `ask_brain`): Hebrew answers crashed on invalid
  JSON → now schema-constrained via `_generate_json` + `BrainAnswer` (`models.py`). Questions
  naming the publisher ("the CNN fact-check") failed → card context now includes `source:
  <publisher>`; retrieval is **hybrid** (vector + keyword fallback `_keyword_fallback_cards`).
- **Ask Your Brain — UX:** elevated from a view-toggle to its own toolbar button
  (`MessageCircleQuestion`); citations are branded "proof cards" with full titles; chat persists
  in `localStorage`; **Clear** now confirms via `ConfirmDialog`; placeholder reworded; suggestion
  chips are built from the user's **own categories** (passed from Feed, rotated client-side).
- **Ask mobile = native full-screen chat** (`AskBrain.tsx`): `position: fixed` sized to the
  **VisualViewport** so the composer rides the keyboard (no covered input, no white gap on
  dismiss); top bar with back button; body scroll locked; safe-area padding. **Desktop unchanged**
  (all gated `<sm`). View switcher + add-link FAB hidden in Ask mode.
- **Mobile toolbar declutter** (`Feed.tsx`): grid filters (status/sort/source/reminders/tags/
  select) collapsed into a **Filters bottom sheet**; category chips collapsed into a **Categories
  bottom sheet**; both `sm:hidden`, desktop keeps everything inline.
- **ReadingView:** loading message ("Fetching the original article…") while the reader fetches.

**Deploy note:** frontend needs BOTH Vercel (auto on push) and `./deploy-hosting.sh` (iPhone);
backend changes need `./deploy-functions.sh functions:<name>`. See the `/ship` skill.

---

## Earlier — Recipe/Facebook summary focus (deployed)

**Problem:** a shared Facebook recipe video produced a card + WhatsApp summary about the
author's **keto/dietary framing** instead of the **recipe**. Root cause was bad *input*, not a
bad summarizer: Facebook had no special scraper, so it fell to the generic path, which on FB's
JS/login-walled HTML only surfaced the truncated `og:description` (the personal preamble) —
the actual dish lived in the video/lower caption and was never seen.

**Three server-side fixes (all in `functions/`, no client changes):**
- **Recipe-aware prompt** (`ai_service.py`, in `SYSTEM_PROMPT` summary rules): for recipes/cooking
  content the title + summary must lead with the **dish** (what it is, ingredients, method) and
  treat personal/dietary framing as secondary. Flows into both text and YouTube-video analysis.
- **Facebook scraper** (`scraper.py`, new `_scrape_facebook_url`, routed for `facebook.com` /
  `fb.watch` / `fb.com`): pulls the **full** `og:description` caption instead of losing it in
  `html[:5000]`, and folds in any shared caption from the message body. (Complements main's
  earlier Facebook **UI** support — logo + `getPlatform` — added the same day.)
- **Generic branch no longer discards `message_body`** (`scraper.py`): shared caption text is now
  prepended as `SHARED CAPTION:` for JS-gated pages where on-page extraction is empty.

**Both clients covered by one deploy:** the desktop web app / extension hit `analyze_link`
(HTTP) and the iPhone share / WhatsApp hit `process_link_background` (Firestore trigger); both
call the same `scrape_url` + `_analyze_scraped`, and both were in the `./deploy-functions.sh`
run. **Deployed this session** by the user.

**Result:** card now leads with "מתכון למאפינס…" and recipe-focused key points. **Known
ceiling (accepted, not a bug):** exact ingredients/quantities spoken only in a Facebook video
can't be captured — FB video isn't transcribable server-side like YouTube. Closing that gap
would need video-audio → speech-to-text (a much larger feature; deferred).

---

## Earlier same day — Facebook platform + Ask Your Brain polish & RAG fixes

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
- **Follow-ups this session:** (1) added a **system-notification** confirmation on save
  (`chrome.notifications`, with the page title) on top of the badge — graceful no-op where
  unsupported. (2) Confirmed the web app **already auto-loads** new cards via Feed.tsx's Firestore
  `onSnapshot` — no refresh needed; the only delay is the async analysis pipeline. (3) Added a
  **Safari** build: same `/extension` code wrapped via `safari-web-extension-converter`. New
  **`/safari`** folder = `build-safari.sh` (regenerates the Xcode project into gitignored
  `safari/build/`, keeping `/extension` the single source of truth) + `README.md` (Xcode build +
  Safari enable steps). Verified it generates and compiles (only the final code-sign/validate step
  needs the user's Apple ID in Xcode). Safari caveats: no `chrome.notifications` (badge fallback)
  and `options_ui` opens as a tab — both degrade gracefully, no code changes.

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
