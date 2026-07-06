# Machina AI (repo: MyLinks) — Operating Manual

**Read `SOURCE_OF_TRUTH.md` first.** It holds the *state* of the project:
product/architecture (§1–§2), auth cutover state (§3), the ranked backlog (§4),
ship checklist (§5), App Store / cost / marketing plans (§6–§8), session log (§9),
account IDs (§10). This file holds the *process*: how to work here without
breaking things. When the two disagree about a fact, SOURCE_OF_TRUTH wins; when
either disagrees with the code, **the code wins** — fix the doc and note it in §9.

The sibling repo `morhogeg/versus` is empty (LICENSE only). All real work is here.

---

## 1. How a session runs

1. **Orient:** skim SOURCE_OF_TRUTH §9 (latest entries) + the §4 live-state note.
   Picking work? §4 is ranked top-down — take the highest unblocked item unless
   the user directs otherwise.
2. **Work on a `claude/*` branch.** Never commit straight to `main` except docs
   (SOURCE_OF_TRUTH updates are safe to push to `main` directly).
3. **Verify before claiming done** (see §4 quality bars). "tsc passed" is the
   floor, not the bar.
4. **Ship via the `/ship` skill** — it merges `--no-ff` to `main` (Vercel
   auto-deploys web), deploys functions only if `functions/` changed, triggers
   the "iOS → TestFlight" workflow only if the app changed. Never run
   `./deploy-hosting.sh` unless `firebase.json` changed (the iPhone PWA is retired).
5. **Document:** every ship updates SOURCE_OF_TRUTH — §4 checkboxes, a dated §9
   entry naming commit SHAs / function names / TestFlight build numbers, and §2/§3
   if a gotcha or the live state changed. Do **not** create HANDOFF/TASKS/spec/audit
   files — they were consolidated into SOURCE_OF_TRUTH and deleted.
6. **Two parallel sessions may exist.** TestFlight runs share one concurrency
   group and one build-number sequence (1000 + run number). Sync with
   `origin/main` before triggering a build — a build contains only its own
   branch's code. Coordinate through §9.

Verify commands: `cd web && npx tsc --noEmit` · `cd functions && python -m py_compile *.py`.
There is no test suite (backlog task 18); verification is typecheck + actually
exercising the change (see `/verify-ui` and `/card-autopsy`).

## 2. Conventions

### Frontend (`web/` — Next.js 16, React 19, Tailwind v4, dual-target web + Capacitor iOS)

- **Theme = tokens only.** There is no `tailwind.config.*`; tokens live in
  `web/app/globals.css` as CSS vars bridged via `@theme inline`. Use the semantic
  utilities: `bg-background`, `bg-card`, `bg-card-hover`, `text-text`,
  `text-text-secondary`, `text-text-muted`, `border-border-subtle`, `text-accent`,
  and arbitrary-value tokens `shadow-[var(--shadow-card)]`,
  `bg-[image:var(--accent-gradient)]`, `var(--accent-ring)`, `var(--surface-sheen)`.
  Sanctioned literals: the category palette in `web/lib/colors.ts` and
  translucent scrims (`bg-black/60`, `bg-white/5`). Nothing else hardcodes color.
- **Dark is the default; light is a `.light` class on `<html>`** (ThemeProvider).
  Tailwind `dark:` variants are NOT wired to the toggle (they follow the OS media
  query) — never use them. Style with semantic tokens, which flip automatically.
- **Motion:** `--ease-modal` for every overlay (the one modal curve);
  `--ease-spring` for the card grid only. No new easing curves.
- **Native/web split:** `isNativeApp()` (`web/lib/api.ts`) is the canonical check
  for gating/branching; `Capacitor.isNativePlatform()` for plugin calls
  (haptics/share/shareConfig). Backend calls go through `apiUrl()` — on native the
  WebView origin is `capacitor://localhost` with no server behind it. External
  links/share URLs via `shareUrlFor()`/`policyUrl()` in `web/lib/share.ts`, never
  `location.origin`.
- **Streaming:** `wantStream = !isNativeApp()` — WKWebView buffers/aborts SSE, so
  native uses buffered JSON. `/api/chat` must keep hitting the function's direct
  URL via `web/app/api/chat/route.ts` (Hosting/Vercel rewrites buffer SSE).
- **State: React only.** Exactly three contexts (Auth, Theme, Toast); everything
  else is local state + props. `Feed.tsx` owns the `onSnapshot` subscription and
  the master `links` array. Do not add a state library.
- **Modal recipe** (copy an existing modal): body scroll lock that *restores the
  previous* `overflow` value, `useVisualViewport` for keyboard avoidance,
  `useEdgeSwipeBack` for the iOS back gesture, `--ease-modal` entrance,
  `overscroll-contain` on scroll areas.
- **RTL is first-class.** New text UI sets `dir` — usually `dir="auto"`
  (`getDirection`/`hasHebrew` in `web/lib/rtl.ts`); force `dir="ltr"` only on
  URLs/handles/metadata rows. Flip padding/alignment for RTL like
  `SimpleMarkdown`/`ListCard` do.
- **Data quirks:** `createdAt` is `number | string` — normalize before comparing.
  Firestore rejects `undefined` — strip fields like `saveLink` does. Card `status`
  has no `'ready'` literal (ready = `unread|archived|favorite`; extras are
  `processing|failed`). `embedding_vector` may be a plain array or a Firestore
  `VectorValue` — go through `toVector` in `web/lib/related.ts`. Optimistic UI =
  fire the write and let Firestore latency compensation reflect/revert it.
- **Haptics** (`web/lib/haptics.ts`) are fire-and-forget — never `await`, no-op on web.
- **Animation clocks** use `performance.now()`, not `Date.now()`
  (`useProcessingBanner`, `useSharedCaptureBanner`).
- **Known debt — fix on touch, never copy:** `SimpleMarkdown.tsx:85` stray
  `border-red-500`; hardcoded `bg-white text-black`/`text-white` in
  `ConfirmDialog.tsx` and `AddLinkForm.tsx`; the four `dark:` usages
  (`page.tsx`, `Card.tsx`, `LinkDetailModal.tsx`, `ChatHistorySidebar.tsx`,
  `ProfileAvatar.tsx`).

### Backend (`functions/` — Python 3.13 Cloud Functions, project `secondbrain-app-94da2`)

- **Identity comes from the verified token, never the body.** All data endpoints
  resolve uid via `_authed_uid` (main.py) → `find_data_uid_by_auth_uid`. The
  client-uid fallback exists only behind `not REQUIRE_AUTH` (staged cutover) and
  must keep that guard.
- **Callable + HTTP-twin pattern:** Firebase callables fail the CORS preflight
  from `capacitor://localhost`, so `claim_workspace`/`delete_account` each have an
  `_http` twin for native, sharing one private `_logic` function. Change the
  `_logic`, never fork or "unify" the pair. Same wall moved `get_share_config`
  reads client-side and `/api/chat` off Hosting.
- **CORS:** `_allowed_origins()` must keep `capacitor://localhost`,
  `ionic://localhost`, `https://localhost` or every native `/api/*` call dies
  with a bare "Load failed".
- **Failure direction is deliberate.** Fail-closed: `_require_admin` (denies when
  `ADMIN_TOKEN` unset, returns 404 not 403), `_verify_twilio_signature` (False in
  prod when token unset). Fail-open: the rate limiter, App Check soft mode,
  `ai_service.embed_text` (returns a stub vector so an analysis isn't discarded —
  while `search.EmbeddingService` deliberately raises). Never flip a direction.
- **PII:** never log webhook payloads or raw phone numbers — `whatsapp_webhook`
  logs routing metadata only; mask with `_mask_phone`. Client-facing errors go
  through `_error_response`/`_server_error` (full detail server-side only).
- **Gemini:** `GEMINI_ANALYSIS_MODEL` in `ai_service.py` is the single source of
  truth (graph_service imports it). JSON is enforced with `response_schema`
  Pydantic models. The SYSTEM_PROMPT rules are product-load-bearing: `**bold**`
  scannability, substance-first (no meta-openers), GROUNDING (no fabrication on
  thin content), `detailedSummary` starts at `## `. Don't edit casually — use
  `/card-autopsy` to change prompts against a real failing card.
- **`get_article` is anonymous by design** (App Check + rate limit only). Adding
  auth to it breaks reading mode for every saved link.
- **Env vars are plain Cloud Run env in `functions/.env` (gitignored), NOT Secret
  Manager secrets** — binding a name both ways breaks deploy. Deploys need the
  local venv (`python3.13 -m venv venv && venv/bin/pip install -r requirements.txt`).
- **Deploy only via `./deploy-functions.sh functions:<a>,functions:<b>`** — it
  pins `--project secondbrain-app-94da2` (a `firebase use` override once shipped
  to the wrong project) and auto-prefixes `functions:` (a bare `--only
  functions:a,b` silently deploys only `a`). `process_link_background` may 409
  transiently — retry in ~60s.
- **Capture lifecycle (M3):** `process_link_background` writes a `processing`
  placeholder card first and flips the *same doc* to ready/`failed`. Never
  "simplify" to create-at-end — that reintroduces silently-dropped captures.

### iOS / CI (`web/ios/`, `.github/workflows/ios-testflight.yml`)

- **SPM, not CocoaPods.** `CapApp-SPM/Package.swift` is generated — add plugins
  via `npm i` + `npx cap sync ios`, never by hand. App-target plugins
  (`ShareConfigPlugin`) must stay registered in `MainViewController.swift`
  (SPM doesn't auto-discover them).
- **The archive step stays SIGNED** (automatic cloud signing +
  `-allowProvisioningUpdates` + ASC key). Unsigned-archive + sign-at-export lost
  the App Group entitlement on build 1018 and silently broke the Share Extension.
  The IPA entitlement tripwire in the workflow is the guard — never remove it.
  "Maximum number of certificates" failures = owner prunes Development certs at
  developer.apple.com (safe; they regenerate). No global `CODE_SIGN_IDENTITY`
  override (leaks onto SPM targets).
- **Runner floor: `macos-26` + Xcode 26.** Xcode 16 strips Capacitor 8's
  `$NonescapableTypes`-gated symbols and `@capacitor/share` fails to compile.
- **One string, many places:** `group.com.morhogeg.machina` must match across
  both entitlement files, `ShareViewController.swift`, `ShareConfigPlugin.swift`,
  and the workflow tripwire. Bundle IDs (`com.morhogeg.machina`(+`.ShareExt`)) and
  team `8Y2M94RUHG` are similarly load-bearing.
- **Web bundle staleness:** an Xcode archive re-ships whatever's in
  `ios/App/App/public/` — `next build` + `cap sync ios` must precede every
  archive (CI does this; `build-ios.sh` guards it locally).
- **Rules files:** live `firestore.rules` is deliberately open pre-cutover
  (locking it now bricks native/share/WhatsApp writes). Security tightening goes
  into `firestore.rules.locked`, tested with `firestore-rules-test/`, deployed
  only as the cutover's final step.
- `GoogleService-Info.plist` and the `REVERSED_CLIENT_ID` URL scheme are injected
  from secrets at build time — never commit them. `safari/build/` is generated
  from `/extension` — never edit it.

### Git & docs

- Commit style: `feat|fix|docs|ci(scope): imperative subject` — subjects read like
  the session log ("Unify card summary and open write-up into one thought at two
  zoom levels"). One logical change per commit.
- §9 session-log entries name concrete artifacts (SHAs, build numbers, function
  names, endpoints) and record *decisions and dead ends*, not just outcomes —
  including the fix that was intentionally NOT merged.

## 3. Mistakes a weaker model will make here — named, with the preventing rule

**Frontend**
1. **The Capacitor ghost.** Testing `Boolean(window.Capacitor)` for nativeness —
   truthy in plain browsers, silently disabled the web sign-in gate for weeks.
   → Rule: gate on `isNativeApp()`; plugin calls on `Capacitor.isNativePlatform()`.
2. **The `dark:` mirage.** Styling light/dark with `dark:` variants that only
   follow the OS setting, not the in-app toggle. → Rule: semantic tokens only;
   `.light`-scoped CSS if you truly need a per-theme override.
3. **The white button.** `bg-white text-black` looks fine in dark mode and breaks
   in light. → Rule: grep your diff for `#hex`, `text-white`, `bg-white`,
   `bg-black`, `gray-`, `dark:` before commit; only `lib/colors.ts` and scrims pass.
4. **The popup-resolver crash.** "Fixing" `firebase.ts` by adding a popup/redirect
   resolver to `initializeAuth` — gapi's iframe throws under `capacitor://` and
   the app never hydrates. → Rule: resolver is passed per-call on web
   (`auth.ts`), never at init.
5. **The native stream.** Adding SSE on native or routing `/api/chat` through a
   rewrite. → Rule: keep `wantStream = !isNativeApp()` and the direct-URL chat route.
6. **The export breaker.** Adding prod `app/api/*` handlers, server actions, ISR,
   or middleware — the default build is `output: "export"` for Capacitor.
   → Rule: existing `app/api/*` files are dev-only shims (except chat); backend
   logic lives in `functions/`.
7. **The origin leak.** Building URLs from `location.origin` — on native that's
   `capacitor://localhost`. → Rule: `apiUrl()` / `shareUrlFor()` / `policyUrl()`.
8. **The LTR default.** Shipping text UI without `dir` — Hebrew content renders
   broken. → Rule: `dir="auto"` on content, `dir="ltr"` on URL/metadata rows,
   verify with a Hebrew fixture (`/verify-ui` does this).
9. **The 'ready' filter.** `status === 'ready'` matches nothing. → Rule: ready is
   `unread|archived|favorite`; only `processing|failed` are lifecycle extras.
10. **The undefined write.** Passing `undefined` fields to Firestore throws.
    → Rule: strip undefined (see `saveLink`) or use `?? null`.

**Backend**
11. **The secret-manager bind.** Declaring `secrets=[...]` on a function whose
    name is already a plain env var — Cloud Run rejects it. → Rule: env stays in
    `functions/.env`, no `secrets=` decorators.
12. **The naked deploy.** `firebase deploy` (wrong active project) or `--only
    functions:a,b` (deploys only `a`). → Rule: only `./deploy-functions.sh` with
    explicit named targets.
13. **The CORS trim.** "Cleaning up" the weird `capacitor://`/`ionic://` origins.
    → Rule: those ARE the native app; they never leave `_allowed_origins()`.
14. **The helpful auth addition.** Adding a uid/token requirement to
    `get_article`. → Rule: it's anonymous by design; protection is App Check +
    rate limit.
15. **The twin collapse.** Merging `claim_workspace`/`delete_account` with their
    `_http` twins, or editing one side only. → Rule: behavior changes go in the
    shared `_logic` functions; both transports stay.
16. **The trusting uid.** Reading `data.uid`/body uid without the
    `not REQUIRE_AUTH` guard. → Rule: identity flows through `_authed_uid`; the
    fallback is cutover scaffolding, not a pattern.
17. **The chatty logger.** `logger.info(payload)` on webhook/user data — leaks
    phone numbers and message bodies. → Rule: log routing metadata; mask phones
    (`_mask_phone`); client errors via `_error_response`/`_server_error`.
18. **The fail-direction flip.** Making `_require_admin` allow-when-unset, or the
    rate limiter raise. → Rule: admin/Twilio-signature fail CLOSED; rate
    limit/App-Check-soft/`embed_text` fail OPEN. Both directions are documented
    intent.
19. **The create-at-end simplification.** Restructuring `process_link_background`
    to write the card only on success. → Rule: placeholder-first, flip the same
    doc — the share sheet's honesty depends on it.
20. **The prompt haircut.** Tidying SYSTEM_PROMPT and dropping GROUNDING /
    substance-first / `**bold**` / `## `-start rules that fixes were built on.
    → Rule: prompt edits are surgical, tested against a real bad card
    (`/card-autopsy`), and never remove a named rule without saying so.

**iOS / CI / rules**
21. **The unsigned archive.** Any change toward archive-unsigned-sign-at-export.
    → Rule: signed archive, automatic signing, tripwire intact (build 1018 is the
    cautionary tale).
22. **The hand-edited manifest.** Editing `CapApp-SPM/Package.swift` or pbxproj
    signing settings directly. → Rule: plugins via npm + `cap sync`; signing
    stays `Automatic`; pbxproj edits only for things the CLI can't do (and note
    them in §9).
23. **The runner downgrade.** "Stabilizing" CI on an older macOS/Xcode image.
    → Rule: `macos-26` + `Xcode_26*` is a floor, not a preference.
24. **The live-rules lockdown.** Tightening `firestore.rules` directly because
    "open rules are a finding". → Rule: pre-cutover openness is an accepted,
    documented risk; edits go to `firestore.rules.locked` + tests; deploy is the
    cutover's point of no return, owner-approved.
25. **The routine hosting deploy.** Running `./deploy-hosting.sh` as part of a
    normal ship. → Rule: only when `firebase.json` changed.

**Docs / process**
26. **The new HANDOFF doc.** Writing `NOTES.md`/`PLAN.md`/`AUDIT.md`.
    → Rule: it all goes in SOURCE_OF_TRUTH (§4 + §9); reference how-tos listed in
    its header are the only standalone docs.
27. **The silent ship.** Deploying and stopping. → Rule: a ship without the
    SOURCE_OF_TRUTH update pushed is an incomplete ship.
28. **The stale-doc belief.** Acting on a §4 claim that contradicts the code.
    → Rule: verify claimed-done items against code; code wins; correct the doc.

## 4. Quality bar per deliverable — checkable, not adjectives

**Frontend change** (all must be true before ship):
- [ ] `cd web && npx tsc --noEmit` exits 0.
- [ ] Diff grep for `#[0-9a-fA-F]{3,6}`, `text-white`, `bg-white`, `bg-black`,
      `-gray-`, `dark:` returns only sanctioned hits (colors.ts, scrims).
- [ ] Every new user-visible string container has a `dir` strategy; verified with
      a Hebrew fixture if the surface can show user content.
- [ ] Rendered and eyeballed in dark AND light (screenshots for anything visual —
      `/verify-ui`), at a phone viewport (390×844) and desktop.
- [ ] Behavior considered on BOTH targets: what does this do under
      `capacitor://` (no server, buffered SSE, keyboard/visual-viewport, edge-swipe)?
- [ ] New overlay follows the modal recipe (lock-restore, `--ease-modal`,
      `useVisualViewport`, `useEdgeSwipeBack`).
- [ ] No new `app/api/*` prod dependency, no server actions/ISR/middleware.
- [ ] If it touches `web/ios/` or `capacitor.config.ts`: flagged as needing a
      TestFlight build in the ship report.

**Backend change:**
- [ ] `cd functions && python -m py_compile *.py` exits 0.
- [ ] Any new endpoint: CORS via `_allowed_origins()`, identity via `_authed_uid`
      (or explicitly documented as anonymous), errors via
      `_error_response`/`_server_error`, rate-limit bucket considered.
- [ ] No payload/PII logging; phones masked.
- [ ] Behavior identical with `REQUIRE_AUTH` off AND on (state both in the §9 entry).
- [ ] Deploy targets named explicitly in the ship (which functions changed,
      including shared-module importers: `ai_service`, `search`, `models` ripple
      into their importers).
- [ ] Prompt/schema changes: verified against at least one real URL/card, and the
      named SYSTEM_PROMPT rules still present.

**iOS / CI change:**
- [ ] No edits to generated files (`CapApp-SPM/Package.swift`, `safari/build/`).
- [ ] Signing model untouched (signed archive, automatic, tripwire present).
- [ ] App Group / bundle IDs / team unchanged (or every occurrence updated together).
- [ ] Workflow still: web build → sync guard → plist injection → signed archive →
      entitlement tripwire → upload.
- [ ] TestFlight run green and build number recorded in §9 (`/testflight`).

**A ship:**
- [ ] Scope assessed (web / functions / native / firebase.json / docs-only) and
      only changed surfaces deployed.
- [ ] Merged `--no-ff` to `main`, pushed.
- [ ] SOURCE_OF_TRUTH updated in the same ship: §4 checkboxes, §9 entry with
      SHAs/builds/functions, §2–§3 if gotchas/live state moved. Pushed.
- [ ] Report to the user states exactly what is live where (Vercel ~1–2 min,
      functions immediate, TestFlight ~10–30 min after processing).

**A doc/SOURCE_OF_TRUTH edit:**
- [ ] Facts checked against code, not copied from older docs.
- [ ] No new standalone planning/handoff files created.

## 5. When uncertain — exact escalation rules

**Proceed without asking** (reversible, in-scope):
- Anything on a `claude/*` branch: code, refactors, fixes, docs.
- Picking the top unblocked §4 item when asked to "work on the backlog".
- Deploying *unchanged-behavior* function code the user asked to ship.
- Pushing SOURCE_OF_TRUTH updates to `main`.

**Verify, then proceed** (don't ask, but don't trust):
- Any "done" claim in docs → check the code first.
- Any signal that pattern-matches a known gotcha (§2 of SOURCE_OF_TRUTH) → confirm
  the cause matches before applying the known fix.

**Ask first — always** (each answer is a decision only the owner can make):
1. Flipping or deploying with changed flags: `REQUIRE_AUTH`,
   `NEXT_PUBLIC_REQUIRE_AUTH`, `APPCHECK_ENFORCE`, `OWNER_EMAIL`.
2. Anything in the auth-cutover sequence (SOURCE_OF_TRUTH §4 task 2 /
   `NATIVE_AUTH_SETUP.md` §6) — especially deploying Firestore rules (point of
   no return).
3. Changing the CI signing/archive/export steps or the entitlement tripwire.
4. Rotating/regenerating keys or secrets; anything touching Apple certs.
5. Deleting or migrating user data (`users/*`), or running all-users backfills.
6. Triggering a TestFlight build when only `web/` changed and the user didn't ask
   for an app update (builds are heavy; web ships free via Vercel).
7. Re-enabling the workflow push trigger, or changing deploy targets/projects.
8. Publishing anything outward-facing: App Store metadata, README product claims,
   share-page content changes.
9. Force-push or history rewriting anywhere.

**Ambiguity rule:** if user feedback or a backlog item supports two readings that
lead to different code, present the readings and ask — don't pick silently. (The
Show-by "Clear All" round-trip is the canonical example: single-select vs
multi-select was a product decision, not a code question.)

**Blocked-on-owner rule:** when the remaining steps need the owner's machine,
device, or consoles (Firebase/Apple/Vercel dashboards, on-device verification,
emulator JAR downloads, `*.run.app` curls — cloud sessions can't reach those),
finish the code side, list the exact owner steps in the §9 entry, say so in the
report, and stop. Never fake a verification you couldn't run — say what was and
wasn't verified.

**Contradiction rule:** doc says X, code says Y → code wins, correct the doc in
the same commit, note it in §9.

## 6. Skills

- `/ship` — end-to-end release + mandatory SOURCE_OF_TRUTH update.
- `/verify-ui` — real-browser screenshot verification for visual changes
  (dark+light × EN+HE × phone+desktop, throwaway fixture harness).
- `/testflight` — trigger + babysit an iOS → TestFlight run with the failure
  playbook (cert cap, tripwire, toolchain, stale bundle).
- `/card-autopsy` — root-cause a bad card end-to-end (scrape vs prompt vs
  pipeline), fix, and verify against the live pipeline.
