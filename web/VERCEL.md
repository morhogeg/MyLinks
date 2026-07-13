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
- Capture clients (the iOS Share Extension and the browser extension) can keep
  posting to the Firebase URL (`https://secondbrain-app-94da2.web.app/api/share`)
  shown in Settings, OR your new Vercel domain `/api/share` (it's proxied to the
  same function).
- Auth is still the single-user prototype (no login yet), so anyone with the link
  sees the same data. Lock this down with real auth (SOURCE_OF_TRUTH.md §4 task 2, the auth cutover) before sharing widely.
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
