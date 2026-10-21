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

Declare exactly these **9 data types** (across 7 categories — Connect counts
the types, not the categories, so "9 data types" on the summary screen is the
correct total). ⚠️ **OWNER, 2026-10-06:** the label published 2026-08-26 has
the first 7 rows only. Add **Purchases → Purchase History** (Machina Pro
shipped 2026-09-02: RevenueCat receives the purchase receipts, keyed to the
Firebase auth uid) and **Identifiers → Device ID** (the FCM/APNs push token
stored on the user doc) in App Store Connect before submitting. The app's
`PrivacyInfo.xcprivacy` already declares all 9 (launch audit, 2026-10-06). For every one: **Used for Tracking = No** and **Linked to
user = Yes**. Purpose is **App Functionality** for all of them EXCEPT Product
Interaction, which is **Analytics** — see the two rows flagged below.

| Connect data type | Collected? | Linked to user? | Why (justification you can defend) |
|---|---|---|---|
| **Contact Info → Email Address** | Yes | Yes | Received from Google/Apple sign-in via Firebase Auth; stored on the user doc to identify the workspace. |
| **Contact Info → Name** | Yes | Yes | Display name from the Google/Apple account, shown in the app (profile avatar). |
| **Identifiers → User ID** | Yes | Yes | Firebase Auth UID + workspace ID key all user data (`users/{uid}`). |
| **User Content → Photos or Videos** | Yes | Yes | Images/screenshots the user explicitly shares into the app (share sheet or in-app add); stored in Cloud Storage, analyzed by Gemini vision. No photo-library access — only items the user hands to the app. |
| **User Content → Other User-Generated Content** | Yes | Yes | Saved URLs, extracted page text, notes/tags/collections, and Ask Machina questions + chat history. Sent server-side to Google Gemini for analysis. |
| **Usage Data → Product Interaction** | **Yes** | Yes | ⚠️ CORRECTED 2026-08-26 (was wrongly "No"). `web/lib/analytics.ts` writes first-party, content-free events (app opened, save/ask/export happened) to `users/{uid}/analytics_events`. **Purpose = Analytics**, NOT App Functionality — the app behaves identically if every write fails, so it enables no user-facing feature. |
| **Diagnostics → Crash Data** | **Yes** | Yes | ⚠️ CORRECTED 2026-08-26 (was wrongly "No"). `web/lib/errorReporter.ts` writes uncaught error messages + stack traces to `users/{uid}/client_errors` (and `/api/client-error` when no workspace resolves). Purpose = App Functionality — Apple lists "diagnosing bugs and troubleshooting" under it. |
| **Purchases → Purchase History** | **Yes** | Yes | ⚠️ ADDED 2026-10-06 (owner: add in Connect). Machina Pro is an auto-renewable subscription; RevenueCat (`web/lib/purchases.ts`, app user id = Firebase auth uid) and `entitlements/{uid}` hold its state. Purpose = App Functionality. |
| **Identifiers → Device ID** | **Yes** | Yes | ⚠️ ADDED 2026-10-06 (owner: add in Connect). The FCM/APNs push token (`users/{uid}.fcmTokens`), used only to deliver reminders and digests. Purpose = App Functionality. |
| **Usage Data — all other subtypes** / **Diagnostics — performance, other** | No | — | Not collected. |
| **Location / Contacts / Health / Financial / Browsing history / Search history** | **No** | — | Never requested or collected. (In-app search queries stay in the session; Ask questions are declared under User Content above.) |

**Why the two corrections (2026-08-26).** Both original rows reasoned about
THIRD-PARTY SDKs ("no Crashlytics/Sentry", "no analytics SDK"), but Apple's
question is whether the data is collected at all — self-hosted collection into
your own Firestore counts, and both pipes are keyed by uid so both are
"linked". Declaring "No" on data the app demonstrably collects is the class of
inaccuracy that gets a label rejected or an app pulled later. Neither costs
anything to declare honestly: no tracking, no third parties, no data sale.
`web/app/privacy/page.tsx` already documents both pipes ("Product usage and
diagnostics" bullet + §9 retention), so policy, label, and code now agree.

Notes for edge cases:

- **Phone Number: do not declare — not collected.** The app never collects a
  phone number. (Capture is via the iOS share sheet, web add, and browser
  extension; there is no phone-based capture path.)
- "Linked to user" is **Yes** for everything collected — all data lives in the
  user's own workspace keyed by their UID.
- The two `PrivacyInfo.xcprivacy` manifests must be in Copy Bundle Resources
  (§4 task 7), and the label above and the manifests must not contradict each
  other. As of 2026-10-06 the App manifest declares the same 9 types as this
  table, the ShareExt manifest declares the two it sends (Other User Content,
  Photos or Videos), neither declares tracking or tracking domains, and the
  required-reason entries are UserDefaults `CA92.1` + `1C8F.1` (App Group) and,
  for the extension, FileTimestamp `C617.1` (its own temp files). (Until then
  the App manifest declared only Email, Other User Content and Device ID, so
  this sentence used to be false.)

## 2. Metadata (App Store Connect → App Information / version page)

| Field | Value | Limit |
|---|---|---|
| **Name** | `Machina: Save, Ask & Recall` (D-2a, 2026-09-01 — entered in ASC) | 30 (27 used) |
| **Subtitle** | `Never lose another great find` | 30 (29 used) |
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
the index gains nothing while the field loses characters. This note exists
because "the app has a tagline, why isn't it the subtitle?" is the obvious
question, and the answer is not obvious. Asked and answered again 2026-08-25;
the tagline now leads the promotional text so the listing carries it without
the Subtitle paying for it.

**Subtitle replaced 2026-08-26 (owner-approved): `Capture. Ask. Connect.` →
`Never lose another great find`.** The old line was correctly engineered but
generic — three verbs any productivity app could claim — and 2026 ASO guidance
is unambiguous that the subtitle is a conversion field first, index field
second. The new line is the owner's origin story ("saved countless things,
scattered, never used again") as a spoken sentence: "another" implies the past
losses without spending a word looking backward, and the line ends on "find",
the word with the image in it. Rejected on the way, so they are not re-pitched:
"Answers from your own library" (owner: Ask is a feature, not the point — the
core value is one place + saves made useful), "One place. Summarized. Sorted."
and "All in one place, summarized" (fragments / unsophisticated), "Your memory
for everything" (owner preferred the loss-aversion direction), "Never lose it.
Actually use it." (fragments leaning on an unnamed "it"), "Never lose what's
worth keeping" (elegant but abstract, and "keeping" is a near-synonym of a Name
token doing no index work). **Index cost, accepted knowingly:** `capture`,
`ask`, and `connect` leave the index, and `ask` briefly appeared in NO field (it
was dropped from keywords when the old subtitle supplied it — low-volume,
accepted at the time; **resolved 2026-09-01: the D-2a Name
`Machina: Save, Ask & Recall` now carries `ask` at Name weight**, so do NOT
re-add it to keywords). Gained: `never`,
`lose`, `another`, `great`, `find` — `lose` and `find` are the useful ones.

**Promotional text** (170 chars, editable without review):

> Every link, screenshot, and video you save, summarized and connected.

69/170 chars. **LIVE 2026-10-21 (owner-chosen).** Replaced the 2026-08-25
version below because the field is the first sentence a visitor reads on the
product page and must show in full above "more" on a phone (two lines, no
truncation). It no longer opens with the tagline: the new product page header
(`header-21x9-3840x1646.png`) already says "Everything you save, finally
useful." directly above it. The owner wanted the line to lead with the analysis
(what each save becomes), not the recall ("brings them back when they matter"
was rejected as less crucial here); "without reading it all" and "get the key
points back" were also rejected. Previous text, kept for the record:
"Everything you save, finally useful. Save links, screenshots, and videos from
any app. Machina summarizes and connects each one, so you can ask about
anything you saved."

The 2026-08-25 rules below still hold for this field; the one that changed is
rule 3 (the opening is no longer pinned to the tagline). The rules
that survived, each earned by a rejection:

1. **Carry the whole product**, not just the demo.
2. **Verbs are outcomes, not processes.** "reads" is what the machine does;
   "summarizes" is what you get.
3. **The opening is pinned**: the tagline plus "Save links, screenshots and
   videos from any app." The concrete formats do real work, and "from any app"
   is every capture surface in three words.
4. **This field is a hook, not a spec.** An earlier tail spelled out the
   citation mechanic ("by quoting your saves") and read as sloppy for exactly
   that reason: it made one sentence do the description's job. "answers
   whatever you ask" replaced it, and was itself replaced (round 5) for being
   the sentence every AI app writes: it described a generic chatbot and hid the
   only thing that makes this one different.
5. **No personification, and the close names the moat.** A library is a
   collection, not something that answers you: "a library you can ask anything"
   was rejected on exactly that (round 7), and it is worth remembering that the
   phrase is common in AI note apps, which is why it sounded fine to everyone
   who follows the category and odd to everyone who does not. Machina is the
   implied listener now, which is a thing people really do ask, and "anything
   you saved" keeps the moat: the answers come from the user's own material.
   Grammar note, the reason the sentence reads clean: "summarizes and connects
   each one" needs no preposition, so both verbs share one object with nothing
   to trip over. The earlier "summarizes and connects them INTO a library" made
   a single prepositional phrase serve both verbs, and you do not summarize
   something *into* a thing.
6. **"so" does the welding** (round 6). "Your library" is the point: the answers come from the user's own
   material, not the internet. But an earlier close, "Machina summarizes and
   connects them. Then ask your library anything.", put a full stop between the
   two halves, and the full stop severed the causal link, leaving three claims
   standing next to each other. "into a library you can ask anything" makes the
   summarizing and connecting the process that BUILDS the library, and the
   library the thing you question: one movement from save to answer.

The weekly synthesis is not in this field. It does not fit alongside the pinned
opening, and it is the fourth thing a user meets; the description carries it
under COME BACK TO IT. There are now 16 characters of slack, but spending them
on a fourth beat is what made the previous three drafts read as a list.

**Keywords** (comma-separated, no spaces after commas):

```
second brain,read later,bookmarks,ai summary,knowledge base,notes,pkm,links,organize,video,research
```

99/100 chars. Revised 2026-08-26 (owner-approved): the previous list claimed
`save links` formed across fields for free, but `links` appeared in **no**
field (not Name, Subtitle, or keywords), so the phrase could never form.
`summarize` was dropped to pay for it — its stem is already carried by
`summary` inside `ai summary` — and the remaining room restored `research`,
which the rationale below had always claimed was bought. Rules that shaped
this list:

- **Never repeat a word already in the Name or Subtitle** — Apple indexes those
  fields and builds search phrases by combining tokens across all of them. The
  name supplies `machina`, `save`, `recall`; the subtitle supplies `never`,
  `lose`, `another`, `great`, `find`. That is why `save links` and `recall` were dropped from
  this field (they were here when the name was `Machina AI`) — with `links` in
  this field and `save` in the Name, the `save links` phrase forms across
  fields. The reclaimed characters bought `links`, `organize`, and `research`.
- **The subtitle and keywords must not repeat `save`, `ask`, or `recall`.** All
  three are Name tokens (D-2a, 2026-09-01), and a token indexed twice buys
  nothing while costing characters. This is why every "your saves,
  summarized"-shaped candidate was disqualified during the 2026-08-26 subtitle
  replacement before taste even entered. `ask` was field-less between the
  2026-08-26 subtitle replacement and the 2026-09-01 rename; the Name now
  carries it.
- **`ai` must live here now.** It used to be indexed via the old `Machina AI`
  name; with "AI" out of the name it is carried by the `ai summary` token.
- **`second brain` stays in this field and nowhere else.** It is the
  highest-volume term in the category, but the label carries connotations the
  product deliberately does not claim — keywords are invisible to users, so this
  captures the search traffic without putting it on the storefront. Do not
  promote it into the Name, Subtitle, or promotional text. See `docs/BRANDING.md`.

**Description:**

> You save things all day: links, screenshots, videos, articles you meant to finish. Then you never open them again. Machina changes that.
>
> Share anything to Machina from any app:
> A long video becomes a few key points.
> A screenshot turns into searchable text.
> A how-to article becomes your next step.
> And it all connects to what you saved.
>
> Find it again
> • Ask a question, get answers from your saves
> • Search by meaning, not exact words
> • Collections that build themselves
>
> Bring it back
> • A reminder when it's time to revisit
> • A weekly synthesis of what you learned
> • A to-do list built from your saves
>
> Private by design. No ads, no tracking, and your content is never used to train AI models.

**Final version, live 2026-10-21 (owner-approved after many rounds).** What
it settled, so later edits keep it:
- **No "Save from anywhere" section.** The second paragraph already is the
  save pitch; every capture bullet tried (app names, batch screenshots, notes,
  "pasted or typed") either repeated it or claimed something too narrow.
- **The second paragraph is one line per transformation**, each 40 characters
  or less, so nothing wraps at phone width: no sentence-opening "A" stranded at
  a line end and no "how-to" split at its hyphen. Keep every line in that block
  under ~41 characters. Alternating "becomes / turns into" is the owner's choice.
- **"How-to article", not "an article"**: Machina only writes an action item
  when a save holds something to do, so "an article becomes your next step"
  would overpromise.
- **Bullets are benefits, one line each.** "Search by meaning" (not "Find…",
  which doubled the heading); "A to-do list built from your saves" is how
  Revisit's Do this list reads, and avoids repeating "your next step".
- "Collections that build themselves" matches screenshot 5's caption; strictly,
  Machina suggests and the user taps Create.

**Rewritten 2026-10-21 (owner: the old one "looks TERRIBLE" in App Store
Connect's preview).** About 40% shorter. Sentence-case headings instead of ALL
CAPS, which shouted at phone width. Every bullet fits one line at phone width
(the old bullets wrapped to two). The three sections follow the screenshot
story: save, find, bring back. Dropped: personal notes on cards and publishing
a collection as a page (real features, cut for length). Owner edits before
it went live: "clean" dropped from the card line, the screenshot bullet now
reads "Screenshots, analyzed and categorized" (was "up to five per card"), "next
step" became "action item", and the account-deletion sentence was cut from
the close (deletion stays in Settings and the privacy policy). The notes history
below explains the old two-bullet split; "Links and notes, pasted or typed"
now covers note cards.

**Notes split into two bullets 2026-08-26 (owner-caught).** The old capture
line, "Or paste a link and write your own note, right in the app", implied
notes exist only as an appendix to a pasted link. Both halves were wrong about
the product, which has TWO distinct note features:
1. **A note as its own card** — the "Note" tab in the + dialog
   (`storage.createNoteCard`, backend `analyze_link` note path) captures a
   URL-less thought and analyzes it into a first-class card, peer to links and
   images. That belongs under CAPTURE, which now reads "Paste a link, or write
   a note and save it as its own card".
2. **Personal notes on ANY card** — `link.userNotes` (an array, so many notes
   per card, each timestamped; see `web/lib/notes.ts` and the My Notes view),
   available on every save regardless of type. That is a come-back-to-it act,
   so it earns its own bullet under COME BACK TO IT.
The two are told apart by "as its own card" vs "to any card"; the product
calls both of them "notes", which is exactly why the single old bullet read as
one feature.

Two owner rules for this section (2026-08-25), both about audience:
**never "share sheet"** (our word, not a user's; say "tap Share"), and
**never the web app or browser extension.** This is an iOS listing: naming
other surfaces invites the reader to wonder whether they need them. The website
is where those belong.

The tagline deliberately does NOT open this. It leads the promotional text,
which renders immediately above the description on the same storefront screen,
so opening here too would print the same sentence twice, back to back. This
opening is the problem statement instead, which is what the tagline needs in
front of it to land.

Rewritten 2026-08-25 on owner review of the previous draft. What was wrong, so
it is not reintroduced:
- **Nine em dashes.** Gone, and none belongs here. This is the single surface
  read by the audience most primed to spot AI-written copy (`SOURCE_OF_TRUTH.md`
  §4 item 11a3). Colons and full stops do the same work.
- **"Machina fixes the second half"** was a riddle. It asked the reader to work
  out which half, above the fold, where App Store truncates. Replaced with a
  plain claim, "Machina makes them useful", which also echoes the D-6 tagline.
- **"Sign in with Apple or Google"** was cut. Nobody chooses an app for its auth
  providers, and it spent the closing line, which should carry trust instead.
  (It stays in the §3 review notes, where the reviewer genuinely needs it.)
- **"the part that feels like magic"** was cut as marketing filler.
- Privacy stays and leads the close: no ads, no tracking, never used to train
  models, and deletion. Those are real differentiators.

The first three lines are what shows before "more" on the storefront, so the
problem, the promise and the product all land above the fold.

Three surgical touch-ups 2026-08-26 (owner-approved), nothing structural:
the double "reads" in paragraph two became "reads … and pulls the text from"
(three abilities should feel distinct, not flattened by one repeated verb);
"links to the things you already saved" became "connections to the things"
(in an app whose content type IS links, "links to" momentarily reads as URLs —
"connections" is also the word the See-also bullet already uses); and the
UNDERSTAND bullet gained the serial comma the rest of the document uses.

**Age rating questionnaire:** answer **None/No to everything** (no violence,
no sexual content, no profanity, no horror, no gambling/contests, no drugs, no
unrestricted web access — Machina renders extracted article text, not a general
browser, and no user-to-user interaction). Result: **4+**.

## 3. App Review notes (paste into "Notes" on the version page)

> **Demo account (decided 2026-10-19: option (a), the seeded Google account).**
> Goes in App Store Connect → version page → **App Review Information →
> Sign-In Information** (tick "Sign-in required"):
> User name: `machinareviewer@gmail.com` Password: **only in App Store
> Connect, never in this file** (this repo is public).
> The account must sign in from a cold device with no 2FA prompt; see the
> owner steps in §5. On submit day, also: start a fresh 14-day trial for it
> and clear its `aiConsentAt` so the consent notice shows (launch checklist
> `pay-reviewer-plan`, `ios-consent`).
>
> Suggested wording for the notes field:
>
> "Machina is a personal knowledge base: save links and images from the iOS
> share sheet, AI analyzes them, and you can ask questions answered from your
> own saves.
>
> • Sign-in: tap Continue with Google and use the demo account in the Sign-In
> Information (a Google account we created for review, already holding a
> small library so Ask and the weekly synthesis have something to work
> with). Sign in with Apple also works: any new account gets its own empty
> workspace. If Google asks for an extra verification step, please contact us
> at support@mymachina.app and we will respond within hours.
>
> • AI disclosure: on first run the app shows a consent notice explaining that
> saved content and questions are processed by Google Gemini. This is also
> covered in our privacy policy (https://mymachina.app/privacy).
>
> • To test capture, use the share sheet: open any page in Safari → Share →
> Machina → the card appears in the feed within ~15 seconds.
>
> • Account deletion is available in-app: Settings → the account row at the
> top (your name or email) → Delete account.
>
> • In-app purchase: Machina Pro, an auto-renewable subscription (monthly or
> annual). Every new account gets a 14-day Pro trial on our server (not a
> StoreKit free trial). The demo account is on that trial, so all features
> are unlocked. To test the subscription: Settings → Pro trial → Keep Pro.
> Restore Purchases, the renewal terms and the Terms / Privacy links are on
> the same sheet.
>
> • No ads, no tracking."

(Keep the AI-consent sentence in sync with §4 task 6 — the consent screen must
actually be in the submitted build.)

**"Share sheet" deliberately stays in this section** (decided 2026-08-26). The
§2 ban on the phrase is about audience: users don't say "share sheet", but the
App Review reader is an Apple employee and it is their own precise terminology —
"tap Share" would be *less* clear here. Same text rule, two audiences, opposite
calls.

## 4. Screenshot shot-list (required slot: iPhone with Dynamic Island, medium display)

**Which slot (checked against Apple's screenshot specifications page,
2026-10-20):** the one REQUIRED iPhone size is now "iPhone with Dynamic Island
(medium display)", 1206×2622 or 1179×2556 portrait. App Store Connect rejects
1320×2868 there ("File dimensions are invalid", owner hit it 2026-10-20);
1320×2868 belongs to the optional large-display slot. iPad 13" is required only
if the app supports iPad (it doesn't: `TARGETED_DEVICE_FAMILY = 1`); iPhone
Duo screenshots become required from April 2027 for apps on the iOS 27.1 SDK.

**Final set, shot 2026-10-20 (owner-directed, light frame chosen).**
iPhone 17 Pro Max simulator (1320×2868, the 6.9" size), light theme, status
bar 9:41 / full battery, signed into the review account
`machinareviewer@gmail.com` (seed library below, on its Pro trial so no quota
lines show). Its four weekly syntheses come from the real pipeline
(`functions/tools/demo_weekly_synthesis.py`, Maintenance workflow). Demo-data
edits for legibility, all within what the product generates today: the newest
synthesis title shortened to "Cognitive biases and human control" (fits the
feed strip), and five legacy "Do this" tasks rewritten to today's rule (one
verb-first sentence, at most 20 words), each built on a concrete detail from
its own card. Every frame is a full, untouched app screen; the captioned
versions add the caption band and device frame. The first three can appear
in search results.

1. **Feed**: "This week in Machina" strip over the first card. Caption:
   "Everything you save, understood."
2. **Ask**: "What temperature should my bedroom be for sleep?" Two-sentence
   answer, two cited sources, Graph chip and follow-ups on one screen. Keep the
   question narrow: a broad one returns a long list that pushes the sources
   off screen. Caption: "Ask about anything you saved."
3. **Graph**: one card focused (Optimizing Sleep and Wakefulness), its
   connections lit, the "strong" reason in the panel. Caption: "Every save,
   connected."
4. **Capture**: Wikipedia's "Sleep hygiene" in Safari with the share sheet
   open, Machina first in the app row (made a share-sheet Favorite on the
   simulator; a third-party app hidden from the row). Caption: "Save from any
   app, in seconds." Not "two taps": in iOS 26 Safari, Share is under "…",
   so it is three. The page really was saved; it is now a card on the account.
5. **Collections**: the Collections tab, eight tiles in a 2×4 grid: seven
   collections, each with a 2×2 cover of its cards' images and a two-line
   description, then Machina's own dashed "Suggested · Japan Travel · 6
   cards" tile with Preview. Caption: "Collections that build themselves."
   (alternate in `alternates/`: "Every topic, in its own collection."). The
   frame depends on the cover fix in `web/components/CoverMosaic.tsx`, which
   is in **build 1379 and later** (merge `3240d78c`), so submit one of
   those: before it, every cover cell showed the top of its picture, a
   YouTube thumbnail's black letterbox bar included.
6. **Recall**: the "Remind me" sheet on Inside the Mind of a Master
   Procrastinator, Smart review selected ("Tomorrow 9:00 AM · then 1 week &
   1 month"). Caption: "Saved once, never forgotten." The reminder was then
   really saved (pending smart reminder on that card). Shot with the
   simulator region set to English (US) for 12-hour times, then set back to
   English (Israel). Alternate in `alternates/6-recall-lock-screen.png`: the
   same reminder arriving as a notification ("Time to revisit", the server's
   exact wording, delivered with `simctl push`). It lost to the sheet because
   it's mostly wallpaper, and its clock can't be pinned to 9:41.
7. **Weekly synthesis**: last week's write-up (Standout, Worth sitting with)
   above three earlier weeks. Caption: "What you learned, week by week."
8. **Do this**: Revisit's five next steps, two rows each, with last week's
   synthesis and the archive below. Caption: "Turn what you save into what
   you do."

Captions 4–7 were rewritten 2026-10-20 with the owner: "Your week, in one
card." misdescribed a screen showing several weeks; "Curate it. Share it (or
don't)." read as a joke; YouTube key moments was dropped as a detail, not a
reason to download; capture was missing from the set entirely. The
collections shot was redone the same day: a single collection didn't read as
"a collection of cards", and the owner asked for eight collections with one
suggested. The Recall shot was added the same day so each word of the app
name has a shot: Save (4), Ask (2), Recall (6). Final order (owner, after
weighing Recall at #3): the graph stays #3 as the most distinctive image for
search results; 4–5 get things in and organized, 6–8 bring them back. The caption avoids
personification ("It remembers, so you don't." was rejected) and the
ungrammatical "No more saved and forgotten."

Demo data behind shot 5 (`machinareviewer`): 25 YouTube talks and explainers
imported through the app's own Import → Paste links (real pipeline, all
analyzed), filed into five new collections (Sleep better, Talks to rewatch,
Focus, Fitness, Happiness) plus the existing two, with descriptions and
palette colors set on all seven. The Japan Travel suggestion is the real
clusterer's output once the Inside Kyoto itinerary card carries the accurate
"japan travel" tag (added by hand). Longevity, Psychology, Mindset and
Productivity were dismissed with the tile's ✕, so the suggestion
on screen is the only one.

Files (not in git, 52 MB): the session worktree's
`app-store-screenshots/final/`; `preview-all-eight.jpg` shows the set in
order. **Upload `upload/screenshots-iphone-medium-1206x2622/`
1–8 in order to the medium-display slot** (the 1320×2868 originals resized,
text checked sharp; also on the owner's Desktop as "UPLOAD THESE - iPhone
medium display (1206x2622)"). `upload/screenshots-6.9-inch/` (1320×2868) is
optional, for the large-display slot. `header-and-search/` (header 21:9
3840×1646, search 3:2 3840×2560, universal 16:9 5244×2950, per Apple's
creative-assets specs) is for featuring nominations, not a screenshot slot.
Also `raw/` (uncaptioned), `captioned-light/`, `creative-light/`,
`alternates/`; superseded versions in `archive/`.

Captions revised 2026-08-26 (owner-approved) — this set had never had a review
round (written 2026-07-03, before the rename and the 08-25 copy rules), and two
captions broke rules the other fields had already earned. Caption 2 ("Ask your
saves anything") personified exactly the way "a library you can ask anything"
was rejected in the promotional text — saves don't listen; the replacement is
lifted verbatim from the approved promo close, so the storefront says it once
in prose and once over the proof. Caption 5's "synthesized" was our word, not
a user's (same class of error as "share sheet" in §2); the replacement says
the outcome and lets the shot demonstrate the mechanism. (Caption 5 refined
again later the same day, "What your week added up to." → "Your week, in one
card." — quieter than the rest of the set, replaced with something concrete
that the shot proves instantly, and it completes the comma rhythm shared by
captions 1, 3, and 5. Note the description's "Weekly synthesis:" bullet
deliberately KEEPS the word the captions dropped — it is the literal on-screen
label, `Feed.tsx` / `DigestView.tsx`, so the description teaches the UI's own
word while captions describe outcomes.) Caption 3 tightened
to pick up caption 1's comma rhythm so the set reads as a set. Captions 1, 4,
and 6 stand: 1's tagline echo is deliberate branding (the promo text sits on
the same screen), 4 is the only caption with a number on the shot where the
number is the point, and 6's parenthetical is the listing's one moment of
personality, carrying the privacy promise.

### Seed library for the demo workspace (compiled 2026-08-26, links verified)

Built as one believable person — planning a Japan trip, serious about sleep and
longevity, following AI — so the three graph clusters connect *through* the
persona and See-also chips look intelligent rather than random. 10 sources
below; the owner adds 2 finds from X (one to Japan, one to AI, **saved as
screenshots** so the feed has screenshot cards).

**Sleep & longevity (4):**
1. YT — Sleep Toolkit, Huberman Lab #84: https://www.youtube.com/watch?v=h2aWYjSA1Jc
   (covers jet lag → bridges to the Japan cluster)
2. YT — Sleep Is Your Superpower, Matt Walker, TED: https://www.youtube.com/watch?v=5MuIMqhT8DM
   (save LAST of the three "top of masonry" cards, see staging notes)
3. Article — Exercising for Longevity (zone 2/zone 5), Peter Attia: https://peterattiamd.com/exercising-for-longevity/
4. ~~Article — Toolkit for Sleep, Huberman newsletter~~ **REPLACED 2026-08-26**
   (round-16 follow-up) — same-author pairing with #1 read as one blogger's
   ecosystem rather than independent corroboration. Swapped for
   **Harvard Health — "The 5 Pillars of Longevity"**:
   https://www.health.harvard.edu/healthy-aging-and-longevity/the-5-pillars-of-longevity-movement-nutrition-sleep-stress-reduction-and-social-connection
   (device-saved card title reads **"Pathways to Longevity"** — Machina's own
   AI-generated title, not the source's; expected, titles are never verbatim)

**Japan trip (3):**
5. YT — How to TRAVEL Japan! Perfect 2-week itinerary: https://www.youtube.com/watch?v=B0RveC40uS8
   (device-saved card title: "How to Plan the Perfect Trip to Japan" /
   Rhett and Claire — save LAST, see staging notes)
6. Article — 2 Week Japan Itinerary: The Grand Tour, Inside Kyoto: https://www.insidekyoto.com/2-week-japan-itinerary-the-grand-tour
   (same route as #5 from a different source — guaranteed connection)
7. Article — The Essentials: Where We Eat in Tokyo, Culinary Backstreets: https://culinarybackstreets.com/stories/tokyo/the-essentials-where-we-eat-in-tokyo-japan
   (device-saved title: "Culinary Experiences in Tokyo" — save LAST, see
   staging notes)

**Making sense of AI (3):**
8. YT — Intro to Large Language Models, Andrej Karpathy: https://www.youtube.com/watch?v=zjkBMFhNj_g
   (device-saved title: "The busy person's intro to LLMs")
9. Article — An Opinionated Guide to Which AI to Use, Ethan Mollick (Jul 2026): https://www.oneusefulthing.org/p/an-opinionated-guide-to-which-ai-b22
   (device-saved title: "Using AI Agentic Systems for Productivity" — fresh
   date → the feed doesn't read as a museum)
10. Article — AI Drug Discovery Is Reshaping Longevity Medicine, MedCity News: https://medcitynews.com/2026/04/ai-drug-discovery-is-reshaping-longevity-medicine-is-your-practice-ready/
    (deliberate bridge card: AI cluster, connects into Attia/longevity — gives
    the graph a visible edge BETWEEN clusters)

Staging notes: save the best-looking cards LAST (Japan video #5, Culinary
Backstreets #7, TED #2 — in that order) so they top the masonry feed for shot
1, with the TED talk ending up newest/topmost. The three subjects are the
three named collections for shot 6; "Japan 2026" is the natural public page.
Strong Ask questions for shot 2: "What did I save about beating jet lag?"
(cross-cluster citations) or "What should I eat in Tokyo?".

#### Actual seeded order (device-verified 2026-08-26, newest → oldest / top → bottom of feed)

The owner's device confirms the intended order above landed correctly (TED
topmost, bracketed by the Japan video and Culinary Backstreets, everything
else beneath in save order). Two open items were flagged below — **both
resolved by the owner (2026-08-26); the workspace is screenshot-ready.**

1. TED — Matt Walker (topmost, as staged)
2. **"Agentic Loop Frameworks in Software Development" — LinkedIn, source
   "Claude", TECH.** NOT part of this seed library — a stray card (unclear
   origin, possibly a leftover test save). Sits between the TED talk and the
   Japan video, so it does not block the "TED on top" staging goal, but it
   is off-persona (LinkedIn as a source type, and "agentic loop frameworks"
   as a topic don't fit a sleep/Japan/AI-curious persona) and may confuse the
   See-also graph as an unconnected node. **Decide: delete it, or keep it —
   owner's call**, not re-touched by this session.
3. Japan video (Rhett and Claire)
4. Culinary Backstreets
5. Instagram screenshot (@thechaosdiaries) — Japan-tagged, fulfills ONE of
   the two planned screenshot saves.
6. MedCity News
7. Mollick (oneusefulthing.org)
8. Karpathy
9. Inside Kyoto
10. Harvard Health ("Pathways to Longevity")
11. Attia
12. Huberman Lab video (oldest/bottom, as staged)

~~**Missing: the second screenshot**~~ — resolved by the owner. ~~The stray
"Agentic Loop Frameworks" card~~ — resolved by the owner (deleted or kept;
either way, no longer an open item). Proceed straight to shooting the §4
shot list.

iPad: not planned — `TARGETED_DEVICE_FAMILY` is already `1` (iPhone-only) in all
build configs, so no iPad screenshots are needed.

## 5. Remaining manual steps (owner)

- [x] **Fill the App Privacy declarations in Connect per §1** — DONE and
      **published** 2026-08-26. Verified on the Product Page Preview: 7 data
      types, all under "Data Linked to You", and NO "Data Used to Track You"
      section. Includes the two corrected rows (Product Interaction, Crash
      Data). The label publishes independently of any build, so it is already
      live on the product page.
- [x] **Seed the reviewer demo account** (`machinareviewer@gmail.com`) —
      workspace seeded 2026-08-26 per the §4 seed library; owner resolved the
      stray card + missing screenshot. **Credentials are still NOT in §3** —
      see the next item.
- [ ] **Make `machinareviewer@gmail.com` usable from a cold device** (option
      (a), decided 2026-10-19; §3 filled except the password, which goes only
      into App Store Connect's Sign-In Information). Owner, signed into that
      Google account at myaccount.google.com → Security: 2-Step Verification
      **off**; no passkey sign-in ("Skip password when possible" off); a
      strong unique password; recovery email set, recovery phone removed if
      it is a number Apple can't reach. Then TEST: a browser profile or device
      that has never signed into it (Safari private window → accounts.google.com)
      signs in with email + password and no challenge. Then paste user name +
      password into App Review Information → Sign-In Information.
- [ ] Enter metadata per §2 (all copy is final and owner-approved — pure
      transcription into Connect).
- [ ] **Terms of Use link for the subscription** (Guideline 3.1.2(c), added
      by the launch audit 2026-10-06). An app with an auto-renewable
      subscription must link its Terms of Use (EULA) in the metadata, not
      only in the app: either end the Description with
      `Terms of Use: https://mymachina.app/terms`, or set that page as the
      custom License Agreement (App Information → License Agreement). The
      in-app paywall already shows price per period, the renewal line,
      Restore, and Terms / Privacy links.
- [ ] Take the 6 screenshots per §4.
- [x] `TARGETED_DEVICE_FAMILY = 1` (iPhone-only) — already set in all build configs.
- [ ] Verify the AI-consent screen (§4 task 6) is in the submitted build before
      using the review-notes wording above. ⚠️ §3's notes PROMISE Apple this
      screen exists on first run — if it is not in the submitted build, the
      review notes are untrue. Delete the app, reinstall from TestFlight, sign
      in fresh, and confirm the notice appears.
