# App Store submission pack — Machina

> Reference doc for filling out App Store Connect (§4 tasks 8–9 in
> `SOURCE_OF_TRUTH.md`). Everything here was written against the actual
> codebase on 2026-07-03. Legal pages are live at
> https://mymachina.app/privacy and …/terms (public — they bypass
> the sign-in gate).

---

## 1. App Privacy "nutrition label" (App Store Connect → App Privacy)

Top-level answers:

- **"Do you or your third-party partners collect data from this app?"** → **Yes.**
- **Tracking (ATT sense — data linked with third-party data for advertising, or
  shared with data brokers):** → **NO.** There are no ads, no analytics SDKs,
  no data sale. Never check "used for tracking" on any item below.

Declare exactly these data types. For every one: **Collection purpose = App
Functionality** only; **Used for Tracking = No**.

| Connect data type | Collected? | Linked to user? | Why (justification you can defend) |
|---|---|---|---|
| **Contact Info → Email Address** | Yes | Yes | Received from Google/Apple sign-in via Firebase Auth; stored on the user doc to identify the workspace. |
| **Contact Info → Name** | Yes | Yes | Display name from the Google/Apple account, shown in the app (profile avatar). |
| **Identifiers → User ID** | Yes | Yes | Firebase Auth UID + workspace ID key all user data (`users/{uid}`). |
| **User Content → Photos or Videos** | Yes | Yes | Images/screenshots the user explicitly shares into the app (share sheet or in-app add); stored in Cloud Storage, analyzed by Gemini vision. No photo-library access — only items the user hands to the app. |
| **User Content → Other User-Generated Content** | Yes | Yes | Saved URLs, extracted page text, notes/tags/collections, and Ask Machina questions + chat history. Sent server-side to Google Gemini for analysis. |
| **Usage Data** (product interaction, advertising data…) | **No** | — | No analytics or telemetry SDK exists in the app. |
| **Diagnostics** (crash data, performance) | **No** | — | No Crashlytics/Sentry or equivalent is integrated. |
| **Location / Contacts / Health / Financial / Browsing history / Search history** | **No** | — | Never requested or collected. (In-app search queries stay in the session; Ask questions are declared under User Content above.) |

Notes for edge cases:

- **Phone Number: do not declare — not collected.** The app never collects a
  phone number. (Capture is via the iOS share sheet, web add, and browser
  extension; there is no phone-based capture path.)
- "Linked to user" is **Yes** for everything collected — all data lives in the
  user's own workspace keyed by their UID.
- The two `PrivacyInfo.xcprivacy` manifests (App + ShareExt, UserDefaults
  `CA92.1`) must be in Copy Bundle Resources (§4 task 7) — the label above and
  the manifests must not contradict each other (they don't: manifests declare
  no tracking domains).

## 2. Metadata (App Store Connect → App Information / version page)

| Field | Value | Limit |
|---|---|---|
| **Name** | `Machina: Save & Recall` | 30 (22 used) |
| **Subtitle** | `Capture. Ask. Connect.` | 30 (22 used) |
| ~~Tagline~~ | The product tagline `Everything you save, finally useful.` is **not** an App Store field — see the note under this table before pasting it anywhere. | — |
| **Category** | Primary: **Productivity**. Secondary (optional): Utilities. | |
| **Privacy Policy URL** | `https://mymachina.app/privacy` | |
| **Support URL** | `https://mymachina.app` | public ✅ |
| **Marketing URL** (optional) | `https://mymachina.app` | public ✅ |
| **Support email** | `support@mymachina.app` | forwards to the owner's Gmail |
| **Copyright** | `© 2026 Mor Hogeg` | |

✅ **The root is a public landing page as of 2026-08-06** (task 25,
`web/components/LandingPage.tsx`). Both rows above are final. A signed-out
visitor to `https://mymachina.app` now gets the marketing page — what the
product is, what it does, where it runs, what happens to their data, and links
to the policy pages — with sign-in one click behind it. The app itself is
unchanged and still lives at the same root for anyone signed in, and the iOS
shell never sees the landing page at all.

**`https://mymachina.app/welcome` is the same page as a fully static route** (no
auth context, prose in the prerendered HTML). Prefer the bare root for these two
fields — it is what Google's branding review checks — but `/welcome` is the URL
to quote if a reviewer ever claims the home page needs JavaScript to read.
`/privacy` and `/terms` remain genuinely public and unchanged.

⚠️ **Do not put the tagline in the Subtitle field.** Machina's tagline is
`Everything you save, finally useful.` (`docs/BRANDING.md` D-6) and it belongs on
the web, the README, the film endcard and Product Hunt — **not here.** Two
reasons, either one fatal: it is **36 characters** against a 30-character field
with no cut that survives, and it re-spends **`save`**, already a Name token, so
the index gains nothing while the field loses characters. `Capture. Ask.
Connect.` stays. This note exists because "the app has a tagline, why isn't it
the subtitle?" is the obvious question, and the answer is not obvious.

**Promotional text** (170 chars, editable without review):

> One place for everything you save — links, screenshots, videos, from any app.
> Machina reads all of it, so you can find it later by just asking.

**Keywords** (comma-separated, no spaces after commas):

```
second brain,read later,bookmarks,ai summary,knowledge base,notes,pkm,summarize,organize,links,video
```

**100/100 chars** — recounted 2026-08-23; the doc had claimed 98 and the field
was actually 94, so six characters were sitting unused. Rules that shaped this
list:

- **Never repeat a word already in the Name or Subtitle** — Apple indexes those
  fields and builds search phrases by combining tokens across all of them. The
  name supplies `machina`, `save`, `recall`; the subtitle supplies `capture`,
  `ask`, `connect`. That is why `save links` and `recall` were dropped from
  this field (they were here when the name was `Machina AI`) — `save` + `links`
  still forms the phrase for free — **except it did not**, which the 2026-08-23
  recount caught: Apple builds phrases from tokens that are *present* in some
  field, and `links` was in none of them, so "save links" was never being
  formed. `links` is now in the field — that is exactly what the six unused
  characters bought, and `video` keeps its slot. `research` is named in this
  rule as having been bought and never was: it is not in the field, and at
  100/100 there is no longer room for it.
- **The subtitle must not repeat `save` or `recall`.** Both are Name tokens, and
  a token indexed twice buys nothing while costing subtitle characters. This is
  why the subtitle opens on `Capture` rather than the more obvious `Save`, and
  why `ask` was dropped from this keyword list once the subtitle started
  supplying it.
- **`ai` must live here now.** It used to be indexed via the old `Machina AI`
  name; with "AI" out of the name it is carried by the `ai summary` token.
- **`second brain` stays in this field and nowhere else.** It is the
  highest-volume term in the category, but the label carries connotations the
  product deliberately does not claim — keywords are invisible to users, so this
  captures the search traffic without putting it on the storefront. Do not
  promote it into the Name, Subtitle, or promotional text. See `docs/BRANDING.md`.

**Description:**

> You save links, screenshots, and videos across a dozen different apps — then
> never remember where you put them. Machina is the one place that holds all of
> it.
>
> Share anything to Machina from any app. It reads the page, watches the video,
> looks at the screenshot — and turns each save into a clean card with a real
> summary, category, tags, and connections to things you saved before.
>
> And because it read all of it, you can just ask. "What did I save about
> mortgage rates?" Machina answers in plain language, with citations that jump
> back to your own sources.
>
> CAPTURE FROM ANYWHERE
> • iOS share sheet — save from Safari, or any app with a Share button
> • Web app on your computer — paste a link, drop in a screenshot, jot a note
>
> UNDERSTAND WHAT YOU SAVED
> • A real summary, a category, and tags on every save — written, not scraped
> • "See also" connections between related saves
> • Search that finds what you meant, not just the words you typed
>
> COME BACK TO IT
> • Ask Machina — questions answered from your own saves, with citations
> • Weekly synthesis — themes and standouts from your week's saves
> • Reminders and digests, on your schedule
> • Collections you can keep private or publish as a shareable page
>
> Private by design: no ads, no tracking, and your content is never used to
> train anyone's models. Sign in with Apple or Google. Delete your account — and all
> your data — anytime, right from Settings.

**Rules this description obeys (swept 2026-08-23 under BRANDING A-5) — read
before editing it:**

- **It opens on fragmentation, not clutter.** "…across a dozen different apps —
  then never remember where you put them" is `BRANDING` **D-7**'s hero
  (*one place that holds everything you save*) and the launch film's act one.
  The previous opening — *"then never look at them again"* — was a clutter
  story, which is the recall problem, one step further down the funnel.
- **The word `AI` does not appear, anywhere.** D-3 restricts `ai` and
  `second brain` to the invisible keywords field. Two occurrences were removed
  here: the summaries bullet (now describes the output, not the machine) and
  the training-data promise (now *"train anyone's models"*, matching
  `web/components/LandingPage.tsx`, which is the strongest phrasing anyway —
  it covers Google as well as us).
- **The browser extension is NOT promised.** It exists but installs
  load-unpacked only — there is no Chrome Web Store listing (§4 backlog). An
  App Store description that offers a browser extension is a claim a reviewer
  can test and a user can be disappointed by, so the capture list stops at the
  share sheet and the web app. Put it back the day the store listing is live.
- **The promotional text leads on the gathering too**, and it is the only field
  here editable without a review round — so it is the cheapest place to test
  positioning after launch (Q-2).

**Age rating questionnaire:** answer **None/No to everything** (no violence,
no sexual content, no profanity, no horror, no gambling/contests, no drugs, no
unrestricted web access — Machina renders extracted article text, not a general
browser, and no user-to-user interaction). Result: **4+**.

### 2.1 Compliance check — run 2026-08-23 (copy + metadata only)

Every field re-counted from the strings actually written above, not from the
numbers this doc used to claim (two of which were wrong — see the keyword rule).

| Field | Limit | Used | |
|---|---|---|---|
| Name `Machina: Save & Recall` | 30 | 22 | ✅ |
| Subtitle `Capture. Ask. Connect.` | 30 | 22 | ✅ |
| Keywords | 100 | **100** | ✅ (was 94 — six characters were idle) |
| Promotional text | 170 | 143 | ✅ |
| Description | 4000 | 1402 | ✅ — deliberately short; length is not a ranking signal (only the keywords field is indexed), and the first ~3 lines are all most people read before "more" |

**Guideline checks — verified against the copy as written:**

- **2.3.1 / 2.3.12 (accurate metadata).** Every feature named in the description
  ships: share sheet, web capture, summary/category/tags, "See also", meaning
  search, Ask with citations, weekly synthesis, reminders + digests, public
  collections. The **browser extension was removed** from the capture list on
  2026-08-23 — it installs load-unpacked only, so promising it here was a claim
  a reviewer could test and fail.
- **2.3.7 (third-party trademarks).** The share-sheet bullet named `YouTube` and
  `X`; both are gone. It now reads "Safari, or any app with a Share button" —
  Safari is Apple's own, the claim is broader and true, and no other company's
  mark appears in any field. The keywords field carries no competitor names.
- **2.3.10 (references to other platforms).** No Android, no Google Play, no
  "also available on…". The web app is named, which is not a *mobile* platform
  and is standard.
- **4.8 (Sign in with Apple).** Third-party sign-in is offered (Google), so
  Sign in with Apple is mandatory — it ships, and the description names both.
- **5.1.1(v) (account deletion).** In-app deletion exists (Settings → Delete
  account) and the description says so.
- **5.1.1 / privacy claims.** *"your content is never used to train anyone's
  models"* is **substantiated, not aspirational**: the Gemini Developer API's
  terms split by tier, and the owner confirmed **paid tier** (Tier 1, project
  `gen-lang-client-0057642876`, real daily spend) — see the 2026-08 §9 entry in
  `SOURCE_OF_TRUTH.md`. ⚠️ **The guarantee is per Cloud project**, so the
  pending Gemini key rotation (§4 task 5) must mint into **that same project**
  or this sentence silently becomes false on the storefront, in `/privacy`, and
  on the landing page. That is the one open item that could turn good copy into
  a misrepresentation.
- **Age rating 4+ — "unrestricted web access: No" is defensible.** Verified in
  code: opening a saved link calls `window.open(url, '_blank')`, which on the
  native shell hands off to **Safari** (`web/lib/share.ts:56`). There is no
  in-app browser, and the reading view renders extracted text, not live pages.
- **Export compliance.** `ITSAppUsesNonExemptEncryption = false` is already in
  `web/ios/App/App/Info.plist:52` — correct for an HTTPS-only app, and it is
  what stops App Store Connect asking at every upload.

**Open, and owner-only:**

1. **The demo account in §3 is still `REVIEWER_EMAIL_TBD` / `PASSWORD_TBD`.**
   This is a hard submission blocker — App Review rejects an account-gated app
   with no working credentials. It is creatable now (the cutover is done).
2. **App Review contact** (first/last name, phone, email) on the version page —
   not tracked anywhere in this doc; fill it at submission.
3. **Hebrew localization of the listing — the largest remaining ASO gap.** The
   app is fully bilingual and RTL-hardened, but the listing is English-only, so
   Hebrew queries index nothing. App Store Connect gives each localization its
   **own 100-character keyword field**, so this is purely additive — it cannot
   cost the English ranking. Draft below; **the owner is the native speaker and
   should treat this as a starting point, not finished copy.**

   | Field | Draft (he) |
   |---|---|
   | Name | `Machina — שמירה ושליפה` |
   | Subtitle | `לשמור. לשאול. לחבר.` |
   | Keywords | `מוח שני,סימניות,לקרוא אחר כך,בסיס ידע,סיכום,פתקים,ארגון,קישורים,מאמרים,שמירה` |
   | Promo | `מקום אחד לכל מה ששמרת — קישורים, צילומי מסך וסרטונים, מכל אפליקציה. Machina קוראת את הכול, כדי שתמצא הכול אחר כך פשוט בשאלה.` |

   Note the D-3 rule still applies per-language: `מוח שני` ("second brain") is
   in the **keywords field only** and must not reach the Hebrew subtitle,
   promo text, or description.

## 3. App Review notes (paste into "Notes" on the version page)

> **Demo account** (Sign in with Apple/Google cannot be shared, so use this
> reviewer account):
> Email: `REVIEWER_EMAIL_TBD` Password: `PASSWORD_TBD`
> ⚠️ Fill these in after the auth cutover: create a fresh Google account (or an
> email+password test account if enabled) reserved for review. Note that ANY
> fresh sign-in auto-creates a new, empty workspace with a one-screen welcome —
> the reviewer does not need pre-provisioned data, but pre-seeding the demo
> account with a few saved cards will demo Ask/synthesis better.
>
> Suggested wording for the notes field:
>
> "Machina is a personal knowledge base: save links/images from the iOS share
> sheet, AI analyzes them, and you can ask questions answered from your own
> saves.
>
> • Sign-in: Google and Sign in with Apple are both supported. Signing in with
> any new account automatically creates a fresh workspace — no invitation or
> setup needed. Demo account above if preferred.
>
> • AI disclosure: on first run the app shows a consent notice explaining that
> saved content and questions are processed by Google Gemini. This is also
> covered in our privacy policy (https://mymachina.app/privacy).
>
> • To test capture, use the share sheet: open any page in Safari → Share →
> Machina → the card appears in the feed within ~15 seconds.
>
> • Account deletion is available in-app: Settings → Delete account.
>
> • No purchases, no ads, no tracking."

(Keep the AI-consent sentence in sync with §4 task 6 — the consent screen must
actually be in the submitted build.)

## 4. Screenshot shot-list (6.9" iPhone required; reuse for 6.5")

Take on an iPhone Pro Max simulator/device, dark theme (the app's signature
look), realistic-but-curated workspace (8–12 saves across articles, a YouTube
video, a screenshot; no personal data, no real phone numbers). Status bar
clean (9:41, full battery). Order matters — the first two sell the app.

1. **Feed** — the money shot. Masonry feed with a mix of card types (article
   with image, YouTube card, screenshot card), visible summaries/tags, one
   card showing a connection insight. Caption overlay idea: "Everything you
   save, understood."
2. **Ask Machina with a cited answer** — a question like "what did I save
   about mortgage rates?" with the streamed answer and 2–3 citation chips
   visible. Caption: "Ask your saves anything."
3. **Card detail with See also** — LinkDetailModal open on a rich card:
   summary, tags, category, and the "See also" related-links section showing
   2–3 connections. Caption: "Every save gets connected."
4. **Share-sheet capture** — Safari open on a real article with the iOS share
   sheet up and Machina selected (or the ShareExt confirmation HUD). Caption:
   "Save from anywhere in two taps."
5. **Weekly synthesis** — the synthesis card open: themes of the week, the
   standout save, the open question. Caption: "Your week, synthesized."
6. **Collections** — collections gallery with 3–4 named collections with
   cover images; optionally one shown as a public share page. Caption:
   "Curate it. Share it (or don't)."

iPad: not planned — `TARGETED_DEVICE_FAMILY` is already `1` (iPhone-only) in all
build configs, so no iPad screenshots are needed.

## 5. Remaining manual steps (owner)

- [ ] Fill the App Privacy declarations in Connect per §1.
- [ ] Enter metadata per §2 (after the auth cutover, when the store build exists).
- [ ] Create + seed the reviewer demo account; fill credentials into §3.
- [ ] Take the 6 screenshots per §4.
- [x] `TARGETED_DEVICE_FAMILY = 1` (iPhone-only) — already set in all build configs.
- [ ] Verify the AI-consent screen (§4 task 6) is in the submitted build before
      using the review-notes wording above.
