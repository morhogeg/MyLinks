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

Declare exactly these **7 data types** (across 5 categories — Connect counts
the types, not the categories, so "7 data types" on the summary screen is the
correct total). For every one: **Used for Tracking = No** and **Linked to
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
- The two `PrivacyInfo.xcprivacy` manifests (App + ShareExt, UserDefaults
  `CA92.1`) must be in Copy Bundle Resources (§4 task 7) — the label above and
  the manifests must not contradict each other (they don't: manifests declare
  no tracking domains).

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

> Everything you save, finally useful. Save links, screenshots, and videos from
> any app. Machina summarizes and connects each one, so you can ask about
> anything you saved.

169/170 chars. **OWNER-APPROVED 2026-08-25**, after seven rounds. The rules
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

> You save things all day. Links, screenshots, videos, articles you meant to finish. Then you never open them again. Machina changes that.
>
> Share anything to Machina from any app. It reads the page, watches the video, and pulls the text from your screenshot. Each save comes back as a clean card with a real summary, a category, tags, and connections to the things you already saved on the same subject.
>
> Then ask about anything you saved. Machina answers in plain language and cites the exact saves it used, so one tap takes you back to the source.
>
> CAPTURE FROM ANYWHERE
> • Save from Safari, YouTube, X, or any other app: tap Share, pick Machina
> • Screenshots and photos, up to five at once as a single card
> • Paste a link, or write a note and save it as its own card
>
> UNDERSTAND WHAT YOU SAVED
> • A real summary, category, and tags on every save
> • "See also" connections between related saves
> • Search that finds meaning, not just matching words
>
> COME BACK TO IT
> • Ask Machina: cited answers from your own library
> • Weekly synthesis: the themes and standouts from your week
> • Add your own notes to any card, as many as you need
> • Reminders and digests, on your schedule
> • Collections you can keep private or publish as a page
>
> Private by design. No ads, no tracking, and your content is never used to train AI models. Delete your account and everything in it at any time, from Settings.

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
> "Machina is a personal knowledge base: save links and images from the iOS
> share sheet, AI analyzes them, and you can ask questions answered from your
> own saves.
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

**"Share sheet" deliberately stays in this section** (decided 2026-08-26). The
§2 ban on the phrase is about audience: users don't say "share sheet", but the
App Review reader is an Apple employee and it is their own precise terminology —
"tap Share" would be *less* clear here. Same text rule, two audiences, opposite
calls.

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
   visible. Caption: "Ask about anything you saved."
3. **Card detail with See also** — LinkDetailModal open on a rich card:
   summary, tags, category, and the "See also" related-links section showing
   2–3 connections. Caption: "Every save, connected."
4. **Share-sheet capture** — Safari open on a real article with the iOS share
   sheet up and Machina selected (or the ShareExt confirmation HUD). Caption:
   "Save from anywhere in two taps."
5. **Weekly synthesis** — the synthesis card open: themes of the week, the
   standout save, the open question. Caption: "Your week, in one card."
6. **Collections** — collections gallery with 3–4 named collections with
   cover images; optionally one shown as a public share page. Caption:
   "Curate it. Share it (or don't)."

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
- [ ] **Fill the demo-account credentials into §3** (still literal
      `REVIEWER_EMAIL_TBD` / `PASSWORD_TBD`). ⚠️ Auth is OAuth-only, so there
      is no password to hand Apple for a 2FA-protected Google account. Decide
      between: (a) make the demo account's Google sign-in usable from a cold
      device by a reviewer, or (b) rely on §3's existing "any fresh sign-in
      auto-creates a workspace" wording and state that no demo account is
      needed. (a) is better — it is the only path where the reviewer sees a
      populated Ask/synthesis demo. Whichever is chosen, TEST IT on a device
      that has never signed into that account.
- [ ] Enter metadata per §2 (all copy is final and owner-approved — pure
      transcription into Connect).
- [ ] Take the 6 screenshots per §4.
- [x] `TARGETED_DEVICE_FAMILY = 1` (iPhone-only) — already set in all build configs.
- [ ] Verify the AI-consent screen (§4 task 6) is in the submitted build before
      using the review-notes wording above. ⚠️ §3's notes PROMISE Apple this
      screen exists on first run — if it is not in the submitted build, the
      review notes are untrue. Delete the app, reinstall from TestFlight, sign
      in fresh, and confirm the notice appears.
