# Machina — launch film

An 80-second launch film, rendered from code. No editor project, no stock music, no
screen recording: the picture is [Remotion](https://remotion.dev) (React → frames),
the score is synthesized by a Node script, and both read their timing from one
shared file.

**The film is graded light** (owner call) — the product's daytime face, white set,
ink typography. The one deliberate exception is the cold open: the shipped
`BootScreen` is fixed graphite regardless of theme, so the boot stays dark and its
push-through exit is the moment the film blooms into the light. Act one's loss
runs the same logic in reverse: the platform panels *bleach out* into the paper
rather than sinking into black.

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
| 0–1 | 0:00 | `ColdOpen` | **The app booting** — the real `BootScreen`, ported from `web/app/page.tsx` (deliberately dark) |
| 1–4 | 0:02.5 | `Scatter` | Five platforms drifting apart — Instagram, X, YouTube, WhatsApp, Reading List — then bleaching out one by one |
| 4–6 | 0:10 | `WordmarkScene` | The five rush back and collapse into one point of ink; the mark closes around it, then pushes through into the product |
| 6–11 | 0:15 | `Capture` | **One share sheet, three sources behind it** (the sheet names each one) → the five-phase pipeline, held ~5.5s under a push-in → a finished card |
| 11–15 | 0:27.5 | `Library` | Browse, search, filter — even from half a memory |
| 15–20 | 0:37.5 | `AskScene` | **The hero, five bars.** Question → streamed answer → three citation chips, from three different platforms |
| 20–23 | 0:50 | `GraphScene` | Edges draw in staggered — connections being found, not a diagram revealed |
| 23–26 | 0:57.5 | `CollectionsScene` | The organising that is yours |
| 26–29 | 1:05 | `DigestScene` | The weekly write-up, then the resurfaced save as its own beat |
| 29–32 | 1:12.5 | `Endcard` | The bare mark, the wordmark, `Capture. Ask. Connect.` |

`Capture` / `Ask` / `Connect` print as a letterspaced kicker above the line on
their own beats, so a viewer can place each act inside the tagline without being
told.

The cold open is the app's own boot sequence, not an invented title card — same
staged arrival (brackets close → the point strikes → only then does the wordmark
arrive), same launch monospace setting for MACHINA, same push-through exit, with
the CSS keyframe delays from `globals.css` converted to frames. **If the boot
screen changes in the app, change it here too.**

The `Scatter` scene is deliberately **un-branded** — five generic platform
surfaces, no Machina chrome anywhere. If it wore the app's chrome, the audience
would read the failure as the product's. Platform hues come from the app's own
`PLATFORM_RGB` (with one light-grade exception: X's dark-theme silver vanishes on
white, so X wears its light-mode black), and the glyphs are generic marks (play
triangle, bubble, bookmark) beside the platform's name in type rather than
reproductions of anyone's logo.

`CONSTELLATION` in `src/ui/platforms.tsx` is shared by both scenes on purpose: the
panels gather back to exactly where they drifted out from, because the gather only
reads as an answer if it undoes the same scatter.

## Capture is schematic on purpose

The share sheet slides up **once and stays** while the source behind it
cross-cuts through an Instagram carousel, a YouTube video and an article — the
sheet's preview row names each one. Showing a single app and then cutting into
Machina proved that Machina can take a link; holding the gesture still while the
world behind it changes proves it takes them from *anywhere*, in the same ten
seconds and without a word of copy.

The same argument then closes itself in the Ask beat: the three citation chips
under the answer are a Nature paper, a YouTube video and an Instagram carousel.

**The pipeline is a shot, not a transition.** The five phases from
`web/lib/scanPhases.ts` run for ~5.5 seconds under a hard 2D push-in — about a
second per phase, which is what it takes to actually read them. It is the one
place the film shows what pressing *share* bought you, so it gets the time and
the screen size, under a single heading.

## Framing: magnified, and aimed

Product shots run **1.4–2.0×** and deliberately crop the device top and bottom —
a whole handset in shot is unreadable on a phone, which is where this film will
mostly be watched. Because the device is cropped, every shot has to AIM:
`focusY(screenY, scale)` in `film/anim.ts` puts a chosen point of the screen at a
chosen point of the frame, so a scene targets the checklist, or the answer and
its chips, or the card stack — rather than zooming and hoping.

## The graph is the shipped design

`GraphScreen` is ported from `KnowledgeGraph.tsx`'s canvas drawing, not
approximated: node bodies are the **category colour** with a lit top-left radial
and a 0.35-alpha ring; edges are **muted grey** at 0.13–0.35 (the app only
colours an edge when a selection lights it); the canvas sits in a rounded
hairline container over `radial-gradient(120% 100% at 50% 38%, var(--card),
var(--background) 88%)`; labels are 11px in `textSecondary` with a **card**-toned
halo stroke — the app's own QA note explains that a background-toned halo smears
ghost shapes around glyphs.

## Captions are a layout, not a subtitle track

Product beats hold the device **right of centre** (`BASE_X`) and set the line in
a **left column** against a short accent rule; beats with no device (the scatter,
the turn) keep a centred line. Which one a cue uses is declared per cue as
`place` in `timeline.mjs`. Type centred under the device sat in its shadow and
made the whole film read as something with subtitles burned on.

All caption motion lands on whole pixels — sub-pixel translation makes Chromium
re-rasterize the glyphs every frame, which shimmers at this size.

## Where the name appears

**Twice, deliberately: small at the start, big at the end.** The boot is the app
launching; the endcard is the lockup. The turn at bar 4 used to resolve into a
third `[ MACHINA ]`, which made the name land three times in 65 seconds — it now
closes on the mark holding what it gathered and pushes through into the product,
the same gesture the boot exits on.

## Compositions

- **`MachinaLaunch`** — the deliverable (score + burned-in captions)
- **`MachinaLaunchSilent`** — captions, no score (for a voice-over pass)
- **`MachinaLaunchClean`** — no score, no captions (social cuts, stills, or
  captions laid on in an external editor from the `.srt`)

## The score

`audio/score.mjs` — no dependencies, deterministic (seeded LCG, so every render
is bit-identical). Pad, moving sub bass, a detuned saw **pulse** (the engine), an
**FM electric piano** for the melody, plus kick, clap, hat, shaker, rim, risers,
whooshes and impacts — each with its own ADSR and one-pole filter, into a
dotted-8th delay bus and a Freeverb-style tank (8 damped combs → 4 allpasses,
23-sample stereo spread), then tanh saturation and film fades.

**Do not put a plucked string back in.** An earlier cut used Karplus-Strong for
the rhythmic figure, playing chord-tone-only arpeggios into a long reverb — which
is, acoustically, a koto, and it got (correctly) described as sounding Chinese.
Two things had to change together: the instrument, and the note choice. The pulse
figure walks scale degrees **0-2-3-4-6**, which puts E→F and B→C in the line;
degrees 0-2-4-5 (C E G A) are still pentatonic no matter what plays them. Progression is
**C major**, walked C → G → Am → F (I–V–vi–IV) under the whole film, ending
resolved at home on C. The same four chords walked Am → F → C → G is the same
harmony and a completely different mood — that ordering is what made an earlier
cut read as gloomy. Per-bar density brings percussion in for capture, peaks on
Ask, and drops to a held C pedal for the endcard.

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
- **`lucide-react` is pinned to 0.563.0** — the version `web/` uses. Later
  majors (the film had drifted to 1.x) dropped the brand icons entirely, so
  YouTube/Instagram/Facebook marks silently vanish. The film uses the app's own
  icons, so it has to track the app's version.
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

The line under the rule (`Everything you save, finally useful.`) is the one slot
meant to change: replace it with a real App Store badge or URL once the listing is
live. Nothing else in the film claims availability.
