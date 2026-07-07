# Machina AI — Single Source of Truth

> **This is the ONE document.** It consolidates and supersedes: `HANDOFF.md`,
> `HANDOFF-iOS-AUTH.md`, `TASKS.md`, `MACHINA_SPEC.md`, `PRODUCT_REVIEW.md`,
> `PRODUCTION_READINESS_AUDIT.md`, and `ios-qa-report.md` (all deleted; full text
> lives in git history — last commit containing them: see `git log -- HANDOFF.md`).
>
> **How to use it:**
> - **Learning the code?** Start at §1–§3 (product, architecture, operations).
> - **Picking work?** §4 is the ranked backlog — every open task lives there.
> - **Finishing a session?** Update §4 (check boxes, re-rank if needed) and add a
>   one-paragraph entry to §9 (session log). Do NOT create new handoff/spec docs.
>   Keep §9 to the recent window — page older entries down to
>   `docs/reference/session-log-archive.md` as it grows.
> - **Skills** (`.claude/skills/ship`, `.claude/skills/verify`) point here; keep it that way.
>
> This doc is the **hot path** — kept slim so it's cheap to load every session. The
> one-time strategy reviews (former §6–§8) now live in `docs/reference/`:
> `app-store-readiness.md`, `cost-and-keys.md`, `marketing.md`, plus
> `session-log-archive.md` (older §9 entries). See the §6–8 pointer below.
>
> Remaining *reference* docs (how-to guides, not task trackers — they stay):
> `AUTH_SPEC.md` (auth design), `NATIVE_AUTH_SETUP.md` (auth cutover console/Xcode
> steps), `SHARE_EXTENSION.md`, `SHORTCUT_SETUP.md`, `docs/IOS_CICD.md` (TestFlight
> CI secrets/setup), `web/VERCEL.md`, `extension/README.md`, `README.md` (public-facing).
>
> **Last full review:** 2026-07-03 — every task below was verified against the
> actual code on `main`, not just against what old docs claimed.

---

## 1. What Machina is

**Machina AI** (`com.morhogeg.machina`) — an AI-powered personal knowledge base.
Capture a link/image from anywhere (iOS share sheet, WhatsApp, web UI, browser
extension) → Python Cloud Function scrapes + Gemini analyzes → a structured card
(summary, category, tags, concepts, embedding, related links) lands in a real-time
feed with semantic search, RAG chat ("Ask Machina"), spaced-repetition reminders,
curated digests, weekly AI synthesis, and collections.

**Positioning (from the product review):** the hero is the **Recall Engine** —
"ask your own knowledge and get a cited answer" — backed by the widest capture
surface in the category and a knowledge graph computed on every save. The path to
"Apple would ship this" is subtraction, trust, and focus — not more features.

**Product grade trajectory:** review scored it ~7.5/10 (2026-07-01). Phase 1
(trust + name) and Phase 2 (reveal the magic + cut sprawl) of the product spec are
**done** (see §4.9). Phase 3 differentiators are not started.

## 2. Architecture & stack

- **Frontend:** Next.js 16 + React 19 + Tailwind v4 in `web/`. Static export for
  Firebase Hosting + Capacitor; native Next build on Vercel (`VERCEL=1` disables
  export). Theme tokens (`text-text`, `bg-card`, `--accent-gradient`…) — never
  hardcode white/black. Easing tokens: `--ease-modal` (all modals), `--ease-spring`
  (card grid only).
- **iOS app:** Capacitor 8 shell (`web/ios/`, SPM, no CocoaPods) + native **Share
  Extension** (`web/ios/App/ShareExt/`) that authenticates via an ingest token
  bridged through App Group `group.com.morhogeg.machina`
  (`ShareConfigPlugin.swift`). Plugins: haptics, share, firebase-authentication
  (all three in the committed SPM manifest as of 2026-07-03). Team `8Y2M94RUHG`.
- **Backend:** Python 3.13 Firebase Cloud Functions in `functions/` (project
  **`secondbrain-app-94da2`**, us-central1). Gemini `gemini-3.1-flash-lite`
  (analysis/vision, centralized in `GEMINI_ANALYSIS_MODEL`), `gemini-embedding-001`
  (search). Twilio (WhatsApp). SendGrid/SMTP (email digests — not yet configured).
- **Data:** Firestore `users/{uid}/…` where **uid = phone number** (e.g.
  `+1646…`); Google/Apple accounts link via `authUids[]` on the user doc (no data
  migration — see `AUTH_SPEC.md`). Subcollections: `links`, `chats`, `collections`,
  `syntheses`. Public snapshots: `shared_cards`, `shared_collections`.
- **Deploy surfaces:**
  - **Desktop web** → Vercel (`my-links-sable.vercel.app`), auto on push to `main`,
    Root Directory = `web`.
  - **iOS app** → GitHub Actions **"iOS → TestFlight"** workflow
    (`.github/workflows/ios-testflight.yml`, macOS runner, cloud-managed signing,
    build number = 1000 + run number). Manual dispatch only during the auth
    cutover. Run #6 (2026-07-02) is **green** and uploaded a UI-only build.
  - **Firebase Hosting** (`secondbrain-app-94da2.web.app`) — no longer a user-facing
    deploy target (the iPhone PWA is retired in favor of the native app), but the
    origin still matters: it serves the `/api/*` rewrites the native app calls
    (`NEXT_PUBLIC_API_BASE`) and the `/s`, `/c` share pages (`share_page` function).
    Redeploy hosting only when `firebase.json` rewrites change.
  - **Functions** → `./deploy-functions.sh functions:<a>,functions:<b>` (always
    pass explicit targets; scheduler/webhook fns aren't in the default set).

### Operational gotchas (hard-won — don't re-learn these)

- `GEMINI_API_KEY` and `TWILIO_*` are **plain env vars in `functions/.env`**
  (gitignored) — NOT Secret Manager secrets; binding them as secrets breaks deploy.
  Functions deploy needs a local venv (`cd functions && python3.13 -m venv venv &&
  venv/bin/pip install -r requirements.txt`) so firebase-tools can import the source.
- `deploy-functions.sh` pins `--project secondbrain-app-94da2` (a `firebase use`
  override once sent deploys to the wrong project) and auto-prefixes `functions:`.
- `process_link_background` (Firestore-trigger fn) sometimes 409s on deploy —
  retry in ~60s.
- `web/lib/firebase.ts` WebView fixes (don't reintroduce): `initializeAuth`
  without the popup resolver (gapi crashes under `capacitor://`),
  `experimentalForceLongPolling` for Firestore, emulator gate requires
  `localhost` + `http:` (so `http://127.0.0.1:3000` previews against prod data).
- **Native detection: never use `Boolean(window.Capacitor)`.** `@capacitor/core`
  defines `window.Capacitor` in a PLAIN BROWSER too, so that test is truthy on the
  web and mis-flags web as native (it silently disabled the web sign-in gate for
  the entire pre-cutover era — fixed 2026-07-06, commit `0acf578`). Detect native
  via `window.location.protocol === 'capacitor:'` or `Capacitor.isNativePlatform()`
  (false on web). `isNativeApp()` in `web/lib/api.ts` is the canonical check.
- CORS allowlist in `functions/main.py` `_allowed_origins()` must include
  `capacitor://localhost` (+ `ionic://`, `https://localhost`) or every native
  `/api/*` call fails with a bare "Load failed".
- SSE is buffered in WKWebView — native Ask uses buffered JSON
  (`wantStream = !isNativeApp()`); `/api/chat` bypasses Hosting via
  `web/app/api/chat/route.ts` → the function's direct URL.
- Web builds self-host fonts (`geist` package) so builds never fetch Google Fonts.
- Cloud sessions can't reach `*.run.app` URLs (egress allowlist) — verify deployed
  functions via the app, not curl.
- **iOS CI signing — the hard-won rules (2026-07-04):** the archive step MUST
  be signed (automatic signing + `-allowProvisioningUpdates` + ASC key).
  **Never switch to an unsigned archive + sign-at-export**: build 1018 shipped
  that way and silently **lost the App Group entitlement**, killing the Share
  Extension token bridge ("Open Machina and sign in first") — entitlements are
  baked at archive-time codesign and export re-signing doesn't restore them.
  A CI step now cracks open every exported IPA and fails if the App Group
  entitlement is missing from the app or the extension. Known cost of signed
  archives: each ephemeral runner mints an Apple *Development* cert, and
  Apple caps those — when archive fails with "maximum number of certificates"
  (runs #15/#16), **prune Development certs at developer.apple.com →
  Certificates** (safe; they regenerate). A global `CODE_SIGN_IDENTITY`
  override is also not an option — it leaks onto every SPM target (run #17).
  Durable fix candidate (backlog): import one stable dev cert as a CI secret.
- **Two parallel Claude sessions:** TestFlight runs share one concurrency group
  and one build-number sequence (1000 + run number) — runs queue, numbers never
  collide, but a build only contains its own branch's code. Sync with
  `origin/main` before triggering a build, and coordinate via §9 here.
- Frontend check: `cd web && npx tsc --noEmit`. Backend: `cd functions &&
  python -m py_compile *.py`.

## 3. Auth — exact current state (the thing everything gates on)

The multi-user auth work is **fully written but not live**:

- **Code done:** Google + Apple sign-in on web and native (`web/lib/auth.ts`,
  `@capacitor-firebase/authentication@^8.3.0`), `AuthProvider` gating both
  platforms, backend ID-token verification (`_verify_bearer`/`_authed_uid` on all
  data endpoints), `claim_workspace` + `delete_account` callables, locked ruleset
  staged in `firestore.rules.locked`, `PrivacyInfo.xcprivacy` for both targets,
  Sign in with Apple entitlement.
- **Flag-gated OFF:** `REQUIRE_AUTH` (functions) / `NEXT_PUBLIC_REQUIRE_AUTH`
  (web) are unset → live behavior is still web-Google-gate + native
  first-user-doc + backend trusting client `uid`.
- **Live `firestore.rules` are still `allow read, write: if true`.**
- **CI blocker: FIXED in code (2026-07-03), root cause corrected.** It was never
  a version conflict — the Capacitor 8 SPM binary gates core APIs
  (`CAPPluginCall.reject`, `getString(_:)`, …) behind the `$NonescapableTypes`
  Swift feature in its `.swiftinterface`; **Xcode 16 (macos-14) strips those
  symbols** so `@capacitor/share` failed to compile (ionic-team/capacitor#8333),
  while Xcode 26 resolves them (proven by green run #6, which built all three
  plugins with no strip). Fix: workflow now runs on `macos-26` + `Xcode_26*`, the
  `sed` strip is removed, and the committed `CapApp-SPM/Package.swift` lists all
  three plugins. Awaiting one CI run to confirm, then on-device sign-in
  verification. Cutover order (do not deviate): `NATIVE_AUTH_SETUP.md`.

## 4. THE BACKLOG — ranked, most urgent → least

> Verified against code 2026-07-03. "Done" claims below were checked, not copied.
> Rank = (blocks launch) > (App Store hard requirement) > (security/cost exposure)
> > (product quality) > (growth/differentiators).

> **Live state (2026-07-05):** Apple **and** Google sign-in are **device-verified**
> on iOS (first on build 1033). The native **`claim_workspace` callable→CORS bug
> is FIXED** — HTTP twins `claim_workspace_http`/`delete_account_http` deployed +
> curl-verified, native routes to them; a fresh `require_auth=true` TestFlight
> build (1037) carries it. Web login now offers Apple+Google (no cutover). `claim_workspace`
> + `delete_account` (callables + HTTP twins) deployed with flags still OFF. The
> **top remaining work is the auth cutover (task 2)** and prerequisites (tasks 4/5):
> before flipping, set the Apple **Services ID + `.p8`** for web Apple sign-in, and
> device-verify the brand-new-user claim path (needs backend `REQUIRE_AUTH` on).
> Everything else is P2/P3.

### 🔴 P0 — launch blockers (in order)

1. **[x] Native auth build green (iOS)** *(code done 2026-07-03 — root cause was
   the Xcode 16 toolchain, not a dependency conflict; see §3. Workflow moved to
   `macos-26`/Xcode 26, `sed` strip removed, all three plugins in the committed
   SPM manifest. This also satisfies Apple's current-SDK submission floor —
   former task 10. **CI-confirmed 2026-07-03:** run #7 built all three plugins
   and uploaded build 1007 to TestFlight.)* **✅ Sign-in DEVICE-VERIFIED
   2026-07-05:** ran the workflow with **`require_auth=true`** and confirmed
   **both Apple and Google** sign in on device and load the feed (build 1033,
   then build 1037 which also carries the native claim CORS fix — see task 2).
   CI injects the `REVERSED_CLIENT_ID` URL scheme into Info.plist at build time
   (native Google sign-in couldn't return to the app otherwise;
   `NATIVE_AUTH_SETUP.md` §4.2 automated).
2. **[ ] Auth cutover** *(code-side prep done 2026-07-03; owner steps remain).*
   Prep completed: `firestore.rules.locked` updated — added `syntheses`;
   **rewrote the `users` read rule** (the old `owns()` `get()` was unprovable for
   the `authUids array-contains` list query and would have bricked every sign-in
   at cutover); client create/delete on user docs denied. `retryFailedLink` now
   sends the bearer header; `backfill_related_links` is admin-gated; a rules
   test suite exists in `firestore-rules-test/` (**run on the owner machine** —
   the cloud sandbox can't download the emulator JAR). **2026-07-05 — code now
   fully cutover-ready:** fixed the native `claim_workspace`/`delete_account`
   **callable→CORS bug** (Firebase callables fail the `capacitor://localhost`
   preflight in the WKWebView) with HTTP twins `claim_workspace_http`/
   `delete_account_http` (bearer + `_allowed_origins` CORS); native routes to
   `/api/claim-workspace` + `/api/delete-account`, web keeps the callable —
   **deployed + curl-verified.** Web login now also shows Apple+Google (no
   cutover). **Owner steps that REMAIN before flipping** (nothing left in code):
   (1) configure the Apple **Services ID + `.p8`** in the Firebase Apple provider
   — REQUIRED for web Apple sign-in (native didn't need it; the web Apple button
   errors until then); (2) set `OWNER_EMAIL` (+ task 5 env) so only the owner can
   claim the legacy workspace; (3) flip `REQUIRE_AUTH` +
   `NEXT_PUBLIC_REQUIRE_AUTH`, redeploy functions + web; (4) `cd
   firestore-rules-test && npm test`; (5) `cp firestore.rules.locked
   firestore.rules && firebase deploy --only firestore:rules` (point of no
   return); (6) device-verify the **brand-new-user** claim path (fresh non-owner
   account → auto-created workspace — only works once `REQUIRE_AUTH` is on).
   Flagged decision: `get_article` stays anonymous-callable
   (App Check + rate limit only) — keep or gate deliberately. Closes audit
   blockers B-1/B-2/B-3. Full checklist: `NATIVE_AUTH_SETUP.md` §6.
3. **[x] New-user path** *(code done 2026-07-03; goes live with the task-2
   cutover — flag-gated behind `REQUIRE_AUTH`).* `claim_workspace` now falls
   back to creating a fresh `users/{authUid}` workspace (authUids/email/
   createdAt/default settings + ingest token) for any verified account that
   can't claim the OWNER_EMAIL-gated legacy doc; the web app shows a one-screen
   welcome (`web/components/Onboarding.tsx`, dismissal on the user doc
   `onboarded` + localStorage fallback) instead of the restricted screen, which
   now remains only for creation failures (with a Retry). Example-card seeding
   was skipped (optional). Ships with the task-2 functions deploy — no separate
   action.
4. **[ ] Pending deploys/verifications from the last sessions** (owner machine):
   - `./deploy-functions.sh` — M12 weekly synthesis backend is written but dark.
   - `firebase deploy --only firestore:rules` — the `syntheses` read rule.
   - M9 backfill (See-also for old cards): **now a one-tap in-app action** —
     after the deploy above ships the `rebuild_connections` callable, tap
     **Settings → Connections → Rebuild** (per-user, no admin token, batched so
     it can't time out). The admin all-users `backfill_related_links` HTTP fn
     still exists as a fallback (`curl -H "X-Admin-Token: $ADMIN_TOKEN" …`).
   - Confirm `backfill_youtube_channels` was run (channel-name repair).
   - `/api/analyze` 60s timeout on slow YouTube videos — route around Hosting's
     60s cap like `/api/chat` did (touches all link-saving; test carefully).
5. **[ ] Security config + key hygiene (30 min, do with #2):** set `ADMIN_TOKEN`,
   `APPCHECK_ENFORCE=true`, `OWNER_EMAIL` in functions env. **Rotate the Gemini
   key** (was pasted in chat 2026-06-23) and the **App Store Connect API `.p8`**
   (pasted in plaintext during CI setup).

### 🟠 P1 — App Store submission requirements (full readiness review: `docs/reference/app-store-readiness.md`)

6. **[x] AI-consent disclosure (Guideline 5.1.1/5.1.2 as updated Nov 2025).**
   Apps sending personal data to third-party AI must name the provider and get
   explicit consent. Machina sends saved URLs/images/questions to **Google
   Gemini**. *Code done 2026-07-03:* first-run consent gate
   (`web/components/AIConsentNotice.tsx`, mounted in `AuthProvider` after the
   sign-in/restricted screens and before the welcome screen + tour, on BOTH
   platforms — not behind the auth flags) with persistence in localStorage
   `ai-consent-v1` mirrored to `aiConsentAt` (ms) on the user doc
   (`web/lib/aiConsent.ts`); Settings "AI & privacy" section names Gemini,
   shows the consent date, links Privacy Policy + Terms (native-safe via
   `policyUrl`/`openExternal` in `web/lib/share.ts`). Existing users see it
   once too. **Remaining:** privacy-policy coverage lives with task 8's
   `/privacy` page; verify the flow on device/TestFlight.
   *New requirement — not in the old audit.*
7. **[x] Privacy manifests wired into both Xcode targets** *(done 2026-07-03:
   both `PrivacyInfo.xcprivacy` files wired into `project.pbxproj` by hand —
   file refs + build files + group membership + Copy Bundle Resources for App,
   and a new Resources build phase created for ShareExt, which had none.
   **CI-confirmed:** run #8 (2026-07-03) archived and uploaded build 1008 with
   the edited pbxproj — Xcode accepted the wiring. Spot-check the manifests in
   the delivered build via TestFlight/Connect if paranoid).*
8. **[x] Privacy policy + Terms URLs, App Privacy "nutrition label", App Store
   metadata** *(doc/code side done 2026-07-03).* Hosted pages live:
   `web/app/privacy/page.tsx` + `web/app/terms/page.tsx` (static, prose,
   theme-tokened; content verified against the code — Gemini/Twilio/Firebase
   processors, share-page caveat, `delete_account` scope). They are **public**:
   `web/lib/publicRoutes.tsx` (used by `app/layout.tsx`) skips the
   AuthProvider gate on `/privacy` + `/terms` so App Review can read them
   signed-out. Nutrition-label declarations, metadata (name/subtitle/
   keywords/description), and age-rating answers drafted in
   `docs/APP_STORE.md` §1–§2. In-app Settings link ships with task 6.
   **Remaining manual:** click the declarations + metadata into App Store
   Connect, take the screenshots (`docs/APP_STORE.md` §4), name a concrete
   governing-law jurisdiction in `/terms` §10 before public launch.
9. **[ ] Reviewer readiness.** Demo account credentials for App Review (auth will
   be ON), review notes explaining WhatsApp capture (reviewer can't test Twilio),
   and either iPad screenshots or set `TARGETED_DEVICE_FAMILY = 1`. *Device
   family half done 2026-07-03: `TARGETED_DEVICE_FAMILY = 1` set in all four
   build configs (App + ShareExt, Debug + Release) — iPhone-only, no iPad
   screenshots needed. Doc side done 2026-07-03: review-notes template (demo-
   account placeholder + fresh-sign-in-auto-creates-workspace explanation,
   WhatsApp-is-optional/test-share-sheet-instead, AI-consent-on-first-run,
   Sign in with Apple) and the 6-screenshot shot-list are in
   `docs/APP_STORE.md` §3–§4. **Remaining:** create + seed the demo account
   post-cutover, fill its credentials into the notes, take the screenshots.*
10. **[x] CI SDK check** *(done 2026-07-03, folded into task 1: the workflow now
    runs on `macos-26` with `Xcode_26*`, satisfying Apple's current-SDK
    submission requirement in effect since April 2026).*
11. **[ ] On-device verification sweep** (can't be done headlessly, one pass on a
    physical iPhone): share-ext neutral "still saving" state under killed network
    (never a false green check); haptics on favorite/delete/save/PTR/confirm;
    keyboard never covers inputs (LinkDetailModal category/tag, AddToCollection,
    AddLinkForm on iPhone SE); pull-to-refresh vs edge-swipe conflicts; failed
    card → Retry; Apple + Google sign-in; account deletion end-to-end.

### 🟡 P2 — security/cost hardening & honest product surface

12. **[ ] Ingest token hardening (audit H-1).** Move from App Group UserDefaults
    to Keychain; server copy to a functions-only collection; add rotation.
13. **[ ] Remaining audit mediums:** per-uid rate limits post-auth + fail-closed
    on paid buckets (M-3), cap `ask_brain` history (M-5), mask remaining phone
    logs in `link_service.py`/`whatsapp_handler.py` (H-4 residue).
14. **[ ] README ↔ reality (M-P5/T12) — still false.** Verified 2026-07-03: README
    claims Graph *Visualization*, Insights Dashboard, "Works Offline", Table view —
    none exist. Rewrite to describe the real product (recall engine, capture
    surface, synthesis). Also remove the PWA badge/positioning.
15. **[ ] Retire the iPhone-PWA surface deliberately.** The native app replaced
    it: remove `InstallPWA.tsx` (or gate to Android only), stop advertising
    install-to-home-screen, and stop routine `./deploy-hosting.sh` runs (already
    removed from the ship skill). Keep Hosting alive solely for `/api/*` rewrites +
    share pages.
16. **[ ] Offline decision (M15).** No service worker exists. Either build
    read-cache offline for opened articles or (cheaper) drop every offline claim
    (fold into 14).
17. **[ ] Light theme decision (M-P1).** Give light mode the dark theme's material
    care, or ship dark-only intentionally. Decide, don't leave half-done.
18. **[ ] Test harness (T3).** Only `functions/test_yt_scrape.py` exists. Add
    scraper fixtures, `ai_service` schema-contract tests, `search.py` tests,
    WhatsApp payload smoke test; wire into CI/SessionStart.
19. **[ ] Cost guardrails.** Budget alerts on the Firebase/GCP project; per-user
    monthly quotas (see `docs/reference/cost-and-keys.md`); email digest provider decision (SendGrid key or cut
    the email channel).

### 🟢 P3 — product roadmap (post-launch)

20. **[ ] M17 Voice capture + voice ask** (mic in AskBrain; WKWebView speech quirks).
21. **[ ] M18 Proactive brain** (contradiction/reinforcement observations; needs push notifications — also not implemented).
22. **[ ] M19 Shareable cited answers** (growth surface; `share_page` backend exists).
23. **[ ] M20 Auto-collections** (cluster `concepts`/embeddings into suggested collections).
24. **[ ] T10 export** (MD/PDF/HTML from ReadingView), **T11 highlights**, T5/T6
    connector framework + YouTube liked-videos sync (pull connectors; IG/FB saved
    have no legitimate API — won't do), Chrome Web Store listing for the extension.
25. **[ ] QA backlog leftovers** (from the F-series, still open): F-16 ref-counted
    scroll locks, F-20 ReminderModal past-times/date-rollover, F-21 offline signal
    for optimistic writes, F-24/25/26 SimpleMarkdown + RTL unification, F-29
    SwipeDeck undo doesn't cancel reminders, F-31 Reader "Listen" reliability,
    F-32 SwipeDeck stale snapshot, L-5 unbounded `deleteCollection` batch.

### ✅ Done — verified against code (do not redo)

- **Product spec Phases 1–2 complete:** M1 (one name), M2 (share-ext never lies),
  M3 (processing→ready|failed lifecycle + Retry), M4 (deep-link opens once), M5
  (visual-viewport everywhere), M6 (honest progress), M7 (settings dirty-guard),
  M9 (See also + backfill fn), M10 (connection insights), M11 (haptics), M12
  (weekly synthesis — code; deploy pending, task 4), M13 (Compact cut), M14
  (option sprawl trimmed), M16 (pull-to-refresh), M-P2/P3/P4 (motion/targets/timing).
- **Auth code complete** (M8/T1 = audit B-1/B-2/B-3/B-5/B-7): native+web
  Google/Apple sign-in, token-verified backend, account deletion, locked rules
  staged — **cutover pending** (tasks 1–2).
- **Audit Batch 1:** SSRF redirect guard, PII log scrubbing (main.py), Twilio
  fail-closed, fetch timeouts, admin-token-gated debug endpoints, noopener,
  URL-scheme guards, sanitized errors, privacy manifest files created.
- **Capture surface:** Share Extension (links/text/images + scan HUD), WhatsApp
  (EN/HE + digest commands), web add/image, browser extension (`/extension`,
  Chrome/Edge/Brave + Safari converter), iOS Shortcut (legacy, still works).
- **Recall:** Ask Machina (hybrid RAG, streaming on web, chat history), semantic
  search, reminders, curated digest (6 modes), weekly synthesis, collections +
  public share pages (server-rendered OG), reading view + TTS.
- **CI:** iOS → TestFlight workflow green (UI-only build 1006, 2026-07-02);
  secrets configured; cloud-managed signing works.
- **T15 polish pass, T2 pipeline consolidation** (Python canonical; TS routes are
  thin proxies), **T9 extension**, **T14 share capture** — shipped.

## 5. Ship checklist (what the `/ship` skill automates)

1. Scope the diff (`web/`? `functions/`? docs-only?).
2. Typecheck web + `py_compile` functions.
3. Merge to `main`, push → **Vercel auto-deploys desktop**.
4. Backend changed → `./deploy-functions.sh functions:<explicit,targets>`.
5. App changed → trigger **"iOS → TestFlight"** GitHub Actions workflow (manual
   dispatch; auto-trigger re-enables after the auth cutover).
6. `firebase.json` rewrites changed → `./deploy-hosting.sh` (otherwise skip —
   the iPhone PWA is retired).
7. Update **this document** (§4 checkboxes + §9 session log).

---

## 6–8. Strategy episodes — moved to `docs/reference/`

The one-time strategic reviews that were §6–§8 are now reference docs — read
occasionally, not every session, so kept out of the hot path (progressive
disclosure). Full text preserved verbatim:

- **App Store readiness review** (was §6) → `docs/reference/app-store-readiness.md`
- **Cost, API keys & user journey** (was §7) → `docs/reference/cost-and-keys.md`
- **Marketing plan + launch assets** (was §8) → `docs/reference/marketing.md`

## 9. Session log

> One short paragraph per session, newest first. Detail lives in git history and
> PR descriptions — this is the orientation trail, not a changelog.

- **2026-07-06 — "Show by" status filter now has a dismissable pill (commits
  `f575529`, `c77f873`).** The status filter (Archive/Favorites/Unread/Read/
  Reminders) changed the feed but left no on-page indicator — unlike tags. Added a
  row in `Feed.tsx` (above the cards, before the tag row): a contextual icon +
  "Showing:" label + the active filter's name as a pill with an X, shown whenever
  `filter !== 'all'` in `isLibraryView`; renders on **both web and iOS** (shared
  path, same as the tag row). **Design decision:** Show stays **single-select**
  (its options are mutually-exclusive view lenses; multi-select combos like
  "Favorites OR Archived" are confusing and rarely wanted), so the chip's X is the
  clear — **no separate "Clear All"** (that was in the first cut `f575529`, removed
  in `c77f873` as redundant). The tag row keeps Clear All because it's genuinely
  multi-select. Frontend-only. **SHIPPED:** web via Vercel; TestFlight **run #41 →
  build 1041** (superseding the interim build 1040).
- **2026-07-06 — Card ↔ open unified into one thought at two zoom levels
  (commit `51bd9fa`).** Follow-up to the summary-quality ship below: the card
  `summary` and the open `detailedSummary` were two independent paraphrases, so
  the closed text was never a subset of the open text — and the open view's own
  overview paragraph was a second, differently-worded gist. Fix: `detailedSummary`
  no longer writes an overview (prompt now forces it to START at "## Key Points"
  and complement, not restate, the summary); `LinkDetailModal` leads the open view
  with the bolded card `summary`, then the Key Points/Conclusions expand below.
  Backward-compat: legacy cards whose `detailedSummary` still has a leading
  overview are sliced to the first "## " so the open view never shows two
  overviews; section-less legacy prose is shown alone (no lead) to avoid dup.
  **SHIPPED:** merged to `main` (web via Vercel); redeployed `analyze_link` +
  `process_link_background`; TestFlight **run #39 → build 1039**. Existing cards
  keep stored text until re-saved (their detailedSummary still has an overview,
  but it's now stripped on open — so old cards already read correctly).
- **2026-07-06 — Summary quality: X Articles fixed + tighter prompts + open-state
  highlights.** Root-caused a bad card (a bayeslord post — "46 thoughts on the near
  future," 46 numbered observations — summarized as a generic, hallucinated
  "algorithmic transparency" blurb). Cause was **not** the prompt: the post is an
  **X Article** (long-form), whose body lives in `tweet.article.content.blocks`
  (Draft.js), NOT `tweet.text` (empty). `_scrape_twitter_url` treated it as
  empty → fell through to a thin OG-metadata scrape → Gemini invented content.
  Fix (`functions/scraper.py`): `has_article` now triggers the fxtwitter path, and
  new `_format_twitter_article()` reconstructs the article (title + headings +
  **numbered** ordered-list items) — verified live: 22K chars of real content
  instead of a placeholder. Prompt hardening (`functions/ai_service.py`,
  SYSTEM_PROMPT): summary must **lead with substance** (banned vague meta-openers
  like "This article examines the relationship between…"), **lists/threads** must
  surface 2-3 specific points not just "this is a list," a **GROUNDING** rule
  forbids fabricating when content is empty/placeholder, and `detailedSummary` now
  gets the same **`**bold**` scannability** as the short summary. Open-state
  highlights (repeat user ask): `SimpleMarkdown` already renders `**bold**`, but
  the detail modal shows `detailedSummary`, which never carried bold — so
  highlights vanished on open. Two-part fix: new cards bold the detailedSummary
  itself; for **existing** cards (no bold in detailedSummary) `LinkDetailModal`
  now leads with the highlighted short summary (auto-suppressed once the detailed
  body carries its own `**`, so no redundancy for new cards). tsc + py_compile
  clean. **SHIPPED (commit `54c33dc`):** merged to `main` (web live via Vercel);
  **deployed `analyze_link` + `process_link_background`** — so the summary-quality
  fix is live on BOTH web and iOS immediately (they call the same functions);
  TestFlight **run #38 → build 1038** triggered for the iOS modal-highlight fix.
  Note: existing cards keep their stored summaries until re-saved/re-analyzed —
  only the open-state highlight *lead* is retroactive; re-saving the bayeslord
  link now yields the corrected article summary.
- **2026-07-06 — "Open Machina" from the share sheet → in-app progress banner.**
  When sharing into Machina from another app, the Share Extension HUD now offers
  an **Open Machina** button next to the ✕ (`ShareViewController.swift`). Tapping
  it stamps a short-lived `pendingShareAt`/`pendingShareKind` hint in the App
  Group, opens the app via a new **`machina://` URL scheme** (registered in
  `Info.plist`; coexists with the CI-injected `REVERSED_CLIENT_ID` scheme —
  extension launches the host app by walking the responder chain to `openURL:`),
  and dismisses the sheet (the upload keeps running on its background session).
  On open, the app flashes the **same "Analyzing… N%" banner** the in-app add
  flow shows when its dialog is closed: `ShareConfigPlugin.consumePendingShare`
  reads+clears the hint, `web/lib/useSharedCaptureBanner.ts` seeds an optimistic
  ramp on mount + every foreground (visibilitychange/focus), and it hands off
  seamlessly to the real Firestore-driven `useProcessingBanner` the instant the
  `processing` card streams in (`page.tsx` `pickBanner` merges the three
  sources). Deduped re-shares (server no-op, no card) ease to the ceiling then
  finish gracefully. No new Capacitor/SPM plugin (reused the existing
  `ShareConfig` custom plugin). Web-safe no-op in a plain browser. tsc clean;
  `next build` compiles. Needs an iOS build (Info.plist + ShareExt + app plugin
  changed) — ship via TestFlight.
- **2026-07-06 — 🐛 Root-caused why web sign-in never worked: `isNativeApp()`
  mis-detected the browser as native.** After adding Apple+Google to web, the web
  app *still* opened straight to the owner's feed with no login (verified on
  iPhone Safari, fresh incognito, exact Vercel URL). The live bundle WAS current
  (contained `/api/claim-workspace`, "Continue with Apple"), so not a stale
  deploy. Cause: `isNativeApp()` returned `true` on the web because it tested
  `Boolean(window.Capacitor)` — but **`@capacitor/core` defines `window.Capacitor`
  in a plain browser too**. So every web page took the *legacy native path*
  (loads the owner workspace, no gate) and never showed the login. **This means
  web sign-in had NEVER actually engaged.** Fix (`web/lib/api.ts`, commit
  `0acf578`): detect native via the `capacitor:` origin or
  `Capacitor.isNativePlatform()` (false on web); native unaffected (keys off the
  `capacitor:` protocol, so build 1037 is fine). Web now gates → shows
  Apple/Google login → routes to the web sign-in flow (which already passes
  `browserPopupRedirectResolver`). **Shipped to web (Vercel) only; no new iOS
  build.** ⚠️ Gotcha for future code: never treat `window.Capacitor`'s presence
  as a native signal (added to §2). Note: `firebase.ts` `isCapacitor` has the
  same pattern but is left as-is (it only picks Firestore long-polling, which
  works on web either way). Pre-cutover exposure unchanged: a random web sign-in
  can still claim the junk `Auto-ID` doc until `OWNER_EMAIL` is set + cutover.

> **Older entries (2026-07-05 and earlier)** are archived in
> `docs/reference/session-log-archive.md` — keeping this trail short so the
> source of truth stays fast to load. Add new sessions at the top here.

## 10. Known accounts / IDs (quick reference)

- Firebase project: `secondbrain-app-94da2` (us-central1). Vercel:
  `my-links-sable.vercel.app`. Bundle: `com.morhogeg.machina`, Team `8Y2M94RUHG`,
  App Group `group.com.morhogeg.machina`.
- Repos: `morhogeg/MyLinks` (this app), `morhogeg/versus` (empty — LICENSE only).
- Live user doc uid = owner phone number; data keyed by it forever (by design —
  `AUTH_SPEC.md` §2).
