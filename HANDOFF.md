# Session Handoff — MyLinks ("Second Brain")

_Last updated: 2026-06-26. Branch worked on: `claude/elated-easley-47baa3` (merged to `main` throughout, commits `9eba77c…9a18563`)._

## TL;DR
This session was a broad **UX / design + product pass**:
- **Toolbar overhaul** (Feed controls): consistent sizing/contrast/cursor, labeled view
  switcher, a custom accent-themed **Dropdown** (replaces native `<select>` so there's no
  OS-blue menu), per-source filter colors, real **X logo**.
- **Branded source bylines** for YouTube (red channel), **X** (`@handle`), and **LinkedIn**
  (author name) — on cards, the detail modal, and the review deck, replacing the muted tag.
- New **Tinder-style "Review" view** (`SwipeDeck`) — swipe right=Favorite, left=Archive,
  up=Remind, tap=Open; non-destructive with Undo; fits one viewport.
- **Detail modal** now leads with the same **highlighted** summary as the card.
- **WhatsApp save message rebuilt** + **reminder quick-replies = days** (1/2/3/7, `S`=spaced).
- **Header redesign** (gradient wordmark + cohesive circular controls) and a **full Settings
  modal redesign** (theme-aware, in-modal theme switch, restructured sections).

Frontend is **merged to `main` and live on Vercel** (`https://my-links-sable.vercel.app`).
⚠️ **Cloud Functions changes are NOT deployed yet** — see Deploy (must deploy **all** functions this time).

---

## Project shape (orientation)
- **Frontend:** Next.js 16 + React 19 in `web/`. **Vercel** auto-deploys on push to `main`.
  Tailwind v4 (theme tokens: `text-text`, `text-text-secondary`, `text-text-muted`,
  `bg-card`, `bg-card-hover`, `border-border-subtle`, `bg-accent`, `var(--accent-gradient)`,
  `var(--shadow-card)`). **Always use these tokens, not hardcoded white/black** (the old
  Settings modal broke in light mode because of that).
- **Backend:** Python Firebase Cloud Functions in `functions/` (Gemini, Firestore, Storage).
- **Firebase project:** **`secondbrain-app-94da2`**. `web/vercel.json` routes `/api/*` there.
  Firestore data: `users/{uid}/links/{id}` (uid is the phone number, e.g. `+16462440305`).

---

## What changed this session (newest first)

### Settings modal — full redesign (`web/components/SettingsModal.tsx`)
- Rebuilt on theme tokens (fixes light-mode breakage). Branded header; grouped sections
  (Appearance / Reminders / Capture / About) from reusable `Row`/`Toggle`/`Segmented`
  primitives; scrollable body.
- **New:** in-modal **theme switch** (Light/Auto/Dark via `useTheme`, applies instantly).
  Frequency now shows a per-mode description. Capture section shows WhatsApp + iOS Shortcut.

### Header (`web/app/page.tsx`, `web/components/ThemeToggle.tsx`)
- Gradient brain mark with glow, **gradient "Second Brain" wordmark**, accent hairline.
- Theme toggle + Settings are now matching **circular** controls; theme toggle is icon-only
  (still cycles light→system→dark). Header height 56/64 → 60/68px.

### Tinder "Review" view (`web/components/SwipeDeck.tsx`, wired in `Feed.tsx`)
- New `viewMode === 'review'`; switcher item with `Layers` icon.
- Swipe right=Favorite, left=Archive, up=Remind (opens reminder modal), tap=Open. Buttons
  mirror gestures. **Undo** (favorite/archive → unread). No delete on swipe by design.
- Deck **snapshots links on mount** (no reshuffle mid-session). **Fits one viewport**: a
  `useEffect` measures the deck's top and sizes height to the viewport (card stack flexes,
  buttons pinned). Live drag hints, 3-deep stack, progress, "all caught up" state.

### Source bylines (`web/lib/platform.tsx` + `Card.tsx`, `LinkDetailModal.tsx`, `SwipeDeck.tsx`)
- `platform.tsx` gained: **`XLogo`** (real X mark; lucide only ships the bird),
  `platformColor`, `platformActiveStyle` (per-platform filter tint),
  `xHandle(url)` (X `@handle` from URL), `linkedinAuthor(url)` (slug → "Omri Zerachovitz"),
  `linkedinDisplayName(url, sourceName)` (prefers real stored name), `prettyHost(url)` (safe).
- Each card's top-right slot renders a **branded byline** instead of the muted chip:
  YouTube=red channel, X=`@handle` (X grey `191,201,214`), LinkedIn=author (brand blue).
  Detection is **URL-based** (reliable). Bylines forced `dir="ltr"` so they read correctly
  on Hebrew/RTL cards. "None"/"Screenshot" source tags suppressed.

### Toolbar (`web/components/Feed.tsx`, `web/components/Dropdown.tsx` [new])
- Unified control sizing (h-9, 16px icons, cursor-pointer), labeled segmented **view switcher**
  (Cards/Compact/Table/**Review**/Insights), distinct icons, `CheckSquare` for select-multiple.
- **`Dropdown.tsx`**: accent-themed select replacement for Status + Sort (kills OS-blue menu).
- Source-filter buttons tint to each platform's brand color when active.
- **Selected tag chips** always render above the cards; only the **X** removes a chip.
- **`TableView` crash fixed**: it did `new URL(link.url)` unguarded → any bad/empty URL blew
  up the whole table. Now uses `prettyHost()`.

### Detail modal highlights (`web/components/LinkDetailModal.tsx`)
- Leads with the highlighted `summary` (same `**bold**` key terms as the card), then the
  `detailedSummary` below. (The AI bolds `summary` but not `detailedSummary`, so the open
  state previously looked flat.)

### Backend — WhatsApp message + reminders + LinkedIn author (NOT deployed yet)
- **`functions/whatsapp_handler.py` → `format_success_message` rebuilt**: title + one context
  line + **📌 In one line** (from `summary`) + **🔑 Worth knowing** (bullets parsed from
  `detailedSummary`; timestamped **Key moments** for video). Markdown `**bold**`→WhatsApp
  `*bold*`. A **connections block is implemented but gated** behind
  `INCLUDE_CONNECTIONS = False` (flip to enable once related-links quality is ready).
- **Reminder quick-replies now map number→days** (`functions/reminder_service.py`
  `handle_reminder_intent`): `1`=1d, `2`=2d, `3`=3d, `7`=7d, `S`=spaced repetition (carries on).
  Numbered replies use a new **`"once"`** profile (fire once, don't recur) handled in
  `run_reminder_check`; `S` uses `"spaced"`. `SPACED_START_DAYS = 3`. Menu + confirmation
  text updated in `functions/main.py` (`whatsapp_webhook`) and the inline save-time path.
- **LinkedIn author capture** (`functions/scraper.py`): `_scrape_linkedin_url` +
  `_extract_linkedin_author` pull the real name from the `"<Author> on LinkedIn:"` og:title
  and store it as `sourceName` (both `link_data` builds in `main.py` now do
  `scraped.get("source_name") or analysis.get("sourceName")`). Frontend `linkedinDisplayName`
  prefers it. **Only affects newly-saved LinkedIn posts**; existing cards fall back to the
  URL-derived name.

---

## Deploy

### Frontend (automatic)
Push to `main` → Vercel rebuilds. All this session's web changes are **live**.

### Firebase Hosting (manual — easy to forget, serves a SEPARATE build)
`secondbrain-app-94da2.web.app` (used by the iOS Shortcut / share deep-links / `APP_URL`)
is a **separate** deployment from Vercel and does **not** auto-update. If left stale it
serves an old `web/out` — which caused iPhone image uploads to fail with
`storage/unauthorized` (the old build wrote images client-side to `users/<uid>/uploads/`;
the app has **no Firebase Auth** so `request.auth` is null and `storage.rules` deny it).
The current build uploads via the backend, so redeploying fixes it:
```bash
cd ~/MyLinks && git pull && ./deploy-hosting.sh     # build static export + firebase deploy --only hosting
```
Re-run whenever the web app changes and mobile must stay current.

### Functions (manual — PENDING, and deploy ALL functions this time)
The user's local `~/MyLinks` was found **stale** mid-session (still on the original commit), so
an earlier `firebase deploy` shipped OLD code — that's why the new WhatsApp message "didn't
change". Local was fast-forwarded, but **more functions changes landed after** (LinkedIn author),
and the WhatsApp/reminder code still isn't live. Also note: the reminder changes live in the
**`whatsapp_webhook`** and **`check_reminders`** functions, which are NOT in
`deploy-functions.sh`'s default 3 targets — so deploy **everything**:
```bash
cd ~/MyLinks
git checkout main && git pull origin main      # get 5a95c87 (LinkedIn) + 9a18563 (settings)
firebase use secondbrain-app-94da2
firebase deploy --only functions --project secondbrain-app-94da2   # ALL functions
# (./deploy-functions.sh only does analyze_link/analyze_image/process_link_background)
```
After this: new WhatsApp message format, day-based reminders, and LinkedIn author capture go live.

---

## Verification
- Frontend source of truth: `cd web && npx tsc --noEmit` (kept clean every commit this session).
- `npm run build` compiles clean; the only failure is the prerender step needing Firebase env
  locally (environmental — Vercel has the env). Treat other build errors as real.
- Functions: `cd functions && python -m py_compile *.py`. Logic spot-checked by importing the
  pure helpers with heavy deps stubbed (message render + day-mapping verified this way).

---

## Open items / suggested next steps
- **Deploy the functions** (above) — highest priority; backend UX changes are written but dark.
- **Enable WhatsApp "connections"** block: flip `INCLUDE_CONNECTIONS = True` in
  `whatsapp_handler.py` once related-links quality is trusted (data already on `relatedLinks`).
- **LinkedIn backfill:** existing LinkedIn cards still show the URL-derived name ("Markmanson");
  a one-off re-scrape backfill would populate real names. Vanity slugs with no separators can't
  be split from the URL alone (hence the backend og:title capture).
- **Swipe-up = reminder** opens the reminder modal mid-deck; consider an instant default
  (e.g. spaced) for a smoother flow.
- **Settings features** offered but not built: library stats (links saved / top categories),
  data export (JSON), show connected WhatsApp number.
- **`sourceName: "None"`** still produced by the backend for some web pages (frontend now hides
  it); could fix at the source (AI prompt / `analyze`).
- Older open items still stand: "Untitled (Analysis Failed)" cards need a distinct failed state;
  X/Instagram analysis still uses the generic scraper (lower quality than YouTube's native path).

## Out of scope (per user, earlier rounds)
Auth/multi-user isolation, connectors/sync beyond the iOS Shortcut, export/highlights.
