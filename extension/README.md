# Machina, browser extension (one-click capture)

A tiny Manifest V3 extension that saves the current page, a right-clicked link, or
selected text straight into your Machina library. It's a **thin client**: it just
POSTs to the existing `share_ingest` Cloud Function (`/api/share`), the same
endpoint the iOS Share Extension uses. The backend scrapes, analyzes with Gemini,
embeds, and saves; the card then appears in the app via real-time sync.

No build step, no dependencies, plain HTML/CSS/JS.

## Install (load unpacked)

Machina is not in the Chrome Web Store yet, so the extension is installed by hand.
It takes about a minute.

1. Open `chrome://extensions` (Edge and Brave are the same, at `edge://extensions`
   and `brave://extensions`).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this `/extension` folder.
4. The Machina icon appears in the toolbar. Pin it for easy access.

## Set your token

1. Open the Machina app, go to **Settings**, then **Browser extension**, and copy
   your token there. That screen also carries these install steps.
2. Click the toolbar icon (before a token is set it opens settings automatically),
   or right-click the icon and choose **Machina settings…**.
3. Paste the token and click **Save and connect**. The popup checks the token
   against the backend and shows **Connected** when it works, or the reason it
   didn't. The check saves nothing.
4. *(Optional)* change the **Backend URL**. It defaults to
   `https://secondbrain-app-94da2.web.app`, which is what the app hands out today.

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile.
The popup re-checks the connection every time you open it.

## How to save

| Action | What gets saved |
|---|---|
| **Click** the toolbar icon | the current tab's URL |
| **Keyboard** `Ctrl+Shift+S` (`⌘+Shift+S` on Mac) | the current tab's URL |
| **Right-click a link** → Save to Machina | the link's URL (not the page) |
| **Select text** → right-click → Save to Machina | the page URL, with the selection saved as the note/body |
| **Right-click the page** → Save to Machina | the current tab's URL |
| **Save this page now** (in the settings popup) | the current tab's URL |

### Confirmation

Every save shows a **system notification** confirming what happened, for example
*"Saved to Machina ✓ &lt;page title&gt;. Analyzing now, it'll appear in your app
shortly."*, *"Already in Machina"*, or a clear error. The card then appears in the
Machina app **automatically** (real-time sync, no refresh) within a few seconds,
once the backend finishes scraping and analyzing it.

A toolbar **badge** mirrors the result for a couple of seconds:

- **✓ graphite**: saved (queued for processing).
- **✓ grey**: already saved (duplicate, not an error).
- **✗ red**: something went wrong (no or invalid token, or the page can't be saved).

## Notes

- The keyboard shortcut can be changed at `chrome://extensions/shortcuts`.
- Pages like `chrome://`, the Web Store, and other non-`http(s)` URLs can't be saved
  (the browser doesn't expose them). You'll see a red ✗.
- This extension targets Chromium browsers (Chrome, Edge, Brave). A Firefox port is
  a later tweak.
- **Safari:** the same code runs in Safari via a native wrapper built once in Xcode.
  See [`../safari/README.md`](../safari/README.md).
- No em dashes in any string a user reads here. Same rule as the app.
- `node extension/popup.test.mjs` load-tests the popup with stubbed DOM and
  `chrome.*` APIs (no dependencies, no browser). It checks the first-run copy,
  token validation, the connection states, and that popup.js only reaches for
  ids popup.html actually defines. It is not loaded by the extension itself.
