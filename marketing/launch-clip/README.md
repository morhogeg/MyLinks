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
rest → nothing worth keeping stays buried.** The film introduces Machina with
the App Store subtitle ("Machina. Never lose another great find.") and closes
on the tagline, "Everything you save, finally useful.": problem → Machina →
payoff (owner, 2026-09-28: every launch film ENDS on the tagline, once). It deliberately avoids two framings the
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
| 29–32 | 1:12.5 | `Endcard` | The bare mark, the wordmark, the tagline (`Everything you save, finally useful.`), which the voice-over also speaks after the name |

`Capture` / `Ask` / `Connect` print as a letterspaced kicker above the line on
their own beats, so a viewer can place each act inside the film's three acts
without being told. (They were the App Store subtitle until 2026-08-26; the
kickers keep the act names. The subtitle is now the introduction's line and
the endcard carries the tagline, 2026-09-28.)

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

The endcard carries one line, the TAGLINE, `Everything you save, finally
useful.` (exact wording, comma and period; set in the endcard's letterspaced
capitals), and the voice-over says the name and then the same words, nothing
else under it (owner calls 2026-09-17 and 2026-09-28). Why the tagline and not
the App Store subtitle: the tagline is the fixed brand line, while the
subtitle is store copy that can change with search tests and would leave every
posted film out of date. The subtitle, "Never lose another great find.", is
the introduction's line instead; the tagline appears ONCE, at the end
(`npm run verify` fails a film, reel or clip that repeats it earlier or ends
on anything else). The space under the line is the slot for a real App Store
badge or URL once the listing is live. Nothing else
in the film claims availability.

# Reels

## The highlight reel (pilot)

`MachinaReel` is an 81.6s vertical reel: the problem → "Introducing Machina.
Never lose another great find." → "Save anything, from anywhere." (shares
from YouTube, Instagram and Safari into the mark) → "A link, a screenshot, or
a note." (the Add dialog's tabs) → "Machina reads it, summarizes it, and files
it." (the five phases) → the new card, opened → Find → Ask → Connect
→ the weekly recap, read → "Machina. Everything you save, finally useful."
(2026-09-28, owner: every launch film ends on the tagline, once; the reel's
earlier "All your saves, finally useful." became the subtitle). It has
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
| 288–456 | `Hook` | They collapse into the point (320), the brackets snap (336); "Introducing Machina." (the drawn wordmark under the mark), the `name` hold (416–448), "Never lose another great find." |
| 456–648 | `ShareBeat` | "Save anything, from anywhere.": YouTube, Instagram and Safari saves shared into the mark (the `share` hold) |
| 648–736 | `Hook` → `Save` | The point drops to become the **+** (the iris opens at 688), the + is tapped, Add to Machina |
| 736–880 | `SaveModes` | "A link, a screenshot, or a note.": Link, Image, Note, back to Link, the link pasted, Save tapped |
| 880–1008 | `Save` | "Machina reads it, summarizes it, and files it." over the five real phases, an 8th apart; saved; the dialog drops; the card lands (992) |
| 1008–1200 | `CardDetail` | The new card opened: summary, **Key Points** (the `card` hold) |
| 1200–1360 | `Find` | "easy dinner, empty fridge" → the one card it means (1264; lingers 1280–1320) → tap Ask |
| 1360–1696 | `Ask` | The question → the answer and three sources (1504–1552; lingers 1560–1620) → the dive into the Graph chip |
| 1696–1808 | `Connect` | The real graph (60fps; lingers 1744–1772); tap Revisit |
| 1808–2254 | `Recall` | "Do this" (to 1952), then "This week in Machina", opened (1968) and read slowly: write-up, themes, Standout, question; thrown out into the lockup |
| 2240–2448 | `End` | The mark launches (strike 2284), "Machina" (the wordmark), "Everything you save, finally useful." in Geist (50px, one line), held |

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
line, the tagline, or a tagline used anywhere before the end; an em dash, a literal
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

## Feature clip: REVISIT ("what you save comes back to you")

`MachinaClipRevisit` is a 55.5s vertical clip, the reel's companion, built
from the kit plus one new kit primitive (`kit/scroll.ts`, below) and optional
kit props (rounds 3 and 4). It opens on the PROBLEM (round 4), then one
continuous use of the real app (take `revisitClip`), whose clock starts at
`OPEN` (256): the scenes read `f - OPEN`, captions and the score are absolute.

| Frames | What it does |
|---|---|
| 0–176 | THE PROBLEM (`Opening.tsx`): ten real saves where they were kept, legible from frame 0; "You save things to come back to later." / "But most of them, you never open again.", and they bleach into the paper on "never" |
| 176–256 | THE TURN: "Machina brings them back to you.": they gather into one point just after the name, the brackets snap round it (the mark), and the point opens as an iris onto the Revisit tab |
| 256–380 | "Due now": a reminder set on Four Thousand Weeks lifts on "when you want them" ("Your saves come back when you want them."); the chapter word REVISIT arrives with this line |
| 384–704 | (round 5) USE: its bell opens the reminder's own sheet ("Later today, this weekend, or three times, so it sticks."; the top row, the app's tomorrow / 1 week / 1 month, lifts on "three times"); closed with its X; the save opens on its summary and the camera goes down to its Key Points ("Open one, and the key points are already there."); back to the list |
| 704–896 | The "Do this" list: "When a save calls for action, Machina turns it into a to-do."; The Tail End's row lifts; a step is ticked off at 848, the app's "Marked as done" toast in frame |
| 896–1024 | Into the reading window; "This week in Machina" tapped open at 944; it unfolds on "Every week," and rises on "Machina brings back what's worth remembering." |
| 1024–1264 | The recap READ: the write-up held, the two themes and their saves on "The themes of your week," (each hold drifts: `CREEP`), then ONE glide onto the Standout |
| 1264–1376 | The Standout lifts; its question is read in silence |
| 1376–1472 | The Standout tapped: The Tail End opens, the camera easing up to its title |
| 1472–1664 | Thrown out into the lockup: "Machina. Everything you save, finally useful." |

Everything is in OUTPUT frames on the reel's grid (112.5 BPM, 16 frames a
beat); 60fps app motion plays one captured frame per output frame (the
reel's K = 2). Lines start on beats; taps, lifts and the strike on 8ths.

**Its own files** (so the four clips merge without touching each other):
the clock `clips/revisit-timeline.mjs`; the scenes
`src/reels/clips/revisit/` (registered in `src/Root.tsx` by one line); the
take `revisitClip` in `capture/shoot.mjs`; the narrator
`python3 audio/synth-vo.py revisit` (→ `out/vo/revisit/`,
`src/reels/clips/revisit/vo.json`); the score
`audio/clips/revisit-score.mjs` (→ `public/clips/revisit/score.wav`,
gitignored) and `node audio/mix-vo.mjs revisit` (→
`public/clips/revisit/score-vo.wav`, committed, mastered to −14 LUFS);
the gates `audio/clips/revisit-verify.mjs` (run by `npm run verify`).

```bash
CAPTURE_ONLY=revisitClip npm run reel:capture    # after reel:app; the take (~130MB PNGs)
python3 audio/synth-vo.py revisit                # only after a line or its timing changes
node audio/clips/revisit-score.mjs && node audio/mix-vo.mjs revisit
npm run verify
npx remotion render src/index.ts MachinaClipRevisit out/machina-clip-revisit.mp4
```

`src/reels/data/takes.json` is generated: `npm run reel:capture` rewrites it
from every take on disk. If two clip branches both add a take, resolve the
merge by keeping both takes in `capture/shoot.mjs` and re-running the
capture, not by hand.

**Found while making it (measured, not eyeballed):**
- **The capture's scroll snaps to whole points.** Its even 2.99pt steps land
  as 3pt with two 2pt steps in 281, and a camera correction that assumes
  even steps hops 2.3px at each (the first cut had one on the rise). The
  reel's own recall take has five 5pt steps among its 6pt ones and
  `scenes/Recall.tsx` assumes 6pt, so the reel's recap read carries five such
  hitches; the reel was left exactly as it is (the clip's rule), and
  `kit/scroll.ts` is the fix if a later round wants it.
- **The camera's correction moves the fixed chrome too.** So the recap is read
  from a window where the app's header sits under the band's solid paper and
  its tab bar below the frame, and the camera only leaves it once the page
  has stopped.
- **One motion, not two.** The last read and the move onto the Standout first
  ran as a scroll that decelerated to ~5px a frame and a camera move that
  accelerated again; they are now one eased glide (`GLIDE`), the page taking
  the first 293pt and the camera the rest.
- **The first frame after a click is unchanged.** The Standout's tap now
  lands on the next one, the first frame the app visibly answers.

**Round 2 (a finishing pass with fresh eyes; script, order, lines, length
and every frame boundary unchanged).** Measured on the render:
- **The themes hold was dead still for a full second** (frames 380–409, no
  frame-to-frame change): the reading window's "breath" was 0.03 of zoom
  over nine seconds. Widening the zoom would bring the app's chrome into the
  window, so the PAGE drifts instead: while a read is held it creeps on a
  few points (`CREEP`: 12 under the write-up, 9 under the themes), rest to
  rest, so the reads around it start and end exactly as before. Measured
  after: the holds move up to 0.7 and 0.9px a frame, nothing is still
  outside the end card. `npm run verify` now fails a hold between reads with
  no creep.
- **Left as they are, deliberately:** the end card's last 1.7s is still, as
  the reel's is (the lockup is shared and owner-approved); the paper's soft
  pools show faint one-code-value rings when a still is contrast-stretched
  tenfold, in the render and slightly blockier in the encode. That is the
  shared `Paper` (round 13's dither), and changing it would change the
  reel's pixels, which this pass must not.

**Round 3 (owner, on round 2: "too thin, expand a bit more about this
feature"; "why is there a huge white gap at the top?"; then, 2026-09-28,
every launch film ends on the tagline).**
- **More of the feature, all real.** Revisit now opens on "Due now": a
  reminder the user set (the app's Remind me: Smart review, or a day) comes
  back under it ("Set a reminder, and a save comes back when it's due.", a
  new line), and after the to-do line a step is ticked off: the app removes
  the row and shows its own "Marked as done" toast, framed in shot. The recap
  and the Standout opening its save follow unchanged (+208 frames).
- **The gap.** The reel keeps its type at 290 / 346px so Reels and TikTok's
  top UI never covers it, and scrims the app to 720px; played anywhere else
  that reads as a dead band. The clip sets its own, higher: kicker 200, line
  256, scrim solid to 420 and clear by 600, the app aimed just under it (the
  kit's `Captions` take `slots` and `BandScrim` a `band`; the defaults are
  the reel's, which renders exactly as before for this change). The kicker
  still sits below the top ~10% those apps cover.
- **The tagline close.** The lockup's line is now "Everything you save,
  finally useful.", set at 50px (`Lockup` `lineSize`) so it stays on one
  line; the last melody note moved after "useful.".

**Round 4 (owner: "the current one is good, but there is no proper opening:
present the issue, then our solutions").** An 8.5s opening in the reel's hook
language (kit `SaveChip` and `MarkAssembly`; `Opening.tsx`): the habit ("You
save things to come back to later."), the problem ("But you rarely go back
to them.", the film's honest "rarely", not "never"), and the turn ("Machina
brings them back to you."), the saves gathering into the mark whose point
opens as the iris onto the app. The saves shown are the ones Revisit brings
back later (Four Thousand Weeks, The Tail End, the tomato sauce, the V60
video, Piranesi). Frame 0, the poster a feed shows, already reads (the
cascade into focus began before it). The app part is unchanged, 256 frames
later. verify now requires the clip to open on the problem, with the chapter
word only after it.

**Round 5 (owner: "add a bit more info, to show the usefulness"; both beats
approved).** USE, 5 bars spliced in after "Due now" (`USE` in the timeline;
every later event moved by `USE.len`): the due save's bell opens its
reminder's own sheet, where Smart review lifts ("Smart review brings it back
after a day, a week, and a month.", matching the app's "Tomorrow · then 1
week & 1 month"); its X closes it (in frame, where Cancel is not); the save
opens on its summary and the camera goes down to its Key Points ("It comes
back as the point, not just a link."); "‹ Revisit" back to the list (under
the band, so no drawn tap). The demo card Four Thousand Weeks now carries
three Key Points (`capture/library.mjs`, no "Do this": the list is
unchanged). The camera's return to the list is 48 frames (32 peaked at
47px/frame).

**Round 6 (owner: "the beginning is terrible… why focus on smart review? What
is 'it comes back as a point'? Fix the entire beginning").** Same shots, the
writing redone in plain, benefit-first words: no menu names, nothing a
viewer has to decode. "But most of them, you never open again." (they bleach
on "never"); "Your saves come back when you want them."; "Later today, this
weekend, or three times, so it sticks." (the three-times row lifts on "three
times"); "Open one, and the key points are already there."

## Meta ad 3: "The screenshot that becomes a to-do" (TODO)

Branch `claude/ad-todo`. One of three short ads for Instagram and Facebook
(Reels, Stories, Feed), made from the kit. The idea: people screenshot advice
and never act on it; Machina reads the text in the screenshots, keeps the key
points, and when a save calls for action, turns it into a to-do in Revisit
that you tick off. Both features are free (up to 5 screenshots a card; "Do
this"); the ad names no plan, says no price and no "free", and shows no Pro
surface (no Daily Brew, no weekly recap).

**28.5s** (856 frames). The brief aimed for 15 to 20s; with every beat kept,
and the app at the kit's steady half speed, it would not breathe in less.

| Frames | Beat | Line (burned in and spoken) |
|---|---|---|
| 0–104 | **Hook.** A pile of screenshots, on frame 0 (the poster): the ad's invented carousel "How to ask for a raise" on top, a slide from a talk, a "Sunday reset" note and a packing list under it. They rush into one point; the brackets snap round it: the mark, at 3.5s | "Your camera roll is full of advice you never took." (on screen whole from frame 0; the voice starts at 0.33s) |
| 104–232 | **Save.** The point drops onto the + (the reel's match cut) and Home irises open round it; + tapped; the real Add dialog, lifted off its screen: Image tab, the three slides picked ("Screens of one post, read in this order."), Save | "Save up to five screenshots as one card." (the Image tab's own "Up to 5 screenshots become one card") |
| 216–400 | **Read.** The dialog drops away; the feed's own "Reading 3 screenshots…" card becomes the card; tapped open on the screenshots, the title and the gist, read down to the Key Points, which lift and are held to be read (the page creeps on a few points) | "It reads every slide for its key points." |
| 400–488 | **The step.** (round 2) On down the card to its own "Do this", the step the analysis wrote, which lifts on "action," | "When a save calls for action," |
| 488–576 | **Do this.** A cut on the beat to Revisit as its rows arrive: the same step now leads the to-do list, above The Tail End's and Mark Manson's; it lifts on "to-do" | "Machina turns it into a to-do." |
| 576–672 | **Tick.** The ring is tapped on "tick": it fills with the accent and a check, the task strikes, holds ~650ms, the row folds (the shipped round-4 motion, frame for frame, at half speed); "Marked as done" with Undo is lifted off the bottom of the screen into the frame, over the new "Done 1" | "Then do it, and tick it off." |
| 672–856 | **Close.** Thrown out into the kit's lockup: the mark strikes, the wordmark wipes in on "Machina", the tagline on one line, held 1.7s. Nothing under it: the slot for the App Store badge once the listing is live | "Machina." / "Everything you save, finally useful." |

**Round 2 (owner: "maybe it needs to be a bit more detailed, with more
info").** Inside the 30s limit (27.5 → 28.5s): the card is read on past its
Key Points to its own "Do this", so the viewer sees where the to-do comes
from before Revisit shows it as one (the take's read-down now ends there);
the Key Points are held long enough to read; and two lines now carry facts
("Save up to five screenshots as one card.", "It reads every slide for its
key points.").

**Compositions:** `MachinaAdTodo` (9:16, score + narrator + captions, the main
cut), `MachinaAdTodoMusic` (9:16, score + captions, no narrator: the A/B cut),
`MachinaAdTodoFeed` (4:5, 1080 × 1350, score + narrator + captions);
`MachinaAdTodoSilent` / `MachinaAdTodoFeedSilent` for stills.

**Two shapes, one set of scenes** (`src/reels/ads/todo/frame.ts`, the film's
`useFraming()` idea): the tall cut keeps the line at the kit's 346px slot (out
of Meta's top 270px), scrims the app under it to 490 / 600px, and aims every
tap and hero moment between ~650 and 1240px (above the bottom 670px Meta
covers with the caption, profile and Install button) and 65px in from the
sides; the + sits at 1180 (the reel's opening camera put it at 1595, inside
Meta's bottom zone, so the ad has its own). The Feed cut has no platform UI
over the picture: the line moves up to 130px and the picture rises 190px with
it. Checked on stills of every beat with the zones drawn
(`python3 scripts/ad-todo-sheet.py --zones`).

**What is real and what is scripted.** Every pixel of app UI is the shipped
web app (merged with `main` on 2026-10-02, so Revisit is the round-4 "Do
this" with its Done list), captured as take `adTodo`. Scripted, in
`capture/ad-todo.mjs`: the three slides and the three other screenshots (an
original typographic design made for the ad: no creator, no handle, no
platform chrome, no third-party image; rendered by the capture browser and
copied small into `public/ads/todo/hook/`); the card the backend returns for
the slides (written the way `analyze_images` writes one: a gist, four Key
Points true to the slides, tags, and a "Do this" under the analysis prompt's
rule since 2026-10-02: one sentence, at most 20 words, verb first, one action);
and the other open tasks (The Tail End's, from `library.mjs`, and one true to
Mark Manson's essay). The take removes the recipe cards and their collection
(owner, 2026-10-02) and, for Meta's ad review, the money and workout cards,
and seeds no Daily Brew or weekly recap. The iOS share sheet is not in this ad
(the save is the Add dialog's Image tab), so there is no share beat to swap
for a screen recording.

**Its own files:** `clips/ad-todo-timeline.mjs` (the clock); scenes in
`src/reels/ads/todo/` (one line in `src/Root.tsx`); the take `adTodo` in
`capture/shoot.mjs` with its material in `capture/ad-todo.mjs`; the narrator
`python3 audio/synth-vo.py adtodo` (→ `out/vo/adtodo/`,
`src/reels/ads/todo/vo.json`); the score `audio/ads/todo-score.mjs` (→
`public/ads/todo/score.wav`, gitignored) and two mixes,
`node audio/mix-vo.mjs adtodo` and `adtodo-music` (→ `score-vo.wav`,
`score-music.wav`, committed, both −14 LUFS, true peak −1.2 dBTP); the gates
`audio/ads/todo-verify.mjs` (run by `npm run verify`). `mix-vo.mjs` gained one
option for it, `noVoice` (the music-only master).

```bash
npm run reel:app                               # after merging main
CAPTURE_ONLY=adTodo npm run reel:capture       # the take (~580 frames, ~9 min)
python3 audio/synth-vo.py adtodo               # only after a line or its timing changes
node audio/ads/todo-score.mjs && node audio/mix-vo.mjs adtodo && node audio/mix-vo.mjs adtodo-music
npm run verify
node scripts/ad-todo-stills.mjs && python3 scripts/ad-todo-sheet.py --zones   # review stills, sheets, the poster
npx remotion render src/index.ts MachinaAdTodo out/ads/machina-ad-todo.mp4
npx remotion render src/index.ts MachinaAdTodoMusic out/ads/machina-ad-todo-music.mp4
npx remotion render src/index.ts MachinaAdTodoFeed out/ads/machina-ad-todo-feed.mp4
```

`CAPTURE_ONLY=adTodo` rewrites `src/reels/data/takes.json` with only the takes
whose PNGs are on disk. This branch's `takes.json` is the committed one plus
`adTodo`; the other takes were deliberately NOT re-shot, because re-capturing
`revisitClip` from the merged app (Revisit now has a Done list) would move that
clip's frames under its timeline. When the ad branches merge, keep every take
in `shoot.mjs` and re-capture, as the clips' rule says.

**The ad's gates** (`npm run verify`, on top of the clip rules): the hook is
the first caption, whole on frame 0, its voice heard by 0.5s; the mark by
~3.5s; at most 8 words on screen at once (the hook, the owner's 10-word line,
is the one exception); the close is "Machina." and the tagline exactly, last,
its final word landed 1.6s+ before the end; ≤ 30s; no "share sheet",
"bookmarks", "free", a price, "App Store", "available" or a plan name in what
the ad says; no recipe card, Pro surface or plan legible on any captured frame;
the slides, the card and the tasks pass the same scan, and the card's "Do this"
keeps rule 8; both mixes at −14 LUFS ±0.5, true peak ≤ −1 dBTP.

**Not verified:** nobody has listened to either mix on speakers (measured
only); the ad has not been through Meta's ad review; the app's font here is
Inter standing in for SF Pro (see "Font" above).

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
  picture. A feature clip OPENS on its chapter word: already formed on
  frame 0 (its letters came into focus over the 12 frames before), a beat
  before the first line, then the rule above (`KICKERS` in
  `clips/revisit-timeline.mjs`).
- **The dwell rule.** Text is timed to the voice, never stretched to fill a
  shot: a line leaves 0.3–1.2s after the narrator finishes it. A line that
  names an action still playing may stay until that action lands, at most
  4s past the voice, and says so in the timeline (`until`). When the words
  are done the picture carries on alone; if that leaves a dead stretch, the
  shot is too long, so trim the hold rather than keep the text. `npm run
  verify` enforces the rule.
- **The lockup (`Lockup` in `Brand.tsx`)** uses the drawn wordmark, never typed
  letters. The closing line is a statement (`lineStyle="statement"`): the
  TAGLINE (every launch film ends on it, 2026-09-28) in Geist at 60px, or
  smaller when the line is long (`lineSize`: the tagline is set at 50 so it
  stays on one line) (round 15: the reel's one face; the round-6
  display serif was the only other face in 81 seconds and read as a font
  change, not as emphasis), words coming into focus on the narrator's
  timing, the wordmark wiping in as "Machina" is said.

Layout (**`Captions.tsx`**; a video may pass its own `slots` and `band`, as
the Revisit clip does to sit higher): `SLOTS` puts the kicker at 290px and the line at
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
  and motion blur follows the net motion (camera + scroll). **`steppedScroll`**
  (`kit/scroll.ts`) does it: ease the read in page POINTS and it returns the
  nearest captured step and the correction, from each step's MEASURED
  position (a capture's steps are not even: the browser snaps a scroll to
  whole points, and assuming even steps hops 2.3px at each short one).
- **Read with the chrome out of frame.** The correction moves the whole
  captured screen, the app's fixed header and tab bar included, so a stepped
  read is framed with the header under the band's solid paper and the tab
  bar below the frame (the Revisit clip's reading window); the camera leaves
  that window only once the page has stopped.
- **A read that runs out of page hands its motion to the camera** in one
  eased curve (the Revisit clip's `GLIDE`): the page scrolls until it ends
  and the camera carries the same motion on. Never a stop and a second start.

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
per caption. The reel introduces Machina with the App Store subtitle and
closes on the tagline, once, in short lines with air around them. Word timings are measured from the
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
