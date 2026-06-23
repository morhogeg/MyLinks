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
