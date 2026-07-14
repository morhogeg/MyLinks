# Machina AI — Production Readiness Report (2026-07-14)

**Question answered:** can Machina serve *multiple real users* in production — code,
backend, infra, cost, and App Store compliance? Audited against the code on
`main` (three parallel audits: backend functions, web frontend, infra/ops).

**Verdict:** the engineering fundamentals are genuinely good, but the system is
**structurally single-user today**. The launch gate is the auth cutover (already
fully coded, owner console steps remain) plus a set of scale/cost/ops hardening
items — most of which are code-implementable now and were implemented in this
session (see status tags). Items marked **⛔ OWNER** need you and are collected
in §4 as an ordered launch runbook.

Status tags: **✅ IMPLEMENTED (this session)** · **⛔ OWNER** · **📋 DEFERRED** (post-launch)

---

## 1. What's already good (verified, don't redo)

- **Auth code is complete on both platforms** — Google + Apple sign-in, bearer
  verification on all data endpoints, `claim_workspace` new-user path, account
  deletion, locked ruleset staged with a real emulator test suite that runs in CI
  (`rules-tests.yml`).
- **Backend test coverage is real** — 16 pytest files run in CI (`python-tests.yml`)
  on every functions change.
- **Search architecture scales** — semantic search is server-side (`find_nearest`
  vector index, top-K); embeddings never reach the client. Ask Machina retrieval
  is server-side too.
- **Security work landed** — SSRF-guarded scraper, sanitized errors, admin
  endpoints fail closed without `ADMIN_TOKEN`, PII scrubbed from share docs
  (`shared_owners` isolation), CSP/HSTS headers on both hosting surfaces, no
  secrets in git, rate-limit buckets (IP+uid) on the paid endpoints.
- **Failure honesty** — background pipeline never silently drops a save
  (retryable FAILED state + 5-min stuck-processing janitor); embedding failures
  degrade gracefully with `needsEmbedding` repair.
- **App Store pack** — privacy manifests wired, `/privacy` + `/terms` live and
  public, AI-consent gate (Gemini named), IAP-free launch plan, nutrition-label +
  metadata + review notes drafted in `docs/APP_STORE.md`, iPhone-only configs.
- **Firestore indexes** — cross-checked against every query in the codebase;
  complete for current usage.

## 2. The two structural launch blockers (both ⛔ OWNER)

### 2.1 Auth cutover — the linchpin
Live behavior is still: web Google-gate, native adopts the **first user doc**
(`AuthProvider.tsx:215`), backend trusts client-supplied `uid`
(`main.py:177-199`), and live `firestore.rules` are `allow read, write: if true`.
Any second real user is a cross-tenant data breach. Everything is coded and
flag-gated; the remaining steps are console-only (§4 step 1). Until flipped,
**nothing else in this report makes the app multi-user.**

### 2.2 Deployed backend is weeks behind `main`
Every ship since 2026-07-10 is marked "Backend NOT deployed — owner step"
(cloud sessions have no Firebase creds). Dark-but-written: `search_links_http`
(device search currently degrades to keyword-only — live user-visible breakage),
`sync_link_embedding`, weekly synthesis, share/digest/reminder changes, and now
this session's hardening. Fix is §4 step 2; the new CI deploy workflow (§3.10)
removes this class of drift permanently once you add one secret.

## 3. Findings, specs, and implementation status

### Backend — cost & abuse

**3.1 No cost ceiling on any function — ✅ IMPLEMENTED**
*Problem:* no `max_instances` anywhere; a traffic spike or abuse on
`analyze_link`/`analyze_image`/`ask_brain` scales out with unbounded paid Gemini
calls. *Spec:* `set_global_options(max_instances=20)`; per-function tighter caps
on paid endpoints (analyze/ask/search ≈10, share_ingest ≈10, admin/backfills 1,
schedulers 1). Keeps worst-case cost bounded at ~10 concurrent instances per
paid surface.

**3.2 No monthly per-user quotas — ✅ IMPLEMENTED**
*Problem:* §7 of SOURCE_OF_TRUTH plans soft caps (~150 saves / ~100 asks per
month) but nothing enforces them; one hot user or leaked token = unbounded spend.
*Spec:* transactional per-uid monthly counter doc
(`usage_quotas/{uid}` with `{YYYY-MM: {saves, asks}}`), checked after uid
resolution in `analyze_link`, `analyze_image`, `ask_brain`, and the
`share_ingest` enqueue path; env-tunable via `MONTHLY_SAVE_QUOTA` /
`MONTHLY_ASK_QUOTA` (default 150/100, `0` disables); friendly 429 with an
explanatory message; counters denied to clients in the locked ruleset.

**3.3 `share_ingest` token path under-protected — ✅ IMPLEMENTED**
*Problem:* the share-extension token path had only an IP bucket (120/hr), no
per-uid ceiling, and skipped App Check — a leaked ingest token allowed paid
pipeline spam. *Spec:* add a per-uid `share` bucket after token→uid resolution
(mirroring other paid endpoints) + count enqueued saves against the monthly
save quota.

**3.4 `publish_share_http` accepts unbounded client payloads — ✅ IMPLEMENTED**
*Problem:* client-built snapshot stored with no size cap or rate limit — spam /
large-doc abuse surface. *Spec:* enforce a payload size cap (~200 KB serialized)
and a per-uid rate bucket; reject over-cap with 413.

**3.5 Rate limiter fails open — ✅ IMPLEMENTED**
*Problem:* any Firestore error disabled ALL rate limits exactly when things are
degraded. *Spec:* paid buckets (analyze/ask/search/share) fail **closed** (429),
cheap buckets keep failing open.

**3.6 Gemini retry/backoff weak — ✅ IMPLEMENTED**
*Problem:* one flat 0.75 s retry on any exception; `embed_text` had no retry.
*Spec:* up to 3 attempts with exponential backoff + jitter, retrying only
retryable errors (429/5xx/timeouts); embed gets 2 attempts. No model fallback
(deliberate — keep behavior predictable).

**3.7 `task_logs` grows forever — ✅ IMPLEMENTED (code) + ⛔ OWNER (optional TTL)**
*Spec:* the 5-min janitor now also prunes `task_logs` older than 14 days in
bounded batched deletes, and new log docs carry an `expireAt` **Timestamp**
field. Optionally set a Firestore TTL policy on `expireAt` (NOT the string
`timestamp` field — TTL only acts on Timestamp types) and the janitor becomes
belt-and-suspenders.

### Backend — scale

**3.8 Schedulers full-scan every user — ✅ IMPLEMENTED**
*Problem:* `check_reminders` (every 2 min) loaded ALL user docs + per-user
unbounded pending-reminder scans; `send_digests` (every 5 min) loaded ALL user
docs. At 1 k users ≈ 1 M+ pointless reads/day, growing linearly. *Spec:*
reminders switch to one bounded `collection_group('links')` query
(`reminderStatus == pending AND nextReminderAt <= now`, limit 500) — needs the
new COLLECTION_GROUP composite index added to `firestore.indexes.json`
(deployed with §4 step 2); the redundant per-user timestamp-coercion scan is
dropped. Digest cadence relaxed 5 → 15 min (delivery precision no user notices)
and the scan reads only the fields it needs.

**3.9 Per-save full-collection tag reads — ✅ IMPLEMENTED**
*Problem:* `get_user_tags` (backend) and `getUserTags` (web) read the user's
ENTIRE links collection on every note/save/retry. *Spec:* bound to the most
recent 300 links (`order_by createdAt desc, limit 300`) — tag vocabulary comes
from recent activity anyway.

### Ops / infra

**3.10 No automated backend deploy path — ✅ IMPLEMENTED (workflow) + ⛔ OWNER (one secret)**
*Problem:* functions deploy only works from your Mac, which is WHY prod is weeks
behind `main`. *Spec:* new GitHub Actions workflow **"Deploy Cloud Functions"**
(`.github/workflows/deploy-functions.yml`, manual dispatch): sets up Python 3.13
venv, deploys explicit function targets (input, default = all) with
`--project secondbrain-app-94da2`, using a `FIREBASE_SERVICE_ACCOUNT` repo
secret (JSON key for a service account with Cloud Functions Admin +
Firebase Admin roles) and `GEMINI_API_KEY` secret written to `functions/.env`
at deploy time. Until the secrets exist the workflow fails fast with a clear
message — safe to land. **⛔ OWNER:** create the service account, add both
secrets (§4 step 2 — after which you never need the Mac to deploy again).

**3.11 Unpinned Python deps — ✅ IMPLEMENTED**
*Spec:* `requirements.txt` pinned to exact versions resolved from a clean
Python 3.13 venv and verified against the test suite; ranges kept as comments.
(Also: explicit `.env` in `functions/.gitignore`.)

**3.12 No backups / disaster recovery — ⛔ OWNER**
No PITR, no scheduled backups, no restore runbook. A buggy migration or a
mistaken `delete_account` is unrecoverable. *Spec (console/gcloud, ~10 min,
§4 step 5):* enable 7-day PITR + daily scheduled backups
(`gcloud firestore backups schedules create --database='(default)'
--recurrence=daily --retention=7w`).

**3.13 No monitoring / alerting / budget — ⛔ OWNER**
*Spec (§4 step 6):* GCP budget with alerts at 50/90/100 % of ~$25/mo; a Cloud
Monitoring uptime check on the `ping` function; one log-based alert on
functions error rate. Optional: Sentry (web) — code-side hooks exist
(`errorReporter.ts`), the missing piece is an account/DSN decision.

**3.14 Secrets hygiene — ⛔ OWNER**
Rotate the Gemini key (pasted in chat 2026-06-23) and the App Store Connect
`.p8` (pasted during CI setup). Set `ADMIN_TOKEN`, `APPCHECK_ENFORCE=true`,
`OWNER_EMAIL` in functions env at cutover (§4 steps 1–3).

### Frontend — scale & resilience

**3.15 Unbounded feed subscription — ✅ IMPLEMENTED**
*Problem:* the app subscribed to the ENTIRE `links` collection (no limit, no
pagination, no virtualization): 2 000-link library ⇒ ~2 000 billed reads per
cold session, everything in memory, 2 000 mounted DOM cards. *Spec:* windowed
subscription — `onSnapshot` with a growing `limit` (initial 150, +150 via a
"Load more" sentinel as you scroll; new saves always arrive, they're at the top
of the window); pull-to-refresh re-fetches only the current window; card grid
gets CSS `content-visibility: auto` so off-screen cards don't render. Keyword
search over loaded links is unchanged; semantic search is already server-side
over the full library, so recall for old items is preserved. Digest/synthesis
queries were already bounded; chats subscription now bounded (limit 100).

**3.16 Silent client failures / blind observability — ✅ IMPLEMENTED**
*Problem:* snapshot errors and many optimistic writes swallowed failures
(`.catch(() => {})`), and the error reporter no-ops when signed out — the exact
places a launch fails. *Spec:* route snapshot errors and previously-silent write
failures through `reportError`; buffer signed-out errors and flush after
sign-in; add a lightweight offline banner (navigator.onLine + Firestore
connectivity heuristics).

**3.17 Unbounded bulk writes — ✅ IMPLEMENTED**
*Spec:* bulk archive/delete now use chunked `writeBatch` (≤450 ops/batch)
instead of N parallel single-doc writes.

**3.18 `images.unoptimized: true` on Vercel — 📋 DEFERRED**
Forced by the static-export/Capacitor path; enabling Next image optimization
only on Vercel is possible but touches every card image and needs visual QA.
Post-launch item; bandwidth cost is real but not a launch blocker.

### App Store (Guideline-level, beyond what's already done)

- **Consent + policy pack is compliant** (5.1.1/5.1.2 Nov-2025 AI rules: Gemini
  named, first-run consent, public policy pages; account deletion in-app
  (5.1.1(v)); Sign in with Apple alongside Google (4.8); privacy manifests;
  current-SDK CI (April-2026 floor); iPhone-only screenshots).
- **⛔ OWNER remaining (all gated on cutover, §4 steps 7–8):** demo reviewer
  account + credentials in review notes; App Privacy nutrition label + metadata
  clicked into App Store Connect; 6 screenshots; governing-law jurisdiction in
  `/terms` §10; on-device verification sweep (SOURCE_OF_TRUTH §4 task 11); the
  **store build must be a `require_auth=true` build made AFTER the cutover**.
- **Note on quotas & review:** monthly quotas (3.2) are server-side soft caps
  with friendly messaging — no purchase path, so no IAP/paywall review risk at
  launch. When Machina Pro ships later it must use Apple IAP (already the plan).

### Post-implementation review round (2026-07-14, same session)

An 8-angle adversarial review of the implementation diff found and FIXED before
ship: windowed-feed completeness regressions (semantic-search results, deep
links, the in-app due-reminder strip, and collection member lists/publish
snapshots now resolve beyond the loaded window — collection publish reads the
full member set server-side); reminder-scheduler defects in the new
collection-group path (disabled-user due docs snoozed so they can't starve the
batch, per-user per-tick delivery cap restored, loud error if the composite
index is missing); quota fairness (charge after validation, refund on failed
analyses, no double-charge on retries); Gemini retry budget trimmed on the
synchronous paths + 120 s timeouts; `task_logs` prune made TTL-compatible and
batched; rate-limit fail policy moved into the bucket declaration table; deploy
workflow hardened (env-var secret handling, whole-codebase `--only functions`
deploy instead of a drift-prone hardcoded list, indexes deployed with it).

### Explicitly deferred (post-launch backlog)

Ingest-token Keychain hardening (task 12), offline read-cache decision (16),
Feed/Settings decomposition + `share_service` extraction (19a), image
optimization (3.18), server-side keyword search, Sentry adoption, M19+ roadmap.
Newly deferred from the review round (accepted trade-offs, revisit at real
scale): cursor-based pagination instead of the growing-window subscription
(deep scrolls re-read the window — O(pages²) reads for very large libraries),
window-scoped facet counts/keyword search/archive view (semantic search and
the new completeness fixes cover recall), merging the per-uid rate-limit and
quota transactions into one, and a shared paid-endpoint guard helper.

## 4. ⛔ OWNER LAUNCH RUNBOOK — ordered, everything that needs you

1. **Auth cutover prerequisites (console):** Firebase Apple provider → add
   **Services ID + `.p8`** (web Apple sign-in); set `OWNER_EMAIL`,
   `ADMIN_TOKEN`, `APPCHECK_ENFORCE=true` in `functions/.env`. **Rotate the
   Gemini key and the ASC `.p8`** while you're in there (3.14).
2. **Deploy the backend** (from `main` on the Mac — or add the
   `FIREBASE_SERVICE_ACCOUNT` + `GEMINI_API_KEY` secrets and use the new
   "Deploy Cloud Functions" workflow, 3.10): all functions (the full list is in
   SOURCE_OF_TRUTH §9 2026-07-13), then `./deploy-hosting.sh` once (publishes
   the `/api/search` rewrite), then
   `firebase deploy --only firestore:indexes` (new reminders collection-group
   index, 3.8) and hit `backfill_embeddings` once with `$ADMIN_TOKEN`.
3. **Flip the flags:** `REQUIRE_AUTH=true` (functions) +
   `NEXT_PUBLIC_REQUIRE_AUTH=true` (Vercel env + `require_auth=true` TestFlight
   build); redeploy functions + web.
4. **Lock the rules:** `cd firestore-rules-test && npm test` →
   `cp firestore.rules.locked firestore.rules && firebase deploy --only
   firestore:rules` (point of no return). Device-verify a brand-new-user
   sign-in creates a fresh workspace.
5. **Backups:** enable Firestore PITR + daily scheduled backups (3.12).
6. **Monitoring:** GCP budget alerts, uptime check on `ping`, one error-rate
   alert (3.13). Optional: Firestore TTL policy on `task_logs.expireAt`
   (Timestamp field added this session); Sentry DSN if you want real client
   crash reporting.
6a. **One-time data repair:** after deploying, hit `force_check_reminders`
   with `?coerce=1` (admin token) once — it rewrites any legacy
   Timestamp/string `nextReminderAt` values to integer-ms so old pending
   reminders keep firing under the new scheduler query.
7. **App Store Connect:** create + seed the demo reviewer account; fill
   credentials into `docs/APP_STORE.md` §3 notes; click in nutrition label +
   metadata; take the 6 screenshots; set governing law in `/terms` §10.
8. **Final pass:** on-device verification sweep (SOURCE_OF_TRUTH §4 task 11),
   then submit the post-cutover `require_auth=true` build.

## 5. Cost picture after this session's changes

Worst-case spend is now bounded on four axes: per-request (rate buckets,
fail-closed), per-user-per-month (quotas: 150 saves / 100 asks), per-platform
(max_instances caps), and per-month (your budget alert, step 6). Baseline
Firestore load no longer grows linearly with idle users (schedulers fixed), and
client sessions no longer bill reads for the whole library (windowed feed).
At the §7 model (~$0.10–0.50/user/month in Gemini + mostly-free Firebase tier),
1 000 active users lands roughly at $100–500/mo model cost with hard ceilings —
observable and survivable.
