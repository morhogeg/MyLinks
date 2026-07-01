#!/usr/bin/env bash
#
# Rebuild the iOS app bundle from the web app and sync it into the Xcode project.
#
# The iOS app (Capacitor) bundles the Next.js static export and talks to the
# live Firebase backend. The /api/* endpoints have no server inside the app, so
# the build is compiled with NEXT_PUBLIC_API_BASE pointing at the live Firebase
# Hosting site (which rewrites /api/* to the Cloud Functions).
#
# IMPORTANT: the app's web content is ONLY refreshed by this script's `cap sync`
# step. Bumping the build number in Xcode and archiving does NOT rebuild the web
# bundle — it re-ships whatever is already in ios/App/App/public. So you MUST run
# this (and let it finish cleanly) before every Archive, or the new build will
# look identical to the old one.
#
# Run this whenever the web app changes, then open Xcode to archive for TestFlight:
#   git pull origin main       # make sure you're building the latest code
#   ./build-ios.sh
#   cd web && npx cap open ios  # Product → Archive → Distribute → TestFlight
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/web"

# Live Firebase Hosting origin — already rewrites every /api/* path to its
# Cloud Function (see firebase.json). Override with API_BASE=... if it moves.
API_BASE="${API_BASE:-https://secondbrain-app-94da2.web.app}"

# Public origin used to build shareable links (/c?id=, /s?id=). Must be the real
# web origin — inside the app window.location is capacitor://localhost.
SHARE_BASE="${SHARE_BASE:-$API_BASE}"

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "→ Building iOS bundle from commit ${COMMIT}"
echo "  (if that's not the latest, Ctrl-C and run: git pull origin main)"

# Install deps FIRST. Skipping this was a real footgun: when a new dependency
# lands (e.g. the self-hosted `geist` font), a stale node_modules makes
# `npm run build` fail, the script aborts before `cap sync`, and — if the error
# scrolls past — the next Archive silently ships the OLD web bundle.
echo "→ Installing web deps"
npm install

echo "→ Building Next.js static export (API base: $API_BASE)"
NEXT_PUBLIC_API_BASE="$API_BASE" NEXT_PUBLIC_SHARE_BASE="$SHARE_BASE" npm run build

# Guard: the static export must have actually produced the bundle. If it didn't,
# stop LOUDLY rather than syncing/archiving nothing new.
if [ ! -f "out/index.html" ]; then
    echo "✗ Build did not produce web/out/index.html — aborting so you don't archive a stale bundle." >&2
    exit 1
fi

echo "→ Syncing web assets into the iOS project"
npx cap sync ios

# Verify the native bundle was actually refreshed, and show proof (file count +
# newest file time) so you can trust that Archive will contain these changes.
PUB="ios/App/App/public"
if [ ! -f "$PUB/index.html" ]; then
    echo "✗ cap sync did not populate $PUB — aborting." >&2
    exit 1
fi
FILES="$(find "$PUB" -type f | wc -l | tr -d ' ')"
NEWEST="$(find "$PUB" -type f -exec stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' {} + 2>/dev/null | sort | tail -1 || true)"

echo
echo "════════════════════════════════════════════════════════════════"
echo "✓ iOS web bundle refreshed from commit ${COMMIT}"
echo "  ${PUB}: ${FILES} files, newest ${NEWEST:-just now}"
echo "════════════════════════════════════════════════════════════════"
echo "  Next: cd web && npx cap open ios"
echo "  In Xcode: bump the build number, then Product → Archive →"
echo "            Distribute App → TestFlight."
