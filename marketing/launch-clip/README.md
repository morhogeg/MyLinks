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
rest → nothing worth keeping stays buried.** The film introduces Machina with
the App Store subtitle, "Never lose another great find.", and closes on the
tagline, "Everything you save, finally useful.": problem → Machina → payoff
(owner decision 2026-09-28: the tagline is the fixed brand line and ends every
film, once; the subtitle can change with search tests, so no film ends on
it). It deliberately avoids two framings the
owner ruled out: it is **not** a learning app, and it does **not** sell
"search by meaning" as the headline. The word *library* appears nowhere.

## The edit

| Bars | Time | Scene | What it does |
|---|---|---|---|
| 0–1 | 0:00 | `ColdOpen` | **The app booting** — the real `BootScreen` motion, in the film's light grade |
| 1–5 | 0:02.5 | `Scatter` | **Scattered saving, as a story**: five save gestures (bookmark / playlist / send-to-self / star / one-more-tab), each flying into its own silo → the piles grow unreadable → **the loss on bar 3** (the film's only minor chord): the wrong pile opened twice |
| 5–7 | 0:12.5 | `WordmarkScene` | The five silos rush back and collapse into one point of ink; the mark closes around it ("Introducing Machina. Never lose another great find."), then pushes through into the product |
| 7–12 | 0:17.5 | `Capture` | **One share sheet, four sources behind it** (the sheet names each one: an Instagram carousel, a YouTube video, a screenshot from Photos, an article) → the five-phase pipeline, held ~5.5s under a push-in → a finished card |
| 12–15 | 0:30 | `Library` | The feed, then the search that finds the one you meant |
| 15–20 | 0:37.5 | `AskScene` | **The hero, five bars.** Question → streamed answer → three citation chips, from three different platforms |
| 20–23 | 0:50 | `GraphScene` | Edges draw in staggered — connections being found, not a diagram revealed |
| 23–26 | 0:57.5 | `CollectionsScene` | The organising that is yours |
| 26–29 | 1:05 | `DigestScene` | The weekly write-up, then the resurfaced save as its own beat |
| 29–32 | 1:12.5 | `Endcard` | The bare mark, the wordmark, the tagline (`Everything you save, finally useful.`), which the voice-over speaks word for word and alone |
| 29–32 | 1:12.5 | `Endcard` | The bare mark, the wordmark, the tagline (`Everything you save, finally useful.`), which the voice-over speaks word for word and nothing else |

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
useful.` (exact wording, comma and full stop, set in sentence case), and the
voice-over speaks exactly those words and nothing else (owner call 2026-09-17:
screen and voice agree). Owner decision 2026-09-28: every film ENDS on the
tagline and uses it once; the App Store subtitle `Never lose another great
find` moved to the introduction beat ("Machina. Never lose another great
find."), because the subtitle can change with search tests and would date
every posted film. `npm run verify` checks the tagline is the reel's last line
and appears once, and that the film uses it only on the endcard. The space
under the line is the slot for a real App Store badge or URL once the listing
is live. Nothing else in the film claims availability.

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
`MachinaReel` is an 80.5s vertical reel: the problem → "Introducing Machina."
(round 16: no promise line under the mark; straight on to the shares) → "Save anything, from anywhere." (shares
from YouTube, Instagram and Safari into the mark) → "A link, a screenshot, or
a note." (the Add dialog's tabs) → "Machina reads it, summarizes it, and files
it." (the five phases) → the new card, opened → Find → Ask → Connect
→ the weekly recap, read ("And every week…": the "And" is voice only) → the
lockup, "Machina." then "Everything you save, finally useful." It has
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
| 288–424 | `Hook` | They collapse into the point (320), the brackets snap (336); "Introducing Machina." (the drawn wordmark under the mark) |
| 424–600 | `ShareBeat` | "Save anything, from anywhere.": YouTube, Instagram and Safari saves shared into the mark (the `share` hold) |
| 600–688 | `Hook` → `Save` | The point drops to become the **+** (the iris opens at 640), the + is tapped, Add to Machina |
| 688–832 | `SaveModes` | "A link, a screenshot, or a note.": Link, Image, Note, back to Link, the link pasted, Save tapped |
| 832–960 | `Save` | "Machina reads it, summarizes it, and files it." over the five real phases, an 8th apart; saved; the dialog drops; the card lands (944) |
| 960–1152 | `CardDetail` | The new card opened: summary, **Key Points** (the `card` hold) |
| 1152–1312 | `Find` | "easy dinner, empty fridge" → the one card it means (1216; lingers 1232–1272) → tap Ask |
| 1312–1648 | `Ask` | The question → the answer and three sources (1456–1504; lingers 1512–1572) → the dive into the Graph chip |
| 1648–1760 | `Connect` | The real graph (60fps; lingers 1696–1724); tap Revisit |
| 1760–2206 | `Recall` | "Do this" (to 1904), then "This week in Machina", opened (1920) and read slowly: write-up, themes, Standout, question; thrown out into the lockup |
| 2192–2416 | `End` | The mark launches (strike 2236), "Machina." said as the wordmark wipes in (round 16), then the tagline "Everything you save, finally useful." in Geist (spoken word for word), held |

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
| 576–688 | Open it | The first video tapped open (576): "Open it for the summary, and everything it connects to." (576–672; re-voiced 2026-10-21, the old take stumbled on "connects to"); on "and" the camera travels down to its related saves (600–660) |
| 688–784 | the takeaway | A cut on the beat to the field and one more own-words search, its own take (`findTakeaway`): "red shrine, sunrise" (688–724), and Fushimi Inari at dawn lands alone (736) with its ink ring: "Type what you remember. Get the one you meant." (688–776; owner 2026-10-21: the empty field it used to show said nothing, and not the first search again); thrown out of frame (768) |
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

**Its voice (2026-10-04, owner).** Gemini TTS, voice Sulafat
(`gemini-3.8-flash-tts`), not the film's Kokoro: each video gets its own tone,
and this one is relatable frustration turning into relief. Every caption
carries its acting note (`style`) and the clip's pace note (`pace`) in
`clips/find-timeline.mjs`. A line changed or re-directed needs a new take:
the raw takes are voiced on GitHub (`.github/workflows/narration-tts.yml`, the
repo's `GEMINI_API_KEY`) by committing `audio/narration-request.json` with its
`run` bumped, and land in `audio/vo-takes/` (keyed by text and direction);
`synth-vo.py find` then builds the lines from them offline. The shared daily
quota is 100 requests, one per line. The reads ran faster than directed
(about 160 to 340 words a minute), so the captions were re-timed to them:
each leaves 0.47 to 0.6s after its last word and the picture carries on. The
score keeps its noise sounds (hats, shakers, whooshes, risers) out from under
the voice. This container's ffmpeg has no Rubber Band, so a line's `tempo`
cannot be applied here.

```bash
npm run reel:app && CAPTURE_ONLY=findClip npm run reel:capture   # the clip's take (the others keep theirs)
python3 audio/synth-vo.py find                                    # after a line changes (from the takes)
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
tick sounds; the narrator sits 8.1–17.0dB over the music in the speech band
(the Gemini voice, noise sounds kept clear of it); the mix is −14.0 LUFS,
−1.25 dBTP. Nobody has listened to it on speakers.

## SAVE THIS (the organic Reel)

`MachinaSaveThis` is a 29.4s vertical Reel built for Instagram, not a
feature explainer. **The idea: the reel saves itself.** It opens by
predicting that the viewer will save this video, "right down there,
buried with everything else you saved, and never watch it again" (round
16's order: "Unless" answers "never"). The save falls into a well of
every other save, all grey. "Unless you
save it to Machina" floods them with the app's category colours and
gathers them into the mark, and the real app reads the reel, sums it up,
files it by topic, and shows it on its graph tied to two earlier saves
(round 17: reached the app's own way, the card's ⋯ menu, "See in graph",
the card shrinking into its dot).
"Now every save is one question away." (rounds 10 to 12, the bridge, over
Ask's opening screen), "So, ask it anything, and get the answer, with the
proof.": a real question about the three saves the graph just tied
together ("What connects my 3 saves about procrastination?", round 12)
answered from them, every source cited, this reel among them. The problem
is said once, at the top, and everything after "Unless" answers it (owner,
round 9: restating the problem after the solution made the order read
problem, solution, problem). The sign-off is the app's own mark drawing
in on paper (round 12: not over the Ask chat), the wordmark on the spoken
name, the tagline under it on one line; the logo holds to the last frame
under "This time, you'll watch it again." (round 13: the logo, not the
poster), and the loop cuts from it, on the beat, back to the hook.

```bash
# today's app (a video branch's own web/ can be weeks old: capture main's)
git worktree add --detach <dir> origin/main && (cd <dir>/web && npm ci)
CAPTURE_WEB=<dir>/web node capture/build-app.mjs
# the poster first: the capture serves it to the app as the card's cover
npx remotion still src/index.ts MachinaSaveThisPoster public/clips/savethis/cover.jpg --image-format=jpeg --jpeg-quality=92
CAPTURE_ONLY=savethisClip node capture/shoot.mjs
git checkout src/reels/data/takes.json   # shoot.mjs rewrites it from the takes present
python3 audio/synth-vo.py savethis && python3 audio/vo-to-44k.py out/vo/savethis && python3 audio/vo-deess.py out/vo/savethis
node audio/savethis-score.mjs && node audio/mix-vo.mjs savethis
node audio/savethis-verify.mjs           # bans, windows, voice over music, −14 LUFS, the loop
npx remotion render src/index.ts MachinaSaveThis out/savethis/master.mp4 --crf=14
# (round 17) the same reel without the paper fades at the screens' edges
npx remotion render src/index.ts MachinaSaveThisNoFade out/savethis/master_nofade.mp4 --crf=14
```

| Time | Picture | On screen | Voice | Sound |
|---|---|---|---|---|
| 0:00 | The poster: type over an empty bookmark (frame 0, also the cover) | You're going to / save this video. | "You're going to save this video." | bare Am7 pad |
| 0:00.9 | The thumb fills the bookmark with ink, on "save" | | | click and a low thock |
| 0:01.8 | The type rolls out; the paper splits under the bookmark and swings down like a trapdoor, on "Right down there" | Right down there, / buried with everything else you saved, | "Right down there, buried with everything else you saved," (round 16) | whoosh |
| 0:02.3 | It falls into a well lined with grey, unreadable saves | | | a scale run falling |
| 0:04.2 | It lands on the heap | | | thud |
| 0:05.0 | The camera dives into the heap, slowly (round 16: the hook two beats longer): hundreds of saves | and never / watch it again. | "and never watch it again." | |
| 0:06.5 | Colour floods the grey heap on "Unless" (the app's own category colours, a wave out from the point); then the heap and the well rush into one point | Unless you save it / to Machina | "Unless you save it to Machina." | riser |
| 0:07.9 | The brackets close on it: the mark, on "Machina" | | | impact, shimmer |
| 0:08.4 | The mark lands on the processing card's own mark as the real app irises open: a share of this reel arriving | | | whoosh |
| 0:08.9 | The pill, a phase a beat: Fetching the link, Reading the page, Writing the summary, Searching connections, Organizing & tagging | It reads every save, / from any app, | "It reads every save, from any app," | the band; a tick a phase |
| 0:11.2 | "Saved to Machina"; the card: its cover is this reel's frame 0; its summary lifts on "sums it up", its topic chip on "files it by topic" | understands it, sums it up, / files it by topic, | "understands it, sums it up, files it by topic," | bell |
| 0:12.8 | (Round 17) On "topic" the thumb presses the card's ⋯ and its actions sheet rises, the app's own | | | a tick |
| 0:13.5 | "See in graph" lifts and is pressed, on "connects" | and connects it to / what you've saved before. | "and connects it to what you've saved before." | a tick |
| 0:13.7 | The sheet goes at once (as in the app) and the card lifts off the feed and shrinks into its own dot, turning its orange, as the app's graph opens under it (round 14: only the three, no map of every save first): its ties to two older saves lit and titled (Four Thousand Weeks and the procrastination talk), the rest receded, as the app's own camera glides in on them (round 18: joined once the app's layout has settled, all three titled, on a steady camera) | | | |
| 0:14.2 | The card lands: its dot pings once | | | two linked notes, a low swell |
| 0:15.4 | (Round 18: no hard cut) In the pause before "Now", the graph falls back into the paper and Ask opening rises out of it, settling: settled and held still (rounds 14 and 15: its whole mark, its own header), "What do you want to recall? Answers come only from your 23 saves, with sources you can open.", and the one-tap questions it suggests about the saves; one slow push from here to the proof | Now every save is / one question away. | "Now every save is one question away." | air under the move, a light note as it lands; the drums out |
| 0:18.3 | "So," over Ask opening; on "ask" the question is sent and the chat takes the opening's place in the same shot (round 14: no cut to the composer and back): "What connects my 3 saves about procrastination?" | So, ask it anything, / and get the answer, / with the proof. | "So, ask it anything, and get the answer, with the proof." | a click, a low note |
| 0:18.7 | The answer streams under the question ("All three agree: …"), drawn from the three | | | |
| 0:21.0 | On "proof": the camera settles on the answer and the saves it came from, cited (Tim Urban's talk, Four Thousand Weeks, this reel, an X post from @machinaapp: round 17); the paper rises over the question | | | the band lands, full |
| 0:21.5 | (Round 13) On the next beat each citation is highlighted in turn, an 8th apart: it pops forward and two ink rings leave its edge like a sonar ping; then held, half a second longer than round 12 | | | a rising ping on each |
| 0:22.9 | The app dissolves into the paper; the app's own launch mark draws in (corner ticks, brackets closing, the point striking on "Machina"), the wordmark wipes in, then the tagline word by word, on one line (round 13) | MACHINA / Everything you save, finally useful. | "Machina. Everything you save, finally useful." | the brand's impact, lighter; shimmer |
| 0:27.1 | The lockup holds to the last frame on a slow push (round 13: the last frame is the logo) | This time, / you'll watch it again. | "This time, you'll watch it again." | the drums out, the pad up to the hook's register; a bell rings over the loop |
| 0:29.4 | The loop cuts on the beat from the logo to the hook (0:00) | | | |

**What is real and what is not.** Every app pixel is the shipped app on
`main` (2026-10-21), captured by `capture/shoot.mjs savethisClip`: the
share-sheet placeholder card, the pill's real phase labels, the card,
the app's graph (round 17: the card's own ⋯, then "See in graph", which
opens the graph focused on the new save and lights its ties to two saves
dated before it, `SAVETHIS.related`, with the app's own focus, labels and
camera glide; until round 16, Home's Graph view and a tap on the dot),
and Ask (round 6: the tab, a real question typed, the answer streamed
from three saves with their citations; round 12: the question asks about
the three saves the graph just tied together). The take still records
the feed buried under seven later saves (rounds 2 to 8) and the cited
card opening (rounds 6 to 11); the cut uses neither now. The
graph draws to a canvas, so the
capture reads its dots' positions off the app's own model each frame
for the reel's camera; the capture build lifts the canvas's 2x
resolution cap to the device's 4x so a push-in stays sharp (layout and
drawing unchanged). Scripted, as in every capture: the backend
(the stage changes, the card's analysis, the Ask answer and its
sources, every claim in it taken from the three cards' own summaries). The one card
written for this reel is the reel's own save (`SAVETHIS` in
`capture/library.mjs`): what the app would make of this post, with the
brand handle `@machinaapp`, as an X post (`x.com/machinaapp`; round 17:
Machina has no Instagram account, so the citation must not send anyone
looking for one). The iOS share sheet and Instagram's UI are not
captured, so they are not shown. One move is the reel's, not the app's:
the card shrinking into its dot (in the app the sheet closes and the
graph fades in); every pixel in it is the card's own, from the frame
before its sheet rose. No recipe cards in this account (owner,
2026-10-02).

**Two deliberate breaks from the house rules.** The last word is the
loop's, not the tagline's: the tagline is said once, on the brand card at
79%, and the last line answers the hook over the logo (round 13: the last
frame is the logo; until round 12 it was frame 0). And the
opening (the trapdoor, the well, the heap) is the reel's own motion,
bigger than the kit's restraint allows, in the same ink-on-paper grade.
(Round 4: colour enters with Machina, the app's own category colours
flooding the heap on "Unless" and peaking on the graph; the hook, the
poster and the loop stay ink on paper. Round 6: a brighter grade, this
reel only (`grade.ts`): the paper is the app's own #F9FAFB, not the
house's darker set tone, since the app fills the frame here rather than
sitting in a world; the vignette is a breath; the well stays grey.)

**The loop.** The set's drift is periodic over the reel
(`paperDriftAt`); the picture cuts on the beat from the logo to the hook
(round 13), and the score is rendered twice in a row with the second copy
kept, so its reverb and delay tails (the last bell's among them) ring on
into the start.

**Finish (rounds 11 and 12, frame-by-frame passes over the render).**
Under the graph, paper over the frame's foot (Instagram's caption zone),
where the app's own tab bar rides just under the edge; and the graph
joins the take after the tap (round 12; round 14: twenty 60fps frames
after, its glide in on the three mostly done), because on a phone the app
raises its selection sheet over the tapped dot's spot while its camera
lifts the three clear, and the reel's every-sixth-frame review had
stepped over those frames since round 4. (Round 15) Ask opening holds
the take's last frame before the send: its earlier frames cross-fade
Home's header into Ask's and launch the mark mid-way (round 12 held one
of those, brackets only; round 14 played them, and the header and the
mark jittered), and while the question is typed the empty screen steps
12pt down and back with the composer. (Round 13) The citations'
highlight: each pops forward on its ping and two ink rings leave its edge
(the kit's `Ping`, riding the card's own lift so the rings stay
concentric with it). The pings sit on the beat after "proof" is said, and
the score strikes them back up through the mix's duck under the voice (it
mirrors `mix-vo.mjs`'s envelope), so the three land alike.

**Captions and the no-fade edition (round 17).** The owner read the
captions' mask roll at 0:05 as a rendering glitch on a phone: each line
now fades up into place as it is said, and the line before is gone first
(the kit's `KineticLine clean`); nothing is ever sliced. And the paper
fades over the screens' top and bottom hid the iOS status bar, so
`MachinaSaveThisNoFade` keeps the same reel, sound and timing without
them: every screen whose top is in frame hangs just under the captions,
status bar and rounded corners in view, as on a phone (the card, the
graph and the proof framed wider, the graph opening in the very screen
the feed leaves, and Ask taking the graph's place in it with a dissolve,
round 18); the pill is still framed close, the screen's top far
above, and there each caption line sits on a paper pill, Instagram's own
way of setting type over a picture. Hook and sign-off are unchanged.

**The graph's steadiness (round 18).** The owner saw the graph "shaking
and jittery" as it appeared. Two causes: the app's own layout and camera
wobble back and forth for its first twenty 60fps frames (node0 swings 25pt
and jumps 14pt in one frame), and the reel's camera re-aimed at the three
every frame, so it shook with them. The reel now joins the graph fifty
frames in (from 24 to 48 the app also hides the procrastination talk's
title where it runs into the others; from 50 all three are titled), and
the graph camera is that per-frame framing eased over a gaussian window
(σ 6 frames): on screen the dots' largest frame-to-frame change of speed
drops from 28 to under 6px.

**Voice.** Gemini TTS, Sulafat, per-line direction (the timeline is the
script). Two lines were re-voiced quicker (run 2: the shaft line read
3.84s, the tagline 3.13s). Lines are resampled to 44.1kHz with soxr
before the mix (`audio/vo-to-44k.py`): the mix's linear interpolation
of 24kHz voice is the REVISIT clip's "metallic" sizzle. Then de-essed
(`audio/vo-deess.py`, round 11): two takes hit the "s" of "save" as hard
as the vowels, a hiss on a phone, and one sprayed its top octave; two
bands (above 4.5kHz, then above 9.5kHz), each only where it runs over its
threshold, so the other lines come back bit for bit. (Round 12: the
owner could not hear the "So" of "So ask it anything": the take had it,
but `to_the_words` trimmed a quick, soft first word as if it were the
breath before the line; it now keeps any sound joined to the first word.
The line was re-voiced "So, ask it anything, …" for a distinct "So," and
sets its own `runGap`, the shortest pause that splits it for word timing,
since its "…anything, and…" break is only 60ms.)

## FIND THE BOOK (the needle reel)

`MachinaNeedle` is a 28s vertical Reel built to stop a stranger mid-scroll
(2026-10-22). **The idea: the answer was in your saves all along.** Frame 0
is a dare, "Find the book Sam told you to read.", over a field of this
account's real saves hung in 3D, every one a card the shipped app rendered.
The card it means, a screenshot of Sam's text ("Read Atomic Habits, start
small"), is in that frame, in plain sight among decoy books everyone knows
(round 2, owner: a book everyone knows; Project Hail Mary and Dune lead the
eye). The camera
searches the field (past the beach you swore you'd visit, the talk you'll
finish later, the coffee trick you'll never try), stops dead on "Give up?",
and "Or just ask Machina" gathers the whole field into the mark, which is
Ask's own mark: the cut lands on the real Ask screen at the same size and
place. The half-remembered question is typed and sent; on the send the field
comes back at speed, a tunnel of every save ("It's read every single one."),
and brakes onto the needle at 68% ("Even that screenshot."). The camera dives
into it as the voice names it ("Atomic Habits.") and lands inside the real
answer, which cites it ("Sam said start with the two-minute rule."). The
sign-off is the
tagline; then "P.S. It was in the first frame." folds the lockup back into
its point and the field flies out of it to exactly frame 0, where the loop
picks up and the viewer can now find it. The rewatch is the point.

```bash
# today's app (a video branch's own web/ can be weeks old: capture main's)
git worktree add --detach <dir> origin/main && (cd <dir>/web && npm ci)
CAPTURE_WEB=<dir>/web node capture/build-app.mjs
CAPTURE_ONLY=needleCards,needleClip node capture/shoot.mjs
git checkout src/reels/data/takes.json   # shoot.mjs rewrites it from the takes present
python3 scripts/needle-cards-sm.py      # the field's half-size cards (a speed copy)
python3 audio/synth-vo.py needle && python3 audio/vo-to-44k.py out/vo/needle && python3 audio/vo-deess.py out/vo/needle
node audio/needle-score.mjs && node audio/mix-vo.mjs needle
node audio/needle-verify.mjs           # bans, windows, safe area, voice over music, −14 LUFS, the loop
# render in parallel frame ranges: one browser composites on ONE core (its
# GPU process), so four ranges in four browsers finish ~3× sooner; the
# tunnel (480–559) is the heavy stretch, split it finer
for r in a:0-299 b:300-479 c1:480-499 c2:500-529 c3:530-559 d:560-839; do
  npx remotion render src/index.ts MachinaNeedle out/needle/seg-${r%%:*}.mp4 --frames=${r#*:} --concurrency=1 --muted --crf=14 &
done; wait
printf "file 'seg-%s.mp4'\n" a b c1 c2 c3 d > out/needle/concat.txt
ffmpeg -f concat -safe 0 -i out/needle/concat.txt -c copy out/needle/joined.mp4
# the posting file: Remotion's JPEG frames are full-range BT.601; the feeds
# expect limited-range BT.709 yuv420p, with AAC 48kHz
ffmpeg -i out/needle/joined.mp4 -i public/clips/needle/score-vo.wav -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slow -crf 15 -profile:v high -level 4.1 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 320k -ar 48000 -ac 2 -shortest -movflags +faststart out/needle/final_reel.mp4
node scripts/needle-stills.mjs         # review stills → out/needle-stills/
```

| Time | Picture | On screen | Voice | Sound |
|---|---|---|---|---|
| 0:00 | The dare over the field (also the cover): 13 placed saves, famous decoy books leading the eye (Project Hail Mary, Dune), the needle lower left, smaller, turned, its corner under "Thinking, Fast and Slow"; the BET YOU CAN'T kicker over the big type | BET YOU CAN'T / find the book / Sam told you / to read. | "Bet you can't find the book Sam told you to read." | a chord stab and a kick (where the loop lands) |
| 0:02.0 | A slow push while the eye scans | | | a rising keys figure |
| 0:02.5 | The camera starts into the field | It's in your saves / somewhere. | "It's in your saves somewhere." | hats in, half-time kick |
| 0:04.5 | A slalom through the haystack: each named save swings into the middle, sharp, pops with the ink ring as it is said, and anything nearer steps out of its way | Past the beach / you swore you'd visit, · the talk you'll / finish later, · the coffee trick / you'll never try. | the list, quicker each time | four on the floor, 16th hats, a whoosh between saves |
| 0:10.0 | The camera stops dead (a damped slam) in the middle of the pile: a heap of saves fills the frame edge to edge, the nearest cut off by it | Give up? | "Give up?" | the band stops; a thud |
| 0:10.8 | Every card in view rushes into one point; the brackets snap shut around it; the point strikes on "Machina" (beat 24) | Or just ask / Machina. | "Or just… ask Machina." | a riser into the brand's impact, a shimmer |
| 0:12.2 | Match cut: the mark pulls back to exactly Ask's mark and the real Ask screen irises open around it: "What do you want to recall? Answers come only from your 52 saves, with sources you can open." | | | a whoosh |
| 0:13.5 | Down to the composer; the question types; the thumb sends it | What was the book Sam told me to read? (the app) | | soft key ticks; a rim roll and a riser |
| 0:15.0 | CUT to the tunnel at full speed: every save streaming past, a banking roll, real motion blur | Every save: read, / summarized, sorted, linked. | "Every save: read, summarized, sorted, linked." | THE DROP: kick every beat (the last three words on kicks), 8th-note bass |
| 0:16.7 | Braking; the tunnel thins; one card ahead turns to face the camera | Even that screenshot. | "Even that screenshot." | the drums fall away, a falling keys line, a swell |
| 0:19.0 | **The needle**: Sam's screenshot, "Read Atomic Habits, start small", square to the camera, a punch-in, the ink ring, three rings out across the field, the rest receding | Atomic Habits. | "Atomic Habits." (just after the hit) | impact, sub, a bell (home on I) |
| 0:19.5 | The camera dives into the card… | | | a whoosh |
| 0:20.0 | …and lands inside the real answer on its one source (the same title), pulling back to the question, the answer and the citation, which lifts with its ink ring | "Wait, / what was it called?" (struck through once said) | "No more 'wait, what was it called?'" | the band clears for the line; warm keys after it |
| 0:22.5 | The app dissolves into paper; the app's own launch mark draws in, the wordmark on "Machina", the tagline word by word | MACHINA / Everything you save, finally useful. | "Machina. Everything you save, finally useful." | the brand's impact, lighter; a bell |
| 0:25.9 | The lockup folds into its point; the field bursts back out of it to frame 0, the needle last | P.S. It was in / the first frame. | "P.S. It was in the first frame." | the dare's figure on vi; a whoosh |
| 0:28.0 | The loop: frame 0, identical field, the dare back on screen | | | the stab lands again |

**What is real and what is not.** Every card in the field is the shipped app
on `main` (2026-10-22) rendering a save, shot alone on transparency by
`capture/shoot.mjs needleCards` (only what is BEHIND the cards changes: the
page's backgrounds cleared, its chrome hidden), so the field is the app's own
feed, rearranged in space; the 3D, the camera, the depth of field, the fog
and the motion blur are the reel's. Ask (the screen, the typed question, the
streamed answer, its citation) is `needleClip`, one continuous use of the
app. Scripted, as in every capture: the backend's answer, every claim in it
taken from the card itself (its title, summary and note). The account is
the house demo account minus its two recipes (no cooking: owner,
2026-10-02), Piranesi and the two James Clear saves (round 2: one Sam book,
and no near-twins of the needle), plus 32 more real saves (`NEEDLE.extra` in
`capture/library.mjs`: published titles, summaries true to the source,
invented Instagram handles, no third-party images, several decoy books,
and the needle itself, dated June). The iOS share sheet is not shown.

**The field (`src/reels/clips/needle/field.ts`, `FieldView.tsx`).** A pinhole
camera in world pixels (focal 1100): a card at depth d is drawn 1100/d its
size in true CSS perspective, painted far to near. Depth of field is a
thin-lens falloff per card; fog fades the far ones into the paper; the
emphasis is the kit's ink ring on the card's own rounded rect, with a small
lift. Motion blur is real: `MotionField` renders the field at up to seven
moments inside a 180° shutter (shorter in the tunnel) and averages them
(each sample opaque, sample k laid over the first k at 1/k). Layout A (the
haystack) is art-directed on frame 0 and seeded elsewhere; no save appears
twice where it can be read on frame 0, and the three named saves are deeper
than every frame-0 card, with a clear sightline (and anything that would
still cover the subject fades out of its way). Layout B (the tunnel) keeps a
clear corridor down the middle, so near saves stream past the edges and far
ones gather at the vanishing point; the needle waits at its end.

**Voice.** Gemini TTS (`gemini-3.8-flash-tts`, Google's current TTS model,
2026-09-23), Sulafat, per-line direction in the timeline (a friend daring
you, grinning at your pile of saves, then letting you in on the trick),
voiced on GitHub by `narration-tts.yml` with the repo's `GEMINI_API_KEY`
secret (runs 57 and 59), resampled to 44.1kHz and de-essed. 67 words. The
cut is timed to the takes: "Machina" lands on beat 24, where the brackets
strike, and "Atomic Habits." four frames after the needle's hit.

**Measured, not listened to.** `node audio/needle-verify.mjs`: brand bans on
340 strings (captions, the question and answer, the added saves, every
captured frame), every line inside its window, the type inside the feeds'
safe area, every line 11 to 24dB over the music in the speech band, −14.04
LUFS, −1.12 dBTP, the loop's audio seam inside the score's own steps. The
score's energy curve, per beat: the stop on "Give up?" at −29 to −36dB, the
strike −12dB, the build into the drop −30 → −20dB, the drop −8dB, the needle
−10dB. The encode (round 2): 840 frames, 28.000s, H.264 High yuv420p BT.709,
AAC-LC 48kHz 320k, 20.6MB; every frame pair scanned (no one-frame flash; the
six range seams move like their neighbours); frame 839 against frame 0 under
the type: 35.2dB PSNR. Nobody has listened to it on speakers.

**Round 6 (owner, on round 5).** The tunnel's line says what Machina did to
every save when it was saved: "Every save: read, summarized, sorted,
linked." (past tense: done already; its last three words land on the
drop's kicks). Over the answer the caption is the quote alone, "Wait, what
was it called?", while the voice still says "No more…" (a caption's `say`;
its words take the last timings of what is said), and an ink line strikes
it through once said (`KineticLine` `strike`). The dare's timer bar is
gone, with its ticks. The paper scrim is now the paper itself (`paperAt`:
its own gradient at every height), so it never shows as a band.

**Round 5 (owner: a polish round, studio grade).** The captions take less
of the frame: the band sits high in the safe area (`Needle.tsx` `BAND`: top
268, 60px) on a shallower paper scrim (to 410, clear by 550), and the dare
is a touch tighter (96px). "Give up?" is re-voiced relaxed (0.61s, was
0.31s) and lands just after the camera's slam. Craft fixes, each seen on a
frame: the dare's timer is a countdown bar (a faint track the ink runs out
of); the gather's brackets stay solid ink as they sweep in
(`CitationGlyph` `fade`); the mark arrives at the match cut at Ask's own
pull-back speed (no brake on the cut); cards passing the lens dissolve
(from ~500 in) instead of smearing; over the answer, the paper covers the
status bar whole and clears above the header; the sign-off mark loses its
drop shadow and the seam where its arms' reveals meet. Rendering: the
heap makes a browser take 2–3GB, so render at most five ranges at a time
(`xargs -P 5`; thirteen at once ran out of memory).

**Round 4 (owner, on round 3).** The dare reads as a dare: a BET YOU CAN'T
kicker over the big type and an ink timer under it that runs out on the push
(`Needle.tsx` `DARE`; the score ticks on its beats). "Give up?" stops in the
middle of the pile: `field.ts` `STOP` is on the field's axis past the coffee,
and the heap, art-directed from it (the nearest cut off by the frame, the
middle ones overlapping, the far ones in the gaps, none twice), fills the
frame, with a deeper focus while it holds. The tunnel's line says "already"
(each save is read when it is saved; Ask then searches them all), and Sam's
advice gives way to the everyday pain it ends: "No more 'wait, what was it
called?'" 71 words (the video's 72).

**The video needle (round 3).** Owner: a YouTube video as the needle, "a
Mark Manson video", shown beside the book. Same cut, camera and score; the
needle is a render's choice, `--props='{"needle":"video"}'`
(`src/reels/clips/needle/variant.ts`; the book stays the default), and the
audio scripts take `video` / `needle-video`. Sam's pick is a real YouTube
save, Mark Manson's "Life is a Video Game, Here Are the Cheat Codes" (his
own channel, 12:39), noted "Sam says the first cheat code is the one."
Frame 0 hides it among videos people know (the TED talk, The Egg) with
Manson's other save, an article, over its corner. Four lines change: the
dare ("Find the video Sam told you to watch."), "Watched the videos, too.",
the reveal ("Mark Manson.") and Sam's tip ("Sam's cheat code? Skip the side
quests."), said over the real answer, which finds the minute ("…skip the
side quests, at **3:16**.", bold as the model sets what matters); the
minute lifts and rings as the tip is said. 68 words.

Checked, and how: the title and channel against YouTube's own oEmbed and the
channel's upload list, on GitHub (`.github/workflows/video-facts.yml` runs
`capture/video-facts.py`: cloud sessions reach neither YouTube nor Google's
API); the card's summary, length (13m) and key moments are Machina's own
analysis of the video (`functions/ai_service.py` `analyze_youtube`, the call
a Pro save makes: `capture/video-facts/Nxy6SIM11sA.json`; the title kept as
YouTube has it), and the 3:16 moment against a second model's transcript of
3:05–3:50 alone ("…this brings us to our first cheat code… side quests are
fun distraction at best and waste years of your life at worst… the fewer
side quests the better"). No thumbnail: a real frame is a rights problem,
and his face on an ad reads as an endorsement. In the app a video's key
moments are Pro (and the trial); the reel names no plan.

```bash
CAPTURE_ONLY=needleVideoCards,needleVideoClip node capture/shoot.mjs
git checkout src/reels/data/takes.json && python3 scripts/needle-cards-sm.py
python3 audio/synth-vo.py needle-video && python3 audio/vo-to-44k.py out/vo/needle-video && python3 audio/vo-deess.py out/vo/needle-video
node audio/needle-score.mjs video && node audio/mix-vo.mjs needle-video && node audio/needle-verify.mjs video
# render as above, with --props='{"needle":"video"}', into out/needle-video/;
# mux public/clips/needle/score-video-vo.wav
NEEDLE=video node scripts/needle-stills.mjs   # → out/needle-stills-video/
```

## TICK IT OFF (the revisit reel)

`MachinaRevisit` is a 29s vertical Reel about the side of Machina that comes
back to you (2026-10-23): the "Do this" list, the weekly synthesis and the
rest of the Revisit tab. **The idea: your saves are a to-do list you never
get to; Machina writes you a to-do for every save you can act on, and every
Sunday it writes up your week.** (Round 6, owner: "it should be clear to the
user that Machina creates an action item or to do from each card, and then
we have the weekly synthesis".) Frame 0 says it, "Your saves are a to-do
list.", over an ink list of this account's real saves, each waiting on an
empty circle (Watch …, Read …, Try …, Visit …). The list ratchets on,
"later" after "later", spins like a slot reel and stops dead on the save
that gives the game away: a video on procrastination (Mark Manson's, real, on
his own channel). "Relax. Machina watched it.": the sheet tears off the pad,
and under it is the real app, that save's card, summed up. "For every save
you can act on, it writes you a to-do.": a new sheet lands with the whole
list on it, the five saves you can act on light up and fly onto the real "Do
this" rows, and each "Watch …" is struck out, its title dropping into the
row's grey line while its to-do is written in. (Only those five: the
analysis writes a to-do only when a save supports a concrete action,
functions/ai_service.py, so the line says "every save you can act on", not
every save.) The payoff (60%, played at half speed): "Even the
procrastination one.", the video's to-do ticked, the other four following on
the beat, the rows folding away to the app's own "All done. New tasks arrive
with your saves." Then the week: "And every Sunday, it writes up your
week.", this week's synthesis, right under "All done.", tapped open in place,
its first paragraph on that video and "the smallest step you can take
today", underlined in ink. The sign-off, held on the logo and the tagline to
the last frame (round 2, owner: "the final frame is the to do list again -
it should be the Machina logo and tagline"; round 1 ended on a fresh sheet
landing as frame 0), and the loop cuts on the beat from the logo back to the
hook. The device is the pad and its circle (a sheet tears off, another
lands; the circle you never fill is the app's own "Do this" circle, and in
the end it fills), none of FIND THE BOOK's (no dare, no hidden object, no 3D
field, no tunnel, no P.S.). Rounds 1 to 5 told the week first and the to-dos
after it, in half a sentence; round 5 had already caught that they read as
weekly ("To do items are actually added automatically immediately with an
added card, not once a week").

Pitched against two others (the owner can ask for either): THE RECEIPT (a
till receipt of the week's saves printing on the beat, totting up the hours
you meant to spend, torn off into a Sunday read and a five-line list) and
SUNDAY MORNING (a week of saves piling up day by day on a calendar strip,
folding like a paper map into one page on Sunday). This one won because its
frame 0 is a truth people recognise, its payoff is the app's own tick rather
than a metaphor, and one save (the procrastination video) runs through every
beat.

```bash
# today's app (a video branch's own web/ can be weeks old: capture main's)
git worktree add --detach <dir> origin/main && (cd <dir>/web && npm ci)
CAPTURE_WEB=<dir>/web node capture/build-app.mjs
CAPTURE_ONLY=revisitClip node capture/shoot.mjs
git checkout src/reels/data/takes.json   # shoot.mjs rewrites it from the takes present
python3 audio/synth-vo.py revisit && python3 audio/vo-to-44k.py out/vo/revisit && python3 audio/vo-deess.py out/vo/revisit
node audio/revisit-score.mjs && node audio/mix-vo.mjs revisit
node audio/revisit-verify.mjs          # bans, the list is the account's, the video's facts, windows, safe area, voice over music, −14 LUFS, the loop
# render in parallel frame ranges (one browser composites on ONE core); the
# spin (150–236) and the tear (288–305) are the heavy stretches. Keep
# --concurrency=1: two tabs in one range rasterize the composited list at
# slightly different offsets, and alternate frames then shimmer
for r in a:0-149 b1:150-199 b2:200-249 c:250-329 d:330-459 e:460-599 f:600-729 g:730-869; do
  npx remotion render src/index.ts MachinaRevisit out/revisit/seg-${r%%:*}.mp4 --frames=${r#*:} --concurrency=1 --muted --crf=14 &
done; wait
printf "file 'seg-%s.mp4'\n" a b1 b2 c d e f g > out/revisit/concat.txt
ffmpeg -f concat -safe 0 -i out/revisit/concat.txt -c copy out/revisit/joined.mp4
# the posting file: full-range BT.601 frames → limited-range BT.709 yuv420p, AAC 48kHz
ffmpeg -i out/revisit/joined.mp4 -i public/clips/revisit/score-vo.wav -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slow -crf 15 -profile:v high -level 4.1 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 320k -ar 48000 -ac 2 -shortest -movflags +faststart out/revisit/final_reel.mp4
node scripts/revisit-stills.mjs        # review stills → out/revisit-stills/
```

| Time | Picture | On screen | Voice | Sound |
|---|---|---|---|---|
| 0:00 | Frame 0 (also the cover): the hook over the ink list, nine real saves in view, each on an empty circle | Your saves are / a to-do list. | "Your saves are a to-do list." | a chord stab and a kick (where the loop lands) |
| 0:01.9 | The hook rolls out; the list ratchets one save, then two, then three, each step on its verb (a spring from rest, round 4), under one slow push that runs to the tear | Watch later. / Read later. / Try later. | "Watch later. Read later. Try later." | a ratchet click and a rising pluck a step; the half-time beat |
| 0:05.0 | The slot spin: one speed curve, up from rest and braking firmly to a stop, real motion blur | You even saved a video / on procrastination. | "You even saved a video on procrastination." | four on the floor, a riser, the reel's own clicks |
| 0:08.0 | It stops dead on the video, "Watch How to Beat Procrastination Like It Owes You Money · Mark Manson · 11:45", set apart in an ink ring; the rest recede; two rings out; a slow push | | | a clunk; the band stops; one hushed note for the comic beat |
| 0:09.6 | After "Relax.": the sheet rips along the binding, sags off its last corner and is pulled away, picking up speed (its own shutter) | Relax. / Machina watched it. | "Relax. Machina watched it." | a paper rip, a whoosh |
| 0:10.0 | Under it, the real app: Home, the video's card on top of the feed, summed up (12m), its title where the ink one was; a slow push | | | on I, warm |
| 0:11.2 | (Round 6) A new sheet drops onto the pad with the whole list on it, in two columns; on "act on" (0:12.6) the five saves you can act on light up a 16th apart | For every save you can act on, / it writes you a to-do. | "For every save you can act on, it writes you a to-do." | a sheet's pat, four on the floor, five plucks |
| 0:13.0 | On "it writes", the five fly onto the real Revisit tab's "Do this" rows as the sheet gives way | | | a whoosh |
| 0:13.8 | A row every 6 frames, as "to-do" is said: the verb struck out, the save's title dropping into the row's grey title line, its to-do written in where it stood | | | a pen stroke a row |
| 0:14.7 | In to the video's to-do ("When you feel stuck, identify the smallest, simplest action you can take today…"); an ink ring closes on its circle | Even the / procrastination one. | "Even the procrastination one." | the drums fall away; a riser |
| 0:17.3 | **The payoff (60%), at half speed (round 4)**: the video's to-do ticked on "one", the other four an 8th apart: each circle fills, each line is struck, "Do this" held still | | | five rising pings home on I, the band in full |
| 0:18.6 | The rows fold away an 8th apart, at half speed: "All done. New tasks arrive with your saves." (0:20.1) | | | a soft brush of paper a row; a bell |
| 0:20.4 | (Round 6) Down to this week's synthesis, right under "All done."; the thumb taps it open (0:21.7) and its page unrolls in place; its first paragraph, "…the loudest one is a video on procrastination… the way out is the smallest step you can take today.", the phrase underlined in ink | And every Sunday, / it writes up your week. | "And every Sunday, it writes up your week." | a light groove on IV, a tap, a pen stroke |
| 0:24.1 | The tab goes out of focus under the paper as the app's own launch mark draws in over it; the wordmark on the spoken name, the tagline word by word | MACHINA / Everything you save, finally useful. | "Machina. Everything you save, finally useful." | the brand's impact, lighter; a bell |
| 0:27.1 | The lockup holds to the last frame on a slow push (round 2: the last frame is the logo and the tagline) | | | the last bar leans to vi; a bell rings over the cut |
| 0:29.0 | The loop cuts on the beat from the logo to the hook (0:00) | | | the stab lands again |

**Round 4: the polish (owner: "it needs a full round of refinements and
polishes to make Apple grade … fix lags, bitterness, abrupt cuts etc").**
Measured first, frame by frame (optical flow on the encode: the dominant
motion of every frame pair, the frames that stall inside a move, the speed
jumps), then fixed at each cause:
- *Jolts and dead stops.* The kit's camera eases each segment on its own
  (EASE_MODAL leaves at 2.25 times its average speed): the push in to the
  video's line jumped 2.5% of zoom in its first frame, and the camera stopped
  dead at the synthesis and set off again. The app camera is now one monotone
  spline through its keys (`src/reels/clips/revisit/smooth.ts`): continuous
  speed through every key, no overshoot, and it goes one way from the card to
  the paragraph (it used to rise to the banner and turn round on the tap).
  The largest frame-to-frame speed change in the push-in fell from 31 to 3.
- *The ratchet and the spin.* The steps used the app's spring curve, which
  leaves at 4.6 times its average speed (50 to 80px in a step's first
  frame); they are now a damped spring from rest. The spin was u² into
  ease-out-back (a kink where the push turned to a brake, an overshoot that
  crept back a pixel at a time); it is one speed curve, v ∝ u^1.8 (1 − u)^1.3.
- *Shimmer.* The ink list was zoomed by resizing its type every frame, and
  its dividers were rounded to whole pixels: the text stepped about half a
  pixel either way through every slow push (measured on the encode). The rows
  are now laid out once on whole pixels and the scroll and zoom are one
  transform on a composited layer (`willChange: transform`), which Chromium
  moves by fractions of a pixel (a probe: 0.05px of wobble against 0.3px and
  whole-pixel snaps); the same for the sign-off's slow push.
- *Motion blur.* Nine copies up to 11px apart read as stripes. The list now
  takes samples at most 3px apart (up to 14) melted by a blur along the move;
  a sheet takes up to 14 and one blur along its move, not around it.
- *The synthesis.* The app opens it in one frame (the card gone, an empty
  page, then the text), which read as a cut; the open page now unrolls down
  over the closed one from the tap (a mask with a soft edge, the app's own
  two frames on either side of it).
- *The tear and the landing.* The tear rips for six frames and the sheet is
  then pulled away picking up speed from rest (it was thrown at full speed and
  gone in five frames). The landing sheet drops onto the pad from above,
  toward the camera (a little large, out of its own shadow), where it slammed
  down 2000px in four frames.
- *The payoff.* At the app's speed each row's 280ms fold was two frames at
  30fps and the list snapped up five times. The ticks are rolled again at
  120fps and played at HALF SPEED (the clicks 125ms apart in the app's time,
  so still an 8th apart on screen); a fold now plays over about four frames
  of real motion and the cascade runs an 8th apart. Two beats longer: 29.0s.
- *The ending.* The tab used to dissolve to bare paper for a few frames
  before the mark appeared; it now goes out of focus under the paper as the
  pull-back carries on, and the mark draws in over the last of it. The
  scroll back up is laid over by the fraction of its next frame (whole take
  frames stepped its slow ends).

**Round 7: the frame (owner: "isn't the main area where we show the app a
bit too low? It seems like the captions area takes too much vertical
space").** It was: the lines were set at 330px and the paper behind them ran
solid to 505 and clear at 600, so every app shot began about a third of the
way down. The lines now start at 258 (their caps at 272, inside the feeds'
250px safe line) and the paper is solid to 432 and clear at 466 (`BAND` in
`clips/revisit-list.mjs`, which the safe-area gate reads too). Every app shot
is framed up to that edge, with a gap between two of the app's own rows in
its 34px fade, so the edge never cuts a line of the app: the synthesis banner
above the video's card, the tab's title above "Do this", "This week" above
its banner all sit under the paper. The list, the push in, the ticks and the
fold zoom about the "Do this" line, held at the edge, so the list only grows
down the frame (the push in used to carry the header 190px down): the to-do
rows sit about 250px higher, and all five are in the frame as they tick
(three were). The spin stops 138px higher (`STOP_Y` 645) so the tear still
lands the card's title where the ink one was; the slot clicks follow the
scroll (one more). Act one's paper is deep for the three "later"s, then comes
up to the band's edge. The landing sheet's list starts at 480 (was 560). The
foot's paper now comes in only for the fold's last half second, when the
Undo toasts reach the frame, and the fold zooms out to 2.86 (was 2.8) to keep
them under it. (Measured on the encode: the push in and the glide to the week
are smoother than round 6, largest frame-to-frame speed change 1.5 and 1.7
against 2.9 and 2.2. The flow audit reads the folds' as 42 where round 6 read
26: the same app fold at the same speed, about 100px a frame at its peak in
both, but with more of the moving list in the frame the tracker follows it
through frames it used to drop.)

**What is real and what is not.** Every app pixel is the shipped app on
`main` (2026-10-23), one continuous use of it captured by
`capture/shoot.mjs revisitClip`: Home with the video's card on top of the
feed, the Revisit tab scrolled to "Do this" (five to-dos from five saves),
the five ticked an 8th apart, played at half speed (rolled at 120fps on the
app's clock, the clicks 125ms apart; each circle's spring, the strike, the
650ms hold, the 280ms fold, the list closing up, the empty state), and the
tab again once the five Undo toasts have timed out (until then they stay
below the frame and under a fixed paper fade at its foot), where this week's
synthesis, right under "All done.", is tapped open in place (round 6; the app
opens it in one frame, the reel unrolls the open page down over the closed
one from the tap). (Round 3, owner: the frame's foot
"is jumpy" as the list ticks off.) The page used to end right under "Do
this", so as the rows folded the browser re-clamped its scroll in uneven
jumps, once even back up, and the camera's tracking of the list turned that
into a jumping foot of the frame; the account now has nine days of past
Daily Brews below the list, as a lived-in Revisit tab has, so the page never
moves under the ticks and the rows fold up on their own. Scripted, as in every
capture: the backend, so the account (`REVISIT` in `capture/library.mjs`):
FIND THE BOOK's haystack without Sam's screenshot, the recipes or Tim Urban's
procrastination talk (one video on procrastination, not two), plus the
video; this week's six saves dated into the week; a reminder due ten minutes
ago; nine past Daily Brews (round 3); the five open "Do this" lines (only saves that call for an action carry
one, as in the app; Tail End's and the V60's are the house account's, Four
Thousand Weeks' and Cala Goloritzé's are new and true to their summaries);
and this week's synthesis, written from those six saves (round 6 shows it
in Revisit, where it used to be opened on Home before the to-dos). The ink
list, the sheets, the underline, the pull-out and the rewrite are the reel's: the
rewrite covers each real line in the row's own white and wipes it in (the app
shows the list already written). The iOS share sheet is not shown.

**The video.** Mark Manson's "How to Beat Procrastination Like It Owes You
Money" (his channel, 11:45). Checked on GitHub by `video-facts.yml`: title
and channel are YouTube's oEmbed, the length is the channel's upload list;
the card's summary, its 12m, its key moments and its "Do this" line ("When
you feel stuck, identify the smallest, simplest action you can take today to
move toward your goal and do it immediately to trigger the do something
principle.", verbatim) are Machina's own `analyze_youtube` run on it
(`capture/video-facts/-Feev1ZK6L4.json`), and a second model's transcript of
its first 45 seconds ("Every problem of inaction is ultimately a problem of
emotion. You procrastinate not because you don't know what to do, but
because you don't feel like doing it.") and its last two minutes ("…just by
doing anything, you learn something.") backs the synthesis' paraphrase. No
thumbnail (rights; his face would read as an endorsement); the reel never
plays the video (its opening has a swear word). In the app the full weekly
synthesis and a video's understanding are Pro (and the 14-day trial); the
reel names no plan.

**Voice.** Gemini TTS (`gemini-3.8-flash-tts`), Sulafat, per-line direction
in the timeline (a friend catching you out and laughing with you, then
showing you the trick), voiced on GitHub by `narration-tts.yml` (run 22;
run 24 for round 6's two lines that explain the app, "For every save you can
act on, it writes you a to-do." and "And every Sunday, it writes up your
week.", directed at an easy, natural pace, about 5 and 4 syllables a second:
round 5's to-do line was directed "quick" twice and came out at 7, "very sped
up and not natural", owner); the sign-off is FIND THE BOOK's take, the same
key. Resampled to 44.1kHz, de-essed. 53 words. (Round 5,
owner: "the you word is barely audible".) It was not quiet, it was gone: the
take's quick "You" is set off from "even" by about 50ms of silence, and
`to_the_words` (audio/gemini_tts.py), which keeps a soft first word only
while it runs on unbroken, took it for a breath in and trimmed the line to
"even saved…". It now reaches back across a pause of up to 80ms to anything
word-loud (a breath never comes within 14dB of the line's typical level);
of the 87 committed takes only four trim differently, and this is the only
one any current script uses. The "You" is the line's softest word, so it
is also lifted 3dB (`lift` on its caption, applied by synth-vo.py), and in
the score the spin's clicks step back under the voice and the kick two
frames before it is softened. The cut is timed to the takes: the spin stops on
"procrastination", the sheet tears between "Relax." and "Machina", the five
light up on "act on", fly on "it writes" and are written in on "to-do", the
tick lands on "one", and the week's page unrolls on "writes up your week".

**The score.** `audio/revisit-score.mjs`, 120 BPM, with five synthesized
foley voices of its own (a ratchet click, a paper rip, a sheet landing, a pen
stroke and, round 4, a row folding away: a soft brush of paper). The slot reel's clicks are not a pattern: one per save crossing the
middle of the frame, read off the same scroll the picture uses
(`clips/revisit-list.mjs` `CLICKS`), so they speed up and brake with it.

**Measured, not listened to.** `node audio/revisit-verify.mjs`: brand bans
on 326 strings (captions, the added saves, the synthesis, the "Do this"
lines, the ink list, every captured frame) and no plan, price or store words
in the script; all 42 list items are saves in the account, titled as saved;
the five picked are the five "Do this" lines, in Revisit's order; the
video's title, channel, 11:45, key moments and "Do this" line match YouTube
and Machina's analysis; every line inside its window; the type inside the
feeds' safe area; (round 7) every line 12.5 to 23.7dB over the music in the
speech band (the to-do line 17.8dB, the Sunday line 14.2dB, "You even saved…"
20.8dB); −14.03 LUFS, −1.29 dBTP; the loop's audio seam inside the score's
own steps. The encode (round 7): 870 frames, 29.000s, H.264 High 4.1 yuv420p
BT.709 limited range, AAC-LC 48kHz 320k, 23.2MB, −13.9 LUFS and −1.2 dBTP
after the AAC encode; every frame pair scanned: no one-frame flash, no
frame that stalls inside a move, no lone jump, no run of alternating speeds,
the eight range seams moving like their neighbours; the largest
frame-to-frame changes are the spin's own blur. Against round 3, the largest
change of speed from one frame to the next (optical flow, px a frame): the
ratchet 50 → 26, the card and the glide to the synthesis 10 → 3, the landing
13 → 3, the push in to the video's line 31 → 3, the ticks and folds 47 → 26,
the pull-back 24 → 14 (the tear's 27 is the pull's steady acceleration, by
design). The last frame is the logo and the tagline, and the loop is a cut on
the beat from it to the hook. Not fixed, by measurement: on a slow push the
composited type is a touch crisper each time it crosses a whole pixel (about
2% in edge contrast, every four frames), the price of moving it smoothly; and
a fold, at half speed, is still the app's own quick curve (about four frames
of real motion). Nobody has listened to it on speakers.

**Rendering note.** A sheet in motion (the tear) and the moving list have
their own shutter: up to 14 poses averaged, then ONE blur along the move
over the average (an SVG gaussian, `Smear` in Revisit.tsx). A blur on each
sample cost about four minutes a frame in the render's software compositor;
one blur costs seconds. Slow moves of type ride composited layers
(`willChange: transform`): render each range with `--concurrency=1`.

## The house rules (every video from 2026-10-25 on)

Owner, 2026-10-25: all the product videos share one design language, and
some parts are identical in every one, starting with the ending. The videos
made before (the ads, the feature clips, the highlight reel, SAVE THIS,
FIND THE BOOK, TICK IT OFF) stay as they were rendered; they are **not**
re-done. Every new video follows these, and `node audio/house-verify.mjs`
checks it (a new video adds itself to `HOUSE` in that file):

- **It ends on the Signature** (`src/reels/kit/Signature.tsx`,
  `kit/signature.mjs`): FIND THE BOOK's approved sign-off made fixed. The
  house paper rises over the last shot, the app's launch mark draws in and
  strikes on the spoken "Machina", the wordmark wipes in, the tagline
  arrives word by word. It is the last `SIGNATURE.frames` (150, 5.0s) of
  the video, its layout is fixed, and its voice is ONE take, voiced once
  (`public/signature/signature-vo.wav`, from `vo-takes/ac1864b4dc285da306b9`),
  that `mix-vo` lays in at the signature's frame (`signature: true`). The
  video says nothing over it and never says the tagline itself. The only
  thing a video chooses is the **footer** under it ("Coming soon ·
  mymachina.app" today, the store on launch day), so an ending can be
  updated without re-voicing anything. `MachinaSignature` renders it alone.
- **Colours and UI type come from `kit/tokens.ts`** (the film's paper, the
  kit's inks, the app's platform hues, the kit's shadows, paper tile
  tints). No hex, rgb or fontFamily in a video's own scene files.
- **Motion uses the kit's curves** (`kit/curves.ts`); no new easing.
- **Captions are the kit's `KineticLine` in the house band**
  (`kit/Captions.tsx` `HOUSE_BAND`: FIND THE BOOK's round-5 band, top 268px,
  60px weight 650, over a paper scrim solid to 410px and clear by 550px), so
  the picture owns everything below 550px. The frame-0 hook is the house
  hook (`kit/Hook.tsx` `HookTitle`: FIND THE BOOK's dare, a kicker over
  96px type). The voice is Gemini TTS Sulafat with per-line direction; the
  mix is mastered to −14 LUFS, ≤ −1 dBTP.
- **Never a blank placeholder.** Anything standing in for another app's
  content is filled with what that place is really full of, built from type,
  line icons and paper tints (POV round 2), never grey skeleton boxes, and
  never real third-party media.

One kit, too: this branch merged the newest video branches (SAVE THIS,
TICK IT OFF, the highlight reel round 16) onto FIND THE BOOK's kit, so
`kit/Type.tsx` carries both the strike and the clean/plate lines. The older
ad and clip branches were not merged: their kit changes are earlier
versions of what the kit already has, and their videos are not re-rendered.

## POV: YOU SAVED IT

`MachinaPov` is a 30s vertical Reel/TikTok (2026-10-25, the owner's
script), the first video on the house rules. **The idea: saving was never
the hard part, finding it again is.** Frame 0 is a blank search bar and a
blinking caret under "POV: you saved it." The hunt runs through every place
a save hides, quicker each time over a ticking pulse: an Instagram-style
saved grid whips up, a whip-pan to a TikTok-style favorites grid, a wall of
screenshots flies past too fast to read, the chat you send yourself links
in. The search types "that Lisbon café" and finds nothing, a desperate
scroll stops dead, nothing again, and the music drops to almost nothing.
Then, slower: every place pulls back into a panel, drifts apart and
bleaches into the paper ("Saving was never the hard part. Finding it again
is."). The saves rush back from every side into one point of ink, and the
point becomes the logo: the Signature, footer "Coming soon ·
mymachina.app".

```bash
python3 audio/synth-vo.py pov            # the takes are cached (narration-tts run 27)
node audio/pov-score.mjs && node audio/mix-vo.mjs pov
node audio/house-verify.mjs pov          # the Signature, the kit's colours/type/curves, the take in the mix
node scripts/pov-stills.mjs              # review stills + sheet → out/pov-stills/
for r in a:0-224 b:225-449 c:450-674 d:675-899; do
  npx remotion render src/index.ts MachinaPovSilent out/pov/seg-${r%%:*}.mp4 --frames=${r#*:} --concurrency=2 --muted --crf=14 --browser-executable="" &
done; wait   # (--browser-executable="" on the Mac only)
# join and mux as FIND THE BOOK does, with public/clips/pov/score-vo.wav → out/pov/final_reel.mp4
# launch day: render MachinaPovStore (footer "Now on the App Store · mymachina.app"), same audio
```

**What is schematic.** None of it is the Machina app: the places are the
other apps, drawn as their layouts (the platform named in type, the only
mark the app's own Instagram glyph, no third-party thumbnails, invented
short links), and un-branded on purpose, as in the launch film's act one.
(Round 2, owner: the blank tiles showed.) Every tile carries what those
grids are really full of, made of type, line icons and paper: Instagram's
text-led carousel covers ("10 things to do in Lisbon"), TikTok's white
caption pills over a line-icon subject with a view count; the screenshots
are a chat, a map pin, a list, a post, a boarding pass. Real media was
ruled out: other people's work and faces (rights, and a face reads as an
endorsement), and generated photos cost credits and look uncanny at this
speed. The café hides in plain sight in both grids (Instagram row 3, which
whips past; TikTok's top-right cover on the pan), once each, never on the
desperate scroll's freeze. The gathered saves are the kit's `SaveChip` with the
demo account's titles. No recipe or cooking content (owner, 2026-10-02): the
lost save is a café. The tagline is said once, by the Signature; "Coming
soon" is on screen only, so the launch-day ending needs no new voice.

**Round 2 (owner: "the captions area is too high… more space for showing",
and an Apple-grade pass).** The house band and hook (above): the places
moved up 160px (`HEADER_Y` 576, the search bar at 700). The hook frame
gained the bar's "Recent" history, every way you already tried ("that café
with the blue tiles"); it gives way as the query is typed. "No results" is
an empty state (a faint magnifier). The self-chat's messages scroll under
its fixed header, not over it. The grid's header row had collapsed to zero
width in round 1 (its back and more icons never drew); it spans the frame.
The flicks up the grids are thrown (`EASE_FLING`). In the gather the café is
no longer one of the crowd: it is the last save home, gliding in from the
left, slowing to be read ("That Lisbon café"), then joining the point on its
last pulse. Timing, voice and score are unchanged.

**Round 3 (owner, three edits; voice, music, effects, colours, type and the
end card untouched).**
1. *The punchline on screen.* "Finding it again is." is now the caption's
   third line, rising on its own word (cue: the spoken "Finding", 18.78s)
   in the same type and motion as the two above it, a touch heavier (weight
   760 vs 650, `punch`; the kit's `KineticLine` gained `weights`); emphasis
   by weight, not colour, per the house rule. All three hold to the gather
   at 0:20.7. The one caption allowed past the band's two lines; the top
   panels of the turn drift up half as far so they stay clear of it.
2. *The chat link.* It always read `youtu.be/…` in code, but it passed on
   the fastest stretch of a scroll that sped up into the cut, and the motion
   blur doubled the letters and swallowed the dot ("youtube"). The scroll
   is now quick through the middle and slow at both ends (`EASE_IN_OUT`,
   1,250px), so it settles with the link sharp; the link reads
   `youtu.be/g3LmO…`.
3. *The montage.* Between the two "No results" was one blurred Instagram
   scroll; it is now every place again, readable: Instagram, TikTok, the
   screenshots, the chat, each on screen 13 frames (0.43s), each arriving on
   a thrown swipe up (5 frames, `EASE_FLING`) under a true vertical Gaussian
   blur (an SVG filter, σ ≈ 0.12 × speed, ≤ 60px; a sampled smear showed
   stacked copies at these speeds), then the search swipes back to "No
   results" on the spoken "nothing.". The time came from the first "No
   results" hold (0.73s → 0.40s); nothing from 0:16 moved. The sound under
   it is round 1's (`HITS.scroll/freeze/none2` keep their values, so the
   score is byte-identical); the picture runs on `MONTAGE`. The screen line
   rolls over from "Nothing." to "Still nothing." on the spoken "Still"
   (`then`, screen-only: no re-voicing).

Sync, measured on the final file two ways (the takes alone, and the mix
with consonants included; a 300–3400Hz band misses the S and F by ~0.1s):
"Still" is heard at 15.13–15.16s, its line's ink appears at 15.10s and is
in at 15.17s; "Finding" at 18.78s, its line appears at 18.73s and is in at
18.80s. The house lead (the eye a few frames ahead of the ear), both times.

**Voice.** Gemini TTS Sulafat, warm and a little wry, quick at the start and
slower from "Saving was never the hard part." Seven lines, voiced by
`narration-tts.yml` run 27, plus the Signature's shared take. On screen
and spoken differ by design (the owner's script): `text` is the screen,
`say` the voice, and `cues` picks the word each screen line arrives on.

**Measured.** Score loudness by section (RMS): hook −32dB, the hunt building
−30 → −14dB, "Nothing." −26dB, then −29 to −34dB, the turn −25dB, the gather
−23dB, the logo −19dB. The mix −14.01 LUFS, −1.21 dBTP; the Signature's take
found in the mix at its frame (correlation 0.83). The last frame, rendered
lossless, is pixel-identical to `MachinaSignature`'s above the footer
(PSNR ∞; the posting encode 44.2dB). The encode: 900 frames, 30.000s,
H.264 High yuv420p BT.709, AAC 48kHz 320k, 23.8MB in round 2 (13.1MB in
round 1: the filled tiles carry more detail); no brightness jump at the
three range seams; the last frame still pixel-identical to the Signature. Nobody has listened to it on speakers.

## THE APP STORE PREVIEW (2026-10-28/30)

The App Preview video for the 1.0 product page: 28.9s, 886 × 1920, H.264
High L4.0, 30fps, AAC stereo 256k 48kHz, narrated
(`out/preview/Machina-App-Preview-886x1920.mp4`;
`Machina-App-Preview-review-copy.mp4` is a small copy for phones, never the
upload). Apple's spec and rules are in `clips/preview-timeline.mjs`'s header.

**Seven narrated lines over six beats** (the caption is the line), on ONE
phone under ONE camera that follows its framings like an iOS spring; every
change of screen dissolves on that phone (round 8):

1. "Save anything, from any app." The feed opening on Kurzgesagt's
   "Loneliness" and TED's "How Great Leaders Inspire Action". A save
   arrives (round 10: no + tap and no pasted link): **lift**, the feed
   recedes out of focus and the analysis sheet rises off it, already reading
   Wait But Why's "How to Beat Procrastination".
   "Share it straight to Machina. No copying, no pasting." (round 10, owner
   and agreed: how saves arrive, said rather than shown; not "no switching
   apps", which the sheet rising over Machina's own feed would contradict)
   over the stepper's first beats.
2. "Every save, analyzed and summarized." (the caption builds with the
   narration: "Every save," then "analyzed and summarized.") The stepper's
   last beats (Fetching the link, Reading the page, Writing the summary,
   Searching connections, one a second over both lines), all done.
   **Drop**: the dialog settles back into the feed, which racks into focus
   with the new card on top; the card lifts (ringed).
3. "Turn what you save into what you do." The new card cross-blurs into
   Revisit's Do this list as the camera eases down to it, the new save's
   task on top (lifted, ringed).
4. "Ask about anything you've saved." **Tab**: the Ask tab tapped, Revisit
   cross-blurs into Ask. "Briefly, how is procrastination linked to phone
   addiction?" typed, each character fading in. **Send**: the chat
   cross-blurs in as the camera rises to where the answer lands.
5. "Every answer comes from your own sources." The answer resolving into
   focus, citing three saves from three channels (Big Think, Mark Manson,
   TEDx), question to sources on one screen, each source ringed.
6. "And Machina notices which saves belong together." (round 10, owner: was
   "Every save, connected."; "And" is spoken only, tying the answer's
   sources to the graph; the caption reads "Machina notices / which saves
   belong together.") The Graph chip tapped, the answer cross-blurs into the
   graph as it blooms in (the three cited cards lit, each ringed); the phone
   settles back and softens as the Signature's paper rises.

Then the kit's Signature, no footer.

**Rounds.** 1: full-bleed static screens. 2 ("not engaging enough"): one
live save, a camera, rings, a groove. 3: a short Ask answer, new captions,
no footer, no scroll footage. 4: re-shot on a clean feed, seven narrated
beats, the graph only once settled. 5 (owner): "Every answer comes from your
own sources." (re-voiced); Ask cites three different sources; the analysis
stepper shown (an article, so the stepper runs: a video save shows a
progress bar instead); the opening feed diversified (the four Mark Manson
test cards archived on the review account, the four test tasks removed from
Do this); the key-moments beat dropped (the saved article has none, and the
only key-moments footage was a Mark Manson card); the settled graph held as
one frame (it still twitched, ~50/255 jumps every few frames). 6 (owner):
the stepper's favicon painted out. 7 (owner: "the transitions are jittery
and low quality, dated and boring"): measured first. The screen flipped to
the Add dialog's black backdrop in one frame (64% of the pixels at once) and
back in one frame (69%), and every scene change was a 10-frame dissolve
between two differently framed phones (two slabs, two shadows, two texts
ghosting: the house's own "never dissolve between takes"). Rebuilt as one
phone and the moves above, from frame sequences (any frame of the 60fps
takes at any output frame, at the capture's full 3px a point) instead of cut
clips, with a real shutter. 8 (owner: "all transitions within Ask are super
abrupt; the clip is very jumpy; smooth everything out, effortless and
natural, yet modern and advanced"; and "the first line's narration is too
slow and too enunciated"): measured first. Round 7's camera started and
stopped 13 times, peaked at 745px a frame and jolted on the send, the dive
and the gather; ~15 changes of screen landed in one frame. Now the camera is
a critically damped spring after a ramped target path (peak 24px a frame,
5 moves, no kick: `follow` in `Preview.tsx`), every change of screen is a
crossfade (the app's small changes) or a cross-blur (a new screen: the two
only overlap out of focus), the typed question fades in character by
character, and the dive and the gather are gone. The hook re-voiced as an
everyday conversational read (~180 wpm, the comma a brief beat): 1.78s, was
2.6s. 9 (owner: "some frames are too zoomed in, you are cutting off text";
"what is that bottom bar with the arrows and checkmark? get rid of it"; "a
complete round of polishing"): the whole phone's width is in frame at every
hold (z ≤ 2.4, centred: verified on every frame, no word of a screen's
16–424pt text is ever cut), which retired the "manageable" match (holding
the word on one pixel needed z 2.95); iOS's keyboard accessory bar is
painted out of the Ask frames. 10 (owner: "what if we just skip the frame
of pasting a link?", then a line on how saves arrive): the + tap and the
paste are gone, the new line is voiced in the hook's natural register
(3.09s), the stepper spreads over both lines; 28.9s.

**Motion blur is a real 180° shutter.** Where the camera moves, a frame is
rendered at several instants across half a frame (one exposure every ~1.5px
of travel, up to 48: `SHUTTER_COUNTS` in `Preview.tsx`) and the exposures are
averaged in floating point (`scripts/preview-render.mjs`). A dive smears
outward from the point it dives into; a hold has one exposure and is never
blurred. Summing exposures inside the browser was tried first and dropped:
Chrome rounds to 8 bits at every exposure (text tones drifted by up to 4
levels at 8 exposures, and worse with more).

**Everything on screen is the real app**: the iOS Simulator (iPhone 17 Pro
Max, Debug build of `main` at `0db534f2`), signed into the review account, on
the live backend. The camera only frames it: holds keep every word in frame
(a full-width screen's text spans 16-424pt: z ≤ 2.65px a point), the match
and the dive go closer by design, and below 3px a point (the capture's own)
nothing is upscaled. Retimes, all of real footage: the build and answer waits
are cut, only the stepper's forward steps are used (in the take it fell back
from "Searching connections" to "Writing the summary" once), "Searching your
library..." is cut (brand ban), the typing's 60fps steps are shown two frames
each, the settled graph is one held frame. **Presentation liberties**, none
of them the app's pixels: the Add dialog is lifted off the screen (its
pixels and the feed's, never the app's black backdrop, so the grade never
flips; the house Save scene's rule), its top held still while the keyboard
would move it; changes of screen dissolve; when the typed question wraps,
the still empty state above the composer is kept from the step before (the
app nudges it up 12pt). **Two pixel edits**, both owner requests: the site's
favicon in the stepper (round 6: "this logo next to Wait But Why is ugly")
is painted out with the sheet's own white (`PATCHES`; kit
`TOKENS.captureWhite`, the 253 a simulator capture encodes, so no seam), and
"waitbutwhy.com" lines up with the step labels; iOS's keyboard accessory bar
(round 9: "what is that bottom bar with the arrows and checkmark?", the
simulator's ∧ ∨ ✓ while the composer has focus) is painted out of the Ask
frames with the page's own colour (`SCREEN_PATCHES`; kit
`TOKENS.capturePage`).

**Choosing a save:** check the thumbnail first
(`https://i.ytimg.com/vi/<id>/mqdefault.jpg`); Apple bans profanity in
previews. Ask's backend cold-starts: the first asks after a quiet spell can
fail in the app ("Couldn't reach Machina"); relaunching the app and asking
again worked.

    node capture/preview-frames.mjs        # the takes' frames the edit uses → public/clips/preview/frames/
    GEMINI_VOICE=Sulafat <venv>/bin/python audio/synth-vo.py preview   # from the committed takes
    node audio/preview-score.mjs && node audio/mix-vo.mjs preview
    node audio/house-verify.mjs preview && node scripts/preview-stills.mjs
    node scripts/preview-render.mjs        # every exposure, averaged → out/preview/master.mp4
    ffmpeg -i out/preview/master.mp4 -i public/clips/preview/score-vo.wav -map 0:v -map 1:a \
      -vf "scale=886:1920:flags=lanczos,format=yuv420p,setsar=1" -r 30 \
      -c:v libx264 -profile:v high -level:v 4.0 -preset slow -b:v 11M -maxrate 12M \
      -bufsize 22M -x264-params keyint=30:min-keyint=30 -color_primaries bt709 \
      -color_trc bt709 -colorspace bt709 -color_range tv -c:a aac -b:a 256k -ar 48000 \
      -ac 2 -shortest -movflags +faststart out/preview/Machina-App-Preview-886x1920.mp4

One colour matrix end to end (round 7): BT.709, video range, tagged. Rounds
1-6 rendered BT.601 full-range JPEG frames and tagged the upload BT.709, a
small hue shift on saturated colours.

The takes (`capture/preview-frames.mjs` header): `xcrun simctl io <device>
recordVideo --codec=h264`, made 60fps CFR, in `out/preview-takes/` (W60 the
save through Revisit, X60 Ask through the graph). Not in git.

**Poster frame:** set it to 0s in App Store Connect (the hook over the
feed). Apple's default, 5s, lands mid-stepper.

## LATER NEVER COMES (the Instagram Reel, 2026-10-31)

`MachinaLater` is the organic Instagram Reel built on THE APP STORE PREVIEW:
24.0s, 1080 × 1920, narrated, music-led, on the house rules (branch
`claude/instagram-reel-app-store-012mo2`, on the preview's a35f6c1e; video
work merges only after the owner reviews the cut). `MachinaLaterStore` is the
same reel with launch day's footer, `MachinaLaterSilent` the picture alone.
**The idea:** everyone saves things for later, and later never comes; Machina
reads what you share to it, and it pays off. Owner-approved wording:

| Time | Picture | Caption = voice |
|---|---|---|
| 0:00 | The cover: Safari's share sheet on a plain-text passage of the Wait But Why article, Machina first in its row; a slow push | **Saved it for later?** (the house hook, big) |
| 0:01.9 | | **Later never comes.** (rising on its word) |
| 0:03.0 | The tap on Machina; the groove drops; Machina's own share card reads it: Reading the page, Writing the summary, Searching connections, "Saved ✓" | Share it to Machina, / and it reads it for you. |
| 0:06.5 | Cross-blur into Revisit: the article's task tops Do this, lifts, ink ring | It even tells you / what to do with it. |
| 0:09.0 | The Ask tab; "Briefly, how is procrastination linked to phone addiction?" types itself; send | Ask about anything / you've saved. |
| 0:12.0 | The answer; its three sources ring on "Sources included." | It answers from your own saves. / Sources included. |
| 0:15.5 | The Graph chip; the graph blooms, the three cited saves lit | And it notices / which saves belong together. |
| 0:19.0 | The kit's Signature, footer "Coming soon · mymachina.app" (launch day: "Now on the App Store · mymachina.app") | (the Signature's take) |

**Why it is built this way (the owner asked for the best practice of the
most viral tech Reels, made to the standard of Apple's social team).**
Instagram's insights measure a 3-second skip rate, and its ranking reportedly
leads on watch time, then sends per reach, then likes per reach: so frame 0
is both the cover and the hook, the voice starts on frame 4, and the app is
moving by 0:03. Sends come from recognition: the hook is a habit nearly
everyone shares. Instagram tells creators to keep Reels short and recommends
less often a Reel whose picture is mostly text: 24 seconds, something new
every 1–1.5s, never more than two short rows of type. Business accounts get
only Meta's Sound Collection and Instagram ranks originality: the score is
the house synth, original. The profile grid crops covers to 3:4 (the centred
1080 × 1440): the hook sits inside it and inside Meta's safe zones. Apple's
craft is restraint: one phone, one statement at a time, the answer with its
sources the longest hold. A second hook for a Trial Reels test ("You'll save
this reel / and never see it again.", same body) was offered, not built.

**What it shows, and what it never shows.** The ads brief (SOURCE_OF_TRUTH
§8) rules out third-party images and real people endorsing. The preview's
feed shows YouTube thumbnails (Kurzgesagt's art, a TED speaker's face), so
this reel never shows the feed: not the opening, not behind the lifted sheet,
not under the new card. Checked in the app's code at the takes' build
(0db534f2): articles never get an image; the share card and the in-app
stepper show only the site's favicon (painted out, the preview's round-6
precedent); Revisit's Do this rows carry no images by design (the Reminders
rows above them can: framed out); Ask's source chips are the app's own
platform marks and names in type; the graph is plain discs. Not yet checked
on the new take's frames.

**The takes.** W and X are the preview's (`out/preview-takes/`; the reel
reads Revisit from W, all of Ask from X, and shares the preview's frame cache
in `public/clips/preview/frames/`). **S is new: the share sheet.** Record it
the preview's way on the same simulator (iPhone 17 Pro Max, review account,
status bar overridden, light): Safari on the Wait But Why article ("How to
Beat Procrastination"), scrolled to a passage of plain text (no drawings);
••• → Share; the share sheet up and still for two seconds; tap Machina (a
Favorite, first in the row); let Machina's card run to "Saved ✓". That
article is already saved on the review account, so archive its card first
and restore it after (delete the new one), or the card says it is already
saved. `xcrun simctl io booted recordVideo --codec=h264 S.mp4`, then
`ffmpeg -i S.mp4 -vf fps=60 -crf 8 out/later-takes/S60.mp4`. Then measure
its marks into `S` in `clips/later-timeline.mjs` (the sheet still, the tap,
each step, "Saved ✓"), the tap's position into `TAPS`, and the two icons to
paint out (the page's icon in the sheet's header, the favicon in Machina's
card) into `SCREEN_PATCHES`. `audio/later-verify.mjs` fails until they are.

**The voice.** Gemini TTS, Sulafat, every line directed as a person talking
to a friend at ~175 wpm (narration-tts runs 77–78). Measured in syllables a
second (words a minute misleads on short words): the approved preview's
conversational lines run 4.6–5.6. The first takes: the to-do line ran 8.1
(rushed) and the hook dwelt on "later?" (3.3); both were re-voiced; the
to-do line still ran 7.0 and is eased to 0.82 in assembly (`tempo`, Rubber
Band, formants preserved: 1.83s, 5.5 a second). Content checked with
PocketSphinx (its bundled model: HuggingFace is not reachable from a cloud
session): every line says its words.

**Measured.** The mix: −14.01 LUFS, −1.26 dBTP; every line 8.0–17.8dB over
the music in the speech band; the Signature's take in it (0.83). Against the
approved preview's mix, the groove put 4.4dB more energy below 100Hz; trimmed
to +3.3 (phone speakers barely play it). The camera (computed exactly as
rendered): peak 27.4px a frame (the preview's: 24), its speed never changing
more than 2.3px a frame in one frame; zoom at most 2.23px a point (the
screen's text clear of Meta's 65px margins up to 2.33). Every lift and ring
inside the safe zone below the band for its whole life. The type: the widest
row 772px of the 950 between the margins; the hook's ink from 276px (Meta's
top 14% ends at 269). The Ask tab's tap lands at y 1722px, under Instagram's
caption: seen, not key.

    # the frames (needs out/preview-takes/{W60,X60}.mp4 and out/later-takes/S60.mp4)
    node capture/take-frames.mjs later
    GEMINI_VOICE=Sulafat python3 audio/synth-vo.py later        # from the committed takes
    node audio/later-score.mjs && node audio/mix-vo.mjs later
    node audio/later-verify.mjs && node audio/house-verify.mjs later
    node scripts/later-stills.mjs                               # + -guides.png: safe zone, 3:4 crop
    node scripts/shutter-render.mjs later                       # every exposure, averaged → out/later/master-soon.mp4
    node scripts/shutter-render.mjs later --ending store        # only the Signature's frames → master-store-tail.mp4
    node scripts/later-encode.mjs                               # posting files (the tail joined in the same pass) + review copy + frame-by-frame check
    node capture/take-events.mjs out/later-takes/S60.mp4         # (before the frames) where take S changes: its marks

**Dry run (2026-10-31, this container, numbered stand-in frames in place of
the takes; nothing of it kept):** the whole picture pipeline ran end to end:
1,295 exposures (176 frames with a shutter, at most 10) averaged into 720
frames in ~5 minutes on 4 cores; the launch-day tail; both posting files
H.264 High 1080 × 1920 30fps BT.709 video range, AAC 48kHz; the review copy.
It found two bugs, both fixed: an unmeasured take read as its frame 0, and a
splice that cost the store file a generation.

`scripts/frame-jumps.mjs <video>` is the owner's frame-by-frame check on any
render: a frame that changes more than three times both frames beside it
(SPIKE), a frame its neighbours agree without (FLIP), or 8% of the picture
changing by more than 24 levels at once (STEP). It passes the reel's type
and Signature over paper, and catches a single frame swapped in.

## SAME SCREENSHOTS (the before-and-after Reel, 2026-11-01)

`MachinaShots` is the owner's F04 idea ("before and after: your
screenshots"), refined: 25.0s, 1080 × 1920, narrated, music-led, on the
house rules (branch `claude/reel-screenshots`, on LATER NEVER COMES'
c8fdeb85; video work merges only after the owner reviews the cut).
`MachinaShotsStore` is the launch-day footer, `MachinaShotsSilent` the
picture alone, `MachinaShotsStill` renders the three screenshots.
**The idea:** the same three screenshots in two places. In the camera roll
they are a pile you scroll past and open with no idea why you took them;
shared to Machina, each becomes a card that says what it is, and you find
it again in your own words.

| Time | Picture | On screen | Voice |
|---|---|---|---|
| 0:00 | The cover: two screens side by side, labelled **BEFORE** (the camera roll, "2,847 items", scrolling) and **AFTER** (Machina's feed, still) | **My screenshots, / before and after.** (the house hook, no kicker) | "My screenshots, before and after Machina." |
| 0:03 | The roll's screen takes the frame, Machina's slides away; one long flick lands on the last row: the three, and "2,847 Screenshots" | Before: 2,847 screenshots. | same |
| 0:06.3 | The first tapped open, the roll pushed back; swiped through: a used film camera, a Seneca quote, a pin on a map | No idea why / I took most of them. | same |
| 0:08.3 | The three line up, the mark assembles under them; each one's Share tapped and pulled into the mark (one share, one card), the third landing on "Machina" | So I started sharing them / to Machina. | same |
| 0:10.5 | The mark's point irises open into the real app; the feed reads down past all three and rests on the camera card, whose parts ring as they are named: its title (round 6: was the strip of screenshot in its banner), its category, its summary, its tags | After: analyzed, categorized, / summarized and tagged. | "After: each one is analyzed, categorized, summarized and tagged." |
| 0:15.9 | CUT to Find: the field focuses and waits under a rack focus; "quote about overthinking" types itself on "I just describe it"; the one card it means lands (no word shared), its ink ring | When I need one, / I just describe it. | same |
| 0:18.3 | On "Now", the view pulls back into the cover's pair: BEFORE, the camera roll at its last row (the same three screenshots, "2,847 Screenshots"); AFTER, the card it found | **Now every screenshot / makes sense.** (a touch heavier: the statement) | same |
| 0:20 | The kit's Signature, footer "Coming soon · mymachina.app" (launch day: "Now on the App Store · mymachina.app") | (the Signature's) | (the Signature's take) |

**What changed from the brief, and why.**
- **No recipe** (owner, 2026-10-02: no recipe or cooking content): the
  third screenshot is a Lisbon viewpoint pinned on a map.
- **Three shares, not one.** Sharing several screenshots at once makes ONE
  card (G3, build 1325), so "share those 3 → 3 cards" would be false; each
  is shared on its own, in rhythm. The share is the kit's gesture (a Share
  button tapped, the screenshot pulled into the mark: ShareBeat's
  precedent), not a rebuilt iOS share sheet.
- **The tagline is the Signature's**, never a caption (house rule), so the
  brief's last line "Everything you save, finally useful." is the logo's.
- **"[fill] screenshots" is 2,847**, the number POV's wall already shows,
  and 2,847 = 711 rows of four + 3: the roll's last row is exactly the three.
- **Shot 5 got a line** ("Find it again in your own words."), so the find
  reads with the sound off; the query shares no word with the card (gate).
- **The App Store link** is not live: the footer says "Coming soon", the
  store edition is one render away, and the captions below keep the
  owner's placeholder.

**What is real.** Every pixel of Machina is the shipped app (main at
7bcbbe4), captured by `capture/shoot.mjs shotsClip` on the demo account
(`library.mjs SHOTS`: the cooking saves and Piranesi out, the three
screenshots in, written as the backend files a shared screenshot). The
three screenshots are drawn once (`src/reels/clips/shots/Screens.tsx`,
type, line icons and paper tints; real facts: the Olympus mju II is a 1997
35mm compact with an f/2.8 lens; the line is Seneca, Letters to Lucilius 13;
Senhora do Monte is Lisbon's highest viewpoint, in Graça), rendered to
`public/clips/shots/<id>.png`, and the SAME PNGs are both the roll's tiles
and the images the app's cards show (the capture server serves them at
/shots/). The roll (`Roll.tsx`) is schematic and un-branded, its other 2,844
tiles POV's screenshots. While the query types, the app shows its own
"Searching by meaning…" line under the field: the rack focus keeps it out of
focus, and the two typed frames where live "Close matches" flash cards are
skipped. The result card wears the app's small "Meaning" badge.

**The voice.** Gemini TTS, Sulafat, LATER's direction (a person telling a
friend, ~175 wpm). Round 1 (run 81) sped four slow takes up in assembly
(Rubber Band, 1.08–1.22×) to fit 20.5s, and mixed the 24kHz takes through
`mix-vo.mjs`'s linear resample. **The owner heard it as metallic (round 2),
and both were to blame:** the stretch, and the resample, which mirrored the
voice's top octave into a band above 12kHz only 10.5dB under its body (the
REVISIT clip's "metallic" note, 2026-10-21, same cause). Round 2: no stretch
anywhere; the hook and the new After line re-voiced (run 82) in two
directions each (`CAPTIONS_ALT`, `synth-vo.py shots-alt`) and cast by
measured pace (direction A for both: the hook 2.86s, was 3.43s; After 2.17s);
then FIND THE BOOK's chain, `vo-to-44k.py` (soxr: that band at −63.6dB) and
`vo-deess.py` (at most 3.9dB off one "s"). The natural takes need 14.6s, so
the cut is 21.5s, a second longer than round 1. Nobody has listened to it on
speakers yet.

**Round 2 (owner: "the voice sounds metallic"; "share from any app" is off
the subject, it should be about screenshots).** The line is now "After:
share each screenshot to Machina." ("each", not "all": several shared at
once make ONE card, G3, and the picture shows one share per screenshot).
And a picture pass: the two hook screens are larger (1.2px a point, the
frame's lower fifth no longer empty); the roll scrolls steadily and readably
under the hook (it was a grey smear for three seconds) and only flicks when
it takes the frame (`ROLL`/`rollAt` in the timeline, shared with the score's
ratchet); the share row is larger (0.62px a point); the feed holds a little
longer on each card.

**Round 3 (owner: say more than "a card that says what it is": that each
screenshot is analyzed, summarized, categorized).** The line names what the
app does, in the app's own terms (its image steps are Scanning image /
Reading text / Understanding content / Organizing & tagging,
`web/lib/scanPhases.ts`), and the picture proves each word on a real card:
the verbs run top to bottom as their parts sit on the card, and each part
rings (the kit's Lift and Ping) as it is said, 2 frames ahead of its word:
the screenshot ("analyzed"), the category pill ("categorized"), the summary
("summarized"), the tags ("tagged"). The screen drops "Each one is" (the
picture carries it). The parts are measured in the capture inside the camera
card only (`data-capture-card`: the account has other Travel and Shopping
cards), and the feed now reads down past all three cards to rest on it, so
the product screenshot, never shown large before, is the one that gets the
proof. Cast from two directions (run 83): B, 3.66s (A ran 3.96s). The gate
holds each ring to its word (within 1 frame). 22.0s now.

**Round 4 (owner: "Same screenshots" sounded robotic; "two very different
places" was not clear).** "Places" pointed at nothing a stranger knows at
second zero, and the line described a contrast without naming either side.
The hook now names the two screens in the order they sit: kicker "SAME
SCREENSHOTS", big "Camera roll / vs Machina." (the "X vs Y" format, and the
TikTok caption's own words); the difference is left to the picture and the
lines after it. The robotic read came from opening on a bare two-word
fragment with a full stop (that take drew "screenshots" out over a second);
the voice now says one flowing sentence, cast from three readings (run 84)
by a pitch-movement measure that separates the robotic take from LATER's
approved hook (`natural.py`-style: semitone range and frame-to-frame
movement): "Same screenshots: your camera roll, versus Machina." Its opening
moves 59.5 (range 11.3 semitones) where the robotic one moved 36.1 (8.5);
2.93s. The other two: "…two places: your camera roll, and Machina." ran
3.83s; "…Camera roll, or Machina?" was as flat as before.

**Round 5 (owner: "the first half doesn't make sense: we say camera roll vs
Machina, and then before and after. It's a whole mess").** It was: two
framings at once (a side-by-side "vs" and a timeline), "After:" put on a step
("share each screenshot") while "Before:" named a state, and the speaker
changing from "I" to "your" to a command. Now one spine, **before and after**
(the reel's own title, F04, and the order the picture already runs in), in
the **first person** throughout. "Before:" and "After:" both name a state;
the share is the hinge between them ("So I started sharing them to
Machina."), true however they are shared. The cover labels the two screens
BEFORE and AFTER under "My screenshots, before and after.", so it reads as a
before-and-after with the sound off. Every row is the voice's words except
the cover (drops "Machina": the right screen wears the wordmark) and the
After line (drops "each one is": the full row is 1028px, past Meta's 950).

Voice (runs 85 and 86): each new line voiced in two directions and cast by
pitch movement against LATER NEVER COMES' six approved lines (movement 50 to
65, range 9.4 to 18.5 semitones), never sped up: the hook 57.9 / 15.8 (its
other reading came back flat, 26.6); the hinge re-directed after two flat
readings and cast at 62.7 smoothed; the After line 49.7 / 12.4; the payoff
calmer than LATER's lines but livelier than round 4's accepted "Find it again
in your own words." (21.9 against 14.5, smoothed). Directions with "quietly",
"matter-of-fact" or "easy" came back flat; "warmth", "a smile", "a little
wonder" did not. 16.2s of voice; the cut is 23.0s.

The row widths in this README's earlier rounds were measured with the font
loaded by `file://`, which silently fell back to another face and measured
short (a 1028px row as 893px); `shots-verify.mjs` now embeds the font and
gates every row at 950px. `later-verify.mjs` loads it the old way, so its
width check may be measuring the fallback too.

**Round 6 (owner: the ring on "analyzed" made no sense; two seconds more
for a stronger close, and revise the find line).** "Analyzed" rang the
banner's strip of screenshot: a clock and two buttons, nothing about
analysis. It rings the card's title now, "Olympus mju II film camera, €189",
the clearest proof the screenshot was read (measured as the text's own
extent, `::phrase`, not the h3's full-width box). The find line says the
mechanism, "When I need one, I just describe it.", and the query types
itself on "I just describe it" (the focused field waits under the rack
focus until then). The close is new: "Now every screenshot makes sense.",
which answers the opening's "No idea why I took most of them" and never
says the tagline (the Signature's "finally useful" follows it), set a touch
heavier, over a callback to the cover: on "Now" the Find screen pulls back to
AFTER while the camera roll returns to BEFORE at its last row, so the same
three screenshots sit on the left as tiles while the one found sits on the
right as a card. Both lines cast from two readings (run 87) by pitch
movement: 47.8 and 61.7 (the close's other reading came back flat, 33.3).
25.0s; gates hold the typing to "describe" and the pull-back to "Now".

**Measured (round 6).** `node audio/shots-verify.mjs`: bans clean on 28
strings and on all 106 distinct texts of the 329 captured frames; Find
shares no word with its card; every line inside its window; every row inside
Meta's margins (the widest 780px of 950, the statement measured at its
heavier weight); the third share lands on the spoken "Machina" (frame 310
both); the card's four parts ring on their words (within a frame); the
query types on "describe" and the close pulls back on "Now"; every line
14.4–24.6dB over the music in the speech band; the mix −14.01 LUFS,
−1.22 dBTP. `node
audio/house-verify.mjs shots` passes (the Signature take in the mix at 0.81).
`scripts/frame-jumps.mjs` flags only frames that are meant: the hard cut to
Find, on the beat, and the app swapping the feed for search as typing
starts, under the rack focus. (Round 1's pass also caught the iris finishing
in two frames, the result card popping in one frame because the capture
waited in real time and missed the app's card-enter, and the ring's Lift
re-rastering on a still frame; all three fixed.) **One deliberate
difference:** lines leave 0.2s after their last word, not the house 0.3s;
six lines in a 15–20s brief had no room for 0.3s at every boundary (the
gate says so in its header).

```bash
# the screenshots, once (and again if Screens.tsx changes; then re-capture)
for id in camera seneca viewpoint; do npx remotion still src/index.ts MachinaShotsStill public/clips/shots/$id.png --props="{\"id\":\"$id\"}" --image-format=png; done
# today's app
git worktree add --detach <dir> origin/main && (cd <dir>/web && npm ci)
CAPTURE_WEB=<dir>/web node capture/build-app.mjs
CAPTURE_ONLY=shotsClip node capture/shoot.mjs && git checkout src/reels/data/takes.json
GEMINI_VOICE=Sulafat python3 audio/synth-vo.py shots     # from the committed takes
python3 audio/vo-to-44k.py out/vo/shots && python3 audio/vo-deess.py out/vo/shots   # never skip: the mix's own resample sizzles
node audio/shots-score.mjs && node audio/mix-vo.mjs shots
node audio/shots-verify.mjs && node audio/house-verify.mjs shots
npx remotion bundle src/index.ts --out-dir=out/shots/bundle
# render + encode: the recipe is in scripts/shots-encode.mjs's header
node scripts/shots-encode.mjs     # posting files, review copy, frame-by-frame check
```

In a cloud container the Chromium paths differ from the Mac's: pass
`--browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`
to Remotion and `CAPTURE_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` to the capture.

**Captions for posting** (round 5: the reel's own story, first line = its
hook, which is all a feed shows before "more"; a question to invite comments;
no emoji; the link stays a placeholder until the listing is live):

- Instagram:

  > My screenshots, before and after Machina.
  >
  > Before: 2,847 of them, and no idea why I took most.
  > After: each one analyzed, categorized, summarized and tagged. When I need one, I just describe it.
  >
  > Now every screenshot makes sense.
  >
  > How many screenshots are in your camera roll right now?
  >
  > Download on the App Store: [App Store link]
  > #screenshots #iphone #productivity

- TikTok: "My screenshots, before and after Machina. How many are in your camera
  roll? Download on the App Store: [App Store link] #screenshots #iphone
  #productivity"

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
