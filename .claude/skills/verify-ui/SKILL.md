---
name: verify-ui
description: Verify a visual/frontend change in Machina AI with real Chromium screenshots across the full matrix — dark + light theme, English + Hebrew (RTL) content, phone + desktop viewports — using a throwaway fixture harness that is deleted before commit. Use whenever a change touches anything user-visible in web/ (components, layout, theme, markdown rendering, modals) and before shipping any change described with words like "looks", "layout", "spacing", "color", "theme", "RTL", or "polish".
---

# Verify UI — screenshot-proof a frontend change

`tsc --noEmit` proves types, not pixels. This repo's history is full of changes
that typechecked and rendered wrong (invisible related-cards in light mode,
un-mirrored Hebrew rows, a header fade that never attached). The proven pattern —
used for the ListCard redesign ("screenshot-verified, real Chromium renders,
EN+HE fixtures, dark+light") — is a throwaway harness page + Playwright.

**The matrix (all four axes, every time):**

| Axis | Values | Why |
|---|---|---|
| Theme | dark (default) + light (`.light` on `<html>`) | tokens flip; hardcoded colors don't |
| Language | English + Hebrew fixture | RTL mirrors layout, `dir` bugs invisible in EN |
| Viewport | 390×844 (iPhone) + 1280×800 (desktop) | modals are full-screen vs centered sheet |
| State | every visual state the change has (empty/loading/error/long-text) | truncation + overflow bugs |

## Steps

### 1. Build the throwaway harness

Create `web/app/dev-harness/page.tsx` (`'use client'`). Render the changed
component directly with hard-coded fixture props — do NOT go through auth or
Firestore. Include at minimum:

- One English fixture with realistically long text (titles that must clamp,
  summaries with `**bold**` and `## ` headings if it renders markdown).
- One Hebrew fixture (e.g. title `שלושה דברים שלמדתי על השקעות השבוע`, tags in
  Hebrew) — this is what catches missing `dir` and un-flipped padding.
- Every state variant side by side (e.g. `status: 'processing' | 'failed' |
  'unread'`, favorite on/off, with/without image).

Fixture data shape: copy a real `Link` from `web/lib/types.ts` — remember
`createdAt` can be number or string, `status` has no `'ready'`.

If the change is inside the real page flow (Feed, modals) and can't be isolated,
mount the component tree the harness needs (e.g. `ToastProvider` +
`ThemeProvider` wrappers from `app/layout.tsx`) rather than fighting AuthProvider.

### 2. Run the dev server

```bash
cd web && npm run dev &   # port 3000
```

Note: `http://localhost:3000` connects to Firebase **emulators** per the gate in
`web/lib/firebase.ts` (hostname `localhost` + `http:`). The harness doesn't touch
Firestore so this doesn't matter — but if you ever need the real app against
**prod data**, open `http://127.0.0.1:3000` instead (documented trick,
SOURCE_OF_TRUTH §2).

### 3. Screenshot the matrix with Playwright

Install Playwright OUTSIDE the repo (scratchpad or temp dir — never add it to
`web/package.json`):

```bash
mkdir -p "$SCRATCH/shots" && cd "$SCRATCH" && npm i playwright
```

In Claude cloud sessions Chromium is pre-installed
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); if launch fails, pass
`executablePath: '/opt/pw-browsers/chromium'`. Script template:

```js
// $SCRATCH/shoot.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/dev-harness';
const browser = await chromium.launch();

for (const [vw, vh, dev] of [[390, 844, 'phone'], [1280, 800, 'desktop']]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  for (const theme of ['dark', 'light']) {
    // Theme is a class on <html>, NOT prefers-color-scheme — toggle it directly.
    await page.evaluate(t => {
      document.documentElement.classList.toggle('light', t === 'light');
    }, theme);
    await page.waitForTimeout(250); // let transitions settle
    await page.screenshot({ path: `shots/${dev}-${theme}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
```

```bash
cd "$SCRATCH" && node shoot.mjs
```

For animated states, also capture mid-animation if the change is motion
(`page.emulateMedia({ reducedMotion: 'reduce' })` to verify the reduced-motion
fallback exists).

### 4. Read the screenshots — check, don't glance

Open every image (Read tool renders PNGs) and check:

- [ ] Light mode: nothing white-on-white / invisible (the `bg-white text-black`
      class of bug). Borders/shadows visible on the light panel.
- [ ] Dark mode: elevation reads (inset highlight + ring, per `--shadow-card`).
- [ ] Hebrew fixture: layout fully mirrored — color bar/chips/star on the correct
      side, text right-aligned, list padding flipped; URLs/handles still LTR.
- [ ] Long text: clamps where it should (no overflow, no pushed-out siblings).
- [ ] Phone viewport: touch targets ≳44px, nothing under the notch area
      (`safe-area` insets), modal is full-screen not a floating sheet.
- [ ] Every state variant renders (processing shimmer, failed + Retry, etc.).

Anything wrong → fix → re-run step 3. Screenshots are the evidence; keep the
final set to show the user (SendUserFile) when the change is visual.

### 5. Tear down — mandatory

```bash
rm -rf web/app/dev-harness
git status   # must show NO harness files; scratchpad files live outside the repo
```

The harness is never committed (the ListCard session's `/dev-listcard` was
"removed before commit" — same rule). Kill the dev server.

## Gotchas

- **Don't screenshot through the real login.** Web now gates behind
  Apple/Google sign-in; cloud sessions can't complete OAuth. The fixture harness
  exists precisely to bypass that.
- **Don't toggle theme via `prefers-color-scheme`** (`emulateMedia`) — the app
  themes via the `.light` class; the four legacy `dark:` usages are bugs, not the
  system.
- **iOS-only behaviors can't be screenshot-verified here** (haptics, edge-swipe,
  keyboard/visual-viewport, share sheet). Verify the code path
  (`isNativeApp()` branch), state in the report that on-device verification is
  pending, and add it to the SOURCE_OF_TRUTH §4 task-11 device sweep list if it
  matters.
- The dev server compiles lazily — first `goto` may take ~10s; use
  `waitUntil: 'networkidle'` and a generous timeout.
