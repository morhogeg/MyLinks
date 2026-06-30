# Native iOS Share Extension — "Save to Machina"

Share **any link, text, or image** from any app's share sheet straight into
Machina. The item is sent to the backend, AI-analyzed, and shows up as a card —
no Shortcut required. (The old [Shortcut](SHORTCUT_SETUP.md) still works; this
replaces it with a first-class share target.)

## How it works

```
Share sheet ──▶ ShareExt (separate process)
                   │  reads endpoint + ingest token from the App Group
                   ▼
            POST /api/share  (X-Ingest-Token)   ── share_ingest (Cloud Function)
                   │                                   │ link/text → queue url
                   │                                   │ image    → store + queue (isImage)
                   ▼                                   ▼
            "Saved to Machina ✓"            process_link_background → card in feed
```

### Pieces

| Concern | File |
| --- | --- |
| Share UI + upload | `web/ios/App/ShareExt/ShareViewController.swift` |
| Extension manifest (activation rules, principal class) | `web/ios/App/ShareExt/Info.plist` |
| Extension App Group entitlement | `web/ios/App/ShareExt/ShareExt.entitlements` |
| Main-app App Group entitlement | `web/ios/App/App/App.entitlements` |
| Token bridge (WebView → App Group) | `web/ios/App/App/ShareConfigPlugin.swift` |
| JS side of the bridge | `web/lib/shareConfig.ts` (called from `web/components/AuthProvider.tsx`) |
| Backend image support | `share_ingest` in `functions/main.py` |

### The App Group

The extension runs in its own process and can't see the WebView's Firebase
session, so it can't fetch its own ingest token. Instead:

1. On login the web app calls the existing `get_share_config` callable → gets
   `{ endpoint, token }`.
2. `shareConfig.ts` passes them to the native `ShareConfig.save(...)` plugin.
3. The plugin writes them into `UserDefaults(suiteName: "group.com.morhogeg.machina")`.
4. The extension reads them from the same App Group when it runs.

App Group id (must match in all four places — both entitlements, the plugin, and
the view controller): **`group.com.morhogeg.machina`**.

## Rebuilding

`./build-ios.sh` (root) builds the web bundle and runs `cap sync`. The Share
Extension target survives `cap sync` — it lives in the committed
`project.pbxproj`, not in anything Capacitor regenerates.

## One-time Xcode setup (signing only)

The target, entitlements, and embedding are already wired in `project.pbxproj`.
The only thing automatic-signing needs from you, the first time you archive:

1. `cd web && npx cap open ios`
2. Select the **App** target → Signing & Capabilities → confirm Team
   `8Y2M94RUHG`. The **App Group** capability should already be listed (from
   `App.entitlements`); if Xcode shows it needs to register the group, let it.
3. Select the **ShareExt** target → Signing & Capabilities → set the same Team.
   Confirm the App Group `group.com.morhogeg.machina` is checked.
4. Product → Archive → Distribute → TestFlight (same as always).

If App Group registration fails under automatic signing, add the group once at
developer.apple.com → Identifiers → App Groups, then let Xcode re-sign.

## Notes

- Links/text are **deduped** server-side (re-sharing the same URL is a no-op).
  Images are not deduped — each shared image makes a new card.
- Large images are re-encoded to JPEG (quality 0.8) in the extension before
  upload to keep the request small and fast.
- The extension has a hardcoded endpoint fallback
  (`https://secondbrain-app-94da2.web.app/api/share`) but always prefers the
  endpoint pushed into the App Group.
