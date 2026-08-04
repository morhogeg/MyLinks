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
   **Sign-in-enabled TestFlight builds:** every build bakes
   `NEXT_PUBLIC_REQUIRE_AUTH=true` by default since 2026-08-03 — dispatch *or*
   push to `trigger/testflight`. Only a dispatch with **`legacy_no_auth: true`**
   produces the pre-cutover ungated bundle, and that is valid only while the
   Firestore rules are rolled back to the open ruleset.
3. **Privacy manifests:** add `App/PrivacyInfo.xcprivacy` to the **App** target and
   `ShareExt/PrivacyInfo.xcprivacy` to the **ShareExt** target (each: File
   Inspector → Target Membership, and confirm it's in *Copy Bundle Resources*).

## 5. Environment variables (Cloud Functions)

**These are GitHub repo secrets, not Firebase console settings.** This is the
single most misunderstood thing about the cutover, and it has been described as
"console work" more than once. `deploy-functions.yml:129-152` reads each of these
from `secrets.*` and writes it into `functions/.env` at deploy time (this project
deliberately uses a plain `.env`, not Secret Manager — see SOURCE_OF_TRUTH §2).

So setting them is: **GitHub → Settings → Secrets and variables → Actions → New
repository secret**, then push any `functions/**` change to `main` so the backend
redeploys and picks them up. No Mac, no `firebase` CLI, no console.

| Repo secret | Purpose |
|---|---|
| `OWNER_EMAIL` | Only this account may claim the existing (single-owner) workspace via `claim_workspace`. **No longer optional** — the gate fails CLOSED when unset (audit S-8). Set it to your Google/Apple email. |
| `ADMIN_TOKEN` | Required to reach the debug/admin endpoints (they 404 otherwise). Fails closed when unset. |
| `APPCHECK_ENFORCE` | `true` enforces App Check on the paid endpoints (closes audit H-2). |
| `REQUIRE_AUTH` | `true` makes a verified ID token mandatory on every data endpoint. The backend half of the cutover. |

Truthiness for `REQUIRE_AUTH` / `APPCHECK_ENFORCE` is `1`/`true`/`yes`,
case-insensitive; anything else (including unset) is off — `functions/main.py:553`.

Web build (Vercel): `NEXT_PUBLIC_REQUIRE_AUTH` is the frontend half and is a
**Vercel environment variable**, set in the Vercel dashboard — it is the one
piece of cutover config that does not live in GitHub. `NEXT_PUBLIC_OWNER_EMAIL`
may still be set for parity, but claim gating is enforced server-side by
`OWNER_EMAIL`.

## 6. Cutover order (flag-gated — nothing breaks until you flip)

> **Rewritten 2026-07-27.** The old version of this section described a Mac
> workflow — `firebase deploy --only functions`, `./deploy-hosting.sh`, `npm test`
> against a local emulator, `firebase deploy --only firestore:rules`, Xcode →
> Archive. **None of that is how this ships anymore.** Every one of those steps
> is now CI, and three of the "known breaks" it warned about have since been
> fixed. Following the old list would have had you redo work and reach for a
> laptop you do not need. What is actually left is below.

**What still needs a human: four GitHub repo secrets, one Vercel variable, and
one check on your phone.** Everything else is a push.

### Before you start

Set these as **GitHub repo secrets** (Settings → Secrets and variables → Actions)
— see §5. They do nothing until a functions deploy picks them up.

- `OWNER_EMAIL` — your Google/Apple email. **Required**: the legacy-workspace
  claim gate fails closed without it (audit S-8).
- `ADMIN_TOKEN` — any long random string.
- ~~`APPCHECK_ENFORCE` — `true`.~~ 🛑 **DO NOT. Removed from the cutover
  2026-08-02** — App Check is browser-only reCAPTCHA and no App Attest plugin
  exists, so enforcing it takes the **native** app down. It is an independent
  change with its own prerequisites: SOURCE_OF_TRUTH §4 task 5.
- `REQUIRE_AUTH` — **leave this one unset for now.** It is step 3.

Then set `NEXT_PUBLIC_REQUIRE_AUTH=false` (or leave unset) in **Vercel**.

Also confirm, once: does `users/{your doc}.authUids` already contain your auth
uid? If it does, `claim_workspace` short-circuits and the `OWNER_EMAIL` gate is
never exercised.

### The steps

> ## ✅ EXECUTED 2026-08-02 — and the order below is WRONG in one place.
>
> The cutover is done (SOURCE_OF_TRUTH §3). Keep this section for the reasoning,
> but if you ever replay it: **step 6 (ship the `require_auth=true` iOS build)
> must happen BEFORE step 3, not after step 5.** As written, the backend starts
> rejecting tokenless clients at step 3 and the database locks at step 5, while
> the app on every phone is still an ungated build that signs nobody in — so the
> native app is dead from step 3 until someone installs a build that does not
> exist yet. Correct order: **1 → 2 → 6 (build, install, verify) → 3 → 7 → 4 →
> 5**. Note that step 7's new-user check also belongs *before* the lock: it is
> the cheapest proof the backend flag really took, and while the rules are still
> open, rollback is one variable.
>
> ~~Also: the iOS build **must** be dispatched from the Actions UI with the
> `require_auth` checkbox ticked. `git push -f origin main:trigger/testflight`
> hardcodes it OFF (`ios-testflight.yml:130`) and silently ships an ungated
> build.~~ **Fixed 2026-08-03** — after it caught us a third time (builds 1264,
> 1266, 1267). The gate now defaults ON for every trigger including push, the
> input is inverted to `legacy_no_auth` (rollback only), and a guard step
> refuses to build an ungated bundle. Either trigger is safe now.

1. **Ship the config with auth still off.** Push any `functions/**` change to
   `main` (bump `functions/.deploy-ping` if you have nothing else). The
   **Deploy Cloud Functions** workflow writes the secrets above into
   `functions/.env` and redeploys. Behavior is unchanged — `REQUIRE_AUTH` is
   still unset. Confirm from the function logs that verified bearer tokens are
   arriving before you enforce anything.

2. **Web is already deployed.** Vercel auto-deploys `web/` on every push to
   `main`, and Hosting has its own CI workflow now (`deploy-hosting.yml`). There
   is nothing to run.

3. **Flip the flags.** Set the `REQUIRE_AUTH` repo secret to `true`, set
   `NEXT_PUBLIC_REQUIRE_AUTH=true` in Vercel, then push a `functions/**` change
   to `main` so the backend redeploys with the new value. Sign in on web with
   Google and confirm your cards appear — that call is what runs
   `claim_workspace` and links your account.
   **Rollback = flip both back off and redeploy.** Still cheap at this point;
   after step 5 it is not.

   *Three breaks the old checklist warned about here are already fixed — do not
   go looking for them:* `retryFailedLink` now sends the bearer header;
   `backfill_related_links` is admin-gated; and `/api/article` (`get_article`),
   the anonymous-callable exception that needed a decision, was **deleted**
   2026-07-27 along with the reader feature.
   *Verified unaffected by the flag:* `share_ingest` still authenticates by
   ingest token (Share Extension and browser extension keep working), the
   callables take the SDK-attached token, and the Vercel proxy routes forward
   the `Authorization` header.

4. **The rules are already tested.** ~~Run the emulator suite on your Mac.~~
   `.github/workflows/rules-tests.yml` runs `firestore-rules-test/` against a
   real Firestore emulator on every push touching `firestore.rules*`, and
   **run #6 (2026-07-25) is green** on the merge that landed the S-9
   digest-delete rule. A GitHub runner downloads the emulator JAR fine; only the
   cloud sandbox cannot, and that limitation was mistakenly written down as
   "unverified" for a while. Just check the workflow is green on your branch.

   What the suite covers: owner can read/write their `users/{uid}` doc plus
   `links`/`chats`/`collections` and read `syntheses`; the `authUids
   array-contains` workspace-resolve **list query** works; a different signed-in
   account and an unauthenticated client get nothing; `shared_cards` /
   `shared_collections` are publicly readable but client-write-denied;
   `rate_limits` / `pending_processing` / `task_logs` stay denied; and the
   per-digest **delete** allowance (S-9) that a client `deleteDoc` depends on.

5. **Deploy the locked rules — by merging, not by typing.** Commit
   `cp firestore.rules.locked firestore.rules` and merge it to `main`. The
   **Deploy Firestore rules** workflow (`deploy-rules.yml`) re-runs the emulator
   suite, deploys, and then probes the live database anonymously to prove the
   lock actually landed.

   It also refuses to deploy a locked ruleset while the `REQUIRE_AUTH` secret is
   off — the ordering mistake that would brick every sign-in is now enforced by
   the pipeline rather than by this paragraph. **It cannot see
   `NEXT_PUBLIC_REQUIRE_AUTH` (a Vercel variable), so confirm that one
   yourself.**

   This is still the point of no return for the open-rules era. Do it after 1–4.

6. **Ship the iOS build.** `git push -f origin main:trigger/testflight` triggers
   the **iOS → TestFlight** workflow (cloud-managed signing, `macos-26`). No
   `./build-ios.sh`, no Xcode, no Mac. Then on device: Google **and** Apple
   sign-in, a capture through the share sheet, and account deletion.

7. **Device-verify the brand-new-user path** — sign in with a fresh non-owner
   account and confirm it lands on the welcome screen with an auto-created
   workspace, not the restricted screen. This only works once `REQUIRE_AUTH` is
   on, which is why it cannot be checked earlier.

## 7. Open questions / limits

- ~~**New (non-owner) users** land on the restricted screen — no self-serve
  workspace creation.~~ **RESOLVED 2026-07-03 (SOURCE_OF_TRUTH §4 task 3), this
  entry was stale.** `claim_workspace` now falls back to creating a fresh
  `users/{authUid}` workspace (authUids / email / createdAt / default settings /
  ingest token) for any verified account that cannot claim the `OWNER_EMAIL`-gated
  legacy doc, and the app shows a one-screen welcome
  (`web/components/Onboarding.tsx`) instead. The restricted screen now appears
  only on a genuine creation failure, with a Retry. It is flag-gated behind
  `REQUIRE_AUTH`, which is why §6 step 7 is the device check for it.
- **Plugin version** must match Capacitor 8 (see step 1).
- **Sign in with Apple on web** is optional; if you only need it on iOS you can
  skip the Services ID / `.p8` (step 3.2) — the iOS native flow doesn't use them.
