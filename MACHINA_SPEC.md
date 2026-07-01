# Machina AI — Product Change Spec

> **Purpose:** the execution plan derived from `PRODUCT_REVIEW.md`. This is the
> "what to build next and why" doc. Each change has a stable **feature number
> (M#)** — reference it in branches, commits, and HANDOFF notes so work is easy
> to track across sessions.
>
> **Product name is `Machina AI` everywhere. No more "MyLinks" / "Second Brain" in anything user-facing.**
>
> **Guiding principle from the review:** the distance to "Apple would ship this"
> is *subtraction, trust, and focus — not addition.* Do the phases in order.
> Phase 1 ships **no new features** — it earns trust and a name. Don't jump to
> the exciting Phase 2/3 items until Phase 1 is green.
>
> **Created:** 2026-07-01. Companion docs: `PRODUCT_REVIEW.md` (the why),
> `TASKS.md` (legacy backlog — M8 == T1 auth), `ios-qa-report.md` (F-series bug
> detail these reference).

---

## How to read this

Each feature block has:
- **Goal** — the outcome in one line.
- **Why** — the user/product reason (short; full argument is in `PRODUCT_REVIEW.md`).
- **Changes** — concrete files/areas to touch.
- **Acceptance** — how we know it's done.
- **Effort** — S / M / L rough size.

Priority is encoded by phase. Within a phase, do lower M-numbers first.

### At-a-glance

| Phase | Features | Theme | Ships |
|---|---|---|---|
| **1 — Trust + a name** | M1–M8 | Fix what makes users doubt the app; make it a real product | 7.5 → 8.5 |
| **2 — Reveal the magic** | M9–M16 | Surface what's already built; cut the sprawl | 8.5 → 9 |
| **3 — Differentiators** | M17–M20 | The reasons people talk about it | 9 → "proud to ship" |
| **Polish** | P1–P5 | Cross-cutting craft, do alongside phases | — |

---

# PHASE 1 — Earn trust + a name (no new features)

## M1 — One name: "Machina AI" everywhere
**Goal:** eliminate every "MyLinks" and "Second Brain" string from user-facing surfaces.
**Why:** three names for one app is the #1 "not a real product" tell. Fix identity before anything else.
**Changes:**
- App/PWA metadata: `web/public/manifest.json` (name, short_name, description), `web/capacitor.config.ts` (appName), iOS `web/ios/App/App/Info.plist` (`CFBundleDisplayName`), `web/package.json`.
- **User-facing backend copy (easy to miss):** WhatsApp replies in `functions/whatsapp_handler.py`, digest subject/body in `functions/digest_service.py`, reminder copy in `functions/reminder_service.py`, any branded strings in `functions/main.py` / `functions/ai_service.py`.
- Docs: rewrite `README.md` (see also M-P5), `HANDOFF.md`, `SHORTCUT_SETUP.md`, `web/VERCEL.md` headers.
- Keep the internal repo name/bundle id (`com.morhogeg.machina`) — no need to churn those.
**Acceptance:** `grep -rI -e "Second Brain" -e "MyLinks" web/ functions/ *.md` returns only intentional internal references (repo name, historical changelog). Fresh install shows "Machina AI" on home screen, splash, WhatsApp reply, and digest email.
**Effort:** S

## M2 — The Share Extension must never lie about saving
**Goal:** "Saved ✓" appears **only** after a real server acknowledgement.
**Why:** a save-it app that reports success on a failed save is fatally broken (review's #1 trust issue; QA F-4). Verify **live**, not just in code.
**Changes:**
- `web/ios/App/ShareExt/ShareViewController.swift`: the ~26s watchdog must not resolve to the green-check success state. On timeout show a neutral terminal state ("Still saving — open Machina to confirm") + a Cancel/close affordance (also closes QA F-5, the no-escape-hatch bug).
- Confirm `share_ingest` (`functions/main.py`) returns a real ack the extension waits on; align the client timeout to be shorter than the watchdog so a slow-but-successful save can't race into a false failure either.
**Acceptance:** with the network throttled/killed mid-share, the HUD never shows the green check; it shows the neutral state and can be dismissed. With a real save, the check only appears after the 200/ack. Tested on a physical device.
**Effort:** M

## M3 — No phantom saves (reconcile silent analysis failure)
**Goal:** if a captured item fails async analysis, it either appears as a visible "couldn't analyze — retry" card or is surfaced as a failure — never vanishes.
**Why:** today upload can say "Saved ✓" but if `process_link_background` analysis fails, the card never appears. Losing things silently is the deepest betrayal for a vault (review; QA F-6).
**Changes:**
- Backend: give the pending/processing item a durable status lifecycle (`processing` → `ready` | `failed`) in `functions/main.py` / `process_link_background`; on failure write a `failed` card record with the original URL, not nothing.
- Frontend: `web/components/Feed.tsx` + `Card.tsx` render `processing` (skeleton/spinner card) and `failed` (retry affordance) states.
**Acceptance:** force an analysis error server-side; the item shows as a retryable failed card in the feed within seconds; retry re-runs analysis. Nothing is ever silently dropped.
**Effort:** L

## M4 — Deep-link modal opens once and closes for good
**Goal:** opening a card via `?linkId`/share deep link opens exactly one modal that dismisses normally.
**Why:** the param is never cleared, so Firestore mutations re-trigger the open forever — instant "broken app" signal (QA F-1).
**Changes:**
- Consume the deep-link param on first handle (`history.replaceState` / `router.replace`) and guard with a `consumedDeepLink` ref. Files: `web/components/Feed.tsx` (deep-link effect) + `web/components/LinkDetailModal.tsx`.
**Acceptance:** open a share deep link → modal appears once → close it → it stays closed even as the feed updates. Re-opening requires a new navigation.
**Effort:** S

## M5 — Keyboard never covers an input (visual-viewport everywhere)
**Goal:** every text field inside a fixed overlay stays above the keyboard.
**Why:** data entry must never fight the user; several sheets still get their input hidden (QA F-6/F-15/F-30).
**Changes:** apply the existing `web/lib/useVisualViewport.ts` to every remaining offender: `AddLinkForm.tsx` (centered add sheet), `AddToCollectionSheet.tsx`, `ManageCollectionCardsSheet.tsx`, inline edit in `LinkDetailModal.tsx`. Pin header/footer, clamp body max-height to the visible viewport.
**Acceptance:** on an iPhone SE with the keyboard up, the focused input and its primary action button are both fully visible in every add/edit/collection sheet.
**Effort:** M

## M6 — Honest progress states (kill the fake 99%)
**Goal:** no simulated determinate percentage that stalls at 99% then errors.
**Why:** faking determinate progress is dishonest UX Apple would reject (review; QA F-10). Keep the beautiful scan animation; drop the lying number.
**Changes:** `web/components/LinkScanProgress.tsx`, `ImageScanProgress.tsx`, `VideoScanProgress.tsx` — replace the fake 0→99% bar with an honest indeterminate treatment + phase labels ("Reading the page… Understanding… Almost there"). Keep the scan-sweep. Also soften/verify the "keep app open" copy so it's truthful about duration.
**Acceptance:** progress never displays a numeric % it can't back; a slow analysis reads as calm-working, not stuck-at-99-then-error.
**Effort:** S

## M7 — Settings never silently discards edits
**Goal:** closing Settings with unsaved changes warns or auto-saves.
**Why:** "never lose the user's work" (QA F-19).
**Changes:** `web/components/SettingsModal.tsx` — dirty-tracking; on close-via-swipe/backdrop/X with a dirty form, show a confirm ("Discard changes?") using `ConfirmDialog`, or auto-save. Also add a busy-guard to `ConfirmDialog.tsx` so double-tap can't fire `onConfirm` twice (QA item).
**Acceptance:** edit a setting, try to close → prompted; no edit → closes freely. Double-tapping a confirm runs the action once.
**Effort:** S

## M8 — Real auth + first-run onboarding (the product gate)
**Goal:** real per-user accounts and a one-screen first run.
**Why:** not just security — with a synthetic single user the app *cannot be given to a second person*, so every retention/growth idea below is blocked (review; TASKS.md **T1**). This is the gate.
**Changes:**
- Firebase Auth (Google Sign-In first). Replace the "first user doc" lookup in `web/components/AuthProvider.tsx` with the real `auth.uid`; lock `firestore.rules` and `storage.rules` to `request.auth.uid == uid`; migrate the existing single user doc; map WhatsApp phone→uid in `functions/link_service.py`. Refresh the Share Extension ingest token on login (closes QA F-11).
- Onboarding: one screen after first sign-in that shows how to save from anywhere (the iOS share sheet) + optionally pre-seeds 2–3 example cards so the value is visible before any work.
**Acceptance:** two different Google accounts see fully isolated libraries; rules deny cross-uid reads; a brand-new user lands on a screen that teaches capture, not an empty void.
**Effort:** L

---

# PHASE 2 — Reveal the magic + cut the sprawl

## M9 — "See also": surface the knowledge graph on the detail view
**Goal:** each card shows its 2–3 genuinely-related cards with the one-line *reason*.
**Why:** `functions/graph_service.py` already computes `relatedLinks` (with reasons + common concepts) on every save and **nothing in the UI shows it.** Highest-ROI item in the whole spec — the expensive part is done (review).
**Changes:** `web/components/LinkDetailModal.tsx` — render `link.relatedLinks` as a "See also" section: related card + its `reason` ("both discuss spaced repetition"); tapping opens that card. Data already on the `Link` type (`web/lib/types.ts`). Backfill `relatedLinks` for existing cards if missing.
**Acceptance:** opening a card with neighbors shows a See-also section with human reasons; tapping navigates. Cards with no relations hide the section cleanly.
**Effort:** M

## M10 — Proactive connections on the home feed
**Goal:** the brain speaks first — an occasional feed surface like "3 things you saved connect to *Network Effects*."
**Why:** the 2026 shift from searchable box → thinking partner; leverages the same graph/concepts you already compute (review).
**Changes:** a lightweight feed module (`web/components/Feed.tsx` + a new component) that clusters recent saves by shared `concepts`/`relatedLinks` and shows one connection insight at a time; tap expands the cluster. Reuse existing concept/graph data — no new heavy compute.
**Acceptance:** after saving related items, the feed surfaces a genuine connection card that opens the cluster; it's dismissible and not spammy (rate-limited to meaningful clusters).
**Effort:** M

## M11 — Haptics
**Goal:** crisp haptic feedback on the key touch moments.
**Why:** zero haptics today — the biggest single "web app in a wrapper" tell; cheap, disproportionate felt-quality gain (review).
**Changes:** add `@capacitor/haptics`; fire on swipe-to-favorite/delete (`web/components/ListCard.tsx`, `SwipeDeck.tsx`), save success (`AddLinkForm.tsx`), pull-to-refresh (M16), and destructive confirms. Guard to native only.
**Acceptance:** on device, favoriting/saving/refreshing each produce an appropriate haptic; web is unaffected.
**Effort:** S

## M12 — Weekly "What you learned" synthesis
**Goal:** a short AI-written synthesis of the week's saves with the throughline — not just a list of links.
**Why:** the retention + word-of-mouth hook; it's the thing people screenshot and forward (review). You have the pieces (digest scheduler + Gemini + concepts).
**Changes:** `functions/digest_service.py` — a new synthesis mode that summarizes the week's cards into a narrative (themes, a standout, an open question) via Gemini; deliver via existing email/WhatsApp channels **and** surface it in-app as a special card. New prompt in `functions/ai_service.py`.
**Acceptance:** a weekly synthesis arrives that reads like a thoughtful recap (not a bullet dump) and links back to the source cards.
**Effort:** M

## M13 — Cut Compact view (subtraction)
**Goal:** ship two card views, not three.
**Why:** three views is one too many; Compact is cramped and the weakest (review).
**Changes:** remove `web/components/CompactCard.tsx` and its toggle option in `web/components/Feed.tsx`; keep Grid (browse) + List (triage). Migrate anyone defaulted to Compact to List.
**Acceptance:** view switcher offers Grid + List only; no dead Compact code paths.
**Effort:** S

## M14 — Trim the option sprawl (digest modes + reminder profiles)
**Goal:** perfect defaults, fewer knobs.
**Why:** six digest modes and five reminder profiles are decision fatigue on modals touched once (review).
**Changes:** `functions/digest_service.py` — keep Smart mix / Backlog / Rediscover as primary; move the rest behind an "advanced" disclosure or remove. `web/components/ReminderModal.tsx` — reduce to "Smart (spaced)" + "Custom." Update `SettingsModal.tsx` accordingly.
**Acceptance:** default digest and reminder flows expose ≤3 and 2 choices respectively; power options still reachable but not front-and-center.
**Effort:** S

## M15 — Offline reading (or drop the claim)
**Goal:** cached article text readable with no network — the subway test.
**Why:** README claims offline; the app has no service worker. For any read-later use this is table stakes (review). Decision gate: if reading isn't a target use case, **remove the claim instead** (folds into M-P5).
**Changes (if building):** cache article text from `get_article` (`functions/main.py`) into local storage / IndexedDB or a service worker cache; `web/components/ReadingView.tsx` reads cache-first offline; show an offline badge.
**Acceptance:** airplane mode → previously-opened articles still open and read; unsaved ones show a graceful offline state.
**Effort:** M (or S to remove the claim)

## M16 — Pull-to-refresh
**Goal:** standard iOS pull-to-refresh on the feed.
**Why:** even with real-time sync, its *absence* reads as broken to iOS users — a psychological affordance (review).
**Changes:** add pull-to-refresh to `web/components/Feed.tsx` (a small gesture hook, respecting safe-area + the edge-swipe hook); trigger a refetch + haptic (M11).
**Acceptance:** pulling down the feed shows a native-feeling spinner and refreshes; doesn't conflict with edge-swipe-back or list-item swipes.
**Effort:** S

---

# PHASE 3 — Differentiators (the reasons people talk about it)

## M17 — Voice capture + voice ask
**Goal:** talk to the brain — "what did I save about mortgage rates?" — and voice-add.
**Why:** AI-native apps in 2026 lead with voice; you already have the RAG (review).
**Changes:** mic input in `web/components/AskBrain.tsx` (Web Speech / Capacitor); optional voice add path into the capture pipeline. Handle WKWebView speech quirks (fall back gracefully; see the ReadingView TTS reliability caveat, QA F-31).
**Acceptance:** a spoken question returns a cited answer; a spoken note/URL creates a card.
**Effort:** L

## M18 — Proactive brain (volunteered connections/contradictions)
**Goal:** after a save, the brain occasionally volunteers insight: "this contradicts something you saved in March — want to see?"
**Why:** the agentic-partner shift; nobody in this category does it (review). Extends M10 from "clusters" to "reasoned observations."
**Changes:** backend pass over new saves vs. existing library (reuse graph + concepts) to detect contradictions/reinforcements; surface as an occasional, dismissible insight in-feed and/or a notification (needs push — currently not implemented).
**Acceptance:** saving something that relates to/contradicts a prior card yields a genuine, non-spammy observation the user can open.
**Effort:** L

## M19 — Shareable cited answers (growth surface)
**Goal:** turn a great Ask answer into a beautiful, shareable card.
**Why:** every share is an ad; your citation "proof cards" are already gorgeous (review).
**Changes:** `web/components/AskBrain.tsx` "share this answer" → render an attractive answer+citations card via the existing `share_page` backend (`functions/main.py`); handle markdown cleanly (an earlier raw-markdown-on-share bug exists — verify fixed).
**Acceptance:** sharing an answer produces a clean public card (no raw markdown) that looks intentional and links back to Machina.
**Effort:** M

## M20 — Auto-collections
**Goal:** AI clusters saves into emergent collections without the user organizing.
**Why:** mymind's core pitch ("don't organize, we do"); you already auto-tag/categorize (review).
**Changes:** backend clustering over `concepts`/tags/embeddings to propose collections; `web/components/CollectionsGallery.tsx` surfaces suggested collections the user can accept/rename. Reuse existing collection model (`web/lib/collections.ts`).
**Acceptance:** a library of ≥N cards yields sensible suggested collections; accepting one creates a real collection.
**Effort:** L

---

# POLISH — cross-cutting craft (do alongside phases)

## M-P1 — Light theme: invest a real pass or commit to dark-only
**Why:** light theme uses the generic shadow system without the inset-highlight/surface-sheen the dark theme gets — feels like a checkbox (review).
**Changes:** `web/app/globals.css` `.light` tokens — either give light the same material care (inset highlight, sheen, tuned hierarchy) or intentionally ship dark-only (like Things/early Arc) and remove the toggle. Decide, don't leave it half-done.
**Effort:** M (or S to remove)

## M-P2 — Unify modal animation language
**Why:** some overlays use the iOS no-overshoot push, others a springy overshoot — reads as assembled-from-parts (review).
**Changes:** pick one curve; apply consistently across `LinkDetailModal`, `SettingsModal`, Ask, Collections, Add sheet. Standardize in `globals.css` easing tokens.
**Effort:** S

## M-P3 — Fix sub-scannable cues + touch targets
**Why:** the 1px category color bar in List view and the 28px `•••` collection menu are below scan/touch thresholds (review).
**Changes:** widen the List category cue to 4–6px (`web/components/ListCard.tsx`); grow menu/icon targets to ≥44px (`CollectionsGallery.tsx` and any other <44px controls).
**Effort:** S

## M-P4 — Snappier entrance timing
**Why:** 0.42s staggered card-enter feels slow on a full feed (review).
**Changes:** tune the card-enter keyframe/stagger in `globals.css` toward ~0.25s and reduce per-card delay; keep the spring personality.
**Effort:** S

## M-P5 — README ↔ reality
**Why:** the README claims a knowledge-graph *view*, an "Insights Dashboard," and offline support that don't exist as described — a vibe-coding tell even when the code isn't (review; TASKS.md **T12**).
**Changes:** rewrite `README.md` to describe what's actually shipped (fold naming into M1). Align with the M15 offline decision.
**Effort:** S

---

# Suggested execution order

1. **M1, M4, M6, M7** (quick trust wins + the name) — a few days, big perceived-quality jump.
2. **M2, M3, M5** (the hard trust bugs) — the "never doubt it" bedrock.
3. **M8** (auth + onboarding) — unblocks everything else being a product.
4. **M9, then M13/M14** (reveal the graph, cut the sprawl) — highest magic-per-effort.
5. **M11, M16, M-P2/P3/P4** (feel-native polish) — cheap, felt everywhere.
6. **M10, M12** (proactive + synthesis) — the retention/word-of-mouth engine.
7. **M15, M-P1, M-P5** (decisions: offline, light theme, docs).
8. **M17–M20** (differentiators) — once the base is trusted and focused.

Update `HANDOFF.md` each session with the M# touched and its status.
