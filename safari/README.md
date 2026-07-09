# Machina AI — Safari extension

Safari runs the **same** Web Extension code as Chrome (everything under
[`/extension`](../extension)). The only difference is packaging: Safari extensions
must be wrapped in a tiny native macOS app and built once in Xcode — there's no
"Load unpacked."

`/extension` stays the single source of truth. This folder just holds a script that
regenerates the Safari wrapper from it.

## Build it

1. **Generate the Xcode project** (run from the repo root):
   ```sh
   ./safari/build-safari.sh
   ```
   This writes a fresh project to `safari/build/` (gitignored). Re-run it any time
   you change something under `/extension`.

2. **Open & build in Xcode:**
   ```sh
   open "safari/build/Machina Capture/Machina Capture.xcodeproj"
   ```
   - Select the **Machina Capture** scheme → **Product ▸ Run** (▶). For a local build with
     no paid developer account, set the app target's **Signing & Capabilities ▸
     Team** to your personal Apple ID (or "Sign to Run Locally"). Do the same for
     the **Machina Capture Extension** target.
   - The wrapper app launches with a "turn it on in Safari" message — you can quit it.

## Enable it in Safari

1. Safari ▸ **Settings… ▸ Advanced** → check **"Show features for web developers"**.
2. The new **Develop** menu → enable **"Allow Unsigned Extensions"** (needed for a
   locally-built, unsigned extension; you may need to re-enable it after each restart).
3. Safari ▸ **Settings… ▸ Extensions** → turn on **Machina Capture**.
4. Click the Machina Capture toolbar button → Safari will ask for permission to access
   websites. Grant access (at least to `secondbrain-app-94da2.web.app`, or
   **Always Allow on Every Website** for one-click saving anywhere).

## Set your token

Same as Chrome: open the extension's settings (toolbar menu → it opens the settings
page), paste your **ingest token**, **Save settings**, then **Test connection**.
See [`../extension/README.md`](../extension/README.md) for where to find the token.

## Safari differences (vs Chrome)

| Feature | Safari |
|---|---|
| Toolbar click → save current tab | ✅ |
| Context menu "Save to Machina" (link / selection / page) | ✅ |
| Keyboard shortcut (`⌘⇧S`) | ✅ (Safari 16.4+) |
| Settings popup | ✅ — opens as a **tab** (Safari ignores `open_in_tab:false`) |
| ✓ / ✗ toolbar **badge** | ✅ |
| **System notification** confirmation | ❌ not supported by Safari Web Extensions — the save still happens and the badge confirms it; the card appears in the app as usual |
| Real-time appearance in the Machina AI app | ✅ (Firestore sync — unchanged) |

The converter prints a warning about the `notifications` and `open_in_tab` manifest
keys for this reason — both degrade gracefully, so no code changes are needed.

## Notes

- The generated `safari/build/` project is **not committed** — regenerate it with the
  script. This keeps the Safari build from drifting out of sync with `/extension`.
- Distributing via the Mac App Store (so others can install without Xcode) is a
  later, optional step and requires a paid Apple Developer account.
