# Machina for Safari: Mac App Store pack

Everything needed to put the Safari extension on the Mac App Store. Written
2026-10-05 against the built bundle (`./safari/build-safari.sh`) and the code in
`/extension`. The iOS listing lives in `docs/APP_STORE.md`; this record is
separate (see `safari/README.md`, "Distribution"). House rules carried over: no
em dashes in any copy a user reads, and the name is `Machina`, not `Machina AI`.

---

## 1. Release blockers (resolve before submitting)

1. **The save request must work before the user grants Safari access to the
   backend host.** Safari never grants `host_permissions` at install. In
   Chrome, that permission is what lets the extension's `fetch` to
   `secondbrain-app-94da2.web.app/api/share` skip CORS; in Safari, until the
   user allows that host, the request is a normal cross-origin request from
   `safari-web-extension://<random id>`, and `share_ingest`'s CORS allowlist
   (`functions/main.py` `_allowed_origins`) does not include it. Expected result
   without a fix: every save says "Couldn't reach Machina". Not verified on a
   device (no session can drive Safari); the fix is cheap and safe either way,
   see shared-change B1 in the report / `safari/README.md`. **Test on TestFlight
   for Mac before submitting.**
2. **A reviewer must be able to finish a save.** See section 5 (demo token).
3. Recommended, not blocking: the in-page confirmation for Safari (shared-change
   A1), because without system notifications the only feedback is a two-second
   badge whose color Safari ignores.

## 2. Metadata (App Store Connect)

| Field | Value | Limit |
|---|---|---|
| **Platform** | macOS | |
| **Name** | `Machina for Safari` | 30 (18) |
| **Subtitle** | `Save any page in one click` | 30 (26) |
| **Bundle ID** | `com.morhogeg.machina.safari` (extension: `com.morhogeg.machina.safari.extension`) | |
| **SKU** | `machina-safari` | |
| **Primary category** | Productivity | |
| **Secondary category** | Utilities | |
| **Price** | Free | |
| **Privacy Policy URL** | `https://mymachina.app/privacy` (already covers "the browser extension", section 1) | |
| **Support URL** | `https://mymachina.app` | |
| **Marketing URL** | `https://mymachina.app` | |
| **Copyright** | `© 2026 Mor Hogeg` | |
| **Age rating** | None to every question, result 4+ (same answers as iOS) | |

**Keywords** (no word from the Name or Subtitle; Apple combines tokens across
fields):

```
web clipper,bookmarks,read later,extension,links,second brain,ai summary,notes,research,articles
```

96/100. `second brain` stays keyword-only, same rule as iOS (`docs/BRANDING.md`).

**Promotional text** (159/170):

> Click once to send any page, link, or highlighted passage to your Machina
> library. Machina summarizes and connects it, so you can ask about anything you
> saved.

**Description:**

> Machina for Safari adds a Machina button to Safari. Click it on any page and
> the page lands in your Machina library, where Machina reads it, writes a real
> summary, sorts it, and connects it to the things you already saved.
>
> SAVE WITHOUT LEAVING THE PAGE
> • Click the Machina button to save the page you are reading
> • Right-click a link to save the link instead
> • Select a passage and right-click to save the page with your selection as a quote
> • Or press Command-Shift-S
>
> COME BACK TO IT IN MACHINA
> • A summary, category, and tags on every save
> • Connections between related saves
> • Ask about anything you saved and get answers that cite your own saves
>
> HOW IT WORKS
> This app contains a Safari extension. After installing, open the app and turn
> Machina on in Safari Settings, then paste the token from Machina (Settings,
> then Browser extension) once. Machina for Safari needs a Machina account,
> which you can create free at mymachina.app or in the Machina iPhone app.
>
> Private by design. The extension only sends the page you choose to save, never
> your browsing history. No ads, no tracking, and your content is never used to
> train AI models.

Why it is written this way: Guideline 4.4 asks apps that host extensions to say
so in their marketing text, hence "This app contains a Safari extension". The
account requirement is stated up front so nobody installs expecting a
standalone tool (Guideline 4.2 concern: the app must not look like an empty
shell, and the description makes clear the value is the extension plus the
service). Unlike the iOS listing, this one is allowed to name the web app: this
product only works alongside it.

## 3. App Privacy answers (App Store Connect > App Privacy)

Consistent with `web/app/privacy/page.tsx` and the iOS label in
`docs/APP_STORE.md` section 1, but scoped to what **this app** sends. The Mac
app itself sends nothing; the extension sends, per save: the page or link URL,
the selected text if any, and the ingest token.

- Collects data: **Yes.** Tracking: **No** (no ads, no analytics SDKs, no data
  brokers).

| Data type | Collected | Linked to user | Purpose | Why |
|---|---|---|---|---|
| **User Content > Other User Content** | Yes | Yes | App Functionality | The URL of the page or link the user chooses to save, and any text they selected. The server fetches the page and sends its text to Google Gemini for analysis, as the privacy policy describes. |
| **Identifiers > User ID** | Yes | Yes | App Functionality | Every save carries the account's ingest token, an account-level identifier the server uses to file the save in the right library. |
| Browsing History | **No** | | | The extension never reads or sends history; it sends only a page the user explicitly saves (privacy policy: "no browsing history beyond the pages you explicitly choose to save"). |
| Contact Info, Location, Contacts, Photos, Usage Data, Diagnostics, Purchases, Financial, Health, Search History, Sensitive Info | No | | | The Mac app and the extension collect none of these. (The web app's own usage and crash events are declared on the web, not by this app.) |

Encryption export compliance: answered in the binary
(`ITSAppUsesNonExemptEncryption = NO`; the app uses only Apple-provided HTTPS
through Safari), so App Store Connect will not ask per build.

## 4. Screenshots

Mac App Store sizes (16:10): 1280x800, 1440x900, 2560x1600 or 2880x1800; 1 to 10
images. Use 2880x1800 from a Retina Mac.

**Generated honestly so far:** `screenshots/app-window-light.png` and
`app-window-dark.png`, rendered from the app's real `ContentView` by
`safari/tools/render-app-window.swift` (first-run state; the primary button
renders grey offscreen and is blue in the running app). They are reference and
raw material, not submission-ready: wrong size, and no Safari in them.

**Still needed (owner, on a Mac with the TestFlight or App Store build, in a
clean Safari profile, light mode, demo account):**

1. An article open in Safari with the Machina toolbar button visible, just after
   a save (badge ✓). Caption idea: "One click. It's in your library."
2. Right-click on a link showing "Save to Machina". Caption: "Save the link, not
   the page."
3. Selected text with the context menu. Caption: "Keep the passage that
   mattered."
4. The saved card open in Machina (mymachina.app in Safari): summary, tags,
   See also. Caption: "Machina reads it for you."
5. The Machina for Safari window beside Safari Settings > Extensions with
   Machina ticked. Caption: "On in Safari in seconds."

Shoot 5 after shared-change A3 if possible: today the settings page opens as a
full Safari tab with a 320 px column pinned top-left.

## 5. App Review notes (paste into "Notes" on the version page)

The reviewer needs a working token, and Machina sign-in is Google/Apple only, so
a password cannot be handed over (open issue in `SOURCE_OF_TRUTH.md` §4 task 9).
The extension does not need sign-in at all: it needs a **token**. So give the
reviewer the demo account's token directly.

Before submitting: sign in to the web app as the reviewer demo account
(`machinareviewer@gmail.com`, already seeded, see `docs/APP_STORE.md` §5),
open Settings > Browser extension, copy the token into the notes below. **Do not
press Reset token until review is finished**: it kills the token in the notes.
Reset it after approval. Attach a 30-second screen recording of steps 1 to 5
to the review submission, since the reviewer cannot sign in to see the saved
card themselves.

> Machina for Safari is the Safari extension for Machina, a personal knowledge
> base (mymachina.app). The app explains setup and opens Safari's extension
> settings; the extension saves the current page, a right-clicked link, or
> selected text into the user's Machina library, where the service summarizes
> and organizes it.
>
> To test:
> 1. Open Machina for Safari and click "Turn On in Safari Settings". Tick Machina.
> 2. In Safari, click the Machina button in the toolbar. A settings tab opens.
> 3. Paste this demo token and click "Save and connect". The page shows
>    "Connected". Token: `TOKEN_FROM_DEMO_ACCOUNT_TBD`
> 4. Open any article (for example https://www.apple.com/newsroom/) and click
>    the Machina button. If Safari asks, allow Machina on the site. The button
>    shows a check mark: the page was saved to the demo library.
> 5. Right-click any link and choose "Save to Machina" to save the link itself.
>
> The attached recording shows the saved cards appearing in the Machina library.
> The extension sends only the page the user chooses to save. No purchases, no
> ads, no tracking. Privacy policy: https://mymachina.app/privacy

## 6. Owner checklist

In order. Nothing here has been done; no session can do the Apple parts.

**Before any Apple step**
- [ ] Resolve blocker 1 (backend CORS, shared-change B1) and ship it.
- [ ] Decide on shared changes A1 to A5 (Chrome session builds them).

**Apple Developer (developer.apple.com)**
- [ ] Certificates: an **Apple Distribution** certificate already exists on this
      Mac (team 8Y2M94RUHG, expires 2027-07-07); it signs Mac App Store apps
      too. Add a **Mac Installer Distribution** certificate (Xcode > Settings >
      Accounts > Manage Certificates > + > Mac Installer Distribution); a Mac
      App Store `.pkg` is signed with it.
- [ ] Identifiers (optional, automatic signing will otherwise create them on the
      first archive): App IDs `com.morhogeg.machina.safari` and
      `com.morhogeg.machina.safari.extension`, platform macOS. **No
      capabilities to enable**: App Sandbox is an entitlement, not an App ID
      capability, and there are no App Groups, iCloud, or push.

**Capabilities check (already true in the committed build, verified)**
- [x] App Sandbox on the app and the extension (`codesign -d --entitlements -`).
- [x] No network entitlement needed: the extension's requests are made by
      Safari, not by the extension process (Apple's own converter template adds
      none to the extension). The app opens links through the default browser.
- [x] Hardened Runtime on (harmless for the App Store, required if Developer ID
      is ever used).

**App Store Connect (appstoreconnect.apple.com)**
- [ ] My Apps > + > New App: platform **macOS**, name `Machina for Safari`,
      language English (U.S.), bundle ID `com.morhogeg.machina.safari`, SKU
      `machina-safari`. (If the name is taken, `Machina: Save from Safari`.)
- [ ] App Information: categories, content rights (no third-party content),
      age rating (all None), privacy policy URL, per section 2.
- [ ] App Privacy: section 3.
- [ ] Pricing and Availability: Free, all territories the iOS app uses.

**Build and upload**
- [ ] Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in
      `safari/Config/Base.xcconfig` if needed (first upload: 1.0.0 (1) is fine).
- [ ] `./safari/build-safari.sh --archive` (signs with your Xcode account,
      verifies, exports a `.pkg` to `safari/build/export/`, uploads nothing), then
      Xcode > Window > Organizer > the archive > Distribute App > App Store
      Connect > Upload. Or in Xcode: open `safari/MachinaSafari.xcodeproj`,
      Product > Archive.
- [ ] Or CI: Actions > "Mac → App Store (Safari extension)" > Run workflow,
      confirm `mac`, tick upload. Needs the existing iOS secrets plus
      `MAC_INSTALLER_P12_BASE64` / `MAC_INSTALLER_P12_PASSWORD` (export the Mac
      Installer Distribution certificate with its key as a .p12, base64 it, like
      `docs/IOS_CICD.md` "Stable signing certificate").

**TestFlight for Mac (worth it here)**
- [ ] Add yourself as an internal tester; install through the TestFlight app on
      the Mac. This is the first build Safari loads without "Allow Unsigned
      Extensions", so it is where the real behavior gets checked:
  - [ ] save from the toolbar on a site never granted (does it save, or does
        Safari prompt first? Is `tab.url` filled in?)
  - [ ] save with no grant for `secondbrain-app-94da2.web.app` (blocker 1)
  - [ ] right-click a link, right-click a selection, ⌘⇧S
  - [ ] toolbar glyph looks right in light and dark, dimmed and active
  - [ ] the settings tab: paste token, "Connected", "Save this page now"
  - [ ] the app window: pill flips to "Machina is on in Safari" after ticking
  - [ ] app icon in the Dock and Finder on macOS 26 (rendered correctly here
        through `NSWorkspace`, not eyeballed in the Dock)

**Submit**
- [ ] Screenshots (section 4), review notes with the real token and the
      recording (section 5), then Submit for Review.
- [ ] After approval: reset the demo token; Chrome session adds the App Store
      link to Settings > Browser extension (shared-change C1).
