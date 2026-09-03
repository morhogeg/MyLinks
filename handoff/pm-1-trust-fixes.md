# PM-1 — "Fix the three lies" (trust)

Branch `claude/pm-1-trust-fixes`. Nothing merged, nothing deployed, no PR.

Three places where the card said one thing and did another. All three now do what
they say. No new data model beyond one additive backend field.

---

## A. Archive must archive

### The rule now

`web/lib/useFeedFilters.ts` has a single module-level predicate, `showsArchived(filter, searching)`,
with the whole rationale in its doc comment. An archived card leaves the default
feed and the read-state views, and appears in exactly three places:

| View | Shows archived? | Why |
| --- | --- | --- |
| All (default Home feed) | no | the swipe deck promises "File it away, out of your feed" |
| Unread | no | a read-state slice of the same feed |
| Read | no | same |
| Favorites | n/a | one `status` field, so a favorite is never archived |
| Archived | yes | the drawer the user filed it into |
| Reminders | yes | the bell is a later, explicit "bring this back" and outranks the archive |
| Private | yes | the vault is its own place, not a slice of the feed |
| Any view, with a live search query | yes | someone typing a word wants the card, not the feed |

Search hits are **not** labelled as archived. They just appear, per the brief.

### Every counter / lister I checked, and what I decided

- **Feed facet chips and counts** (categories, tags, sources) — CHANGED. They now
  derive from a new `facetLinks` base that drops archived cards in exactly the
  views that drop them, so "Tech (12)" can no longer resolve to 9 cards. In a
  view that shows archived cards the base is the full content set again.
- **`reminderCount`** (the "Reminders (N)" badge) — UNCHANGED, still counts
  archived cards. The Reminders view shows them, so the badge has to count them
  or the number would undershoot what the view opens with.
- **Insights / `lib/stats.ts` `computeStats`** — UNCHANGED. Stats describe the
  whole library, not the feed. Archive files a card away; it does not un-save it.
- **Ask, "Answers come only from your N saves"** (`AskBrain.tsx`, fed by
  `visibleLinks.length` in `Feed.tsx`) — UNCHANGED, per the brief's
  recommendation. Server-side Ask retrieval (`functions/search.py`) has never
  filtered on `status`, so Ask genuinely does answer from the whole library
  including archived cards. Narrowing it would have been the scope widening the
  brief said to avoid.
- **Knowledge graph** — UNCHANGED. With no filters active it maps the whole
  library (archived included); with filters active it maps `filteredLinks`, so it
  inherits the new rule automatically. Current behavior preserved either way.
- **Collections** — UNCHANGED and unaffected. The collection detail view reads
  `useCollectionLinks`, a direct `array-contains` query for the complete member
  set, never `filteredLinks`. A collection is an explicit shelf, so it keeps
  showing its archived members and its count stays truthful.
- **Review deck** (`lib/reviewQueue.ts` `isOpen`) — already excluded archived.
  Unchanged, now doubly covered since it is fed from `filteredLinks`.
- **Digest** (`functions/digest_service.py` `fetch_candidate_links` + `curate`) —
  already excluded archived in both places. Unchanged.
- **Reminder sweep** (`functions/reminder_service.py`) — does not filter on
  `status` and still does not. A reminder the user set fires regardless, which is
  the same call as the Reminders view above.
- **The in-app "reminders due" strip** in `Feed.tsx` reads `visibleLinks`, not
  `filteredLinks`, so an archived card with a due reminder still surfaces there.
  Consistent with the Reminders decision.

### The one-field honesty problem (star vs. archive)

Kept the data model exactly as it was: `favorite`, `archived` and `unread` are
three values of one `status` field, so starring an archived card also un-archives
it and archiving a favorite also drops the star. The toasts in
`web/lib/useLinkActions.ts` now name the whole outcome instead of half of it.
Every caller already passed `{ from: link.status }` (`Card.tsx`,
`CardActionSheet.tsx`, `ListCard.tsx`, the `LinkDetailModal` toolbar), so no call
site needed changing.

---

## B. Opening a card marks it read

`web/components/LinkDetailModal.tsx`: an effect writes `isRead: true` once, with
no toast, when the detail view has been open for `AUTO_READ_MS` (1500) **or** the
reader scrolls it, whichever comes first. It reuses the existing
`onReadStatusChange` → `updateLinkReadStatus` path, so no new write function.

Idempotency and the rules that keep it honest:

- never writes when `link.isRead` is already true;
- never writes for a `processing` or `failed` capture;
- one write per card per open session, tracked in an `autoReadIds` ref, so an
  explicit "Mark as unread" from the toolbar sticks while the card stays open;
- the timer and the scroll listener are both torn down on unmount and on card
  navigation, so backing straight out of a mis-tap marks nothing.

Reopening a card later marks it read again. That is the rule doing what it says
(same as a mail client), not a bug, but flag it if the owner disagrees.

Explicit paths are untouched: the check glyph on `Card.tsx`, the toolbar toggle in
the modal, and "Mark as read / unread" in `CardActionSheet.tsx` all still work.

Knock-on effects I traced:

- **Review deck** — `reviewQueue.reviewSessionQueue` uses `!isRead` only to order
  its second tier (newest unread first). Opened cards now fall to the third tier
  instead of the second. Still dealt, just later. No card leaves the pool.
- **Digest** — `digest_service.curate` mode `smart` builds its backlog half from
  `not isRead`. A card you opened stops being backlog, which is the digest
  getting more accurate, not less.
- **`digest_service.viewed(l)`** reads `lastViewedAt`. **Nothing in the codebase
  writes `lastViewedAt`** (verified: only `reviewQueue.ts`, `askSuggestions.ts`
  and `digest_service.py` read it), so it is always 0 and the rediscover pool is
  unchanged by this work. I deliberately did NOT start writing it: it would
  change rediscover and review ordering, and it was not asked for. Worth a
  separate decision.
- **Reminder flows** — do not read `isRead`. Unaffected.

---

## C. A partial capture says so, on the card

The removed `_append_capture_note` stays removed. Nothing appends user-facing
prose into `detailedSummary`, and the note above it in `functions/main.py` now
says so explicitly plus what replaced it.

### Backend

`functions/scraper.py` gains `CAPTURE_REASONS = ("login_wall", "teaser", "pdf", "truncated")`
and sets a `capture_reason` next to every existing `truncated` flag:

| Path | reason |
| --- | --- |
| `.pdf` URL, and `application/pdf` content type | `pdf` |
| generic page with only og/twitter preview text | `teaser` |
| generic page with nothing readable (JS shell, gate) | `login_wall` |
| LinkedIn og:description teaser | `teaser` |
| LinkedIn scrape exception | `login_wall` |
| Facebook og:description teaser | `teaser` |
| Facebook login wall | `login_wall` |
| Instagram total metadata failure | `login_wall` |
| anything partial we did not classify | `truncated` |

One behavior change inside the scraper: **Instagram's total-failure return now
sets `truncated: True`** (it never did). Nothing else consumes `truncated`, so
the only effect is that a gated Instagram post now admits it is partial like
Facebook and LinkedIn already did.

`functions/main.py` gains `_capture_quality(scraped)`, which returns
`{"captureQuality": "partial", "captureReason": ...}` for a partial read and an
**empty dict** otherwise. Absence means "read fine", so no existing card is
retroactively labelled and nothing is backfilled. An unknown reason degrades to
`truncated` rather than writing a value the client has no copy for.

Stamped at both save paths that actually run the scraper:

- `analyze_link` (`main.py`, the `/api/analyze` link branch), in the non-YouTube
  arm;
- `process_link_background` (`main.py`, the Firestore trigger), in the
  `not is_youtube and not is_image` arm.

`share_ingest`'s link path only writes a `pending_processing` queue doc; the
scrape and the card write both happen in `process_link_background`, so the share
sheet and the browser extension are covered there. `analyze_image` never runs the
scraper, so screenshots can never carry the flag.

**The trap worth knowing:** step 1 of `process_link_background` calls `scrape_url`
unconditionally, including for image jobs whose `url` is the screenshot's Storage
URL. Reading image bytes as HTML always comes back unreadable, so without the
`not is_image` gate every screenshot card would say "couldn't read the full post".
`tests/test_capture_quality.py::test_image_bytes_scraped_as_html_would_be_partial`
pins that rather than trusting a comment.

YouTube is excluded on purpose: a video is watched, not scraped, and a free-plan
video already gets its own honest `proFeature` line.

`web/lib/storage.ts` `retryFailedLink` writes `captureQuality` / `captureReason`
on every retry, **null included**, so a retry that finally reads the page in full
clears the flag. The background path needs no equivalent: `card_ref.set(link_data)`
replaces the whole doc.

### Frontend

`web/lib/types.ts`: `captureQuality?: 'partial'` and
`captureReason?: 'login_wall' | 'teaser' | 'pdf' | 'truncated'` on `Link`.

`web/components/LinkDetailModal.tsx`: a `PartialCaptureNote` component renders one
quiet line directly under the summary lead, above the deeper sections. Muted text,
`EyeOff` glyph, theme tokens only, `dir` set from the card's own `isRtl` (same
`isRtl` the rest of the modal uses). On native it also offers a "How" toggle that
expands three steps in place. The `Onboarding.tsx` share-sheet steps were NOT
reused: they teach how to *enable* the share extension, which is a different
subject from "screenshot this post", so the inline expansion the brief offered as
the alternative is what shipped.

Gate: `link.captureQuality === 'partial' && link.sourceType !== 'image' && !isNote`.
`isNote` is `sourceType === 'note'`, which covers both note cards and text cards.
So the line cannot appear on a note, a text card, an image card, or any card whose
content was read fine.

Card face: a `w-3 h-3` `EyeOff` in the metadata chrome row of both `Card.tsx` and
`ListCard.tsx`, with `title` / `aria-label` "Partial capture" and no text. I added
it to `ListCard.tsx` as well as the `Card.tsx` the brief named, so the grid and
list layouts say the same thing about the same card. Say if that is one surface
too many.

---

## Every user-facing string added or changed

**Added, English + Hebrew** (`LinkDetailModal.tsx`, `PartialCaptureNote`):

| English | Hebrew |
| --- | --- |
| Machina couldn't read the full post. Share a screenshot of it for the full card. | לא הצלחנו לקרוא את הפוסט במלואו. שתפו צילום מסך שלו כדי לקבל כרטיס מלא. |
| Machina couldn't read this PDF. Share a screenshot of it for the full card. | לא הצלחנו לקרוא את קובץ ה-PDF. שתפו צילום מסך שלו כדי לקבל כרטיס מלא. |
| How *(native only, the expander)* | איך |
| How to share a screenshot *(its aria-label)* | איך לשתף צילום מסך |
| Take a screenshot of the post. | צלמו מסך של הפוסט. |
| Open the share sheet and choose Machina. | פתחו את תפריט השיתוף ובחרו ב-Machina. |
| Machina reads the screenshot and files a full card. | נקרא את צילום המסך וניצור ממנו כרטיס מלא. |

The Hebrew drops the brand name and uses first-person plural. Writing
"Machina לא הצליחה" forces a grammatical-gender choice for a Latin-script brand
inside an RTL sentence and reads badly either way; every other Hebrew string in
the app avoids the same problem. Flag it if the owner wants the brand in.

**Added, English only** (marker tooltips, `Card.tsx` + `ListCard.tsx`): "Partial
capture". English-only deliberately: it is chrome, matching how `Private` and the
Machina's-read control are handled (owner call, build 1313).

**Changed** (`lib/useLinkActions.ts` toasts):

| Before | After |
| --- | --- |
| Added to favorites *(on an archived card)* | Back in your feed and starred |
| Archived *(on a favorite)* | Archived, and no longer a favorite |
| Unarchived | Back in your feed |

"Added to favorites", "Removed from favorites", "Archived" and "Marked as unread"
are unchanged for the transitions where they were already true.

**Changed** (`Feed.tsx` empty states):

| Filter | Before | After |
| --- | --- | --- |
| Read | Cards you mark as read collect here. | Cards collect here once you open them, or mark them read yourself. |
| Unread | Every save has been read. New links land here first. | You have opened everything you saved. New links land here first. |

The Archived empty state ("Archive cards you're done with to keep your feed
focused.") and the Review deck's hint ("File it away, out of your feed") needed no
change: they now describe what the code does.

---

## Files touched

```
functions/main.py                       _capture_quality + 2 stamp sites
functions/scraper.py                    CAPTURE_REASONS + capture_reason at 9 sites
functions/tests/test_capture_quality.py NEW, 12 tests
web/lib/types.ts                        captureQuality / captureReason on Link
web/lib/storage.ts                      retryFailedLink carries + clears the flag
web/lib/useFeedFilters.ts               showsArchived, filter chain, facetLinks
web/lib/useLinkActions.ts               honest status toasts
web/components/LinkDetailModal.tsx      auto-read effect + PartialCaptureNote
web/components/Card.tsx                 partial marker in the metadata row
web/components/ListCard.tsx             partial marker in the meta row
web/components/Feed.tsx                 two empty-state strings
```

### Shared-file edits other sessions must know about

- **`web/components/Feed.tsx`** — one region only, the `empty` ternary inside the
  empty-state IIFE around line 2646. Two string values plus their comments. No
  imports, no reordering, nothing else in the file.
- **`web/components/Card.tsx`** — two regions: `EyeOff` appended to the existing
  `lucide-react` import on line 6, and a block added inside the "Metadata Buttons
  Row" near the end of the component (around line 670).
- **`web/components/LinkDetailModal.tsx`** — four regions: `EyeOff` appended to
  the `lucide-react` import and one new `isNativeApp` import at the top; the
  `AUTO_READ_MS` constant next to `NEW_NOTE_ID`; the `PartialCaptureNote`
  component inserted immediately above `export default function LinkDetailModal`;
  the auto-read effect inserted immediately above the Escape-key effect; the
  `isPartialCapture` derivation next to `isRtl`; and the render site just above
  the `detailBody` `SimpleMarkdown` in the summary block.
- **`functions/main.py`** — three regions: the `_append_capture_note` comment
  block plus the new `_capture_quality` right after it (~line 783); one added line
  in `analyze_link`'s non-YouTube arm (~line 1770); one added line in
  `process_link_background`'s `elif not is_image` arm (~line 4074).

Nothing was reformatted and no imports were reordered.

---

## Verified

- `cd web && npx tsc --noEmit` — exit 0.
- `node scripts/check-em-dash.mjs` — clean.
- `npx eslint` on all ten touched files — 0 errors. One warning,
  `'isYouTube' is assigned a value but never used` in `LinkDetailModal.tsx`, which
  is **pre-existing** (confirmed by linting the same file on a clean stash).
- `cd functions && python -m py_compile *.py` — clean.
- `functions` pytest in a fresh `python3.13` venv — **720 passed** (708 on main
  plus the 12 new ones).

## NOT verified

- **Anything on a device or in a signed-in app.** This session cannot run the app
  or sign in. Every behavior below is reasoned from the code, not observed:
  the auto-read timing on a real phone, the partial-capture line rendering on a
  Hebrew card, the "How" expander on native (`isNativeApp()` is false in this
  environment, so the native branch never rendered anywhere), and the archive
  filter against a real library.
- **`npm run build`** fails in this session at the static-export step with
  `FirebaseError: auth/invalid-api-key` while prerendering `/_not-found`. That is
  missing env vars in the cloud container, not the diff: `Compiled successfully`
  and `Finished TypeScript` both pass before it. Worth one clean build on a
  machine that has the env.
- **The backend against real pages.** No live scrape ran. The reason mapping is
  covered by unit tests over synthetic HTML, not by a real Facebook or LinkedIn
  fetch.
- **The Instagram `truncated: True` change** in particular is unexercised against
  a real gated post.

## Owner steps

None to make this work. It ships with a normal functions deploy plus a web/iOS
build. Scoped functions deploy line, if the supervisor wants one:

```
Deploy-Functions: analyze_link,process_link_background
```

## Judgement calls the supervisor may want to overrule

1. **Reminders shows archived cards.** Defensible but arguable. Flipping it is one
   word in `showsArchived`.
2. **Facet chip counts now exclude archived cards** in the views that exclude
   them. Beyond the brief's list of counters, but it fixes a mini-lie of the same
   kind ("Tech (12)" resolving to 9 cards).
3. **The marker was added to `ListCard.tsx` as well as `Card.tsx`.**
4. **Reopening a card re-marks it read** after an explicit "Mark as unread" from a
   previous session.
5. **`lastViewedAt` is still written by nothing.** Opening a card now sets
   `isRead` but not `lastViewedAt`, so the digest's rediscover pool and the review
   deck's dust ordering are unchanged. Deliberate, out of scope, but it is the
   obvious next thing.
