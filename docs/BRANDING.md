# Branding & marketing — decisions, rules, open questions

> The running record for every branding/marketing/naming discussion. Conclusions
> and action items land here; the *execution* plan (channels, launch assets,
> ASO copy) stays in `SOURCE_OF_TRUTH.md` §8, and the App Store Connect fields
> stay in `docs/APP_STORE.md` §2. This file is the **why**; those two are the
> **what**.
>
> **How to use it:** decisions go in §1 (append, don't rewrite — a superseded
> decision gets struck through with the date and reason, so the reasoning stays
> readable). Naming mechanics in §2. Open questions in §4. Action items in §5.
> Every discussion adds a dated §6 entry, newest first.

---

## 1. Decisions

### D-1 · The product is named **Machina** — "AI" is dropped (2026-07-27)

**Decision.** The user-facing name is **Machina**, everywhere a human reads it:
the iOS home screen, the web tab, the PWA manifest, the browser extension, the
legal pages, and the in-app copy. "AI" is gone.

**Why.**
1. **The identity already said so.** The wordmark built across identity rounds
   2/3/11/12 (`SOURCE_OF_TRUTH.md` §9) is letterspaced **MACHINA** — on the
   native splash, on the boot screen, in the header lockup. "AI" only ever lived
   in display-name *strings*, never in the mark. The rename makes the name match
   the identity instead of contradicting it.
2. **The bundle identifier was always `com.morhogeg.machina`** — no "ai". So
   there is no bundle-ID change, no Firebase project change, no data migration.
   The rename is display strings only.
3. **"AI" is a category tag, and category tags date.** Machina is not an AI
   product in the way a chatbot or an image generator is — AI is the
   infrastructure under a capture-and-recall product, not the thing being sold.
   The suffix advertises the plumbing.
4. **Timing is free.** Decided pre-App-Store-submission (§4 task 9 reviewer
   readiness and the auth cutover are both still open), so there is no live
   listing to rename, no install base to confuse, and no approved metadata to
   resubmit.

**Cost accepted.** "AI" in the App Store *title* field is a real search-ranking
signal, and this gives it up. Mitigated by D-3: `ai` moves into the keywords
field, which ranks nearly as well and is invisible to users.

### D-2 · The App Store listing name is **"Machina: Save & Recall"** (2026-07-27)

**Decision.** Two naming layers, because they answer to different rules:

| Layer | Value | Why it can be this |
|---|---|---|
| **Home-screen / in-app display name** (`CFBundleDisplayName`) | `Machina` | Apple does **not** require this to be unique. This is the layer the owner cared about most, and it gets the pure brand. |
| **App Store listing Name** (App Store Connect) | `Machina: Save & Recall` | Apple **does** require this to be globally unique, and bare `Machina` is taken — see C-1. |
| **App Store Subtitle** | `Capture. Ask. Connect.` | Three distinct phases, ending on the differentiator. |

**Forced by C-1** (below), not chosen freely — but it is also the better title on
the merits: `Machina: Save & Recall` (22/30 chars) names both halves of the
product and does more search work than `AI` ever did. The subtitle
`Capture. Ask. Connect.` (22/30) is a tricolon of **verbs** — three distinct
phases of the product, none of which repeats a Name token.

**Why it ends on `Connect`.** In a three-beat line the first and last positions
carry the weight and the middle is where words go to be forgotten. `Ask` is table
stakes — every AI app has a chat. `Connect` is the knowledge graph (§8's *"3
things you saved connect to Network Effects"*), the one beat a competitor cannot
copy. So the moat goes last and the commodity gets buried in the middle.

**A note on the ordering, because the stated reason was wrong and the conclusion
was still right.** The owner proposed ending on `Connect` on the grounds that
"the question will often come before the connection." For Machina that is
backwards: the knowledge graph is computed **on every save**, automatically, and
surfaces on the card unprompted — asking is the deliberate *later* act, so
connection precedes the question. The order survives anyway on the positioning
argument above, and on cadence (2-1-2 syllables closes fuller than 2-2-1).

**Why `Capture` and not `Save`:** `Save` is already a Name token. Alternatives
weighed and rejected: `Collect` (near-rhymes with `Connect`), `Share` (reads as
sharing *with people*, which Machina actually does elsewhere — ambiguous),
`Keep` (Google Keep owns it in this category), `Feed` (collides with the app's
own noun), `Clip` (now reads as *video clip*). `Drop` was the only real
contender — it describes the gesture — and lost narrowly to `Capture` on
plainness.

**Alternatives considered and logged:**
- ~~`Machina: Second Brain`~~ — **rejected by owner 2026-07-27:** *"it carries
  weight that I don't want to deal with."* The term is the highest-volume search
  phrase in the category but brings PKM-subculture connotations the product does
  not claim. Resolved by D-3, not by compromise.
- `Machina: Ask Your Saves` — the original §8 plan. Viable, and owner said they
  could live with it, but it leads with recall (the feature they are *least*
  excited to lead with) and carries almost no search volume. Keep as the fallback
  if `Save & Recall` ever tests badly.

### D-6 · The product tagline is **"Everything you save, finally useful."** (2026-08-02)

**Decision.** Machina now has a tagline, distinct from the App Store subtitle,
and it is the owner's line: **`Everything you save, finally useful.`**

It resolves **Q-1** (the AI-forward description string) and closes **A-3**.

| Layer | Value | Field it lives in |
|---|---|---|
| **Tagline** (the promise) | `Everything you save, finally useful.` | web `<meta description>`, PWA manifest, public README, launch-film endcard, **the public share-page footer**, Product Hunt |
| **App Store Subtitle** (the phases) | `Capture. Ask. Connect.` | App Store Connect — **unchanged** |

**Why this line and not the two the owner already rejected.** The rejected
subtitle candidates (`Save anything. It reads it.`, `Analyzed, organized,
connected`) both failed the same way: they narrated a **mechanism**. This one
makes a **promise** and never says how. It is also the film's own argument in one
sentence, and it matches the App Store description's opening move ("You save
links, screenshots, and videos everywhere — then never look at them again.
Machina fixes the second half.") — so the storefront, the web tab, and the film
finally tell one story.

**Why it is NOT the subtitle.** Two hard reasons, either one sufficient:
1. **Length.** 36 characters against a 30-character field. There is no cut that
   survives — `Everything you save, finally useful` (35) still misses, and
   dropping `Everything` guts the scope claim that does the work.
2. **Token waste.** `save` is already a **Name** token (`Machina: Save & Recall`),
   and Apple builds search phrases by combining tokens across Name + Subtitle +
   keywords. A subtitle that re-spends an indexed token buys nothing. This is the
   same rule that made the subtitle open on `Capture` in the first place (D-2).

Outside the storefront fields neither constraint applies, which is exactly why
the tagline is a *different layer* rather than a replacement.

**What it does to Q-4 (the contested hero).** It declines to pick, on purpose,
and that is the point: `Everything you save` is **capture**, `finally useful` is
the payoff that capture alone never delivers — which is Ask *and* Connect
together. So the tagline is true whichever way Q-4 settles, and no launch asset
has to be rewritten twice. Q-4 stays open for the *asset copy*; it no longer
blocks having a line.

**D-3 compliance:** contains neither `second brain` nor `ai`. Adopting it on the
README actually **fixed a live D-3 violation** — that page opened with *"Your
AI-powered personal knowledge base"*, i.e. `ai` on a user-visible surface, which
D-3 forbids and which the 2026-07-27 rename pass missed.

**Watch the "finally".** It implies the prior failure was the user's tools, not
the user — that reading is the whole product story (§8's "a graveyard", the
film's act one), but if any future copy pairs it with a second scolding line the
tone tips from wry to smug. One `finally` per surface.

### D-3 · "Second brain" lives in keywords only — never on the storefront (2026-07-27)

**Decision.** `second brain` stays as the first token of the App Store keywords
field, and appears in **no** user-visible surface: not the Name, not the
Subtitle, not the promotional text, not the description, not the website.

**Why this is not a fudge.** The App Store keywords field is invisible to users —
it exists purely for the search index. So the term's search volume and the term's
connotations can be separated cleanly: Machina ranks for the query without ever
calling itself the thing. Same logic applies to `ai`, which D-1 removed from the
name and which is now carried by the `ai summary` keyword token.

### D-4 · Growth is organic-first; $0 on ads at launch (recorded 2026-07-27 from §8)

**Decision.** No paid acquisition at launch. The only paid channel worth
revisiting *later* is **Apple Search Ads**, exact-match, with a hard **$5–10/day
cap**. X ads and Meta are explicitly rejected at this stage.

**Why organic-first is not just frugality:** the growth loop is inside the
product. Every shared card and every cited answer renders a public, OG-tagged
page that links back to the app — so the marketing job is distribution of
artifacts the product already generates, not buying attention.

**The sequence** (execution detail and the actual copy live in
`SOURCE_OF_TRUTH.md` §8 — do not duplicate it here):
1. Build-in-public on X, 2–3 posts/week, **starting now** — slowest to compound,
   so it starts first.
2. TestFlight open beta → X + r/PKMS + adjacent communities + Show HN. Beta
   feedback doubles as testimonials.
3. Launch week: Product Hunt (Tue–Thu), Show HN, an X thread, and one 30-second
   screen demo reused across TikTok/Reels/Shorts.
4. Ongoing: ASO (D-2/D-3) + a monthly public "what Machina learned this month"
   post generated by the synthesis feature — the product markets itself if you
   publish what it produces.

**The gate that governs spend.** Month-one target: **1,000 installs, 20% week-2
retention, 50 organic shares.** *Retention gates any paid spend* — do not buy
installs before week-2 retention holds. This is the one number that should
override enthusiasm.

**Scope note on D-3:** Apple Search Ads keywords are invisible to users in the
same way the App Store keywords field is, so bidding on `second brain` there is
permitted. D-3 restricts *user-visible surfaces*, not the search index.

### D-5 · The stated hero is the Recall Engine — and D-2 now partly contradicts it

**Recorded, not resolved.** `SOURCE_OF_TRUTH.md` §1 states the hero as the
**Recall Engine** — *"ask your own knowledge and get a cited answer"* — backed by
the widest capture surface in the category and a knowledge graph computed on
every save.

**Three artifacts now disagree about what the hero is:**

| Artifact | Implies the hero is |
|---|---|
| §1 positioning statement | **Recall** (Ask) |
| D-2 subtitle `Capture. Ask. Connect.` | **Connect** — Ask is deliberately in the weak middle position, on the reasoning that a chat is table stakes |
| The owner, stated 2026-07-27 | **Capture** — *"I mainly love the perfect sharing and saving and auto summary and category"* |

**Nothing is broken today:** the Name carries `Recall`, and the subtitle covers
all three phases, so the storefront is coherent on its own. But **every launch
asset in §8 leads on Ask** ("Ask your bookmarks anything", "ask your saves a
question", the demo video's climax). If the hero is really capture-or-connect,
that copy is selling the wrong thing. See Q-4 — this should be settled before
launch week, not during it.

**Superseded 2026-08-06 by D-7**, which settles Q-4 on **consolidated capture**.
The table above is kept as the record of how the three artifacts drifted.

---

### D-7 · The hero is **one place that holds everything you save** (2026-08-06)

**Closes Q-4.** Asked directly which of capture / connect / recall is the hero,
the owner answered: *"the main thing as I see it is that it acts as a place to
save and hold all saves from everywhere."* That is **consolidated capture** — the
fragmentation story, not the retrieval story.

This is not a new position, it is the one the *assets* were already telling. The
launch film's act one is five platforms drifting apart and then gathering into a
single point, and its stated problem is **fragmentation, not clutter** — *"you
never remember where you saved it."* The founder letter says the same thing from
the other side: *"saving was never the hard part; recalling it is how you learn
it."* Read together: **gathering** is the promise, recall is the payoff.

**What this changes.** D-5 named the Recall Engine as the hero on the strength of
§1's positioning statement; that is now the *payoff*, not the lead. The §8 launch
assets that open on Ask are aimed one step too far down the funnel — that is
**A-5**'s sweep, and it now has a target to aim at.

**What this does NOT change.** The D-6 tagline (`Everything you save, finally
useful.`) was written to survive whichever way Q-4 landed, and it does — the
first clause *is* consolidated capture. No tagline rework. D-2's subtitle already
opens on `Capture`, so the storefront needs no change either.

---

### D-8 · The public domain is **`mymachina.app`** (2026-08-06)

Registered at Cloudflare Registrar, owner's personal account.

**The problem it fixes.** Share links read
`https://secondbrain-app-94da2.web.app/s?id=…`, so every recipient of every
shared card saw `secondbrain` — a **live D-3 violation on the most-shared surface
in the product**, and unfixable in code: that host is derived from the Firebase
*project ID*, which can never be renamed. The share text and OpenGraph tags were
already clean (`Saved on Machina`, `og:site_name = Machina`); the domain was the
only offender. Links now read `mymachina.app/s?id=…`.

**Why this ending.** The bare `machina.<tld>` space is exhausted — `.com`,
`.app`, `.io`, `.co`, `.ai`, `.dev` and `.link` are all taken, and what remains
available is `.luxury` / `.travel` / `.guru`. Rejected on the way:
- **`machinaai.app`** — available, and a direct D-1/D-3 violation. Would have
  reproduced the exact bug being fixed, substituting `ai` for `second brain`.
- **`my-machina.com`** — the hyphen reads as "the real name was taken" and is
  lost entirely in speech.
- **aftermarket `machina.*`** ($1,450–$59,995) — four figures on a name whose
  trademark clearance (**A-1**) is still open.

`my` fits D-7: the product is *your* consolidated library. `.app` is
HSTS-preloaded (HTTPS enforced at the browser level), which is why the ending
never went the way of `.xyz`/`.club`.

**Registrar and mail are deliberately separate.** Cloudflare holds the domain;
mail is whatever gets pointed at it later. Buying through the Google Workspace
signup flow would have meant buying from Squarespace (which acquired Google
Domains in 2023) at a markup, and coupling the domain to an email vendor.

---

## 2. Naming mechanics (read before touching a name string)

**The canonical forms.**

| Form | Use for | Never |
|---|---|---|
| `Machina` | Everything a user reads: app label, tab title, in-app copy, legal pages, extension, marketing prose. | — |
| `MACHINA` | The letterspaced wordmark only (splash, boot screen, header lockup). | Body copy. |
| `Machina: Save & Recall` | The App Store Connect **Name** field, and nowhere else. | In-app, or in prose — it is a storefront string, not the brand. |
| ~~`Machina AI`~~ | **Retired 2026-07-27.** | Anywhere. |

**Where the name is stored** (the full set, so a future rename misses nothing):

- `web/ios/App/App/Info.plist` — `CFBundleDisplayName` (**the home-screen label**)
- `web/capacitor.config.ts` — `appName`
- `web/public/manifest.json` — `name`, `short_name`
- `web/app/layout.tsx` — `metadata.title`, `appleWebApp.title`, the
  `apple-mobile-web-app-title` meta tag
- `web/app/privacy/page.tsx`, `web/app/terms/page.tsx` — titles, back-links,
  footer links, and the legal-entity sentence in each
- `extension/manifest.json` (`name`, `description`), `extension/popup.html`
- `functions/ai_service.py` — the model's *self-name* in the analysis system
  prompt, the RAG answer prompt, and the weekly-synthesis prompt
- `README.md`, `extension/README.md`, `safari/README.md`, `CLAUDE.md`
- `docs/APP_STORE.md` §2 — the storefront fields

**The one code hazard, and why it is safe.** `functions/main.py`
`_ground_source_name()` rejects any Gemini-proposed publisher name containing the
substring `"machina"` (case-insensitive), because the model seeds its own name
from the system prompt and emits it as the article's publisher when the real one
is unclear. The guard matches on `machina`, **not** on `Machina AI`, and
`functions/tests/test_source_name_grounding.py` already covers the bare-`machina`
case — so shortening the prompt self-name did not reopen that bug. **If the brand
name ever changes to something not containing "machina", that guard and its
`_MACHINA_HOSTS` allowlist must be updated in the same commit** or the publisher
hallucination returns silently.

**Not renamed, deliberately:** dated audit/history documents (`AUDIT.md`,
`AUDIT_FINDINGS.md`, `APP_WEAKNESSES.md`, `AUTH_SPEC.md`,
`docs/PRODUCTION_READINESS_2026-07-14.md`), the `design/icon-concepts/`
prototypes, and the `test_source_name_grounding.py` fixtures. These are records
of what was true on their date; rewriting them would falsify the history.

**Where the marketing copy lives** (this file is the *why*; none of it is
duplicated here, so a change goes in ONE place):

| Surface | Lives in |
|---|---|
| **Tagline** (D-6) — the ONE promise line | `web/app/layout.tsx` + `web/public/manifest.json` (`description`), `README.md` line 3, `marketing/launch-clip/src/scenes/Endcard.tsx` (footer), `functions/share_service.py` (the public share-page footer, added 2026-08-06), `SOURCE_OF_TRUTH.md` §8 (Product Hunt). Five surfaces, so a change is a five-file sweep — grep the exact string. |
| App Store Name, Subtitle, keywords, promo text, description | `docs/APP_STORE.md` §2 |
| Growth strategy, channel sequence, launch assets (X thread, Show HN, Product Hunt) | `SOURCE_OF_TRUTH.md` §8 |
| Positioning statement / product one-liner | `SOURCE_OF_TRUTH.md` §1 |
| In-product name strings | §2 above |
| The reasoning behind all of it | this file |

---

## 3. Constraints discovered

### C-1 · The App Store name "Machina" is already taken (2026-07-27)

Found by the owner while checking availability. The incumbent:

- **Name:** Machina · **Subtitle:** "Opening up Creativity"
- **Developer:** Philip Gebben (an individual, not a company)
- **Category:** Utilities · **Age rating:** 4+ · Free with IAP
- **What it does:** screenshots read "Knowledge & Inspiration — Get tailored
  inspiration &, manage your projects effortlessly" and "AI Studio… Machina
  Studio uses AI…"

**Why this matters more than a plain collision.** It is not an unrelated app in a
distant category — it is an AI-plus-knowledge product, which is adjacent enough
that Apple could plausibly raise "confusingly similar" at review, and adjacent
enough to create user confusion in search.

**Mitigations in place:** a differentiated listing name (D-2), a different
primary category (Machina is **Productivity**; the incumbent is Utilities), and a
completely different mark and palette (the graphite citation mark). **Unmitigated:
trademark.** See A-1.

---

## 4. Open questions

- ~~**Q-1 · Is the tagline still too AI-forward?**~~ **CLOSED 2026-08-02 by D-6.**
  The string was *"Your AI-powered knowledge capture and retrieval system"*
  (`web/public/manifest.json`, `web/app/layout.tsx`) — plumbing-first, and jargon
  besides. It is now the tagline `Everything you save, finally useful.` The
  candidate answer recorded here (reuse the subtitle) was **not** taken: a
  storefront subtitle is a tricolon of phases and a web-tab description wants a
  promise, so they are deliberately two different lines telling one story.
- **Q-2 · Does `Save & Recall` survive contact with real users?** Nothing has
  been tested. Apple's product-page optimization allows A/B testing the title and
  subtitle after launch — worth doing against the `Ask Your Saves` fallback.
- ~~**Q-4 · What is the hero — capture, connect, or recall?**~~ **CLOSED
  2026-08-06 by D-7: consolidated capture** — *"a place to save and hold all
  saves from everywhere."* This is what the launch film and the founder letter
  were already saying (fragmentation, not clutter); D-5's recall-first reading is
  superseded. The follow-on work is **A-5**: the §8 assets still open on Ask,
  which is now one step too far down the funnel.
- ~~**Q-5 · The Product Hunt tagline contradicts our own copy.**~~ **CLOSED
  2026-08-02 by D-6.** §8 carried *"Ask your bookmarks anything"*, which called
  the product **bookmarks** (a self-description §8's own X-thread asset disowns —
  *"It's not a bookmark manager. It's memory."* — and which D-2 rejected from the
  subtitle for exactly that reason) and led on Ask, which is Q-4. The Product
  Hunt tagline is now the D-6 line, so it says neither. Note the *first comment*
  under that launch still leads on Ask — that copy is A-5's problem, not this
  one's.
- **Q-3 · Is "Machina" worth keeping at all given C-1?** Not reopened here — the
  visual identity is fully built around it and the bundle ID assumes it. Revisit
  only if the trademark check (A-1) comes back badly.

---

## 5. Action items

| # | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **A-1** | **Trademark search for "Machina"** (USPTO + Israel TM register, classes 9 and 42) before App Store submission. The incumbent being an individual indie developer suggests low odds of a registered mark, but this is the one finding that could veto D-1/D-2. | Owner | App Store submission | ☐ open |
| **A-2** | Enter the D-2 Name/Subtitle and the D-3 keywords into App Store Connect. Values are in `docs/APP_STORE.md` §2. | Owner | §4 task 8 | ☐ open |
| ~~**A-3**~~ | ~~Decide Q-1 (the AI-powered tagline).~~ **DONE 2026-08-02** — D-6 settled it; landed in `layout.tsx`, `manifest.json`, `README.md` (which also cleared a D-3 `ai` violation) and the §8 Product Hunt slot. The launch film's endcard already carried the line. | — | — | ☑ done |
| **A-5** | **Re-check every §8 launch asset against D-1/D-2/D-3 and Q-4** before launch week: no "Machina AI" anywhere, no "bookmarks" as a self-description (Q-5), and a hero consistent with whatever Q-4 settles on. The assets were written when the app was still called Machina AI. | Owner / next session | Launch week | ☐ open |
| **A-4** | Rebuild any store/marketing screenshot that shows the old "Machina AI" label. The §4 task 9 shot-list has not been shot yet, so this is a "shoot it right", not a redo. | Owner | §4 task 9 | ☐ open |

---

## 6. Discussion log

> Newest first. One entry per conversation; conclusions belong in §1–§5, this is
> the narrative of how they were reached.

- **2026-08-02 — The app gets a tagline, and it is the owner's line.** Owner
  proposed **"Everything you save, finally useful."** while asking what was left
  before the iOS launch. It is the first candidate in this file's history that
  makes a promise rather than narrating a mechanism — the exact flaw that killed
  `Save anything. It reads it.` and `Analyzed, organized, connected` in the
  2026-07-27 subtitle round — so it was taken essentially as-is (D-6). The only
  real work was deciding **where it goes**. It cannot be the App Store subtitle:
  36 characters against a 30-character field, with no survivable cut, and it
  re-spends `save`, already a Name token, which is the same rule that forced the
  subtitle to open on `Capture` back in D-2. So it becomes a **new layer** —
  tagline (the promise) alongside subtitle (the phases) — which also lets it do
  something the subtitle can't: it declines to pick a hero. `Everything you save`
  is capture, `finally useful` is the payoff capture alone never delivers, so the
  line stays true whichever way **Q-4** lands, and Q-4 no longer blocks having a
  line. It closed **Q-1** (the AI-forward description string) and **A-3** with it.
  Two discoveries while landing it: the launch film's endcard **already** carried
  the exact sentence — `SOURCE_OF_TRUTH.md` §8 still described that slot as
  `Your knowledge, on iPhone.`, stale since a later film round — so the film
  needed no change, only the doc did; and `README.md` opened with *"Your
  AI-powered personal knowledge base"*, a live **D-3 violation** (`ai` on a
  user-visible surface) that the rename pass had missed, now fixed by the same
  edit. It also replaced the Product Hunt tagline, closing **Q-5** — though the
  first comment under that launch still leads on Ask, which stays A-5's problem.

- **2026-07-27 (later) — Audit: is this file actually complete?** Owner asked
  whether every marketing decision so far was captured. It was not — the file
  covered only naming. Three findings. (1) **A stale subtitle in
  `SOURCE_OF_TRUTH.md` §8**, which still named `Save anything. It reads it.`
  inside the ASO paragraph; corrected. (2) **The pre-existing Episode 3 marketing
  decisions had never been recorded as decisions** — organic-first, $0 ads, the
  four-stage channel sequence, and the retention gate on paid spend are now D-4.
  (3) **A real positioning conflict surfaced**, now D-5/Q-4: §1 calls the Recall
  Engine the hero, D-2's subtitle deliberately demotes Ask to the weak middle
  slot, and the owner says capture is what they actually love — three different
  heroes. Every §8 launch asset currently leads on Ask, so this is worth settling
  before launch week rather than during it. Related: the Product Hunt tagline
  "Ask your bookmarks anything" calls the product *bookmarks*, which our own X
  copy disowns (Q-5/A-5).

- **2026-07-27 — Should we drop the "AI" from the app name?** Owner's argument:
  AI fatigue in the market, and AI is the infrastructure under Machina rather
  than the product itself — it is not a chatbot or an image generator. Agreed,
  with the added evidence that the shipped identity had *never* included "AI" in
  the wordmark, so the name and the mark had been quietly contradicting each
  other for months. The availability check turned up C-1 (bare `Machina` is taken
  on the App Store by an adjacent AI-knowledge app), which forced the two-layer
  split in D-2 — and since App Store name uniqueness does not apply to
  `CFBundleDisplayName`, the owner still got the plain **Machina** on the home
  screen, which was their stated priority. The title suffix went through two
  rejected candidates: `Second Brain` was vetoed for its connotations, and
  `Ask Your Saves` was accepted only lukewarmly because it leads with recall
  when the owner's own favourite part of the product is the frictionless
  share-and-auto-summarize capture. `Save & Recall` resolved that. **The
  subtitle then took its own round.** The first attempt — `Save anything. It
  reads it.` — the owner rejected as *"simplistic and lame"*, and they were
  right: it narrated a mechanism instead of making a promise, and its
  stop-start two-sentence shape read like instructions. Their counter,
  `Your saves: analyzed, organized and connected`, was 45 chars and compressed to
  `Analyzed, organized, connected` — which had the *same* flaw, three participles
  describing processing rather than a promise. The line only worked once it went
  to **verbs**: `Capture. Connect. Recall.` → `Capture. Connect. Remember.`
  (dropping the `Recall` that the Name already supplied) → and finally, on the
  owner's instinct to use the product's own verb, `Capture. Ask. Connect.`.
  D-3 recovered the lost search volume by pushing both
  `second brain` and `ai` into the invisible keywords field. Implemented the same
  session: display-name strings across iOS/web/PWA/extension/legal pages, the
  Gemini prompt self-names, the public READMEs, and the storefront fields.
