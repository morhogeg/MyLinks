---
name: polish
description: Run an Apple-level design + product execution pass on ANY Machina screen or feature (e.g. /polish collections, /polish ask, /polish insights, /polish settings). Onboards on the docs, reviews the named feature (and any attached device screenshots) through a fixed set of quality lenses — redundancy, hierarchy, shared-component consistency, RTL/Hebrew, grouping/separation, touch & motion, jargon — proposes ONE scoped round of improvements, waits for approval, builds it, render-verifies light+dark, ships via /ship, and documents in SOURCE_OF_TRUTH.md. Iterates in rounds from owner device QA. Use when the user says polish, "Apple-level pass", "UX round", "bring X to our bar", or names a screen with attached screenshots asking for design/UX improvements.
---

# Polish — Apple-level execution pass on a Machina feature

The argument names the target feature/screen (e.g. `collections`, `ask`,
`insights`, `reminders`, `settings`, `share flow`, `login`). Everything below is
feature-agnostic — resolve the argument to its real surfaces in code before
reviewing.

> Method provenance: this codifies the digest-screens overhaul (§9 entries dated
> 2026-07-21, "DIGEST SCREENS UX ROUND" 1–3). Read those entries first — they
> show the loop working end-to-end, including the render harness recipe and the
> kind of product decisions that must be written down.

## The loop

Round 1 is a proposal, not a fix-everything pass. Owner device QA after each
TestFlight build feeds the next round — rounds 2 and 3 are where work reaches
the bar. Keep every round scoped and shippable.

### 1. Onboard (silent)

Run the `/onboard` reading steps if this is a fresh session: `CLAUDE.md`,
`SOURCE_OF_TRUTH.md` §1–§5 + the newest §9 entries (always including the
2026-07-21 digest-round entries). No narration back to the user.

### 2. Locate the feature

Map the argument to its actual surfaces: the components/screens in `web/`
(mobile view, desktop view, any overlay/detail/settings variants), the data it
renders (Firestore shape, denormalized refs, backend writer in `functions/` if
any), and its entry points (tabs, chips, deep links). Note which parts are
config vs content — that distinction drives lens 1. Look at the user's attached
screenshots against the real code before forming opinions.

### 3. Review through EVERY lens

Walk each surface of the feature through all eight lenses. The screenshots show
real data — that's where redundancy and RTL issues actually appear.

1. **Redundancy & information value.** For every label, count, eyebrow, badge,
   and repeated element: does it tell the user something they don't already know
   from context? Config/static text repeated on every row is noise; identity
   belongs where it VARIES. Kill stats trivia that carries no decision value.
   Screen chrome (nav bar) carries the name ONCE — never re-stated in a header
   below it.
2. **Information hierarchy.** Each row/card/header leads with what actually
   distinguishes it. One quiet metadata line beats three scattered labels.
   Reclaim dead vertical space — merge lines when one line reads better; get
   real content above the fold.
3. **Consistency with canonical patterns.** Anything displaying a card or
   source must use the shared components — `SourceByline`, the category
   color/chip system, `surface-card` + `--shadow-card`, collection color dots —
   never a local re-implementation. If a shared component's props are too
   narrow for denormalized data, WIDEN them structurally (see
   `SourceBylineLink`) instead of copying logic. Visual drift between views is
   a bug. Prefer client-side fixes that improve the whole existing history over
   backend changes that only affect future data.
4. **RTL / Hebrew correctness.** Titles align, wrap, and truncate in their own
   direction (per-row `dir` from `getDirection`, ListCard's full-mirror
   pattern, `font-hebrew`); thumbnails/accessories flip sides with the row;
   metadata lines stay LTR internally but hug the content edge
   (`justify-end` when RTL); no bidi-scrambled comma lists — give mixed-script
   runs their own `dir="auto"` span; chips get `dir="auto"`.
5. **Grouping & separation.** Division between items must be unmistakable in
   BOTH themes. Hairline dividers fail once items carry multiple lines — prefer
   iOS inset-grouped rows (rounded, bordered, gapped). Check section logic
   (recency buckets, pinned/favorites), empty states, and whether grouping
   matches the user's mental model.
6. **Touch & motion.** Every tappable row: press state (`active:scale`/opacity),
   hover styles guarded behind `[@media(hover:hover)]`, haptics where the app
   already uses them (`hapticLight`), edge-swipe back standing down under open
   overlays (`useEdgeSwipeBack` fires every enabled instance!), ≥44px targets,
   staggered `animate-card-enter` where lists appear (reduced-motion aware).
7. **Jargon leak.** No internal vocabulary (mode names, technical labels, enum
   values) on user-facing surfaces. Sentence case, human words.
8. **Product questions.** What's the hero action of this screen? What scales
   badly (many items, huge items, zero items)? What's the privacy/sharing story
   at a glance? Flag structural questions and ASK before building anything
   architecturally significant; record the decision in §9 so it's never
   re-litigated.

### 4. Propose round 1 and STOP

Present findings ordered by impact, the proposed round-1 scope, and a verdict —
then wait for `go` (the `/onboard` approval gate). Answer any product questions
the user asked in the same reply.

### 5. Build

On the current `claude/*` branch. House rules: theme tokens only (`text-text`,
`bg-card`, `--accent-gradient`, `--ease-modal`) — never hardcoded colors; match
surrounding code style; keep the diff scoped to the round.

### 6. Verify — render, don't imagine

- `cd web && npx tsc --noEmit` must exit 0; eslint the changed files.
- **Render-verify BEFORE shipping** (mandatory for visual work — §9 process
  note, 2026-07-21): throwaway harness page under `web/app/dev-<feature>/`
  rendering the real components with realistic fixtures — Hebrew AND English
  titles, X/YouTube/Facebook/plain-publisher sources, items with and without
  thumbnails, 0/1/many counts. Add the route to `PUBLIC_ROUTES` locally, dummy
  `NEXT_PUBLIC_FIREBASE_*` keys in `web/.env.local`, `next dev`, then
  `playwright-core` against the preinstalled Chromium
  (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`, `NODE_PATH=web/node_modules`)
  at 390px width, light AND dark (`localStorage.theme`), and actually READ the
  screenshots for defects. Delete the harness page, the env file, and the
  `PUBLIC_ROUTES` edit before committing; `rm -rf web/.next` if tsc picks up
  stale dev types.

### 7. Ship + document

Ship via **`/ship`** (merge to main → Vercel auto; trigger TestFlight when the
app changed; watch the run and report the build number = 1000 + run number).
Update `SOURCE_OF_TRUTH.md`: §9 entry with what changed, WHY (the design
reasoning and any product decision), the regression check, and the shipped
artifacts (commits, build number); §4 if backlog items moved. Expect parallel
sessions on `main`: pull before merging, resolve §9 collisions by keeping both
entries newest-first, and re-typecheck after any merge.

### 8. Iterate

When the user returns with device screenshots, treat each item as round N+1:
re-run the relevant lenses on what changed, fix, re-verify (including checking
for regressions the previous round introduced — read the build's screenshots
skeptically), re-ship. Arm a `send_later` check on the TestFlight run before
ending the turn.

## Notes

- Screenshots attached by the user are the ground truth for what's wrong; the
  render harness is the ground truth for what's fixed.
- If the user names a feature with no screenshots, review code + your own
  harness renders, but say which findings would benefit from device
  confirmation.
- Never create HANDOFF/TASKS docs — everything lands in `SOURCE_OF_TRUTH.md`.
