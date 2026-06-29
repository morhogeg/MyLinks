# Deploy the frontend to Vercel (get a public link)

The data layer (Firestore, Storage, Cloud Functions) stays on Firebase. Vercel
just hosts the Next.js frontend, which talks to your existing Firebase backend.
The `/api/*` calls are proxied to Firebase via `vercel.json`.

## One-time setup (~2 min)

1. Go to https://vercel.com/new and import the GitHub repo `morhogeg/MyLinks`.
2. **Root Directory**: set to `web` (the Next.js app lives there, not the repo root).
3. **Framework Preset**: Next.js (auto-detected). Leave build/output as configured
   by `web/vercel.json` (`next build` → `out`).
4. **Environment Variables**: add the six `NEXT_PUBLIC_FIREBASE_*` values from
   `web/.env.example` (use your real Firebase web config from the Firebase console →
   Project settings → Your apps → SDK setup). These are client-side/public values.
   Optionally add `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` to enable Firebase App Check
   (see "App Check" below) — without it the app still works (App Check is skipped).
5. Deploy. You'll get a `https://<project>.vercel.app` link.

## Notes

- The feed reads Firestore directly via the client SDK, so it works as soon as the
  env vars are set — no backend changes needed.
- The iOS Shortcut should keep posting to the Firebase URL
  (`https://secondbrain-app-94da2.web.app/api/share`) shown in Settings, OR your new
  Vercel domain `/api/share` (it's proxied to the same function).
- Auth is still the single-user prototype (no login yet), so anyone with the link
  sees the same data. Lock this down with real auth (TASKS.md T1) before sharing widely.
- This does NOT replace Firebase Hosting; both can coexist. `firebase deploy` still
  works for the original `*.web.app` site.

## App Check (protects the paid AI endpoints from bots/cost-abuse)

The backend can require a Firebase App Check token on `/api/analyze`,
`/api/analyze-image`, `/api/chat`, and `/api/article`. To turn it on:

1. Firebase Console → App Check → register the web app with the **reCAPTCHA v3**
   provider (free). Copy the reCAPTCHA v3 **site key**.
2. Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in Vercel (and `web/.env.local` for dev).
   The client (`web/lib/firebase.ts`) then attaches an `X-Firebase-AppCheck`
   header to those calls automatically.
3. Roll out softly first: deploy with the key set but leave the Cloud Functions
   env `APPCHECK_ENFORCE` unset — the backend verifies and logs but doesn't
   reject. Once logs show valid tokens arriving, set `APPCHECK_ENFORCE=true` on
   the functions to start returning `401` for unattested requests.

## Real authentication (Google + Apple sign-in)

The code for real per-user auth is shipped but **dormant behind flags** so the
single-user prototype keeps working. Full design + rationale:
`docs/AUTH_AND_IOS_SPEC.md`. Activation is phased so nothing breaks:

1. Firebase Console → Authentication → enable **Google** and **Apple** providers
   (Apple needs an Apple Developer Service ID + key; it's required for the future
   iOS app per App Store rules).
2. Deploy the code with flags **off**. Confirm sign-in works and ID tokens reach
   the backend (logs).
3. **Back up** (`gcloud firestore export gs://<bucket>/pre-auth-backup`), then run
   the one-time migration to re-home your existing data onto your real auth uid:
   `cd functions && python migrate_user.py --old <prototypeDocId> --new <authUid> --commit`.
4. Flip both flags and redeploy: `NEXT_PUBLIC_REQUIRE_AUTH=true` (Vercel + iPhone
   build) and `REQUIRE_AUTH=true` (Cloud Functions env).
5. **Last**, deploy the locked rules:
   `cp firestore.rules.locked firestore.rules && firebase deploy --only firestore:rules`.
   - Rollback: set both flags back to false and redeploy the previous open rules.
