# Session Handoff — MyLinks ("Second Brain")

_Last updated: 2026-06-25. Branch worked on: `claude/codebase-production-polish-q90zhk` (merged to `main` throughout)._

## TL;DR
This session delivered a **YouTube understanding overhaul** (grounded Gemini native
video analysis + real video cards) and a **design pass** on the feed (depth/motion,
wider layout, masonry, source filtering, card refinements). Everything below is
**merged to `main` and live on Vercel** (`https://my-links-sable.vercel.app`).
The **Cloud Functions changes require a manual deploy** (see Deploy section) — the
frontend deploys automatically on push to `main`.

---

## Project shape (orientation for next session)
- **Frontend:** Next.js 16 + React 19 in `web/`. Deployed on **Vercel** (production
  branch `main`, auto-deploys on push). Tailwind v4. Firebase Web SDK for Firestore
  realtime (`web/lib/firebase.ts`, config from `NEXT_PUBLIC_FIREBASE_*` env vars).
- **Backend:** Python Firebase Cloud Functions in `functions/` (Gemini via
  `google-genai`, Firestore, Storage). Model = single constant
  `GEMINI_ANALYSIS_MODEL = "gemini-3.1-flash-lite"` in `functions/ai_service.py`.
- **Firebase project (IMPORTANT):** the app lives in **`secondbrain-app-94da2`**.
  The Gemini API key's Google Cloud project (`gen-lang-client-…`) is a *different*
  thing — do NOT deploy functions there. `web/vercel.json` routes the live site's
  `/api/*` calls to `https://secondbrain-app-94da2.web.app`.

---

## What changed this session (newest first)

### Feed layout & cards (design pass)
- **Masonry feed** (`web/components/Masonry.tsx`, used in `Feed.tsx` grid view):
  flexbox masonry — column count derived from container width via `ResizeObserver`
  (340px target), cards distributed **round-robin** so the top row reads
  **newest→oldest left-to-right** and cards hug their content (no dead space).
  - We tried CSS multi-column first; it mis-painted transformed cards in Safari
    (invisible cards) and was column-major. Flexbox masonry replaced it. Don't go
    back to CSS columns.
- **Source/platform filter:** `web/lib/platform.tsx` (`getPlatform(url)`,
  `platformIcon()`, `PLATFORM_LABELS`). `Feed.tsx` shows toggle icons for platforms
  present in the library (YouTube/X/Instagram/LinkedIn/GitHub) and filters by them
  (`selectedPlatforms` state). `Card.tsx` shows the same icon next to the source.
- **Card refinements (`Card.tsx`):** full source name (no premature truncation),
  an **Open-source** ↗ button in the hover cluster + the mobile `CardActionSheet`,
  category/source meta row mirrors per card language (category on the title's
  starting edge — right for Hebrew), and **footer tags are clickable** → filter the
  feed (wired to `handleToggleTag`).
- **Detail modal (`LinkDetailModal.tsx`):** source name no longer truncated.
- **Wider layout (`web/app/page.tsx`):** container `max-w-[2200px]`. Persistent
  collapsible Tag Explorer sidebar on `lg+` (state/localStorage already in `Feed.tsx`).
- **Depth & motion (`web/app/globals.css`):** elevation tokens tuned to read on the
  dark near-black bg (lit top edge + accent-glow hover) and on light bg; base shadow
  is a `shadow-[var(--shadow-card)]` utility so the `hover:` variant wins. Card
  entrance stagger, `prefers-reduced-motion` guard.

### YouTube overhaul
- **Grounded native video analysis.** `functions/scraper.py` no longer scrapes
  transcripts (YouTube blocks datacenter IPs and the old prompt fabricated
  summaries). It now returns lightweight **oEmbed** metadata only (title, channel,
  thumbnail) + URL normalization (`_extract_youtube_id`). `youtube-transcript-api`
  removed from `requirements.txt`; `google-genai>=1.0`.
- `functions/ai_service.py` → **`analyze_youtube(watch_url)`** uses Gemini native
  video ingestion (`types.Part(file_data=FileData(file_uri=…))`, low media
  resolution). Google watches the actual video server-side. The old hallucination
  prompt is replaced by a grounded `VIDEO_ANALYSIS_PROMPT` (timestamped
  `videoHighlights`, real `speakers`, observed `videoDurationMinutes`).
- `functions/main.py` → `_analyze_scraped()` routes YouTube to native analysis with
  an honest **metadata-only fallback** (private/over-quota); `_apply_youtube_metadata()`
  stores `videoId`, `watchUrl`, `thumbnailUrl`, `youtubeChannel`, `durationDisplay`,
  `videoHighlights`, `speakers`.
- **Video cards:** `Card.tsx` shows a 16:9 thumbnail + play overlay + duration badge
  and a **creator byline** (channel). `LinkDetailModal.tsx` embeds a
  `youtube-nocookie` player with **clickable "Key moments"** timestamps and a
  speakers row. `web/lib/types.ts` `LinkMetadata` carries the video fields.
- **Video loading UX:** `web/components/VideoScanProgress.tsx` (mirrors
  `ImageScanProgress`) — thumbnail + scan-line sweep + video-flavored phases, slow
  progress creep tuned for the ~1-minute analysis. `AddLinkForm.tsx` detects YouTube
  URLs (`youTubeId`) and drives it; reuses the dismiss-and-continue chip.

### Ops
- **`deploy-functions.sh`** (repo root): always deploys with
  `--project secondbrain-app-94da2`, so a stray `firebase use` can't send a deploy
  to the wrong project (it had been going to `travelistai-production`).

---

## Deploy

### Frontend (automatic)
Push to `main` → Vercel rebuilds `https://my-links-sable.vercel.app`. Nothing to do.

### Functions (manual — needs the user's local creds)
The remote/agent container has no `GEMINI_API_KEY`/Firebase creds, so functions
must be deployed from the user's machine:
```bash
cd ~/MyLinks
git checkout main && git pull origin main
firebase use secondbrain-app-94da2     # once, clears any stale active-project override
./deploy-functions.sh                  # deploys analyze_link, analyze_image, process_link_background
```
The YouTube backend changes are deployed (user confirmed working). Re-run after any
`functions/` change.

---

## Verification notes
- `cd web && npx tsc --noEmit` is the source of truth for the frontend (must be clean).
- `npx eslint <files>`: the repo has **pre-existing** `@typescript-eslint/no-explicit-any`
  errors (`getTimeAgo` in Card/Modal, `catch (err: any)` in Feed) and `<img>`
  `no-img-element` warnings — these are NOT ours; just don't add new ones.
- `VERCEL=1 npm run build` **fails in the sandbox** only on
  "Failed to fetch Geist from Google Fonts" (proxy blocks Google Fonts). This is
  environmental; Vercel builds fonts fine. Treat any *other* build error as real.
- Functions: `cd functions && python -m py_compile *.py`.

---

## Open items / suggested next steps
- **Source-filter icons** in the controls row are subtle/easy to miss — consider
  making them more prominent or labelled.
- **"Untitled (Analysis Failed)" cards**: failed analyses still save a junk-looking
  card; consider a distinct failed-state treatment or a retry affordance.
- **Extend platform treatment** to compact cards / detail modal for full consistency
  (currently the platform icon is on the main grid Card + filter).
- **Masonry order on resize/filter:** changing column count or filters redistributes
  cards (they re-animate). Fine, but note it if tuning.
- Twitter/X & Instagram analysis still go through the generic web scraper in
  `scraper.py` (bridge APIs) — quality is lower than YouTube's native path; a future
  pass could improve these.

## Out of scope (per user, earlier rounds)
Auth/multi-user isolation (T1/T4), connectors/sync, export/highlights — not touched.
