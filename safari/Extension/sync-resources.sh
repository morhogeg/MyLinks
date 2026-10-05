#!/bin/sh
#
# Xcode build phase ("Copy shared /extension"): copies the shared extension
# source into the .appex's Resources, so Safari runs exactly the code Chrome
# runs. /extension stays the single source of truth; nothing is copied into
# git under safari/.
#
# Copies everything except docs and tests, so a file the Chrome build adds
# later (a content script, a new icon) ships with no project change. Then
# checks that every file manifest.json points at is really in the bundle, so a
# rename in /extension fails the build here instead of failing silently in
# Safari.
set -eu

SRC="${SRCROOT}/../extension"
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"

if [ ! -f "${SRC}/manifest.json" ]; then
  echo "error: shared extension not found at ${SRC} (expected manifest.json)"
  exit 1
fi

mkdir -p "${DEST}"
/usr/bin/rsync -a --delete \
  --exclude '.DS_Store' \
  --exclude '*.md' \
  --exclude '*.test.*' \
  --exclude 'node_modules' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  "${SRC}/" "${DEST}/"

# The one Safari-only difference: the toolbar glyph (see
# safari/tools/make-icons.swift for why). Copied next to the shared files and
# wired in below; the shared manifest on disk is never touched.
/usr/bin/rsync -a "${SRCROOT}/Extension/Overrides/safari-toolbar" "${DEST}/"

xcrun python3 - "${DEST}" <<'PY'
import json, os, sys

dest = sys.argv[1]
path = os.path.join(dest, "manifest.json")
try:
    with open(path, encoding="utf-8") as f:
        m = json.load(f)
except Exception as e:  # noqa: BLE001
    print(f"error: extension/manifest.json is not valid JSON: {e}")
    sys.exit(1)

# Safari overlay: monochrome toolbar icon (Safari tints it like its own
# buttons). Only action.default_icon changes; "icons" (shown in Safari
# Settings > Extensions) stays the shared full-color tile.
action = m.setdefault("action", {})
action["default_icon"] = {str(px): f"safari-toolbar/toolbar-{px}.png" for px in (16, 19, 32, 38)}
with open(path, "w", encoding="utf-8") as f:
    json.dump(m, f, indent=2, ensure_ascii=False)
    f.write("\n")

refs = []
def icons(v):
    if isinstance(v, str):
        refs.append(v)
    elif isinstance(v, dict):
        refs.extend(x for x in v.values() if isinstance(x, str))

icons(m.get("icons"))
action = m.get("action") or {}
icons(action.get("default_icon"))
if action.get("default_popup"):
    refs.append(action["default_popup"])
bg = m.get("background") or {}
if bg.get("service_worker"):
    refs.append(bg["service_worker"])
refs.extend(bg.get("scripts") or [])
if bg.get("page"):
    refs.append(bg["page"])
opts = m.get("options_ui") or {}
if opts.get("page"):
    refs.append(opts["page"])
if m.get("options_page"):
    refs.append(m["options_page"])
for cs in m.get("content_scripts") or []:
    refs.extend(cs.get("js") or [])
    refs.extend(cs.get("css") or [])
for war in m.get("web_accessible_resources") or []:
    for r in (war.get("resources") or []) if isinstance(war, dict) else [war]:
        if "*" not in r:
            refs.append(r)

missing = sorted({r for r in refs if not os.path.isfile(os.path.join(dest, r.lstrip("/")))})
if missing:
    for r in missing:
        print(f"error: extension/manifest.json references '{r}', which is not in the bundle")
    sys.exit(1)
print(f"Machina: bundled shared extension v{m.get('version')} ({len(set(refs))} manifest references OK)")
PY
