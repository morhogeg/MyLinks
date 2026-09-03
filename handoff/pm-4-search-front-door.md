# PM-4 — Search as the front door

Branch `claude/pm-4-search-front-door`. One round, scoped to search. No backend
change, no doc change, nothing shipped.

## What is on the branch

**1. A standing search field, both platforms.** Search was a bare glyph in the
top header that fired a nonce command into Feed, which then expanded an inline
field with a Done button. That entry point is gone. On the phone the field
itself sits directly under the app header as the first row of the feed; on
desktop it is the first control in the toolbar row, ahead of Filter. Placeholder
and aria-label: "Search or ask your saves". Both fields carry `dir="auto"` with
equal start/end padding, so a Hebrew query flows right to left and still clears
the magnifier and the clear (x).

The phone field shows a "Done" button while it holds the caret (same accent text
button as before): Done puts the keyboard away and keeps the query, the (x)
inside the field clears. A pointer-down guard on Done keeps it from unmounting
on blur before the tap lands. Escape clears a query, then releases the caret.

*Scroll-away choice:* the field retires by scrolling, not by pinning. It lives in
Feed's existing non-sticky header block, so it slides up with the feed like the
search field in Mail or Notes and comes back at the top of the list. That leaves
the glass header's own scroll-scrubbed fade (`useHeaderFade`) completely
untouched, which a pinned field would have had to fight.

*Preserved exactly:* the warmup ping (now on field FOCUS instead of glyph tap,
plus the existing first-keystroke path), the 220ms debounce, the per-query
cache, the quiet "Searching by meaning…" line, the settled "No matches" state,
and `warmSearchBackend`'s 10-minute re-arm. No new backend calls: the field does
not ping on mount, only on focus and typing.

**2. "By meaning" partition.** Literal hits render first, then a quiet divider
row (brand mark + "BY MEANING" + hairline), then the cards meaning search reached
that share no word with the query. Each of those cards carries a small "Meaning"
chip in its chrome row, which is the chip the first-run tour has been promising.
The divider is suppressed when either group is empty, and when the user picks a
non-default sort (only `date-desc` tiers results by match kind, so under any
other sort the two groups interleave and a boundary would lie).

**3. Question routing.** A query that ends in "?" or opens with a question word
(English or Hebrew) puts ONE row above the results: `Ask Machina: "<query>"` with
the citation glyph. Tapping it opens Ask with the query pre-sent in a fresh
conversation, reusing the same one-shot nonce channel the graph's "Ask about
cluster" already uses. It never auto-switches, and it is hidden on an empty
library. The query stays in the field, so leaving Ask lands back on the same
search. The Hebrew case is wrapped in `<bdi>` so the query keeps its own
direction inside the English chrome line.

## Exact files and regions

| File | Region | Change |
| --- | --- | --- |
| `web/lib/searchIntent.ts` | new file | `looksLikeQuestion()` — "?" or an EN/HE question word plus at least one more word |
| `web/components/Feed.tsx` | 22, 39 | two new imports (`looksLikeQuestion`, `CitationGlyph`) |
| `web/components/Feed.tsx` | 119-146 | `searchOpen` state removed; `searchFocused` + two input refs + `handleSearchFocus` + `focusSearchField` in its place |
| `web/components/Feed.tsx` | 179-217 | `semanticOnlyIds` pulled from the filter hook; new `askableQuestion`, `meaningSplit`, `meaningDivider` |
| `web/components/Feed.tsx` | 936-940, 976-990 | comment on the pre-sent-question channel; new `handleAskFromSearch` |
| `web/components/Feed.tsx` | 1487-1495 | header command `search` now focuses the field instead of opening one |
| `web/components/Feed.tsx` | ~1872 | the desktop expand-on-demand search block DELETED (was ~1812-1836) |
| `web/components/Feed.tsx` | 1898-1972 | mobile row: always rendered instead of `searchOpen`-gated; new placeholder, focus/blur wiring, Done button |
| `web/components/Feed.tsx` | 1987-2020 | desktop toolbar: the search icon button replaced by the field |
| `web/components/Feed.tsx` | 2522-2543 | the "Ask Machina" question row, first child of the results column |
| `web/components/Feed.tsx` | 2830-2865 | list view: divider dropped in at `meaningSplit` via `flatMap` |
| `web/components/Feed.tsx` | 2868-2930 | grid view: two Masonry blocks around the divider, `isMeaningMatch` on each card |
| `web/components/Card.tsx` | 54-58, 82, 527-537 | one optional prop `isMeaningMatch` and the chip in the chrome row. Nothing else |
| `web/lib/useFeedFilters.ts` | 117-135, 358 | new derived `semanticOnlyIds` set, added to the return |
| `web/lib/useSemanticSearch.ts` | doc comment only | records where the semantic-only split lives and why |
| `web/app/page.tsx` | 11, 288-300 | the mobile header search button removed, `Search` dropped from the lucide import, the glyph-row comment updated |

## Shared-file edits other sessions must know about

- **`web/components/Feed.tsx`** — my edits sit in the regions above. The one that
  is NOT obviously "search" is the grid render (~2868-2930): the card list is now
  produced by a local `cards(list, offset)` helper inside an IIFE so the Card
  prop block exists once and can be rendered as one or two Masonry blocks. PM-1's
  empty-state copy (~2690) and PM-2's (~2715) are above it and untouched. The
  list view render (~2830) changed from `.map` to `.flatMap` for the same reason.
- **`web/lib/useFeedFilters.ts`** — I added `semanticOnlyIds` (a derived `useMemo`
  plus one line in the returned object). Nobody else was assigned this file. The
  split has to live there: `useSemanticSearch` knows the server's ids but not
  whether a card also contains the query's words, which is the literal pass.
  Whoever merges: this is why the requirement's "expose from useSemanticSearch"
  landed one hook over.
- **`web/app/page.tsx`** — the `'search'` action stays in the `headerCommand`
  union and Feed still handles it (it focuses the field), so nothing else that
  routes a search intent breaks. Only the button and the now-unused `Search`
  import were removed.
- **`web/components/Card.tsx`** — exactly one new optional prop, defaulted false,
  and one chip in the existing chrome row's trailing group.

## Verified

- `cd web && npx tsc --noEmit` — exit 0.
- `node scripts/check-em-dash.mjs` — clean.
- `npx eslint` on every touched file — clean.
- **Rendered** in Chromium via a throwaway Next route against the real Tailwind
  token build, at 390px and 1280px, light and dark. Screenshots in `handoff/pm-4/`.
  They cover the field (English and Hebrew), the Ask row (English and Hebrew),
  the "By meaning" divider, and the Meaning chip. The scratch route, its
  temporary `PUBLIC_ROUTES` entry and the dummy `.env.local` were all removed;
  `git status` on the branch shows only the intended files.

## NOT verified

- Nothing ran against a signed-in library. No live search, no real semantic
  result, no real Ask hand-off. The partition, the chip, the question row and the
  warmup-on-focus are verified as code and as rendered markup only.
- Not tested on a device or in the iOS WebView. Two phone behaviours want owner
  QA: the Done button's pointer-down guard in WKWebView, and how the field feels
  scrolling away with the feed.
- The production build was not run: it prerenders through `AuthProvider`, which
  needs Firebase env vars this session does not have.

## Judgement calls worth a second opinion

- **List view has the divider but no chip.** `ListCard.tsx` was outside my file
  ownership, so meaning-only rows in list view are labelled by the divider alone.
  Adding the same chip to `ListCard` is a small follow-up.
- **Where the field appears.** It follows the existing `isLibraryView` gate:
  Card, List, Review and Graph. Not Collections, Ask, Digest or Notes. That is
  the same set the old search control appeared in, so nothing lost the ability to
  search; Notes never had it.
- **Done keeps the query** (it only dismisses the keyboard), matching the old
  Done rather than the iOS Cancel that also clears. The (x) is the clear.
- **The Ask row's origin is `'library'`,** because it rides the existing
  `initialAsk` channel, which hardcodes that origin in `AskBrain`. It only picks
  the thinking micro-copy, and a search-born question does sweep the library, so
  I did not edit `AskBrain.tsx` to thread an origin through.
