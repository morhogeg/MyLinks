# App Store submission pack — Machina AI

> Reference doc for filling out App Store Connect (§4 tasks 8–9 in
> `SOURCE_OF_TRUTH.md`). Everything here was written against the actual
> codebase on 2026-07-03. Legal pages are live at
> https://my-links-sable.vercel.app/privacy and …/terms (public — they bypass
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

- **Phone Number: do not declare.** The app itself never collects a phone
  number. WhatsApp capture happens entirely outside the app (user messages a
  Twilio WhatsApp number) and is optional; it is disclosed in the privacy
  policy, which is the right surface for it. If you prefer maximum caution you
  *may* add Contact Info → Phone Number (linked, app functionality), but it is
  not required for data collected outside the app binary.
- "Linked to user" is **Yes** for everything collected — all data lives in the
  user's own workspace keyed by their UID.
- The two `PrivacyInfo.xcprivacy` manifests (App + ShareExt, UserDefaults
  `CA92.1`) must be in Copy Bundle Resources (§4 task 7) — the label above and
  the manifests must not contradict each other (they don't: manifests declare
  no tracking domains).

## 2. Metadata (App Store Connect → App Information / version page)

| Field | Value | Limit |
|---|---|---|
| **Name** | `Machina AI` | 30 |
| **Subtitle** | `Ask your saves anything` | 30 |
| **Category** | Primary: **Productivity**. Secondary (optional): Utilities. | |
| **Privacy Policy URL** | `https://my-links-sable.vercel.app/privacy` | |
| **Support URL** | `https://my-links-sable.vercel.app` | |
| **Marketing URL** (optional) | `https://my-links-sable.vercel.app` | |
| **Copyright** | `© 2026 Mor Hogeg` | |

**Promotional text** (170 chars, editable without review):

> Machina reads everything you save — links, screenshots, videos — and answers
> questions from it, with sources.

**Keywords** (comma-separated, no spaces after commas; 92/100 chars):

```
second brain,read later,bookmarks,ai summary,save links,knowledge base,notes,recall,pkm,ask
```

(Don't repeat "machina" or "ai" from the name — the name field already indexes
them.)

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
> • WhatsApp — forward a link or photo to your Machina number (optional)
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
> covered in our privacy policy (https://my-links-sable.vercel.app/privacy).
>
> • WhatsApp capture is OPTIONAL and requires messaging an external
> WhatsApp/Twilio phone number from the user's own WhatsApp — it is not
> testable from inside the app and no app functionality depends on it. To test
> capture, please use the share sheet instead: open any page in Safari → Share
> → Machina → the card appears in the feed within ~15 seconds.
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

iPad: not planned — flip `TARGETED_DEVICE_FAMILY` to `1` (iPhone-only) before
submission (§4 task 9) instead of producing iPad screenshots.

## 5. Remaining manual steps (owner)

- [ ] Fill the App Privacy declarations in Connect per §1.
- [ ] Enter metadata per §2 (after the auth cutover, when the store build exists).
- [ ] Create + seed the reviewer demo account; fill credentials into §3.
- [ ] Take the 6 screenshots per §4.
- [ ] Set `TARGETED_DEVICE_FAMILY = 1` (or produce iPad screenshots).
- [ ] Verify the AI-consent screen (§4 task 6) is in the submitted build before
      using the review-notes wording above.
