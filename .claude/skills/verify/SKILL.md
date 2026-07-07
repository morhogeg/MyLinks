---
name: verify
description: Verify a Machina AI change end-to-end before declaring it done — never report a frontend or backend change complete on a successful edit or typecheck alone. Use after any non-trivial change to web/ or functions/, before /ship, and whenever the user asks "does it work" / "verify" / "check it". Runs typecheck + py_compile, the theme-token lint, and drives the changed page in a real browser (Chromium) checking for console errors.
---

# Verifying Machina AI changes

Machina's loop used to end at `tsc --noEmit`, which means a human (you) was the
real verification step every turn. This skill closes that loop: encode the checks
a careful reviewer would run so Claude can self-verify. **The more quantitative
the check, the better** — a passing typecheck is necessary but never sufficient
for a UI change.

**Never report a change as complete based on a successful edit or typecheck
alone.** Verify it the way a human reviewer would, then report what you observed
(not just "it should work").

## When to run

- After any change under `web/` (excluding docs) → run the full sequence.
- After any change under `functions/` → run steps 1–2 + the relevant backend check.
- Docs/skills-only change → skip; there is no runtime surface to drive.
- Always before `/ship` on a non-trivial diff.

## The sequence

Run from the repo root (`~/MyLinks` in the main worktree, which has
`web/node_modules` and `web/.env.local`; a session may be in a worktree under
`.claude/worktrees/<name>`).

### 1. Static checks (fast, always)
```bash
cd web && ./node_modules/.bin/tsc --noEmit        # must exit 0
cd ../functions && python -m py_compile *.py       # backend syntax
```

### 2. Theme-token lint (project rule — never hardcode colors)
Machina's CLAUDE.md forbids hardcoded colors; the token system is
`text-text`, `bg-card`, `--accent-gradient`, `--ease-modal`, etc. Flag any
NEW hardcoded color in the diff (not the whole tree):
```bash
git diff main...HEAD -- 'web/**/*.tsx' 'web/**/*.ts' \
  | grep -nE '^\+' \
  | grep -iE '#[0-9a-f]{3,8}\b|\b(bg|text|border)-(white|black)\b|rgba?\(' \
  | grep -viE 'VectorValue|//|hardcode-ok'
```
Non-empty output = review each hit. Alpha tokens over the theme surfaces
(`bg-card-hover`, `border-border-subtle`) are the correct fix — see the
`white/5`·`black/20` regression in §9 (2026-07-05).

### 3. Drive the changed page in a real browser
Start the dev server and exercise the change — this is the step that catches
what typecheck can't (runtime crashes, hydration errors, a control that renders
but does nothing).
```bash
cd web && npm run dev &          # http://localhost:3000 ; wait for "Ready"
node .claude/skills/verify/smoke.mjs http://localhost:3000 <path>
```
`smoke.mjs` (in this skill folder) loads the page in Chromium, waits for network
idle, and **fails if there are any console errors or page exceptions**, then
screenshots to the scratchpad. For an interactive change (a new button, toggle,
filter pill), extend it or drive it inline: click the control, assert the
expected state change, screenshot before/after. The more the check measures, the
more Claude can self-verify instead of handing back partially-verified work.

If any step fails, fix it and rerun from step 1 — do not hand back a partial pass.

### 4. Backend behavior (when a function's logic changed)
Cloud sessions can't reach `*.run.app` (egress allowlist) — so verify deployed
functions **through the app** (step 3 against the live data), not `curl`. For the
WhatsApp webhook specifically, `./test_locally.sh` POSTs a sample message to the
local emulator. Schema/prompt changes to `ai_service.py`: save a representative
link in the running app and read the resulting card, don't assume the prompt
"looks right."

## Report format

State what you actually observed, e.g. "tsc clean; token lint clean; loaded
/feed in Chromium — zero console errors; clicked the status pill, feed filtered
to Favorites and the pill cleared on X (screenshots in scratchpad)." If you could
not drive something (needs a physical device — share extension, haptics,
keyboard-avoidance), say so explicitly and list it for the §4 task-11 device sweep.

## Gotchas (seeded from SOURCE_OF_TRUTH §2 — grow this from real failures)

- **`npm run dev` binds `localhost`, not `127.0.0.1`.** The Firebase emulator
  gate keys off `localhost` + `http:`, so `http://127.0.0.1:3000` previews
  against **prod data** while `http://localhost:3000` may hit the emulator.
  Use `localhost` for UI checks; use `127.0.0.1` only when you deliberately want
  live prod data.
- **Never treat `window.Capacitor` as a native signal** — `@capacitor/core`
  defines it in a plain browser too, so a browser smoke test runs the *native*
  code path if code branches on `Boolean(window.Capacitor)`. The canonical check
  is `isNativeApp()` in `web/lib/api.ts` (origin `capacitor:` /
  `Capacitor.isNativePlatform()`). A browser is NOT native — expect the web path.
- **Static export vs Vercel build differ.** Local `next dev` runs the native
  Next server; the Capacitor/Hosting build is `output: export` (`VERCEL=1`
  disables export). A route that works in dev can still break the static export —
  if the change touches routing/`app/api`, also run `npm run build` once.
- **SSE is buffered in WKWebView** but streams in a desktop browser — so a
  streaming feature can look perfect in the smoke test yet need the buffered-JSON
  path on native (`wantStream = !isNativeApp()`). Note it for device verification.
- **Kill the dev server when done** (`kill %1` or by PID) — a stray `next dev`
  holds port 3000 and the next run silently starts on 3001.
- If `web/node_modules` is missing (fresh clone / worktree), `npm ci` in `web`
  first; the smoke script uses the globally-available Playwright + pre-installed
  Chromium (no `playwright install`).
- **`web/.env.local` is required for the page to render.** It's gitignored and
  lives only on the main worktree, so a fresh cloud clone has no Firebase keys —
  the app then throws `auth/invalid-api-key` and the page 500s (the smoke test
  will correctly report this). Run the browser step where `.env.local` exists, or
  copy it in first. A 500 with `auth/invalid-api-key` = missing env, not a code
  regression.
