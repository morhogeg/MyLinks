# PM-6 — One resurfacing surface (the "Today" tab)

Branch: `claude/pm-6-today-tab`. Nothing merged, nothing deployed, no PR.

## What this does

The Digest tab is now **Today**, and it carries what today actually asks of you
before it carries the archive: reminders that are due, this week's synthesis, and
a five-card review session. The curated digest lost its style picker, so there is
one curation instead of three.

This does NOT touch the home feed's "Reminders due" strip or its weekly-synthesis
banner (its separate dismissal still works exactly as before), the Insights
screen, the reminders filter, or push payloads. The full merge of the five
resurfacing surfaces is a later release; this is the cheap, high-impact half.

## Files

### Frontend

| File | What changed |
| --- | --- |
| `web/components/BottomTabBar.tsx` | Tab label `Digest` → `Today`, icon `Newspaper` → `CalendarCheck`. The tab **key stays `'digest'`** (it is the id in the push payload `{"view": "digest"}`; renaming it would break notifications already on a lock screen). `aria-label` follows the label. |
| `web/components/DigestView.tsx` | New "Today's top" section above the history: Due now, This week, Review N cards. New optional props (`reminderCards`, `onOpenReminderCard`, `onEditReminder`, `onCompleteReminder`, `reviewCount`, `onStartReview`). Empty state rewritten. Desktop wrapper changed from `hidden lg:flex` to `hidden lg:block` so the top section can sit above the two-pane reader; the two panes keep their `flex gap-6`. `SectionHeader`'s `count` is now optional. Added local `isoWeekId` / `weekSectionLabel` helpers (`lib/synthesis.ts` was not touched). |
| `web/components/DigestCard.tsx` | Extracted the digest's card row into an exported `ResurfacedCardRow` (same markup, same classes) so Today's due reminders and the digest list render identically. New optional `trailing` slot: with controls the row becomes a bordered shell holding one tap button plus the controls (nested buttons are invalid HTML). |
| `web/components/SwipeDeck.tsx` | New optional `limit` prop. Defaults to `REVIEW_SESSION_SIZE` (12), so the library's Review mode is byte-for-byte unchanged. Used by the initial deal, the re-deal, and the "Review N more" label. |
| `web/components/Feed.tsx` | See the region list below. |
| `web/components/settings/DigestSettings.tsx` | Deleted `DIGEST_MODES` and `StyleView` (the mode picker AND the topic picker). `ResurfacingView` lost its `modeLabel` prop and its "Style" row. |
| `web/components/settings/types.ts` | `'style'` removed from the `View` union. |
| `web/components/SettingsModal.tsx` | Removed the `style` route (title, render branch), `modeLabel`, the topic-derived state, and the `loadDigestExtras()` call in the open effect. |
| `web/lib/useUserSettings.ts` | `normalizeDigestMode()` now takes no argument and always returns `'smart'`. The legacy `digest_mode === 'synthesis'` migration now reads the **raw** stored value (asking `normalizeDigestMode` would have silently dropped a pre-toggle user's weekly recap). Removed `loadDigestExtras`, `toggleTopic`, `categoryTopics`, `tagTopics`, `topicQuery` from the hook and its return value. `digest_mode` / `digest_topics` stay in the settings shape, loaded and written back untouched. |
| `web/lib/digest.ts` | Added `TODAY_REVIEW_SIZE = 5`. |

### Backend

| File | What changed |
| --- | --- |
| `functions/digest_service.py` | `VALID_MODES` / `REMOVED_MODE_ALIASES` replaced by `DIGEST_MODE = "smart"` and `LEGACY_SYNTHESIS_MODE = "synthesis"`. `normalize_mode()` returns `"smart"` for every input. New `is_legacy_synthesis_mode(settings)` reads the raw stored value; `_synthesis_enabled` and `build_and_send_digest`'s synthesis routing both use it. `curate(links, count)` (was `curate(links, mode, count, topics)`) keeps only the smart body, byte-for-byte. `_normalize_topics` deleted. `_write_inapp_digest(uid, cards, frequency, tz_name)` writes `"mode": "smart"` and `"topics": []`. |
| `functions/models.py` | Comment-only: `digest_mode` / `digest_topics` / `digest_topic` marked inert, kept so existing settings docs round-trip. |
| `functions/main.py` | One line in `send_digest_now`: the preview override list dropped `digest_mode`, `digest_topic`, `digest_topics` (they no longer affect anything). |
| `functions/tests/test_digest_formatting.py` | Mode tests rewritten: every stored mode maps to smart; the legacy synthesis encoding is detected from the raw value; new `curate` tests (count, no duplicates, archived excluded, empty library, junk count). |
| `functions/tests/test_digest_delivery.py` | Three new tests: a legacy `digest_mode: 'synthesis'` workspace still routes to the synthesis path; a stored curation mode does not; a written digest carries `mode: "smart"` and `topics: []` even for a workspace still storing `topic` + topics. Two existing fixtures dropped their now-meaningless `digest_mode` key. |

## Exact `Feed.tsx` regions touched

Everything below is inside the Digest/Today region or is a one-line insertion.
The search region (PM-4), the card-open handler (PM-1) and the empty-state
strings (PM-1, PM-2) were not touched.

1. **Imports (~line 57, 64):** added `CalendarCheck` to the lucide import,
   `TODAY_REVIEW_SIZE` to the `@/lib/digest` import, and a new
   `import { reviewSessionQueue } from '@/lib/reviewQueue';`.
2. **~line 271, next to the `viewMode` state:** new
   `const [reviewFromToday, setReviewFromToday] = useState(false);`.
3. **~line 788, immediately after `handleOpenReminderModal`:** a new
   "Today tab" block — `reminderCards` memo, `todayReviewCount` memo,
   `completeReminder` callback, `startTodayReview` callback, and one effect that
   clears `reviewFromToday` when the view leaves review.
4. **~line 1446, the `lastLayout` assignment:** a review session opened from
   Today no longer becomes the layout the Home tab returns to.
5. **~line 1598, the `DigestView` composition:** six new props.
6. **~line 1841 and ~line 1857 (tablet/desktop subheaders):** title
   `Digest` → `Today` with the new icon; digest-detail back label
   `Back to digests` → `Back to Today`.
7. **~line 2165, the desktop toolbar destination:** label, icon, `aria-label`
   and `title` renamed.
8. **~line 2784, the `SwipeDeck` render:** `links`, `limit` and `onExit` are now
   Today-aware.
9. **~line 2932 and ~line 2964 (mobile overlays):** same string/icon renames.

## User-facing strings

Added:

- `Today` (bottom tab label + aria-label, desktop toolbar chip + aria-label, both mobile/tablet subheader titles)
- `What is coming back to you today` (desktop toolbar chip tooltip)
- `Back to Today` (digest-detail back label, was "Back to digests")
- `Due now` (section header)
- `This week` / `Last week` (section header over the weekly synthesis)
- `Change the reminder` (title) and `Change the reminder for “<card title>”` (aria-label)
- `Mark as done` (title) and `Mark the reminder for “<card title>” as done` (aria-label)
- `Review 5 cards` / `Review 1 card` (the number is `min(5, cards available)`)
- `Nothing for today yet.` (empty-state heading, was "No digests yet")
- `Reminders that come due, your weekly synthesis, and a curated pick of your saves all land here.` (empty-state line, replaces the old one)
- `Couldn't update that reminder. Please try again.` (toast, only if the write fails)

Changed:

- Digest settings footnote: `Machina picks the cards; you choose the style and when they arrive.` → `Machina picks a balanced mix of your backlog and older saves worth a second look. You choose when it arrives.`
- Synthesis footnote: `Lands in your feed and Digest tab` → `Lands in your feed and Today tab`

Removed with the style picker: `Digest style`, `Smart mix`, `Rediscover`,
`By topic`, their three notes, `Topics`, `Search topics…`, `Save some links first
to build topics.`, `No topics match “…”.`, `Categories`, `Tags`, `Clear <n>`,
`Remove <topic>`, `Clear search`, and the `Style` settings row.

Deliberately NOT renamed: `Reminders & Digest` and `Curated digest` in Settings
(the digest is still a digest; Today is the tab it lands in), the internal
`viewMode`/`BottomTab` id `'digest'`, and the push payload `{"view": "digest"}`.

## Decisions worth knowing

- **"Due now" includes fired reminders, not only pending ones.** A reminder that
  has fired is flagged `reminderDue` and may have been marked completed, so
  filtering on `reminderStatus === 'pending'` alone would have hidden exactly the
  reminders the user most needs to see. The section shows `reminderDue === true`
  or `nextReminderAt <= now`, then the ones landing later today with their time.
  It reuses the feed's already-loaded links; **no new backend query.**
- **Snooze and done reuse the existing controls.** The bell opens the same
  `ReminderModal` the card detail and the review deck open (Tomorrow / Next week
  / Pick a time / Turn off). Done clears `reminderDue` and, if the reminder is
  still pending, calls `updateLinkReminder(uid, id, false)`.
- **"This week" is honest about which week it is.** The recap is generated for
  the ISO week it closes, so from Monday it is genuinely last week's. The header
  reads "This week" only for the current ISO week and "Last week" for the one
  before; anything older is not promoted and stays in the archive list. A
  promoted synthesis is removed from the archive list so no week appears twice.
  The locked/Pro teaser behaviour is untouched (`SynthesisCard` owns it).
- **Topics were removed with by-topic mode.** They only ever narrowed the
  by-topic style. Stored values are kept on the settings doc and still round-trip;
  they are simply ignored, and new digest docs carry `topics: []`. Old digests
  keep their chips.
- **`normalize_mode` returning a constant needed a second reader.** The weekly
  synthesis has a legacy encoding as `digest_mode == 'synthesis'`. Routing it
  through `normalize_mode` would now always be false, silently stopping the recap
  for any workspace that has not saved its settings since the toggle shipped.
  Both the server (`is_legacy_synthesis_mode`) and the client (`loadSettings`)
  now read the raw stored value for that one check. There are tests for it.
- **A Today review session is a detour, not a layout choice.** It deals 5 cards
  from the unfiltered (vault-aware) link set, exits back to Today, and is
  excluded from `lastLayout`, so the Home tab never lands you in a deck.

## Verified

- `cd web && npx tsc --noEmit` — exit 0.
- `node scripts/check-em-dash.mjs` — clean.
- `npx eslint` on every touched frontend file — no new problems. Two pre-existing
  errors in `SettingsModal.tsx` (`react-hooks/set-state-in-effect`) and one
  pre-existing warning in `SwipeDeck.tsx` (unused eslint-disable) are present on
  `main` too; I confirmed that by stashing.
- `cd functions && python -m py_compile *.py` — clean.
- `functions` pytest in a fresh `python3.13` venv — **711 passed** (708 on main,
  plus the tests added here; none removed).
- `npm run build`: compiles and typechecks clean. The static-export step then
  fails at `/_not-found` prerender with `auth/invalid-api-key` because this cloud
  session has no Firebase env vars. That failure is environmental and reproduces
  on `main`.

## NOT verified

- **Nothing was run on a device or in a browser.** I cannot sign in from here, so
  no rendered check of the Today screen in light or dark, no RTL/Hebrew check of
  the due rows, no check that the desktop top section sits well above the
  two-pane reader, and no check of the tab bar with the new icon.
- The review entry and exit path (Today → deck of 5 → Done → back to Today) is
  wired and typechecks, but has not been exercised.
- No deployed backend: the one-mode `curate` and the `topics: []` write have unit
  tests but have not produced a real digest.
- The "This week" / "Last week" promotion depends on `isoWeekId` agreeing with
  the backend's `_week_id`. Both implement ISO-8601, and the helper is unit-shaped
  but has no test (there is no web test runner in this repo).

## Owner steps

None required to review the branch. When this eventually ships: the functions
deploy should be scoped to the digest senders, since `digest_service.py` changed:
`Deploy-Functions: send_digests,force_send_digests,send_digest_now`.

## For the integrating session

- **`web/components/Feed.tsx`** is the only hot shared file I touched; the nine
  regions are listed above. All are outside the search region, the card-open
  handler, and the empty-state strings.
- **`web/components/SettingsModal.tsx`, `web/components/settings/types.ts` and
  `web/lib/useUserSettings.ts`** were also edited (removing the digest style
  picker reaches into all three). If another session touched the settings hook's
  return value, note that `loadDigestExtras`, `toggleTopic`, `topicQuery`,
  `setTopicQuery`, `categoryTopics` and `tagTopics` no longer exist.
- **`functions/main.py` and `functions/models.py`** each have a single small edit
  (one line and one comment block).
- `web/components/OnboardingTour.tsx` was NOT touched. Its step 7 copy still says
  "Digest"; PM-2 owns that file and is rewriting the tour, so the rename needs to
  land there too.
