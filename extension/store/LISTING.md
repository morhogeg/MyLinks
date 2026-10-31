# Chrome Web Store listing: Machina

Everything the Developer Dashboard asks for, ready to paste, plus the owner's
publishing steps. Research behind the choices (ranking factors, competitors,
keywords, policies, as of 2026-10-31): `SOURCE_OF_TRUTH.md` §9, 2026-10-31.

Upload: `node extension/scripts/package.mjs` → `extension/dist/machina-chrome-<version>.zip`.

---

## 1. Store listing tab

| Field | Value |
|---|---|
| **Item name** (from the manifest) | `Machina: Web Clipper & Screenshot Saver` (39/75) |
| **Summary** (from the manifest) | `Save pages, links, quotes and screenshots to your second brain in one click. Machina summarizes and sorts every save for you.` (125/132) |
| **Category** | Productivity › **Workflow & Planning** (13 of 20 comparable extensions sit there; the AI summarizers sit in Tools) |
| **Language** | English |
| **Homepage URL** | `https://mymachina.app` |
| **Support URL** | `https://mymachina.app/faq` (questions go to support@mymachina.app) |
| **Privacy policy URL** (Privacy tab) | `https://mymachina.app/privacy` |
| **Mature content** | No |

The name and summary live in `extension/_locales/en/messages.json` (`extName`,
`extDescription`): the dashboard takes them from the uploaded package, so change
them there. Name rules: `docs/BRANDING.md` §2 (never "Machina AI"; "second brain"
allowed in the summary and description since the 2026-10-31 D-3 scope change).

### Description (paste as is)

```
Machina is one place for everything you save online: articles, videos, posts, quotes and screenshots. This web clipper is how you save from your browser. One click, or Ctrl+Shift+S, and the page is in your Machina library, where it is summarized, tagged and connected to what you saved before.

WHAT YOU CAN SAVE
• The page you're on: click the Machina icon, or press Ctrl+Shift+S (Command+Shift+S on a Mac).
• A quote: select text first, and it is kept with the page as your note.
• A screenshot of what you see: press Alt+Shift+S, or use the right-click menu. Useful for posts you can only read while signed in.
• Any link or image, from the right-click menu.
• YouTube videos, X posts, and Instagram and TikTok posts (read as your browser shows them, so the card gets the real caption).

WHAT MACHINA DOES WITH EVERY SAVE
In the Machina app, on the web and on iPhone:
• Writes an AI summary and files it under a category and tags, so nothing needs sorting by hand.
• Links it to related things you saved before.
• Lets you search by meaning, not just exact words.
• Answers your questions from your own saves, with the sources cited.
• Optional review reminders bring back what you want to remember: the next day, a week later, then a month later.
• Collections and a weekly synthesis of what you saved.

If you have tried to keep a second brain and gave up on the filing, this is the version that files itself.

BUILT TO BE TRUSTED
• It reads a page only when you save it, and sends nothing about pages you don't save.
• No access to your browsing history. No ads, no tracking.
• Offline? Your saves wait on this computer and go out when you are back online.

GETTING STARTED
1. Add the extension. It opens Machina so you can connect it in one click.
2. Pin Machina to the toolbar.
3. Save anything. It shows up in your library within moments.

A free Machina account is required (sign in with Google or Apple). Free accounts include a monthly allowance of saves Machina reads for you; saves beyond it are kept and read the next month, or right away with Machina Pro.

Privacy policy: https://mymachina.app/privacy
```

Checked against the code on 2026-10-31: reminders are opt-in per save and fire
the next day, 7 days later and 30 days later (`functions/reminder_service.py`);
Ask cites sources; saves past the free allowance are kept as "waiting"
(`functions/deferred_capture.py`). No numbers (the free allowance changes) and no
claim of Edge or Brave support (not tested), on purpose.

### Keyword placement

No public search volumes exist for the Web Store, so demand is estimated from the
user counts of the listings that serve each need (snippet data, mid-2025 to
Aug 2026). Google documents that the item name and description relevance, rating
count and average, and popularity count; a keyword in the name is the strongest
lever developers report (community-observed, not documented). Policy caps: no
keyword more than 5 times, no competitor names, at most 5 named platforms, no
anonymous testimonials.

| Rank | Keyword | Intent | Competition | Where it is |
|---|---|---|---|---|
| 1 | second brain | keep and resurface what I read | Low: no titled listing above ~2K users | Summary, description (1 each) |
| 2 | web clipper | save this page into my tool | High: Evernote 2M, Notion 1M, OneNote 1M, Obsidian 800K users | **Name**, description |
| 3 | screenshot | capture what is on screen | High (assumed) | **Name**, summary, description |
| 4 | save links / save pages | save a page or link | Medium: Raindrop 400K | Summary, description |
| 5 | quotes / selected text | keep a passage with its source | Low | Summary, description |
| 6 | search by meaning | find a save without the exact words | Low: nobody leads with it | Description |
| 7 | ask your saves (cited answers) | Q&A over my own library | Medium | Description |
| 8 | AI summary | summarize what I save | High (Merlin, Sider, Eightify) | Description only (the AI runs in Machina) |
| 9 | organizes automatically (category, tags) | no manual filing | Medium | Description |
| 10 | YouTube / X / Instagram / TikTok posts | save posts and videos | Low to medium | Description (4 platforms, under the cap of 5) |
| 11 | review reminders | resurface saves later | Low | Description |
| 12 | collections, weekly synthesis | group and recap saves | Low | Description |
| — | Pocket alternative | replace Pocket | Medium | **Not used**: competitor names are discouraged. A factual line ("Coming from Pocket? Machina imports your Pocket export.") is true (`web/lib/importParsers.ts`) but optional; reviewer reaction unknown |
| — | note taking, web highlighter, research assistant | — | High | Not used: Machina has no on-page highlights or editor |

### Images (all in this folder, regenerate with `cd e2e && npm run extension:assets`)

Rendered from the real extension UI over a demo article: nothing is drawn or
written on top.

| File | Spec | Shows |
|---|---|---|
| `../icons/icon-128.png` | Store icon: 128×128 PNG, 96×96 art + 16 px transparent padding | The Machina mark (from `web/public/icon.svg`) |
| `screenshot-1-save-page.png` | 1280×800 PNG | One click: "Saved to Machina" (light) |
| `screenshot-2-save-quote.png` | 1280×800 PNG | Selected text kept with the page (dark) |
| `screenshot-3-right-click.png` | 1280×800 PNG | Right-click save confirmed on the page |
| `screenshot-4-screenshot.png` | 1280×800 PNG | "Screenshot saved" |
| `screenshot-5-settings.png` | 1280×800 PNG | Settings: account, a save waiting offline, shortcuts (dark) |
| `promo-small-440x280.png` | Small promo tile, 440×280 (required for good placement) | The mark among saved cards, no text |
| `promo-marquee-1400x560.png` | Marquee, 1400×560 (optional) | Same composition, wide |

Google's guidance: promo tiles should "avoid text", fill the whole area, have
well-defined edges, and read on a light-grey page; screenshots shouldn't carry
heavy text. Upload screenshots in the order above.

**If you want illustrated promo art instead** (any image generator), use these
prompts, then place the real mark (`web/public/icon.svg`) on top yourself. The
prompts ask for no text on purpose; generated lettering comes out garbled.

- Small tile, 440×280: *"Minimal dark graphite background with a soft radial
  glow from the upper center, a few frosted translucent rounded cards drifting
  toward the empty center, subtle depth of field, porcelain and cool silver
  highlights, premium product feel, flat lighting, no text, no letters, no
  logos, no people, no devices."*
- Marquee, 1400×560: *"Wide cinematic dark graphite gradient, frosted glass
  rounded rectangles like saved notes and article cards floating in from the
  left and right edges and converging on a clear empty center, gentle light
  bloom, cool porcelain and silver palette, generous negative space in the
  middle for a logo, no text, no letters, no logos, no people, no screens."*

---

## 2. Privacy practices tab

**Single purpose** (paste):

```
Save the page you are viewing (with any text you selected), a link, an image, or a screenshot of the visible tab to the user's Machina library, when the user clicks the toolbar button, presses the keyboard shortcut, or uses the right-click menu.
```

**Permission justifications** (one box each):

| Permission | Justification (paste) |
|---|---|
| `activeTab` | Gives access to the tab the user is viewing only after they click the toolbar button, press the shortcut, or use the right-click menu, so the extension can read that page's address and title and take a screenshot of it. No access to any other tab or page. |
| `scripting` | Runs a one-time function in the tab the user chose to save (under activeTab) to read the text they selected and the page's preview tags, and to show a short "Saved" confirmation on the page. Nothing is injected into pages the user doesn't save. |
| `contextMenus` | Adds "Save to Machina" to the right-click menu for pages, links, selected text and images. |
| `storage` | Keeps the connection token for the user's Machina account, the extension's settings, and saves waiting to be sent while offline, on this computer only. |
| `alarms` | Retries saves that could not be sent (offline, server busy) with increasing delays, since a Manifest V3 service worker cannot keep its own timers. |
| Host permission (content script on `https://mymachina.app/*`) | Lets the user connect the extension to their account in one click from Machina's own website (Settings, Browser extension). The script only relays the website's connect request to the extension and reads nothing on the page. |

**Remote code:** No, I am not using remote code. (All JavaScript ships in the package; the extension only sends saves to `https://mymachina.app/api/share`.)

**Data usage, what to tick:**

| Category | Tick? | Why |
|---|---|---|
| Website content | **Yes** | Selected text, page title, Instagram/TikTok preview tags, and screenshots, sent when the user saves. |
| Web history | **Yes** | The address and title of each page the user saves. Ticked to disclose conservatively under the July 2026 policy update; it reverses the 2026-10-05 call to leave it unticked. Only pages the user explicitly saves are sent. |
| Authentication information | **Yes** | The extension stores a Machina connection token and sends it to Machina with each save. |
| Personally identifiable information | No | The account email the website passes at connect is stored locally for display and never sent anywhere by the extension. |
| Health, Financial, Personal communications, Location, User activity | No | Not collected. |

**Certifications (tick all three):** not sold to third parties outside the approved
use cases; not used or transferred for purposes unrelated to the single purpose;
not used or transferred to determine creditworthiness or for lending.

**Privacy policy:** `https://mymachina.app/privacy`. Its "Browser extension"
paragraph (§2) says exactly what the extension sends and when, names the Limited
Use requirements, and §4 names Google Gemini as the AI provider. Published text:

> The Machina browser extension reads a page only when you save it (with its button,
> its keyboard shortcut, or its right-click menu), and sends Machina only what that
> save needs: the page's address and title; any text you selected on it; for an
> Instagram or TikTok post, the post's preview (caption, cover image, and author) as
> the page shows it; and, when you ask for one, a screenshot of what you can see in
> the tab. It does not read, record, or send anything about pages you don't save. It
> keeps a connection token, and the email address of the account it saves to, in that
> browser's extension storage: the token is only ever sent to our server, and the
> email address is never sent anywhere. Saves it couldn't send yet (while you're
> offline, say) wait in the same storage until they go out or you discard them; saves
> from private windows are never stored. On mymachina.app it runs a small script so
> you can connect it in one click. The use of information received from the
> extension adheres to the Chrome Web Store User Data Policy, including the Limited
> Use requirements.

---

## 3. Reviewer access (Test instructions, or the notes box)

The extension needs a Machina account. Give the reviewer the review account's
token so they don't need to sign in:

```
1. Install the extension, then right-click its icon > Options (or open the popup and choose "Use a token instead").
2. Under "Connect with a token", paste: <REVIEW ACCOUNT TOKEN>  and press Connect.
3. Open any article and click the Machina icon (or press Ctrl+Shift+S). The popup says "Saved to Machina".
4. Select some text and right-click > Save to Machina > Selected text, with this page.
5. Press Alt+Shift+S to save a screenshot.
Saved items appear at https://mymachina.app when signed in to the same account.
```

Get the token from the review account (`machinareviewer`) in Machina on the web:
Settings, Browser extension, Advanced. **Reset it there after approval** (owner
decision 2026-10-10 for App Review applies here too).

---

## 4. Publishing steps (owner)

1. **Developer account:** register at the Chrome Web Store Developer Dashboard
   (one-time 5 USD fee) with the account that should own the listing.
2. **Verify the publisher** (Account tab): verify the contact email, and verify
   `mymachina.app` in Google Search Console so the listing shows the verified
   website. This is the only lever on the **Established Publisher** badge, which
   Google grants automatically after a few months of a clean record. The
   **Featured** badge is being retired (nominations closed 20 Aug 2026).
3. **Upload** `extension/dist/machina-chrome-1.0.0.zip` (New item).
4. Fill **Store listing** (§1), **Privacy practices** (§2), **Distribution**:
   Public, all regions. Add the reviewer notes (§3).
5. **Submit for review.** Typical reviews have taken from a day to a few days;
   broad permissions slow them, and this package requests none.
6. **After approval:** put the 32-letter item id (the end of the listing URL) in
   `web/lib/extension.ts` `CHROME_WEB_STORE_ITEM_ID`, or set Vercel env
   `NEXT_PUBLIC_CHROME_EXTENSION_ID`, and redeploy the web app. Settings then
   shows "Add to Chrome", and the iOS app shows the Browser extension row again
   on its next build. Install from the store once and save a page end to end.
7. **Updates:** `node extension/scripts/package.mjs --bump patch`, upload the new
   zip. An update that adds a permission with a warning disables the extension
   until each user accepts it, so avoid that.

---

## 5. Policy check (how this package meets each review policy)

| Policy | How it complies |
|---|---|
| Single purpose | One job: save to Machina. No search, chat, or app portal in the extension. |
| Minimum permissions | `activeTab`, `scripting`, `contextMenus`, `storage`, `alarms`, and one content-script host (Machina's own site). No `<all_urls>`, no `tabs`, no history. A unit test fails on any change to this set. |
| Manifest V3, no remote code | Module service worker; every script is in the package; CSP `script-src 'self'; object-src 'none'`; no `eval`, no inline scripts (tests check). |
| User data, Limited Use | Data leaves only on an explicit save, only to `mymachina.app`, only what that save needs; privacy policy discloses it and names Gemini; nothing sold, no ads, no analytics. |
| Disclosure | Before connecting, the popup says what is sent and links the privacy policy; Connect is the user's affirmative step. The Settings page (Privacy section), the listing and the privacy policy say the same. (The July 2026 policy update reportedly extends prominent disclosure to all collection; this covers it either way.) |
| Listing quality | Complete fields, 5 real screenshots, promo tile, no keyword repeated more than 5 times, no competitor names, no testimonials. |
| Minimum functionality | Every feature works without the AI side (saves are accepted even past the free allowance). |
| Impersonation | Own brand only; images show only Machina's UI and a made-up demo article. |

---

## 6. Security model

- **Token:** an ingest token that can only add saves to one account (it cannot
  read the library). Stored in `chrome.storage.local`, locked to the extension's
  own pages and worker (`setAccessLevel`, Chrome 140+), never synced, sent only to
  `mymachina.app` in the `X-Ingest-Token` header with cookies omitted.
- **Connect bridge:** the content script answers only `window.postMessage` from its
  own window and origin, and the worker accepts it only from the top frame of the
  root page (`/`) of `https://mymachina.app`, so public share pages (`/s/…`,
  `/c/…`) can't connect it. The token is checked with the server before it is kept,
  and never sent back to the page (ping returns a one-way tag).
- **Residual risk:** a script running on mymachina.app itself (an XSS) could hand
  the extension a different account's token, sending later saves there. Such a
  script could already read the signed-in library, so this adds little; it is
  why mymachina.app keeps a strict CSP.
- **No host permissions:** saves work because `share_ingest` (and only it) admits
  extension origins over CORS (`functions/main.py` `_EXTENSION_ORIGIN_RE`).
- **Page data is untrusted:** everything read from a page is length-capped and
  shape-checked; the popup and toast build DOM with nodes, never HTML strings.
