# Voice-over synthesis — Kokoro (local neural TTS, runs offline once
# out/vo/kokoro-v1.0.onnx + voices-v1.0.bin are present; see README).
#
#   python3 audio/synth-vo.py     →  out/vo/line-NN.wav + out/vo/manifest.json
#
# The lines mirror SUBTITLES in timeline.mjs (bar = caption start) plus one
# closing line over the endcard. If a caption changes, change it here too —
# the film's captions stay burned in, so a drifted VO is instantly audible.
#
# Voice: af_heart — Kokoro's flagship female voice. speed 0.95 for weight.

import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VO = os.path.join(ROOT, "out", "vo")

BAR_SEC = 2.5

# The brand reads "Machina" but is SPOKEN "mah-KEE-nah" (machine, in Latin) —
# the respelling below is for the synthesizer's ear only; captions keep the
# real spelling.
SAY_NAME = "Makeena"

# (bar, bars, text, speed?) — speed defaults to 0.95 (owner-approved).
# Act one speaks at 0.9 (round 13e: the owner heard the opening VO as rushed),
# and the retimed caption windows put real air between the lines.
LINES = [
    (1.05, 0.85, "You save things everywhere.", 0.9),
    (2.0, 1.35, "A recipe here. A video there. A thread somewhere else.", 0.9),
    (3.6, 0.7, "Multiple apps, countless saved links.", 0.9),
    # a deliberate beat of silence before this one — the first wrong pile
    # opens wordless (owner note, round 13c)
    (4.8, 1.3, "Saved, and rarely seen again.", 0.9),
    (6.45, 1.35, f"Introducing {SAY_NAME} — one place for all your saved links."),
    (8.35, 1.25, "Save anything, from anywhere."),
    (9.95, 2.4, f"{SAY_NAME} reads it, summarizes it, and files it."),
    # Spoken with the dichotomy CARVED (owner note, 13f): a full stop after
    # "From now on" forces the break, and "And" resets the breath before the
    # second half. The caption shows the dash version of the same sentence.
    (13.3, 2.45, "From now on. Lose nothing. And find everything."),
    (16.35, 1.6, f"Ask {SAY_NAME} anything."),
    (18.4, 1.9, "Every answer comes straight from your saves."),
    (21.4, 2.3, f"{SAY_NAME} notices when things you saved belong together."),
    (24.25, 1.7, "Group your saves into collections that mirror how you think."),
    # Full stop before "Ready" = the audible break; caption shows the dash.
    # Spoken-only "And" (owner call, 13l): conversational lead-in the caption
    # deliberately doesn't carry — same precedent as the SAY_NAME respelling.
    (26.1, 2.6, f"And behind the scenes, {SAY_NAME} pieces it all together. Ready when you are."),
    # the closing statement, over the endcard's own line
    (30.1, 1.6, f"{SAY_NAME}. Everything you save — finally useful."),
]

k = Kokoro(os.path.join(VO, "kokoro-v1.0.onnx"), os.path.join(VO, "voices-v1.0.bin"))

manifest = []
ok = True
for i, line in enumerate(LINES):
    bar, bars, text = line[0], line[1], line[2]
    speed = line[3] if len(line) > 3 else 0.95
    samples, sr = k.create(text, voice="af_heart", speed=speed)
    path = os.path.join(VO, f"line-{i:02d}.wav")
    sf.write(path, samples, sr)
    dur = len(samples) / sr
    window = bars * BAR_SEC + 0.9  # a spoken line may breathe past the caption a touch
    fits = dur <= window
    ok = ok and fits
    manifest.append({"bar": bar, "text": text, "file": f"line-{i:02d}.wav", "sec": round(dur, 2)})
    print(f"{'ok ' if fits else 'LONG'} {dur:5.2f}s / {window:4.1f}s  {text}")

with open(os.path.join(VO, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)

sys.exit(0 if ok else 1)
