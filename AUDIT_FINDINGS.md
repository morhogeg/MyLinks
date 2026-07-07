# Machina AI — Production-Readiness Audit & Remediation

> **Created 2026-07-07** from a five-agent deep audit (backend Python, React
> components, frontend data layer, security, iOS/CI/config). Every finding was
> verified against the code on `main`, not against docs. Items already tracked in
> `SOURCE_OF_TRUTH.md` §4 at audit time were excluded.
>
> **This is a remediation tracker, not a second source of truth.** The canonical
> backlog remains `SOURCE_OF_TRUTH.md` §4; this file holds the detailed
> reproduction/fix notes that would bloat it. Status is updated as fixes land.
> When an item is fully shipped + deployed, collapse it to one line and move the
> detail to git history.

**Legend:** ✅ fixed (this sweep) · 🔧 partial · ⬜ deferred (tracked) · 📝 needs owner action

---

## 🔴 P0 — cutover / submission blockers

| # | Finding | File | Status |
|---|---------|------|--------|
| 1 | Public-share takeover: `shared_cards`/`shared_collections` UPDATE authorized against incoming doc's `ownerUid`, not existing → any signed-in user overwrites any public share (phishing repoint) | `firestore.rules.locked:83-99` | ✅ |
| 2 | World-readable share docs store `ownerUid` = owner phone number (PII leak) | `firestore.rules.locked` + `web/lib/collections.ts:135,167` | 📝 needs data-model change |
| 3 | Missing `NSCameraUsageDescription` → camera tap from in-app picker hard-crashes; App Review reject | `web/ios/App/App/Info.plist` | ✅ |
| 4 | "Delete Account" leaves `syntheses` subcollection + `task_logs` behind (5.1.1(v)) | `functions/link_service.py:129-148` | ✅ |

**#1 fix:** split create/update — `update` now requires `owns(resource.data.ownerUid) && request.resource.data.ownerUid == resource.data.ownerUid`; regression test added in `firestore-rules-test/rules.test.mjs`.

**#2:** Rules can't hide a field (reads are all-or-nothing per doc). Real fix = publish the
snapshot via Admin SDK without `ownerUid`, **or** migrate the owner doc off phone-number
keying so `ownerUid` is an opaque Auth uid. `SECURITY TODO` comment left in the ruleset.
**Owner decision required** — do before publishing any share post-cutover.

---

## 🟠 P1 — correctness, data integrity, resilience

| # | Finding | File | Status |
|---|---------|------|--------|
| 5 | AskBrain stream has no lifecycle guard → "New chat"/switch mid-stream white-screens app + corrupts saved history | `web/components/AskBrain.tsx:404-418` | ✅ |
| 6 | Zero error boundaries + no crash reporting; unguarded `link.tags.some()` on non-guaranteed fields → one bad doc blanks the app | `web/app/` (no error.tsx), `Feed.tsx:371,404,441,466` | ✅ (Sentry ⬜) |
| 7 | WhatsApp send failures swallowed → reminders marked COMPLETED that never fired; digests stamped sent | `functions/whatsapp_handler.py:51-70` + reminder/digest callers | ✅ |
| 8 | Spoofable rate-limit IP: takes first `X-Forwarded-For` hop (client-controlled) instead of GFE-appended last | `functions/rate_limit.py:67-72` | ✅ |
| 9 | Embedding schema drift (retry writes raw array, not Vector) + zero-vector poisoning on transient failure → cards permanently invisible to search, no repair path | `main.py:604/2140`, `storage.ts:115`, `ai_service.py:571` | ⬜ deferred |
| 10 | Cards stuck at `processing` forever: 300s timeout bypasses except; `retryFailedLink` fetch has no timeout; `main.py:2018` update outside try; no janitor | `main.py:1989-2233`, `storage.ts:73-122` | 🔧 (retry timeout + 2018 fixed; janitor ⬜) |
| 11 | Whole library incl. 768-float vectors re-downloaded every launch; no `persistentLocalCache`, no `limit()` | `firebase.ts:30-32`, `Feed.tsx:241` | 🔧 (cache fixed; vector/pagination ⬜) |
| 12 | `key={refreshKey}` remounts entire Feed on every add (wipes view/filters/listeners) | `web/app/page.tsx:30,50-52,159` | ✅ |
| 13 | Share Extension jetsam on large photos (full-res `UIImage(data:)` + base64 in ~120MB process) | `ShareViewController.swift:803-846` | ✅ |
| 14 | Background-upload failures after "you can close this" reach nobody (random-UUID session, no `handleEventsForBackgroundURLSession`) | `ShareViewController.swift:898-917`, `AppDelegate.swift` | ⬜ deferred |

**#9 defer reason:** needs coordinated client+trigger change (stop round-tripping embeddings
through the client; make `sync_link_embedding` repair array-typed/updated docs; on embed
failure omit field + set `needsEmbedding` so backfills can find it). Higher-risk; own pass.

**#10/#14 defer reason:** the scheduled-janitor function and the ShareExt pending-record
reconciliation are new subsystems, not surgical edits — own pass.

---

## 🟡 P2 — cost, correctness, hygiene

| # | Finding | File | Status |
|---|---------|------|--------|
| 15 | Feed re-render storm at 5 Hz during any capture; no `React.memo`, facet counts recompute every render, per-card `setInterval`, drag writes state per frame | `Feed.tsx`, `useProcessingBanner.ts:45`, `Card.tsx:95` | ⬜ deferred |
| 16 | Two more `window.Capacitor` truthiness tests (nondeterministic web long-polling; wrong web share path) | `firebase.ts:9-11`, `share.ts:14-17` | ✅ |
| 17 | Out-of-order semantic-search responses clobber newer results (no stale-guard) | `Feed.tsx:157-203` | ⬜ deferred |
| 18 | Settings save/load fail silently → failed load overwrites real config with defaults | `SettingsModal.tsx:276-335` | ✅ |
| 19 | WhatsApp `digest` runs multi-sec Gemini synchronously in webhook; no `MessageSid` dedup; no WhatsApp URL dedup → Twilio-retry duplicate sends/spend | `main.py:1768-1953` | ✅ |
| 20 | Unbounded/heavy Firestore reads on hot paths (`get_user_tags` full docs+vectors every save; reminder sweep all users every 2 min) | `link_service.py:159`, `reminder_service.py:142` | ⬜ deferred |
| 21 | SSRF guard drift: platform scraper branches bypass `safe_get`; substring dispatch | `scraper.py:93-110` + branches | ⬜ deferred |
| 22 | `GoogleService-Info.plist` not gitignored despite docs claiming it | `web/ios/.gitignore` | ✅ |
| 23 | CI ships dead app green: no empty-secret tripwire, no URL-scheme-in-archive check, rules tests never run in CI | `.github/workflows/ios-testflight.yml` | 🔧 (secret+scheme tripwires ✅; rules-test CI ⬜) |
| 24 | Client-clock `createdAt` (no `serverTimestamp`); retry teleports card to top | `storage.ts:55,122` | ✅ (retry preserves createdAt; serverTimestamp per agent note) |
| 25 | `/api/chat` no `maxDuration` → Vercel can kill long RAG stream mid-answer | `web/app/api/chat/route.ts` | ⬜ deferred |
| 26 | Favicon fetch leaks every shared hostname to Google (contradicts privacy manifest) | `ShareViewController.swift:747-764` | ✅ |
| 27 | Solid hardcoded colors break shipped light theme (`text-white`/`bg-white` confirm dialog + save button) | `ConfirmDialog.tsx:88,115`, `AddLinkForm.tsx:441` | ⬜ deferred |

---

## 🧱 Structural debt & dead code

| Item | Where | Status |
|------|-------|--------|
| `main.py` 2333 lines — extract `share_service.py` (~600-line renderer); dedup verbatim prompt in `answer_from_context`/`_stream`; dedup drifted `link_data`; dead `ClaudeService`/`format_digest_whatsapp`/`attempts` | `functions/main.py`, `ai_service.py` | ⬜ deferred |
| Streaming path cites ALL retrieved cards when `[[CITED:]]` marker missing (trust bug) | `ai_service.py:485-487` | ⬜ deferred |
| `Feed.tsx` 2109 lines — decompose along mapped seams (`useLinks`, `useSemanticSearch`, `useFeedFilters`, `useLinkActions`, render-only extractions) | `web/components/Feed.tsx` | ⬜ deferred |
| `SettingsModal.tsx` 1117 lines — extract `DigestSettings` + `useUserSettings` | `web/components/SettingsModal.tsx` | ⬜ deferred |
| Type honesty: `confidence` string vs float; `createdAt` type; dead-stale `models.py` `LinkDocument`/`RelatedLink` | `types.ts`, `functions/models.py` | 🔧 (types.ts fixed; models.py ⬜) |
| Two markdown stacks (`react-markdown` + hand-rolled `SimpleMarkdown`) — consolidate | `web/components/` | ⬜ deferred |
| `requirements.txt` floor-pinned (`>=`) — non-reproducible deploys | `functions/requirements.txt` | ✅ (capped to next major) |
| Committed `web/output.json` debug artifact (real article data) | `web/output.json` | ✅ deleted |
| `@capacitor/cli` in `dependencies` → `devDependencies` | `web/package.json` | ✅ |
| Dead `test_locally.sh`; `deploy-hosting.sh` header contradicts PWA retirement; `docs/IOS_CICD.md` stale | root | 🔧 (IOS_CICD ✅; others ⬜) |
| Owner PII (`+16462440305`, uid) in `models.py:194` + tracked docs | `functions/models.py` | ⬜ deferred |
| Browser extension: no web UI exposes ingest token (new users can't configure); stale "MyLinks" manifest branding | `extension/` | ⬜ deferred |
| CI: `altool` deprecated → `-exportArchive destination:upload`; Xcode glob can pick beta; App(21)/ShareExt(19) build-number drift | `.github/workflows/ios-testflight.yml`, `pbxproj` | ⬜ deferred |

---

## ✅ Verified clean (do not re-audit)

Batch 1 security defenses intact (App Check + rate-limit + bearer on all data endpoints,
timing-safe admin compare, Twilio fails closed, SSRF resolves DNS/IPv6/decimal, share-page
escape-first); CORS/auth consistent across endpoints; ingest token 192-bit; extension is
minimal-permission MV3; CI doesn't leak secrets; `firestore.indexes.json` covers the one
composite query; iOS deployment target consistent 15.0; ATS untouched; AuthProvider async
effects correctly cancelled; cutover won't break on missing collections; `app/api/*` are thin
proxies with generic errors; `vercel.json` security headers solid.
