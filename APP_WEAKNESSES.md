# Machina AI — Top 8 Product Weaknesses (harsh PM/design critique)

> **Date:** 2026-07-10. Produced by a full-codebase product audit (5 parallel deep
> audits: onboarding, recall engine, feed/IA, capture pipeline, retention loop) with
> every claim spot-checked against source. Ranked by how directly each item kills
> adoption, retention, or trust.
>
> **How to use:** this is the remediation tracker for the weaknesses sprint. Check
> boxes as items land, note the commit, and mirror progress into
> `SOURCE_OF_TRUTH.md` §4/§9. If an item was already fixed by another session,
> verify against code, check it off with a note, and move on.
>
> **Meta-finding (root cause of #2–#5):** the product's promises ("grounded",
> "we caught it", "I'll remind you") are enforced by prompt text and UI copy rather
> than by the system. Rule going forward: every promise the UI makes must be either
> mechanically guaranteed or visibly downgraded when it isn't.

---

## 1. [x] The activation cliff: ~11 taps and four interstitials ending on an empty screen

> **DONE (smallest good version) 2026-07-11** (commits `87e18b4` + `b0eeb48`,
> remediation sprint). Welcome screen is now platform-aware: on iOS it teaches
> ONE thing — the share sheet, including the one-time "More… → enable Machina"
> step — as a numbered token-styled step list; desktop keeps the (correct there)
> extension pitch in the same one-goal structure. Empty feed offers a one-tap
> "Try it with an example" that seeds a hand-crafted spaced-repetition card via
> saveLink (no analyze round-trip; needsEmbedding so it becomes askable) — taps
> to first value: 1. Tour cut 8 → 3 steps (Ask / search / save, toolbar-anchored)
> and gated to a non-empty feed via a hasCards lift into page.tsx. Design
> decisions deliberately NOT built (owner call): animated share-sheet demo asset,
> just-in-time coach-marks after first save/ask, killing the welcome entirely,
> example-card lifecycle policy (auto-remove after first real save?). Needs
> on-device verification of the iOS welcome + seed flow.

**Problem.** Fresh user: sign-in → AI-consent legalese → welcome screen → **8-step
spotlight tour** → "Your Machina is empty" (`Feed.tsx:1455`). The tour demos Ask,
search, and Collections over zero cards; Ask is a wall ("Nothing in Machina yet",
`AskBrain.tsx:544`). The critical activation step — enabling Machina in the iOS
share sheet ("More…" → toggle) — is **never taught**. The welcome screen pitches the
Chrome/Edge/Brave desktop extension to a user on an iPhone (`Onboarding.tsx:44-53`).

**Fix.**
- Kill the welcome screen + 8-step tour. After consent, ONE screen: "Save your first
  thing" with an animated/step demo of enabling + using the share sheet.
- One-tap "try it with this example" seeded card so Ask works in the first minute.
- Teach the rest contextually (after first save, after first ask). Wow before tap 3.

## 2. [x] The hero feature can't find what people actually saved

> **DONE 2026-07-11** (commits `89e5b36`, `bdda041`, `8e90537`, remediation
> sprint). Embeddings now use a versioned rich recipe (`build_embedding_text`
> v2: title + summary + detailedSummary + takeaway + concepts + video
> highlights, 8k-char cap; raw body isn't stored so can't be embedded) stamped
> as `embeddingVersion`; new admin `backfill_embeddings` endpoint re-embeds the
> existing library idempotently. Ask retrieval: top-30 vector → lexical/recency
> rerank → best 10 to the model; keyword fallback now ordered createdAt-desc
> with a 1000 cap (older cards stay reachable semantically). Ask answers moved
> to `gemini-3.1-flash` (RAG paths only — analysis/vision/synthesis stay on
> flash-lite; citations invariant preserved byte-for-byte). 19 new tests.
> **Owner steps:** deploy functions, then run `backfill_embeddings` once with
> `$ADMIN_TOKEN` (optionally rebuild connections after); small per-ask cost bump.

**Problem.** Ask/search embeddings are built from **title + short summary + tags
only** — never the content body or `detailedSummary` (`functions/search.py:94`).
Details that didn't survive into the 2–4-sentence summary are structurally
invisible. Retrieval: top-8 vector + 5 keyword, no rerank (`main.py:876-889`);
keyword fallback scans an **unordered `limit(300)`** (`main.py:794`) — a coin flip
for libraries >300. The cited-answer generation runs on `gemini-3.1-flash-lite`
(`ai_service.py:44`). Demo-killing failure: "I'm looking at the card and Ask says I
never saved it."

**Fix.**
- Embed `detailedSummary` + extracted content (chunk if needed), not just the blurb;
  backfill/re-embed existing cards.
- Retrieve top-30 → rerank → feed 8–10 to the model; order the keyword scan and
  remove the 300 cap.
- Upgrade the Ask answer model one tier above flash-lite (Ask volume is low; §7 cost
  math supports it).

## 3. [x] "Grounded in your saves" is a claim the system doesn't enforce

> **DONE 2026-07-11** (commit `a08433a`, remediation sprint). Citations are now a
> hard invariant: the buffered/native path re-asks once with a stricter prompt on a
> no-valid-citation answer; the streaming path emits a trailing `ungrounded` SSE
> event (prose already streamed, so it downgrades after the fact). The UI never
> renders confident-and-uncited — a "couldn't tie this answer to your saves" notice
> replaces the source chips. Empty-library answers are not flagged. 17 new unit
> tests (stubbed model) in `test_rag_prompt.py`.

**Problem.** If the model omits/mangles the `[[CITED:]]` marker, the answer renders
with **zero source chips** and ships anyway (`ai_service.py:499-507`,
`AskBrain.tsx:655` renders chips only when sources exist) while the footer still
promises "Answers are grounded only in what you've saved" (`AskBrain.tsx:739`).
Grounding is prompt-hope on a lite model; nothing verifies the text derives from
the cards.

**Fix.** Make citations a hard invariant: no valid citations → re-ask once with a
stricter prompt, else visibly downgrade ("Machina couldn't tie this answer to your
saves"). Never render the confident-and-uncited state.

## 4. [x] The retention loop silently no-ops for a default user

> **DONE 2026-07-11** (commits `006876b`, `875dc12`, remediation sprint; email item
> was already fixed by an earlier session in `b62bdb7` — verified cut, nothing
> writes to a dead channel). One-shots: ReminderModal now stores Tomorrow/Next
> Week/Custom as profile `once` (single fire; reopening shows Custom pre-filled).
> In-app fallback: the reminder sweep no longer skips pushless users — every due
> reminder flags the link `reminderDue` and the feed shows a "Reminders due" strip
> (open/dismiss clears it); push is delivered on top when available. Push asked at
> first intent: saving a reminder on never-prompted native re-surfaces PushNudge;
> web modal gets an honest "reminders appear in the app" note. Digest defaults ON
> weekly for NEW workspaces only (backend + web defaults; existing users
> untouched). Needs owner deploy: `./deploy-functions.sh` for the reminder-loop
> and default changes; device-verify the nudge-at-intent + due strip.

**Problem.** Reminders/digests/synthesis all funnel through push, which defaults
OFF (`useUserSettings.ts:16`), asked once, native-only (`PushNudge`). Reminders are
push-only: users without push are silently skipped forever
(`reminder_service.py:181-184`). The Settings **Email** toggle + address write to a
channel with **no configured provider** (`digest_service.py:425-429` logs "Would
have emailed" and returns False; `.env.example` keys commented out). Digest is off
by default behind an unbadged tab. Bug: ReminderModal never sends the `"once"`
profile (`ReminderModal.tsx:139` passes 'tomorrow'/'next-week'/'custom'), so
one-shot reminders re-fire at +7d and +30d (`reminder_service.py:247` /
smart-schedule fallback at `:121-128`).

**Fix.**
- In-app fallback for reminders (badge/inbox entry) so "remind me" always does
  something visible even without push.
- Map ReminderModal's tomorrow/next-week/custom to a true one-shot (`once`).
- Hide/disable the Email delivery option until a provider is actually configured.
- Ask for push at the moment of first intent (reminder set → explain → OS prompt).
- Default the digest ON at weekly cadence.

## 5. [~] Capture integrity holes — one of them lies to the user

> **LITE SCOPE DONE 2026-07-11** (commits `aeea7dd`, `e5c3ab4`, `6eb1d4d`, remediation sprint): (1) timeout copy is honest ("nothing was saved…
> tap Save to try again"; URL stays for one-tap retry); (2) web-path dedup via
> `findLinkIdByUrl` — same exact-URL semantics as the share path, checked before
> analysis, deep-links to the existing card, never blocks a save on probe
> failure; (3) content-type honesty in scraper.py — PDFs (URL + Content-Type),
> JS shells/TikTok degrade to the `[no text content available]` placeholder or a
> flagged og-teaser via the same `truncated` channel as Facebook (9 new tests);
> capture note reworded source-agnostic. **REMAINS OPEN: durable web capture** —
> route the web form through the processing-placeholder + background-analysis
> pipeline (`process_link_background` infra) so a timeout can never lose a
> capture; scheduled as the sprint's final implementation wave.

**Problem.** The web/desktop Add Link path has **no durable capture**:
`analyze_link` never persists (`main.py:646-757`); the client waits synchronously
and writes at the end (`AddLinkForm.tsx:207-266`). On the 60s timeout the user sees
*"It may still finish in the background — check your feed in a moment"*
(`AddLinkForm.tsx:58`) — **false**; nothing was saved. Collides with the known
slow-YouTube >60s issue (SOURCE_OF_TRUTH §4 task 4). PDFs/TikTok fall through to
the generic scraper which feeds `html[:5000]` junk to Gemini with no honest
degradation (`scraper.py:163`); only Facebook has a `truncated` honesty flag.
Duplicate URLs dedup on the share path but **not** the web path (`storage.ts:70-91`
just addDocs).

**Fix.**
- Route the web form through the same durable pipeline as share (processing
  placeholder first, background analysis — infra exists in
  `process_link_background`).
- Until then, make the timeout copy honest.
- Content-type check → honest "couldn't read this (PDF)" card instead of junk;
  extend the `truncated` flag to all partial scrapes (paywalls, TikTok, JS shells).
- Dedup on the web path like the share path.

## 6. [ ] A "second brain" that rejects thoughts and can't be corrected

**Problem.** Plain-text share with no URL → 400 "No URL found in shared content"
(`main.py:1230-1232`); web form has only Link/Image tabs. And the AI's output is
uncorrectable: category/tags are editable but **summary and title are not** (no
`updateLinkSummary`/`updateLinkTitle` exists in `web/`); delete-and-resave
reproduces the same output at temp 0.2. Mandatory `actionableTakeaway` on every
card (`models.py:47`) and the hard-coded "Who It's For" video section
(`ai_service.py:142-146`) manufacture filler users must live with.

**Fix.**
- Accept URL-less text as a first-class note card (skip scraping, straight to
  analysis) on both the share path and a web "Note" tab.
- Add Edit title/summary to `LinkDetailModal`.
- Make `actionableTakeaway` optional in the schema; drop the "Who It's For"
  skeleton.

## 7. [~] Five competing taxonomies and three navigation grammars

> **MECHANICAL FIX DONE 2026-07-11** (commit `d0203a2`, remediation sprint): one
> swipe grammar app-wide — ListCard now matches the review deck (right =
> favourite, light haptic, yellow Star; left = delete, firmer haptic, red Trash,
> still guarded by the existing ConfirmDialog). Only two action-swipe surfaces
> exist (ListCard, SwipeDeck) — both now agree; the edge-swipe-back gesture is
> navigation, untouched. Tag-entry sprawl audited: the three panels are
> breakpoint-exclusive, no redundant entry to remove. Needs on-device swipe
> verification (incl. RTL).
> **REMAINS OPEN (owner design decision — proposal delivered in the sprint
> report):** merging categories+tags into one slash-path topic tree (NB: the
> audit's "data model already agrees" claim is only half-true — the filter
> engine supports slash-paths but the backend does not emit them and category
> is a separate English-only field; needs a prompt change + one-time backfill,
> ~6–8 files), demoting Sources to a search operator, and unifying the six view
> modes into a lens (Cards/List/Review) × place (Library/Collections/Digest/Ask)
> model. One-sentence acceptance: "Everything I save is one library of cards; I
> narrow it by topic, browse it three ways, everything else is a filter."

**Problem.** Cards filter through status AND category AND tags AND collections AND
sources (`useFeedFilters.ts:36-93`) — five parallel systems, each with its own
panel/chips/clear idiom. Category vs tags is indefensible (both AI topic
taxonomies). Six view modes surfaced via three idioms (3 in segmented pills, 3 as
scattered zone buttons); IA rearranges per breakpoint; tag filtering reachable from
4 places; four per-card action surfaces with a **contradictory swipe grammar** —
swipe-right deletes in list (`ListCard.tsx:102`) but keeps/favorites in the review
deck (`SwipeDeck.tsx:103`).

**Fix.**
- Merge categories+tags into one topic system (categories = top-level tags; the
  slash-path data model already agrees).
- One swipe grammar app-wide; right-swipe never destructive.
- Demote Sources to a search operator/secondary filter; unify
  Ask/Collections/Digest/views into one consistent navigation surface.
- Acceptance test: the organization model explainable in one sentence.

## 8. [x] Launching blind: no analytics, no crash reporting, no export

> **DONE 2026-07-11** (commits `d894569`, `334b628`, `f5dcc39` + wiring commit,
> remediation sprint). Self-hosted analytics: `web/lib/analytics.ts` writes
> content-free events (allowlisted scalar props, 40-char cap — content physically
> can't leak) to `users/{uid}/analytics_events`; instrumented: sign_in,
> consent_accepted, app_open daily heartbeat (D1/D7), digest_opened, export_used,
> first_ask, ask_no_citations, reminder_set (save events wire in with the #5 fix).
> Error reporting: `web/lib/errorReporter.ts` (window.onerror/unhandledrejection +
> error boundaries → `users/{uid}/client_errors`, 8/session cap, deduped).
> Export: Settings → "Your data" downloads machina-export.json + .md (paginated
> reads, Timestamps normalized); honest "use the web app" note on native. Privacy
> page updated (first-party, content-free wording). Staged `firestore.rules.locked`
> + rules tests cover the two new subcollections.
> **Owner steps:** (1) add the two permissive subcollection matches to LIVE
> firestore.rules (pre-cutover, else events are silently denied) — see the locked
> file for the shape; (2) run `cd firestore-rules-test && npm test` on the owner
> machine; (3) native Crashlytics deliberately not added (needs Xcode) — decide
> post-launch; (4) optional `NEXT_PUBLIC_APP_VERSION` env in Vercel.

**Problem.** Zero product telemetry and zero crash/error reporting anywhere in the
codebase — every failure above will be invisible in production, and the marketing
plan gates paid spend on "20% week-2 retention" (§8) that can't be measured. No
data export of any kind (T10 parked post-launch); for the PKM audience "can I get
my data out?" is a pre-adoption question and "no" reads as lock-in.

**Fix.**
- ~10 privacy-respecting events (signup, consent, first save, save failed, first
  ask, ask-with-no-citations, reminder set, digest opened, D1/D7 return) — even
  self-rolled into Firestore is fine at this scale.
- Crash reporting (Crashlytics fits the existing Firebase stack).
- Settings → "Export my data" (JSON/Markdown of all cards + collections).
- Update the privacy policy to match.

---

## Explicitly NOT counted (already known/tracked)

- Auth cutover + pre-cutover "sign in with the owner account" dead end (P0 task 2).
- Light-theme half-state (task 17). iOS-only platform risk (sequencing choice).

## Suggested sequence

Days-of-work trust fixes first: **#3**, the reminder `once` bug + email hiding
(**#4**), the lying timeout copy + web dedup (**#5-lite**). Then the launch-deciders:
**#2** (retrieval), **#1** (activation), **#8** (instrumentation/export). Then
**#6**, and **#7** last (biggest design surface, needs owner taste).
