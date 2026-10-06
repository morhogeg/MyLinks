# Launch audit: findings log

Every finding from the audit, with what happened to it. Each one was
re-checked against the code before it was fixed, and each fix was verified
(tests, typecheck/lint, a render, or a probe; the commit message says which).

Status:
- **fixed** `hash`: the commit(s) on `claude/launch-audit` that fix it.
- **partial**: what is done and what is left, and why.
- **owner**: needs something outside the repo (a console, a device, a secret,
  a production command). The exact action is in `FINAL-REPORT.md`.
- **accepted**: deliberately left as is, with the reason.
- **open**: not done, with the reason.

Sources: my own passes (OWN), eight parallel read-only audits (web library
WEB, web auth/settings AUTH, web recall REC, AI/search AI, iOS/release IOS,
accessibility and design A11Y/T/DT/RM/DS/C/R/L, capture pipeline CAP,
account/billing/sharing ACCT), a review of the backend fix branch (RV), and
findings made while fixing (PRIV).

Severity is the auditor's, re-rated where the code showed otherwise.

## Own passes: code health, dependencies, secrets, bundle

| ID | Sev | Finding | Status |
|---|---|---|---|
| OWN-1 | high | `next` 16.3.5 in the critical advisory range (GHSA-vcvr-r3jv-pc5j, RCE in `next/og`; not imported, so not reachable) | fixed `4e17a34` (16.3.8) |
| OWN-2 | low | `@grpc/grpc-js` <1.13.6 inside `@firebase/firestore` (npm audit high) | accepted: Node-only transport; the browser SDK uses WebChannel, and even firebase 12.19.0 pins `~1.9` |
| OWN-3 | low | ESLint: 9 errors, 7 warnings | fixed `9570d99` (0/0; each remaining suppression carries its reason) |
| OWN-4 | low | Python: 17 unused imports, 1 dead local (ruff F) | fixed `e609f3c` |
| OWN-5 | info | Secrets: full history (1,877 commits) scanned | clean: only the public Firebase web API key and placeholders |
| OWN-6 | info | pip-audit on `functions/requirements.txt` | clean |
| OWN-7 | low | Extension keyboard test raced a tab's URL at creation | fixed `519f131` |
| OWN-8 | low | `next dev` 16.3.8 writes `web/AGENTS.md` + `web/CLAUDE.md` in agent sessions | fixed `4e71370` (gitignored) |
| OWN-9 | medium | First load shipped 1,986 KB of JS (595 KB gzip), including react-markdown and the whole graph | partial `dea79c9`: Ask and the graph load on first use (1,752 KB / 523 KB gzip, react-markdown out of the first load). The rest is Firebase (~370 KB) and the feed itself; further splitting has small returns for its risk |

## Web: library and capture (WEB)

| ID | Sev | Finding | Status |
|---|---|---|---|
| WEB-1 | high | A card outside the 150-card window opened as a frozen snapshot, so edits looked like they failed | fixed `257d6b6` |
| WEB-2 | high | Status filters, facets and Insights taps only saw the loaded window and showed false empty states | fixed `e0fa9da` |
| WEB-3 | high | Client-written cards stored `createdAt` as a Timestamp; every backend writer stores int ms, so relative time and paging broke | fixed `59178fe` for new writes; **owner**: run `normalize_created_at` (dry run, then `--apply`) to repair existing cards |
| WEB-4 | high | Tapping Save twice could create two cards and charge two saves | fixed `6c0db61` |
| WEB-5 | medium | The capture form froze with no timeout when Firestore couldn't confirm a write | fixed `6c0db61` |
| WEB-6 | medium | Tapping a card in a digest opened the website instead of the card | fixed `6f292af` |
| WEB-7 | medium | Retrying a failed YouTube or social capture threw away the video and cover data | fixed `68eff1e` |
| WEB-8 | medium | Pending reminders on older cards didn't show anywhere until they fired | fixed `206e081` |
| WEB-9 | medium | Undo after archiving a starred card in the digest deck removed the star | fixed `ac68db3` |
| WEB-10 | medium | On desktop and iPad every save or delete remounted the whole grid | fixed `8875914` |
| WEB-11 | low | Screenshot-enrich state carried over between related cards | fixed `68eff1e` |
| WEB-12 | low | Deleting your only collection from inside it left a blank screen | fixed `d24d32b` |
| WEB-13 | low | Deep links to older cards could silently fail to open | fixed `65daf92` |
| WEB-14 | low | A failed library listener said "Reconnecting…" but never reconnected | fixed `bfe4452` |
| WEB-15 | low | The capture banner could stick on "Saved to Machina 100%" | fixed `68eff1e` |
| WEB-16 | low | Signing out lost offline saves and edits without a word | fixed `7232cda` (asks first) |
| WEB-17 | low | A link saved offline that already existed became a duplicate | fixed `6c0db61` |
| WEB-18 | low | One malformed character entity failed a whole bookmarks import | fixed `c214bff` |
| WEB-19 | low | Single-image saves showed raw browser errors and could lose the capture when backgrounded | fixed: errors `6c0db61`; durability with CAP-2 (below) |
| WEB-20 | low | Bulk archive had no Undo and no bulk unarchive | fixed `f52f88f` |
| WEB-21 | low (cost) | Each note save read up to 600 documents for the prompt's vocabulary | see PRIV-1: the server builds the vocabulary now; the app's own reads go with the capture merge |

## Web: sign-in, settings, consent, billing (AUTH)

| ID | Sev | Finding | Status |
|---|---|---|---|
| AUTH-1 | high | The share sheet worked before AI consent (App Review 5.1.2); consent was cached device-wide | fixed `4a3ae74` |
| AUTH-2 | high | Search sent private cards to Gemini | fixed `0a8920d` (see the AI section) |
| AUTH-3 | medium | A slow account deletion was reported as failed, and every retry then failed | fixed `5077234` |
| AUTH-4 | medium | Sign-outs the app didn't trigger (account disabled elsewhere) ran no purge | fixed `4a3ae74` |
| AUTH-5 | medium | The privacy policy's "complete list" was wrong in three places | fixed `1f4e247` |
| AUTH-6 | medium | Sign-out silently discarded offline saves | fixed `7232cda` |
| AUTH-7 | medium | The push toggle showed ON when this device couldn't receive pushes | fixed `d089abc` |
| AUTH-8 | medium | Account deletion showed no progress and could be started twice | fixed `5077234` |
| AUTH-9 | medium | Declining notifications threw the user into iOS Settings | fixed `d089abc` |
| AUTH-10 | low | The push toggle was a dead control on web | fixed `d089abc` |
| AUTH-11 | low | The consent screen was a dead end | fixed `1087af0` |
| AUTH-12 | low | The device's push token stayed live if unregistering failed | fixed `4a3ae74` |
| AUTH-13 | low | RevenueCat logOut never ran on sign-out | fixed `4a3ae74` |
| AUTH-14 | low | Cancelling sign-in was treated as a failure | fixed `1087af0` |
| AUTH-15 | low | Raw or developer error text shown to users | fixed `1087af0`, `d089abc`, `bdc219f`, `8c4736b`, `98c3eab` |
| AUTH-16 | low | iOS export files were left in the app's Documents | fixed `cd40141` |
| AUTH-17 | low | Export ignored the private-collection PIN | fixed `cd40141` |
| AUTH-18 | low | The paywall showed hardcoded US prices when store prices failed to load | fixed `8c4736b` |
| AUTH-19 | low | Browser chrome color was always dark | fixed `45669a6` |
| AUTH-20 | low | Web sign-out left the browser extension connected | fixed `592885d` |

## Web: Ask, collections, graph, Revisit (REC)

| ID | Sev | Finding | Status |
|---|---|---|---|
| REC-1 | high | Free-plan users never saw the locked weekly synthesis | fixed `179f064` |
| REC-2 | high (privacy) | A shared answer couldn't be unpublished once its sources went private or were deleted | fixed `86093a4` |
| REC-3 | medium (privacy) | Deleting a chat orphaned its public answer pages | fixed `0105acd` |
| REC-4 | medium | Manage cards couldn't untick old members | fixed `445ea87` |
| REC-5 | medium | The graph rebuilt and re-laid itself out on every library snapshot | fixed `1b82c20` |
| REC-6 | medium | The graph redrew every frame, forever | fixed `1b82c20` |
| REC-7 | medium | Native Ask gave up at 30 s while the server could still answer | fixed `0964852` |
| REC-8 | medium | Long chats lagged while typing and streaming | fixed `37ddb5e` |
| REC-9 | medium (security) | Ask answers could load images from any site | fixed `37ddb5e` |
| REC-10 | medium-low | Stop never cancelled the Ask request | fixed `3cb6beb`, `0964852` |
| REC-11 | medium-low | Pressing Enter mid-stream cut the answer off | fixed `0964852` |
| REC-12 | medium-low | The collection Share sheet published from an incomplete member list | fixed `bcc9265`, `30472d5` |
| REC-13 | medium-low | Asks handed over from another screen were not saved straight away | fixed `2821b73` |
| REC-14 | medium-low | Ask about a private collection always said nothing was found | fixed `4d10122` (no Ask on a private collection) |
| REC-15 | medium-low | Making a card private left its own `/s` page live | fixed `f453095` (add-to-private-collection path); the Private toggle path: see ACCT-5 |
| REC-16 | low-medium | The web Ask meter went stale | fixed `0964852` |
| REC-17 | low-medium | Revisit could show cards made private after a digest was written | fixed `e3b29e9` |
| REC-18 | low | The synthesis week label was a day off west of UTC | fixed `25144ad` |
| REC-19 | low | An interrupted swipe could act on the next tap | fixed `701df80` |
| REC-20 | low | Two copy buttons skipped the clipboard fallback | fixed `4df9db2`, `86093a4` |
| REC-21 | low | Stopping an answer share overclaimed | fixed `86093a4` |
| REC-22 | low | Tag rename/delete could leave stragglers outside the loaded window | fixed `279d5c3` |
| REC-23 | low | Two graph robustness gaps (bad fields could throw) | fixed `acffaa3`, `1b82c20` |
| REC-24 | low | Raw or technical error text in Ask | fixed `bdc219f` |
| REC-25 | low | The "Saved" state outlived a deleted answer card | fixed `4df9db2` |

## iOS, App Store and release (IOS)

| ID | Sev | Finding | Status |
|---|---|---|---|
| IOS-1 | high | App Review notes said "No purchases" while the build sells Machina Pro | fixed `46c8b51` |
| IOS-2 | medium | The three privacy declarations contradicted each other; the published label is out of date | fixed in repo `46c8b51`; **owner**: update the App Privacy answers in App Store Connect |
| IOS-3 | medium | The Facebook iOS SDK shipped in every build though only Apple and Google sign-in are used | fixed `aa84a85` (stripped at build time, script unit-tested); **owner**: first TestFlight build confirms it links |
| IOS-4 | medium | Selecting 6+ screenshots hid "Save to Machina" from the share sheet | fixed `f38601e` |
| IOS-5 | medium | Native dependencies were not pinned | partial `5ead6a2` (CI records resolved versions); **owner**: commit the full `Package.resolved` from a Mac, then add `-onlyUsePackageVersionsFromResolvedFile` |
| IOS-6 | medium | The local iOS build script built with the sign-in gate off | fixed `cb8fdfa` |
| IOS-7 | medium | While attachments loaded, the share sheet showed a dimmed screen with no way out | fixed `4e948d3` |
| IOS-8 | low | Privacy manifests' required-reason declarations were incomplete | fixed `46c8b51` |
| IOS-9 | low | The Mac App Store Safari bundle kept local-development origins | fixed `cb8fdfa` |
| IOS-10 | low | "Saved the first of N links" was never shown | fixed `f38601e` |
| IOS-11 | low | After reinstall, sharing before opening the app posted into the previous account | fixed `f38601e` |
| IOS-12 | low | Share sheet accessibility: 3.3:1 hint text, 30pt close, no VoiceOver result, sweep ignores Reduce Motion, fixed font sizes | fixed `f38601e`, `a5c02ae`; Dynamic Type open (layout needs a device) |
| IOS-13 | low | `sessionSendsLaunchEvents = true` with nothing handling background-session events | fixed `f38601e` |
| IOS-14 | low | `MARKETING_VERSION` hard-coded; the first update after 1.0 would be rejected at upload | fixed `cc388f5` |
| IOS-15 | low | Launch image set held six identical 8.6 MB PNGs | fixed `09739ed` (about 9 MB per install) |
| IOS-16 | low | App Check started reCAPTCHA inside the iOS web view | fixed `f291bcb` |
| IOS-17 | low | Gaps in reading shared items (large photos, text in other shapes) | fixed `8981719` |
| IOS-18 | low | The extension's server field accepted any host | fixed `67401de` |
| IOS-19 | low | Capacitor 8.4 has no UIScene support; required for apps built with the SDK after iOS 26 | **owner**: upgrade Capacitor when it ships scene support, before moving to Xcode 27 |
| IOS-20 | low | The `remote-notification` background mode is unused | accepted: harmless (pushes are alert-only), and App Review does not flag it; removing it buys nothing for a native-config change |
| IOS-21 | low | Out-of-date docs (share token storage, CI trigger, a removed link) | fixed `cc388f5` |

## Accessibility, touch, type, motion, design system, copy, RTL, locale

| ID | Sev | Finding | Status |
|---|---|---|---|
| A11Y-1 | high | `--text-muted` was 2.3-3.6:1 in both themes (452 uses) | fixed `a712d39` (4.6-5.5:1) |
| A11Y-2 | high | Category chip text 1.7-3.8:1 in light mode (slate and indigo fail in dark) | fixed `6a32412` (rendered 5.0-8.9:1) |
| A11Y-3 | high | Ask was silent to VoiceOver: no live region for status or answers | fixed `21aa838` |
| A11Y-4 | high (desktop) | Cards were clickable `<article>`s with no keyboard or button semantics | fixed `5621400` |
| A11Y-5 | medium | The hover action pill was unreachable on touch and by keyboard | fixed `5621400` |
| A11Y-6 | medium | Sheets had no dialog semantics, Escape or focus handling | fixed `ba42d2d`, `c07aaad` |
| A11Y-7 | medium | Removing a tag was a bare 12px icon at 40% opacity | fixed `fd8b010` |
| A11Y-8 | medium | Red/amber/green/yellow failed contrast in light mode | fixed `5c5c0d6`, `dfb26e3` |
| A11Y-9 | medium | A wrong PIN cleared the field with no announced error | fixed `fd8b010` |
| A11Y-10 | medium | Selected states were color-only (segmented controls, capture tabs) | fixed `97df371`, `5621400` |
| A11Y-11 | medium | Digest time wheels had no role, label or keyboard | fixed `fd8b010` |
| A11Y-12 | medium | Toasts left too fast to reach Undo (WCAG 2.2.1) | fixed `4abdaa8` |
| A11Y-13 | medium | Related cards and the reminder chip were clickable divs | fixed `fd8b010` |
| A11Y-14 | medium | Keyboard: nested controls inside `role="button"`; the tour advanced on its own buttons | fixed `36b6c81`, `97df371` |
| A11Y-15 | low-med | Unlabeled fields | fixed `36b6c81`, `c07aaad`, `98c3eab` |
| A11Y-16 | low | Naming nits ("Machina Machina", "Back") | fixed `97df371` |
| T-1 | high | Card controls under 44pt | fixed `5621400` |
| T-2 | high | IconButton drew 32/36px targets | fixed `97df371` |
| T-3 | medium | Close buttons at 28-32px | fixed `ba42d2d`, `bab74b1` |
| T-4 | medium | Small controls in the feed and Ask | fixed `6f0b4e1`, `21aa838` |
| T-5 | medium | Hover-only edit pencils were invisible on touch (and the note's delete was an invisible target) | fixed `bab74b1` |
| T-6 | low | 40px near-misses (card detail toolbar, header glyphs, tab-bar add) | fixed `bab74b1` (44pt on touch; desktop unchanged) |
| DT-1 | medium | Card summaries ignored iOS Text Size | fixed `fd8b010` |
| DT-2 | low | 9px labels | fixed `bab74b1` (10px; onboarding and landing mocks stay 9px as scaled illustrations) |
| RM-1 | medium-low | The review deck flew cards off-screen with a spin under Reduce Motion | fixed `fd8b010` |
| RM-2 | low | Programmatic smooth scrolling ignored Reduce Motion | fixed `9e41336` |
| DS-1 | high | `text-white` on the porcelain accent gradient in dark mode (invisible labels) | fixed `a712d39` |
| DS-2 | high | A red debug border under every detail heading | fixed `a712d39` |
| DS-3 | medium | Dead `animate-in` classes: menus and sheets didn't animate | fixed `fb7fa05`, `ba42d2d` |
| DS-4 | medium | No semantic color tokens | fixed `5c5c0d6`, `dfb26e3`, `e04323b` (`--danger`, `--warning`, `--success`, `--star`, `--info`) |
| DS-5 | medium | The Apple button was black on the near-black dark theme | fixed `8785287` |
| DS-6 | low | One-offs: a hand-drawn switch, raw blue | fixed `e04323b` |
| C-1 | medium | Raw technical errors shown to users | fixed `6c0db61`, `98c3eab` |
| C-2 | medium | "AI" and "brain" on user-visible surfaces | fixed `48aec10` |
| C-3 | low-med | The Revisit tab went by four names | fixed `48aec10` |
| C-4 | low | Typos and Title Case in a sentence-case UI | fixed `782988d` |
| C-5 | low (tooling) | The em-dash gate took `image/*` for a comment and skipped real code | fixed `6e47f92` |
| R-1 | low-med | `<html lang="en">` everywhere: VoiceOver read Hebrew with the English voice | fixed `b6dbaf3` |
| R-2 | low | Physical spacing and alignment in places a Hebrew card mirrors | fixed `98c3eab`, `5621400` |
| L-1 | low-med | Digest time always 12-hour | fixed `5d2109a` |
| L-2 | low | Four relative-time functions with different rules | fixed `52b24c6` |

## Backend: account, billing, notifications, sharing (ACCT)

| ID | Sev | Finding | Status |
|---|---|---|---|
| ACCT-1 | high | Any one user could stop reminders for every user: a card with `title: null` (or `reminders_channel: [{}]`) raised outside any try, and the shared, oldest-first due query kept it at the head | fixed `ae23ee0`, `fb8319d` (each user isolated; fields coerced; schedule computed before the push) |
| ACCT-2 | medium | A client-created workspace could claim a deleted account's trial clock (a founder's free year) and learn when that account was created | fixed `ba3f1cc`, `ff04e7a` (server keys on the verified Auth email; create rule requires Google/Apple and the token's own email) |
| ACCT-3 | medium | After account deletion, its circulated share links could be re-claimed by another account (phishing under mymachina.app) | fixed `2c2021e` (ownerless tombstone instead of deleting the owner row) |
| ACCT-4 | medium | Account deletion could leave images in Storage, report success, and a retry could never fix it | fixed `44ce394` (Storage swept first; failures keep the account for a retry; parallel deletes) |
| ACCT-5 | medium | Making a card private didn't take down its public pages | fixed `4744c35`, `7df9e6c`; collection and answer snapshots carry no card ids, so a card made private stays on a public collection page until it is updated (the toast says so) |
| ACCT-6 | low | A failed deletion left `deleting: True` set for good, disabling card cleanup | fixed `2c2021e` (`deletingAt`, trusted for 10 minutes; cleared on failure) |
| ACCT-7 | low | Storage keys could be minted twice by concurrent workers, leaving images outside every cleanup | fixed `2861544` (transactional mint) |
| ACCT-8 | low | Deletion left data behind: RevenueCat customer, other linked logins, rate-limit rows (ids name a phone number or IP), task_logs rows without a uid, and the email hash undisclosed | fixed `44ce394` (RevenueCat best-effort, linked logins, `expireAt` on rate-limit rows), `5a3cecf` (policy names the email hash and counters); rate-limit pruning and task_logs uid: see below |
| ACCT-9 | low | Masked phone uids in logs could be reversed by brute force | fixed `44ce394` (keyed HMAC); per-doc error logs carry the exception type only (`ae23ee0`) |
| ACCT-10 | low | Account deletion doesn't require a recent sign-in | accepted for launch: Apple accounts already re-authenticate (token revocation); adding a Google re-sign-in step on iOS can't be device-tested here, and a broken deletion is an App Store rejection. Post-launch, with a device |
| ACCT-11 | low | The RevenueCat webhook ignored events that change access (extended, refund reversed, temporary grant) | fixed `29f5e00` |
| ACCT-12 | low | The trial-start write could overwrite a just-synced subscription | fixed `d8f03af` |
| ACCT-13 | low | Trial-ending pushes could arrive at night | fixed `4d67339` (hourly, 09:00-20:59 local, claimed once) |
| ACCT-14 | low | A non-ASCII token header crashed the admin and webhook checks (500, confirming the endpoints) | fixed `44ce394` (admin), `3092cc5` (webhook) |
| ACCT-15 | low | Found while fixing ACCT-12: `sync_from_revenuecat` writes the trial fields from a non-transactional read, so a trial clock started in the same instant is wiped | accepted: it matters only if that subscription later lapses, and the worst case is a second 14-day trial |

## Backend: AI, Ask, search, digests (AI) and the review of its fixes (RV)

The AI fixes were made on a separate branch, reviewed by a second agent
(which found RV-1..RV-11 in them), fixed again, re-reviewed, and merged in
`d387b59`.

| ID | Sev | Finding | Status |
|---|---|---|---|
| AI-1 | high | A saved page's prompt injection could leak other cards to a third party with zero clicks, through Markdown images in Ask answers | fixed `37ddb5e` (client renders no images or non-http links), `a063f0f` (server strips them) |
| AI-2 | high at scale | `send_digests` dropped users silently once a tick ran past 60 s | fixed `e5efbdd`, `8129498`, `0c9675f` |
| AI-3 | medium | Ask's time budgets didn't line up: users saw the wrong error and lost an ask | fixed `1d1a2c1`, `0964852`, `8c0a098` |
| AI-4 | medium | "thanks" re-sent the previous answer and charged an ask | fixed `9459551`, `3be3059` |
| AI-5 | medium | An honest "your saves don't cover that" got a caution banner, a second Gemini call, and a charge | fixed `ae79b75`, `d7ba245` |
| AI-6 | medium | An embedding outage told the user their library was empty | fixed `3e19c43` |
| AI-7 | medium | One transient embedding failure deleted a card's valid vector, and nothing repaired it | fixed `4351e9a`, `5123455` |
| AI-8 | medium | Streamed answers could end early with no signal | fixed `1967209` |
| AI-9 | medium | Hebrew "this week" and "what else besides" questions weren't recognized | fixed `019e17c`, `51eefd5` |
| AI-10 | medium | Ask only saw the first 1,500 characters of notes and shared text | fixed `5dd5f58` |
| AI-11 | medium (latent) | The graph migration could never finish for libraries over ~343 cards | fixed `61bb158`, `7bbdad7` |
| AI-12 | low-medium | No output-token cap on generation calls; synthesis input uncapped | fixed `196504d` |
| AI-13 | low-medium (cost) | The truncation check misfired on non-Latin endings and recipe steps, tripling analysis calls | fixed `d23bffd`, `e201c6c` |
| AI-14 | low-medium | Ask ran a full-document library scan per keyword step, with no cap on quoted anchors | fixed `bb9f889` |
| AI-15 | low | One malformed card broke keyword search for every query | fixed `74c634c` |
| AI-16 | low | Long web chats eventually failed with "Body too large" | fixed `0964852` (history capped) |
| AI-17 | low | Stop didn't cancel the request | fixed `3cb6beb` |
| AI-18 | low | The unused but deployed `search_links` callable skipped the HTTP twin's guards | fixed `efa5b81` |
| AI-19 | low | The private-collection lookup failed open | fixed `0178e8d` |
| AUTH-2 | high | Search sent private cards to the Gemini relevance judge | fixed `0a8920d` |
| GRAPH-PRIV | medium | "See also" sent private candidates to the Gemini verifier | fixed `812e6ee` |
| RV-1 | high | A "thanks" turn became the subject of the next follow-up (regression from AI-4) | fixed `3be3059` |
| RV-2 | medium-high | The 20 s per-call timeout cut long answers (every long iOS answer) | fixed `8c0a098` (buffered calls get the budget; streams send their own server timeout) |
| RV-3 | medium | "No answer" and cut-off refunds could be triggered on purpose (unmetered model calls) | fixed `d7ba245` (refund only short no-answers and early cut-offs) |
| RV-4 | medium | AI-13 brought back the cut-off Hebrew card it was meant to keep fixed | fixed `e201c6c` |
| RV-5 | medium | The AI-7 repair sweep had no index and could stall on the same 50 cards | fixed `5123455` (index; paged with a saved cursor) |
| RV-6 | medium | Hebrew recency/exclusion detection fired on ordinary questions ("the first week with a newborn") | fixed `51eefd5` |
| RV-7 | low-medium | Digest catch-up could push at night, starve tail users, and retry a failing synthesis every 30 minutes | fixed `0c9675f` (late or night deliveries in-app only; rotating walk; 3 tries) |
| RV-8 | low | "ok" and "great", sent to accept an offer, got "You're welcome." | fixed `200cfd1` |
| RV-9 | low | The branch conflicted with this one in two import blocks | resolved in the merge `d387b59` |
| RV-10 | low | Backfill and trigger embedded long cards with different input caps | fixed `b1d1a37` |
| RV-11 | low | A resumed graph migration restarted its phase if the checkpoint card was deleted | fixed `7bbdad7` |
| PRIV-1 | medium (privacy) | Found while checking WEB-21: the app's prompt vocabulary (read from its newest cards including private ones) went into the Gemini prompt unfiltered on /api/analyze and /api/analyze-image | fixed `e2c7c44` (server builds it, private cards left out) |

## Backend: capture pipeline (CAP)

| ID | Sev | Finding | Status |
|---|---|---|---|
| CAP-1 | high | The janitor deleted queue jobs that were still running (aged from queueing, not from start): the card failed and Retry charged again | CAPFIX-1 |
| CAP-2 | high | Retry and the web Image tab charged up front and kept the unit when the app gave up at 60 s (videos, PDFs, slow pages) | CAPFIX-2 |
| CAP-3 | medium | The worker wasn't idempotent: a redelivered job made a second card, a late job overwrote a good Retry, a redelivered enrich refunded twice | CAPFIX-3 |
| CAP-4 | medium | Large pages ran the scraper out of memory (~80 MB per MB of dense HTML parsed), and a killed instance skips the refund | fixed `9017d1c` (2 MB parse cap, cut on a UTF-8 boundary) |
| CAP-5 | medium | `set_global_options` gives every function gen-1 CPU shares and concurrency 1 | accepted for launch: a cost decision, and concurrency above 1 needs a thread-safety pass first (FINAL-REPORT §4) |
| CAP-6 | medium | Backlog releases and imports share the 10 worker slots with live saves | CAPFIX-6 |
| CAP-7 | medium | An exception after the card was written turned a finished capture into FAILED, with no refund | CAPFIX-7 |
| CAP-8 | medium | Shared screenshots were stored twice; deleting the card left the original | CAPFIX-8 |
| CAP-9 | medium | LinkedIn login walls, 999 and 404 pages became "ready" cards built from raw markup | fixed `924ae91` |
| CAP-10 | medium | Saved X and Instagram URLs, with the sharer's tracking tokens, went to unaffiliated relays whose images were trusted; the privacy policy didn't name them | fixed `a0e6e66` (path only, no relay images, policy names them) |
| CAP-11 | medium | Every capture read the user's entire library for the prompt's vocabulary | fixed `ae5909c` (newest 500, projected) |
| CAP-12 | medium | The SSRF guard refused every international domain name | fixed `066d4b6` |
| CAP-13 | low | Healthy queued cards could fill the janitor's 200-card window and hide a stuck one | CAPFIX-13 |
| CAP-14 | low | "Add screenshots" never timed out and had no at-most-once refund | CAPFIX-14 |
| CAP-15 | low | Retry on a trial burned the 3-per-hour video budget on links that aren't videos | CAPFIX-15 |
| CAP-16 | low | The text shared with an Instagram or Facebook link never reached the model | fixed `a0e6e66` |
| CAP-17 | low | URL extraction kept CJK and Hebrew punctuation; CJK read time was always 1 minute | read time fixed `c0c9012`; URL extraction CAPFIX-17 |
| CAP-18 | low | A link without `https://` in the share `url` field was rejected | CAPFIX-18 |
| CAP-19 | low | The screenshot-enrich path stored model output without the usual length caps | CAPFIX-19 |
| CAP-20 | low | Page titles and share URLs had no size limit (a huge title broke the card) | titles fixed `c0c9012`; share URL length CAPFIX-20 |
| CAP-21 | low | Shared text over 30,000 characters was silently cut | CAPFIX-21 |
| CAP-22 | low (plausible) | A Gemini RECITATION block made a capture permanently unsaveable | fixed `dc8019f` (one retry in the model's own words; not testable against live Gemini here) |

<!-- BACKEND -->
