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
`Everything you save, finally useful.` (`docs/BRANDING.md` D-6). In this listing
it belongs in the **promotional text** (drafted below), not in the Subtitle. Two
reasons, either one fatal: it is **36 characters** against a 30-character field
with no cut that survives, and it re-spends **`save`**, already a Name token, so
the index gains nothing while the field loses characters. `Capture. Ask.
Connect.` stays. This note exists because "the app has a tagline, why isn't it
the subtitle?" is the obvious question, and the answer is not obvious. Asked and
answered again 2026-08-25; the tagline now leads the promotional text so the
listing carries it without the Subtitle paying for it.

**Promotional text** (170 chars, editable without review):

> Everything you save, finally useful. Save links, screenshots and videos from
> any app. Machina reads and connects them, answers questions with sources,
> recaps your week.

168/170 chars. Owner rejected an earlier draft (2026-08-25) for covering only
capture and Ask: **this field has to carry the whole product, not the demo.**
Five beats in 26 words, in the order a user meets them: the tagline, capture
breadth (the formats AND "from any app", which is the share sheet, web and
extension in three words), the analysis, Ask with citations, and the weekly
synthesis. Only Collections is left out, deliberately: it is the least
differentiating pillar and the one a new user reaches last, and §2's
description covers it under COME BACK TO IT.

⚠️ At 168/170 there is no slack. Any edit needs a cut first, so do not "just
add" a word in Connect. **This is where the D-6 tagline lives in the listing** (owner
call 2026-08-25), and it is the answer to "why isn't the tagline the
subtitle?". It cannot be the Subtitle: the line is **35 characters** against a
30-character field, and it re-spends `save`, already a Name token, so the index
gains nothing (see the ⚠️ note above the keywords). Promotional text has none
of those constraints — 170 characters, no search index, editable without a
review cycle, and it renders directly under the subtitle in the listing. So the
brand line still greets a visitor to the store page; it just is not spending
the one field that doubles as an ASO slot.

Also note the em dashes are gone from this field. The rest of the store copy
should follow (`SOURCE_OF_TRUTH.md` §4 item 11a3): App Store text is read by
exactly the audience most primed to notice AI-written prose.

**Keywords** (comma-separated, no spaces after commas):

```
second brain,read later,bookmarks,ai summary,knowledge base,notes,pkm,summarize,organize,video
```

98/100 chars. Rules that shaped this list:

- **Never repeat a word already in the Name or Subtitle** — Apple indexes those
  fields and builds search phrases by combining tokens across all of them. The
  name supplies `machina`, `save`, `recall`; the subtitle supplies `capture`,
  `ask`, `connect`. That is why `save links` and `recall` were dropped from
  this field (they were here when the name was `Machina AI`) — `save` + `links`
  still forms the phrase for free. The reclaimed characters bought `summarize`,
  `organize`, `research`, and `links`.
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

> You save links, screenshots, and videos everywhere — then never look at them
> again. Machina fixes the second half.
>
> Share anything to Machina from any app. It reads the page, watches the video,
> looks at the screenshot — and turns each save into a clean card with a real
> summary, category, tags, and connections to things you saved before.
>
> Then comes the part that feels like magic: ask your saves a question.
> "What did I save about mortgage rates?" Machina answers in plain language,
> with citations that jump back to your own sources.
>
> CAPTURE FROM ANYWHERE
> • iOS share sheet — save from Safari, YouTube, X, anywhere
> • Web app and browser extension on your computer
>
> UNDERSTAND WHAT YOU SAVED
> • AI summaries, categories, and tags on every save
> • "See also" connections between related saves
> • Semantic search that finds meaning, not just keywords
>
> COME BACK TO IT
> • Ask Machina — cited answers from your own knowledge
> • Weekly synthesis — themes and standouts from your week's saves
> • Reminders and digests, on your schedule
> • Collections you can keep private or publish as a shareable page
>
> Private by design: no ads, no tracking, and your content is never used to
> train AI models. Sign in with Apple or Google. Delete your account — and all
> your data — anytime, right from Settings.

**Age rating questionnaire:** answer **None/No to everything** (no violence,
no sexual content, no profanity, no horror, no gambling/contests, no drugs, no
unrestricted web access — Machina renders extracted article text, not a general
browser, and no user-to-user interaction). Result: **4+**.

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
