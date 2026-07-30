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
npm run verify     # caption-overlap check + per-bar mix analysis (run before rendering)
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
grab-bag. That is load-bearing three times over: the Ask scene's answer is
genuinely assemblable from those specific cards; the search scene's query —
*"why cramming never sticks"* — shares **not one word** with the three cards it
retrieves, which is the only way that beat proves semantic search rather than ⌘F;
and the feed visibly mixes YouTube, Instagram, X and articles, which is what
proves "one place for all of it" instead of merely captioning it.

**The story is the founder letter's, not a feature list.** The problem is
*fragmentation*, not clutter — things saved across Instagram, X, YouTube,
WhatsApp-to-yourself and Reading List, and no memory of which app swallowed
which. So act one scatters those five surfaces across the frame and lets them
drift apart and fade ("quietly disappearing"), act two gathers them into one
point of light that the brackets close around, and the middle act's claim is
"saving was never the hard part — Machina *reads* what you save." The closing line
is the letter's belief: recalling it is how you learn it.

## The edit

| Bars | Time | Scene | What it does |
|---|---|---|---|
| 0–2 | 0:00 | `ColdOpen` | The citation mark assembles; the dot lands on the first impact |
| 2–5 | 0:05 | `Scatter` | Five platforms drifting apart — Instagram, X, YouTube, WhatsApp, Reading List — then fading out one by one |
| 5–7 | 0:12 | `WordmarkScene` | The five rush back and collapse into one point; the brackets close around it, then open: **[ MACHINA ]** |
| 7–11 | 0:17 | `Capture` | Article → share sheet → the real five-phase pipeline → a finished card |
| 11–15 | 0:27 | `Library` | The feed, then meaning-search: non-matches collapse, matches gather |
| 15–19 | 0:37 | `AskScene` | **The hero.** Question → streamed answer → three citation chips |
| 19–22 | 0:47 | `GraphScene` | Edges draw in staggered — connections being found, not a diagram revealed |
| 22–24 | 0:55 | `DigestScene` | Collections, then the weekly synthesis + resurface nudge |
| 24–27 | 1:00 | `Endcard` | The bare mark, the wordmark, `Capture. Ask. Connect.` |

The `Scatter` scene is deliberately **un-branded** — five generic platform
surfaces, no Machina chrome anywhere. If it wore the app's chrome, the audience
would read the failure as the product's. Platform hues come from the app's own
`PLATFORM_RGB`, and the glyphs are generic marks (play triangle, bubble, bookmark)
beside the platform's name in type rather than reproductions of anyone's logo.

`CONSTELLATION` in `src/ui/platforms.tsx` is shared by both scenes on purpose: the
panels gather back to exactly where they drifted out from, because the gather only
reads as an answer if it undoes the same scatter.

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

There is no audio device in the render environment, so the mix is verified
numerically — `npm run verify` prints per-bar RMS and peak, DC offset and a
near-clip count, and fails on a clipped master or a bar sitting >3.5dB below its
neighbours (a hole that size reads as the music stopping). It also asserts no two
captions ever overlap, which a still review cannot catch.

**Someone still has to listen to it before it ships.**

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

The endcard is the **bare** Citation mark — not the app-icon tile.
`docs/BRANDING.md` makes the same call for the app header ("a rounded container
there reads as a shrunken app icon rather than as the brand mark"), and full-frame
the grey squircle read as a screenshot of an icon instead of as an identity.

The line under the rule (`Recalling it is how you learn it.`) is the one slot
meant to change: replace it with a real App Store badge or URL once the listing is
live. Nothing else in the film claims availability.
