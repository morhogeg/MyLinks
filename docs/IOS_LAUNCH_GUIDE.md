# Machina AI — iOS Launch Guide (step-by-step)

> **What this is.** A single, do-this-in-order runbook to take Machina AI from
> "all code done, single-user" to "live on the App Store, multi-user." Every
> item below is an **owner step** — console config, key rotation, App Store
> Connect data entry, or a physical-device test. There is **no code work left**;
> the engineering is done and flag-gated OFF.
>
> **Sources this consolidates (read them if a step is unclear):**
> `SOURCE_OF_TRUTH.md` §4 (backlog) · `docs/PRODUCTION_READINESS_2026-07-14.md`
> §4 (owner runbook) · `NATIVE_AUTH_SETUP.md` (auth console/Xcode steps) ·
> `docs/APP_STORE.md` (nutrition label, metadata, reviewer notes, screenshots).
>
> **The one rule:** the **auth cutover (Part 1)** is the linchpin. Until it's
> done the app is structurally single-user — a second real user would see the
> first user's data. Do Part 1 fully before anything ships to the public. The
> **store build must be a `require_auth=true` build made AFTER the cutover.**

**Order of the whole launch:** Part 1 (auth cutover) → Part 2 (backend deploy) →
Part 3 (key rotation) → Part 4 (backups) → Part 5 (monitoring) → Part 6 (App
Store Connect) → Part 7 (on-device test) → Part 8 (submit).

Everything you'll touch:
- **Firebase Console** — https://console.firebase.google.com → project `secondbrain-app-94da2`
- **Apple Developer** — https://developer.apple.com/account
- **App Store Connect** — https://appstoreconnect.apple.com
- **GCP Console** — https://console.cloud.google.com (same project)
- **Vercel** — the `my-links-sable` project
- Your Mac (for `firebase deploy`) — or the "Deploy Cloud Functions" GitHub workflow

---

## Part 1 — Auth cutover 🔴 (the launch blocker)

This flips Machina from single-user to real multi-user. It is gated behind two
flags (`REQUIRE_AUTH` backend, `NEXT_PUBLIC_REQUIRE_AUTH` web), both OFF today.
**Do steps 1.1 → 1.7 in order.** Step 1.6 (deploying locked rules) is the point
of no return — do it only after everything before it passes.

### 1.1 — Apple sign-in for web (Firebase + Apple Developer)

*Native iOS Apple sign-in already works; this is only needed so the Apple button
works on the desktop web app. Skip only if you're launching iOS-only and will
hide the web Apple button.*

1. **Apple Developer → Certificates, Identifiers & Profiles → Identifiers:**
   - Confirm the App ID `com.morhogeg.machina` has the **Sign in with Apple**
     capability enabled.
   - Create a **Services ID** (this is the web identifier). Set its **Return
     URL** to `https://secondbrain-app-94da2.firebaseapp.com/__/auth/handler`.
   - Create a **Sign in with Apple Key** (a `.p8` file). **Download it now — you
     can only download it once.** Note the **Key ID** and your **Team ID**
     (`8Y2M94RUHG`).
2. **Firebase Console → Authentication → Sign-in method → Apple:**
   - Enable the provider.
   - Fill in **Services ID**, **Apple Team ID**, **Key ID**, and paste the
     contents of the `.p8` key.
3. **Firebase Console → Authentication → Settings → Authorized domains:** confirm
   `my-links-sable.vercel.app`, `secondbrain-app-94da2.web.app`, and
   `secondbrain-app-94da2.firebaseapp.com` are listed.

### 1.2 — Set the functions environment variables

Edit `functions/.env` (gitignored — lives only on your Mac / deploy env) and set:

```bash
OWNER_EMAIL=morhogeg@gmail.com        # only this account can claim the legacy workspace
ADMIN_TOKEN=<generate a long random string>   # e.g. openssl rand -hex 32
APPCHECK_ENFORCE=true                 # enforce App Check on paid endpoints
REQUIRE_AUTH=true                     # ⚠️ leave this for step 1.5 — see note
```

> Set `OWNER_EMAIL`, `ADMIN_TOKEN`, `APPCHECK_ENFORCE` now. **Do NOT add
> `REQUIRE_AUTH=true` yet** — you deploy once with it OFF (step 1.4) to confirm
> tokens are flowing, then turn it on (step 1.5). Keep them as two separate
> deploys so you have a safe checkpoint.

Also set `NEXT_PUBLIC_OWNER_EMAIL=morhogeg@gmail.com` in Vercel env for parity
(claim gating is enforced server-side by `OWNER_EMAIL`, but keep them matching).

### 1.3 — Run the locked-rules test suite (on your Mac — needs Java)

The locked ruleset is staged in `firestore.rules.locked`. Prove it before you
deploy it:

```bash
cd firestore-rules-test
npm install
npm test
```

All tests must pass. (This can't run in a cloud session — the emulator JAR can't
be downloaded there. It must run on your machine.) It verifies the owner can
read/write their workspace, the `authUids array-contains` sign-in query works,
other accounts and anonymous clients get nothing, and internal collections stay
denied.

### 1.4 — Deploy the backend with the flag still OFF

Deploy so verified tokens start arriving in the logs *before* you enforce
anything:

```bash
cd functions && firebase deploy --only functions --project secondbrain-app-94da2
```

*(This is a first pass with `REQUIRE_AUTH` unset. The full backend deploy —
indexes, hosting, backfills — is Part 2; if you'd rather do Part 2's full deploy
here in one shot, that's fine, just keep `REQUIRE_AUTH` OFF until 1.5.)*

Sign in on web with Google and confirm your cards still load. Check the functions
logs show `Authorization: Bearer` tokens arriving.

### 1.5 — Flip the flags ON

1. Add `REQUIRE_AUTH=true` to `functions/.env` and redeploy:
   `cd functions && firebase deploy --only functions --project secondbrain-app-94da2`
2. Set `NEXT_PUBLIC_REQUIRE_AUTH=true` in **Vercel** project env (and
   `web/.env.local` for local parity). Redeploy web (push to `main`, or Vercel →
   Redeploy).
3. Sign in on web with **Google** — confirm your cards appear (this triggers
   `claim_workspace`, linking your account to the legacy workspace).

> **Rollback at any point before 1.6:** set both flags back OFF and redeploy.
> Behavior returns to today's exactly.

### 1.6 — Deploy the locked Firestore rules (⛔ point of no return)

Only after 1.3 passed and 1.5 works:

```bash
cp firestore.rules.locked firestore.rules
firebase deploy --only firestore:rules --project secondbrain-app-94da2
```

This ends the world-writable-rules era. After this, data is locked to each
signed-in owner.

### 1.7 — Verify the brand-new-user path on device

With `REQUIRE_AUTH` on, sign in with a **fresh** (non-owner) account on a real
device. Confirm it auto-creates a new empty workspace and shows the one-screen
welcome (not the restricted screen). This is the exact flow an App Store reviewer
will hit, so it must work.

---

## Part 2 — Deploy the backend to production 🔴

Production is weeks behind `main` (device semantic search is currently degraded
to keyword-only — a live, user-visible bug). Bring prod current.

**Option A — from your Mac** (has Firebase creds):

```bash
cd functions
firebase deploy --only functions --project secondbrain-app-94da2   # all functions
cd .. && ./deploy-hosting.sh                                        # publishes the /api/search rewrite
firebase deploy --only firestore:indexes --project secondbrain-app-94da2   # new reminders composite index
```

Then run the embeddings backfill once (repairs any missing/degenerate
embeddings):

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" \
  https://<backfill_embeddings function URL>
```

**One-time reminder repair** (rewrites legacy timestamp formats so old reminders
keep firing under the new scheduler query) — run once after deploy:

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://<force_check_reminders function URL>?coerce=1"
```

**Option B — from GitHub (no Mac needed, set up once):** the repo has a
**"Deploy Cloud Functions"** workflow (`.github/workflows/deploy-functions.yml`,
manual dispatch). To use it, add two repo secrets first:
- `FIREBASE_SERVICE_ACCOUNT` — JSON key for a service account with **Cloud
  Functions Admin** + **Firebase Admin** roles (create it in GCP Console → IAM →
  Service Accounts).
- `GEMINI_API_KEY` — the Gemini key (written to `functions/.env` at deploy time).

Then: GitHub → Actions → **Deploy Cloud Functions** → Run workflow. After this,
you never need the Mac to deploy again.

> **Important index note:** the new reminders scheduler needs the composite index
> deployed. If you deploy functions without `firestore:indexes`, reminders stop
> firing. Deploy indexes with or before functions.

---

## Part 3 — Rotate the leaked keys 🔴

Two secrets were pasted in plaintext during setup and must be rotated before
public launch:

1. **Gemini API key** (pasted in chat 2026-06-23):
   - Google AI Studio / GCP → generate a **new** Gemini API key.
   - Update `GEMINI_API_KEY` in `functions/.env` (and the GitHub secret if using
     the deploy workflow), redeploy functions.
   - Delete/revoke the old key.
2. **App Store Connect API `.p8`** (pasted during CI setup):
   - App Store Connect → Users and Access → Integrations → App Store Connect API
     → revoke the old key, generate a new one.
   - Update the CI secrets used by the iOS → TestFlight workflow
     (`docs/IOS_CICD.md` lists which ones).

---

## Part 4 — Enable backups 🟠

There is no disaster recovery today; a bad migration or a mistaken
`delete_account` is currently unrecoverable.

1. **Firestore PITR** — Firebase Console → Firestore → Backups (or GCP Console →
   Firestore) → enable **Point-in-time recovery** (7-day window).
2. **Scheduled daily backups** (gcloud, ~2 min):

```bash
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7w \
  --project=secondbrain-app-94da2
```

---

## Part 5 — Monitoring & budget 🟠

So a runaway cost or an outage never goes unnoticed:

1. **Budget alert** — GCP Console → Billing → Budgets & alerts → Create budget
   (~$25/mo) with alert thresholds at **50% / 90% / 100%**.
2. **Uptime check** — GCP Console → Monitoring → Uptime checks → create one on
   the `ping` Cloud Function URL.
3. **Error-rate alert** — GCP Console → Monitoring → Alerting → one log-based
   alert on the functions error rate.
4. *(Optional)* Firestore **TTL policy** on `task_logs.expireAt` (the Timestamp
   field already exists) so logs auto-expire. And a **Sentry** DSN if you want
   real client crash reporting (`errorReporter.ts` hooks already exist).

---

## Part 6 — App Store Connect setup 🟠

*(Do this once the auth cutover is done, so the demo account and the store build
both exist.)* Full reference: `docs/APP_STORE.md`.

### 6.1 — App Privacy "nutrition label"
App Store Connect → your app → **App Privacy**. Declare exactly the data types in
`docs/APP_STORE.md` §1: Email, Name, User ID, Photos/Videos, Other
User-Generated Content — **all**: purpose = *App Functionality*, **Used for
Tracking = No**. Answer **No** to Usage Data, Diagnostics, Location, and
everything else. Never check "used for tracking" on any item.

### 6.2 — App metadata
App Store Connect → **App Information** + the version page. Copy from
`docs/APP_STORE.md` §2:
- **Name:** `Machina AI` · **Subtitle:** `Ask your saves anything`
- **Category:** Productivity
- **Privacy Policy URL:** `https://my-links-sable.vercel.app/privacy`
- **Support URL:** `https://my-links-sable.vercel.app`
- **Keywords, promotional text, and full description:** paste from §2.
- **Age rating:** answer No/None to everything → results in **4+**.

### 6.3 — Create + seed the demo reviewer account
1. After cutover, create a fresh account reserved for App Review (a Google
   account, or email+password if enabled).
2. Sign in with it once so its workspace is created, then **seed it** with 8–12
   saved cards (articles, a YouTube video, a screenshot) so Ask/synthesis demo
   well.
3. Put its **email + password** into the review notes (`docs/APP_STORE.md` §3,
   replacing `REVIEWER_EMAIL_TBD` / `PASSWORD_TBD`), and paste the whole notes
   block into App Store Connect → version page → **App Review Information →
   Notes**.

### 6.4 — Screenshots
Take the **6 screenshots** listed in `docs/APP_STORE.md` §4 on a 6.9" iPhone Pro
Max (simulator or device), **dark theme**, clean status bar (9:41, full battery),
curated workspace with no personal data. Order matters — Feed and Ask Machina go
first. iPhone-only, so no iPad screenshots are needed.

### 6.5 — Legal
Set a concrete **governing-law jurisdiction** in the `/terms` page §10
(`web/app/terms/page.tsx`) before public launch (it currently has a placeholder).

---

## Part 7 — On-device verification sweep 🟡

One pass on a **physical iPhone** — these can't be tested headlessly
(`SOURCE_OF_TRUTH.md` §4 task 11). Verify each:

- [ ] **Apple sign-in** works and loads the feed.
- [ ] **Google sign-in** works and loads the feed.
- [ ] **Account deletion** end-to-end (Settings → Delete account).
- [ ] **AI consent** notice shows on first run.
- [ ] **Share extension** shows a neutral "still saving" state under a killed
      network — **never a false green check**.
- [ ] **Haptics** fire on favorite / delete / save / pull-to-refresh / confirm.
- [ ] **Keyboard never covers inputs** (LinkDetailModal category/tag,
      AddToCollection, AddLinkForm — test on an iPhone SE).
- [ ] **Pull-to-refresh** doesn't conflict with edge-swipe back.
- [ ] **Failed card → Retry** recovers.

---

## Part 8 — Build & submit 🟢

1. Trigger the **iOS → TestFlight** GitHub Actions workflow with the
   **`require_auth: true`** input. This bakes `NEXT_PUBLIC_REQUIRE_AUTH=true`
   into the bundle. **The submitted build MUST be this post-cutover
   `require_auth=true` build** — a reviewer landing in the old shared workspace,
   or on a restricted screen, is an instant rejection.
2. Once the build is processed in App Store Connect, attach it to the version,
   confirm the metadata / privacy label / screenshots / reviewer notes from Part
   6 are all filled, and **Submit for Review**.

---

## Quick checklist

**Launch blockers 🔴**
- [ ] 1. Auth cutover complete (Apple web keys → env vars → rules test → deploy
      OFF → flip ON → locked rules → new-user device check)
- [ ] 2. Backend deployed to production (functions + hosting + indexes + backfill)
- [ ] 3. Gemini key + App Store Connect `.p8` rotated

**Production safety 🟠**
- [ ] 4. Firestore PITR + daily backups enabled
- [ ] 5. Budget alert + uptime check + error-rate alert

**App Store 🟠**
- [ ] 6a. App Privacy nutrition label filled
- [ ] 6b. Metadata entered
- [ ] 6c. Demo reviewer account created, seeded, credentials in notes
- [ ] 6d. 6 screenshots taken
- [ ] 6e. Governing-law jurisdiction set in `/terms`

**Final 🟢**
- [ ] 7. On-device verification sweep passed
- [ ] 8. `require_auth=true` build submitted for review

> **The linchpin is Part 1.** Everything else is safe to do in any order once the
> cutover is done — but nothing ships to the public until it is.
