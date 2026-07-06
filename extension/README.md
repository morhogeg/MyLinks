# MyLinks — Browser Extension (one-click capture)

A tiny Manifest V3 extension that saves the current page, a right-clicked link, or
selected text straight into your MyLinks second brain. It's a **thin client** — it
just POSTs to the existing `share_ingest` Cloud Function (`/api/share`), the same
endpoint the iOS Share Shortcut uses. The backend scrapes, analyzes with Gemini,
embeds, and saves; the card then appears in the app via real-time sync.

No build step, no dependencies — plain HTML/CSS/JS.

## Install (load unpacked)

1. Open `chrome://extensions` (works the same in Edge: `edge://extensions`, and Brave).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `/extension` folder.
4. The MyLinks icon appears in the toolbar. Pin it for easy access.

## Set your token

1. Right-click the toolbar icon → **MyLinks settings…** (or click the icon before a
   token is set — it opens settings automatically).
2. Paste your **ingest token**. Get it from the MyLinks app → Settings (it's the same
   token the iOS Shortcut uses).
3. *(Optional)* change the **Backend URL** — defaults to
   `https://secondbrain-app-94da2.web.app`.
4. Click **Save settings**, then **Test connection** to confirm the token works.
   (The test sends a tokens-only request that saves nothing.)

Your ingest token is stored in `chrome.storage.local` (this device only) so the
bearer secret is never replicated across your synced Chrome profiles. The
Backend URL is restricted to the official host.

## How to save

| Action | What gets saved |
|---|---|
| **Click** the toolbar icon | the current tab's URL |
| **Keyboard** `Ctrl+Shift+S` (`⌘+Shift+S` on Mac) | the current tab's URL |
| **Right-click a link** → Save to MyLinks | the link's URL (not the page) |
| **Select text** → right-click → Save to MyLinks | the page URL, with the selection saved as the note/body |
| **Right-click the page** → Save to MyLinks | the current tab's URL |
| **Save this page now** (in settings popup) | the current tab's URL |

### Confirmation

Every save shows a **system notification** confirming what happened — e.g.
*"Saved to MyLinks ✓ — &lt;page title&gt; — analyzing now, it'll appear in your app
shortly."*, *"Already in MyLinks"*, or a clear error. The card then appears in the
MyLinks app **automatically** (real-time sync — no refresh) within a few seconds,
once the backend finishes scraping + analyzing it.

A toolbar **badge** mirrors the result for a couple of seconds:

- **✓ purple** — saved (queued for processing).
- **✓ grey** — already saved (duplicate; no error).
- **✗ red** — something went wrong (no/invalid token, or the page can't be saved).

## Notes

- The keyboard shortcut can be changed at `chrome://extensions/shortcuts`.
- Pages like `chrome://`, the Web Store, and other non-`http(s)` URLs can't be saved
  (the browser doesn't expose them) — you'll see a red ✗.
- This extension targets Chromium browsers (Chrome / Edge / Brave). A Firefox port is
  a later tweak.
- **Safari:** the same code runs in Safari via a native wrapper built in Xcode — see
  [`../safari/README.md`](../safari/README.md).
