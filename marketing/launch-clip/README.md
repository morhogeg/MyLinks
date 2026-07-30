# Machina — launch film

A 65-second launch film, rendered from code. No editor project, no stock music, no
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
point of light that the brackets close around, and the middle acts follow what the
product actually does, in order: **saving was never the hard part → Machina reads
what you save → summarized, tagged and filed → so you can find it again → then
ask it anything → answers built from what you saved → every save connects to the
rest → nothing worth keeping stays buried.** The film closes on
"Everything you save, finally useful." It deliberately avoids two framings the
owner ruled out: it is **not** a learning app, and it does **not** sell
"search by meaning" as the headline. The word *library* appears nowhere.

## The edit

| Bars | Time | Scene | What it does |
|---|---|---|---|
| 0–1 | 0:00 | `ColdOpen` | **The app booting** — the real `BootScreen`, ported from `web/app/page.tsx` |
| 1–4 | 0:02.5 | `Scatter` | Five platforms drifting apart — Instagram, X, YouTube, WhatsApp, Reading List — then fading out one by one |
| 4–6 | 0:10 | `WordmarkScene` | The five rush back and collapse into one point; the brackets close around it, then open: **[ MACHINA ]** |
| 6–10 | 0:15 | `Capture` | Article → share sheet → the real five-phase pipeline → a finished card |
| 10–14 | 0:25 | `Library` | The feed, then the search that finds it again |
| 14–18 | 0:35 | `AskScene` | **The hero.** Question → streamed answer → three citation chips |
| 18–21 | 0:45 | `GraphScene` | Edges draw in staggered — connections being found, not a diagram revealed |
| 21–23 | 0:52.5 | `DigestScene` | Collections, then the weekly synthesis + resurface nudge |
| 23–26 | 0:57.5 | `Endcard` | The bare mark, the wordmark, `Capture. Ask. Connect.` |

The cold open is the app's own boot sequence, not an invented title card — same
staged arrival (brackets close → the point strikes → only then does the wordmark
arrive), same launch monospace setting for MACHINA, same push-through exit, with
the CSS keyframe delays from `globals.css` converted to frames. **If the boot
screen changes in the app, change it here too.**

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
