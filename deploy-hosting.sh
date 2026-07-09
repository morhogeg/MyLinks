#!/usr/bin/env bash
#
# Build the web app as a static export and deploy it to Firebase Hosting
# (https://secondbrain-app-94da2.web.app).
#
# NOT A ROUTINE DEPLOY STEP. Firebase Hosting is retired as a user-facing
# surface — the iPhone PWA is gone; the native iOS app + the Vercel site
# (https://my-links-sable.vercel.app, auto-deploys on push to `main`) are what
# users hit. Desktop web ships via Vercel; iOS ships via the "iOS → TestFlight"
# GitHub Actions workflow. Neither needs this script.
#
# WHY THIS STILL EXISTS: the Firebase Hosting origin serves two things the app
# depends on — the `/api/*` rewrites the native app calls (NEXT_PUBLIC_API_BASE)
# and the `/s` and `/c` share pages (`share_page` function). Those are wired via
# `firebase.json` rewrites. Re-run this ONLY when `firebase.json` rewrites change
# (Vercel does not pick those up); otherwise skip it.
#
# Requires: NEXT_PUBLIC_FIREBASE_* in web/.env.local (so the build succeeds) and
# `firebase login` on this machine.
set -euo pipefail

PROJECT="secondbrain-app-94da2"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Installing web deps (so new packages are present before the build)…"
( cd "$ROOT/web" && npm install )

echo "Building static export (web/out)…"
( cd "$ROOT/web" && npm run build )   # next.config emits `output: export` when VERCEL is unset

echo "Deploying hosting to project: $PROJECT"
firebase deploy --only hosting --project "$PROJECT"

echo "✅ Done — https://secondbrain-app-94da2.web.app is now on the current build."
