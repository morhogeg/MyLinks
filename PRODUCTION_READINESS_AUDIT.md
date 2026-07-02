# Machina (Second Brain) — iOS Production Readiness Audit

**Date:** 2026-07-01
**App:** Machina / Second Brain (`com.morhogeg.machina`), currently in TestFlight
**Target:** App Store submission
**Auditor:** Automated production-readiness pass (security, Apple compliance, code quality, performance)

---

## 0. How to read this document

This is the **Phase 1 audit**. No application code has been changed. Section 2 lists
every finding grouped by severity with `file:line` and a recommended fix. Section 3
records open questions that change *which* fixes are in scope. Section 5 (Fixed vs.
Deferred) is a placeholder to be filled in during Phase 2.

**Severity key**
- **Blocker** — causes automatic rejection at upload, guaranteed manual rejection, a live security breach, or a crash. Must fix before submitting.
- **High** — serious security, stability, or review risk; fix before submitting.
- **Medium** — real bug or compliance gap; fix soon, not necessarily ship-blocking.
- **Low / Backlog** — polish, hygiene, or defense-in-depth.

---

## 1. Architecture & the core framing issue

Machina is a **Capacitor app**: a Next.js 16 / React 19 web app (`web/`) statically
exported and bundled into a WKWebView iOS shell, plus a **native Share Extension**
(`web/ios/App/ShareExt/`) and a **Python Firebase Cloud Functions** backend
(`functions/`). The client SDK (Firebase JS) talks to Firestore/Storage/Functions
directly; the iOS app points at the live Firebase Hosting origin for `/api/*`.

### ⚠️ The single most important finding: the app is a single-user prototype wearing a multi-user costume

The codebase is mid-migration. A real Google Sign-In + per-user data model exists on
**web** (`AuthProvider.tsx`, `AUTH_SPEC.md`), but:

- The **iOS (Capacitor) build ships with authentication entirely bypassed.** On native,
  the web sign-in effect is skipped (`AuthProvider.tsx:125`) and the app loads *the first
  user document in the database* with no gate (`AuthProvider.tsx:100-121`,
  `limit(1)`). Every install sees the same one workspace.
- **Firestore security rules are `allow read, write: if true`** for all user data
  (`firestore.rules:34-55`). The client hits Firestore directly, so these rules are the
  *only* access control — and they enforce nothing.
- Several **backend endpoints trust a client-supplied `uid`** instead of a verified
  token, so even the server can't tell users apart.

The rules file and code comments openly call this **"accepted residual risk" pending a
Phase 3 lock**. That is a defensible stance for a **personal, single-user** app in
closed TestFlight. It is **not** shippable as a **public, multi-user** App Store app —
in that scenario any anonymous party can read or overwrite every user's private links,
notes, and chats.

**Because so many blockers below hinge on this, please answer the scoping question in
Section 3 before Phase 2.** The fix set is very different for "harden a single-user
personal app" vs. "finish real multi-user auth."

---

## 2. Findings

### 2.1 BLOCKERS

#### B-1 · [Security] Firestore rules are world-readable & world-writable for all user data
- **Location:** `firestore.rules:34-55` (`users/{uid}`, `.../links`, `.../chats`, `.../collections` all `allow read, write: if true`); `firestore.rules:61-68` (`shared_collections`, `shared_cards` world-writable).
- **Risk:** The web bundle ships a public Firebase config; anyone can use the client SDK to read or overwrite **every** user's links, chats, collections, settings, and the per-user `ingestToken` field. Shared docs can be defaced by anyone. This is a cross-tenant data breach.
- **Fix:** Apply the `owns(uid)` ownership rule already drafted in the file's comment (membership in `authUids`, `request.auth != null`). Make `shared_*` writes owner-only, reads public. Requires real per-user auth (see B-2) to be meaningful.
- **Scope note:** Only truly a *breach* once there is >1 user. For a locked single-user app, at minimum require `request.auth != null`.

#### B-2 · [Security / Compliance] iOS build bypasses authentication — loads an arbitrary user's private data
- **Location:** `web/components/AuthProvider.tsx:99-121` (native branch), `:125` (web auth skipped on native).
- **Risk:** The actual App Store target has **no login, no sign-out, no account UI** (the Account panel is gated on `authUid`, which is web-only — `SettingsModal.tsx:327`). Every install reads the same "first user" doc. An App Review reviewer would see someone else's real data; account deletion (B-5) is impossible without an account; and with B-1 this is a privacy breach.
- **Fix:** Ship native Google Sign-In (the code's "Phase 2", see `AUTH_SPEC.md`) **or** consciously scope the app as single-user personal (Section 3). Do not release the "first user doc" fallback to a public audience.

#### B-3 · [Security] Endpoints trust a client-supplied `uid` → cross-tenant IDOR (read & write)
- **Location:** `functions/main.py:440-451` (`analyze_link`), `:580,599-609` (`ask_brain`), `:766,814-817` (`analyze_image`); callables with `uid`/`test_uid` body fallback: `main.py:991-993` (`get_share_config`), `functions/search.py:164-166` (`search_links`), `main.py:1839-1841,1862-1863` (`send_digest_now`).
- **Risk:** `uid` is read straight from the request body with no ID-token verification. An anonymous caller can: pass any victim `uid` to `ask_brain` and receive **that user's entire saved brain**; call `get_share_config` to obtain **any user's ingest token** (which grants write access to their account, see H-1); call `send_digest_now` with an `email` override to **exfiltrate a user's curated digest to an attacker's inbox**. App Check is the only gate and it is soft/fail-open (H-4).
- **Fix:** Verify a Firebase ID token (`auth.verify_id_token`) on every data endpoint and derive `uid` from the token. Remove all `uid`/`test_uid` body fallbacks.

#### B-4 · [Compliance] Missing Privacy Manifest (`PrivacyInfo.xcprivacy`)
- **Location:** absent everywhere (both the App target and the ShareExt target).
- **Risk:** Since 2024-05-01 App Store Connect **auto-rejects uploads** that use required-reason APIs without a privacy manifest. Capacitor's native code and the App-Group `UserDefaults` bridge (`ShareConfigPlugin.swift`) use `UserDefaults` (reason `CA92.1`). This is a hard upload-time block.
- **Fix:** Add `PrivacyInfo.xcprivacy` to **both** targets. Declare `NSPrivacyAccessedAPICategoryUserDefaults` → `CA92.1`; add `NSPrivacyAccessedAPICategoryFileTimestamp` → `C617.1` if the ShareExt touches file metadata; `NSPrivacyTracking = false`; empty `NSPrivacyTrackingDomains`; and `NSPrivacyCollectedDataTypes` reflecting Google account (email/user ID) + user content stored in Firebase. Verify the exact reason codes against Apple's live "Describing use of required reason API" page before finalizing.

#### B-5 · [Compliance] No in-app account deletion (Guideline 5.1.1(v))
- **Location:** `web/components/SettingsModal.tsx:327-352` — Account section offers only "Sign out" (`:343-349`); no delete flow exists anywhere (repo-wide search for delete/erase/purge account = 0 hits). Absent entirely on native (B-2).
- **Risk:** Apps offering account creation **must** let users initiate full account+data deletion in-app. This is one of the most actively-tested rejection reasons.
- **Fix:** Add a "Delete account" action (with `ConfirmDialog`) that calls a Cloud Function deleting the Firebase Auth user + their Firestore data (`users/{uid}` and `links`/`chats`/`collections` subcollections + any storage), then signs out. Depends on B-2 (accounts must exist on the platform where deletion is offered).

#### B-6 · [Security] Unauthenticated debug / admin HTTP endpoints
- **Location:** `functions/main.py:346-389` (`debug_status` — returns recent `pending_processing` + `task_logs`, incl. uids & URLs), `:287-333` (`backfill_youtube_channels` — iterates all users), `:1795-1803` (`force_check_reminders`), `:1817-1826` (`force_send_digests` — triggers digest delivery to all due users), `:340-343` (`ping`).
- **Risk:** No auth, App Check, or rate limiting. Leaks internal user data and lets anyone trigger backend spend / mass sends.
- **Fix:** Remove from production, or convert to `on_call` gated behind an admin custom-claim / IAM. Never return internal task data unauthenticated.

#### B-7 · [Compliance] Sign in with Apple likely required (Guideline 4.8) — *confirm*
- **Location:** `web/lib/auth.ts` — Google is the only/primary login.
- **Risk:** When a third-party social login (Google) is the primary account mechanism, Apple generally requires an equivalent privacy-focused option (Sign in with Apple). Common rejection for Google-only apps.
- **Fix:** Add Sign in with Apple alongside Google. **Flagged for confirmation** — exemptions exist (e.g. exclusively your own account system); depends on the B-2/Section 3 auth direction.

> **Blocker summary:** B-1/B-2/B-3 are three independent facets of one root cause — auth was deferred. B-4/B-5/B-7 are Apple-compliance hard stops. B-6 is a standalone backend exposure.

---

### 2.2 HIGH

#### H-1 · [Security] Ingest token: stored in App Group `UserDefaults` (not Keychain), leaked by B-3, no rotation
- **Location:** generated `functions/link_service.py:75-92` (`secrets.token_urlsafe(24)`, strong); stored plaintext on the world-readable user doc field `ingestToken` (`link_service.py:90`, exposed via B-1/B-3); written to App Group defaults on device `web/ios/App/App/ShareConfigPlugin.swift:104-105`; read `ShareViewController.swift:855-857`.
- **Risk:** A long-lived bearer credential that grants write access to a user's account, kept in plaintext (device App Group defaults + world-readable Firestore field) with no expiry or revocation path.
- **Fix:** Store the token in the **iOS Keychain** (App-Group–shared) instead of `UserDefaults`; move the server copy to a Functions-only collection (`rules: if false`); add a rotate/revoke mechanism.

#### H-2 · [Security] App Check is soft-mode & fail-open by default; absent on ingest/webhook
- **Location:** `functions/main.py:171` (`APPCHECK_ENFORCE` defaults false), `:174-195` (`_require_app_check` returns `True` when unset / on exception). Not called by `share_ingest`, `whatsapp_webhook`, or debug endpoints.
- **Risk:** The "defense-in-depth" that B-3's design leans on does nothing in the default config — paid Gemini endpoints are callable by any script.
- **Fix:** Set `APPCHECK_ENFORCE=true` in production and treat App Check as a layer on top of real token auth (B-3), not a substitute.

#### H-3 · [Security] SSRF guard bypassable via HTTP redirects
- **Location:** `functions/scraper.py:22-47` validates only the initial URL; `:86,146` then `requests.get(...)` with default `allow_redirects=True`. Same gap in `analyze_image` (`main.py:788-794`).
- **Risk:** A public URL can 302 to `http://169.254.169.254/…` (cloud metadata) or an RFC1918 host; DNS-rebinding TOCTOU also possible.
- **Fix:** `allow_redirects=False` (or re-validate every hop with `validate_public_url`), and pin the connection to the validated IP.

#### H-4 · [Security / Privacy] PII (phone numbers + message bodies) written to logs
- **Location:** `functions/main.py:1418` (`logger.info(... json.dumps(data))` — full WhatsApp payload); phone numbers at `link_service.py:24,36,39`, `main.py:1437,1755`; `whatsapp_handler.py:58` (`body[:100]`).
- **Risk:** Inbound message contents and phone numbers logged in cleartext to Cloud Logging.
- **Fix:** Log only non-PII (message SID, hashed phone, counts). Never `json.dumps` the raw payload.

#### H-5 · [Security] Twilio webhook signature verification fails open when token unset
- **Location:** `functions/main.py:1371-1374` — `_verify_twilio_signature` returns `True` if `TWILIO_AUTH_TOKEN` is missing.
- **Risk:** A prod misconfiguration silently disables signature checks, allowing spoofed webhooks that impersonate any registered phone number.
- **Fix:** Fail closed in production (reject when the token is unset).

#### H-6 · [Stability] Article & chat fetches have no timeout — infinite spinner on flaky network
- **Location:** `web/components/ReadingView.tsx:53` (`/api/article`), `web/components/AskBrain.tsx:385` (`/api/chat`). (`AddLinkForm.tsx:44-59` correctly caps at 60s; these two don't.)
- **Risk:** On a hung socket (common on cellular), the promise never settles, `finally` never runs, and the reader/ask UI shows an infinite "Loading…/Thinking…" with no recovery.
- **Fix:** Reuse the `fetchWithTimeout` pattern from `AddLinkForm.tsx`; on timeout show the existing error UI.

#### H-7 · [Stability] Deep-linked card modal re-opens itself indefinitely
- **Location:** `web/components/Feed.tsx:217-228` — reads `?linkId=` into `activeLinkId`, effect keyed on `[searchParams, links]`; the param is never cleared and Firestore `onSnapshot` (`:175`) mutates `links` constantly.
- **Risk:** User closes the card, any background update re-opens it — feels broken/janky to a reviewer.
- **Fix:** `router.replace` to strip `linkId` after first open, or track a `consumedDeepLink` ref.

#### H-8 · [Honesty / Stability] "We'll keep analyzing in the background" copy is untrue for in-app capture
- **Location:** `ImageScanProgress.tsx:83`, `LinkScanProgress.tsx:118`, `VideoScanProgress.tsx:90` (copy) vs. the actual single client-side promise `AddLinkForm.tsx:164-252`.
- **Risk:** Backgrounding the app suspends the WKWebView and kills the in-flight fetch; nothing saves, despite the promise. (Note: the **Share Extension** genuinely does background upload — this only affects in-app capture.)
- **Fix:** Soften the copy for the in-app path, or move analysis to a server-side job.

---

### 2.3 MEDIUM

#### M-1 · [Security] `window.open` without `noopener` on a saved URL (reverse tabnabbing)
- **Location:** `web/components/LinkDetailModal.tsx:296` — `window.open(link.url, '_blank')`. (Anchor variants elsewhere correctly set `rel="noopener"`.)
- **Fix:** `window.open(link.url, '_blank', 'noopener,noreferrer')`.

#### M-2 · [Security] Unvalidated URL scheme on the Card source link
- **Location:** `web/components/Card.tsx:219-220` — `<a href={link.url}>` with no scheme check (`LinkDetailModal.tsx:261` does gate on `^https?://`).
- **Risk:** A stored `javascript:` URL would render as a clickable href. Low likelihood (ingest normalizes to `https://`) but not enforced at render.
- **Fix:** Guard with `^https?://` before rendering the anchor.

#### M-3 · [Security] Rate limiting fails open, is IP-keyed, and misses callables/debug endpoints
- **Location:** `functions/rate_limit.py:62-64` (returns `True` on error), `:67-72` (trusts spoofable `X-Forwarded-For`). Not applied to `get_share_config`, `search_links`, `send_digest_now`, `debug_*`, `backfill_*`, `force_*`.
- **Fix:** Add per-uid limits post-auth; consider fail-closed for the paid buckets.

#### M-4 · [Security] Internal error detail leaked to clients
- **Location:** `functions/main.py:853` (`analyze_image` returns `str(e)`), `:389` (`debug_status` returns `f"Debug failed: {str(e)}"`) — bypass the sanitized `_server_error` used elsewhere.
- **Fix:** Route through `_server_error`.

#### M-5 · [Cost / DoS] Unbounded chat history & retrieval scope
- **Location:** `functions/main.py:582` (`ask_brain` accepts `history` with no length cap), `_keyword_fallback_cards` streams up to 300 docs/call.
- **Fix:** Cap history turns/length.

#### M-6 · [HIG / Bug] InstallPWA "Add to Home Screen" banner shows *inside* the native app
- **Location:** `web/components/InstallPWA.tsx:24` gates on `isIOS && isSafari && !isStandalone`; Capacitor's WKWebView matches Safari UA and isn't `standalone`.
- **Fix:** Add a `window.Capacitor?.isNativePlatform()` guard.

#### M-7 · [Stability] HEIC/large-image compression fallback ships raw bytes inline
- **Location:** `web/lib/image.ts:108-114` — falls back to un-resized original base64 → multi-MB JSON to `/api/analyze-image`, guaranteeing the timeout it's meant to prevent.
- **Fix:** Reject oversized fallback with a clear message.

#### M-8 · [HIG] Bottom sheets don't track the keyboard; autofocused inputs get covered
- **Location:** `AddToCollectionSheet.tsx:106`, partially `ManageCollectionCardsSheet` / `CollectionFormModal` — no `useVisualViewport` (which `CollectionFormModal` uses elsewhere).
- **Fix:** Apply the visual-viewport treatment consistently.

#### M-9 · [HIG] Mobile Filters / Categories sheets lack bottom safe-area padding
- **Location:** `web/components/Feed.tsx:1175,1310` use `pb-8` with no `env(safe-area-inset-bottom)`; the adjacent Tag Explorer does inset.
- **Fix:** Add `safe-pb` to both panels.

#### M-10 · [UX / Data-loss] SettingsModal silently discards unsaved edits on any close path
- **Location:** `web/components/SettingsModal.tsx` — edge-swipe `:86`, Cancel `:572`, backdrop `:248`, X. Only theme applies instantly.
- **Fix:** Confirm-on-dirty or auto-save.

#### M-11 · [Bug] ReminderModal allows past times & has a Date-rollover bug
- **Location:** `web/components/ReminderModal.tsx:88-97` (no `> Date.now()` check); `:329,343,357` mutate a shared `Date` via `setMonth`/`setDate`/`setFullYear` so day 31 → February rolls into March.
- **Fix:** Validate future time; clamp day to month length or use native `<input type="date">`.

#### M-12 · [Reliability] Optimistic collection writes give no offline signal
- **Location:** `web/components/AddToCollectionSheet.tsx:81`; writes `collections.ts:87-96`. Firestore offline queues silently; success toast fires before server ack.
- **Fix:** Reflect pending/failed state.

#### M-13 · [Bug] Nested overlays unlock body-scroll early (not ref-counted)
- **Location:** `CollectionFormModal`, `ManageCollectionCardsSheet`, `AddToCollectionSheet`, `ConfirmDialog:38-42` each independently toggle `document.body.style.overflow`.
- **Fix:** Centralize with a counter.

#### M-14 · [Markdown] In-app `SimpleMarkdown` renders unmatched `**` literally & mangles RTL/abbreviations
- **Location:** `web/components/SimpleMarkdown.tsx:41` (only paired `**`), `:102-110` (sentence splitter breaks "e.g.", URLs, Hebrew).
- **Fix:** Broaden the grammar / skip the splitter for RTL.

---

### 2.4 LOW / BACKLOG

- **L-1** `console.*` logging ships in the production JS bundle (`firebase.ts:77,97`, `AuthProvider.tsx:112/115/161`, `Feed.tsx`, `SettingsModal.tsx`, `shareConfig.ts:47`). **Verified: no tokens/PII/bodies are logged** — error objects & generic strings only; the localhost log is gated off in prod. Hygiene only — strip via build step. `[Code Quality]`
- **L-2** `functions/.gitignore` doesn't list `.env` (root `.gitignore` does; no real secret is tracked — only `.env.example` with empty values). Defense-in-depth. `[Security]`
- **L-3** Prompt-injection surface: scraped page/YouTube/image content is fed to Gemini; impact bounded to the user's own output. `[Security]`
- **L-4** Share Extension writes the JSON upload body to a temp file (`ShareViewController.swift:884-887`) and never deletes it. Minor disk residue. `[Code Quality]`
- **L-5** `deleteCollection` batch is unbounded (>500 ops throws) `collections.ts:74-79`; `ManageCollectionCardsSheet` renders the whole library unvirtualized; `ConfirmDialog` has no busy guard (double-tap fires twice). `[Stability]`
- **L-6** Tap targets < 44pt: `CollectionsGallery.tsx:100` (~28px "⋯"), Reader `Aa` buttons `ReadingView.tsx:182,186` (~32px), color swatches `CollectionFormModal.tsx:188`. `[HIG/Accessibility]`
- **L-7** Toast ignores left/right safe-area in landscape (`Toast.tsx:50`); reading-progress bar renders under the notch (`ReadingView.tsx:160`); toast z-index == modal z-index (`z-[100]`) so a toast can render behind a sheet. `[HIG]`
- **L-8** `// TODO: Replace with Firebase Auth user type` (`web/lib/types.ts:147`) — only TODO/FIXME in the codebase. A few `as any` casts in guarded Firestore/Capacitor-detection paths (`storage.ts:44-49`, `Feed.tsx:212`). `[Code Quality]`
- **L-9** Reader "Listen" (Web Speech) is unreliable in WKWebView with no fallback (`ReadingView.tsx:36,192`); SwipeDeck "Undo" doesn't cancel a set reminder (`SwipeDeck.tsx:113-114`); SwipeDeck snapshots `links` on mount and goes stale (`:32`). `[UX bugs — promote individually if user-facing]`
- **L-10** Dev-only scripts print PII (`functions/test_yt_scrape.py`, `backfill_embeddings.py`) — ensure excluded from the deployed bundle. `[Security]`

---

## 3. Open questions (please answer before Phase 2)

These change *which* findings are blockers and how much work Phase 2 is.

1. **Audience: single-user personal app, or public multi-user app?**
   - *Single-user / personal:* B-1/B-2/B-3 downgrade to "lock everything to one authenticated account." Much smaller scope. Still need B-4 (privacy manifest), B-5 (account deletion — or remove account creation), B-6.
   - *Public multi-user:* B-1/B-2/B-3 require finishing native sign-in + backend token verification + locked rules (the "Phase 2/3" work). Largest scope; B-7 (Sign in with Apple) applies.

2. **Sign in with Apple (B-7):** add it, or do you have an exemption in mind? (Directly tied to Q1.)

3. **Privacy policy:** is there a hosted privacy policy URL to link in-app and in App Store Connect? (Apple requires an accessible in-app link; I did not find one in the audited UI.)

4. **App Privacy "nutrition label"** in App Store Connect — do you want me to produce the exact data-collection declarations to match Firebase + Google Sign-In, or is that already filled in?

---

## 4. What's already solid (context)

- **No hardcoded secrets** in source or git history; all keys server-side via env; only `.env.example` (empty placeholders) is tracked.
- **ATS** uses secure defaults — no arbitrary-load exception; all network calls HTTPS.
- **Storage rules** are correctly locked (`storage.rules` — read own uid, writes admin-only).
- **`ITSAppUsesNonExemptEncryption = false`** already set in `Info.plist` (correct — HTTPS/standard crypto only).
- **App Check + reCAPTCHA v3** are wired on the client; the ingest token itself is cryptographically strong.
- **Release build config** strips the `DEBUG` flag, uses `-O` and `dwarf-with-dsym`.
- **App icon (1024²) + LaunchScreen** present; no missing-asset rejection.
- **XSS-safe** shared-page markdown (escape-then-grammar); the single `dangerouslySetInnerHTML` is a static, input-free theme bootstrap.
- **No paywall / IAP / subscription** anywhere — no Guideline 3.1 exposure.
- **No placeholder/lorem/"coming soon"** content; empty states are real.
- **No third-party tracking/ad SDK** → ATT prompt correctly not required (`NSPrivacyTracking=false`).
- **Good WKWebView hardening already done:** SSE streaming disabled in-app, Firestore forced to long-polling, no eager gapi resolver (prevents a startup crash), reduced-motion + RTL + safe-area handling.
- The Share Extension **false-success watchdog** flagged in `ios-qa-report.md` (F-4) appears **already fixed** in the working tree — `showResult` now has a `resultShown` idempotency guard and a neutral watchdog message (`ShareViewController.swift:627-628`).

---

## 5. Fixed vs. Deferred (Phase 2 — in progress)

### Batch 1 — audience-independent fixes (done)
These are correct regardless of the single-user vs. multi-user decision, so they
were implemented first. Frontend TS changes were not type-checked in this
environment (no `node_modules`); backend Python byte-compiles clean
(`py_compile main.py scraper.py`).

| Finding | Status | What changed |
|---|---|---|
| **H-3 SSRF redirect bypass** | ✅ Fixed | Added `safe_get()` in `functions/scraper.py` that re-runs `validate_public_url` on every redirect hop (`allow_redirects=False` + manual follow). Routed `scrape_url`, `extract_readable_article`, and `analyze_image`'s URL fetch through it. Residual DNS-rebinding TOCTOU noted in code. |
| **H-4 PII in logs** | ✅ Fixed | Removed the raw `json.dumps(data)` WhatsApp payload log (`main.py`); now logs only SID/media-count/field-count. Added `_mask_phone()` and applied it to the "Unauthorized number" log. *(Remaining phone logs in `link_service.py`/`whatsapp_handler.py` deferred — see below.)* |
| **H-5 Twilio verify fails open** | ✅ Fixed | `_verify_twilio_signature` now fails **closed** when `TWILIO_AUTH_TOKEN` is unset in production; the unverified path is allowed only under `FUNCTIONS_EMULATOR`. |
| **H-6 No fetch timeout (hang)** | ✅ Fixed | Added shared `fetchWithTimeout()` in `web/lib/api.ts`; applied to `/api/article` (ReadingView, 25s) and `/api/chat` (AskBrain, 30s connect bound — does not cut the SSE stream). |
| **B-6 Unauthenticated debug/admin endpoints** | ✅ Fixed | Added `_require_admin()` (shared `ADMIN_TOKEN` header, **fail-closed**, 404 on deny) and applied it to `debug_status`, `backfill_youtube_channels`, `force_check_reminders`, `force_send_digests`. `ping` left public (no data). |
| **M-1 `window.open` no `noopener`** | ✅ Fixed | `LinkDetailModal.tsx` image click now passes `noopener,noreferrer` and gates the scheme. |
| **M-2 Unvalidated URL scheme on Card** | ✅ Fixed | `Card.tsx` source anchor now renders only for `^https?://` URLs. |
| **M-4 Internal error leaked to client** | ✅ Fixed | `debug_status` and `analyze_image` now route errors through `_server_error` (generic message; full detail logged server-side). |
| **B-4 Privacy manifest** | ⚠️ Partial | Created `App/PrivacyInfo.xcprivacy` and `ShareExt/PrivacyInfo.xcprivacy` with correct content (UserDefaults `CA92.1`, `NSPrivacyTracking=false`, collected-data types). **Remaining manual step:** add each file to its target in Xcode (Target ▸ Build Phases ▸ Copy Bundle Resources) — not hand-wired into `project.pbxproj` because it can't be validated without Xcode on this platform. |

**New deploy-config requirements introduced by Batch 1:**
- Set **`ADMIN_TOKEN`** in the Functions environment (else the admin/debug endpoints return 404 — the safe default). Callers pass it as the `X-Admin-Token` header.
- Set **`APPCHECK_ENFORCE=true`** in production (this addresses **H-2** — App Check was left soft/fail-open in code intentionally for rollout; enforcement is an env flag, not a code change).

### Batch 2 — multi-user auth cutover (done in code; deploy-gated)
Decision: **public multi-user** with **Sign in with Apple**. All changes are on
the branch; they take effect on a coordinated deploy (see `NATIVE_AUTH_SETUP.md`,
"Cutover order"). Backend byte-compiles clean; native pieces need the manual
console/Xcode steps in `NATIVE_AUTH_SETUP.md`.

| Finding | Status | What changed |
|---|---|---|
| **B-2 Native auth bypass** | ✅ Fixed (code) | Removed the "first user doc" fallback; `AuthProvider` gates web **and** native behind real sign-in. Native uses `@capacitor-firebase/authentication` bridged into the Firebase JS SDK (`lib/auth.ts`). |
| **B-7 Sign in with Apple** | ✅ Fixed (code) | Google **and** Apple sign-in on web + native (`lib/auth.ts`, `LoginScreen.tsx`); `App.entitlements` gains the Sign in with Apple capability. Needs Firebase Apple provider + Apple Developer config (setup doc). |
| **B-3 Endpoints trust client `uid`** | ✅ Fixed (code) | `_verify_bearer` / `_authed_uid` verify the ID token and resolve the workspace uid via `authUids` server-side. Applied to `analyze_link`, `ask_brain`, `analyze_image`, `get_share_config`, `search_links`, `send_digest_now`. Client now sends `Authorization: Bearer`. Also removed the digest `email` override (exfiltration). |
| **B-1 Open Firestore rules** | ✅ Fixed (code, deploy last) | `firestore.rules` locked to `owns(uid)` (membership in `authUids`); shared docs owner-write/public-read. First-time claim moved server-side (`claim_workspace`) so it works under locked rules. **Deploy only after testing** (setup doc). |
| **B-5 In-app account deletion** | ✅ Fixed (code) | `delete_account` callable (deletes Firestore workspace + Storage + Auth user); "Delete account" flow in `SettingsModal` with a confirm dialog. |

**New deploy-config requirement:** `OWNER_EMAIL` (Functions env) to gate the
one-time workspace claim to your account during the single-owner migration.

### Already fixed in the working tree (before this audit — verified, no action needed)
| Finding | Note |
|---|---|
| H-7 Deep-link modal re-opens forever | `Feed.tsx` now uses a `consumedDeepLinkRef` + `history.replaceState` to strip `?linkId`. |
| H-8 "keep analyzing in the background" untrue copy | Copy corrected to "Keep Machina open — this only takes a few seconds." |
| Share Extension false-success watchdog (old QA F-4) | `resultShown` idempotency guard + neutral watchdog message present. |

### Audience decision: **resolved → public multi-user + Sign in with Apple**
B-1/B-2/B-3/B-5/B-7 are implemented in Batch 2 above (deploy-gated; see
`NATIVE_AUTH_SETUP.md`).

### Deferred — lower priority / larger UX work (backlog unless promoted)
- **H-1** Ingest token → Keychain + rotation (native change; requires a small Keychain wrapper in the ShareExt + main app).
- **M-3** Rate-limit hardening; **M-5** chat-history cap; **M-6–M-14** UX/HIG items from the audit + `ios-qa-report.md`.
- Remaining PII phone logs in `link_service.py` / `whatsapp_handler.py` (apply `_mask_phone` pattern).
- All **Low / Backlog** items in §2.4.

---

*Phase 1 audit complete. Phase 2 Batch 1 (audience-independent blockers/highs/mediums) implemented and committed. The remaining blockers (B-1/B-2/B-3/B-5/B-7) are deferred pending the Section 3 audience decision.*
</content>
</invoke>
