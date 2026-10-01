# Machina — launch film

An 80-second launch film, rendered from code. No editor project, no stock music, no
screen recording: the picture is [Remotion](https://remotion.dev) (React → frames),
the score is synthesized by a Node script, and both read their timing from one
shared file.

**The film is graded light, bookends included** (owner call) — the product's
daytime face, white set, ink typography. The cold open runs the shipped
`BootScreen` MOTION (same keyframes, same delays) in the endcard's ink-on-paper
palette rather than the app's graphite ground, so the film opens and closes in
the same light. Act one's loss reads in the same grade: the platform panels
*bleach out* into the paper rather than sinking into black.

The same project builds the **short-form reels** (1080×1920, 15–20s) from a
shared kit; see [Reels](#reels) and [Motion language](#motion-language) at
the end. The film's timeline, captions and voice are untouched by them.

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

**The demo content is one person's actual week, DIVERSE on purpose**
(`src/data/library.ts`, round 13 owner call) — an article on memory, an X thread about AI,
a philosophy video, a travel carousel, an apartment listing, a gift idea, a
workout, an article a friend sent. That diversity is the founding story: one
life produces saves this different, and no single app holds them. One THREAD
still runs through it (the AI/what-stays-human trio: thread + philosophy video
+ Maya's article), because three scenes need internal coherence:
the Ask scene's answer is genuinely assemblable from those three saves;
the search scene's query — *"remembering more from books"* — shares **not one word**
with the ONE card it retrieves ("Why you forget most of what you read"; a single survivor
reads as the app *finding the thing*, where three read as a filter narrowing),
which is the only way that beat proves retrieval rather than ⌘F; and the feed
visibly mixes YouTube, Instagram, X and articles, which is what proves "one
place for all of it" instead of merely captioning it.

**The story is the founder letter's, not a feature list.** The problem is
*fragmentation*, not clutter — things saved across Instagram, X, YouTube,
WhatsApp-to-yourself and Safari tabs, and no memory of which app swallowed
which. So act one ACTS IT OUT: five saves, five separate silos, the piles going
unreadable, and one person opening the wrong pile twice looking for one thing
("quietly disappearing", felt rather than captioned); act two gathers the silos
into one point of light that the brackets close around, and the middle acts
follow what the product actually does, in order: **saving was never the hard part → Machina reads
what you save → summarized, tagged and filed → so you can find it again → then
ask it anything → answers built from what you saved → every save connects to the
rest → nothing worth keeping stays buried.** The introduction names the
product with the App Store subtitle ("Machina. Never lose another great
find."), and the film closes on the tagline, "Everything you save, finally
useful.": problem → Machina → payoff (owner call 2026-09-28; the tagline is
the fixed brand line and is said once, at the end, while the subtitle can
change with search tests). It deliberately avoids two framings the
owner ruled out: it is **not** a learning app, and it does **not** sell
"search by meaning" as the headline. The word *library* appears nowhere.

## The edit

| Bars | Time | Scene | What it does |
|---|---|---|---|
| 0–1 | 0:00 | `ColdOpen` | **The app booting** — the real `BootScreen` motion, in the film's light grade |
| 1–5 | 0:02.5 | `Scatter` | **Scattered saving, as a story**: five save gestures (bookmark / playlist / send-to-self / star / one-more-tab), each flying into its own silo → the piles grow unreadable → **the loss on bar 3** (the film's only minor chord): the wrong pile opened twice |
| 5–7 | 0:12.5 | `WordmarkScene` | The five silos rush back and collapse into one point of ink; the mark closes around it, then pushes through into the product |
| 7–12 | 0:17.5 | `Capture` | **One share sheet, four sources behind it** (the sheet names each one: an Instagram carousel, a YouTube video, a screenshot from Photos, an article) → the five-phase pipeline, held ~5.5s under a push-in → a finished card |
| 12–15 | 0:30 | `Library` | The feed, then the search that finds the one you meant |
| 15–20 | 0:37.5 | `AskScene` | **The hero, five bars.** Question → streamed answer → three citation chips, from three different platforms |
| 20–23 | 0:50 | `GraphScene` | Edges draw in staggered — connections being found, not a diagram revealed |
| 23–26 | 0:57.5 | `CollectionsScene` | The organising that is yours |
| 26–29 | 1:05 | `DigestScene` | The weekly write-up, then the resurfaced save as its own beat |
| 29–32 | 1:12.5 | `Endcard` | The bare mark, the wordmark, the tagline (`Everything you save, finally useful.`), which the voice-over speaks word for word and alone |

`Capture` / `Ask` / `Connect` print as a letterspaced kicker above the line on
their own beats, so a viewer can place each act inside the film's three acts
without being told. (They were the App Store subtitle until 2026-08-26; the
introduction now carries the current subtitle, the endcard the tagline, and
the kickers keep the act names.)

**No em dashes anywhere a viewer can read** — the app-wide ban
(`web/scripts/check-em-dash.mjs`) applies to burned-in captions, demo cards and
the endcard alike, and `npm run verify` fails on one (comments are fine).

The cold open is the app's own boot sequence, not an invented title card — same
staged arrival (brackets close → the point strikes → only then does the wordmark
arrive), same launch monospace setting for MACHINA, same push-through exit, with
the CSS keyframe delays from `globals.css` converted to frames. **If the boot
screen changes in the app, change it here too.**

The `Scatter` scene is a three-beat story (round 13), not a description. Beat A:
a fast run across the five surfaces, each with its own real save gesture — the
tap contacts sit ON the quarter-note grid (`SAVES` in `timeline.mjs`) so the
score ticks every one, and each save flies off into that platform's own silo.
Beat B: the silos sit apart, growing stacks of edge-on, faded, title-less cards
— deliberately unreadable, because that is the honest state of a buried save.
Beat C, **on bar 3, the film's only minor chord**: a fingertip opens the wrong
pile, fans through more unreadable cards, drops it shut, and tries a second
pile — the loss is someone failing to find one thing, not an abstract fade.
Then the piles bleach into the paper and the wordmark's gather answers it.

The scene stays deliberately **un-branded** — no Machina chrome anywhere. If it
wore the app's chrome, the audience would read the failure as the product's.
Platform hues come from the app's own `PLATFORM_RGB` (with one light-grade
exception: X's dark-theme silver vanishes on white, so X wears its light-mode
black), and the glyphs are generic marks (play triangle, bubble, bookmark)
beside the platform's name in type rather than reproductions of anyone's logo.

`CONSTELLATION` in `src/ui/platforms.tsx` is shared by both scenes on purpose:
the silos gather back from exactly where they piled up, because the gather only
reads as an answer if it undoes the same scatter.

## Capture is schematic on purpose

The share sheet slides up **once and stays** while the source behind it
cross-cuts through an Instagram carousel, a YouTube video, a screenshot in
Photos and an article — the sheet's preview row names each one. The screenshot
(added 2026-09-16) is a chat with a friend, the honest reason anyone screenshots
anything, and it is the `gift` card's origin in the demo library; screenshots
became a first-class capture after the film was first cut and the store listing
now opens on "links, screenshots and videos". Showing a single app and then cutting into
Machina proved that Machina can take a link; holding the gesture still while the
world behind it changes proves it takes them from *anywhere*, in the same ten
seconds and without a word of copy.

The same argument then closes itself in the Ask beat: the three citation chips
under the answer are a Nature paper, a YouTube video and an Instagram carousel.

**Every cut is finger-motivated.** A `Tap` fingertip (in `ui/app.tsx`) lands on
the Machina icon ahead of each pulse in the share sheet, and the Ask scene ends
with a tap on the **Graph** chip — the chip presses, the camera dives after it,
and the graph screen arrives as a navigation (its Back-to-Ask / stats / legend
header present from the first frame). The film never cuts because an editor
wanted to; someone on screen always does something first.

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

- **`MachinaLaunch`** — the deliverable (score + burned-in captions, 1920×1080)
- **`MachinaLaunchSilent`** — captions, no score (for a voice-over pass)
- **`MachinaLaunchClean`** — no score, no captions (social cuts, stills, or
  captions laid on in an external editor from the `.srt`)
- **`MachinaLaunchVertical`** — the **1080×1920 portrait edition** (iPhone /
  Reels / Shorts), rendered with
  `npx remotion render src/index.ts MachinaLaunchVertical out/machina-launch-vertical.mp4`
- **`MachinaLaunchVerticalSilent`** — vertical, no score (stills QA)

The vertical editions are the SAME scene code reframed through
`src/film/format.ts` (`useFraming()`): device centred and slightly lower,
product captions as a centred block at the top, the scatter constellation
narrowed and stretched tall, plus per-scene vertical nudges where a shot's
transform origin made the shared focus line miss. Change a scene once and both
formats pick it up.

## The voice-over

A female neural voice (Kokoro `af_heart`, run LOCALLY — no API key, no cloud)
speaks every caption plus a closing line, mixed over the score with 35% ducking
under each line:

```bash
pip install kokoro-onnx soundfile
# one-time model fetch (~350MB, gitignored under out/vo/):
curl -L -o out/vo/kokoro-v1.0.onnx  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o out/vo/voices-v1.0.bin   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
python3 audio/synth-vo.py    # → out/vo/line-NN.wav + manifest.json (asserts each line fits its caption window)
node audio/mix-vo.mjs        # → public/score-vo.wav (music ducked under voice)
```

The VO lines in `audio/synth-vo.py` MIRROR `SUBTITLES` in `timeline.mjs` — if a
caption changes, change it there too (captions stay burned in, so a drifted VO
is instantly audible). `MachinaLaunchVO` / `MachinaLaunchVerticalVO` render the
spoken editions; the plain compositions are untouched. edge-tts (Azure neural
voices) was tried first and is BLOCKED here — the egress proxy refuses
WebSockets — which is why the pipeline is local Kokoro.

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

**The score has a split personality, deliberately:** bar 3 — the loss — is the
ONLY minor chord in the entire film; everything after the turn is I–IV–V
sunshine (C, F, G), every scene opening on the tonic and closing on V. A
four-on-the-floor kick plus off-beat open hats carry the product act, the pulse
doubles to 16ths from the hero scene, a high sparkle pad voice rides over the
product bars, and a quiet keys lead-in sings over capture/library before the
full melody enters with Ask.

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

The endcard carries one line, the tagline `Everything you save, finally
useful.` (wording and comma exact, sentence case), and the closing voice line is
exactly those words and nothing else (owner calls 2026-09-17: screen and voice
agree; 2026-09-28: every launch film ENDS on the tagline). The App Store
subtitle moved to the introduction ("Machina. Never lose another great find.");
it can change with search tests, and a film that ended on it would go out of
date. The tagline is said once per film, never at both ends. `npm run verify`
fails if the film, the reel or a clip ends on anything else or says the
tagline earlier. To change the endcard line, change `Endcard.tsx`, the last
`FILM_LINES` entry in `audio/synth-vo.py`, and the lockup captions in
`reel-timeline.mjs` and `clips/*-timeline.mjs` together (verify ties them), then
re-voice, re-mix and re-render every edition. The space under the line is the
slot for a real App Store badge or URL once the listing is live. Nothing else in
the film claims availability.

# Reels

## The highlight reel (pilot)

`MachinaReel` is an 81.6s vertical reel: the problem → "Introducing Machina."
→ "Never lose another great find." → "Save anything, from anywhere." (shares
from YouTube, Instagram and Safari into the mark) → "A link, a screenshot, or
a note." (the Add dialog's tabs) → "Machina reads it, summarizes it, and files
it." (the five phases) → the new card, opened → Find → Ask → Connect
→ the weekly recap, read → "Machina. Everything you save, finally useful."
(the tagline, since 2026-09-28; it was the subtitle, which now follows the
name, where "All your saves, finally useful." used to be). It has
its own score, the film's narrator and word-timed captions. **Every pixel of
app UI in it is the real, shipped web app**, driven and recorded frame by
frame; nothing is a mockup or a rebuilt screen. The one exception is not
app UI: the share beat (`scenes/ShareBeat.tsx`) is a brand motion graphic,
because the iOS share sheet and the share extension are native and cannot
be captured from the web build. It shows each save as a card wearing its
app's mark (the app's own lucide marks; a compass for Safari) with an iOS
Share button that is tapped, and the card is pulled into the Machina mark.
It rebuilds no iOS UI and shows no third-party image.

**How it got here.** Round 1 (20s) was too fast; round 2 changed too much;
round 3 played round 1 slower with the owner's asks in place; round 4's
variable speed was rejected for a steady pace (round 5: constant 2× on the
beat, 60fps graph); round 6 was the Apple-level pass (the name on the drawn
wordmark, a serif close, focus-in captions). Round 7 (this one, owner):
- the weekly recap was "way too fast": it is now its own 9.6s scene
  (`scenes/Recall.tsx`, output frames) that opens the recap and reads it,
  pausing on the write-up, the themes, the Standout and the closing
  question, with a second line: "The themes of your week, and the one save
  worth rereading.";
- "Save anything, from anywhere.": the Add dialog walks its three real tabs,
  Link → Image ("Up to 5 screenshots become one card") → Note → Link, each
  tapped on a beat, before the link is pasted (`scenes/SaveModes.tsx`, the
  `modes` hold; the save take now records the tabs at 60fps);
- "Introducing Machina. All your saves, finally useful." after the problem
  (the close stays the subtitle);
- key features stay on screen longer: LINGER holds (`adv > 0` in `HOLDS`)
  let a shot keep drifting slowly on the search result, the answer and its
  sources, and the graph, and the card hold is longer; the cut's pace is
  unchanged.

Round 8 (owner: sharing from any app is a key feature; no screen recording):
a `share` hold after the name, three shares (YouTube, Instagram, Safari)
pulled into the mark on "Save anything, from anywhere.", and the Add
dialog's tab tour re-captioned "A link, a screenshot, or a note."

Round 9 (owner QA on round 8): the first share card and the SAVE kicker
arrived while "All your saves, finally useful." was still up; they now wait
for it to leave (share hold 176 frames; `SHARE_STARTS` and the tour's `MODES`
live in `reel-timeline.mjs`, read by the scenes and the score). Save is now
tapped inside the tour (a light tap, visible on the dark button), so the
source clock resumes straight into the phases; before, the tap fell after the
hold and its ring drifted over the phases, and the camera jumped for one frame
at the seam (the `dKeys` key now sits exactly at source 141).

Round 10 (owner: drop the rule beside the chapter words; a finishing pass):
the kickers (SAVE, FIND, ASK, CONNECT, REVISIT) are the word alone, centred
optically (no tracking after the last letter). Finishing fixes from an
every-beat still review: the floated "Saved to Machina" toast no longer
overlaps the app's own (it hands over as the dialog drops) and floats the
settled capture frame with a tight crop (no dark backdrop sliver); Recall
opens on a settled header (the capture's MACHINA → Revisit crossfade was
visible for its first frames); an `end` linger holds the finished end card
~2s instead of ~1s.

Round 11 (owner: the last SAVE line "lingered"; a comprehensive polish):
text is timed to the voice, not to the picture's length. **The dwell rule**:
a line leaves 0.3–1.2s after the narrator finishes it, or up to 4s when it
names an action still playing (`until`); `npm run verify` enforces it with
the synthesized line lengths. Chapter words (kickers) are on screen only with
their chapter's narration, arrive 4 frames before each line, leave in the
line's own 6-frame blur-and-rise on the same frame, and bridge gaps under 24
frames. With the lines no longer covering dead picture, the card hold
(224 → 192) and the found and graph lingers (48 → 32) were trimmed; the end
mark no longer waits as four static corner ticks before its launch.

Round 12 (owner: Revisit should say the app makes an action item where one
is relevant; Connect should say it connects on its own; the Link / Image /
Note tour was jittery):
- **Jitter, found and fixed in the kit.** `AppShot` used to size the slab by
  the zoom (width = 393 × z); Chromium snaps a replaced element's painted size
  to whole pixels, so a slow push rescaled the capture in 1px jumps every few
  frames (measured: the tour changed on alternate frames only). The slab is
  now laid out at a fixed zoom and placed and scaled with ONE transform
  (translate + scale): its left/top offset snapped the same way, a 1px hop
  every ~7 frames on a slow drift. Measured after: the tour changes evenly on
  every frame. Every slow move in the reel is smoother; a frame at rest looks
  the same as before (checked against the previous render).
- **Revisit opens on "Do this"**, the app's own to-do list of the steps it
  wrote for saves that call for one (`web/lib/takeaway.ts`: written only when
  the content supports a concrete action). The recall take is re-shot with
  three such saves carrying their step (the Tail End's, plus the tomato
  sauce and the V60 method; `capture/library.mjs` `takeaway`), and the Tail
  End's row lifts on "When a save calls for action, Machina turns it into a
  to-do." The recap then plays as before (`TODO_LEN` frames later; the first
  read scrolls away the 294pt the list adds).
- The recap's 6pt scroll steps no longer hop: the camera takes up each step's
  rounding, and motion blur follows the NET motion on screen (camera + scroll),
  so text that is barely moving is no longer smeared.
- Connect: "Related saves find each other, all on their own."

Round 13 (a finishing pass with fresh eyes; the script, the order, the
lines and the length are unchanged). Everything below was found by
measuring the render (frame-to-frame differences, phase correlation, 4-frame
strips at every transition, the mix in the speech band), not by eye:
- **Clean cuts.** Ask's two hard cuts (to the composer, to the answer) each
  drew a smeared in-between frame, and the first frame after them was
  motion-blurred too: two camera keys a frame apart were interpolated at the
  half-frames a 2× clock samples, and the velocity for motion blur spanned the
  cut. In the kit now: keys at most a frame apart are a cut (the camera holds,
  then jumps), and `camVelocity` measures the last OUTPUT frame, reading a cut
  forward. Measured after: each cut changes on exactly one frame.
- **The dive keeps its speed.** The dive into the Graph chip froze for one
  frame just before the cut (its last key sat a frame short of it); it now
  ends on the cut. The pull-back, drift and dive before it are one move that
  comes to rest as the finger lands, then accelerates (it used to stop and
  start twice in a second).
- **The card's read-down glides.** The detail view's scroll is captured in
  5pt steps; it hopped 12px on its first frame and then every few frames. The
  camera now takes up each step's rounding, as Recall's recap does.
- **Back on the beat.** Round 11's lingers added 24, 52 and 20 frames, which
  slid everything after them off the grid: the whole Ask hero (the sources,
  the three citation bells, the Graph tap, the impact on the cut into the
  graph) sat on 8ths and 16ths between the kicks, and the Link / Image / Note
  hold started on a 16th (source 141), so its taps did too. The lingers now
  add 32, 48 and 16 (the same total: nothing after the graph moves) and the
  modes hold sits at source 144, where the phases start (they still start on
  the same frame). The share beat's taps and landings are on beats
  (`SHARE_BEAT`). `npm run verify` checks the grid.
- **Taps that cause things.** The card's tap now lands on the frame the app
  opens it and the tick sounds (it landed 4 frames after both). Save is tapped
  8 frames before the phases appear (it was 22: a visible lag).
- **Lines leave, they don't blink.** A line's exit put half its fade on the
  first frame (EASE_MODAL); it is now an 8-frame fade eased in and out.
- **The name breathes.** The mark and wordmark glide up together (eased in and
  out, not a jump off the rest), the lockup pushes in 4% while the name and
  the shares hold (it sat dead still for seconds), and when the brackets part
  the point leaves in one move instead of dropping 70px first.
- **The dialog drop.** The screen behind now stays out of focus until the
  dialog has gone and racks into focus on the feed as the card lands (for
  three frames the fading dialog's text sat over the sharpening feed).
- **The first frame is a picture.** It was white (the reel "opened out of
  white"), which is what a feed or a link preview shows before playing; the
  saves now come into focus from a soft scatter that is already on frame 0.
- **No banding.** The set's soft gradients stepped into faint concentric rings
  one code value apart (Chromium draws gradients in 8 bits), visible at 1:1
  and made blocky by the encoder. A fixed fine dither on the paper (`Dither`
  in `Paper.tsx`, under the app and the type) dissolves them.
- **The sound.** The narrator is now at least 3dB over the music in the
  speech band on every line (500 Hz – 4 kHz, where masking happens). The
  closing line was 3dB UNDER it (the melody's last note landed on "find.") and
  the name barely over it (a shimmer on the word "Machina"): the last note now
  lands after the line, the shimmer after the name, and the music ducks
  further under the two brand lines (`duck` on their captions). The mix is
  mastered for the feeds: −14 LUFS integrated, true peak −1.25 dBTP (it was
  −15.8 LUFS), a gain and a look-ahead limiter in `mix-vo.mjs` (at most 2dB on
  a few transients); the film's mix is byte-identical.

Round 14 (owner: "perfect"; one note, say what Machina does while the phases
tick, using the launch film's line): "Machina reads it, summarizes it, and
files it." now plays over the five phases, the film's own take reused byte
for byte (same voice, same text) and the app's own words in the Add dialog.
It starts on the first phase, so "reads" lands on "Reading the page" and
"summarizes" on "Writing the summary", and "files it" ends as the save
completes; it leaves 1.1s after the voice, as the card settles. The tour's
line stays 6 frames longer so SAVE stays on screen from the tour through the
card (no blink between lines). Measured: the line sits 4.8dB over the music
in the speech band; every gate passes.

Round 15 (owner, on round 14):
- **The caret flickered** in the Add dialog's fields (0:26–0:28) and in
  Find's search field: the text caret blinks on the browser's real clock, not
  the capture's stepped one, so across rolled frames it was on or off at
  random (measured: it toggled on half of the 24 frames after each tab tap).
  `capture/recorder.mjs` now hides the caret in rolled frames; a typed
  character's frame keeps it (a keystroke restarts the blink). Re-captured;
  measured after: the caret region is constant through every roll.
- **Shares come from anywhere.** Each share enters from its own edge and rests
  in its own part of the frame: YouTube from the left to the upper left,
  Instagram from the right to the lower right, Safari up from the bottom to
  below the name (`SOURCES` in `ShareBeat.tsx`); timing and sound unchanged.
- **One face.** The closing line is set in Geist, like every other line (the
  owner asked for a call; see the lockup under "Motion language").

| Output frames | Scene | What it does |
|---|---|---|
| 0–288 | `Hook` | Ten real saves come into focus (0–64); the problem is named over them (the `problem` hold, 64–288): each named save lifts on its word, then all bleach |
| 288–456 | `Hook` | They collapse into the point (320), the brackets snap (336); "Introducing Machina." (the drawn wordmark under the mark), the `name` hold (416–448), "Never lose another great find." (was "All your saves, finally useful." until 2026-09-28) |
| 456–648 | `ShareBeat` | "Save anything, from anywhere.": YouTube, Instagram and Safari saves shared into the mark (the `share` hold) |
| 648–736 | `Hook` → `Save` | The point drops to become the **+** (the iris opens at 688), the + is tapped, Add to Machina |
| 736–880 | `SaveModes` | "A link, a screenshot, or a note.": Link, Image, Note, back to Link, the link pasted, Save tapped |
| 880–1008 | `Save` | "Machina reads it, summarizes it, and files it." over the five real phases, an 8th apart; saved; the dialog drops; the card lands (992) |
| 1008–1200 | `CardDetail` | The new card opened: summary, **Key Points** (the `card` hold) |
| 1200–1360 | `Find` | "easy dinner, empty fridge" → the one card it means (1264; lingers 1280–1320) → tap Ask |
| 1360–1696 | `Ask` | The question → the answer and three sources (1504–1552; lingers 1560–1620) → the dive into the Graph chip |
| 1696–1808 | `Connect` | The real graph (60fps; lingers 1744–1772); tap Revisit |
| 1808–2254 | `Recall` | "Do this" (to 1952), then "This week in Machina", opened (1968) and read slowly: write-up, themes, Standout, question; thrown out into the lockup |
| 2240–2448 | `End` | The mark launches (strike 2284), "Machina" (the wordmark), the tagline "Everything you save, / finally useful." in Geist on two rows, held |

**The clock.** Scenes are written in SOURCE frames (the round-1 cut, 600
frames). `MachinaReel` plays them at `K = 2` via `clockAt(frame)`; `HOLDS`
stop the source clock while an output-frame scene plays (`problem`,
`card`), each starting on a source 8th and lasting whole beats so the grid
holds. `real(src)` places a source event in the output, which is how the
score's sound design follows the picture. Captions, kickers, the narrator
and the lockup are in output frames, each line starting on a beat
(`onBeat`). `CLOCK.perFrame` in `camera.ts` keeps motion blur per output
frame.

Compositions: **`MachinaReel`** (score + narrator + captions, the
deliverable), **`MachinaReelSilent`** (captions, no audio: stills and QA),
**`MachinaReelClean`** (no captions or kickers; the lockup keeps its line).

```bash
cd web && npm ci && cd -          # once: the app's own dependencies
cd marketing/launch-clip && npm install
npm run reel:app      # the real app, built for capture          → out/capture/app
npm run reel:capture  # shoot the four takes (DPR 4, ~150MB)     → public/reel/app/, src/reels/data/takes.json
npm run reel:vo       # the narrator (local Kokoro, see above)   → out/vo/reel/, src/reels/data/reel-vo.json
npm run reel:score    # score + sound design, then the voice mix → public/reel-score-vo.wav
npm run verify        # film AND reel gates (below)
npm run reel:stills   # review stills                            → out/reel-stills/
npm run reel:render   # → out/machina-reel.mp4
```

The narrator's word timings, the takes' data and the mixed audio are
committed, so on a fresh clone a render needs only `reel:app` + `reel:capture`
(the PNGs are gitignored: they regenerate from the app, which is also what
stops the reel drifting away from the shipped UI).

### How the real app is captured

- **`capture/build-app.mjs`** copies `web/` and builds it as a static export
  with the `firebase/*` imports aliased to `capture/shims/`: an in-memory
  Firestore (`store.ts`, reads and listeners resolve on a macrotask so a paused
  clock cannot stall them), auth permanently signed in as a demo user, and
  callables posted to the local server. `web/` itself is not modified.
- **`capture/library.mjs`** is the demo account: 24 real, deliberately
  interesting saves (Wait But Why's *The Tail End*, Mark Manson, Dieter Rams,
  Marcella Hazan, the Webb telescope, a Piranesi screenshot…), 30 edges, five
  collections and today's Daily Brew. No "AI" category or card anywhere.
- **`capture/server.mjs`** serves the build and answers `/api/*` the way the
  backend would: it streams the Ask answer word by word and sends its sources,
  and returns the search hit.
- **`capture/device.mjs`** is an iPhone-sized page: 393×852 points at DPR 4,
  touch, safe-area insets, a 9:41 status bar.
- **`capture/recorder.mjs` + `shoot.mjs`** record four takes (`save`, `find`,
  `ask`, `recall`; `revisit`, the review deck, is kept for the feature
  clips). The page's clock is stepped one frame (33.3ms) at a time
  and CSS animations are paused and seeked, so the app's own motion (the phases
  ticking, the answer streaming, the graph laying itself out, the deck's fling
  and KEEP stamp) is recorded frame-exact. Each frame also records the text on
  screen and the boxes the camera aims at (`src/reels/data/takes.json`).

**What is scripted, and what is not.** Every screen is the app rendering real
data through its real code. What stands in for the backend is scripted: the
answer's text and which cards it cites (`ASK`), the search hit (`SEARCH`),
and the moment each phase completes. The reel shows each phase on its 8th note
rather than at the capture's pace. The app's "Searching your …" thinking line
is never shown, because its wording is banned for reels; `npm run verify`
checks the frames the edit uses.

**Font.** The app asks for `system-ui`, which is SF Pro on an iPhone. SF cannot
be installed here, so fontconfig maps `system-ui` to Inter, the closest open
face (`prepareFonts()` in `device.mjs`). This is a stand-in: on a real iPhone
the same screens render in SF Pro. (While doing this we found that the web app
never applies its self-hosted Geist: `--font-geist-sans` is set on `<body>`,
but the Tailwind font token resolves at `:root`, where the variable doesn't
exist. Logged in `SOURCE_OF_TRUTH.md` §9; `web/` was not changed.)

### Gates (`npm run verify`, reel section)

Fails on: overlapping captions or kickers; a caption the narrator doesn't say
verbatim (or a word count that doesn't match its timing); a voice line that
overruns its caption window; a lockup line that isn't the film's endcard
line, the tagline (and a tagline said anywhere before the close: the film-wide
gate above the reel section); an em dash, a literal
"AI", "second brain" or "library" in any caption, kicker, demo card,
collection, Ask/search string, hook chip, or **any text on any captured frame
the edit uses**; a clipped reel master or a hole in its per-bar level; a voice
sitting more than 3dB lower over the music than it does in the film. Round
13 added: a hold that doesn't start on an 8th or doesn't add whole beats (the
grid); a narrator line less than 3dB over the music in the speech band
(500 Hz – 4 kHz); a reel mix off −14 LUFS by more than 0.5 LU, or with true
peaks over −1 dBTP (`audio/loudness.mjs` measures both, BS.1770).

Nobody has listened to the reel mix on speakers yet (the render box has no
audio device); the balance, the clarity and the loudness are only measured.

## The FIND clip

`MachinaFind` is a 32.5s vertical feature clip that explains Find to someone
seeing it for the first time (owner brief, 2026-09-28: the feature as the
sole subject, a hook on the problem, three to five elements each shown doing
its job and why it matters, Machina named, a concrete takeaway). The reel's
set, type, camera, narrator and lockup, on its own clock
(`clips/find-timeline.mjs`: output frames, the reel's 112.5 BPM and K = 2).
Every pixel of app UI is the real app. `MachinaFindSilent` (no sound) and
`MachinaFindClean` (no captions or kickers) sit beside it.

| Frames | Element (kicker) | What it shows, and the line |
|---|---|---|
| 0–144 | the hook | Home comes into focus; the feed is flicked down (24–84) and back up (84–114), both eased: "You saved it. But what was it called?" (16–100); the camera goes to the field as the narrator names the app, "Machina finds it in your own words." (128–208), the thumb taps it (144) |
| 144–288 | Your own words | "easy dinner, empty fridge" types (160–208) under a rack focus, holds a beat whole, and ONE card lands (224): Marcella Hazan's tomato sauce, which shares no word with it; its ink ring on the next beat |
| 288–432 | Close matches | deleted a word at a time (300); "sardinia swim spot" (320–354): no save says "swim", and the app's "Close matches" offers the one that has the rest, Cala Goloritzé (368). "Only half remember it? You still get what's close." (304–416) |
| 432–576 | Where you saw it | "youtube" (464–476): the Sources row offers YouTube (7) as it types; one tap (496) and the feed is every video saved. "Type where you saw it, and get everything from there." (448–560) |
| 576–688 | Open it | The first video tapped open (576): "Open it for the summary, and everything it connects to." (576–688); on "and" the camera travels down to its related saves (600–660) |
| 688–784 | the takeaway | A cut on the beat to the empty search field: "Type what you remember. Get the one you meant." (688–776); thrown out of frame (768) |
| 784–976 | the close | The reel's lockup: the mark strikes (832), "Machina. Everything you save, finally useful." (848; the tagline, said only here, on ONE row at 48px under the wordmark: owner, 2026-09-29; the reel sets it on two rows at 60px) |

**Finishing pass (2026-09-28).** Measured the full render again (frame
differences, phase-correlation shifts, 4-frame strips at every transition,
caret regions per captured frame, the paper under a contrast stretch, the
mix). One real defect: the hook's scroll started at full speed from rest,
reversed on a single frame and stopped dead at the top (three velocity
kicks). It is now a flick down and back, each eased in and out. The first
try took up the capture's 45pt step rounding with the camera, as Recall
does, and measured as the whole device jiggling ~45px, because here the
fixed chrome is in frame; the scroll is instead re-captured in 5pt steps
(540 frames) and shown at the nearest step: after, the shift per frame
ramps 0 → 5 → 10 → 16px and back with no hop or hold. Checked and left
alone: the one flagged jump is the intended cut to the takeaway (one frame,
the next steady); the other phase-correlation flags sit inside zooms, where
the estimator is unreliable and the frame difference is smooth; the
paper's faint 1-code terraces match the approved reel's exactly (the
dither survives the encode); the caret region is constant across every
rolled frame.

**What the searches claim is checked** (`npm run verify`, against the demo
data and the captured frames): the own-words query shares no word with its
card and finds it alone; the close-match query is answered with its one
card under "Close matches"; the source is offered and one tap shows only its
saves. Two honest limits of the app shaped the choices: sources match by
publisher name only, so the card grid under the Sources row is empty (the app
shows "No matches" there 11 captured frames after the typing; the tap lands
before it), and the opened card shows the summary and related saves (the
detail view has no recipe section). "Search by meaning" stays off the
headline; the app's own "Meaning" badge on the found card is the app
speaking. The queries are `SEARCH.clip` in `capture/library.mjs`.

**One take, beside the clip.** `findClip` in `capture/shoot.mjs` is one
continuous use of Home: the feed scrolled, then the three searches (each
cleared a word at a time, as a held delete key does), the source tapped and
the first video opened; the app's own motion rolled at 60fps. Its frames go
under `public/reel/app/clips/find/` and its data beside the clip,
`src/reels/clips/find/takes.json`, not into the reel's `takes.json` (one
generated JSON line cannot merge across the parallel clip branches); the clip
hands it to the kit with `addTakes` (`kit/takes.ts`).

**Its own files** (the shared scripts only gained a `find` entry):
`clips/find-timeline.mjs`; `src/reels/clips/find/` (`FindClip`, `Search`,
`End`, the take data, `find-vo.json`); `audio/find-score.mjs` →
`public/clips/find/score.wav` (regenerable, ignored); `node audio/mix-vo.mjs
find` → `public/clips/find/score-vo.wav` (committed, mastered like the reel);
`python3 audio/synth-vo.py find` → `out/vo/find/`; `scripts/find-stills.mjs`;
the "find clip" section of `npm run verify`.

```bash
npm run reel:app && CAPTURE_ONLY=findClip npm run reel:capture   # the clip's take (the others keep theirs)
python3 audio/synth-vo.py find                                    # after a line changes
node audio/find-score.mjs && node audio/mix-vo.mjs find           # after a timing change
npm run verify
npx remotion render src/index.ts MachinaFind out/machina-find.mp4
node scripts/find-stills.mjs                                      # review stills → out/find-stills/
```

**Measured, not eyeballed.** Frame-to-frame differences over the whole render
and 4-frame strips at every transition. Found that way and fixed (the camera
rules below): a drift that stopped dead for a push, a rack focus that lost
2px of focus in one frame, a Lift fighting the app's own spring, and a Lift
whose removal (or whose lift reaching exactly 0) re-rastered the card on a
still frame. After: no one-frame freeze or jump anywhere outside the typing
and the scroll. Each tap's pad lands on the frame the app responds and its
tick sounds; the narrator sits 4.2–7.1dB over the music in the speech band;
the mix is −14.0 LUFS, −1.25 dBTP (−1.33 after the render's AAC). Nobody has
listened to it on speakers.

## Motion language

The rules every Machina video follows, and the kit component that implements
each (`src/reels/kit/`). A new reel is a timeline file, a set of takes and a
few scenes built from these parts; it should not need new motion primitives.

### Palette and grade

Light only: **ink on paper**. The set is the film's paper (`SET_BG`, a shade
under the app's `#F9FAFB` so a white screen still separates), lit by
**`Paper`** (a daylight pool where the type lives, a lift behind the product,
two slow cool pools, dithered by **`Dither`** so its soft gradients never band
into rings) and finished by **`Lens`** (the film's grain and a whisper
of vignette). Colour comes only from the app's own pixels (category pills,
platform marks) and the app's tokens (`PLATFORM_INK` in `SaveChip`); the
reel's own type is `INK`/`INK_SOFT`. Emphasis is a lift and an ink ring
(**`Lift`**), never a recolour. Where the app itself would darken the frame
(the Add dialog's black scrim), the element is **lifted off its screen**
(`AppShot` `crop`) instead, so the grade never flips. Never: dark flips,
neon, glow, glitch, chromatic aberration, colour casts.

### Type

One family, Geist. Two voices (**`Type.tsx`**):

- **The line (`KineticLine`)** is what the narrator says: 56px, 1.12 leading,
  weight 600, −0.028em, at most two lines in a 980px measure (about ten
  words). Each LINE arrives when the narrator reaches its first word (the
  measured timing); its words cascade 1.5 frames apart, each coming into
  focus (12px blur → sharp, a 0.28em lift, `EASE_MODAL`, 7 frames). The line
  leaves as one, an 8-frame soft-focus fade eased in and out (round 13: never
  a fast-start curve on an exit, it reads as a blink), finishing on the caption's end
  frame. Never a mask rise, never a lone word parked at the left edge.
  `\n` is a hard break; `sizes` sets a size per line.
- **The kicker (`Kicker`)** names the chapter (SAVE / FIND / ASK / CONNECT /
  REVISIT): 25px, weight 650, uppercase, tracking settling 0.62→0.44em,
  letters coming into focus 0.8 frames apart, the word alone (no rule).
  It is on screen only while its chapter's narration is: in 4 frames before
  each line, out WITH the line in the line's own gesture, gaps under 24
  frames bridged. Restraint is the point: the energy of a cut belongs to the
  picture.
- **The dwell rule.** Text is timed to the voice, never stretched to fill a
  shot: a line leaves 0.3–1.2s after the narrator finishes it. A line that
  names an action still playing may stay until that action lands, at most
  4s past the voice, and says so in the timeline (`until`). When the words
  are done the picture carries on alone; if that leaves a dead stretch, the
  shot is too long, so trim the hold rather than keep the text. `npm run
  verify` enforces the rule.
- **The lockup (`Lockup` in `Brand.tsx`)** uses the drawn wordmark, never typed
  letters. The closing line is a statement (`lineStyle="statement"`): the
  tagline in Geist at 60px, broken into rows at its comma by the `\n` in the
  caption (round 15: the reel's one face; the round-6
  display serif was the only other face in 81 seconds and read as a font
  change, not as emphasis), words coming into focus on the narrator's
  timing, the wordmark wiping in as "Machina" is said.

Layout (**`Captions.tsx`**): `SLOTS` puts the kicker at 290px and the line at
346px, in the upper band clear of Reels/TikTok chrome (which covers roughly
the top 12% and the bottom quarter). Every line lives there, the hook's
tagline included: it sits above the mark, because the mark's point leaves
downward to become the + button and must not cross type. **Type never sits
on UI:** `BandScrim` fades any app screen that rises into the band (opaque
to 510px, clear by 720px), and shots aim their subjects below 720px.
Anything that holds is rounded to whole pixels (the film's shimmer lesson).

### Curves (`curves.ts`): each one has a job

| Curve | Value | Job | In the pilot |
|---|---|---|---|
| `EASE_MODAL` | `cubic-bezier(0.32, 0.72, 0, 1)`, the app's `--ease-modal` | arriving and settling | caption words, camera landings, the dialog arriving, the wordmark wipe |
| `EASE_SPRING` | `cubic-bezier(0.34, 1.56, 0.64, 1)`, the app's `--ease-spring` | physical arrivals (the only overshoot) | brackets snapping shut, the ink point, chips and the new card lifting |
| `EASE_FLING` | `cubic-bezier(0.22, 1, 0.36, 1)`, the deck's own fling | things thrown | caption exits, the dialog dropping away into the feed |
| `EASE_IN_OUT` | `cubic-bezier(0.65, 0, 0.35, 1)` | travel between two holds | feed → search field, answer → sources, the iris, the point's travel |
| `EASE_GATHER` | accelerating, cubic-in | moves that must end at speed | the saves collapsing; a camera diving into a hard cut |

Linear is for one thing only: a slow drift under a hold, so a held shot is
never dead still.

### Transition vocabulary

In order of appearance; nothing outside this list.

1. **Match cut by shape.** The gathered point of ink travels to where the +
   button will be and becomes it (`Hook` → `Save`, timed in
   `scenes/handoff.ts`).
2. **Iris.** The + button opens into its screen (`AppShot` `iris`).
3. **Lift.** An element leaves its screen with its own depth: the Add dialog
   (`AppShot` `crop`), the new card, the citation chips (`Lift`).
4. **Same-pixels hand-over.** Two takes that show the same screen swap under
   one camera, which makes the swap invisible (`Save` rides `findKeys` until the
   search tap). **Never dissolve between two takes:** they double-expose.
   **Open the thing:** a tap on an element and the app's own transition into
   it (the new card → its detail view; the recap banner → the recap).
5. **Cut on the beat.** A hard cut on a beat line or an 8th (Find → Ask, the
   composer, the answer, Connect → Recall, the card's detail back to the feed). Two camera
   keys at most a frame apart are the cut: nothing is drawn between them, and
   `camVelocity` reads a cut forward, so the first frame of a new shot is sharp.
6. **Dive into a cut.** The camera accelerates into the tapped element
   (`EASE_GATHER`) and cuts on the downbeat to *inside* the next screen, which
   fills the frame and pulls back (`EASE_MODAL`): Ask's Graph chip → the graph.
7. **Throw out.** The camera throws the last screen out of frame
   (directional motion blur) into the lockup (`Recall` → `End`).

Every change of screen is motivated by a finger: a `Tap` (the reel's one
piece of added UI, since iOS draws no touches) lands on the element that
causes it, and the cut lands on the touch.

### Pacing (`clock.ts`, `reel-timeline.mjs`)

The cut is written at 112.5 BPM (16 frames a beat) and played at ONE steady
speed, 2× (owner, round 5: "keep a steady pace"; a variable speed was
rejected). The score runs at the same 112.5 BPM on the output clock, so a
source 8th is an output beat: **cuts, taps and sound design land on the
beat, and every narrator line starts on one.** Any app motion the reel
shows must be captured at 60fps so it does not step at this speed. A caption stays up until its line has been
spoken and its last word has landed (verify fails a voice line that overruns
its caption). Motion blur is what a 180° shutter would give (σ ≈ 0.14 × px
per frame, directional, capped at 10px) and never appears on a hold.

**The grid rule (round 13).** A hold (`HOLDS`) may start on an 8th, but what
it adds to the output (`len − adv × K`) must be whole beats, or everything
after it slides off the beat while still looking "in sync" with the sound
design (which follows the picture). A linger that shows a moment longer is
lengthened by a beat, never by a few frames. `npm run verify` fails a hold
that breaks it.

### Camera (`camera.ts`, `AppShot`)

- **Aim by screen point.** A key names a point of the app's 393×852 screen
  (`cx`, `cy`), where it goes in the frame (`fx`, `fy`) and the zoom `z` in px
  per point. Boxes come from the capture (`rectOf`), so a shot targets "the
  chips" or "the search field" by name. Zoom interpolates in log space and
  stays at or under the capture's DPR (4), so the app is never upscaled soft.
- **Close-ups are 2D.** 3D tilt (under 10°) is for establishing moves only:
  Home after the iris, the graph pull-back, the Revisit tab. It settles out
  before anything must be read.
- **A dive lands inside the app.** The first frame after a dive's cut is
  filled edge to edge by the next screen; the floating slab, its shadow and
  its display radius (`SCREEN_RADIUS`, 55pt) appear as the camera pulls back.
- **Rack focus** (`AppShot` `focus`) keeps the eye on what matters, e.g. the
  typed query over the app's live suggestions.
- **A cut is two keys at most a frame apart** (round 13): `camAt` holds the
  first and jumps to the second, never interpolating between them (a slowed
  clock samples half-frames), and `camVelocity` measures what moved since the
  last OUTPUT frame, reading a cut forward. A dive's last key sits ON its cut,
  so it is still at speed on the frame before it.
- **A move that starts from rest eases in** (EASE_IN_OUT); EASE_MODAL's fast
  start is for arrivals that already carry speed, or a camera answering a tap
  on the frame the app responds.
- **A stepped capture never hops.** When the app scrolls in captured steps
  (the card's read-down, the recap), the camera takes up each step's rounding
  and motion blur follows the net motion (camera + scroll).
- **A stepped scroll with chrome in frame is captured fine** (the FIND
  clip, measured). The camera can take up a stepped capture's rounding only
  in a close-up: with the header or the device's edge in frame, the whole
  device jiggles by up to a step. There, capture in steps small enough
  (5pt) that the nearest step never shows as a hop at the ease's slow ends.
- **A tilt ends on a change** (the FIND clip, measured). The frame a 3D tilt
  reaches 0 the slab re-rasters as 2D: on a still shot that is a visible
  one-frame change across the whole screen. Let the tilt finish on a frame
  that already changes (a tap, a cut) or mid-move, not as the camera comes to
  rest.
- **Rack focus eases in and out.** Pulling focus onto a field is travel
  between two states (EASE_IN_OUT); on a fast-start curve the rest of the
  screen lost 2px of focus in one frame. Letting go of it as a result lands
  is an arrival, and may be quick.
- **Emphasis waits for the app's own arrival.** When the app animates an
  element in (a result's card-enter spring), that IS the landing; the Lift
  and ink ring follow on the next beat, once it has settled, on its settled
  box. A second spring on top hung a frame at its overshoot, and a Lift that
  followed the settling element hopped: capture boxes are measured to half a
  point. A Lift is its own raster: keep it mounted (at a lift of at least
  0.002) until the screen changes anyway; removing it, or letting it reach
  exactly 0, re-rasters the element on a still frame.

### Sound to picture (`HITS`, `audio/reel-score.mjs`)

Every sound-design event is keyed to a named frame in `HITS` that the picture
also uses: a tick on each tap, a whoosh on the dive, an impact where the point
lands, on the cut into the graph and on the lockup's strike. **Risers end on
the reveal they lead into** (`RISERS`). One chord per bar
(`BAR_CHORDS`), from the film's instruments (`audio/synth.mjs`, shared), so the
reels and the film sound like one brand. Move a `HITS` frame and the picture
and the sound move together (the share beat's `SHARE_BEAT` and the tour's
`MODES` work the same way inside their holds). **A tap lands on the frame the
app responds and the tick sounds** (the pad touches at 35% of the `Tap`
gesture). **Nothing sounds on a word the narrator has to land:** a melody note
or a shimmer goes after the word, not on it (round 13).

### Narrator (`audio/synth-vo.py reel`)

One voice config for everything Machina says (Kokoro `af_heart`, speed 0.95,
"Machina" spoken "Makeena"). **The captions are the script:** the reel's lines
are read from `CAPTIONS` in `reel-timeline.mjs` and spoken verbatim, one line
per caption. The reel names Machina with the App Store subtitle and closes on
the tagline (owner call 2026-09-28: every film ends on the tagline, said once)
in short lines with air around them. Word timings are measured from the
synthesized audio (`src/reels/data/reel-vo.json`) and drive the kinetic type
and the lockup's line. The mix ducks the score to 0.55 under the voice
(the film uses 0.65); that puts the reel's voice at the film's
voice-over-music balance, which verify measures. The two brand lines (the
name and the promise) duck it to 0.4 (`duck` on their captions). Verify also
holds every line at least 3dB over the music in the speech band, and the
finished mix is mastered to the feeds' −14 LUFS, true peak ≤ −1 dBTP
(`mix-vo.mjs reel`: a gain, then a look-ahead limiter; `audio/loudness.mjs`).

### Brand bans

Enforced by `npm run verify` where a machine can check:

- no literal **"AI"**, no **"second brain"**, and never the word **"library"**,
  on screen or in voice (verify);
- no em dashes in captions, voice or demo strings (verify);
- not a learning app, and "search by meaning" is not the headline (Find says
  "in your own words");
- **no mockups:** app pixels only come from captures (`AppShot` takes nothing
  else); the only added UI is the `Tap`;
- no third-party frames or thumbnails (demo cards hide thumbnails); platform
  marks only as the app draws them;
- the real wordmark and glyph only (`Brand.tsx` wraps `ui/Brand.tsx`'s shipped
  path data);
- nothing claims App Store availability.
