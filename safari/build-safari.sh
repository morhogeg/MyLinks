#!/usr/bin/env bash
#
# Build, verify and (for the owner) archive Machina for Safari, the Mac app
# that carries the shared /extension code into Safari.
#
#   ./safari/build-safari.sh              Release build, ad-hoc signed, verified.
#                                         No Apple account needed. Safari runs it
#                                         only with Develop > Allow Unsigned
#                                         Extensions (a local smoke test).
#   ./safari/build-safari.sh --dev        Same, signed "Apple Development" for team
#                                         8Y2M94RUHG from this Mac's keychain, so
#                                         Safari loads it without the unsigned
#                                         toggle. No network, no profiles.
#   ./safari/build-safari.sh --archive    OWNER ONLY. Signed App Store archive +
#                                         export (.pkg) via automatic signing.
#                                         Talks to Apple (registers bundle ids,
#                                         makes profiles) but never uploads.
#   ./safari/build-safari.sh --lint       Ask Apple's converter which manifest keys
#                                         Safari doesn't support (a canary for
#                                         changes made to /extension for Chrome).
#   ./safari/build-safari.sh --verify APP Run the bundle checks on any built .app.
#
# The Xcode project (safari/MachinaSafari.xcodeproj) is committed; this script
# only drives xcodebuild. The project copies /extension into the extension at
# build time (safari/Extension/sync-resources.sh), so there is nothing to
# regenerate when /extension changes: just build again.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PROJECT="$HERE/MachinaSafari.xcodeproj"
SCHEME="MachinaSafari"
OUT="$HERE/build"
DERIVED="$OUT/DerivedData"
APP_NAME="Machina for Safari.app"
TEAM_ID="8Y2M94RUHG"

say()  { printf '%s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; FAILED=1; }
ok()   { printf 'ok    %s\n' "$*"; }

FAILED=0

xcconfig_value() {
  /usr/bin/sed -n "s/^$1 *= *//p" "$HERE/Config/Base.xcconfig" | head -1
}

# ── Bundle checks ────────────────────────────────────────────────────────────
verify_app() {
  local app="$1" appex info xinfo pb=/usr/libexec/PlistBuddy
  appex="$app/Contents/PlugIns/Machina Extension.appex"
  info="$app/Contents/Info.plist"
  xinfo="$appex/Contents/Info.plist"
  say ""
  say "── Verifying $app"
  [[ -d "$app" ]] || { fail "no app at $app"; return; }
  [[ -d "$appex" ]] || { fail "extension not embedded at $appex"; return; }

  local want_id app_id ext_id
  want_id="$(xcconfig_value MACHINA_BUNDLE_ID)"
  app_id="$($pb -c 'Print :CFBundleIdentifier' "$info")"
  ext_id="$($pb -c 'Print :CFBundleIdentifier' "$xinfo")"
  [[ "$app_id" == "$want_id" ]] && ok "app bundle id $app_id" || fail "app bundle id $app_id, expected $want_id"
  [[ "$ext_id" == "$want_id.extension" ]] && ok "extension bundle id $ext_id" || fail "extension bundle id $ext_id, expected $want_id.extension"

  local point principal
  point="$($pb -c 'Print :NSExtension:NSExtensionPointIdentifier' "$xinfo" 2>/dev/null || true)"
  principal="$($pb -c 'Print :NSExtension:NSExtensionPrincipalClass' "$xinfo" 2>/dev/null || true)"
  [[ "$point" == "com.apple.Safari.web-extension" ]] && ok "extension point $point" || fail "extension point '$point'"
  [[ "$principal" == *".SafariWebExtensionHandler" ]] && ok "principal class $principal" || fail "principal class '$principal'"

  local v b xv xb minos cat name xname
  v="$($pb -c 'Print :CFBundleShortVersionString' "$info")"; b="$($pb -c 'Print :CFBundleVersion' "$info")"
  xv="$($pb -c 'Print :CFBundleShortVersionString' "$xinfo")"; xb="$($pb -c 'Print :CFBundleVersion' "$xinfo")"
  [[ "$v/$b" == "$xv/$xb" ]] && ok "version $v ($b), app and extension agree" || fail "app $v ($b) vs extension $xv ($xb): App Store rejects a mismatch"
  minos="$($pb -c 'Print :LSMinimumSystemVersion' "$info")"; ok "minimum macOS $minos"
  cat="$($pb -c 'Print :LSApplicationCategoryType' "$info" 2>/dev/null || true)"
  [[ -n "$cat" ]] && ok "category $cat" || fail "LSApplicationCategoryType missing (App Store requires it)"
  name="$($pb -c 'Print :CFBundleDisplayName' "$info")"; xname="$($pb -c 'Print :CFBundleDisplayName' "$xinfo")"
  ok "display names: app '$name', extension '$xname'"
  [[ "$($pb -c 'Print :ITSAppUsesNonExemptEncryption' "$info" 2>/dev/null)" == "false" ]] \
    && ok "ITSAppUsesNonExemptEncryption = NO (no export-compliance prompt)" || fail "ITSAppUsesNonExemptEncryption not set"

  # Entitlements: App Sandbox is mandatory for the Mac App Store, on both.
  local target ent
  for target in "$app" "$appex"; do
    ent="$(codesign -d --entitlements :- "$target" 2>/dev/null || true)"
    if grep -q "com.apple.security.app-sandbox" <<<"$ent"; then
      ok "app-sandbox entitlement: $(basename "$target")"
    else
      fail "app-sandbox entitlement missing: $(basename "$target")"
    fi
    if grep -q "com.apple.security.get-task-allow" <<<"$ent"; then
      say "note  get-task-allow present on $(basename "$target") (normal for local signing; App Store export strips it)"
    fi
  done
  codesign --verify --deep --strict "$app" 2>/dev/null && ok "signature valid (codesign --verify --deep --strict)" || fail "signature does not verify"
  local authority
  authority="$(codesign -dv "$app" 2>&1 | sed -n 's/^Authority=//p' | head -1 || true)"
  ok "signed by: ${authority:-ad-hoc (no identity)}"
  ok "architectures: $(lipo -archs "$app/Contents/MacOS/${APP_NAME%.app}")"

  # Icons: every rendition a Mac app icon needs (16 through 1024 px), read
  # from the compiled asset catalog, which is what macOS and the App Store use
  # (the .icns beside it is a partial fallback, so it is not the thing to count).
  local car="$app/Contents/Resources/Assets.car" icons
  if [[ -f "$car" ]]; then
    icons="$(xcrun assetutil --info "$car" 2>/dev/null | /usr/bin/python3 -c '
import json, sys
d = json.load(sys.stdin)
px = sorted({r.get("PixelWidth") for r in d
             if r.get("Name") == "AppIcon" and str(r.get("RenditionName", "")).startswith("icon_")})
print(" ".join(str(p) for p in px))')"
    if [[ "$icons" == "16 32 64 128 256 512 1024" ]]; then
      ok "app icon renditions (px): $icons"
    else
      fail "app icon renditions incomplete: '$icons' (want 16 32 64 128 256 512 1024)"
    fi
  else
    fail "no Assets.car (app icon) in the app"
  fi
  [[ -f "$app/Contents/Resources/AppIcon.icns" ]] && ok "AppIcon.icns fallback present" || fail "AppIcon.icns missing"

  # The shared extension really is inside, with the Safari toolbar overlay.
  local res="$appex/Contents/Resources" mv sv
  [[ -f "$res/manifest.json" ]] && ok "manifest.json bundled" || fail "manifest.json missing from the extension"
  for f in background.js popup.html popup.js popup.css; do
    [[ -f "$res/$f" ]] || fail "$f missing from the extension"
  done
  if grep -q '"safari-toolbar/toolbar-16.png"' "$res/manifest.json" && [[ -f "$res/safari-toolbar/toolbar-32.png" ]]; then
    ok "Safari toolbar glyph wired into action.default_icon"
  else
    fail "Safari toolbar overlay not applied"
  fi
  if ls "$res" | grep -qiE '\.md$|\.test\.'; then fail "docs/tests leaked into the bundle"; else ok "no docs or tests in the bundle"; fi
  mv="$(/usr/bin/sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$res/manifest.json" | head -1)"
  sv="$(/usr/bin/sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/extension/manifest.json" | head -1)"
  [[ "$mv" == "$sv" ]] && ok "bundled extension is the current /extension (v$mv)" || fail "bundled extension v$mv but /extension is v$sv: rebuild"
  say "info  App Store version $v vs extension manifest version $mv (independent on purpose; see Config/Base.xcconfig)"
}

build() {
  local mode="$1"; shift
  local -a signing
  if [[ "$mode" == "dev" ]]; then
    signing=(CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Development" "DEVELOPMENT_TEAM=$TEAM_ID" PROVISIONING_PROFILE_SPECIFIER=)
  else
    signing=(CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=-" DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER=)
  fi
  say "→ xcodebuild ($mode signing, Release)"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=macOS' \
    -derivedDataPath "$DERIVED" \
    "${signing[@]}" \
    build | grep -E '^\*\*|error:|Machina:' || true
  local app="$DERIVED/Build/Products/Release/$APP_NAME"
  [[ -d "$app" ]] || { say "✗ build failed; rerun xcodebuild without the filter for details"; exit 1; }
  verify_app "$app"
  say ""
  if [[ "$FAILED" -ne 0 ]]; then say "✗ Built, but verification failed (see FAIL lines)."; exit 1; fi
  say "✓ $app"
  say "  Open it:  open \"$app\""
  [[ "$mode" == "adhoc" ]] && say "  Ad-hoc signed: Safari needs Develop > Allow Unsigned Extensions to load it."
  return 0
}

archive() {
  local archive="$OUT/MachinaSafari.xcarchive" export_dir="$OUT/export"
  say "→ Archiving (automatic signing, team $TEAM_ID). Needs the owner's Apple account in Xcode > Settings > Accounts."
  rm -rf "$archive" "$export_dir"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=macOS' \
    -archivePath "$archive" \
    -allowProvisioningUpdates \
    archive
  verify_app "$archive/Products/Applications/$APP_NAME"
  cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST
  xcodebuild -exportArchive -archivePath "$archive" -exportPath "$export_dir" \
    -exportOptionsPlist "$OUT/ExportOptions.plist" -allowProvisioningUpdates
  say ""
  say "✓ Exported: $(ls "$export_dir"/*.pkg 2>/dev/null || echo "$export_dir")"
  say "  Nothing was uploaded. To ship: Xcode > Window > Organizer > Distribute App,"
  say "  or drag the .pkg into Transporter. See safari/store/LISTING.md, owner checklist."
}

lint() {
  local tmp; tmp="$(mktemp -d)"
  say "→ Asking Apple's converter about extension/manifest.json (throwaway project in $tmp)"
  xcrun safari-web-extension-converter "$ROOT/extension" --project-location "$tmp" \
    --app-name MachinaLint --bundle-identifier com.morhogeg.machina.lint \
    --macos-only --no-open --no-prompt --force 2>&1 | sed -n '/Warning/,$p'
  rm -rf "$tmp"
  say "(No warning above = every key is supported. Known and harmless today: notifications, open_in_tab.)"
}

case "${1:-}" in
  "")        build adhoc ;;
  --dev)     build dev ;;
  --archive) archive ;;
  --lint)    lint ;;
  --verify)  verify_app "${2:?usage: --verify path/to/App.app}"; [[ "$FAILED" -eq 0 ]] || exit 1 ;;
  -h|--help) sed -n '2,27p' "$0" ;;
  *)         say "unknown option: $1 (try --help)"; exit 2 ;;
esac
