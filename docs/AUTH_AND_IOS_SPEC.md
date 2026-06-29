# Implementation Spec — Real Authentication + Future iOS App

_Status: Part A (web auth + backend) implemented behind flags (branch
`claude/auth-real-implementation`); not yet activated. Part B (iOS) is design-only.
Written 2026-06-29 as the follow-up to the production security baseline (PR #5)._

## Why this exists

The security baseline closed the perimeter (rate limits, App Check, CORS, signature
verification, SSRF, headers, error/secret hygiene). The **one remaining structural gap** is
that there is **no real authentication**:

- `web/components/AuthProvider.tsx` originally just loaded the *first* user document in Firestore
  and used its ID as the "uid". There was no login.
- Every Cloud Function trusted a `uid` supplied by the client (request body, or callable
  `req.data` fallback) — it never verified who the caller is.
- `firestore.rules` is `allow read, write: if true` on user data — anyone can read/write any
  user's documents directly, bypassing all the function-level hardening.

This is acceptable **only** while the app is single-user. The moment a second real person uses it,
their data is fully exposed. This spec closes that gap and sets up the architecture so a **native
iOS app** is a thin client on top of the same authenticated API.

## Guiding principle

> **The backend (Cloud Functions + Firestore rules) is the single source of truth for identity.**
> Clients authenticate with Firebase Auth, obtain an ID token, and send it with every request. The
> server *derives* the uid from the verified token and never trusts a client-supplied uid again.
> Firestore rules enforce `request.auth.uid == uid` so even direct DB access is safe.

If Part A is built correctly, Part B (iOS) reuses the exact same backend contract — no server
changes needed for the second client.

---

# PART A — Real Authentication (web) — IMPLEMENTED (flag-gated)

Everything below is in the working tree on `claude/auth-real-implementation`, gated by
`REQUIRE_AUTH` (functions) / `NEXT_PUBLIC_REQUIRE_AUTH` (web) so it is inert until activated.

## A1. Providers
- **Google Sign-In** (primary) and **Sign in with Apple** (mandatory for the App Store once iOS
  offers Google — built into the shared auth layer now). Enable both in Firebase Console →
  Authentication.

## A2. Client — AuthProvider (`web/components/AuthProvider.tsx`)
Two modes selected by `NEXT_PUBLIC_REQUIRE_AUTH`:
- `true` → real `onAuthStateChanged`; renders `web/components/SignIn.tsx` until logged in; `uid` is
  the auth uid.
- otherwise → legacy single-user prototype (first user doc) so the live app keeps working.
Sign-out added to `web/components/SettingsModal.tsx`.

## A3. ID token on API calls (`web/lib/firebase.ts`)
`authHeaders()` returns `Authorization: Bearer <idToken>` (empty when signed out). Attached
alongside `appCheckHeaders()` in `AddLinkForm`, `AskBrain`, `ReadingView`. Dev proxy routes
(`web/app/api/*/route.ts`) forward `Authorization` + `X-Firebase-AppCheck`.

## A4. Backend verification (`functions/main.py`)
`_verified_uid(req)` verifies the bearer ID token via `firebase_admin.auth.verify_id_token`.
`_resolve_uid(req, data, headers)` returns the verified uid, falling back to the client uid only
when `REQUIRE_AUTH` is off (→ 401 when on). Applied in `analyze_link`, `analyze_image`, `ask_brain`.
`get_article` stays unauthenticated (read-only) but keeps App Check + rate limit.

## A5. Callables — fallback removed under enforcement
`get_share_config`, `send_digest_now` (`main.py`) and `search_links` (`search.py`) only fall back
to a client-supplied uid when `REQUIRE_AUTH` is off; otherwise require `req.auth`.

## A6. Rules (`firestore.rules.locked`)
Target rules: `request.auth.uid == uid` on `/users/{uid}` plus a recursive `{document=**}` covering
`links`, `chats`, and any future subcollection; deny `pending_processing`, `task_logs`,
`rate_limits`. **Not deployed** — the live `firestore.rules` stays open until cutover (deploying
early locks you out before migration).

## A7. Data migration (`functions/migrate_user.py`) — critical
Existing data lives under `users/{prototypeDocId}`; Google/Apple sign-in mints a *different* uid.
The run-once script (dry-run by default) copies the user doc + all subcollections (links, chats,
settings, ingestToken, phone, timezone) to `users/{authUid}`, and prints the gsutil command to
re-home `screenshots/{uid}` in Storage. Back up first (`gcloud firestore export`).

## A8. Ancillary flows
- **WhatsApp:** inbound already authenticated by Twilio signature; the phone→uid link must be set
  by an authenticated user (add a verify step in Settings; ideally OTP).
- **Share ingest token:** unchanged — correct model for headless capture (iOS Shortcut / Share
  Extension). Add a regenerate/revoke button.
- **Digest:** `send_digest_now` auth-only; scheduled digests unaffected.

## A9. Rollout & rollback (phased)
1. Enable providers. 2. Deploy code with flags **off**; confirm tokens in logs. 3. Backup + run
migration. 4. Flip `REQUIRE_AUTH` + `NEXT_PUBLIC_REQUIRE_AUTH` true; redeploy. 5. Deploy locked
rules **last**. Rollback: flags back to false; redeploy previous open rules (git history).

## A10. Verification
- `tsc --noEmit` exit 0; `py_compile` OK (done).
- At activation: unauth `curl /api/analyze` → 401; user A can't read user B's docs in console;
  chats still work (locked-rules `chats` coverage); screenshots load; sign-out returns to login.

---

# PART B — Native iOS app (design-only; cannot be built in this repo)

The payoff of Part A: iOS becomes a **second client of the same authenticated API — zero server
changes**.

- **Architecture:** native **SwiftUI** recommended (vs. keeping the PWA or a WKWebView wrapper).
- **Shared contract:** Firebase Auth → ID token → `Authorization: Bearer` + App Check header →
  `/api/*`; Firestore reads (links/chats) via the Firebase iOS SDK under the same locked rules.
- **Auth:** Firebase Auth iOS SDK with Google **and** Sign in with Apple (App Store Guideline 4.8).
- **App Check:** iOS uses **App Attest / DeviceCheck**; the backend `_require_app_check` already
  verifies any valid App Check token regardless of provider — **no backend change**.
- **Capture:** an iOS **Share Extension** reuses the `share_ingest` + per-user ingest token (works
  headlessly).
- **Reminders:** **APNs push via FCM** (store the device token on `users/{uid}`); the existing
  `reminder_service` / scheduled functions send to FCM. WhatsApp can remain an input channel.
- **App Store musts:** published **privacy policy** + privacy nutrition labels; **in-app account
  deletion** (5.1.1(v)) that deletes `users/{uid}/**`, storage, and the auth user; ATT if any
  tracking SDK is added.
- **Phasing:** (1) SwiftUI shell + Auth → read from Firestore; (2) add-link / ask / reading via
  `/api/*`; (3) App Attest + privacy/deletion; (4) Share Extension + FCM push.

---

## File-by-file (Part A, implemented)
- `web/components/AuthProvider.tsx`, `web/components/SignIn.tsx` *(new)*,
  `web/components/SettingsModal.tsx`, `web/lib/firebase.ts`.
- `web/components/{AddLinkForm,AskBrain,ReadingView}.tsx`, `web/app/api/*/route.ts`.
- `functions/main.py`, `functions/search.py`, `functions/migrate_user.py` *(new)*.
- `firestore.rules.locked` *(new; swap in at cutover)*, `functions/.env.example`, `web/VERCEL.md`.

## Risks & gotchas
- **Migration data loss** — back up before migrating; #1 risk.
- **Rules-before-client ordering** — deploy locked rules *after* auth is reliably sent (phased flag).
- **`chats` rule omission** — covered by the recursive rule; must not regress.
- **Header forwarding** — confirm Vercel/Hosting forward `Authorization` (App Check already relies
  on this).
- **Apple sign-in setup** — needs an Apple Developer Service ID + key; lead time.
