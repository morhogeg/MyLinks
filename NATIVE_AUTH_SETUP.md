# Native Multi-User Auth + Sign in with Apple — Setup & Cutover

This is the manual configuration required to finish the multi-user auth work
that the code changes on this branch prepare. The **code** (client sign-in for
Google + Apple on web and native, backend ID-token verification, account
deletion, locked Firestore rules) is done; the steps below are the console /
Xcode / Apple-Developer pieces that can't be done from the repo, plus the order
to roll it out safely.

> **Flag-gated & safe to merge.** The whole cutover is gated behind
> `REQUIRE_AUTH` (backend) / `NEXT_PUBLIC_REQUIRE_AUTH` (web), both **off by
> default**. With the flags off the app behaves exactly as it does today (web
> Google gate; native loads the owner workspace; backend still accepts a client
> uid), so merging this branch does **not** change the live app. You flip the
> flags — and deploy the locked rules — only at cutover, after sign-in is
> verified. Rollback = flip the flags back off and redeploy.

> ⚠️ **Do not flip the flags / re-archive the iOS app until steps 1–5 are
> complete.** Once `REQUIRE_AUTH` is on, the native app *requires* sign-in; if the
> plugin / Firebase iOS config / Apple capability aren't in place, users are
> locked out.

---

## What the code already does

- `web/lib/auth.ts` — Google + Apple sign-in. Web uses Firebase popup/redirect;
  native uses `@capacitor-firebase/authentication` and bridges the credential
  into the Firebase JS SDK (`signInWithCredential`), so `getIdToken()` and
  `onAuthStateChanged` work the same on both platforms.
- `web/components/AuthProvider.tsx` — both web and native are now gated by real
  sign-in; the "first user doc" fallback is gone. First-time linking is done via
  the `claim_workspace` Cloud Function (Admin SDK).
- `web/components/LoginScreen.tsx` — "Continue with Apple" + "Continue with Google".
- `web/components/SettingsModal.tsx` — in-app **Delete account** (calls
  `delete_account`), required by App Store guideline 5.1.1(v).
- Backend (`functions/`) — every data endpoint/callable verifies the Firebase ID
  token and derives the workspace uid server-side (no more trusting a body
  `uid`); new `claim_workspace` and `delete_account` callables.
- `firestore.rules` — locked to `owns(uid)` (membership in `authUids`).
- iOS `App.entitlements` — Sign in with Apple capability; `capacitor.config.ts` —
  plugin config; `PrivacyInfo.xcprivacy` — added for both targets.

---

## 1. Dependencies

```bash
cd web
npm install
# Verify the plugin major matches Capacitor 8. package.json pins ^7.2.0 as a
# placeholder — if npm warns about a peer/version mismatch with @capacitor/core 8,
# install the matching major explicitly:
npm install @capacitor-firebase/authentication@latest
npx cap sync ios
```

`cap sync` installs the plugin's iOS pod (which pulls the native Firebase Auth
SDK). That native SDK ships its own privacy manifest — no action needed for it.

## 2. Firebase Console

1. **Add an iOS app** to the Firebase project (bundle id `com.morhogeg.machina`)
   if one doesn't exist. Download **`GoogleService-Info.plist`** and add it to the
   `App` target in Xcode (drag in, "Copy items if needed", target = App). It is
   gitignored — keep it out of the repo.
2. **Authentication → Sign-in method:**
   - **Google** — enabled (confirm).
   - **Apple** — enable it. For **web** Apple sign-in you must also fill in the
     Services ID, Apple Team ID, Key ID, and the `.p8` private key (step 3). For
     **native** iOS, enabling the provider is enough.
   - **Authorized domains** — add the Vercel domain and `*.web.app` / `firebaseapp.com`.

## 3. Apple Developer

1. **App ID** (`com.morhogeg.machina`) → enable the **Sign in with Apple** capability.
2. For **web** Apple sign-in (only needed if you want Apple login on the desktop/PWA):
   - Create a **Services ID**; set the return URL to
     `https://<your-project>.firebaseapp.com/__/auth/handler`.
   - Create a **Sign in with Apple key** (`.p8`); note the Key ID + Team ID and
     paste the key into the Firebase Apple provider config.
3. Regenerate provisioning profiles so they include the Sign in with Apple entitlement.

## 4. Xcode

1. **Signing & Capabilities → App target:** confirm **Sign in with Apple** appears
   (the entitlement is already in `App.entitlements`); Xcode may need it re-added
   through the UI to sync the provisioning profile.
2. **URL scheme for native Google:** ~~manual Xcode step~~ **automated in CI
   (2026-07-03)** — the TestFlight workflow extracts `REVERSED_CLIENT_ID` from the
   decoded `GoogleService-Info.plist` and injects it into `Info.plist`
   (`CFBundleURLTypes`) at build time. Only needed manually for local
   `./build-ios.sh` + Xcode builds: copy `REVERSED_CLIENT_ID` from the plist into
   **Info → URL Types**. Without it the native Google flow can't return to the
   app. *(Apple sign-in needs no URL scheme.)*
   **Sign-in-enabled TestFlight builds:** dispatch the *iOS → TestFlight* workflow
   with the **`require_auth: true`** input — it bakes `NEXT_PUBLIC_REQUIRE_AUTH=true`
   into the bundle. Default runs (input off) keep the pre-cutover legacy behavior.
3. **Privacy manifests:** add `App/PrivacyInfo.xcprivacy` to the **App** target and
   `ShareExt/PrivacyInfo.xcprivacy` to the **ShareExt** target (each: File
   Inspector → Target Membership, and confirm it's in *Copy Bundle Resources*).

## 5. Environment variables (Cloud Functions)

| Var | Purpose |
|---|---|
| `OWNER_EMAIL` | If set, only this account may claim the existing (single-owner) workspace via `claim_workspace`. Set it to your Google/Apple email for the migration. |
| `ADMIN_TOKEN` | Required to reach the debug/admin endpoints (they 404 otherwise). |
| `APPCHECK_ENFORCE=true` | Enforce App Check on the paid endpoints (closes audit H-2). |

Web build (Vercel / `web/.env.local`): `NEXT_PUBLIC_OWNER_EMAIL` may still be set
for parity, but claim gating is now enforced server-side by `OWNER_EMAIL`.

## 6. Cutover order (flag-gated — nothing breaks until you flip)

1. **Deploy Cloud Functions with flags OFF** (`REQUIRE_AUTH` unset). The client
   already sends `Authorization: Bearer` when signed in, so you can confirm from
   the logs that verified tokens are arriving before enforcing anything.
   `cd functions && firebase deploy --only functions`.
2. **Deploy the web app** with `NEXT_PUBLIC_REQUIRE_AUTH` still off (Vercel auto on
   push; Firebase Hosting via `./deploy-hosting.sh`). Behavior is unchanged.
3. **Flip the flags on** — set `REQUIRE_AUTH=true` (Functions) and
   `NEXT_PUBLIC_REQUIRE_AUTH=true` (Vercel + `web/.env.local`) and redeploy both.
   Sign in on web with Google → confirm your cards appear (this triggers
   `claim_workspace`, linking your account). Rollback = flip both back off.

   **Known break to fix BEFORE flipping** (found in the 2026-07-03 readiness
   audit): `retryFailedLink` (`web/lib/storage.ts` ~line 82) POSTs
   `/api/analyze` **without** `authHeaders()` — with `REQUIRE_AUTH=true` the
   backend 401s and every failed-card Retry fails. Add
   `...(await authHeaders())` to that fetch (same pattern as
   `AddLinkForm.tsx`). Related, non-blocking notes:
   - `/api/article` (`get_article`) verifies **no** token even when
     `REQUIRE_AUTH` is on — reading view keeps working (its fetch in
     `ReadingView.tsx` sends no auth header), but the endpoint stays
     anonymous-callable (App Check + per-IP rate limit only). Decide whether
     that's acceptable or add `_authed_uid` + a client header.
   - `backfill_related_links` (functions/main.py) has **no `_require_admin`
     guard** (unlike `backfill_youtube_channels`) — anyone who finds the URL can
     trigger a paid all-user embedding backfill. Add the guard before/at cutover
     (then pass `X-Admin-Token` when running the M9 backfill).
   - Unaffected by the flag (verified): `share_ingest` still authenticates by
     ingest token (Share Extension, browser extension keep working);
     the callables (`search_links`, `get_share_config`, `send_digest_now`,
     `claim_workspace`, `delete_account`) take the SDK-attached token; the Vercel
     proxy routes (`web/app/api/*/route.ts`) forward the `Authorization` header.
4. **Test the locked rules in the Firestore emulator** — a ready-made suite
   lives in `firestore-rules-test/` (see its README):
   `cd firestore-rules-test && npm install && npm test`
   (needs Java for the emulator). It verifies: owner can read/write their
   `users/{uid}` doc + `links`/`chats`/`collections` and read `syntheses`; the
   `authUids array-contains` workspace-resolve **list query** works; a different
   signed-in account and an unauthenticated client get nothing; `shared_cards`/
   `shared_collections` are publicly readable but owner-only writable;
   `rate_limits`/`pending_processing`/`task_logs` stay denied.

   Rules changes staged 2026-07-03 in `firestore.rules.locked`:
   - **`syntheses` subcollection added** (M12 was newer than the locked file):
     client read-only; writes stay Cloud-Functions-only.
   - **`users/{uid}` read rule rewritten** from `owns(uid)` to
     `request.auth.uid in resource.data.authUids`: list rules can't call
     `get()` with an unbound `{uid}`, so the old rule would have rejected the
     workspace-resolve query and dead-ended every sign-in on the restricted
     screen. The resource-based form is provable from the query's own
     `array-contains` filter.
   - **`users/{uid}` create/delete denied to clients** (claim/deletion are
     Admin-SDK-side). If the new-user onboarding path creates the workspace doc
     client-side rather than in `claim_workspace`, add an `allow create` first.
   - `rate_limits` confirmed denied.
5. **Deploy the locked rules** —
   `cp firestore.rules.locked firestore.rules && firebase deploy --only firestore:rules`.
   Point of no return for the open-rules era; do it only after 1–4 pass.
6. **Archive the iOS app** (after 1–5, with `NEXT_PUBLIC_REQUIRE_AUTH=true` baked
   into the build). `./build-ios.sh`, then Xcode → Archive → TestFlight. Test
   Google **and** Apple sign-in on device, then account deletion.

## 7. Open questions / limits

- **New (non-owner) users:** `claim_workspace` only links the *existing* unclaimed
  workspace (single-owner migration). There is no self-serve "create a fresh empty
  workspace for a brand-new user" flow yet — a new account currently lands on the
  restricted screen. If you want open public sign-up, that onboarding path is a
  follow-up (create `users/{newId}` with `authUids` on first sign-in).
- **Plugin version** must match Capacitor 8 (see step 1).
- **Sign in with Apple on web** is optional; if you only need it on iOS you can
  skip the Services ID / `.p8` (step 3.2) — the iOS native flow doesn't use them.
