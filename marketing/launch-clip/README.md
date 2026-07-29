# Machina — launch film

A 67-second launch film, rendered from code. No editor project, no stock music, no
screen recording: the picture is [Remotion](https://remotion.dev) (React → frames),
the score is synthesized by a Node script, and both read their timing from one
shared file.

```bash
cd marketing/launch-clip
npm install
npm run score      # → public/score.wav   (synthesize the music + sound design)
npm run captions   # → out/machina-launch.srt
npm run render     # → out/machina-launch.mp4
npm run studio     # interactive editor at localhost:3000
```

## Why it is built this way

**`timeline.mjs` is the single source of truth for TIME.** 96 BPM, 4/4, so one bar
= 2.5s = 75 frames at 30fps. Every scene boundary is a bar line, and the score's
arrangement walks the same bar map: risers land on the bar before a hard cut, the
sub thumps on the frame the card lands. The edit and the music cannot drift,
because neither one owns the clock.

**The UI is rebuilt from the shipped components, not approximated.** `src/theme.ts`
is a verbatim port of `web/app/globals.css` tokens; `src/ui/Brand.tsx` carries the
real `Wordmark`/`CitationGlyph` path data; the capture scene's checklist is the
five real phases from `web/lib/scanPhases.ts`; the type is the same Geist the app
self-hosts. **If a token changes in `globals.css`, change it here too** — a drifted
film is worse than no film.

**The demo content is one coherent research trail** (`src/data/library.ts`), not a
grab-bag. That is load-bearing: the Ask scene's answer is genuinely assemblable
from those specific cards, and the search scene's query — *"why cramming never
sticks"* — shares **not one word** with the three cards it retrieves, which is the
only way that beat proves semantic search rather than ⌘F.

## The edit

| Bars | Time | Scene | What it does |
|---|---|---|---|
| 0–2 | 0:00 | `ColdOpen` | The citation mark assembles; the dot lands on the first impact |
| 2–5 | 0:05 | `Problem` | The generic pile — 1,284 unlabelled saves, then a search that finds nothing |
| 5–7 | 0:12 | `WordmarkScene` | The brackets open and the name resolves between them: **[ MACHINA ]** |
| 7–11 | 0:17 | `Capture` | Article → share sheet → the real five-phase pipeline → a finished card |
| 11–15 | 0:27 | `Library` | The feed, then meaning-search: non-matches collapse, matches gather |
| 15–19 | 0:37 | `AskScene` | **The hero.** Question → streamed answer → three citation chips |
| 19–22 | 0:47 | `GraphScene` | Edges draw in staggered — connections being found, not a diagram revealed |
| 22–24 | 0:55 | `DigestScene` | Collections, then the weekly synthesis + resurface nudge |
| 24–27 | 1:00 | `Endcard` | Icon, wordmark, `Capture. Ask. Connect.` |

The `Problem` scene is deliberately **un-branded** — a generic read-later list, not
Machina's UI. If it wore the app's chrome, the audience would read the failure as
the product's.

## Compositions

- **`MachinaLaunch`** — the deliverable (score + burned-in captions)
- **`MachinaLaunchSilent`** — captions, no score (for a voice-over pass)
- **`MachinaLaunchClean`** — no score, no captions (social cuts, stills, or
  captions laid on in an external editor from the `.srt`)

## The score

`audio/score.mjs` — ~500 lines, no dependencies, deterministic (seeded LCG, so
every render is bit-identical). Pad, sub, Karplus-Strong pluck, bell, kick, hat,
rim, risers, whooshes and impacts, each with its own ADSR and one-pole filter, into
a dotted-8th delay bus and a Freeverb-style tank (8 damped combs → 4 allpasses,
23-sample stereo spread), then tanh saturation and film fades. Progression is
Am9 → Fmaj7 → Cmaj7 → G6 under the whole film, with a per-bar density curve that
brings percussion in for capture, peaks on Ask, and drops to a held pedal tone for
the endcard.

Verify the mix without listening to it:

```bash
node -e '…'   # per-bar RMS/peak — see the session log entry in SOURCE_OF_TRUTH.md §9
```

## Environment notes (hard-won)

- **Remotion cannot download its own Chrome here** (`remotion.media` is not in the
  egress allowlist). `remotion.config.ts` points `setBrowserExecutable` at the
  container's Playwright build. It must be the **headless shell** binary — the full
  `chrome` binary rejects Remotion's old-headless flag.
- **TypeScript must be 5.x.** Remotion's esbuild loader calls `typescript.sys`,
  which TypeScript 7 does not expose from `require`.
- **Fonts are base64-inlined** (`src/fontData.ts`, regenerate with
  `node audio/embed-fonts.mjs`). Google Fonts is unreachable, and *any* pending
  `delayRender` on a page that wedges mid-render kills the whole render — so the
  font registration deliberately blocks nothing. See the comment in `src/fonts.ts`.
- **Concurrency 2.** At 4, a page wedged around frame 512; the frames themselves
  render fine in isolation.

## Swapping the endcard

The line under the rule (`Your knowledge, on iPhone.`) is the one slot meant to
change: replace it with a real App Store badge or URL once the listing is live.
Nothing else in the film claims availability.
