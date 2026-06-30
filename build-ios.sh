#!/usr/bin/env bash
#
# Rebuild the iOS app bundle from the web app and sync it into the Xcode project.
#
# The iOS app (Capacitor) bundles the Next.js static export and talks to the
# live Firebase backend. The /api/* endpoints have no server inside the app, so
# the build is compiled with NEXT_PUBLIC_API_BASE pointing at the live Firebase
# Hosting site (which rewrites /api/* to the Cloud Functions).
#
# Run this whenever the web app changes, then open Xcode to archive for TestFlight:
#   ./build-ios.sh
#   npx --prefix web cap open ios   # or: cd web && npx cap open ios
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/web"

# Live Firebase Hosting origin — already rewrites every /api/* path to its
# Cloud Function (see firebase.json). Override with API_BASE=... if it moves.
API_BASE="${API_BASE:-https://secondbrain-app-94da2.web.app}"

echo "→ Building Next.js static export (API base: $API_BASE)"
NEXT_PUBLIC_API_BASE="$API_BASE" npm run build

echo "→ Syncing web assets into the iOS project"
npx cap sync ios

echo
echo "✓ iOS bundle is up to date."
echo "  Open Xcode:   cd web && npx cap open ios"
echo "  Then: set your Team under Signing & Capabilities → Product → Archive → Distribute → TestFlight."
