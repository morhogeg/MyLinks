#!/usr/bin/env bash
#
# Regenerate the Safari Web Extension wrapper from the shared /extension source.
#
# /extension is the single source of truth for ALL browsers. This script wraps it
# into a macOS app via Apple's converter so it can run in Safari. Re-run it
# whenever you change anything under /extension, then build in Xcode.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SRC="$ROOT/extension"
OUT="$HERE/build"

if [[ ! -f "$SRC/manifest.json" ]]; then
  echo "✗ Couldn't find the extension at $SRC" >&2
  exit 1
fi

echo "→ Converting $SRC"
echo "          → $OUT"
echo

xcrun safari-web-extension-converter "$SRC" \
  --project-location "$OUT" \
  --app-name "Machina Capture" \
  --bundle-identifier "com.morhogeg.machina.capture" \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

PROJ="$(/usr/bin/find "$OUT" -maxdepth 2 -name '*.xcodeproj' -print -quit)"

echo
echo "✓ Generated Safari project."
if [[ -n "$PROJ" ]]; then
  echo "  Open it:   open \"$PROJ\""
fi
echo "  Then build & run in Xcode — see safari/README.md for the one-time Safari setup."
