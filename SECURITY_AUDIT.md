# Machina AI — Security Audit (OWASP)

> **Date:** 2026-07-06 · **Scope:** desktop web (Vercel), native iOS app
> (Capacitor), Python Firebase Cloud Functions, Firestore/Storage rules, browser
> + Safari extensions, CI/CD. · **Method:** OWASP Top 10 (2021) sweep + code
> review of every request-handling surface. · **Data at risk:** saved links,
> chat history, images, and a **phone number used as the primary account key** —
> i.e. real personal data. This audit is written for a production launch bar.
>
> This file is the tracked source of truth for security findings. It is
> cross-linked from `SOURCE_OF_TRUTH.md` §4. Some findings were fixed in this
> pass (branch `claude/security-owasp-audit-r1vo9h`); the rest are the launch
> gate and are called out explicitly.

---

## 1. Executive summary

**Overall posture: NOT yet production-ready for a public multi-user launch — but
the gap is well understood and mostly a single deliberate deferral.**

The engineering is, in most respects, security-conscious: there is a real SSRF
guard, an escape-first HTML renderer for public pages, fail-closed Twilio
signature verification, strong HTTP security headers/CSP, secrets kept in env
(none hardcoded, none committed), and auth tokens stored in IndexedDB rather than
`localStorage`. A full multi-user auth system (ID-token verification, ownership
rules) is **already written** but **flag-gated OFF** pending an owner-run cutover.

The dominant risk is therefore **authorization, not code**:

1. **The live Firestore ruleset is `allow read, write: if true`** on all user
   data. Anyone with the (public) Firebase web config can read or overwrite
   **every** user's links, chats, collections, and syntheses directly — bypassing
   all the Cloud Functions hardening. Account keys are phone numbers, which are
   enumerable.
2. **The backend trusts a client-supplied `uid`** while `REQUIRE_AUTH` is off (the
   default), so the API endpoints have the same cross-tenant IDOR.

Both are documented in-code as "accepted residual risk" for the single-user
prototype. **That acceptance does not hold the moment a second user's data is on
the platform.** Closing them is the launch gate (§4.1) and requires owner-only
steps (Firebase console, Apple config) that cannot be done from this environment.

Beyond those, this pass **fixed** an SSRF redirect bypass, a rate-limit spoofing
vector, an extension token-storage weakness, admin error leaks, and repo/CI
hygiene (§4.2). Remaining medium/low items are hardening, not blockers.

### Severity tally

| Severity | Count | Of which fixed this pass |
|---|---|---|
| 🔴 Critical | 3 | 0 (gated on owner-run auth cutover) |
| 🟠 High | 4 | 2 |
| 🟡 Medium | 8 | 4 |
| 🟢 Low | 7 | 3 |

---

## 2. Findings at a glance

Status legend: **FIXED** (in this branch) · **CUTOVER** (closes when the staged
auth cutover ships — code ready, owner action needed) · **OWNER** (owner
configuration/ops action) · **BACKLOG** (documented hardening, no code yet).

| ID | Sev | OWASP | Surface | Finding | Status |
|----|-----|-------|---------|---------|--------|
| C1 | 🔴 | A01 | Firestore | Rules world read/write on all user data | CUTOVER |
| C2 | 🔴 | A01/A08 | Firestore | `shared_*` snapshots world-writable → poisoning / defacement | CUTOVER |
| C3 | 🔴 | A01 | Backend | Client-supplied `uid` trusted (`REQUIRE_AUTH` off) → IDOR | CUTOVER |
| H1 | 🟠 | A10 | Backend | SSRF via redirect on platform scrapers | **FIXED** |
| H2 | 🟠 | A04 | Backend | Rate-limit bypass via spoofed `X-Forwarded-For` + soft App Check | **FIXED** (App Check = OWNER) |
| H3 | 🟠 | A04/A02 | iOS | Ingest token in App Group UserDefaults, long-lived, no rotation | BACKLOG |
| H4 | 🟠 | A05 | Backend | WhatsApp impersonation if `TWILIO_AUTH_TOKEN` unset (uid = phone) | OWNER |
| M1 | 🟡 | A05 | Web | CSP allows `unsafe-inline` + `unsafe-eval` | BACKLOG |
| M2 | 🟡 | A05 | CI | Workflow had no `permissions:` block | **FIXED** |
| M3 | 🟡 | A05 | Repo | `.gitignore` missed signing/service-account secrets | **FIXED** |
| M4 | 🟡 | A02/A05 | Extension | Bearer token in `chrome.storage.sync`; unpinned `baseUrl` | **FIXED** |
| M5 | 🟡 | A01 | Web | `/api/chat` open proxy; enforcement delegated to backend | CUTOVER |
| M6 | 🟡 | A09 | Backend | Admin endpoints returned raw `str(e)` | **FIXED** |
| M7 | 🟡 | A04 | Backend | Rate limiter fails open on Firestore error | BACKLOG |
| M8 | 🟡 | A06 | Backend | `>=`-only dependency pins (non-reproducible builds) | BACKLOG |
| L1 | 🟢 | A05 | Storage | `screenshots` read rule can never match; images token-URL public | BACKLOG |
| L2 | 🟢 | A05 | Tests | Rule tests validate the un-deployed `.locked` file | BACKLOG |
| L3 | 🟢 | A06 | CI | Actions pinned to tags, not SHAs | BACKLOG |
| L4 | 🟢 | A04 | iOS | `machina://` scheme invokable by any app (UI-spoof only) | BACKLOG |
| L5 | 🟢 | A03 | Web | `openExternal()` didn't scheme-guard before `window.open` | **FIXED** |
| L6 | 🟢 | A03 | Web | `img src` from scraped data unsanitized (non-executing) | BACKLOG |
| L7 | 🟢 | A05 | Repo | `functions/.gitignore` didn't list `.env` | **FIXED** |

---

## 3. Detailed findings

### 🔴 C1 — Firestore rules are world-readable and world-writable
**OWASP A01 (Broken Access Control).** `firestore.rules:28-64` deploys
`allow read, write: if true` for `users/{uid}` and every subcollection (`links`,
`chats`, `collections`, `syntheses`) plus `shared_cards`/`shared_collections`.
`firebase.json` deploys `firestore.rules` (not the hardened `firestore.rules.locked`).

**Exploit.** The Firebase web config ships in the client bundle (`web/lib/firebase.ts:17-24`)
and is public by design. Anyone can instantiate the same SDK or hit the Firestore
REST API and read/modify/delete **any** user's data by iterating document IDs.
Document IDs are **phone numbers** (`AuthProvider.tsx:33`) — low-entropy and
enumerable. The Cloud Functions hardening (App Check, CORS, rate limits) does
**not** apply here because direct DB access bypasses Functions entirely.

**Fix.** Deploy `firestore.rules.locked`, which gates every path on `owns(uid)`
(membership in the doc's `authUids`). This is code-ready. It is the point of no
return in the cutover: **only ship it once all write paths (web, native, share
ingest via Admin SDK, WhatsApp via Admin SDK) are confirmed working under auth**,
or live reads/writes brick. Sequence is in §4.1 and `NATIVE_AUTH_SETUP.md` §6.

### 🔴 C2 — Public share snapshots are world-writable
**OWASP A01 / A08.** `firestore.rules:57-64` — `shared_collections/{id}` and
`shared_cards/{id}` are `allow read, write: if true`. Reads are intentionally
public (share links). **Writes being open** means anyone can create or overwrite
any share snapshot by ID, and the stored `ownerUid` (a phone number) is
world-readable. This is a content-poisoning / defacement / takedown vector and a
potential stored-content channel into the server-rendered `/s`,`/c` pages
(`share_page`, `functions/main.py:1691`). The share IDs themselves are
unguessable (128-bit `crypto.randomUUID()`, `web/lib/collections.ts:116`), so the
issue is purely the open write rule, not ID prediction.

**Fix.** The locked ruleset (`firestore.rules.locked:96-105`) already gates
`shared_*` writes on `owns(request.resource.data.ownerUid)` and rejects a forged
`ownerUid`. Ships with C1.

### 🔴 C3 — Backend trusts client-supplied `uid` (IDOR)
**OWASP A01.** `functions/main.py:172-194` (`_authed_uid`): a verified ID token
wins, but when `REQUIRE_AUTH` is off (default — `main.py:252`) it **falls back to
the client-supplied body `uid`**. So `analyze_link`, `analyze_image`, `ask_brain`,
and the callables `get_share_config`/`rebuild_connections`/`send_digest_now`
accept `{"uid": "<victim phone>"}` and operate on another tenant's data —
`ask_brain` will return the victim's saved cards.

**Fix.** Flip `REQUIRE_AUTH=true` (functions) + `NEXT_PUBLIC_REQUIRE_AUTH=true`
(web). The verification path (`_verify_bearer` → `find_data_uid_by_auth_uid`) is
already implemented; the flag just stops the fallback. Owner action, §4.1.

### 🟠 H1 — SSRF via redirect on platform scrapers — **FIXED**
**OWASP A10 (SSRF).** The main scrape paths correctly used `safe_get()`
(`functions/scraper.py:50`), which disables auto-redirects and **re-validates the
SSRF guard on every hop**. But the platform-specific handlers
(`_scrape_linkedin_url`, `_scrape_twitter_url`, `_scrape_twitter_metadata`,
`_scrape_instagram_url`, `_scrape_facebook_url`, `_scrape_youtube_url` oEmbed)
called **raw `requests.get()`** with default `allow_redirects=True`. Because
dispatch was a substring match (`'linkedin.com' in url`), an attacker-controlled
host like `linkedin.com.attacker.tld` — which passes the initial
`validate_public_url` because it resolves to a public IP — could `302 →
http://169.254.169.254/…` (GCP metadata) and the raw fetch would follow it.
Reachable via `analyze_link`, `share_ingest`, and WhatsApp.

**Fix applied.** All platform handlers now route through `safe_get()`
(`functions/scraper.py`), and dispatch uses a new `_host_matches()` that matches
the **parsed hostname** (exact or subdomain) instead of a substring, so spoofed
lookalike hosts no longer reach a handler. *Residual (BACKLOG):* a DNS-rebinding
TOCTOU gap between resolution and connect remains — noted in `safe_get`'s
docstring; closing it fully means pinning the socket to the validated IP.

### 🟠 H2 — Rate-limit bypass via spoofed `X-Forwarded-For` — **FIXED** (+ owner action)
**OWASP A04.** `functions/rate_limit.py` `client_ip()` took the **leftmost**
`X-Forwarded-For` value, which is fully client-controlled. An attacker could
rotate `X-Forwarded-For` to reset the per-IP window and bypass the caps on the
paid Gemini endpoints (`analyze_link` 30/hr, `analyze_image`, `ask_brain`
60/hr) — a direct cost-amplification vector, worsened by App Check being in soft
(allow) mode by default (`main.py:244`).

**Fix applied.** `client_ip()` now walks `X-Forwarded-For` **from the right**
(where GCP's front end appends the real peer IP) and returns the first public IP,
skipping internal hops, falling back to the socket peer. A client can prepend
spoofed entries but cannot control the infra-appended rightmost value.
**Owner action:** set `APPCHECK_ENFORCE=true` so App Check is hard-enforced
(`SOURCE_OF_TRUTH.md` §4 task 5). Consider per-uid quotas after cutover
(backlog task 13/19). *Related — M7:* the limiter fails **open** on a Firestore
error (`rate_limit.py`); consider fail-closed on the paid buckets.

### 🟠 H3 — Ingest token stored in App Group UserDefaults, not Keychain — BACKLOG
**OWASP A04/A02.** The iOS share-extension bearer token is written to and read
from App Group `UserDefaults` (`web/ios/App/App/ShareConfigPlugin.swift:37`,
`web/ios/App/ShareExt/ShareViewController.swift:852`) — an unencrypted plist in
the shared container. It is high-entropy (`secrets.token_urlsafe(24)`,
`link_service.py:197`) but **long-lived, never rotated or expired**, and grants
full write-append to the account (`main.py:1031`). Move it to the Keychain
(`kSecAttrAccessGroup` + `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`),
copy the server side into a functions-only collection, and add rotation. Tracked
as `SOURCE_OF_TRUTH.md` §4 task 12 (native change — needs Xcode).

### 🟠 H4 — WhatsApp impersonation gated solely on `TWILIO_AUTH_TOKEN` — OWNER
**OWASP A05.** Twilio signature verification is correct and **fails closed**
(`functions/main.py:1733-1764`): outside the emulator, a missing
`TWILIO_AUTH_TOKEN` makes verification return `False`. But because **uid = phone
number** and the webhook maps `From` → account, if that env var is ever unset in
prod the endpoint would accept forged `From=<victim>` posts and inject
links/commands into any account. Security here rests entirely on one env var.
**Owner action:** confirm `TWILIO_AUTH_TOKEN` is set in prod; consider a
startup assertion that refuses to serve the webhook if it's missing outside the
emulator.

### 🟡 M1 — CSP allows `unsafe-inline` + `unsafe-eval` — BACKLOG
**OWASP A05.** `vercel.json` / `firebase.json:112` set an otherwise strong CSP
but `script-src` includes both `'unsafe-inline'` and `'unsafe-eval'`, which
negate CSP as an XSS backstop. Not auto-changed: Next.js inline bootstrap +
some deps may require them, so removal needs a runtime test. Move to a
nonce/hash strategy and drop `unsafe-eval` if the bundle allows.

### 🟡 M2 — CI workflow had no `permissions:` block — **FIXED**
**OWASP A05.** `.github/workflows/ios-testflight.yml` declared no `permissions:`,
so `GITHUB_TOKEN` inherited the repo/org default (often read/write). Added
`permissions: contents: read` (the job only reads the repo and talks to Apple).
There is no `pull_request_target` and no untrusted-input shell interpolation, so
no script-injection sink exists.

### 🟡 M3 — `.gitignore` missed signing/service-account secrets — **FIXED**
**OWASP A05.** The root `.gitignore` covered `.env*` and `*.pem` but **not**
`GoogleService-Info.plist`, `*.p8`, `*.p12`, `*.mobileprovision`, or
`serviceAccount*.json` — and `ios-testflight.yml:99` wrongly claimed the plist
was ignored. None are currently tracked (verified), so this was latent, but the
build writes these into the tree. Added the patterns to root `.gitignore`
(and see L7).

### 🟡 M4 — Extension bearer token in `chrome.storage.sync`; unpinned `baseUrl` — **FIXED**
**OWASP A02/A05.** The extension stored the ingest token in `chrome.storage.sync`
(`extension/background.js`, `popup.js`), which **replicates the bearer secret to
every signed-in Chrome profile/device**. The `baseUrl` was user-editable with no
validation, so a pasted malicious value would exfiltrate the token on every save.

**Fix applied.** Token moved to `chrome.storage.local` (device-local) with a
one-time migration from `sync` (`migrateSyncToLocal`) that purges the synced
copy. `baseUrl` is now validated against an `https:` + host allowlist
(`ALLOWED_HOSTS`) in both the popup (rejects on save) and the service worker
(`sanitizeBaseUrl`, defense-in-depth), so the token can only ever be sent to the
official backend. Note: manifest `host_permissions` was already scoped to the
backend host, so this hardens an already-narrow surface. *Safari residue:* the
Safari setup asks for "Always Allow on Every Website" (`safari/README.md`) —
scope that down if feasible.

### 🟡 M5 — `/api/chat` is an open proxy — CUTOVER
**OWASP A01.** `web/app/api/chat/route.ts` forwards to the backend with no local
auth check (it copies `Authorization`/`X-Firebase-AppCheck` through). Destination
is fixed (no SSRF). Enforcement is entirely delegated to the backend, so this is
only as strong as C3 — it closes with the cutover.

### 🟡 M6 — Admin endpoints leaked raw exceptions — **FIXED**
**OWASP A09.** `force_check_reminders`, `force_send_digests`, and
`send_digest_now` returned `str(e)` to the caller (`functions/main.py`).
Admin-gated, so low blast radius, but now genericized (detail is logged
server-side, generic message returned). *Related (BACKLOG):*
`process_link_background` still surfaces `str(e)[:300]` into the user's failed
card and `str(e)[:50]` over WhatsApp — diagnostic UX; soften if desired.

### 🟡 M7 — Rate limiter fails open — BACKLOG
See H2. `functions/rate_limit.py` `check_rate_limit()` returns `True` (allowed)
on any Firestore error. A transient backend issue disables limiting entirely.
Acceptable as availability-over-security today; reconsider fail-closed on the
paid buckets once per-uid quotas exist.

### 🟡 M8 — Dependencies use `>=` pins only — BACKLOG
**OWASP A06.** `functions/requirements.txt` pins everything with `>=` (e.g.
`requests>=2.31.0`, `beautifulsoup4>=4.12.0`), so deploys pull latest and builds
are non-reproducible — a regressed/vulnerable release could land silently. Pin
exact versions or add a lockfile; run SCA (`pip-audit`). Web deps are current
majors (`next 16.1.6`, `react 19.2.3`, `firebase 12.9.0`) — run `npm audit`
against the committed lockfile too. Not auto-changed: pinning needs a deploy test.

### 🟢 Low findings
- **L1** — `storage.rules:7` `screenshots/{uid}` read rule checks
  `request.auth.uid == uid`, but `{uid}` is the phone-number data id while
  `request.auth.uid` is the random Auth uid, so it can never match. Images are in
  practice served via unguessable tokenized download URLs (128-bit,
  `main.py:322`), i.e. public-by-URL. Acceptable but not rule-enforced; note it.
- **L2** — `firestore-rules-test/rules.test.mjs:40` loads
  `firestore.rules.locked`, **not** the deployed `firestore.rules`, so a green run
  gives false assurance about production. Run against both, or gate the deploy on
  the locked file becoming live.
- **L3** — `ios-testflight.yml` pins `actions/checkout@v4` / `setup-node@v4` to
  mutable tags. SHA-pin for supply-chain integrity (first-party, low risk).
- **L4** — `machina://` custom scheme (`web/ios/App/App/Info.plist:54`) is
  invokable by any app; it only opens the app + flashes a banner, no sensitive
  action or secret in the URL. UI-spoof nuisance only.
- **L5** — `web/lib/share.ts` `openExternal()` didn't scheme-check before
  `window.open`. **FIXED**: now parses the URL and only opens `http(s)`.
- **L6** — `img src` from scraped `thumbnailUrl`/`url` is unsanitized
  (`Card.tsx:223`, `LinkDetailModal.tsx:327`). `javascript:`/`data:` in `img src`
  doesn't execute; minor referer/exfil concern only. Constrain to `https:` if
  tightening.
- **L7** — `functions/.gitignore` didn't list `.env` (relied on root). **FIXED**:
  added `.env`/`.env.*` (keeping `.env.example`) belt-and-suspenders.

---

## 4. Remediation roadmap

### 4.1 Launch gate — the auth cutover (closes C1, C2, C3, M5)
All code is written; these are owner-only steps. Do **not** deploy the locked
rules until every write path is verified under auth. Order (from
`SOURCE_OF_TRUTH.md` §4 task 2 / `NATIVE_AUTH_SETUP.md` §6):
1. Configure the Apple **Services ID + `.p8`** in the Firebase Apple provider
   (web Apple sign-in).
2. Set `OWNER_EMAIL` so only the owner can claim the legacy workspace.
3. Flip `REQUIRE_AUTH=true` + `NEXT_PUBLIC_REQUIRE_AUTH=true`; redeploy functions + web.
4. `cd firestore-rules-test && npm test` (owner machine — cloud can't fetch the emulator).
5. `cp firestore.rules.locked firestore.rules && firebase deploy --only firestore:rules` (**point of no return**).
6. Device-verify the brand-new-user claim path (fresh non-owner → auto-created workspace).

### 4.2 Fixed in this branch (`claude/security-owasp-audit-r1vo9h`)
H1 (SSRF redirect + host dispatch), H2 (XFF parsing), M2 (CI permissions), M3 +
L7 (gitignore), M4 (extension token storage + baseUrl pinning), M6 (admin error
leaks), L5 (openExternal guard). Verified: `python -m py_compile *.py` (backend),
`npx tsc --noEmit` (web, clean), `node --check` (extension JS).

### 4.3 Owner configuration / key hygiene (`SOURCE_OF_TRUTH.md` §4 task 5)
- Confirm `TWILIO_AUTH_TOKEN` set in prod (H4); consider a startup assert.
- Set `APPCHECK_ENFORCE=true` (H2), `ADMIN_TOKEN`, `OWNER_EMAIL`.
- **Rotate the Gemini API key** (pasted in chat 2026-06-23) and the **App Store
  Connect `.p8`** (pasted in plaintext during CI setup).
- Add GCP/Firebase budget alerts (cost-abuse backstop).

### 4.4 Hardening backlog (no code yet)
H3 (Keychain + token rotation, task 12), M1 (CSP nonce/hash), M7 (fail-closed
rate limiting), M8 (pin deps + SCA), L1/L2/L3/L4/L6, per-uid quotas (task 13/19),
DNS-rebinding pin in `safe_get`.

---

## 5. What's already strong (don't regress)
- **SSRF guard** with per-redirect re-validation (`scraper.py:safe_get`) and
  metadata/RFC1918 blocking (`validate_public_url`).
- **Escape-first** allowlist HTML renderer for public share pages
  (`main.py:_md_to_html`), links restricted to `http(s)` + `rel="noopener nofollow"`.
- **No code-injection primitives** anywhere (`eval`/`exec`/`subprocess`/`pickle`/
  `yaml.load`/`shell=True` all absent).
- **Twilio signature verification fails closed** (`main.py:1733`).
- **Pinned CORS allowlist** with no arbitrary-origin reflection (`main.py:_allowed_origins`).
- **Strong HTTP headers**: HSTS (preload), `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `nosniff`, `object-src 'none'`, `base-uri 'self'`.
- **No hardcoded or committed secrets** — env-loaded, `.env` gitignored, git
  history clean; only public Firebase/reCAPTCHA config in the client bundle.
- **Auth tokens in IndexedDB**, not `localStorage`; the ingest token is kept out
  of web storage entirely.
- **Consistent `rel="noopener noreferrer"`** on all external links/`window.open`,
  and scheme guards before navigating stored URLs.
- **`react-markdown` without `rehype-raw`** (no raw-HTML sink) for AI answers.

---

*Prepared as a point-in-time review against the code on
`claude/security-owasp-audit-r1vo9h`. Re-audit after the auth cutover and before
public launch, and add the rule-test run to CI so C1/C2 can't silently regress.*
