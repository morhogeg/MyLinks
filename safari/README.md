# Machina for Safari

Safari runs the **same** Web Extension code as Chrome (everything under
[`/extension`](../extension)). Safari only accepts extensions that ship inside a
Mac app, so this folder holds that app: **Machina for Safari**, a small window
that says what the extension does, shows whether it is on, and opens Safari's
extension settings. All capture happens in the extension.

`/extension` stays the single source of truth. Nothing under it is copied into
git here; the Xcode build copies it into the extension each time it builds.

## Distribution

**Target: the Mac App Store, as its own app record ("Machina for Safari",
bundle id `com.morhogeg.machina.safari`).** Why:

- It is the only route where a user installs with one click and Safari loads the
  extension with no developer settings. A locally built copy needs Develop >
  Allow Unsigned Extensions, which resets on every Safari restart.
- A **separate** record, not a universal purchase with the iOS app: universal
  purchase requires the Mac app to reuse `com.morhogeg.machina`, which would put
  this extension shell on the iPhone app's listing and make every Mac release a
  version of the iOS record, under the same review. Apple does not let you undo
  universal purchase later. The iOS app's review and its fragile CI signing stay
  untouched this way.
- Alternative kept in reserve: Developer ID + notarization for a direct download
  from mymachina.app. Same project, different export method; no review, but no
  App Store discovery or auto-updates. Not set up.

The iOS/iPadOS Safari extension is a separate decision; see
[iOS plan](#ios-and-ipados-plan-not-built-awaiting-owner-approval) below.

## Layout

| Path | What |
|---|---|
| `MachinaSafari.xcodeproj` | Committed project: app target `MachinaSafari`, extension target `MachinaSafariExtension`, shared scheme `MachinaSafari`. |
| `Config/Base.xcconfig` | Team, bundle id, version, build number, minimum macOS. The only file to edit for a release. |
| `App/` | SwiftUI containing app (`ContentView` is the whole UI; light and dark from system colors), icon set, sandbox entitlements. |
| `Extension/` | Safari's required native handler (answers nothing; the shared code uses no native messaging), sandbox entitlements, and `sync-resources.sh`, the build phase that copies `/extension` in. |
| `Extension/Overrides/safari-toolbar/` | The one Safari-only asset: a monochrome toolbar glyph (see below). |
| `tools/make-icons.swift` | Regenerates the app icon set and the toolbar glyph from the iOS app's artwork. Output is committed. |
| `tools/render-app-window.swift` | Renders the app window (light and dark) from the real `ContentView`, for review and listing material. |
| `store/` | Mac App Store listing, privacy answers, review notes, owner checklist. |
| `build-safari.sh` | Build, verify, lint, archive. |

### Why a committed project and not the converter

`build-safari.sh` used to regenerate a project with
`xcrun safari-web-extension-converter` on every run. That output is not
reproducible: it changes with the Xcode version, and on Xcode 26.1.1 it was
wrong in ways that block an App Store build:

- it derived the app's bundle id as `com.morhogeg.machina.Machina` while giving
  the extension `com.morhogeg.machina.safari.Extension`, which is not a prefix of
  the app's id, so Xcode refuses to embed it;
- it pasted the 128 px extension icon into a white squircle as the app icon,
  blurry at every size above 128;
- its native handler logs every message it receives to the system log;
- it copies `README.md` and `popup.test.mjs` into the shipped extension;
- its deployment target was macOS 26.1, which excludes most Macs.

A committed project fixes each of those once, shows every setting in a diff, and
builds the same on any Mac or CI runner. The converter still has one job:
`./safari/build-safari.sh --lint` asks it which manifest keys Safari ignores,
as a canary for changes the Chrome build makes to `/extension`.

### The Safari overlay (the only difference from Chrome)

`Extension/sync-resources.sh` copies `/extension` into the extension (minus
`*.md` and tests), then rewrites **one key in the bundled copy** of
`manifest.json`: `action.default_icon` points at `safari-toolbar/toolbar-*.png`,
a black-on-transparent mark. Safari treats a monochrome toolbar icon like its own
buttons (tinted, correct in light and dark) and shows a full-color icon dimmed on
sites the extension has no access to; the shared icon is a dark full-color tile,
which reads as a grey blob in Safari's toolbar. The shared `manifest.json` on
disk is never modified. The script then fails the build if any file the
manifest references is missing from the bundle.

## Build

Requires Xcode 26 (verified with 26.1.1). From the repo root:

```sh
./safari/build-safari.sh           # Release, ad-hoc signed, then verified
./safari/build-safari.sh --dev     # signed "Apple Development" (team 8Y2M94RUHG)
./safari/build-safari.sh --lint    # which manifest keys Safari ignores
./safari/build-safari.sh --verify path/to/Machina\ for\ Safari.app
./safari/build-safari.sh --archive # OWNER: App Store archive + .pkg, never uploads
```

Output lands in `safari/build/` (gitignored). The verify step checks, on the
built bundle: both bundle ids, the extension point and principal class, version
and build agree between app and extension, minimum macOS, category, display
names, the export-compliance key, the App Sandbox entitlement on both, a valid
signature, both architectures, all seven icon resolutions (16 to 1024 px), that
the bundled extension is the current `/extension`, the toolbar overlay, and that
no docs or tests shipped.

`--dev` signs with the Apple Development certificate in this Mac's keychain.
The first time, macOS asks whether `codesign` may use the key: choose **Always
Allow**. (An unattended run blocks on that prompt.)

You can also open the project in Xcode and press Run; set the team under
Signing & Capabilities if Xcode asks.

## Turn it on in Safari (local builds)

1. Run the app once (it registers the extension with macOS).
2. **Ad-hoc build only:** Safari > Settings > Advanced > "Show features for web
   developers", then Develop > Allow Unsigned Extensions (resets each restart).
   A `--dev` or App Store build skips this.
3. Safari > Settings > Extensions > tick **Machina** (the app's button does this).
4. Click the Machina toolbar button: with no token yet it opens the settings tab.
   Paste the token from Machina (Settings, then Browser extension) and click
   **Save and connect**.

## Safari differences (vs Chrome)

| Feature | Safari |
|---|---|
| Toolbar click saves the current tab | Yes (`action.onClicked`, Safari 15.4+). |
| Context menu "Save to Machina" (link, selection, page) and "Machina settings…" on the toolbar button | Yes (macOS only; `contexts: ["action"]` needs 15.4+). |
| Keyboard shortcut `⌘⇧S` | Yes. Safari 26 shows it in the menu bar and lets users rebind it in Safari Settings. |
| Settings page | Always opens as a **tab** (`open_in_tab: false` is ignored). |
| Badge text ✓ / ✗ | Yes, but **`setBadgeBackgroundColor` has no effect** in Safari, so success and failure differ only by the glyph. |
| System notification after a save | **No.** Safari has no `notifications` API; the code already wraps every call in try/catch, so it degrades to the badge alone. |
| Website access | Never granted at install. Safari asks per site the first time the extension needs one. See the shared-code list for what that changes. |
| Real-time appearance in the Machina app | Yes (Firestore sync, unchanged). |

Minimum macOS 14 means Safari 17 or later everywhere, which covers every API
the shared code uses (MV3 service worker 15.4, `storage.session` 16.4).

### Changes requested outside `safari/` (owned by other sessions)

`safari/` never edits `/extension`, `functions/` or `web/`. These are the
changes the Safari build needs from them; IDs are referenced from
`store/LISTING.md`.

- **B1 (backend, release blocker):** `share_ingest` CORS must accept extension
  origins (`safari-web-extension://<uuid>`, `chrome-extension://<id>`), reflected
  only on `/api/share`. Safari grants no host permission at install, so until
  the user allows `secondbrain-app-94da2.web.app` the save is a plain
  cross-origin request, and the extension's origin is a random per-install id
  that cannot be allowlisted one by one. The token stays the only credential.
- **A1 (`background.js`):** a Safari confirmation. With no `notifications` API
  and no badge color, a save shows only a two-second ✓ or ✗. Feature-detect
  `chrome.notifications`; when missing, show a small in-page toast through
  `chrome.scripting.executeScript` on the active tab (the click already grants
  `activeTab`; needs the `scripting` permission, which adds no Chrome install
  warning).
- **A2 (`background.js`):** the "settings" and "upgrade" actions live on
  notification clicks, which Safari never fires. Without notifications, put the
  action in the A1 toast, or open the settings page with the message.
- **A3 (`popup.css`):** Safari always opens the settings page as a full tab, so
  the fixed 320 px `.wrap` sits in the top-left corner. Center it and allow a
  wider column on wide viewports.
- **A4 (`background.js`):** in Safari `tab.url` and `tab.title` are empty
  strings on sites the extension has no access to. Today that ends in a silent
  ✗; say "allow Machina on this website" instead (via A1).
- **A5 (`background.js`, only for the iOS plan):** guard
  `chrome.contextMenus` and `chrome.commands`; iOS Safari has neither and the
  top-level `addListener` calls would kill the service worker.
- **A6 (connect from the web app):** Safari supports `externally_connectable`
  (15.4+, `matches` only, https only), but the page must call
  `browser.runtime.sendMessage("com.morhogeg.machina.safari.extension (8Y2M94RUHG)", ...)`,
  a different id from Chrome's, and only after the user has allowed the
  extension on that site. A content script on `https://mymachina.app/*` doing a
  `window.postMessage` handshake (check `event.origin` and `event.source`)
  works the same in both browsers with no id. Either way Safari needs one site
  grant first, so the web page should say how when the extension does not answer.
- **C1 (`web/components/settings/ExtensionView.tsx`):** replace "Safari needs a
  one time build in Xcode" with the Mac App Store link once the listing is live.
- **C2 (web):** a deep link to Settings > Browser extension (for example
  `?settings=extension`), so the app's "Get your token" button lands on the token
  instead of the home page (`App/MachinaSafariApp.swift`, `Links.web`).

No change needed: keep `notifications` and `open_in_tab` in the manifest (Safari
ignores them, Chrome uses them), and do not add `background.scripts` (Safari
would then prefer it over the service worker).

## Releasing

Everything an owner does (App Store Connect record, capabilities, archive and
upload, TestFlight for Mac, listing copy, privacy answers, review notes) is in
[`store/LISTING.md`](store/LISTING.md). CI: `.github/workflows/mac-app-store.yml`,
manual dispatch only.

## iOS and iPadOS plan (not built, awaiting owner approval)

**Recommendation: defer until after the iOS launch.** On iPhone, Safari capture
already works through the Share Extension in two taps; a Safari Web Extension
adds a one-tap toolbar save and selection capture, which is a modest gain,
while it touches the iOS signing pipeline that has broken twice before (build
1018's lost App Group, the certificate cap). Nothing below has been changed.

**What it would be.** A third target in `web/ios/App/App.xcodeproj`:
`SafariExt`, bundle id `com.morhogeg.machina.SafariExt`, product type Safari
Web Extension, embedded in the App target, built from the same `/extension`
through a copy phase like `safari/Extension/sync-resources.sh`.

**Token, with no paste.** The iOS app already keeps the ingest token in the
shared Keychain (`KeychainStore.swift`, access group = the App Group
`group.com.morhogeg.machina`). Compile `KeychainStore.swift` into `SafariExt`
too and give it the same App Group entitlement. Its
`SafariWebExtensionHandler` answers one native message, `get-token`, with the
token and the allowlisted endpoint (`ShareEndpointPolicy`). The extension asks
for it with `browser.runtime.sendNativeMessage` when `storage.local` has no
token. Result: sign in to the iPhone app once and the Safari extension works.
The `nativeMessaging` permission would be added by the Safari overlay only, so
Chrome's permission prompt does not change.

**Shared-code prerequisites (Chrome session).** iOS Safari has no
`contextMenus`, no keyboard `commands`, and no `notifications`.
`background.js` registers `chrome.contextMenus.onClicked` and
`chrome.commands.onCommand` at the top level, so on iOS the whole service
worker would throw on load. Those must be feature-detected first.

**Entitlements and signing.**
- `SafariExt.entitlements`: `com.apple.security.application-groups` =
  `group.com.morhogeg.machina` (nothing else).
- `PrivacyInfo.xcprivacy` for the new target (same pattern as ShareExt), wired
  into a Resources phase.
- `MARKETING_VERSION` must equal the app's (1.0); CI's `CURRENT_PROJECT_VERSION`
  override already applies to every target.
- No new certificate: the persistent `.p12` covers it. Profiles are uncapped.

**CI changes (`ios-testflight.yml`).** Add
`Payload/App.app/PlugIns/SafariExt.appex` to the entitlement tripwire loop, so a
build without the App Group on the new extension fails before upload, the
same guard that now protects ShareExt.

**Order of operations.**
1. Chrome session lands the feature-detection guards in `/extension`; Chrome is
   re-verified unchanged.
2. Owner, developer portal: register `com.morhogeg.machina.SafariExt`, enable
   App Groups, assign `group.com.morhogeg.machina`. Doing this by hand first
   avoids depending on cloud signing to attach a group to a brand-new App ID
   mid-archive.
3. One PR: the new target, handler, entitlements, privacy manifest, copy phase,
   **and** the tripwire line, together, so the first build is already checked.
4. Simulator build locally, then one TestFlight build via the trigger branch.
5. Device QA: turn the extension on in Settings > Apps > Safari > Extensions;
   save from Safari with no paste; then the **Share Extension regression pass**
   (share from Safari before opening the app, Reset token, sign out), since a
   project-file change is exactly how the App Group was lost once.
6. Rollback: revert the PR; build numbers just keep climbing.

**Risks, ranked.** (1) A project-file edit drops the ShareExt App Group: guarded
by the existing tripwire plus step 5. (2) Cloud signing fails to provision the
new App ID: avoided by step 2. (3) App Review asks for the extension to be
disclosed in the listing (Guideline 4.4), which collides with the owner rule
that the iOS description never mentions browser extensions: owner decision.
(4) iOS Safari service-worker lifetime bugs (iOS 17.4 to 17.6 killed workers
after about 30 s): test on the oldest supported iOS.
