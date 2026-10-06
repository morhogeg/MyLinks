# Machina launch audit: final report

Branch `claude/launch-audit`, merged to `main` as `7c82ffa` and shipped on
2026-10-06: Cloud Functions, indexes, Firestore rules, web, and TestFlight
build 1347 (SOURCE_OF_TRUTH §9 has the runs). Every finding, its status and
its commit are in `01-findings.md`; the product map is in `00-app-map.md`.

## 1. Verdict: ready with caveats

The code is in launch shape. Every high-severity finding is fixed in this
branch. Backend fixes come with tests that fail on the old code; UI fixes
were type-checked and linted, and the visual ones rendered and measured; the
full suites pass locally and in CI. What stands between this branch and the
App Store is work that can't be done from this machine:

1. **Ship it.** Done on 2026-10-06 (`7c82ffa`): all Cloud Functions
   (indexes first), the Firestore rules and TestFlight build 1347, every run
   green; Vercel deploys on push (not checked from the cloud session).
2. **Smoke-test the iOS changes on a device.** The share-extension Swift,
   the Facebook-SDK strip and the plist and asset changes compiled for the
   first time in build 1347; nothing has run on a device yet: the
   15-minute device pass (section 4).
3. **App Store Connect**: the privacy label rows and the Terms of Use link
   (section 4).

The caveat behind "with caveats" is the same list: nothing here was run on a
device, against production Firebase, or against live Gemini.

## 2. What was fixed, by severity

207 findings across 11 audit areas: 24 high, 84 medium, 10 low-medium,
87 low, 2 informational. **196 fixed** (3 of them also need an owner step:
WEB-3, IOS-2, IOS-3), 3 partial (OWN-9, IOS-5, CAP-6), 5 accepted with the
reason stated, 1 owner-only (IOS-19), 2 clean checks. Every finding with
its commit is in `01-findings.md`. Below: every high, then the mediums
grouped by what they protect.

### High (all fixed)

- **Reminders could be stopped for every user by one bad card** (ACCT-1).
  A card with `title: null`, or a malformed reminder setting, raised outside
  any error handling, and the shared oldest-first query kept it at the head:
  nobody got a reminder again. Each user is now isolated and every field is
  coerced.
- **Private content reaching Gemini**: search sent private cards to the
  relevance judge (AUTH-2); a saved page's prompt injection could leak other
  cards through Markdown images in Ask answers (AI-1, REC-9); a "thanks"
  turn became the subject of the next follow-up (RV-1).
- **AI consent bypass**: the share sheet worked before the user agreed to
  Gemini processing, and consent was cached device-wide (AUTH-1; App Review
  5.1.2).
- **App Review notes said "No purchases"** while the build sells Machina Pro
  (IOS-1).
- **Data and money**: double-tap Save made two cards and two charges
  (WEB-4); client cards stored `createdAt` in the wrong type, breaking time
  labels and paging (WEB-3; repair script for old cards is an owner step);
  an open card outside the loaded window was a frozen copy (WEB-1); filters
  only saw the loaded window (WEB-2); free users never saw the locked weekly
  recap (REC-1); a shared answer couldn't be unpublished once its sources
  went private (REC-2); digest ticks dropped users past 60 s (AI-2).
- **Capture charging and loss**: the janitor deleted queue jobs while they
  ran, failing the card and charging Retry again (CAP-1); Retry and the web
  Image tab charged up front and kept the charge when the app gave up at
  60 s (CAP-2). Both now go through the durable queue.
- **Unreadable or untappable UI**: muted text at 2.3-3.6:1 (A11Y-1),
  category chips down to 1.7:1 (A11Y-2), white labels on the porcelain
  gradient (DS-1), a red debug border under every heading (DS-2), Ask silent
  to VoiceOver (A11Y-3), cards with no keyboard or button semantics (A11Y-4),
  and controls under 44pt (T-1, T-2).
- **Dependency**: `next` in a critical advisory range (OWN-1).

### Medium (fixed unless noted)

- **Privacy and account**: account deletion could leave images and report
  success (ACCT-4); a deleted account's share links could be re-claimed for
  phishing (ACCT-3); a deleted account's trial clock (a founder's year) could
  be claimed (ACCT-2); making a card private didn't take its public page down
  (ACCT-5, REC-15; collection pages excepted, see §4); tags from private cards
  went into analysis prompts (PRIV-1); "see also" sent private candidates to
  the verifier (GRAPH-PRIV); deleting a chat orphaned its public answers
  (REC-3); export ignored the privacy PIN (AUTH-17); the privacy policy's
  "complete list" was wrong (AUTH-5), and it now names the relays and the
  records that outlive an account.
- **Capture**: large pages ran the scraper out of memory (CAP-4); LinkedIn
  walls became "ready" cards of raw markup (CAP-9); tracking tokens went to
  third-party relays (CAP-10); every save read the whole library (CAP-11);
  international domains were refused (CAP-12); the capture form froze
  (WEB-5); Retry threw away video data (WEB-7); 6+ screenshots hid the share
  extension (IOS-4); the share sheet could hang on a dim screen (IOS-7).
- **Capture queue**: a redelivered job made a duplicate card or overwrote a
  good Retry (CAP-3); a failure after the card was written failed it with no
  refund (CAP-7); screenshots were stored twice and outlived their card
  (CAP-8); the daily backlog release could hold up live saves for hours
  (CAP-6, partial: it now drains in slices).
- **Ask and recall**: budgets that didn't line up (AI-3, RV-2, REC-7), honest
  "not in your saves" answers charged (AI-5) and refunds that could be
  farmed (RV-3), an embedding outage shown as an empty library (AI-6), lost
  vectors (AI-7, RV-5), silent cut-offs (AI-8), Hebrew questions misread
  (AI-9, RV-6), notes truncated at 1,500 characters (AI-10), the graph
  migration that couldn't finish (AI-11) and redrew every frame (REC-5,
  REC-6), long chats lagging (REC-8).
- **Sign-in and settings**: slow deletion reported as failed (AUTH-3, AUTH-8),
  no purge on outside sign-outs (AUTH-4), offline saves discarded at sign-out
  (AUTH-6, WEB-16), push toggles that lied or threw users into iOS Settings
  (AUTH-7, AUTH-9).
- **Accessibility and design**: sheets without dialog semantics (A11Y-6),
  color-only selection (A11Y-10), toasts too fast to reach Undo (A11Y-12),
  hover-only controls invisible on touch (A11Y-5, T-5), status colors failing
  in light mode (A11Y-8, DS-4), digest wheels unusable by keyboard or
  VoiceOver (A11Y-11), and more in the log.
- **Release**: privacy declarations that contradicted each other (IOS-2;
  label update is an owner step), the Facebook SDK in every build (IOS-3;
  first compile pending), unpinned native dependencies (IOS-5; partial),
  the local build script with the sign-in gate off (IOS-6).
- **A regression from this audit, caught in the final sweep** (OWN-10): the
  lazy loading added for OWN-9 made Ask or the graph crash to the error
  screen when opened offline on the web, and stay broken until a full
  reload. It now shows a retry state and loads on reconnect. iOS was never
  affected (the app ships that code in its bundle).

### Low and low-medium

97 of them, all fixed or explained in the log: copy, RTL details, locale
formats, tooling, cost trims and robustness gaps.

## 3. What was verified, and how

**Ran, and passed (verified)**
- Backend: `pytest` 1,904 passed (1,360 at the start of the audit);
  `python -m py_compile *.py`; `ruff --select F` clean on every production
  module. Each backend fix comes with tests, and the new tests were run
  against the previous code to confirm they fail there (a few pin behaviour
  that must not change, and pass on both); the fix agents worked the same
  way.
- Web: `tsc --noEmit` 0 errors; `eslint . --max-warnings=0` clean on the
  whole project; unit tests 79/79 (`lib` + build scripts); the em-dash gate
  (now parser-based) clean on 196 files; the production static export builds.
- CI on GitHub (Playwright journeys against the Firebase emulators, which
  can't be downloaded here): E2E journeys green on `88d078a`, the last code
  commit (67 passed, 4 skipped; extension journeys 13 passed); the Python
  suite green on `a0e80b2`, the last backend commit; Firestore rules tests
  green on `043ae65` (rules unchanged since). The E2E run covers the new
  Google-emulator sign-in the stricter create rule required.
- Browser extension: unit checks locally; its Chromium journeys in CI.
- Renders in Chromium (temporary harness pages, deleted after): touch
  targets on a phone vs desktop (44pt only on touch), category chip
  contrast measured on rendered chips in both themes (4.99-8.93:1), the
  offline pill (no longer swallows taps), digest wheels by keyboard, toast
  timing, reduced-motion deck, Apple button in both themes, paywall states,
  theme color, week labels west of UTC, Hebrew `lang` on cards, and the
  lazy-loaded Ask and graph on a production build (the old loader's offline
  crash reproduced; the new one recovers offline, after a failed load and
  after a failed prefetch).
- Measured: first-load JavaScript 1,986 KB / 595 KB gzip before,
  1,752 KB / 524 KB after (production build, home page).

**Not verified (couldn't be run here)**
- Any Swift: no toolchain here. The share-extension changes compiled in CI
  for build 1347, after this report was written; they have not run on a
  device.
- Anything on a device: VoiceOver, native sign-in cancel, push permission
  flows, the share sheet, haptics, Dynamic Type.
- Production: no deploy, no production data read or written, no live Gemini
  call (prompt-injection obedience, RECITATION recovery and timeout
  behaviour are tested with fakes), no live RevenueCat.
- The Firestore emulator locally (blocked download): rules and journeys ran
  only in CI.

## 4. Remaining items not resolvable from here

Each line: what, and why it can't be done here.

**Ship and compile (owner, in this order)**
- Done 2026-10-06, on the owner's go-ahead: merged to `main` as `7c82ffa`
  via `/ship`. Vercel deploys on push; all functions deployed (no
  `Deploy-Functions:` scope line), indexes first (two `links` composite
  indexes for the janitor, `links.enrichStatus`, `links.needsEmbedding` and
  `client_errors.createdAt` overrides; the janitor falls back to its old
  scan while they build); the rules deploy ran too (Google/Apple-only
  self-serve workspace create).
- Done 2026-10-06: TestFlight build 1347, the first compile of the
  share-extension Swift (IOS-4, 7, 10-13, 17), the Facebook-SDK strip
  (IOS-3) and the plist/asset changes. All green in CI.
- Device pass on build 1347, about 15 minutes: share 6+ screenshots
  (extension shows; "first 5 of N"); share with VoiceOver on (result is
  spoken); save one screenshot from the + sheet and Retry a failed card
  (both now run in the background and finish on their own); cancel Apple and
  Google sign-in (no red error); Settings → notifications, tap Don't Allow
  (no jump to Settings); make a shared card Private, then open its link (not
  found); delete a test account with images (it finishes; images gone). None
  of this can run without a device.

**Production data and consoles (owner)**
- `normalize_created_at`: dry run, then `--apply` (WEB-3). It rewrites
  production cards; never run without the owner.
- App Store Connect → App Privacy: add the Purchases → Purchase History and
  Identifiers → Device ID rows (IOS-2). Console only.
- App Store Connect: Terms of Use link in the description or as the custom
  License Agreement (guideline 3.1.2(c); `docs/APP_STORE.md` §5). Console only.
- `Package.resolved`: commit the full file from a Mac, then add
  `-onlyUsePackageVersionsFromResolvedFile` to the build (IOS-5). Needs Xcode.
- RevenueCat: the open setup items in SOURCE_OF_TRUTH §4 (keys, webhook
  secret, products). Unchanged by this audit; the paywall degrades honestly
  until then.
- Already on the owner's list, unchanged: Gemini spend cap, Gemini key and
  ASC `.p8` rotation.
- Optional: set `LOG_MASK_KEY` in `functions/.env` (log tags are keyed from
  `GEMINI_API_KEY` without it, ACCT-9).
- Optional, for future audits: allow `storage.googleapis.com` and
  `dl.google.com` in this environment's network policy, so the Firestore
  emulator (and with it the E2E journeys and rules tests) can run locally
  instead of only in CI.

**Deliberately left, with the reason**
- ACCT-10, re-authentication before account deletion: Apple accounts already
  re-authenticate; a Google re-sign-in step on iOS can't be device-tested
  here, and a broken deletion is an App Store rejection.
- IOS-19, UIScene: Capacitor 8.4 doesn't support scenes yet; required before
  moving to Xcode 27, not for this release.
- IOS-12, Dynamic Type in the share sheet: fixed font sizes; relaying it out
  needs a device.
- CAP-5, CPU and concurrency settings: every function runs with gen-1 CPU
  shares and concurrency 1. Raising them is a cost decision, and concurrency
  above 1 needs a thread-safety pass over per-instance caches first.
- ACCT-5 remainder: a card made private stays on a public *collection* page
  until that page is updated (collection snapshots carry no card ids; the
  app says so when it happens).
- ACCT-15: a race that can wipe a just-started trial clock during a
  RevenueCat sync; worst case is a second 14-day trial.
- OWN-2: an npm-audit "high" in a Node-only gRPC transport the browser
  build never uses.

## 5. Recommended post-launch priorities

1. **Watch the first week's error trails.** `server_errors` (14-day
   records, returned by `debug_status`) and `client_error_reports`, the
   reminder and digest tick reports, Ask refunds (RV-3 now charges long
   cut-offs), and `/s` pages withdrawn as private. Several fixes here change
   behaviour that only real traffic exercises.
2. **A real VoiceOver and Dynamic Type pass on device.** The accessibility
   work was verified in Chromium against WebKit semantics; VoiceOver itself
   was never run. Includes the share sheet's Dynamic Type (IOS-12).
3. **Re-authentication before account deletion** (ACCT-10), built and
   tested on a device for Google and Apple.
4. **Public collection pages that drop private cards on their own**
   (ACCT-5 remainder): store member card ids on the snapshot so `/c` can
   filter at render time, as `/s` now does.
5. **CPU and concurrency for the capture endpoints** (CAP-5) once traffic
   shows `share_ingest` latency; first audit per-instance caches for thread
   safety.
6. **UIScene migration** (IOS-19) as soon as Capacitor supports it, before
   Xcode 27.
7. **More code-splitting** (OWN-9): the card detail and the review deck are
   the next largest pieces of the first load.
