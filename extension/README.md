# Machina browser extension

A small Manifest V3 extension that saves the current page, a right-clicked link,
or selected text into your Machina library. It is a **thin client**: it POSTs to
the `share_ingest` Cloud Function (`/api/share`), the same endpoint the iOS Share
Extension uses. The backend scrapes, analyzes, embeds and saves; the card then
appears in the app through real-time sync.

Plain HTML, CSS and JS. No build step, no dependencies. The same folder runs in
Chrome, Edge and Brave, and in Safari through the Mac app in
[`../safari`](../safari/README.md), which copies this folder into its bundle at
build time.

Store listing copy, permission justifications, data-use answers, the security
model and the owner's publishing checklist: [`store/LISTING.md`](store/LISTING.md).

## For people using Machina

1. Install it. Chrome, Edge and Brave: from the Chrome Web Store (Settings, then
   Browser extension in the app has the button once the listing is live; until
   then it says "Coming soon"). Safari: the Machina app from the Mac App Store
   (also "Coming soon" until it is listed).
2. Connect it. A new install opens Machina's connect page on its own; if you are
   signed in there, it connects in one click. You can also click the toolbar
   icon and choose **Connect to Machina**, or open
   `https://mymachina.app/?settings=extension` and click **Connect this browser**.
   In Safari, first allow Machina on mymachina.app (Safari Settings, Extensions,
   Machina).
3. Save. Click the icon on any page, or press `Ctrl+Shift+S` (`Command+Shift+S`
   on a Mac). Right click a link to save the link, or select text and right click
   to save the page with that quote.

No one-click connect available (another browser, a locked-down profile)? In the
extension, open Settings, choose **Use a token instead**, and paste the token
from Machina's Settings, Browser extension, Advanced.

## What you see

Opening the popup saves the page and shows the server's answer. Nothing says
"Saved" until the server says it has the page.

| Server answer | Popup |
|---|---|
| 200 queued | **Saved to Machina**. Machina is reading it now. |
| 200 `waiting: true` (past the monthly limit) | **Saved for later** with the server's message, plus **Get Pro** on the free plan. Not styled as an error. |
| 200 `duplicate: true` | **Already in your library** |
| 401 / 403 | **Reconnect Machina** with a Reconnect button |
| 429 quota body (older servers) | **Monthly limit reached**, "This page was not saved", Get Pro |
| 429 plain | **Too many saves**, try again |
| 400 / 413 | the server's reason, or "Too large to save" |
| 5xx | **Machina hit a problem**, Try again |
| no network | **You're offline** / **Couldn't reach Machina**, Try again |
| no answer in 20 s | **No answer from Machina**. It may still have saved; check your library. |
| 200 the extension doesn't understand | **Not sure it saved**. Check your library. |
| browser page, local file, another extension's page | **Can't save this page**, with the reason. Nothing is sent. |
| Safari with no access to the page | **Allow Machina on this website**, with where to do that |

Right-click saves, and a popup closed before the answer came back, report the
same result as a system notification (Chrome, Edge, Brave) or, where there are
no notifications (Safari), as a small toast on the page with the same action
link. The toolbar badge shows a check (saved, grey for already saved, amber for
saved for later) or `!` for 4 seconds. Safari ignores badge colors, so the glyph
alone carries it there.

The popup follows the system light/dark setting, shows page titles in their own
direction (Hebrew titles read right to left), and works from the keyboard.

## For developers

### Load it unpacked

1. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** and click **Load unpacked**. Choose this folder.
3. Pin Machina to the toolbar.

The dev manifest also runs the connect script on `http://localhost` and
`http://127.0.0.1`, so the web app's dev server (`npm run dev` in `web/`) can
connect it. The store package removes those.

To save against something other than production, use the popup's token screen,
Advanced, **Server address**. The server must allow the extension's origin
(share_ingest does, see below).

### How connect works

`connect.js` is a content script on the web app. The page posts
`{source: "machina-web", id, type: "machina-ping" | "machina-connect"}` to its
own window; the script relays it to the service worker and posts the answer back
to the same origin. The worker only answers the top frame of the web app's root
page (`/`) on an allowed host, checks a token with the server (an empty POST,
which share_ingest answers 400 for a good token and 403 for a bad one) before
storing it, and never sends a token back. The web side is
`web/lib/extension.ts`.

### CORS, no host permission

The extension has no host permissions. `share_ingest`, and only it, echoes an
Origin of the form `chrome-extension://<32 letters a-p>` or
`safari-web-extension://<uuid>` (`functions/main.py` `_EXTENSION_ORIGIN_RE`). The
ingest token is the only credential; requests go with `credentials: "omit"`.
**This needs the functions deploy that carries that change before the extension
can save at all.**

### Tests

```sh
node extension/popup.test.mjs        # popup wiring, every state, Safari variants
node extension/background.test.mjs   # service worker, connect checks, toasts, manifest
cd e2e && npm run test:extension     # the real extension in Chromium, stub backend
```

The web side (Settings, Browser extension, and the real one-click connect
against the emulators) is `e2e/tests/10-browser-extension.spec.ts`, part of
`npm test` in `e2e/`.

### Package for the Chrome Web Store

```sh
node extension/scripts/package.mjs --bump patch   # or minor / major / --set 1.3.0
```

Writes `extension/dist/machina-extension-<version>.zip` (gitignored): only the
files the extension runs, localhost removed from the content-script matches.
Each upload needs a higher version.

### Store images and icons

```sh
cd e2e && npm run extension:assets      # extension/store/*.png from the real popup
node extension/scripts/render-icons.mjs # icons/*.png from icons-src/*.svg
```

### Rules

- No em dashes in any string a user reads (the tests check every file).
- Keep it cross-browser: feature-detect any API Safari lacks (`notifications`,
  `contextMenus` on iOS, `commands` before 16.4). Keep `notifications` and
  `options_ui.open_in_tab` in the manifest, and don't add `background.scripts`
  (Safari would prefer it over the service worker).
- Keyboard shortcuts are changed in the browser: `chrome://extensions/shortcuts`
  (Chrome, Brave), `edge://extensions/shortcuts` (Edge, where `Ctrl+Shift+S` may
  already belong to Web capture; the popup shows "Not set" if so). Safari has no
  such page.
