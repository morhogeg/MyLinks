# Codex onboarding for Machina (repo `MyLinks`)

> Written 2026-09-08 when the owner moved from Claude Code to OpenAI Codex.
> Everything an agent needs to work here safely, in one place. The living
> project state still lives in `SOURCE_OF_TRUTH.md`; this file tells Codex
> how to read it and what the Claude sessions learned the hard way.
>
> **Not verified here:** the Codex file paths below (`AGENTS.md` discovery,
> `.agents/skills/`, `~/.codex/config.toml`) come from the Codex docs as of
> mid-2026, not from a live check in this container (OpenAI's docs host was
> blocked). If `codex` does not pick a skill up, run `codex --help` / `/skills`
> and move the folder to whatever path your version lists.

## 1. Files Codex reads

| File | Purpose |
|---|---|
| `AGENTS.md` (repo root) | The rules. Same content as `CLAUDE.md`; keep both in sync. |
| `.agents/skills/<name>/SKILL.md` | The four project skills (`onboard`, `ship`, `polish`, `security`), same frontmatter format Claude used, each with a "Codex notes" block at the top listing what differs. |
| `SOURCE_OF_TRUTH.md` | The single source of truth. ~900 KB. Read §1–§5 and the newest §9 entries only. |
| `docs/CODEX_ONBOARDING.md` | This file. |

The `.claude/` folder stays so Claude Code keeps working side by side. It
contains the original skills, a `settings.json` allowlist with one rule
(`git push origin main:*` pre-approved), and `launch.json` (`npm run dev` in
`web/` on port 3000).

### Suggested `~/.codex/config.toml`

```toml
# Machina defaults. Adjust model to whatever your plan offers.
model = "gpt-5-codex"
approval_policy = "on-request"     # ask before anything outside the sandbox
sandbox_mode = "workspace-write"   # can edit the repo, network needs approval

[projects."/Users/<you>/MyLinks"]
trust_level = "trusted"

# Optional: GitHub MCP so the ship skill can watch Actions runs without gh.
# [mcp_servers.github]
# command = "npx"
# args = ["-y", "@modelcontextprotocol/server-github"]
# env = { GITHUB_PERSONAL_ACCESS_TOKEN = "..." }
```

The Claude allowlist only pre-approved `git push origin main:*`. The
equivalent in Codex is to approve that command when prompted; do not widen
the sandbox to `danger-full-access` for this repo. The ship skill needs
network for `git push`, `gh run watch`, and `npm`/`pip` installs.

### Invoking skills

Mention the skill by name (`$onboard`, `$ship`, `$polish collections`,
`$security scraper`) or pick it from `/skills`. Each skill's `description`
field lists the trigger phrases it was written for ("ship", "deploy",
"polish", "harden"), so plain language works too.

### What does not carry over from Claude Code

- **GitHub MCP tools** (`actions_list`, `push_files`, `pull_request_read`).
  Use the `gh` CLI. The ship skill's Codex notes say where.
- **`send_later` / scheduled check-ins.** Poll long CI runs with
  `gh run watch <id>` inside the same turn.
- **`/security-review`** (Claude built-in). The security skill's eight-lens
  sweep replaces it.
- **Claude cloud container specifics:** the preinstalled Chromium at
  `/opt/pw-browsers`, the egress allowlist that blocked `*.run.app`. Locally
  you can curl the functions directly.
- **Branch naming.** Claude sessions pushed `claude/*` branches; use `codex/*`.
- The old `.agent/` folder (Vertex/Opus model rules and a `firebase deploy`
  workflow) was deleted in this migration. It predated the GitHub Actions
  deploy path and would have sent Codex down the wrong route.

## 2. The project in one screen

**Machina** (`com.morhogeg.machina`, name is Machina, never "Machina AI") is a
personal knowledge base: capture a link, text, or image from the iOS share
sheet, the web UI, or the browser extension; a Python Cloud Function scrapes
and Gemini analyzes it; a structured card (summary, category, tags, concepts,
embedding, related links) lands in a real-time feed with semantic search,
"Ask Machina" RAG chat with citations, spaced-repetition reminders, digests,
weekly synthesis, collections, and public share pages. The hero is the
**Recall Engine**: ask your own saves a question, get a cited answer.

Stack and where things live:

| Layer | Where | Notes |
|---|---|---|
| Web + iOS web layer | `web/` | Next.js 16, React 19, Tailwind v4, TypeScript. Static export for Capacitor; native Next build on Vercel. |
| iOS shell | `web/ios/` | Capacitor 8 (SPM, no CocoaPods), native Swift Share Extension in `web/ios/App/ShareExt/`, App Group `group.com.morhogeg.machina`, Team `8Y2M94RUHG`. |
| Backend | `functions/` | Python 3.13 Firebase Cloud Functions, project `secondbrain-app-94da2`, us-central1. `main.py` is the HTTP/callable edge; `search.py`, `ai_service.py`, `scraper.py`, `link_service.py`, `digest_service.py`, `push_service.py`, `entitlement.py`, `quota.py`, `rate_limit.py`. |
| AI | `functions/ai_service.py` | Gemini `gemini-3.1-flash-lite` for analysis/vision (`GEMINI_ANALYSIS_MODEL`), `gemini-embedding-001` for search. |
| Data | Firestore | `users/{uid}/{links,chats,collections,syntheses}`; uid of the original owner is a phone number by design; Google/Apple accounts link via `authUids[]`. Public snapshots in `shared_cards`, `shared_collections`. |
| Rules | `firestore.rules` (live), `firestore.rules.locked` (staged), `storage.rules` | Tests in `firestore-rules-test/rules.test.mjs` (needs the emulator). |
| Browser extension | `extension/`, `safari/` | Thin client POSTing to the same ingest endpoint as the share sheet. |
| Tests | `functions/tests/` (pytest, 870+), `web/lib/__tests__` | CI: `python-tests.yml`, `rules-tests.yml`. |

Reference docs that stay: `AUTH_SPEC.md`, `NATIVE_AUTH_SETUP.md`,
`SHARE_EXTENSION.md`, `AUDIT.md` (2026-07-09 findings with IDs like `H-1`,
`S-6`; reuse those IDs), `docs/IOS_CICD.md`, `docs/APP_STORE.md`,
`docs/BRANDING.md`, `web/VERCEL.md`, `extension/README.md`.

## 3. Deploy surfaces and how a ship works

| Surface | Trigger | Watch |
|---|---|---|
| Desktop web (Vercel, `my-links-sable.vercel.app`, root dir `web`) | Any push to `main` | Vercel dashboard, ~1–2 min |
| Cloud Functions | Push to `main` touching `functions/**` runs `deploy-functions.yml`. Scope with a `Deploy-Functions: fnA,fnB` line in the merge-commit message; without it everything deploys. Redeploy without code change: bump `functions/.deploy-ping`. | `gh run list --workflow=deploy-functions.yml` |
| iOS → TestFlight | `git push -f origin main:trigger/testflight` (the dispatch API 403s for the GitHub App; push is the control channel). Build number = 1000 + run number. Every build is auth-gated by default. | `gh run list --workflow=ios-testflight.yml` |
| Firestore/Storage rules | Push to `main` touching `firestore.rules` or `storage.rules` runs `deploy-rules.yml` (emulator suite, deploy, anonymous probe). Editing `firestore.rules.locked` ships nothing. | `gh run list --workflow=deploy-rules.yml` |
| Firebase Hosting | `./deploy-hosting.sh` only when `firebase.json` changes. It still serves `/api/*` rewrites for the native app and the `/s`, `/c` share pages. | manual |

Functions env (`ADMIN_TOKEN`, `OWNER_EMAIL`, `APPCHECK_ENFORCE`,
`REQUIRE_AUTH`, `GEMINI_API_KEY`) comes from **GitHub repo secrets** written
into `functions/.env` at deploy time, not from the Firebase console.
`GEMINI_API_KEY` is a plain env var, never a Secret Manager binding.

Every ship ends with a `SOURCE_OF_TRUTH.md` update: §9 entry (what shipped,
commit SHAs, run numbers, build number, anything left open) and §4 checkboxes.
A ship without that update is incomplete.

## 4. Current state (2026-09-08)

- **Auth cutover is DONE (2026-08-02).** `REQUIRE_AUTH=true` in functions,
  `NEXT_PUBLIC_REQUIRE_AUTH=true` on Vercel and in every TestFlight build
  since 1265, Firestore rules locked. Isolation is enforced by the database.
  Everything in §3 below the top box is history.
- **Push notifications work since 2026-08-25** (the APNs key had been
  sandbox-scoped; a new Sandbox & Production key fixed it).
- **Latest TestFlight build: 1318** (2026-09-04, card-trust round). Latest
  backend deploy: Deploy Cloud Functions run #103 (search whole-word Hebrew
  matching). Owner QA list is in §4 PM-G.
- **Machina Pro** (RevenueCat entitlements, trial, paywall) code shipped
  2026-09-02; the RevenueCat project, App Store Connect products, and
  `NEXT_PUBLIC_REVENUECAT_IOS_KEY` secret are owner steps still open (§4 item 26).
- **Open P0/P1 owner items:** raise the Gemini spend cap before any downloads
  (§4 5b), key hygiene (§4 5), App Review demo account (§4 9), on-device
  verification sweep (§4 11), em-dash cleanup in existing copy (§4 11a3).
- Not started: Phase 3 differentiators (§4 P3), offline mode, voice capture.

## 5. Known issues and how they were fixed (do not re-learn these)

Everything here is distilled from `SOURCE_OF_TRUTH.md` §2 gotchas, §4, §9 and
`AUDIT.md`. When a bullet names a commit, run number, or build, the detail is
in the §9 entry of that date. Treat "NOT verified" markings in §9 literally;
they mean nobody has confirmed it on a device or in prod.

### Recurring root causes

- **"Deploy green" is not "runtime healthy."** 2026-08-26: every Firestore
  call from containers built since functions run #89 failed with
  `Invalid database id` because a poisoned pip layer was reused (only top-level
  pins, transitives floated, requirements hash unchanged). Fix `ca0942c` (run
  #92): a transitive-pin block in `functions/requirements.txt`
  (google-cloud-firestore, api-core, grpcio, protobuf, proto-plus,
  googleapis-common-protos). The pip layer is part of prod state.
- **Guards added after that outage** (`8cbb47c`, run #93): a post-deploy
  end-to-end canary that queues a real link for a `ci-canary` workspace and
  requires `process_link_background` to resolve it; `pipeline-health.yml`
  daily at 05:10 UTC (manual fire: push `trigger/pipeline-health`) checking
  scheduler jobs, stale `pending_processing`, cards stuck `processing` over 30
  min; a limiter backend error raises `RateLimitBackendError` and returns 503,
  not a misleading 429.
- **Gemini calls had no HTTP timeout** and hung functions to death.
  `GEMINI_CALL_TIMEOUT_MS` (90s default) is set on both `genai.Client`s
  (`ai_service` and `search.EmbeddingService`; the option is in milliseconds),
  and the trigger `timeout_sec` went 300 to 540 so the except that writes the
  FAILED card still runs.
- **Orphaned queue docs poison dedup.** A hard-killed job left a
  `pending_processing` doc, so `pending_exists_for_url` called every later
  save of that URL a duplicate forever. The janitor prunes queue docs past the
  15-min cutoff, re-stamps `processingStartedAt` when work starts, and gives
  imported jobs a 4h window.
- **Two rulesets exist and a feature needs BOTH.** `firestore.rules` (live)
  and `firestore.rules.locked` (staged) diverged once; adding `synthesisNotes`
  only to the locked file denied every note write in prod. Firestore rules do
  not cascade into subcollections; spell every subcollection out.
- **Verify a fix against the observed failure, not the hypothesis.** The
  Messi-cluster search fix passed a fixture that encoded the theory and still
  failed on the real library; the real discriminator was a title echo.

### Deploy and CI footguns

- **`git push -f origin main:trigger/testflight` is a no-op when the trigger
  branch already points at main's SHA.** No ref change, no push event, no run,
  and git still prints success. To rebuild the same code, move main HEAD first
  (a docs commit is enough).
- **The trigger-branch shortcut used to hardcode the auth gate OFF** and
  shipped three ungated builds (1264, 1266, 1267); 1266 and 1267 bricked the
  iPhone app against the locked rules (blank screen, legacy `users` list
  query denied, swallowed by a bare catch). Fixed 2026-08-03: the input is
  inverted to `legacy_no_auth` (rollback only), resolved once into
  `REQUIRE_AUTH_VALUE`, with a fail-closed guard step before the build. The
  ternary must stay `!= true && 'true' || ''`; a falsy left side falls through.
- **iOS signing rules, do not relitigate.** The archive step must be signed
  (automatic signing, `-allowProvisioningUpdates`, ASC key). Build 1018 used
  unsigned-archive plus sign-at-export and silently lost the App Group
  entitlement, killing the Share Extension token bridge. A CI step now cracks
  every exported IPA and fails if the entitlement is missing. Apple's 2-cert
  cap was fixed by an "Install signing certificate" step importing a persistent
  `.p12` (`BUILD_CERTIFICATE_P12_BASE64`, `BUILD_CERTIFICATE_PASSWORD`) into a
  temp keychain. A global `CODE_SIGN_IDENTITY` override leaks onto every SPM
  target and is not an option.
- **iOS CI runs `macos-26` with Xcode 26.** Xcode 16 strips the
  `$NonescapableTypes` symbols from Capacitor 8's `.swiftinterface` and breaks
  `@capacitor/share`. All three plugins live in the committed
  `CapApp-SPM/Package.swift`; beta Xcodes are filtered out.
- **Hosting-vs-functions deploy race** (hosting runs #7, #9, #11, #13):
  hosting fails with "Cloud Run service X does not exist" when a rewrite
  targets a function still being created. Deploy functions first, hosting
  after; re-fire hosting by editing a comment in `deploy-hosting.yml`.
- **TestFlight daily upload cap.** 16 builds in one day exhausted the per-app
  quota (runs #246 to #248 failed at upload only). One retry after the window
  (over 4h) picks up main HEAD; do not spam re-triggers.
- **Functions deploy scoping.** `deploy-functions.sh` pins
  `--project secondbrain-app-94da2` and auto-prefixes `functions:`. A change
  to `.env`, a shared module (`ai_service.py`, `models.py`, `search.py`), or a
  new scheduler cron must deploy UNSCOPED, or other endpoints keep old config.
  `process_link_background` sometimes 409s on deploy; the workflow retries
  once, or retry after ~60s. Any file under `functions/**` (even a test)
  triggers a deploy.
- **Vercel inlines `NEXT_PUBLIC_*` at build time.** After changing one,
  redeploy with the build cache OFF or the old value ships silently.
- **Sandboxed agent sessions cannot reach prod** (`*.run.app`, the emulator
  JAR download, Vercel prod, Facebook). Verify deployed functions through the
  app; let `rules-tests.yml` and `deploy-rules.yml` run the emulator suite.
  `pipeline-debug.yml` plus `.github/scripts/` (trigger branch
  `trigger/pipeline-debug`) is the documented way to reach prod from CI with
  repo secrets. On a local machine you can curl the functions directly.

### iOS, Capacitor, WKWebView

- **Native detection:** never `Boolean(window.Capacitor)`; `@capacitor/core`
  defines it in a plain browser too, which silently disabled the web sign-in
  gate for the whole pre-cutover era (fixed `0acf578`). Use `isNativeApp()`
  in `web/lib/api.ts`.
- **`web/lib/firebase.ts` WebView fixes, do not reintroduce:** `initializeAuth`
  without the popup resolver (gapi crashes under `capacitor://`),
  `experimentalForceLongPolling` for Firestore, emulator gate requires
  `localhost` and `http:` (so `http://127.0.0.1:3000` previews against prod).
- **CORS:** `_allowed_origins()` in `functions/main.py` must include
  `capacitor://localhost`, `ionic://localhost`, `https://localhost` or every
  native `/api/*` call fails with a bare "Load failed". Firebase callables
  fail the `capacitor://localhost` preflight, which is why the HTTP twins
  `claim_workspace_http`, `delete_account_http`, `get_share_config_http` exist.
  Callable and twin must enforce auth identically.
- **SSE is buffered in WKWebView.** Native Ask uses buffered JSON
  (`wantStream = !isNativeApp()`); `/api/chat` bypasses Hosting via
  `web/app/api/chat/route.ts` to the function's direct URL (`maxDuration = 60`).
- **APNs never delivered until 2026-08-25** because the `.p8` key was
  "Team Scoped (All Sandbox topics)", which cannot authenticate against
  production APNs that TestFlight builds use. A new Sandbox & Production key
  fixed test pushes, reminders, and weekly synthesis at once. If push breaks
  again, check the key's environment column first.
- **Scheduler cadence:** `every 15 minutes` is App Engine syntax anchored to
  deploy time, so a user-chosen minute could never coincide. `send_digests`
  uses unix-cron `*/5 * * * *`, `DIGEST_CADENCE_MINUTES=5`, and the picker
  offers only 5-minute values.
- **In-app image picking did nothing** because `addImageFiles` read the
  `FileList` inside a `setImages(prev => ...)` updater that runs after
  `e.target.value = ''` emptied it. Snapshot `Array.from(files)` synchronously
  and keep `URL.createObjectURL` and toasts out of StrictMode-double-invoked
  updaters (`6fd5c96`, build 1310).

### Auth

- **Cutover order lesson:** ship and device-verify a gated iOS build BEFORE
  anything starts enforcing. `NATIVE_AUTH_SETUP.md` §6 puts that step after
  the rules lock, which breaks every phone in the gap. GitHub's secrets UI
  shows a blank box for an existing secret (the UI hides it; it is not empty).
  `OWNER_EMAIL` fails closed via `_owner_email_matches`.
- **`APPCHECK_ENFORCE` is deliberately unset.** Enforcing it takes native
  down (browser-only reCAPTCHA, no App Attest plugin). Not part of any cutover.
- **Safari desktop sign-in** broke because `authDomain` was cross-site;
  since Safari 16.1 `signInWithRedirect` fails silently under partitioned
  storage. `web/lib/auth.ts` only falls back to redirect when
  `redirectCanWork()` (same-site), else throws `PopupBlockedError`. The
  authDomain moved to `mymachina.app` and was verified 2026-09-01.
- **Do not remove `secondbrain-app-94da2.firebaseapp.com`** from either
  authorized-domain list; it hosts `/__/auth/handler`, and deleting it kills
  sign-in everywhere including iOS.

### Search and Ask retrieval (design decisions, not bugs to reopen)

- **The LLM relevance judge is the precision mechanism, not distance gates.**
  Hebrew queries compress every cosine distance into 0.55 to 0.70, so
  thresholds, cliffs, and recall floors all misfire. `judge_relevance`
  (gemini-3.1-flash-lite, temperature 0, JSON, `SEARCH_JUDGE_TIMEOUT_MS` 9s)
  filters and never reorders, and runs inside the thread-pool window.
- **The judge must quote verbatim evidence.** Verdicts are `{"n","evidence"}`
  objects; `parse_judge_selection` verifies the quote occurs in the card
  digest (`_evidence_norm` forgives case, punctuation, niqqud). A missing or
  hallucinated quote drops the card. Sharing a language or a broad category
  with the query is not evidence.
- **Judge unavailable means literal matches only.** The distance-gate
  fallback was removed from `perform_hybrid_search`; `mode: "gate"` in the
  response means literal-only and is there for diagnosis from the network
  tab. Ask retrieval keeps its own path and default recall floor, untouched.
- **Hebrew substring matching was the recurring bug** ("function" hit
  "functions", ערב hit התערבות). `keyword_match_score` is whole-word via
  `token_in_text` (stacked Hebrew clitic prefixes, optional plurals, non-word
  bounded); `keyword_all_tokens_match` requires every query token;
  `apply_same_script_gate` (`SEARCH_SAME_SCRIPT_MARGIN` 0.12, 0.68 ceiling)
  exempts cross-script evidence so English-to-Hebrew still works.
- **Gemini safety false-positives on Hebrew.** The judge now passes
  `_ASK_SAFETY_SETTINGS` (BLOCK_NONE) like every Ask call and records
  exceptions to `server_errors` under `search_judge`. `PROHIBITED_CONTENT` is
  a non-configurable INPUT filter: both RAG paths retry with headline-only
  cards (`_headline_cards`) via `EmptyGenerationError.prompt_blocked`;
  model or paraphrase retries are useless against it.
- **Never cite-all on a missing `[[CITED:]]` marker** (AUDIT C-1/P-3); the
  streaming and non-streaming filters mirror each other.
- **Cold start:** `warmSearchBackend()` fires a `{warmup:true}` POST when the
  search bar opens; `search_links_http` answers 204 before auth on its own
  `search-warm` rate bucket. `min_instances` was declined on cost.
- **Semantic search stale guard** (AUDIT P-2): generation counter plus abort
  on cleanup so out-of-order responses cannot clobber newer results.

### Share extension, capture, rules, cost

- **Share-sheet 429 for everyone:** the Share Extension carries no bearer, so
  `share_ingest`'s pre-body gate keyed on the last XFF hop, which through the
  Hosting rewrite is the proxy's egress IP (one bucket for all users). Now
  keyed on a sha256 of the presented `X-Ingest-Token`. Unblock by deleting
  `rate_limits` docs whose id starts with `share:`.
- Workspaces created by the client-side fallback have no `ingestToken`, and
  the callable cannot run from `capacitor://localhost`; hence
  `get_share_config_http` and `/api/share-config`.
- **The share-capture progress banner** (`useSharedCaptureBanner`) retires on
  feed authority (`onFeedLoadedChange`, 4s settle), not only on seeing a
  `processing` card, and drops captures older than 20 min.
- **Cost controls:** the GCP budget alert at ₪50 is a real kill switch that
  binds around 70 users; raising it to ₪500 is an open owner step (§4 5b).
  Free tier 100 saves and 20 asks per month, Pro unlimited (`FREE_*`/`PRO_*`
  env in `quota.py`; 429 body carries `upgrade/kind/used/limit`); a lifetime
  `imports` quota (free 500, pro 10000) is separate. Rate limits are composite
  per-uid plus IP on paid endpoints (AUDIT S-2).

### Still open (do not assume these are done)

- **Brand-new account's FIRST native sign-in** sometimes hit "We couldn't
  finish setting up a workspace" (`claimWorkspaceHttp` via
  `/api/claim-workspace`), 2026-08-26. Root cause not found; diagnostics
  shipped (error string on the restricted screen, 60s timeout plus one
  retry). Workaround: sign in once on desktop web. Next step: read
  `client_error_reports` in the Firebase console.
- **Owner steps:** raise the Gemini cap (5b); rotate the Gemini key and the
  App Store Connect `.p8` (§4 5); OAuth-only reviewer sign-in
  (`docs/APP_STORE.md` §5); App Store metadata and screenshots; the
  RevenueCat and App Store Connect subscription checklist (§4 26, the paywall
  says subscriptions are unavailable until then); delete the pipeline-debug
  workflow and trigger branch once demo seeding is done.
- **Nothing checks that a rules tightening is compatible with the build on
  phones.** `deploy-rules.yml` probes anonymously for 403 but never asks
  whether the live TestFlight build still works. That is the exact hazard
  behind the 1266/1267 incident and it is unguarded.
- **AUDIT.md carry-overs:** A-7 (two markdown stacks render Ask and Card
  differently), P-7 (Share Extension post-dismissal failure reaches nobody),
  A-8 (`requirements.txt` has no lockfile; owner runs `pip freeze`, agents
  must not guess pins). Dismissed on purpose, do not re-find:
  `dangerouslySetInnerHTML` (one static literal in `app/layout.tsx`), the two
  markdown stacks as a security issue, `ReadingView` XSS, S-6 fail-closed on
  Firestore outage.

## 6. Working conventions

- **Verify before claiming done.** `cd web && npx tsc --noEmit` (exit 0),
  `cd functions && python -m py_compile *.py`, `pytest functions/tests -q`.
  For visual work, render-verify with Playwright at 390px in light and dark
  before shipping (recipe in the polish skill).
- **Theme tokens only** (`text-text`, `bg-card`, `--accent-gradient`,
  `--ease-modal`; `--ease-spring` for the card grid only). Never hardcoded
  white/black/hex.
- **Shared components over local copies:** `SourceByline`, the category chip
  system, `surface-card` + `--shadow-card`, collection color dots.
- **RTL/Hebrew is first-class.** Per-row `dir` from `getDirection`,
  `font-hebrew`, `dir="auto"` on chips and mixed-script runs.
- **Native detection:** `isNativeApp()` in `web/lib/api.ts`. Never
  `Boolean(window.Capacitor)`.
- **No em dashes in user-facing strings** (build gate). Use a comma, a colon,
  or a new sentence.
- **Security boundary:** code is yours, console is the owner's. Never flip
  `REQUIRE_AUTH`, deploy rules by hand, set functions env, or rotate keys.
  Collect those into an owner-action list and hand it back.
- **One area per security pass**, one scoped round per polish pass, one
  finding per fix commit.
- **Document in `SOURCE_OF_TRUTH.md`, never a new HANDOFF/TASKS/spec file.**
  Parallel sessions happen: pull before merging, keep §9 newest-first.

## 7. Quick reference

- Firebase project `secondbrain-app-94da2` (us-central1). Vercel
  `my-links-sable.vercel.app`. Bundle `com.morhogeg.machina`, Team
  `8Y2M94RUHG`, App Group `group.com.morhogeg.machina`.
- Repos: `morhogeg/MyLinks` (this app), `morhogeg/versus` (empty).
- Owner email for support: `support@mymachina.app`.
- Workflows in `.github/workflows/`: `ios-testflight.yml`,
  `deploy-functions.yml`, `deploy-rules.yml`, `deploy-hosting.yml`,
  `python-tests.yml`, `rules-tests.yml`, `pipeline-health.yml`,
  `pipeline-debug.yml`, `ask-debug.yml`.
