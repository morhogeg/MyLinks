#!/usr/bin/env bash
#
# Build the web app as a static export and deploy it to Firebase Hosting
# (https://secondbrain-app-94da2.web.app).
#
# WHY THIS EXISTS: the Firebase Hosting site is a SEPARATE deployment from the
# Vercel one (https://my-links-sable.vercel.app). Vercel auto-deploys on push to
# `main`; Firebase Hosting does NOT — it only updates when this runs. If it's
# left stale it serves an old `web/out` build. That is exactly what caused image
# uploads to fail on iPhone with "storage/unauthorized": the old build wrote the
# image client-side to users/<uid>/uploads/, which storage.rules deny (the app
# has no Firebase Auth). The current build uploads via the backend instead, so
# redeploying here fixes it.
#
# The iOS Shortcut / share deep-links and APP_URL point at the Firebase Hosting
# domain, so re-run this whenever the web app changes and mobile must stay current.
#
# Requires: NEXT_PUBLIC_FIREBASE_* in web/.env.local (so the build succeeds) and
# `firebase login` on this machine.
set -euo pipefail

PROJECT="secondbrain-app-94da2"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Building static export (web/out)…"
( cd "$ROOT/web" && npm run build )   # next.config emits `output: export` when VERCEL is unset

echo "Deploying hosting to project: $PROJECT"
firebase deploy --only hosting --project "$PROJECT"

echo "✅ Done — https://secondbrain-app-94da2.web.app is now on the current build."
