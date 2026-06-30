# Machina AI (Second Brain) — iOS App QA + UX Audit

**Scope:** Code-grounded UX/QA audit of the exact code paths that render in the Capacitor WKWebView (`web/`) plus the native Share Extension (`web/ios/App/ShareExt/`) and the Cloud-Function-served share pages (`functions/main.py`). Every finding cites `file:line`. No device-control channel was available, so this is a deep code+heuristic pass framed as "what a user tapping the app hits."

**Caveat on the 4 known issues:** items #2 (Collections header), #3 (raw markdown on shared page), #4 (image-share plain HUD) and the button-unification are already being fixed by other agents. Verified status below:
- **#3 raw markdown on shared page — already FIXED in the working tree** (not yet deployed). `share_page` renders markdown via `_md_to_html` (`functions/main.py:1056`) for both `summary` and `detailedSummary` (`:1267`,`:1253`). The raw `**`/`##` the user saw is the *old deployed* version. Fix needs `firebase deploy --only functions:share_page`.
- **#4 image-share plain HUD — already FIXED in the working tree.** The extension now has a real sweep animation, image preview, and rising percentage (`ShareViewController.swift:240-284`,`:303`). Old build shipped the plain spinner.
- **#2 Collections header inconsistency — confirmed, being addressed** (details in F-13).

---

## TOP 10 THINGS TO FIX NEXT (prioritized)

1. **[Critical] Share Extension watchdog can show a false "Saved to Machina ✓".** `ShareViewController.swift:524-525` fires an unconditional success at 26s; `showResult` (`:345`) has no idempotency guard, and the request timeout is 25s — so a real network error and the watchdog's "Saved" both run. → Guard `showResult`; make the watchdog message neutral; widen the gap.
2. **[High] Deep-link modal re-opens itself forever.** `Feed.tsx:217-228` opens `?linkId=` but never clears the param; the effect depends on `links`, which Firestore mutates constantly — so closing the modal and any background update re-opens it. → `router.replace` to strip the param after first open.
3. **[High] "Install Machina / Add to Home Screen" banner shows *inside* the native app.** `InstallPWA.tsx:24` gates on `isIOS && isSafari && !isStandalone`; Capacitor's WKWebView matches Safari UA and is not `display-mode: standalone`, so the banner triggers in the installed app. → Add a `window.Capacitor?.isNativePlatform()` guard.
4. **[High] Compact view's touch action sheet is missing Share + Add-to-collection.** `CompactCard.tsx:219-226` builds `CardActionSheet` without `onShare`/`onAddToCollection`; the sheet gates those rows on prop presence (`CardActionSheet.tsx:106`,`:113`). Phone users in Compact can't share or collect a card. → Thread the props through.
5. **[High] Global `useEdgeSwipeBack` collides with in-overlay gestures.** It's a `document`-level listener (`useEedgeSwipeBack.ts:46`) that fires on any left-edge → rightward drag. In `LinkDetailModal` it can close the modal when the user is scrolling the horizontal action toolbar (`LinkDetailModal.tsx:179` + `:100`); a right-origin favorite-swipe in SwipeDeck is also at risk. → Bail when `e.target` is inside a `touch-action:none` or `overflow-x:auto` ancestor.
6. **[High] Bottom-anchored sheets don't track the keyboard; autofocused inputs get covered.** `AddToCollectionSheet.tsx:106` (new-collection input, autofocus, bottom of sheet) and partially `ManageCollectionCardsSheet` never use `useVisualViewport`. iOS keyboard hides the field; user types blind. → Apply the visual-viewport treatment `CollectionFormModal` already uses.
7. **[High] In-app capture promises "we'll keep analyzing in the background" but it's just an in-memory fetch.** All three scan views say this (`ImageScanProgress.tsx:83`, `LinkScanProgress.tsx:118`, `VideoScanProgress.tsx:90`), but analysis+save are one client-side promise (`AddLinkForm.tsx:164-252`). Backgrounding the app (WKWebView suspends) kills it and nothing saves. → Soften the copy or move to a server-side job.
8. **[Medium] Light-theme users get a guaranteed dark flash (FOUC) every launch.** `ThemeProvider.tsx:16` inits to `'dark'` and reads localStorage in a `useEffect` + `setTimeout(…,0)`. → Add a render-blocking inline head script to set the `light` class before first paint.
9. **[Medium] Image compression fallback ships raw HEIC bytes inline, guaranteeing the failure it's meant to prevent.** `image.ts:108-114` falls back to un-resized original base64 → multi-MB JSON to `/api/analyze-image`, exceeding limits / timing out at 60s after the bar hit 45%. → Reject oversized fallback with a clear message.
10. **[Medium] Toast and modal/dialog share `z-[100]`; a toast can render behind an open sheet.** `Toast.tsx:49` == `ConfirmDialog.tsx:49` == `CollectionFormModal.tsx:106`. → Put toasts at a strictly higher layer (e.g. `z-[200]`).

---

## APP SHELL & NAVIGATION

### F-1 [High] Deep-linked card modal re-opens itself indefinitely
- **Flow:** open app from a shared/deep link (`?linkId=`)
- **User experience:** The card opens, the user closes it, and moments later it pops open again — and keeps doing so after any background change to the library.
- **Root cause:** `Feed.tsx:217-228` reads `searchParams.get('linkId')` and sets `activeLinkId`, with the effect keyed on `[searchParams, links]`. The param is never cleared (the code comment admits "Clear the param after opening" but doesn't). Firestore `onSnapshot` (`:175`) updates `links` on every mutation (favorite, read, scan completes), re-running the effect and re-opening the modal.
- **Fix:** After opening, `router.replace` to drop `linkId`, or track a `consumedDeepLink` ref.

### F-2 [Low] Brand header clears the notch, but verify on rotation
- **Note / correction:** The top header (`page.tsx:44`, `sticky top-0`, no inline safe-area) is fine because `body` gets `padding-top: env(safe-area-inset-top)` **unconditionally** (`globals.css:326-335`, inside `@supports(padding:max(0px))`). The sticky header therefore sits below the notch. (An earlier hypothesis that only the `@media standalone` rule applies is wrong — the unconditional rule covers Capacitor.) Worth a visual check in landscape that left/right insets behave, but no code change needed.

### F-3 [Medium] Mobile Filters & Categories sheets lack bottom safe-area padding
- **Flow:** Library → Filters / Categories bottom sheet (phone)
- **User experience:** The "Done" button and last row sit close to / under the home indicator.
- **Root cause:** Both sheets use `pb-8` but **no `safe-pb`/`env(safe-area-inset-bottom)`** (`Feed.tsx:1175`, `:1310`). The Tag Explorer drawer right next to them *does* use `safe-pt`/`safe-pb` (`:1387`,`:1399`) — inconsistent.
- **Fix:** Add `safe-pb` to both sheet panels.

---

## CAPTURE FLOWS (Add link / scan / Share Extension)

### F-4 [Critical] Share Extension watchdog can declare a false success
- **Flow:** Native Share Extension, any content
- **User experience:** On a slow/cold-start upload, a 26s watchdog says "Saved to Machina ✓" even if the real request errored or 401'd; the label/scan flickers between error and success.
- **Root cause:** `ShareViewController.swift:524-525` watchdog hardcodes `success: true`; `showResult` (`:345`) is **not** guarded (only `finish()` checks `finished` at `:377`); request `timeoutInterval = 25` (`:520`) is 1s under the watchdog, so a real timeout error (`:531`) and the watchdog both fire.
- **Fix:** Add a `resultShown` guard atop `showResult`; make the watchdog message neutral ("Still saving — check Machina"); set the watchdog to ≥28s.

### F-5 [High] Share Extension has no escape hatch on a stalled upload
- **Root cause:** The full-screen dim + card (`ShareViewController.swift:36-69`) has no tap-to-cancel and no Cancel button; the user is stuck up to 26s. → Add a background-tap → `extensionContext?.cancelRequest`.

### F-6 [High] Image upload is fire-and-forget; backend analysis failures are invisible
- **Root cause:** The extension treats HTTP 2xx as final success (`:534-536`), but Gemini OCR runs async server-side. A later analysis failure means the item silently never appears, with a "Saved ✓" already shown. → Surface a processing state in the feed or a failure push.

### F-7 [High] In-app capture: offline shows a raw error AND double-notifies
- **Root cause:** On network failure, `AddLinkForm.tsx:185`/`:212` wrap the raw `TypeError: Load failed` as the message, then it's shown both inline (`:427`) and as a toast (`:256`). No `navigator.onLine` check. → One surface; friendly offline copy.

### F-8 [High] "Background analysis" copy is untrue (see Top-10 #7).

### F-9 [Medium] HEIC/large-image compression fallback sends raw bytes (see Top-10 #9). `image.ts:108-114`.

### F-10 [Medium] Progress bar pins at 99% on slow backends, reads "Analyzing… 99%" for many seconds, then can error. `AddLinkForm.tsx:117-122`,`:448`. → Add a "taking longer than usual" phase past ~95%.

### F-11 [Medium] Stale ingest token never refreshes within a session
- **Root cause:** `shareConfig.ts:19` caches `lastSyncedUid` and short-circuits; if the backend rotates the token, shares return 401 → "Auth failed — reopen Machina" but reopening doesn't reload the JS. Also a misconfigured App Group is swallowed (`shareConfig.ts:46-48`) and surfaces as the misleading "Open Machina and sign in first" (`ShareViewController.swift:182`). → Re-sync on auth failure; distinguish "no token yet" from "auth failed."

### F-12 [Low] Polish: "Change Image" affordance is hover-only (`AddLinkForm.tsx:398`); video/image scan thumbnails lack `onError` fallback that the link favicon has (`VideoScanProgress.tsx:37`, `ImageScanProgress.tsx:37` vs `LinkScanProgress.tsx:56`); centered Add sheet has no `max-height`/scroll so it can clip on iPhone SE with keyboard up (`AddLinkForm.tsx:288`).

---

## COLLECTIONS & SETTINGS

### F-13 [Medium] Collections header inconsistent vs Ask (known #2 — being addressed)
- **Root cause:** The shared header slot applies different `space-y`/padding per mode (`Feed.tsx:634`,`:636`) and the Collections header is a taller row (Back + h2 title + Layers + 36px Plus, `:651-675`) vs Ask's bare Back button (`:640-650`), so the content baseline shifts when switching tabs. → Give both a fixed-height header shell.

### F-14 [High] InstallPWA banner shows in the native app + no bottom safe-area (see Top-10 #3). `InstallPWA.tsx:24`,`:40`.

### F-15 [High] Bottom-anchored sheets don't track the keyboard (see Top-10 #6). `AddToCollectionSheet.tsx:106`; `CollectionFormModal` tracks it but can still clip its footer while typing because header/footer aren't pinned (`CollectionFormModal.tsx:107`,`:115`,autofocus `:141`).

### F-16 [Medium] Un-counted body-scroll locks unlock early when overlays nest
- **Root cause:** `CollectionFormModal`, `ManageCollectionCardsSheet`, `AddToCollectionSheet`, `ConfirmDialog` each independently set/reset `document.body.style.overflow` (e.g. `ConfirmDialog.tsx:38-42`). Not ref-counted: open A → open+close B → body unlocked while A is still up. → Centralize with a counter.

### F-17 [Medium] Z-index: toast == modals at `z-[100]` (see Top-10 #10).

### F-18 [Medium] CollectionsGallery menu: scroll-to-close + sub-44px trigger
- **Root cause:** The "⋯" trigger is `p-1.5` around a 16px icon (~28px) (`CollectionsGallery.tsx:100`) overlapping the tile's tap-to-open; the portal menu closes on **any** scroll (`:166`), so a tiny finger drag dismisses it before the tap lands. → Enlarge to ≥44px; rely on the existing backdrop instead of scroll-close on coarse pointers.

### F-19 [Medium] SettingsModal silently discards unsaved edits on any close path (edge-swipe `:86`, Cancel `:572`, backdrop `:248`, X). Only theme applies instantly. → Confirm-on-dirty or auto-save.

### F-20 [Medium] ReminderModal custom picker allows past times and has a Date-overflow bug
- **Root cause:** No `> Date.now()` validation (`ReminderModal.tsx:88-97`); the month/day/year selects mutate a shared `Date` via `setMonth`/`setDate`/`setFullYear` (`:329`,`:343`,`:357`) so day 31 → February rolls into March. → Validate future-time; clamp day to month length, or use native `<input type="date">`.

### F-21 [Medium] Optimistic collection writes give no offline signal; success toast fires before server ack (`AddToCollectionSheet.tsx:81`; writes in `collections.ts:87-96`). Firestore offline queues silently without throwing.

### F-22 [Low] `deleteCollection` batch is unbounded (>500 ops throws) `collections.ts:74-79`; `ManageCollectionCardsSheet` renders the whole library unvirtualized `:121`; `ConfirmDialog` runs `onConfirm` then closes synchronously with no busy guard → double-tap can fire twice (`ConfirmDialog.tsx:92`).

### F-23 [Polish] Toast ignores left/right safe-area (landscape notch) `Toast.tsx:50`; CollectionFormModal color swatches are 32px (`:188`).

---

## READING / CONSUMPTION

### F-24 [Medium] `SimpleMarkdown` renders unmatched `**` literally; no italic/code/link
- **Flow:** card gist, LinkDetailModal in-app
- **User experience:** A truncated summary with an unclosed `**Key takeaway` shows raw asterisks; `*italic*` never renders. This is the in-app analogue of the shared-page raw-markdown issue.
- **Root cause:** `SimpleMarkdown.tsx:41` only matches paired `/\*\*(.+?)\*\*/g`; no italic/code/link grammar (server's `_md_inline` is richer). → Strip stray markers or broaden the grammar.

### F-25 [Medium] `SimpleMarkdown` compact sentence-splitter mangles Hebrew & abbreviations
- **Root cause:** Compact mode splits on `". "` (`:102-110`) regardless of `isRtl`, breaking "e.g.", "v1.2", URLs, and Hebrew into choppy one-line `<p>`s. → Skip the splitter for RTL / rely on model line breaks.

### F-26 [Medium] RTL detection disagrees across the three card surfaces
- **Root cause:** `CompactCard.tsx:54` uses only `link.language === 'he'`; `SwipeDeck.tsx:257` and `Card.tsx:66` add `hasHebrew(...)`; `LinkDetailModal.tsx:122` is broadest. The *same* Hebrew card can be LTR in compact, RTL in deck/modal. → Route all through one `getDirection` helper (`rtl.ts:14`).

### F-27 [High] Compact action sheet lacks Share + Add-to-collection (see Top-10 #4). `CompactCard.tsx:219`.

### F-28 [High] `useEdgeSwipeBack` collides with modal toolbar scroll / deck swipe (see Top-10 #5). `LinkDetailModal.tsx:179`+`:100`; SwipeDeck pointer vs hook touch both fire.

### F-29 [Medium] SwipeDeck "Undo" doesn't cancel a reminder
- **Root cause:** Swipe-up sets a reminder, but `undo()` only calls `onResetStatus` for left/right (`SwipeDeck.tsx:113-114`); there's no `onCancelReminder` prop. The card returns but the reminder persists — the user thinks it was undone. Also only the single last action is recoverable. → Add reminder-cancel, or disable Undo after an up-swipe.

### F-30 [Medium] LinkDetailModal inline category/tag editing not keyboard-aware
- **Root cause:** `fixed inset-0` with internal scroll (`LinkDetailModal.tsx:163`) but no `useVisualViewport`; a focused `CategoryInput`/`TagInput` near the bottom hides behind the keyboard. → Constrain to `vp.height` or `scrollIntoView`.

### F-31 [Medium] Reader "Listen" (Web Speech) is unreliable in WKWebView with no fallback
- **Root cause:** Button shows on `'speechSynthesis' in window` (`ReadingView.tsx:36`,`:192`) without checking `getVoices()`; iOS often plays nothing or `he-IL` voice is absent; `pause()/resume()` (`:128`) is buggy on iOS. The button flips to "playing" with no audio and no error. → Voice-availability check; prefer cancel+restart; toast if no audio in ~1s.

### F-32 [Medium] SwipeDeck snapshots `links` on mount and never re-syncs (`SwipeDeck.tsx:32`) — new saves/filter changes are ignored unless the parent remounts via `key`. Progress count goes stale (`:157`).

### F-33 [Low/Polish] Reader `Aa` +/- buttons ~32px (<44px) `ReadingView.tsx:182`,`:186`; reading-progress bar at `top-0` renders under the notch (`:160`); image "tap to open original" is hover-only (`LinkDetailModal.tsx:304`); SimpleMarkdown hard-codes a red heading underline that reads like an error and only translates two Hebrew headings (`SimpleMarkdown.tsx:85`,`:79`); SwipeDeck `maxH` uses `window.innerHeight` not visual viewport (`:50`); CardActionSheet rows have no `max-h`/scroll so Delete can fall off-screen on small/landscape (`CardActionSheet.tsx:144`).

---

## ASK MACHINA

### F-34 [Info/Good] Streaming is correctly disabled in the native app
- `AskBrain.tsx:382` (`wantStream = !isNativeApp()`) — SSE is buffered to JSON in WKWebView because it aborts mid-stream. Sound. Keyboard handling drives the surface height directly from `visualViewport` with DOM writes (`:183-211`) and the composer pads `env(safe-area-inset-bottom)` (`:654`). Edge-swipe-back closes the history drawer first, then exits (`:175-178`). This flow is in good shape.

### F-35 [Low] Ask empty state (known screenshot #1) is functional but plain
- `AskBrain.tsx:543-564`: icon + title + category-seeded suggestion chips. No bug; if the screenshot critique is "looks empty/unstyled," consider richer example prompts or a sample answer preview. Suggestions render nothing if the user has zero categories (`suggestions` returns `[]` when `cats` is empty, `:141-142`).

### F-36 [Low] `CopyButton` clipboard can silently no-op in WKWebView under `capacitor://` origin (`AskBrain.tsx:82-88`) — the catch swallows failures, so "Copy" gives no feedback if `navigator.clipboard` is blocked. Minor.

---

## THINGS HANDLED WELL (context)
- `body` safe-area insets applied unconditionally (`globals.css:331`); FAB & Ask composer pad `safe-area-inset-bottom`; `MobileSubheader` correctly insets inside fixed overlays via `content-box` (`MobileSubheader.tsx:47`).
- Card (grid) has a proper touch fallback: `[@media(hover:none)]` `⋯` button → `CardActionSheet` with full actions (`Card.tsx:401`).
- Shared-page markdown rendering is XSS-safe (escape-then-grammar) and complete (`functions/main.py:1056`).
- Reduced-motion is respected (`globals.css:390`); inputs forced to 16px to stop iOS focus-zoom (`:369`).
- Image-share scan animation + native streaming-off are the two best recent hardening moves.
