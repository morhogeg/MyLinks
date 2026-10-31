# Machina browser extension

A Manifest V3 extension that saves the page you're on (with any text you
selected), a link, an image, or a screenshot of the visible tab to your
Machina library. It is a **thin client**: every save is one POST to
`share_ingest` (`https://mymachina.app/api/share`), the same endpoint the iPhone
share extension uses. The server reads, analyzes and files the save; the card
then appears in the app through real-time sync.

Plain JavaScript modules, no build step, no runtime dependencies, no remote
code. Chrome 140+ (Edge and Brave install from the same Web Store item; not
tested here). Store listing, privacy answers and the publishing steps:
[`store/LISTING.md`](store/LISTING.md).

## Using it

1. **Connect.** A new install opens `mymachina.app/?connect=extension`; if you
   are signed in, it connects in one click. Otherwise: popup, **Connect to
   Machina**, or Settings (right-click the icon, Options), **Connect with a
   token** (the token is in Machina's Settings, Browser extension, Advanced).
2. **Save.**
   - Click the icon, or press **Ctrl+Shift+S** (Command+Shift+S on a Mac): the
     popup saves the page at once. Selected text goes with it as a quote.
   - **Alt+Shift+S**: a screenshot of what you see.
   - Right-click a page, link, image or selection: **Save to Machina**.
3. **Results** show in the popup, or (for right-click and shortcut saves) as a
   short confirmation on the page plus a mark on the toolbar icon.

| Server answer | What the user sees |
|---|---|
| 200 queued / saved | **Saved to Machina** (with the quote, if any) |
| 200 `duplicate` | **Already in your library** (a new quote is not added: server limit) |
| 200 `waiting` | **Saved for later** with the server's message |
| 401 / 403 | **Reconnect Machina**; the save is kept until you reconnect |
| offline, no answer, 5xx, 429 | **Saved on this computer**; retried with backoff for 24 h |
| 400 / 413 | The server's reason (**Too large to save**, …) |
| a screenshot with no answer | **Not sure it saved** (never resent: the server can't spot a duplicate image) |
| browser pages, files | **Can't save this page**; nothing is sent |

Instagram and TikTok can't be read by Cloud Functions (login walls), so for
those posts the extension reads the page's preview tags and sends them as
`pagePreview`, only when they describe the post on screen. LinkedIn and
Facebook posts get a hint to save a screenshot too.

## Layout

```
manifest.json            permissions, commands, CSP; strings come from _locales
_locales/en/messages.json  every string a person reads (incl. the store name/summary)
src/background.js        service worker: events → saves (no state between events)
src/lib/api.js           request bodies; every server answer → one named outcome
src/lib/saves.js         the five ways to save, end to end
src/lib/queue.js         offline/retry queue (storage.local + one alarm)
src/lib/account.js       token check/store, one-way tag shared with the website
src/lib/capture.js       reading the chosen tab, social post preview, screenshot
src/lib/image.js         screenshot decode/downscale (under 5 MB)
src/lib/feedback.js      toolbar badge and on-page toast
src/lib/describe.js      plain words for every result (popup and toast)
src/lib/urls.js          what can be saved; site helpers
src/lib/config.js        the one place the server address lives
src/content/bridge.js    one-click connect relay on mymachina.app
src/popup/, src/options/ UI; src/ui/theme.css mirrors web/app/globals.css tokens
icons/                   rendered from web/public/icon.svg (scripts/render-icons.mjs)
store/                   listing doc, screenshots, promo tiles
test/                    unit tests (node --test) with a fake chrome.*
```

## Developing

**Load it:** `chrome://extensions`, Developer mode, **Load unpacked**, pick this
folder. The manifest in the repo is the one that ships; it only talks to
production (`src/lib/config.js`). To work against a local server, use the test
harness below, which patches a copy.

**Tests:**

```sh
node --test extension/test/*.test.mjs        # 60 unit tests, no dependencies
cd e2e && npm run test:extension             # the real extension in Chromium, stub share_ingest
cd e2e && npm run extension:assets           # re-render store/ images from the real UI
node extension/scripts/render-icons.mjs      # icons/ from web/public/icon.svg
```

The browser suite (`e2e/extension/`) covers every popup state, the queue, the
connect protocol (including the web app's own `web/lib/extension.ts`), the
Instagram preview, screenshots, the right-click paths, and an axe accessibility
scan of the popup and settings in light and dark. The website side (Settings,
Browser extension, against the emulators) is `e2e/tests/10-browser-extension.spec.ts`.

**Package for the store:** `node extension/scripts/package.mjs --bump patch`
writes `extension/dist/machina-chrome-<version>.zip` (gitignored) after the
store checks. `--check` only checks (CI).

## Rules

- Permissions stay exactly `activeTab`, `scripting`, `contextMenus`, `storage`,
  `alarms` plus the mymachina.app content script; a unit test fails on any change.
  Adding a permission with an install warning disables the extension for every
  user until they accept it.
- No host permissions: saves work because `share_ingest` admits extension
  origins over CORS (`functions/main.py` `_EXTENSION_ORIGIN_RE`).
- Every string in `_locales`; no em dashes; never "Machina AI" (tests check).
- No `innerHTML`, `eval`, inline scripts or remote code (tests check).
- The connect protocol is shared with `web/lib/extension.ts`; change both
  together (a unit test checks the token tag and message names match).
- `/safari` copies this folder into the Mac app at build time (deferred,
  §4 26c); its Safari runtime is not verified against this version.
