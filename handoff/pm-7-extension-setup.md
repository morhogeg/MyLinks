# PM-7 handoff: the browser extension is set up from Settings

Branch: `claude/pm-7-extension-setup`. Nothing merged, nothing deployed, no PR.

## The gap this closes

The extension asks for an ingest token in its popup and **nothing in the app ever
showed that token**, so the desktop capture surface was unreachable for a normal
user even though first-run onboarding tells desktop users to add the extension as
step 1. There is now a Settings screen that hands over the token and the install
steps, and the extension's own copy points back at it by name.

No backend change. The token is the same one the iOS Share Extension uses, fetched
through the existing `fetchShareConfig` path (`get_share_config` callable on web,
`get_share_config_http` on native), which mints one on first use. `functions/` was
not touched.

## What was built

### 1. Settings row (`web/components/settings/MainView.tsx`)

One row added, in the **"Your library"** group, directly under Insights:

- title `Browser extension`, `Puzzle` tile icon, chevron, `go('extension')`.
- On native only, a sub-line: `One-click saving in a desktop browser`.

**Why "Your library" and not a new group.** It is the group about what goes into
and comes out of the library, and Insights already lives there. "Advanced" would
bury a setup step that first-run onboarding depends on, "Your data" is about
export/backup (and PM-2 is adding Import there), and a new one-row group would add
a header for a single row. No groups were reordered and nothing else in the file
was changed.

### 2. `web/components/settings/ExtensionView.tsx` (new, owned by this session)

Sub-screen on the existing settings stack, so it inherits the same back/Done
chrome as Insights and Reminders & Digest. Sections:

- **Intro:** "Save any page from your desktop browser in one click." plus "It
  works in Chrome, Edge, Brave, and Safari." (native reads "Set it up on your
  computer, in Chrome, Edge, Brave, or Safari.").
- **Get the extension:** a 4-step in-app list for loading unpacked (put the
  `extension` folder on your computer, open `chrome://extensions`, Developer mode,
  Load unpacked, pin it), with the honest footnote that Machina is not in the
  Chrome Web Store yet (§4 P3 item 24), that Edge and Brave are the same, and that
  Safari needs a one time Xcode build documented in `safari/README.md`. In-app
  steps rather than a link because the repo is not something a user can open.
- **Your token:** masked by default (a fixed 32-bullet mask, not the real length),
  with `Reveal`/`Hide` and `Copy` buttons, and the warning "Anything saved with
  this token lands in this account, so keep it to yourself."
- **Where to paste it:** two steps, click the toolbar icon, paste, `Save and
  connect`, wait for `Connected`. Footnote gives the click and keyboard shortcut.
- **States:** signed out ("Sign in to see your token."), loading ("Loading your
  token…"), and error ("Could not load your token." with a "Try again" button that
  refetches). No fake success anywhere.
- **Backend URL escape hatch:** if the server's endpoint origin ever stops being
  `https://secondbrain-app-94da2.web.app` (what `extension/popup.js` falls back
  to), an extra footnote tells the user to set the extension's Backend URL to the
  origin the server returned. Today they match, so nothing renders.

Theme tokens only (`text-text`, `text-text-secondary`, `text-text-muted`,
`bg-card`, `bg-card-hover`, `bg-tile`/`text-tile-ink`, `border-border-subtle`), so
light and dark both come from the token set. No em dashes.

### 3. Extension copy and UX (`extension/`)

- Every remaining **"Machina AI"** is gone (`popup.js` banner x2, `background.js`
  header comment). Manifest name `Machina — one-click save` became
  `Machina: one-click save` (em dash, and it is a store-facing string).
- Paste screen: banner "Paste your Machina token to start saving.", field
  placeholder "Paste your Machina token", hint "Find it in Machina: Settings, then
  Browser extension."
- **The token is now validated, not just stored.** The two buttons "Save settings"
  and "Test connection" collapsed into one primary **"Save and connect"**, and a
  connection chip (dot + one line) sits under the header: `Checking…` →
  `Connected`, or the reason it failed. It runs on every popup open with a stored
  token and after every save, so the popup can no longer look saved and fail
  later. Enter in the token field does the same thing.
- The validation call is the existing `validateToken()` in `background.js`: a POST
  to `/api/share` with an empty body. `share_ingest` checks the token before it
  looks for a URL or text, so a good token returns 400 and a bad one 401/403;
  nothing is saved and no save quota is spent (verified by reading
  `functions/main.py`, the 400 branch is "No URL or text found in shared
  content"). It does consume one slot of that endpoint's per-token rate-limit
  bucket, so a **429 branch** was added: "Too many requests. Try again in a
  minute." Badge and notification behavior is unchanged.
- All em dashes removed from the extension, including comments and the README, so
  the rule is checkable with a plain grep.
- Popup banner lost its leftover violet tint (pre-Lumen accent) for the neutral
  card color the rest of the popup uses. The now-unused `.secondary` button style
  was deleted.
- `extension/README.md` rewritten for the above: honest "not in the Web Store"
  install section, the token section now starts at Settings → Browser extension,
  "Save and connect" replaces "Save settings + Test connection".

### 4. Not done, on purpose

- **No token rotation and no Keychain work** (§4 item 12). The backend has no
  rotation endpoint (`ensure_ingest_token` only mints on first use), so there was
  nothing to expose.
- **No account hint next to "Connected".** No endpoint accepts an ingest token and
  returns anything about the account, and adding one would be a new disclosure
  path and a backend change. The chip says "Connected" and nothing it cannot
  prove.

## Files

Owned by this session:

- `web/components/settings/ExtensionView.tsx` (new)
- `extension/popup.html`, `extension/popup.js`, `extension/popup.css`,
  `extension/background.js`, `extension/manifest.json`, `extension/README.md`
- `extension/popup.test.mjs` (new, see Verification)

Shared files, minimal edits other sessions must know about:

| File | Edit |
|---|---|
| `web/components/settings/MainView.tsx` | One `NavRow` added inside the existing "Your library" `List`, plus `Puzzle` in the lucide import. No reordering. |
| `web/components/settings/types.ts` | `'extension'` appended to the `View` union. |
| `web/components/SettingsModal.tsx` | Import of `ExtensionView`, `extension: 'Browser extension'` in `VIEW_TITLE`, and one render branch after the `story` branch. |
| `web/components/settings/primitives.tsx` | `NavRow` gained an optional `sub?: string`, forwarded to the existing `RowText` `sub`. Additive, every existing call site is unchanged. |
| `web/lib/share.ts` | `copyToClipboard` changed from private to `export` (it already had the WKWebView `execCommand` fallback). One word. |
| `safari/README.md` | "Set your token" now says Save and connect, and points at Settings → Browser extension. |

`functions/` and `SOURCE_OF_TRUTH.md` were not touched.

## Verified

- `cd web && npx tsc --noEmit` → exit 0.
- `node web/scripts/check-em-dash.mjs` → clean.
- `npx eslint` on every touched web file → clean. `SettingsModal.tsx` has **two
  pre-existing** `react-hooks/set-state-in-effect` errors on lines this change
  does not touch; confirmed present on `origin/main` by stashing and re-running.
- `node extension/popup.test.mjs` → 26 checks pass. It stubs the DOM and
  `chrome.storage`/`chrome.runtime`, seeds element ids from `popup.html` (so a
  renamed id fails loudly), and drives the real handlers: first-run copy, empty
  save refused, trimmed token stored, validation ran, chip shows Connected,
  re-validation on reopen, a rejected token showing its reason, reveal toggle,
  duplicate/bad-url/403 save paths, Enter as submit, and no em dashes in any
  extension file.
- `node --check` on both extension scripts, and `manifest.json` parses.

## NOT verified (no device, no browser, no signed-in session here)

- **The Settings screen has never been rendered.** No visual check in light or
  dark, no RTL pass, no phone or desktop layout check.
- **The token has never been fetched.** `fetchShareConfig` on the web path
  (`get_share_config` callable) was read, not run. If that callable fails for a
  signed-in web user, this screen shows its error state and the "Try again"
  button, which is the honest outcome, but the happy path is unproven.
- **The extension was never loaded in a browser.** Chrome is not installable here,
  so the popup was exercised only through the node harness above. The connection
  chip, the disabled state on the primary button, and the new CSS have not been
  seen on screen.
- **The 400-means-valid contract was read from `functions/main.py`, not called.**
  It is unchanged from the behavior the previous "Test connection" button relied
  on, so this is not new risk, just unproven here.
- Safari: the converter was not re-run.

## Owner steps

1. Open Settings → Your library → Browser extension on desktop web and on the
   phone build. Check both themes, and that the token loads, reveals, and copies.
2. Load `extension/` unpacked in Chrome, paste the token, confirm the chip reads
   Connected, then save a page and confirm the card lands.
3. If the Chrome Web Store listing ever ships (§4 P3 item 24), the "Get the
   extension" section in `ExtensionView.tsx` and the install section of
   `extension/README.md` become a store link, and `extension/popup.test.mjs`
   should be dropped from the packaged folder.

## For the supervisor

- **One line left deliberately unedited.** `web/components/Onboarding.tsx` line 90
  (desktop step 1) still reads "Get the Machina extension for Chrome, Edge, or
  Brave. It lives right in your toolbar." with no route to it. Whoever owns
  onboarding copy should close the loop, suggested: "Get the Machina extension for
  Chrome, Edge, or Brave. Settings, then Browser extension, has the steps and your
  token." Not changed here because onboarding is another session's file.
- If another session also adds an optional prop to `NavRow` or exports
  `copyToClipboard`, those are the two likely conflicts and both resolve by
  keeping either side.
- `SOURCE_OF_TRUTH.md` still needs a §4 / §9 entry for this work. Not written
  here, per the ground rules.
