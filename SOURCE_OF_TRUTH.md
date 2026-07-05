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
> - **Skills** (`.claude/skills/ship`) point here; keep it that way.
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

### 🔴 P0 — launch blockers (in order)

1. **[x] Native auth build green (iOS)** *(code done 2026-07-03 — root cause was
   the Xcode 16 toolchain, not a dependency conflict; see §3. Workflow moved to
   `macos-26`/Xcode 26, `sed` strip removed, all three plugins in the committed
   SPM manifest. This also satisfies Apple's current-SDK submission floor —
   former task 10. **CI-confirmed 2026-07-03:** run #7 built all three plugins
   and uploaded build 1007 to TestFlight.)* Note: build 1007 shows **no sign-in
   UI** — that's correct; the flag is off pre-cutover. **Remaining:** run the
   workflow with the **`require_auth` input = true** (Actions → iOS → TestFlight
   → Run workflow) to get a sign-in-enabled build, then verify Apple + Google
   sign-in on device. CI now also injects the `REVERSED_CLIENT_ID` URL scheme
   into Info.plist at build time (was missing — native Google sign-in couldn't
   return to the app; `NATIVE_AUTH_SETUP.md` §4.2 is automated now).
2. **[ ] Auth cutover** *(code-side prep done 2026-07-03; owner steps remain).*
   Prep completed: `firestore.rules.locked` updated — added `syntheses`;
   **rewrote the `users` read rule** (the old `owns()` `get()` was unprovable for
   the `authUids array-contains` list query and would have bricked every sign-in
   at cutover); client create/delete on user docs denied. `retryFailedLink` now
   sends the bearer header; `backfill_related_links` is admin-gated; a rules
   test suite exists in `firestore-rules-test/` (**run on the owner machine** —
   the cloud sandbox can't download the emulator JAR). Owner steps, after task 1
   is device-verified: flip `REQUIRE_AUTH` + `NEXT_PUBLIC_REQUIRE_AUTH`, redeploy
   functions + web, `cd firestore-rules-test && npm test`, then
   `cp firestore.rules.locked firestore.rules && firebase deploy --only
   firestore:rules`. Flagged decision: `get_article` stays anonymous-callable
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
   - Run the M9 backfill once: `curl -H "X-Admin-Token: $ADMIN_TOKEN"
     .../backfill_related_links` (idempotent; now admin-gated — set `ADMIN_TOKEN`
     in the functions env first).
   - Confirm `backfill_youtube_channels` was run (channel-name repair).
   - `/api/analyze` 60s timeout on slow YouTube videos — route around Hosting's
     60s cap like `/api/chat` did (touches all link-saving; test carefully).
5. **[ ] Security config + key hygiene (30 min, do with #2):** set `ADMIN_TOKEN`,
   `APPCHECK_ENFORCE=true`, `OWNER_EMAIL` in functions env. **Rotate the Gemini
   key** (was pasted in chat 2026-06-23) and the **App Store Connect API `.p8`**
   (pasted in plaintext during CI setup).

### 🟠 P1 — App Store submission requirements (see §6 for the full readiness review)

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
    monthly quotas (see §7); email digest provider decision (SendGrid key or cut
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

## 6. Episode 1 — Codebase readiness for App Store iOS submission (reviewed 2026-07-03)

The engineering fundamentals are in better shape than most first submissions: the
audit's hard blockers were all addressed in code — in-app account deletion
(Guideline 5.1.1(v)) exists as a `delete_account` callable with a confirm flow,
Sign in with Apple ships alongside Google (Guideline 4.8), privacy manifest files
with the correct `CA92.1` UserDefaults declarations exist for both the app and the
Share Extension (the post-2024 auto-rejection trap), `ITSAppUsesNonExemptEncryption`
is set, ATS is clean, there's no tracking SDK (so no ATT prompt needed), and the
app comfortably clears Guideline 4.2 "minimum functionality" — a native share
extension, haptics, and real offline-tolerant plumbing make it feel like an app,
not a wrapped website. The genuine gap between today and a submittable build is
concentrated in one place: **auth isn't live**. The store build must be the one
where `REQUIRE_AUTH` is on, Firestore rules are locked, and a reviewer can create
a fresh account — because a reviewer landing in the current shared single-user
workspace (or on a "restricted access" screen) is an instant rejection, and
world-writable rules on a public app are a data breach, not a finding.

Beyond auth, current-cycle guideline changes add three items the older audit
predates. First, Apple's **AI transparency enforcement (November 2025)**: an app
that sends personal data to a third-party AI service must disclose the provider
and obtain explicit consent — Machina sends saved content, images, and questions
to Google Gemini, so a first-run consent notice plus a privacy-policy section
naming Gemini is now table stakes. Second, the **SDK floor**: since April 2026
submissions must be built against the current-generation SDK, and the CI pins
`Xcode_16*` on `macos-14` — bump the runner before the store submission even
though TestFlight accepted the July 2 build. Third, review logistics: a **demo
account** in App Review notes, an explanation that WhatsApp capture requires an
external Twilio number (so the reviewer doesn't fail it as broken), a hosted
**privacy policy + support URL**, the App Privacy nutrition label matching
Firebase + Google Sign-In data collection, and either iPad screenshots or flipping
`TARGETED_DEVICE_FAMILY` from `"1,2"` to iPhone-only (recommended — the UI is
phone-first). None of these are engineering-heavy; they are a focused week once
the auth build is green. Realistic sequence: CI plugin fix → cutover → consent
screen + policy URLs → device pass (§4 task 11) → submit.

## 7. Episode 2 — Cost, API keys, and the user journey

**Do not ask users for an API key.** BYO-key is the single worst option for this
product: it filters the audience down to developers, adds a brutal first-run
(sign up at Google AI Studio before saving your first link?), creates support
burden, and — because the key would have to live client-side or per-user
server-side — weakens the security posture the audit worked to fix. The key stays
where it is today: **server-side only, in Cloud Functions env**, never in the
bundle (the client-side Gemini path was already deleted for exactly this reason).
The economics support this: analysis runs on `gemini-3.1-flash-lite`, one of the
cheapest capable models — a typical save (scrape + structured analysis + embedding
+ graph check) costs a fraction of a cent, and even a heavy user (300 saves + 100
asks + digests/syntheses a month) lands in the range of **$0.10–$0.50/month** in
model cost plus Firebase's mostly-free tier. Cost is not the constraint; **abuse**
is. The real protections are already designed: verified auth on every paid
endpoint (task 2), App Check enforcement, and per-uid rate limits (task 13) — plus
GCP budget alerts (task 19) so a surprise never compounds.

**Recommended course: launch free with invisible guardrails, monetize with a
simple subscription only after retention proves itself.** Concretely: (1) at
launch, everything free with generous soft caps enforced server-side (e.g. ~150
saves and ~100 asks/month — above what an engaged user hits, so nobody ever sees
the limit in month one); (2) when there's evidence people return (the weekly
synthesis and digest are the retention signals to watch), introduce **Machina
Pro** via Apple In-App Purchase at ~$3.99/month or $29/year — unlimited saves and
asks, weekly synthesis, voice ask when it ships, priority analysis — keeping the
free tier genuinely useful (the free tier IS the marketing); (3) never gate
capture — a save that bounces off a paywall destroys the "I can trust this caught
it" promise the whole product stands on; gate the expensive *intelligence*
(unlimited Ask, synthesis) instead. Use Apple IAP/StoreKit rather than external
purchase links at this scale: the 15% small-business rate costs less than the
conversion you'd lose sending iOS users to a web checkout, and it keeps review
friction near zero. On the user's side of the ledger the journey is: install →
sign in with Apple → consent to AI processing → save two things from the share
sheet → magic, with zero setup and zero payment wall — convenience first, and the
costs it creates for you are cents, bounded, and observable.

## 8. Episode 3 — Marketing plan (≈$0 budget) + launch assets

**Strategy.** Machina's growth loop is built into the product: every shared card
and cited answer is a public, OG-rendered page that links back to the app — the
marketing job is to get those artifacts in front of the right feeds. Budget: $0
on ads at launch. The one paid channel worth considering *later* is Apple Search
Ads on exact-match keywords ("second brain", "save for later ai") with a hard
$5–10/day cap — nothing else (X ads, Meta) makes sense at this stage. The plan is
sequenced: (1) **Build-in-public on X** starting now — 2–3 posts/week showing real
moments (a weekly synthesis screenshot, an Ask answer with citations, the share
sheet catching a recipe from WhatsApp); this compounds and costs nothing but is
the slowest, so it starts first. (2) **TestFlight open beta** with a public link
posted to X + r/PKMS + r/ObsidianMD-adjacent communities and Hacker News "Show
HN" — beta feedback doubles as testimonials. (3) **Launch week:** Product Hunt
launch (Tuesday–Thursday), a Show HN, an X thread, and a 30-second screen-recorded
demo (share → analyzed card → ask → cited answer) reused everywhere including
TikTok/Reels/Shorts — short-form screen demos of "I asked my bookmarks a question
and it answered with sources" are exactly what performs organically in the
productivity niche. (4) **Ongoing:** App Store Optimization (title "Machina AI —
Ask Your Saves"; keywords: second brain, read later, bookmark manager, AI
summary, save links, knowledge base), and a monthly public "what Machina learned
this month" post generated from the actual synthesis feature — the product
markets itself if you publish what it produces. Success metric for month one:
1,000 installs, 20% week-2 retention, 50 organic shares — retention gates any
paid spend.

**Launch assets — first set (ready to adapt):**

*Announcement thread (X), post 1:*
> I kept saving links I never looked at again. Bookmarks, WhatsApp self-messages,
> screenshots — a graveyard.
>
> So I built Machina: share anything to it, AI reads it, and later you just *ask*.
> "What did I save about mortgage rates?" → answer, with sources.
>
> Out now on iOS 🧵

*Post 2:*
> Every save gets: a real summary, category, tags, and — the part I love —
> connections. "3 things you saved connect to Network Effects."
>
> It's not a bookmark manager. It's memory. [screenshot: connection insight]

*Post 3:*
> Sunday it sends a synthesis of your week's saves — themes, one standout, an
> open question. Written from YOUR content, cited back to it.
>
> This is the screenshot I keep sending friends: [screenshot: weekly synthesis]

*Post 4 (CTA):*
> Free on the App Store. Save from the share sheet, WhatsApp, or your browser.
> Ask it anything you've saved.
>
> [App Store link] — reply with what you'd ask your bookmarks 👇

*Show HN:*
> **Show HN: Machina — save links from anywhere, then ask them questions (RAG
> over your own saves)** — iOS app + web. Native share extension → Gemini
> analysis → embeddings in Firestore → cited answers. Built solo; the interesting
> parts were making the share extension never lie about saving, and a knowledge
> graph computed on every save. Happy to answer questions on the stack.

*Product Hunt:* tagline "**Ask your bookmarks anything**"; first comment covers
the origin story (WhatsApp self-messages), the capture surface, and the free tier.

*App Store subtitle/promo:* "Save from anywhere. Ask it anything." / promo text:
"Machina reads everything you save — links, screenshots, videos — and answers
questions from it, with sources."

*Where to "advertise" for free:* X (primary), Product Hunt, Hacker News,
r/PKMS + r/productivity (follow self-promo rules: give value first), Indie
Hackers, a launch post on LinkedIn (the productivity-tools audience there is
underrated and free). Paid, only after retention proves out: Apple Search Ads
exact-match, capped.

## 9. Session log

> One short paragraph per session, newest first. Detail lives in git history and
> PR descriptions — this is the orientation trail, not a changelog.

- **2026-07-05 — Share bridge hardened (share STILL failed on 1020) + % restored.**
  Entitlements were verified in 1020, so the failure is the token never being
  written — the bridge's single dependency was the `get_share_config` callable.
  Rewrite (`web/lib/shareConfig.ts`): the ingest token now comes straight off
  the already-loaded user doc (no backend call at all; callable is only a
  first-launch fallback), 3 retries with backoff, auto re-sync on
  app-foreground, and every outcome recorded to a new **Settings → Share
  extension status row** with a Fix button — the next failure diagnoses itself.
  Also restored the advancing percentage (user request; reverses M6's
  no-numbers stance): % readout + determinate bar in all three scan views and
  the minimized "Analyzing… N%" chip, still anchored to the real milestones.
  If saves from the native app fail IN-APP too, check the functions env for
  `APPCHECK_ENFORCE=true`/`REQUIRE_AUTH=true` — native can't pass App Check
  yet; those must stay unset until cutover.
- **2026-07-04 — ✅ Build 1020: share extension fixed, tripwire-verified — the
  build to install.** Owner pruned the API-created Development certificates;
  run #20 signed the archive properly (App Group entitlement baked in), the
  new CI tripwire confirmed the entitlement in BOTH the app and ShareExt
  binaries before upload, and 1020 shipped with everything: working share,
  related cards, scrubbed header fade (late-mount fix), softened delete copy.
  Builds 1014–1019 are superseded/broken — do not use.
- **2026-07-04 — ⚠️ Build 1018 REGRESSION: Share Extension broken.** The
  unsigned-archive signing workaround lost the App Group entitlement — every
  share fails with "Open Machina and sign in first" on 1018. Fixed in CI:
  reverted to signed archives + added an IPA entitlement tripwire (App Group
  must be present in app + extension or the run fails before upload). §2
  gotcha rewritten accordingly. **Next build is blocked until the owner prunes
  Apple Development certificates** (developer.apple.com → Certificates — the
  cert cap from runs #15/#16 still stands). Until then, roll back to
  **build 1013** in TestFlight (share works there; it lacks only related-cards
  + the fade late-mount fix). Related-cards on OLD saves is separate and not a
  bug: they need the M9 backfill (§4 task 4 — set `ADMIN_TOKEN`, deploy
  functions, run the admin curl); new saves relate immediately.
- **2026-07-04 — Two-session race + Apple cert-cap outage; build 1018 is the
  definitive merged build.** Two parallel sessions pushed builds minutes apart:
  run #14 (build 1014, other session's related-cards branch) and #15 (this
  session's header-fade fix) — no build-number collision (run numbers are
  unique), but neither contained both changes. Merged `main` into this branch →
  the combined build. Then #15/#16 failed on **Apple's certificate cap**: with
  automatic signing, every ephemeral runner mints a new Development cert at
  archive; 14 runs exhausted the quota. #17 (global Distribution override)
  failed — it leaks onto SPM targets. **Fix that stuck (run #18, build 1018):
  unsigned archive + one-time distribution signing at export** (see the new §2
  gotcha). Also in 1018: the header-fade **late-mount fix** — the scrub never
  attached because the header mounts after the auth loading screen; the hook
  now uses a callback ref (Chromium-verified: opacity 1 → 0.77 mid-scrub → 0
  settled → 1 on return). **Install 1018; ignore 1014–1017.** Merged to `main`.
- **2026-07-04 — Related cards go live (open-card view).** The open card's
  "See Also" section was a frozen save-time snapshot: old cards never learned
  about newer related saves, and pre-graph cards showed nothing (plus a dead
  client heuristic that was computed but never rendered). New `web/lib/related.ts`
  merges the stored LLM-verified relations (curated reasons, ranked first) with
  **live client-side matches** — cosine over the in-memory `embedding_vector`s
  (normalizes both plain-array and Firestore `VectorValue` storage), corroborated
  by shared concepts/tags — each with a deterministic "why" sentence ("Also
  explores X and Y", RTL variants included). No model call, no cost. Section
  renamed "Related cards", capped at 4, every entry navigates (dead links drop
  out). Kept inline (not behind a button): it's already below the fold, and the
  graph is the product's hero. Shipped: web via `main`; iOS via TestFlight run
  #14 (green, **build 1014** — triggered with the temporary-push-trigger
  pattern; API dispatch is 403 from remote sessions).
- **2026-07-03 — Header fade + calmer delete copy.** The home top bar now does
  a **scroll-scrubbed fade** (`web/lib/useHeaderFade.ts`): a progress value
  rides the actual scroll travel (~140px down = fully away, ~80px up = fully
  back), styles written per rAF frame via ref (no re-renders), with a 160ms
  idle settle to the nearest endpoint on `--ease-modal`, top-lock, rubber-band
  clamp, reduced-motion fallback, and an always-on status-bar scrim so content
  never scrolls naked under the notch. First iteration (binary toggle, build
  1012) read as a pop — replaced by the scrubbed version in **build 1013**.
  Delete-dialog copy softened again per feedback: "It'll be removed from your
  Machina, along with its summary and connections." Live on web via `main`.
- **2026-07-03 — Delete flow: one confirm, warmer copy.** Deleting from an open
  card showed two stacked confirms (the detail modal's generic dialog, then the
  Feed's branded one). The modal's own dialog was removed — Delete routes
  straight to the Feed's branded confirm (stacks above the card; Cancel returns
  to it). Single + bulk microcopy rewritten: "Delete this card? / It comes out
  of your Machina completely — summary, tags, and connections included. There's
  no undo." TestFlight build 1011; live on web via `main`.
- **2026-07-03 — List view: per-language mirroring + full-width titles.** Two
  rounds from user feedback. (1) `ListCard` rows now set `dir` per card, so
  Hebrew cards mirror completely (colour bar/chip/star on the correct sides;
  RTL detection unified through `getDirection`); titles clamp at 3 lines (was
  2) — TestFlight build 1009. (2) Layout redesign: the category chip left the
  title row (it squeezed long titles) and joined the metadata line as a compact
  truncating pill (icon · source · chip); title spans the full row; star keeps
  its 44px target, top-aligned — build 1010, **screenshot-verified** (real
  Chromium renders, EN+HE fixtures, dark+light, via a throwaway `/dev-listcard`
  harness removed before commit). Both live on web via `main`.
- **2026-07-03 — P1 pack CI-verified + shipped (multi-agent session).** All
  automatable P1 items done in one round (three agents, entries below): AI
  consent (task 6), privacy manifests wired + iPhone-only (task 7 + half of 9),
  legal pages + App Store pack (task 8 + doc half of 9). **CI run #8 green —
  build 1008 uploaded to TestFlight** with the wired manifests and
  `TARGETED_DEVICE_FAMILY = 1`; merged to `main` (Vercel deployed `/privacy`,
  `/terms`, and the consent screen to the web). Remaining P1 is owner-only:
  device sweep (task 11), reviewer demo account + screenshots + clicking the
  Connect forms from `docs/APP_STORE.md`.
- **2026-07-03 — Legal pages + App Store pack (§4 task 8 + doc half of 9).**
  Hosted Privacy Policy and Terms shipped as static pages
  (`web/app/privacy/page.tsx`, `web/app/terms/page.tsx` — prose column, theme
  tokens, content verified against `delete_account`/share-page/processor
  reality; governing-law jurisdiction left as an explicit placeholder). New
  `web/lib/publicRoutes.tsx` + a two-line `app/layout.tsx` change make
  `/privacy` and `/terms` reachable signed-out (AuthProvider otherwise swaps
  every route for the LoginScreen after hydration — App Review must be able to
  read the policy URL). `docs/APP_STORE.md` added: nutrition-label
  declarations with justifications (tracking = NO; Usage Data/Diagnostics =
  none; phone number deliberately not declared — collected outside the app,
  covered in the policy), full metadata drafts, review-notes template, and the
  6-shot screenshot list. §4 tasks 8/9 statuses updated. tsc clean. Remaining
  manual: Connect forms, demo account, screenshots.
- **2026-07-03 — AI-consent disclosure (§4 task 6).** First-run consent gate
  `AIConsentNotice.tsx` naming Google Gemini, rendered from `AuthProvider` on
  both native (pre-cutover, no sign-in needed) and web, after the sign-in gate
  and before `Onboarding`/the tour; acceptance in localStorage `ai-consent-v1`
  + mirrored `aiConsentAt` on the user doc (either signal suppresses re-ask;
  helpers in `web/lib/aiConsent.ts`); Settings gained an "AI & privacy"
  section (provider line, consent date, Privacy Policy/Terms links via new
  `policyUrl`/`openExternal` in `web/lib/share.ts` — external Safari open
  under Capacitor, Vercel origin). tsc clean. Device verification pending.
- **2026-07-03 — Top-3 blockers finished + CI-verified (multi-agent session).**
  (1) Native-auth build FIXED and proven: root cause was the Xcode 16 toolchain
  stripping Capacitor's feature-gated symbols, not a dependency conflict — CI
  moved to macos-26/Xcode 26, plugin strip removed, and **run #7 archived +
  uploaded build 1007 to TestFlight with all three native plugins**. (2) Cutover
  prep: locked rules corrected (a `users` read rule that would have bricked
  sign-in; `syntheses` added), rules test suite in `firestore-rules-test/`,
  `retryFailedLink` bearer header, `backfill_related_links` admin-gated.
  (3) New-user path + onboarding (entry below). Merged to `main`. Next: install
  build 1007, verify Apple/Google sign-in on device, then the §4 task-2 cutover.
- **2026-07-03 — New-user path (§4 task 3).** `claim_workspace` extended:
  claim (OWNER_EMAIL-gated) → create-fresh-workspace fallback
  (`link_service.create_workspace`, doc ID = Firebase Auth uid, default
  settings + ingest token, `onboarded: false`); returns `created` so the
  client shows the new one-screen `Onboarding.tsx` welcome (capture surfaces +
  "Start saving"). Restricted screen kept only for failures, now with Retry.
  Fully flag-gated: with `REQUIRE_AUTH` off nothing changes live.
- **2026-07-03 — Auth-cutover readiness (code side of §4 task 2).** Brought
  `firestore.rules.locked` up to date: added the missing `syntheses` rule
  (client read-only), rewrote the `users/{uid}` read rule to be
  `resource.data.authUids`-based (the old `owns(uid)` `get()` can't run in a
  *list* rule, so it would have rejected the workspace-resolve query and
  bricked every sign-in at cutover), denied client create/delete on user docs.
  Added `firestore-rules-test/` (rules-unit-testing suite + README; couldn't
  run in the cloud session — emulator JAR download blocked — run it on the
  owner machine). Flag audit: `retryFailedLink` (web/lib/storage.ts) misses
  `authHeaders()` → card Retry 401s under `REQUIRE_AUTH`; `get_article` is
  auth-exempt by design (App Check + IP rate limit only);
  `backfill_related_links` lacks `_require_admin`. Details + required
  pre-flip fixes: `NATIVE_AUTH_SETUP.md` §6.
- **2026-07-03 — Consolidation.** Merged all task/handoff/spec/audit docs into
  this file; deleted the superseded seven; verified every claimed-done item
  against code; re-ranked the backlog; rewrote the `/ship` skill (Vercel +
  TestFlight CI, iPhone-PWA step retired); added App Store readiness, cost/API
  strategy, and marketing plan episodes; added `CLAUDE.md` pointing here.
- **2026-07-02 — Phase 2 complete (M10+M12).** Connection insights on the feed +
  weekly synthesis (backend + in-app card). Deploys pending — §4 task 4.
- **2026-07-02 — Phase 2 polish (M11, M16, M-P2/P3/P4), M13/M14/M9 finish, Ask
  header parity, digest settings redesign.**
- **2026-07-01 — Auth cutover code (Batch 2) + production-readiness audit +
  Phase 1 trust fixes (M1–M7) + Google Sign-In Phase 1 (web).**
- **2026-06-30 and earlier** — native iOS app + Share Extension + rebrand to
  Machina, collections + sharing, Ask Machina + streaming + history, curated
  digest, reading view + TTS, browser extension, security baseline. Full detail:
  `git log` and the deleted `HANDOFF.md` in history.

## 10. Known accounts / IDs (quick reference)

- Firebase project: `secondbrain-app-94da2` (us-central1). Vercel:
  `my-links-sable.vercel.app`. Bundle: `com.morhogeg.machina`, Team `8Y2M94RUHG`,
  App Group `group.com.morhogeg.machina`.
- Repos: `morhogeg/MyLinks` (this app), `morhogeg/versus` (empty — LICENSE only).
- Live user doc uid = owner phone number; data keyed by it forever (by design —
  `AUTH_SPEC.md` §2).
