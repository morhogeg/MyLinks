# Machina AI — Codebase Audit, Remediation & iOS Submission Readiness

> **Created 2026-07-09** by a full-tree orchestrated audit (4 parallel deep-read agents:
> backend Python, web frontend, iOS/CI/config, WhatsApp removal sweep) + build/lint/dependency
> checks. Every claim below is grounded in file:line on branch
> `claude/codebase-audit-ios-ready-9595aj` (base: `main` @ `9e5e37f`, build 1063).
> Builds on `AUDIT_FINDINGS.md` (2026-07-07) — items marked ✅ there were verified intact and
> are not re-reported here.
>
> **Repo scope note:** the session covers `morhogeg/MyLinks` and `morhogeg/Versus`.
> **Versus contains only a LICENSE file (single "Initial commit") — there is no code to audit
> or remediate there.** Everything below concerns MyLinks.
>
> Status legend: ✅ done (this remediation) · 🔄 in progress · ⬜ open · 📝 manual (owner)

---

## 1. Executive Summary

**Baseline health:** `tsc --noEmit` ✅ clean · `py_compile` ✅ clean · eslint ❌ 15 errors / 37 warnings ·
`npm audit` ❌ 1 critical (protobufjs, transitive), 5 high, 5 moderate, 1 low.

### Top 5 risks

1. **Live Firestore rules are world-writable** (`firestore.rules:29-69`, `allow read, write: if true`).
   Known, accepted pre-cutover risk; the locked ruleset (`firestore.rules.locked`) is staged and correct.
   Everything gates on the auth cutover (📝 §9-M1). *Not agent-fixable — flipping rules before auth is on
   would brick the live app.*
2. **`aps-environment` = `development`** (`web/ios/App/App/App.entitlements:5-6`) and the CI tripwire
   only checks the key's *presence*, not its value (`.github/workflows/ios-testflight.yml:295-298`).
   If the App Store export does not rewrite it to `production`, every shipped build registers sandbox
   APNs tokens and **push reminders/digests silently never arrive**. Fix: CI must assert
   `production` in the exported IPA (ground truth) — task I-1.
3. **SSRF guard bypass in platform scrapers** (`functions/scraper.py`): `scrape_url` validates the
   original URL once (scraper.py:90) then dispatches by substring; every platform fetcher
   (LinkedIn :261, X/fx/vx :304/:329/:369, Instagram :578/:619, Facebook :760) uses bare
   `requests.get(allow_redirects=True)` — a public URL that 30x-redirects to link-local/RFC1918 is
   fetched unchecked, and `instagram.com.evil.test` routes into unguarded fetchers — task S-1.
4. **WhatsApp removal without channel migration silently kills reminders/digests** for any user whose
   stored `reminders_channel`/`digest_channels` is `['whatsapp']` (including legacy users with the
   field unset, who *default* to `['whatsapp']` at `functions/reminder_service.py:177`,
   `functions/models.py:165`, `web/components/SettingsModal.tsx:331-336`): there is **no fallback** —
   the send loop just skips them (`reminder_service.py:181`, `digest_service.py:995`). The removal
   (chapter 4) must normalize `whatsapp → push` at read/send time — tasks W-1/W-2.
5. **Critical dependency CVE:** protobufjs ≤7.6.2 (transitive via firebase) — arbitrary code
   execution + prototype pollution advisories; `npm audit fix` resolves without breaking ranges.
   Plus a moderate postcss advisory pinned by next 16.1.6 — task S-5.

### Top 5 quick wins

1. `npm audit fix` — clears the critical protobufjs advisory in one command (S-5).
2. Fix `[[CITED:]]` streaming fallback (`functions/ai_service.py:528-530`): when the model omits the
   citation marker, the answer is attributed to **all** retrieved cards (up to 13) — a one-line trust
   bug (C-1).
3. Fix `has_any_embeddings` single-doc sampling (`functions/search.py:146-155`): if one arbitrary doc
   lacks an embedding, **all semantic search and ask_brain retrieval silently return nothing** (C-2).
4. Add `export const maxDuration` to `web/app/api/chat/route.ts` — Vercel's default timeout can kill
   long RAG streams mid-answer (C-4).
5. Delete confirmed dead weight: 5 Next-template SVGs, `InstallPWA.tsx` (retired PWA), vestigial
   platform-filter state in Feed, `ClaudeService`, dead `models.py` classes, two dead scripts (D-*).

---

## 2. Architecture & Weak Spots

**Stack** (verified): Next.js 16.1.6 + React 19.2.3 + Tailwind v4 (`web/`, static export for
Capacitor; native build on Vercel) · Capacitor 8 iOS shell + native Share Extension
(`web/ios/App/`, SPM) · Python 3.13 Cloud Functions (`functions/`, project `secondbrain-app-94da2`) ·
Gemini `gemini-3.1-flash-lite` + `gemini-embedding-001` · Firestore `users/{uid}/…`
(uid = phone number for the legacy owner workspace; Auth-uid for new users; linked via `authUids[]`).

**Endpoint auth surface** (functions/main.py): anonymous — `ping` :485, `share_page` :1962,
`get_article` :860 (App Check soft + IP rate limit only); soft-uid — `analyze_link` :540,
`analyze_image` :905, `ask_brain` :710; ingest-token — `share_ingest` :1037; bearer-required —
`claim_workspace_http` :1280, `delete_account_http` :1381, device-token endpoints :1456/:1488,
`publish/unpublish_share_http` :1905/:1937; admin-gated (X-Admin-Token, 404 fail-closed) — 6
backfill/debug/force endpoints; Twilio-signature — `whatsapp_webhook` :2071 (removed by chapter 4).

| # | Location | Problem | Fix | Effort |
|---|----------|---------|-----|:--:|
| A-1 | `web/components/Feed.tsx` (2343 lines) | God component: links listener, search, filters, actions, 6 view modes, all overlays | Decompose along mapped seams (§ chapter 3 → task R-3): `useLinks`, `useSemanticSearch`, `useFeedFilters`, `useLinkActions`, render extractions | L |
| A-2 | `functions/main.py` (2769 lines) | Entry point holds an unrelated ~470-line share-page renderer/publisher (lines 1529–1997) | Extract `share_service.py` — clean module boundary, no coupling to analyze/WhatsApp paths (R-1) | M |
| A-3 | `functions/main.py:615-642` vs `:991-1011` vs `:2465-2484` | Three drifted copies of the `link_data` builder (`confidence` 0.8/0.9/absent; embedding handling differs) | Single `build_link_data()` helper (R-1) | S |
| A-4 | `functions/ai_service.py:309-360` vs `:403-453` | RAG grounding prompt + `_source_label`/`_card_block` duplicated verbatim between `answer_from_context` and `_stream` | Shared prompt builder (C-1) | S |
| A-5 | `web/components/SettingsModal.tsx` (1293 lines) | Settings god-modal | Extract `useUserSettings`, `DigestSettings`, `AccountSection` (R-4) | M |
| A-6 | Feed render pipeline | 5 Hz full-tree re-render storm during any capture (details chapter 7 / P-1) | Memoization + shared clock + CSS-driven banner | M |
| A-7 | `web/components/AskBrain.tsx:5-7` vs `web/components/SimpleMarkdown.tsx` | Two markdown stacks; same text renders differently in Ask vs Card/Digest | Consolidate on react-markdown with a shared components map — **needs visual QA on device**, deferred (📝 §9-M13) | M |
| A-8 | `functions/requirements.txt` | Floor-pinned ranges, no lockfile → non-reproducible deploys (file's own TODO admits it) | Owner: `pip freeze` from a known-good deploy (📝 §9-M9); agents must not guess pins | S |

---

## 3. Dead Code, Bad Code & Refactoring Sweep

### Dead code — verified unused repo-wide (all auto-fixable)

| # | Item | Evidence | Status |
|---|------|----------|--------|
| D-1 | `ClaudeService = GeminiService` (`functions/ai_service.py:647`) | Only the definition line exists repo-wide | ⬜ |
| D-2 | `format_digest_whatsapp` (`functions/digest_service.py:331-333`) | Zero callers (only the `_messages` variant is live) — subsumed by W-1 | ⬜ |
| D-3 | `models.py` `LinkDocument` (:92-117) + `RelatedLink` (:120-130) + import at `graph_service.py:6` | Imported once, never instantiated (graph_service builds plain dicts; comment at graph_service.py:83 is misleading). TS `RelatedLink` in types.ts is unrelated | ⬜ |
| D-4 | `functions/test_yt_scrape.py` (whole file) | Standalone debug script; imports `youtube_transcript_api` which is **not in requirements.txt** — cannot run in deploy env | ⬜ |
| D-5 | `functions/backfill_embeddings.py` (whole file) | Only called from its own `__main__`; superseded by `sync_link_embedding` trigger + `GraphService.backfill_batch` | ⬜ |
| D-6 | Dead import `calculate_next_reminder` (`functions/main.py:42`) | Never used in main.py | ⬜ |
| D-7 | Template SVGs: `web/public/{file,globe,next,vercel,window}.svg` | Zero references in web/ | ⬜ |
| D-8 | `getCategoryColor()` (`web/lib/colors.ts:93-116`) | No callers (only `getCategoryColorStyle`/`getColorStyleByKey` used) | ⬜ |
| D-9 | Vestigial Feed state: `selectedPlatforms` (:110), `screenshotOnly` (:116), `handleTogglePlatform` (:567-572), `availablePlatforms`/`platformCounts`/`screenshotCount` (:559-565), dead filter branch (:460-465) | Never set to non-empty/true; the old platform icon row was replaced by grouped Sources | ⬜ |
| D-10 | `web/components/InstallPWA.tsx` + refs `app/page.tsx:8,186` | iPhone PWA retired (SOURCE_OF_TRUTH task 15); still shows Add-to-Home-Screen on mobile Safari; contains light-theme-breaking `text-white` (:50,53,55) | ⬜ |
| D-11 | Unused import `platformActiveStyle` (`web/components/Feed.tsx:9`) + ~15 other unused imports/vars flagged by eslint (full list: scratch eslint run; e.g. Card.tsx:6 `Tag`/`CheckCircle2`, LinkDetailModal.tsx:5, Feed.tsx:34-35) | eslint `no-unused-vars` | ⬜ |
| D-12 | `test_locally.sh` | Posts to `/webhook/whatsapp` which has no rewrite; targets an emulator flow that no longer exists — subsumed by W-1 | ⬜ |
| D-13 | Dead branch `INCLUDE_CONNECTIONS = False` (`functions/whatsapp_handler.py:24,163-171`) | File deleted entirely by W-1 | ⬜ |
| D-14 | `AddLinkForm.tsx:255` writes `embedding_vector` from the analyze response into `saveLink` | Contradicts the shipped embedding-drift fix (AUDIT_FINDINGS #9; `storage.ts:149-152` deliberately omits it on retry) — re-introduces plain-array drift the trigger must repair | ⬜ |
| D-15 | Stale comment `functions/main.py:44` (claims scraper pulls `youtube_transcript_api` — it no longer does) | Comment only | ⬜ |

### Anti-patterns & bad code (auto-fixable unless noted)

- **Silent excepts:** `scraper.py` returns empty dicts on any exception (:158, :286, :360, :398);
  `main.py` bare `except: pass` at :2522-2523, :2568-2569. Add logging, keep fail-soft behavior. (S)
- **eslint errors (15):** `no-explicit-any` (storage.ts:79/123/274, Feed.tsx:202/342, Card.tsx:111,
  LinkDetailModal.tsx:171), `set-state-in-effect` (ThemeProvider.tsx:40, CollectionFormModal.tsx:51,
  ManageCollectionCardsSheet.tsx:43), `react-hooks/purity` (useProcessingBanner.ts:35),
  `no-html-link-for-pages` (privacy/terms pages ×4). Task D-16. (M)
- **Magic numbers:** Gemini temperatures 0.2/0.6 (ai_service.py:183/:484/:592), `text[:30000]`/`[:9000]`
  (:228/:637), scattered Firestore `limit()`s (main.py:689/:1240/:2627). Name the load-bearing ones
  opportunistically — not worth a dedicated pass. (S, low priority)
- **Overly long functions:** `whatsapp_webhook` (~207 lines — deleted by W-1),
  `process_link_background` (~253 lines), `_scrape_facebook_url` (:730-843). (M)
- **`searchResults` un-normalized** (`Feed.tsx:200-201` skips `toLink()`): currently safe
  (id-membership use only) but a landmine for future rendering — normalize at the boundary. (S)

### Dependencies

- **web:** protobufjs ≤7.6.2 **critical** (transitive; `npm audit fix` clean), postcss moderate
  (pinned by next 16.1.6; fix requires next 16.2.10 — defer to a deliberate Next upgrade). No unused
  npm deps (all verified imported); `@capacitor/cli` correctly in devDependencies.
- **functions:** floor-pinned ranges (`firebase-functions>=0.4.0` is a very low floor) — see A-8/📝 M9.
  `twilio>=8,<9` removed by W-1.
- **Lint config exists** (eslint 9 flat config, next/core-web-vitals + typescript) but no
  `npm run lint` in CI and 15 standing errors.

---

## 4. WhatsApp Removal

**Decision (owner, this orchestration): remove WhatsApp capture + delivery entirely.**
Full inventory verified repo-wide 2026-07-09. WhatsApp/Twilio lives **only** in backend Python,
frontend Settings/onboarding/legal strings, and docs — zero references in iOS Swift, entitlements,
Info.plists, the browser/Safari extensions, or CI.

**Invariant — do NOT touch:** uid = phone-number keying is independent of WhatsApp capture
(`link_service.py:94-98`: new users are keyed by Firebase Auth uid; legacy docs keep their phone
doc-ids; `authUids[]` linking unaffected). Removing WhatsApp removes a *lookup path*
(`find_user_by_phone`, link_service.py:42 — sole caller is the webhook), not the keying.

### Removal set (tasks W-1…W-4)

**W-1 backend** (`functions/`): delete `whatsapp_handler.py` (only holder of
`from twilio.rest import Client`); in `main.py` delete `whatsapp_webhook` (:2071-2278),
`_verify_twilio_signature` (:2004, holds the 2nd/last Twilio import), `_seen_message_sid` (:2038,
+ its `processed_messages` collection usage), `_mask_phone` (:145, orphaned),
`_RATE_LIMITS["whatsapp"]` (:230), `has_twilio_sid` (:512), and the WhatsApp legs of
`process_link_background` — `fromNumber` discriminator (:2339), Twilio-basic-auth media fetch
(:2409-2412), notify branches (:2515-2528, :2571-2572); in `digest_service.py` delete the 4 WhatsApp
formatters (:263, :293, :331, :520), `WHATSAPP_LIMIT` (:258), both `if "whatsapp" in channels`
delivery blocks (:795-804, :974-995), lazy imports (:751, :912); in `reminder_service.py` delete the
`wants_whatsapp` leg (:179-181, :242-251) + lazy import (:138); in `link_service.py` delete
orphaned `find_user_by_phone` (:42); in `models.py` delete `WebhookPayload` (:135) and flip
`digest_channels` default `["whatsapp"]` → `["push"]` (:165); `requirements.txt` drop `twilio`;
`.env.example` drop the TWILIO block; delete `test_locally.sh`; trim the WhatsApp word from the
`firestore.rules:10` comment (the tokenless-write rule itself is shared with share-ingest — keep it).
**Channel migration (risk #4):** normalize at read/send time — everywhere channels are read
(`reminder_service.py:172-177`, `digest_service.py:755/:924`), map `'whatsapp'` → `'push'` and treat
missing as `['push']`. Keep shared code: `process_link_background` itself, `is_hebrew`,
`handle_reminder_intent`/`set_reminder`/`format_local_time`, `link_exists_for_url`/
`pending_exists_for_url`, `pending_processing` rule, email+push delivery legs.

**W-2 frontend** (`web/`): `types.ts:157-158` drop `'whatsapp'` from `DigestChannel`/`ReminderChannel`;
`SettingsModal.tsx` remove the reminder toggle (:818-819), digest toggle (:1042-1043), summary chip
(:441), and flip legacy fallbacks `['whatsapp']` → `['push']` (:331-336); `Onboarding.tsx:52-53`
remove the WhatsApp slide; `PushNudge.tsx:43-45` flip the legacy assumption; sweep comments
(`useProcessingBanner.ts:9`, `page.tsx:39`, `Feed.tsx:143/168`, `Card.tsx:131`, `AddLinkForm.tsx:68`,
`types.ts:6/164/194`).

**W-3 legal pages**: `app/privacy/page.tsx` remove phone-number collection (:50-53) + Twilio
subprocessor (:95-96); `app/terms/page.tsx:34` drop WhatsApp from capture surfaces.

**W-4 docs**: `README.md` (part of the full rewrite, D-17), `docs/APP_STORE.md` (:37-38 phone-number
guidance, :90 description bullet, :138-142 review notes), `AUTH_SPEC.md:23/57/151`,
`NATIVE_AUTH_SETUP.md:144`, `.claude/skills/ship/SKILL.md:110` (TWILIO env mention),
`SOURCE_OF_TRUTH.md` (§1 capture list, §2 stack, env-var gotchas, App-Store notes — 30+ hits),
`functions/scraper.py:657/:827` reword `WHATSAPP SHARED CAPTION` label → `SHARED CAPTION` (with S-1).

**Orphaned-fallback check:** after W-1, digest channels = `push` + `email`; email is a logged no-op
until SendGrid/SMTP is configured (📝 M8). Push requires the owner's pending APNs console steps
(📝 M7). Reminders = push-only. No other fallback paths orphan.

**Manual residue (📝 M6):** retire the Twilio number/webhook in the Twilio console; optionally purge
the `processed_messages` Firestore collection; remove `TWILIO_*` from the deployed functions env.

---

## 5. iOS App Store Submission Readiness (2026 guidelines)

Verified against actual files (not docs claims).

| Item | Verdict | Evidence |
|---|---|---|
| Guideline 2.1 completeness — app functions without WhatsApp/Twilio | **PASS** (post-W1: share sheet, web add, extension remain) | capture surfaces in §4 |
| Usage strings (camera, photo library) | **PASS** | `App/Info.plist:73-76`; no mic/location/contacts APIs used anywhere |
| Privacy manifests (both targets) | **PASS** | `App/PrivacyInfo.xcprivacy` + `ShareExt/PrivacyInfo.xcprivacy`: CA92.1 UserDefaults matches actual API use; no other required-reason APIs used; wired into Copy Bundle Resources (CI-confirmed build 1008) |
| App Privacy label accuracy vs actual collection | **PASS w/ edit** | `docs/APP_STORE.md` §1 matches code; **W-4 must drop the WhatsApp/phone-number edge-case note** (:37-41) |
| AI/automated-content disclosure (5.1.1/5.1.2, Nov 2025) | **PASS** | First-run consent gate `AIConsentNotice.tsx` mounted in `AuthProvider.tsx:328-334` on both platforms, outside auth flags; Settings names Gemini; 📝 verify presence in the submitted build on device |
| `ITSAppUsesNonExemptEncryption` | **PASS** | `App/Info.plist:52-53` = false |
| ATS | **PASS** | No exception keys; all calls HTTPS |
| IAP compliance (3.1.x) | **PASS (N/A)** | No purchases, no external purchase links |
| 4.3(b) differentiation / 4.2 minimum functionality | **PASS** | Native share extension, haptics, push, offline-tolerant capture — not a wrapped website |
| Sign in with Apple (4.8) | **PASS** | `App.entitlements:11-14`; both providers in `capacitor.config.ts:16`; CI only *warns* if missing — tighten to hard-fail (I-1) |
| Account deletion (5.1.1(v)) | **PASS** | `delete_account`/`delete_account_http` (main.py:1358/:1381) + Settings flow; syntheses/task_logs cleanup shipped (prior audit #4) |
| **`aps-environment` production** | **FAIL → CI assert** | `App.entitlements:5-6` = `development`; tripwire checks presence only (`ios-testflight.yml:295-298`). Task I-1: assert `production` in the exported IPA; if export doesn't rewrite it, the failing run is the signal and the entitlement gets flipped |
| Build-number lockstep App vs ShareExt | **FAIL (local) / PASS (CI)** | pbxproj: App=21 (:418/:442) vs ShareExt=19 (:464/:490) — Apple rejects mismatched appex `CFBundleVersion`. CI masks it via the global `CURRENT_PROJECT_VERSION` override (`ios-testflight.yml:241`); a local Xcode archive ships 21/19. Task I-2 |
| `TARGETED_DEVICE_FAMILY` iPhone-only | **PASS (docs stale)** | Already `1` in all 4 configs (pbxproj:432/:455/:481/:505); `SOURCE_OF_TRUTH.md:470` + `docs/APP_STORE.md:177/:186` still claim it's open — fix docs (W-4/D-17). `~ipad` orientation keys in Info.plist:39-45 are harmless leftovers |
| TestFlight-vs-prod config gaps | **PASS** | No dev-server URL in `capacitor.config.ts`; `debug.xcconfig` bound to Debug configs only |
| Age rating 4+ | **PASS** | No mature content; questionnaire answers drafted (`docs/APP_STORE.md:108-111`) |
| Metadata/screenshots | **📝 MANUAL** | Drafted in `docs/APP_STORE.md` §2-§4 (W-4 updates the WhatsApp bullets); Connect entry + screenshots are owner actions (M3) |
| Demo account + review notes | **📝 MANUAL** | Template ready (`docs/APP_STORE.md` §3); needs the post-cutover demo account (M4) |
| Current-SDK floor (Apr 2026) | **PASS** | CI on `macos-26`/Xcode 26 (`ios-testflight.yml:67`); beta-glob risk → I-1 |
| Auth live + locked rules in the store build | **📝 MANUAL** | The hard gate — cutover checklist `NATIVE_AUTH_SETUP.md` §6 (M1) |

---

## 6. Security

### Protecting the app (service integrity)

| # | Finding | Location | Fix | Status |
|---|---------|----------|-----|--------|
| S-1 | SSRF platform-fetcher bypass (risk #3): substring dispatch + bare `requests.get` with redirects in all platform branches | `scraper.py:93-110` dispatch; fetchers :261/:304/:329/:369/:578/:619/:760/:891 | Route every fetch through `safe_get`; hostname-anchored dispatch | ⬜ |
| S-2 | Rate limits are per-IP only on paid Gemini endpoints (rotate IPs to bypass; NAT users collide) | `main.py:224-232` buckets; call sites :551/:726/:873/:913 | Composite per-uid+IP keys on analyze/image/chat | ⬜ |
| S-3 | `ask_brain` history items have no per-item length cap (6 huge turns → unbounded prompt cost + injection surface); `existingTags` from the client reach the Gemini prompt unvalidated | `main.py:744`, `ai_service.py:341/:432`; `main.py:564/:927` → `ai_service.py:230/:249/:269` | Cap history item length; validate tags (count/length/type) | ⬜ |
| S-4 | `get_article` is an anonymous server-side fetch proxy (App Check soft + 120/hr IP limit; SSRF-bounded via safe_get) | `main.py:860-902` | **Owner decision** — SOURCE_OF_TRUTH task 2 explicitly flags "keep anonymous or gate deliberately" (📝 M10) | 📝 |
| S-5 | protobufjs critical CVE chain (transitive); postcss moderate | `web/package-lock.json` | `npm audit fix` (protobufjs); Next upgrade later for postcss | ⬜ |
| S-6 | Rate limiter + MessageSid dedup both fail open on Firestore outage | `rate_limit.py:62-64`, `main.py:2066-2068` | Accepted availability trade-off; MessageSid half vanishes with W-1. Document only | noted |

### Protecting users (data & privacy)

- **World-writable live rules** — risk #1, cutover-gated (📝 M1). Locked ruleset verified correct,
  including the share-takeover fix and `shared_owners` PII split (prior audit #1/#2).
- **Phone numbers logged in the clear** — `link_service.py:50` (normalized) and `:65` (raw);
  `whatsapp_handler.py:64` (number + message preview). **Evaporates with W-1** (both functions
  deleted); verify no other raw-PII logs remain (W-1 acceptance).
- **Owner PII in tracked files** — `functions/models.py:195` (`+1646…` as a Field example),
  `AUTH_SPEC.md:15`, and **NEW:** `SOURCE_OF_TRUTH.md:1375-1376` leaks a real Firebase Auth uid
  **and** the owner phone doc-id. Replace with `+15551234567`-style placeholders (D-17/D-18).
- **PII leakage to crash reporters** — N/A: no crash/analytics SDK exists (matches the privacy label).
- **Data at rest** — Firestore/Cloud Storage server-side encryption; `storage.rules` deny-by-default
  with owner-only screenshot reads (`storage.rules:6-14`). Ingest token in App Group UserDefaults
  (not Keychain) remains a tracked hardening item (SOURCE_OF_TRUTH task 12) — Keychain migration
  touches signed native code paths; deferred to owner-verified device work (📝 M11).
- **ToS/Privacy wiring** — live, public, linked in-app (`web/lib/publicRoutes.tsx`); W-3 updates
  content post-WhatsApp; governing-law jurisdiction in `/terms` §10 still needs a real value (📝 M5).

### Protecting the developer (cost & abuse)

- Paid endpoints: App Check soft + per-IP limits today; S-2/S-3 tighten. `APPCHECK_ENFORCE`,
  `ADMIN_TOKEN`, `OWNER_EMAIL` unset in prod env (📝 M2, with key rotation — the Gemini key and ASC
  `.p8` were both pasted in plaintext historically, SOURCE_OF_TRUTH task 5).
- GCP budget alerts not configured (📝 M12).
- Twilio spend surface removed entirely by W-1.

---

## 7. Key Feature Improvements (weakest existing features, concrete fixes)

| # | Feature | Weakness (evidence) | Concrete fix | Effort |
|---|---------|--------------------|--------------|:--:|
| P-1 | **Feed during capture** | 5 Hz full-tree re-render storm: `useProcessingBanner.ts:45-49` 200ms setInterval re-renders Feed; `filteredLinks` 6-stage filter+sort recomputed every render (`Feed.tsx:429-519`, not memoized); facet counts inline (:426-663); no `React.memo` on Card/ListCard and handler/array props re-created per render (`Feed.tsx:2166-2168` builds a new array **per card per render**); per-card 60s `setInterval` (`Card.tsx:101-108`); twin 200ms tick in `useSharedCaptureBanner.ts:91` | Memoize `filteredLinks` + facet chain; `React.memo` + `useCallback` + precomputed collection map; one shared clock; CSS-transition banner progress instead of React ticks | M |
| P-2 | **Semantic search** | Out-of-order responses clobber newer results — no stale guard/AbortController (`Feed.tsx:182-228`; contrast AskBrain.tsx:388-479 which does it right). Plus C-2 backend bug can blank it entirely | Generation counter + abort on cleanup; fix `has_any_embeddings` | S |
| P-3 | **Ask Machina citations** | Streaming path cites ALL retrieved cards when the `[[CITED:]]` marker is missing (`ai_service.py:528-530`) — up to 13 wrongly-attributed sources; non-streaming path filters correctly (:366-368) | Mirror the non-streaming filter; never expand | S |
| P-4 | **Reader/legal pages theme** | Solid `text-white`/`bg-white` break light theme: `ConfirmDialog.tsx:88/:115`, `AddLinkForm.tsx:441`, `InstallPWA.tsx:50/53/55` | Tokenize (`text-text`, `bg-card`, accent buttons); delete InstallPWA | S |
| P-5 | **Modal accessibility** | No Escape on LinkDetailModal/ReminderModal/SettingsModal; AddLinkForm sheet has no `role="dialog"`; FAB has no `aria-label` (`AddLinkForm.tsx:463-472`); desktop search input unlabeled (`Feed.tsx:1103-1118`); no modal moves initial focus | Escape handlers + roles + labels + initial-focus; full focus-trap deferred | S |
| P-6 | **Chat reliability on Vercel** | `/api/chat` route has no `maxDuration` → default timeout kills long streams (`web/app/api/chat/route.ts`) | `export const maxDuration = 60` + `dynamic = 'force-dynamic'` | S |
| P-7 | **Share Extension after dismissal** | Background upload on a random-UUID session; `AppDelegate` implements no `handleEventsForBackgroundURLSession` → post-dismissal failure reaches nobody while the app's banner optimistically says "Analyzing…" (`ShareViewController.swift:876-880`, `ShareConfigPlugin.swift:49-68`) | Pending-record reconciliation subsystem — real design work + device testing (📝 M11); interim: temp-file cleanup + honest banner timeout shipped separately (I-2) | L |
| P-8 | **Browser extension identity** | Entire extension + Safari wrapper still branded "MyLinks"/"Second Brain"/`com.mylinks.capture` (`extension/manifest.json:3-35`, `background.js` ×10, `popup.*`, `safari/build-safari.sh:36`); token setup instructions point at a Settings surface that doesn't exist | Rebrand to Machina AI; add ingest-token copy UI in Settings (F-1) | S/M |

## 8. New Feature Candidates (evidence-based only)

| # | Candidate | Evidence in code | Approach | Effort |
|---|-----------|------------------|----------|:--:|
| N-1 | **Settings ingest-token surface** | Extension README/popup instruct users to fetch a token no UI exposes (`extension/README.md:22`, `popup.html:37`); backlog 19a "extension token-copy UI" | Read-only token row + copy button in Settings (data already on the user doc via `get_share_config`, main.py:1151) | S |
| N-2 | **Backend test harness + CI** | Only dead `test_yt_scrape.py` exists; SOURCE_OF_TRUTH task 18; `firestore-rules-test/` exists but never runs in CI | Offline pytest suite (models schema, digest formatting/packing, rate-limit window math, `embedding_needs_repair`, prompt-builder) + a GitHub Actions job; rules-test job on the emulator (GH runners have network) | M |
| N-3 | **M18 proactive observations / M19 shareable cited answers / M20 auto-collections / T10 export** | Explicit stubs & backlog entries (SOURCE_OF_TRUTH §4 P3; `share_page` backend already renders public pages) | Post-launch roadmap — out of scope for this remediation (📝 M14) | L |
| N-4 | **Offline read-cache** | No service worker exists; README falsely claims offline (task 16) | Decision: cheap path = drop the claim (D-17 does this); real offline is a P3 feature | 📝 |

---

## 9. Manual Action Required (Master List — owner only)

| # | Action | Detail |
|---|--------|--------|
| M1 | **Auth cutover** (the launch gate) | `NATIVE_AUTH_SETUP.md` §6, in order: Apple Services ID + `.p8` in Firebase console → set `OWNER_EMAIL` → flip `REQUIRE_AUTH` + `NEXT_PUBLIC_REQUIRE_AUTH`, redeploy functions + web → run `firestore-rules-test` on owner machine → `cp firestore.rules.locked firestore.rules && firebase deploy --only firestore:rules` → device-verify brand-new-user claim path |
| M2 | **Env + key hygiene** | Set `ADMIN_TOKEN`, `APPCHECK_ENFORCE=true`, `OWNER_EMAIL`; **rotate the Gemini key** (pasted in chat 2026-06-23) and the **ASC API `.p8`** (pasted during CI setup); remove `TWILIO_*` from the deployed env after W-1 deploys |
| M3 | **App Store Connect data entry** | Privacy nutrition label, metadata, keywords, description (per updated `docs/APP_STORE.md`), age rating 4+, screenshots (6-shot list in §4 of that doc) |
| M4 | **Demo account** | Create + seed post-cutover; fill credentials into the review notes |
| M5 | **Terms §10 jurisdiction** | Name a concrete governing-law jurisdiction before public launch |
| M6 | **Twilio decommission** | Release the WhatsApp number/webhook in the Twilio console; optionally delete the `processed_messages` collection; cancel the Twilio account if unused |
| M7 | **APNs console steps** | Complete the pending push setup (SOURCE_OF_TRUTH §9 2026-07-06 entry) so reminder/digest push actually delivers; then confirm a TestFlight build passes the new CI `aps-environment=production` assertion (I-1) |
| M8 | **Email digest provider decision** | Configure `SENDGRID_API_KEY` (or SMTP) — post-WhatsApp, email is the only non-push digest channel and currently no-ops — or deliberately ship push-only |
| M9 | **Pin functions deps** | `pip freeze` from a known-good deploy → exact `==` pins in requirements.txt (agents must not guess versions) |
| M10 | **`get_article` gating decision** | Keep anonymous (App Check + rate limit) or require auth — flagged decision from SOURCE_OF_TRUTH task 2 |
| M11 | **Device-required work** | On-device verification sweep (SOURCE_OF_TRUTH task 11); ingest-token Keychain migration verify; ShareExt background-upload reconciliation design (P-7); AI-consent flow verify on TestFlight |
| M12 | **GCP budget alerts + quotas** | Billing alerts on `secondbrain-app-94da2`; per-user monthly quotas per §7 of SOURCE_OF_TRUTH |
| M13 | **Markdown consolidation visual QA** | If/when A-7 is attempted, it needs visual pass on device — not safe headlessly |
| M14 | **Product roadmap items** | P3 backlog (voice capture, proactive brain, auto-collections, export) — deliberate product decisions, not audit remediation |
| M15 | **One CI run to validate pipeline changes** | After I-1 lands (aps assertion, beta-glob filter, upload mechanism), trigger "iOS → TestFlight" once and confirm green + build delivered |

---

## 10. Agent Task Backlog

> Atomic tasks; deps = must land first (same-file conflicts). AC = acceptance criteria.
> Global AC for every task: `cd web && npx tsc --noEmit` clean, `cd functions && python -m py_compile *.py` clean,
> no unrelated files touched, no signing/secrets touched.

| ID | Task | Files | Deps | AC | Status |
|----|------|-------|------|----|--------|
| W-1 | Backend WhatsApp removal + channel migration (chapter 4 spec) | functions/whatsapp_handler.py(del), main.py, digest_service.py, reminder_service.py, link_service.py, models.py, requirements.txt, .env.example, firestore.rules(comment), test_locally.sh(del) | — | grep -ri whatsapp/twilio in functions/ → 0 executable hits; channels normalize whatsapp→push; shared paths intact | ⬜ |
| W-2 | Frontend WhatsApp removal | web/lib/types.ts, components/SettingsModal.tsx, Onboarding.tsx, PushNudge.tsx (+ comment sweep) | — | no 'whatsapp' in web/ source; legacy fallbacks → ['push']; tsc clean | ⬜ |
| W-3 | Legal pages update | web/app/privacy/page.tsx, terms/page.tsx | — | no WhatsApp/Twilio/phone-collection claims; also fix the 4 `<a>`→`<Link>` eslint errors here | ⬜ |
| S-1 | SSRF: platform fetchers through safe_get + hostname dispatch; reword caption label | functions/scraper.py | — | every outbound fetch goes through safe_get; redirects re-validated; scrapers still return same shapes | ⬜ |
| S-2 | Per-uid+IP rate limits on paid endpoints | functions/main.py | W-1 | analyze/image/chat keyed on uid+ip composite; anonymous callers still limited by IP | ⬜ |
| S-3 | ask_brain history caps + existingTags validation | functions/main.py | W-1, S-2 | per-item history length cap; tags validated (list of short strings, capped count) | ⬜ |
| S-5 | npm audit fix (protobufjs critical) | web/package-lock.json | — | npm audit: 0 critical; build green | ⬜ |
| C-1 | [[CITED:]] fallback fix + RAG prompt dedup | functions/ai_service.py | — | missing marker → filter (mirror :366-368), never cite-all; one shared prompt builder | ⬜ |
| C-2 | has_any_embeddings: query for an embedded doc instead of sampling one | functions/search.py | — | a leading non-embedded doc no longer blanks search | ⬜ |
| F-1 | AddLinkForm bundle: drop embedding_vector write (:255), tokenize Save button (:441), FAB aria-label, dialog role+Escape; /api/chat maxDuration; ConfirmDialog theme (:88/:115); delete InstallPWA + page.tsx refs; delete 5 template SVGs; delete getCategoryColor | web/components/AddLinkForm.tsx, ConfirmDialog.tsx, InstallPWA.tsx(del), app/page.tsx, app/api/chat/route.ts, public/*.svg(del), lib/colors.ts | — | light theme legible; aria-label present; maxDuration exported; tsc clean | ⬜ |
| P-1 | Feed perf umbrella: memoize filteredLinks+facets, remove vestigial platform state (D-9), useCallback handlers, per-card collection map, React.memo Card/ListCard, shared clock (kill per-card intervals), throttle both banner hooks (CSS-driven progress), stale-search generation guard, normalize searchResults via toLink, drop unused imports | web/components/Feed.tsx, Card.tsx, ListCard.tsx, lib/useProcessingBanner.ts, lib/useSharedCaptureBanner.ts (+ new lib/useNow.ts) | — | capture-time re-renders limited to banner; no behavior change; tsc + next build clean | ⬜ |
| I-1 | CI hardening: assert aps-environment=production in exported IPA (both targets' check where applicable); filter Xcode beta from glob; altool → xcodebuild -exportArchive destination=upload; SIWA entitlement hard-fail | .github/workflows/ios-testflight.yml | — | yaml valid; assertions target the IPA; needs one CI run to confirm (M15) | ⬜ |
| I-2 | iOS cleanup: ShareExt unused imports (Social/MobileCoreServices/UserNotifications), temp-file cleanup on upload completion + stale-file sweep, ShareExt CURRENT_PROJECT_VERSION 19→21 (both configs), stale comments (Info.plist:54-57, ShareConfigPlugin.swift:44-47) | web/ios/App/ShareExt/ShareViewController.swift, App/Info.plist, App/ShareConfigPlugin.swift, App.xcodeproj/project.pbxproj | — | Swift compiles by inspection (no CI here); pbxproj numbers match; machina:// scheme KEPT (Shortcut/deep-link uses) | ⬜ |
| I-3 | Extension rebrand MyLinks→Machina AI (manifest, background, popup, READMEs, safari build script) | extension/*, safari/* | — | no "MyLinks"/"Second Brain"/com.mylinks.* left; manifest valid JSON | ⬜ |
| D-16 | eslint zero-errors sweep (remaining errors: no-explicit-any ×7, set-state-in-effect ×3, purity ×1) + unused-import warnings | storage.ts, ThemeProvider.tsx, CollectionFormModal.tsx, ManageCollectionCardsSheet.tsx, + misc | W-2, W-3, F-1, P-1 | `npx eslint .` → 0 errors; warnings ≤ 5 | ⬜ |
| D-17 | README full rewrite (real product: recall engine/capture/synthesis; drop WhatsApp, PWA badge, Graph Viz/Insights/Offline/Table-view claims, Shadcn claim, stale structure) | README.md | W-1 | no false feature claims; matches actual architecture | ⬜ |
| D-18 | Docs sweep: SOURCE_OF_TRUTH (WhatsApp refs, stale TARGETED_DEVICE_FAMILY claim :470, PII scrub :1375-1376, §9 session-log entry for this remediation, §4 checkbox updates), docs/APP_STORE.md (WhatsApp bullets/notes, stale device-family :177/:186), AUTH_SPEC.md (:15 PII, :23/:57/:151), NATIVE_AUTH_SETUP.md:144, ship SKILL.md:110, deploy-hosting.sh header, models.py:195 PII placeholder | SOURCE_OF_TRUTH.md, docs/APP_STORE.md, AUTH_SPEC.md, NATIVE_AUTH_SETUP.md, .claude/skills/ship/SKILL.md, deploy-hosting.sh, functions/models.py | W-1, D-2 done first for models.py | placeholders replace real PII; docs match code state | ⬜ |
| D-19 | Backend dead code: ClaudeService, models.py LinkDocument/RelatedLink + graph_service import, main.py:42 dead import + :44 stale comment, delete backfill_embeddings.py + test_yt_scrape.py, log-the-silent-excepts (scraper empty-dict returns get a logger.warning) | functions/ai_service.py, models.py, graph_service.py, main.py, backfill_embeddings.py(del), test_yt_scrape.py(del), scraper.py | W-1, C-1, S-1, S-3 | py_compile clean; grep confirms no references to deleted symbols | ⬜ |
| A-11 | a11y: Escape handlers (LinkDetailModal, ReminderModal, SettingsModal), initial focus into dialogs, desktop search aria-label, icon-button aria-labels (ConfirmDialog close etc.) | web/components/LinkDetailModal.tsx, ReminderModal.tsx, SettingsModal.tsx, Feed.tsx | W-2, P-1 | Escape closes each; focus moves in; labels present | ⬜ |
| F-2 | Settings ingest-token copy UI (N-1) | web/components/SettingsModal.tsx (+ lib/shareConfig.ts) | W-2, A-11 | token visible + copy button under a Capture/Extensions row | ⬜ |
| R-1 | Extract share_service.py (main.py:1529-1997) + dedup link_data builders | functions/main.py, functions/share_service.py(new) | W-1, S-2, S-3, D-19 | endpoints unchanged (names/decorators stay in main.py or re-exported); py_compile clean; behavior-identical | ⬜ |
| N-2a | Offline pytest suite + GH Actions python-tests job; rules-test CI job | functions/tests/(new), .github/workflows/python-tests.yml(new), .github/workflows/rules-tests.yml(new) | W-1, R-1 | tests pass locally offline; workflows lint-valid; needs CI run (M15) | ⬜ |
| R-3 | Feed.tsx decomposition (hooks + render extractions per §8 seams) | web/components/Feed.tsx + new files | P-1, A-11, D-16 | pure mechanical extraction; tsc + next build clean; **highest-risk refactor — only if all prior batches verified green** | ⬜ |
| R-4 | SettingsModal decomposition (useUserSettings, DigestSettings, AccountSection) | web/components/SettingsModal.tsx + new files | W-2, A-11, F-2 | same bar as R-3 | ⬜ |

**Explicitly NOT tasked (needs human judgment):** markdown-stack consolidation (A-7, visual QA),
requirements pinning (A-8/M9, needs deploy truth), get_article gating (S-4/M10), ShareExt
background reconciliation (P-7, device work), light-theme *design* investment beyond token fixes
(SOURCE_OF_TRUTH task 17), offline feature (N-4), Firestore vector/pagination cost work
(prior audit #11 remainder — needs product decision on feed pagination UX).

---

## Progress log

- **2026-07-09** — Audit produced. Remediation batches dispatching (batch plan: B1 = W-1, W-2, W-3+F-1 adjacents, S-1, C-1+C-2, P-1, I-1, I-2, I-3, S-5 → B2 = S-2, S-3, D-17, D-18, D-19, A-11 → B3 = R-1, F-2, D-16, N-2a → B4 = R-3, R-4).
