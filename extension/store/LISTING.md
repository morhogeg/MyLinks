# Chrome Web Store listing: Machina

Everything the Chrome Web Store dashboard asks for, ready to paste, plus the
security model and the owner's publishing checklist. Images are in this folder.
No em dashes anywhere in listing copy.

## Store listing tab

**Name** (from the manifest): `Machina: one-click save`

**Summary** (manifest description, 132 characters max):
> Save any page, link, or selection to your Machina library in one click.

**Category:** Productivity (Workflow and planning)

**Language:** English

**Description:**

> Machina is your personal library for everything worth keeping. This extension
> saves what you are reading in one click.
>
> Click the Machina icon on any page, or press Ctrl+Shift+S (Command+Shift+S on a
> Mac), and the page lands in your Machina library. Machina reads it for you and
> turns it into a card with a summary, tags, and links to related things you
> saved before. Ask your library questions later and get answers drawn from your
> own saves.
>
> Right click a link to save the link itself. Select a passage and right click to
> save the page with that quote attached.
>
> What it does:
> - Saves the page you are on, a link, or a selection, in one click
> - Tells you plainly what happened: saved, already in your library, saved for
>   later, or why it could not save
> - Connects to your Machina account in one click when you are signed in to
>   Machina in the same browser
> - Follows your system's light or dark setting, and shows titles in any language
>   and direction
>
> What it does not do: it does not read or record the pages you visit. Nothing
> leaves your browser until you click save, and then only the page address and
> any text you selected.
>
> You need a Machina account (free) at mymachina.app.

**Images** (this folder, generated from the real extension by
`npm run extension:assets` in `e2e/`):

| Slot | File |
|---|---|
| Store icon, 128x128 | `icon128.png` |
| Screenshot 1, 1280x800 | `screenshot-1-save.png` |
| Screenshot 2 | `screenshot-2-dark-rtl.png` |
| Screenshot 3 | `screenshot-3-already-saved.png` |
| Screenshot 4 | `screenshot-4-connect.png` |
| Small promo tile, 440x280 | `promo-small-440x280.png` |
| Marquee 1400x560 | optional, not made |

**Official URL / homepage:** `https://mymachina.app`
**Support URL:** `mailto:support@mymachina.app` (or a support page if one exists)

## Privacy practices tab

**Single purpose:**
> Save the page, link, or text the user chooses into their own Machina library.

**Permission justifications:**

| Permission | Why it is needed |
|---|---|
| `activeTab` | To read the address and title of the tab the user is saving, only at the moment they click the Machina icon, press the shortcut, or use the right-click menu. No access to any other tab or any page they don't act on. |
| `contextMenus` | Adds "Save page / link / selection to Machina" to the right-click menu. |
| `storage` | Keeps the connection token (and the account label shown in Settings) in this browser's local extension storage. Not synced. |
| `notifications` | Confirms a right-click save (saved, already saved, or why it failed), since there is no popup on screen for those. |
| `scripting` | Where the browser has no notifications (Safari), shows the same confirmation as a small message on the page the user just saved, through the activeTab grant from that click. Never runs on a page the user didn't act on. |
| Host access: `https://mymachina.app/*` (content script) | A small script on the Machina web app only, so the user can connect the extension to their account in one click instead of copying a token. It reads nothing from the page; it only relays the connect request the Machina page sends. |

**Remote code:** No. All code ships in the package. The extension makes network
requests only to the Machina API (`secondbrain-app-94da2.web.app/api/share`).

**Data usage** (what to tick):

| Data type | Collected? | What and why |
|---|---|---|
| Website content | Yes | The address of the page or link the user saves, and the text they selected when they save a selection. Sent to Machina to build the card. |
| Authentication information | Yes | The Machina connection token, stored locally and sent to Machina with each save to prove which library it goes to. |
| Web history | No | Only pages the user explicitly saves, one at a time, and those are covered by "Website content". Nothing is recorded in the background. (Owner call: tick it anyway if the reviewer reads every saved URL as history.) |
| Personally identifiable information | No | The extension stores the account email it is given by the Machina page, only to show "Saving to ..." in its own settings. It never sends it anywhere. |
| Health, financial, personal communications, location, user activity | No | |

**Certifications** (all three are true): not sold to third parties; not used or
transferred for purposes unrelated to the single purpose; not used to determine
creditworthiness or for lending.

**Privacy policy URL:** `https://mymachina.app/privacy` (section 2 has a "Browser
extension" paragraph matching the answers above; section 4 covers what goes to
Google Gemini).

## Security model (one-click connect)

The asset is the ingest token: whoever holds it can add saves to the account's
library (it cannot read the library). Goals: only the real Machina web app can
hand a token to the extension; the token never reaches another page or another
extension; a page can't swap in someone else's token unnoticed.

How it works: `connect.js` runs only on `https://mymachina.app/*` (the store
build; dev builds add localhost). The Machina page posts a request to its own
window; the script relays it to the service worker and posts the answer back to
the same origin.

| Threat | Defense |
|---|---|
| Any other website tries to connect or read the token | The content script does not run there, so nothing answers. The worker also rejects any sender that is not the top frame of an allowed host's root page `/` (`shared.js` `isTrustedConnectSender`, hosts in both the manifest and a hardcoded list). |
| A Machina share page (`/s`, `/c`) shows attacker-written content | Root-path check: share pages can't connect even if one ever ran script. |
| A frame or popup window talks to the script | The script ignores messages whose `source` isn't its own window or whose `origin` isn't its own; it does not run in frames. |
| The extension leaks the token back to a page | It never sends it. Pages get `{connected, tokenTag}`, where the tag is 12 hex characters of SHA-256 over a prefixed token, enough to tell "this account" from "another account". |
| A junk or attacker token is pushed | The worker checks the token with the server (empty POST: 400 for a real token, 403 otherwise) before storing it; a failed connect keeps the working token. |
| Account swap (a page pushes the attacker's real token, so the victim's saves go to the attacker) | Only the Machina web app's root page can push. Pulling that off needs script running on mymachina.app itself, which already owns the session and the real token. The extension's Settings shows "Saving to <account>". |
| Other extensions on the same page read the posted token | Only extensions that already have access to mymachina.app, which can read the page, its session and the token anyway. |
| A web page talks to the popup-only messages (disconnect, paste token) | The worker serves those only to its own pages (sender URL starts with the extension's own origin). |
| CORS opened for extension origins abused by websites | Only `share_ingest` echoes extension origins, only exact `chrome-extension://<32 a-p>` or `safari-web-extension://<uuid>` strings, never with credentials. A website can't send that Origin. The token stays the only credential, and a website could already call share_ingest with a stolen token without CORS (it just couldn't read the answer). |
| A local dev server pushes a token into a published extension | The store package drops localhost from the content-script matches; `package.mjs` refuses to build if any local origin is left. |

Not covered, deliberately: an attacker who already controls the user's browser
profile, or script on mymachina.app itself (that is a web-app compromise, and
the token is readable there anyway).

## Publishing checklist (owner)

Before the first upload:

1. **Deploy the functions change first.** The extension has no host permission
   and relies on `share_ingest` allowing extension origins for CORS
   (`_EXTENSION_ORIGIN_RE`). Until that deploy, every save fails with "Couldn't
   reach Machina". Ship the branch with a `functions/**` change (scope
   `Deploy-Functions: share_ingest`), and the web change (Vercel) for Settings.
2. Load the unpacked extension once, connect it at `https://mymachina.app/?settings=extension`,
   save a page, and see **Saved to Machina** and the card in the app.
3. Register a Chrome Web Store developer account at
   `https://chrome.google.com/webstore/devconsole` (one-time 5 USD fee, Google
   account with 2-step verification). Verify the contact email. Consider a group
   publisher (Machina) rather than a personal one, so the listing doesn't show a
   personal name.

Upload:

4. `node extension/scripts/package.mjs` (or `--bump patch` for later versions).
5. Dashboard, **New item**, upload `extension/dist/machina-extension-<version>.zip`.
6. **Store listing** tab: paste from above, upload the images in this folder.
7. **Privacy practices** tab: single purpose, the six justifications, data
   usage, certifications, privacy policy URL.
8. **Distribution**: Public (or Unlisted for a quiet first week), all regions.
9. Submit for review. Expect a few days; host access plus `scripting` can mean
   a longer manual review.

After it is approved:

10. Copy the item id (32 letters, end of the listing URL) into
    `web/lib/extension.ts` `CHROME_WEB_STORE_ITEM_ID` (or set
    `NEXT_PUBLIC_CHROME_EXTENSION_ID` on Vercel). Settings then shows
    **Add to Chrome** instead of "Coming soon".
11. Install from the store in a clean Chrome profile: the connect page opens on
    install, connect, save a page in light and dark, right-click a link and a
    selection, and check a Hebrew page title.
12. Optional: submit the same zip to Edge Add-ons
    (`https://partner.microsoft.com/dashboard/microsoftedge`). Edge users can
    also install straight from the Chrome Web Store.
13. Safari: when the Mac App Store listing exists, set `MAC_APP_STORE_URL` in
    `web/lib/extension.ts` (or `NEXT_PUBLIC_MAC_APP_STORE_URL`).

Every later release: bump the version with `package.mjs`, upload, submit.
