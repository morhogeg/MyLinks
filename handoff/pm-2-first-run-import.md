# PM-2 — One first run, and a library that is not empty

Branch `claude/pm-2-first-run-import`. Three parts: one first-run flow, an
import path, and a trial clock that starts at ten cards.

---

## Part 1 — the first run, screen by screen

Three screens now share one frame, `web/components/onboarding/FlowScreen.tsx`
(new): top bar with an accent icon tile and an optional counter, an optional
framed visual, an accent eyebrow, a headline, a supporting line, the screen's
own content, and a footer that holds the one primary action. Geometry is the
tour's (capped measure, real visual-viewport height, body scrolls on a short
screen, safe-area padding on every side). Tokens only, logical properties only,
so dark mode and `dir="rtl"` need no second code path. `FlowRow` in the same
file is the framed row every list on those screens is built from.

There is deliberately **no flow-wide "1 of 3" counter**. The consent screen also
appears on its own to an existing account with no recorded consent, and the tour
also fires on its own on a new browser, so any "of 3" would sometimes be a lie.
The tour keeps its own honest `N / 4`.

### Screen 1 — AI consent (`components/AIConsentNotice.tsx`)

Substance unchanged: the same three disclosures, the same single explicit
consent action, the same Privacy Policy link, the same `aiConsentAt` write (in
`AuthProvider.acceptAiConsent`, untouched). Only the frame changed.

- Eyebrow "Before you start", title "Machina uses AI", body "Here is exactly
  what happens to what you save."
- Rows: "Analyzed by Google Gemini", "Not used to train AI models", "Sent
  without your identity" (bodies verbatim from the old screen).
- Button "I understand, continue", then the by-continuing footnote with the
  Privacy Policy link (opens in Safari on native, unchanged).

### Screen 2 — "Bring what you've saved" (`components/Onboarding.tsx`)

Replaces the old one-screen welcome. Eyebrow "Get started", title "Bring what
you've saved", body "Machina is worth using the moment it has something to work
with. Start with what you already have." Three rows:

1. **Import a file** — "Your browser bookmarks, a Pocket export, or a list of
   links you paste. Machina reads and files every one." Opens the import sheet.
   When an import actually starts, the welcome dismisses itself so the feed can
   fill in behind it.
2. **Save your first thing** — native: "Share to Machina from Safari, YouTube,
   or any other app. It takes 20 seconds to set up." Web: "Use the plus button
   here, or add the browser extension and clip any page in one click." Tapping
   it expands the numbered how-to **in place** (no fourth screen): on native the
   three share-sheet steps that existed before, including the one-time
   "More… -> toggle Machina on"; on web, plus button, then extension, then
   what one click does. A "Got it" / "Start saving" button finishes.
3. **Not now** — "Start empty and save as you go. Importing is always there in
   Settings."

Trial line at the bottom, only for a reverse trial: "Pro is free for your first
14 days. The clock starts once you've saved 10 things." (falls back to "Nothing
to cancel." once the clock is running; the number comes from the server).

### Screen 3 — "How Machina works" (`components/OnboardingTour.tsx`)

Eight steps became four, on the same shell, keeping swipe, keyboard, haptics,
Skip, dots, and the `machina_onboarding_v1` localStorage key exactly as they
were. Settings -> "Take the tour again" is unchanged.

| # | Eyebrow | Title | Visual |
|---|---|---|---|
| 1 | Capture | Save anything, from anywhere | the share-sheet mock |
| 2 | Understand | Understood, and connected | the real-card mock, now with a "Connected to" strip |
| 3 | Recall | Ask, and find | the Ask mock |
| 4 | Resurface | It comes back to you | the digest/reminder mock |

The graph, search, collections and send-off mocks were deleted with their steps.
Step 2's connections strip uses `getCategoryColorStyle`, the same category
identity colour the graph and the cards use, so it carries what the graph mock
was there to say.

**The `hasCards` gate is gone** (`web/app/page.tsx`, one region around line 210).
It meant the tour never fired for a brand-new account, which is exactly who it
was written for, and its comment referenced an example seed that does not exist.
The 600 ms delayed mount is kept. `hasCards` state and the `onHasCardsChange`
prop on `Feed` (optional) are no longer passed from `page.tsx`.

### Empty feed copy (`web/components/Feed.tsx`, one line around 2675)

Native: "Share a link to Machina from any app, or tap + to add one here. Machina
reads it, tags it, and files it for you." Web: "Tap + to save your first link,
or add the browser extension to clip any page. …" It now names each platform's
first capture surface first, matching what the first run just taught.

---

## Part 2 — import

### Parsers — `web/lib/importParsers.ts` (new, pure, no DOM)

| Format | Detected by | Kept |
|---|---|---|
| Netscape bookmarks HTML (Safari, Chrome, Firefox, Edge, Arc) | the doctype, a `<DT><A HREF` pattern, or an `.html` name | url, title, `ADD_DATE`, nested folder path + `TAGS` as tag hints |
| Pocket CSV (`url,title,time_added,tags,status`) | a `url` column in the header, or a `.csv` name | url, title, `time_added`, pipe/comma-separated tags |
| Plain text, one URL per line (also "paste links") | anything else | url, plus a markdown link's label as the title |

Folders are tracked with a stack pushed on `<DL>` and popped on `</DL>`, so
"Bookmarks bar / Reading / Longform" arrives as three tag hints in order. Junk
is dropped and counted, never thrown on: `javascript:` bookmarklets, Firefox
`place:` smart folders, `chrome://` internals, `file://` paths, separators,
over-long URLs. A file that detects as one format but yields nothing falls back
to `recoverUrls`, which pulls every http(s) URL out of the text.

URLs are returned **exactly as the file wrote them** (minus trailing prose
punctuation), never re-serialised through `URL`, because the library's duplicate
check is an exact string match on the stored `url`.

Tests: `web/lib/__tests__/importParsers.test.ts`, 20 cases over real Safari,
Chrome and Firefox fixtures plus a Pocket CSV with quoted commas and doubled
quotes. Run with **`npm run test:parsers`** (new script). The repo has no JS test
runner, so this uses Node's own `node --test` plus its type stripping, no
dependencies. That is also why `web/tsconfig.json` gains
`allowImportingTsExtensions: true` (see shared files below).

### Sheet — `web/components/ImportSheet.tsx` (new)

Same sheet primitives as `Paywall.tsx` (`useSheetDrag`, `useScrollLock`, the
drag handle, the scrim, `safe-pb`). Choose a file or paste, then:

- Parse, de-duplicate inside the file, then walk the parsed list **in order**
  asking `findLinkIdByUrl` about each link (8 in flight) until 200 new ones are
  found or 1000 have been checked. Walking rather than checking only the first
  200 is what makes a second import of the same file continue where the first
  stopped.
- Show "N new links, M already saved", the format it was read as, how many
  entries were not web pages, and, when the file holds more, "Machina brings 200
  links over at a time. Import again afterwards to continue where this stops."
- Import posts in chunks of 25 so "Importing 37 of 120" is a real number, with a
  progress bar. The cards are written server-side as `processing` placeholders,
  so the feed behind the sheet fills with the existing skeletons and analyzing
  pill; closing the sheet mid-import loses nothing.
- A 429 with `upgrade: true` opens the paywall instead of showing an error.
  Whatever already went through is kept.

Reachable from first-run screen 2 and from **Settings -> Your data -> "Import
bookmarks or a Pocket export"** (one new row above the existing export row).

### Endpoint — `POST /api/import` -> `import_links_http` (`functions/main.py`)

Placed directly after `share_ingest`. App Check like the other first-party
endpoints, `_authed_uid` for the workspace, and its own rate-limit buckets
`import` (identity) and `import-uid`, both 60/hour, fail-closed like every paid
bucket. Body `{links: [{url, title?, addedAt?, tags?}]}`, at most 200.

Per link: `_import_url` (http(s), a real host, under `MAX_URL_LENGTH`),
`_import_added_at` (seconds or ms, rejected outside 1990..now),
`_import_tags` (8 tags, 40 chars, de-duplicated). Duplicates are skipped
server-side too via `link_exists_for_url` / `pending_exists_for_url`, and are
never charged.

Each accepted link becomes exactly what a share-sheet capture becomes: a
`processing` placeholder card in `users/{uid}/links` plus one
`pending_processing` queue doc carrying its `cardId` and `source: "import"`,
which the existing `process_link_background` trigger picks up. **No second
pipeline.** `createdAt` is now, so an import lands at the top of the feed; the
original bookmark date is stored beside it as `importedFromAt`, with
`importedTags` and `importedAt`. Because the trigger's final `card_ref.set()`
replaces the placeholder wholesale, `importedFromAt` and `importedTags` ride the
queue doc and are copied back onto the finished (and the failed) card.

Returns `{success, queued, duplicates, invalid, received}`.

### Quota — `imports`, a LIFETIME bucket (`functions/quota.py`)

| Plan | Lifetime imported links | Env override |
|---|---|---|
| Free | 500 | `FREE_IMPORT_QUOTA` |
| Pro | 10000 (abuse ceiling) | `PRO_IMPORT_QUOTA` |

Imported links do **not** touch the monthly `saves` quota, so a new user cannot
meet the paywall while filling an empty library. `quota.py` gained a `scope`
on a quota kind: lifetime kinds count in a reserved `"lifetime"` sub-map of the
same `usage_quotas/{uid}` doc (month keys are always `YYYY-MM`, so they cannot
collide), and the month pruning always keeps it. `meter()` now takes a real
`amount`, and a batch that would cross the limit is refused whole rather than
partially charged; the 429 body keeps the existing `upgrade/kind/used/limit`
shape, so the client opens the paywall.

### Rewrites added

- `firebase.json`: `/api/import` -> `import_links_http` (this is what the native
  app hits; needs a Hosting redeploy on merge).
- `web/vercel.json`: `/api/import` -> `https://secondbrain-app-94da2.web.app/api/import`.

Both follow the `/api/entitlement` entries added 2026-09-02.

### A janitor fix the import forced

A 200-link import queues far more work than `process_link_background`'s
`max_instances=10` can run at once, and the tail can wait past the janitor's
15-minute window. Two surgical changes in `functions/main.py`:

1. The trigger now re-stamps `processingStartedAt` when work actually starts on
   a card it did not create, so a card's 15 minutes measure processing, not
   queueing. (For the web capture path this re-stamps about a second later and
   changes nothing.)
2. The stale-queue-doc prune now uses two windows: a job that STARTED and died
   is still pruned after 15 minutes; a job still `queued` gets 4 hours
   (`_QUEUED_TIMEOUT_MS`). Without this the prune would delete an import's tail
   from under it, the trigger's first write would raise NOT_FOUND, and a healthy
   import would land as failed cards.

---

## Part 3 — the trial clock starts at ten cards

`functions/entitlement.py`:

- `TRIAL_ANCHOR_CARDS = 10`, `TRIAL_CEILING_DAYS = 60`.
- `grant_for(created, trial_anchor_at, trial_ends_at)`:
  - **Founder** (created before `PRO_LAUNCH_AT`, or no `createdAt`): 365 days
    from launch, both trial arguments ignored. Untouched.
  - **Anchored trial**: `trialEndsAt = min(anchor + 14d, createdAt + 60d)`,
    `proUntil` the same.
  - **Grandfathered** (a doc written before this rule, so it has `trialEndsAt`
    but no anchor): its end date stands, untouched.
  - **Unstarted trial**: `trialEndsAt` is `null` and `proUntil` is the 60-day
    ceiling. The plan resolves as trial-Pro, and the ceiling is what stops a
    dormant account sitting on Pro forever.
- `maybe_start_trial(uid)` writes `trialAnchorAt`, `trialEndsAt` and `proUntil`
  the moment the library reaches ten cards. Called from
  `search.sync_link_embedding` (the one Firestore trigger every capture path
  ends in: share sheet, web add, note, import) on a card **create** only, before
  the embedding early-returns, so a `processing` placeholder still counts. No new
  scheduler. Almost every call costs nothing: a per-instance settled memo skips
  workspaces that are founders, subscribers, grandfathered, or already anchored;
  the rest read one entitlement doc and at most ten projected card ids.
- `sync_from_revenuecat` carries the anchor and end date through, so a lapsed
  subscriber does not get a fresh 14 days.
- `run_trial_nudges` needed no logic change: an unstarted trial has a null
  `trialEndsAt`, which the range filter excludes by definition. It becomes a
  candidate the moment the tenth card anchors the clock.

`GET /api/entitlement` is backward compatible: `trialAnchorAt`,
`trialAnchorCards` and a `quotas.imports` meter are **added**; nothing is renamed
or removed.

Client (`lib/entitlement.ts`, `EntitlementProvider`): new `trialStarted` and
`trialAnchorCards`. An unstarted trial reports `daysLeft` as `null` rather than
counting down the 60-day ceiling (which would advertise a 60-day trial). The
Settings Plan row shows "trial" instead of "trial, 0 days left"; the paywall says
"Your free trial starts once you have saved 10 things."

Tests: under ten cards, exactly ten, the 60-day ceiling capping a late anchor,
founders, an already-started trial, a grandfathered doc, a Firestore failure, and
the create-only / update-skipped behaviour of the trigger hook.

---

## Files

**New**

- `web/lib/importParsers.ts`
- `web/lib/__tests__/importParsers.test.ts`
- `web/components/ImportSheet.tsx`
- `web/components/onboarding/FlowScreen.tsx`
- `functions/tests/test_import_links.py`

**Owned, rewritten**

- `web/components/Onboarding.tsx`, `web/components/OnboardingTour.tsx`,
  `web/components/AIConsentNotice.tsx`
- `functions/entitlement.py`, `functions/quota.py`

**Shared files touched — the exact regions**

| File | Region |
|---|---|
| `functions/main.py` | new `import_links_http` + its helpers and constants, placed immediately after `share_ingest`; two new rows in `_RATE_LIMITS`; `_quota_blocked` gained an `amount` parameter; three additions inside `process_link_background` (the `processingStartedAt` re-stamp, and the `importedFromAt`/`importedTags` carry-forward on the ready and the failed card); `_QUEUED_TIMEOUT_MS` and the two-window queue prune in `run_processing_janitor` |
| `functions/search.py` | five lines at the top of `sync_link_embedding`'s body calling `maybe_start_trial` on a create |
| `web/app/page.tsx` | the tour effect: `hasCards` state, its gate and its dependency removed, comment rewritten; `onHasCardsChange` dropped from the `Feed` props line |
| `web/components/Feed.tsx` | the default empty-state `body`, one expression around line 2675 |
| `web/components/settings/MainView.tsx` | `useState` + `Upload` + `ImportSheet` imports; the mounted `<ImportSheet>`; one new `NavRow` and footnote in "Your data"; the trial value in `proValue` when the clock has not started |
| `web/components/Paywall.tsx` | one `HEADLINE` entry for the `imports` reason; the `trialLine` gains an unstarted-trial branch |
| `web/components/EntitlementProvider.tsx` | `trialStarted` / `trialAnchorCards` on the context, `imports` in `UNMETERED`, the `daysLeft` derivation |
| `web/lib/entitlement.ts` | `QuotaKind`, `trialAnchorAt`/`trialAnchorCards`/`quotas.imports` on `Entitlement`, `isUpgradeHint` and `PaywallReason` accept `imports` |
| `web/tsconfig.json` | `allowImportingTsExtensions: true` (safe under `noEmit`: it permits the extension, never requires one). Needed so tsc can type-check the parser test, which imports `../importParsers.ts` by its real filename for Node's type stripping |
| `web/package.json` | one new script, `test:parsers`. No dependency changes; `package-lock.json` is untouched |
| `firebase.json`, `web/vercel.json` | one `/api/import` rewrite each |
| `functions/tests/test_quota.py` | two existing assertions updated for the new `imports` key in `quota_usage` |
| `functions/tests/test_entitlement.py` | the trial-grant tests rewritten for the anchor rule |
| `functions/tests/test_embed_trigger_backstop.py` | its `_event` helper now supplies `change.before` (its events are updates, so the create-only anchor hook does not fire) |

Other sessions editing `main.py`, `Feed.tsx`, `page.tsx`, `MainView.tsx` or
`Paywall.tsx` will meet these regions; none of them reformat anything.

---

## Verified

- `cd functions && python -m py_compile *.py` — clean.
- `cd functions && venv/bin/python -m pytest -q` — **750 passed** (was 744 on
  main plus this branch's new cases; the venv was built from
  `requirements.txt` + `requirements-dev.txt`, offline).
- `cd web && npx tsc --noEmit` — exit 0.
- `cd web && node scripts/check-em-dash.mjs` — clean.
- `cd web && npx eslint <every touched file>` — clean. (`eslint components/ app/
  lib/` reports 9 pre-existing errors in files this branch does not touch:
  `KnowledgeGraph`, `SettingsModal`, `landing/*`, `StatsView`,
  `useScrollAwayBar`.)
- `cd web && npm run build` — passes, including the prebuild em-dash gate and
  Next's TypeScript pass. It needs `NEXT_PUBLIC_FIREBASE_*` set to anything
  non-empty or `/_not-found` prerendering dies on `auth/invalid-api-key`; that
  is true on `main` too, not a change here.
- `cd web && npm run test:parsers` — 20 passed.

## NOT verified

I cannot run the app, sign in, or reach Firestore from here. All of the
following is reasoned from the code and untested at runtime:

- **Every screen's appearance.** The three first-run screens, the import sheet,
  and the new Settings row have never been rendered. Light and dark, RTL and
  Hebrew, iPhone SE and a home-indicator iPhone all need one look. The consent
  screen is the one to check hardest: it is the tallest of the three and it is an
  App Review gate.
- **The first-run sequence end to end.** Consent -> welcome -> tour on a genuinely
  new account, and that the tour now fires over an empty library (the whole point
  of removing the `hasCards` gate).
- **The import, end to end.** No request has been made to `/api/import`. The
  endpoint's logic is unit-tested against fakes, and the parsers against real
  export fixtures, but nothing has been through Firestore, the queue, the
  trigger, or Gemini.
- **Import throughput against the janitor.** The two janitor changes are the fix
  for a 200-link import outrunning the 15-minute window; the arithmetic behind it
  (200 links, `max_instances=10`, tens of seconds each) is an estimate, not a
  measurement. Worth watching the first real 200-link import.
- **The trial anchor firing.** `maybe_start_trial` runs inside a deployed
  Firestore trigger; the unit tests drive it through fakes.
- **The Firestore rules emulator suite** (the emulator JAR download is blocked in
  a cloud session). No rule changes were made: `entitlements` and `usage_quotas`
  stay functions-only, and the import writes to `users/{uid}/links` and
  `pending_processing` through the Admin SDK exactly as the share path does.

## Owner steps

- Nothing new to configure. No new secrets, no new env vars. The two import
  quota numbers are overridable with `FREE_IMPORT_QUOTA` / `PRO_IMPORT_QUOTA` if
  500 or 10000 turn out wrong.
- **A Hosting redeploy is required on merge**: `firebase.json` gains an
  `/api/import` rewrite, and the native app reaches the endpoint through it. Same
  shape as the `/api/entitlement` race on 2026-09-02, so deploy functions first
  and hosting after, or expect one re-fire.
- The functions deploy needs `import_links_http` in scope (it is a new function,
  so an unscoped deploy is simplest).
