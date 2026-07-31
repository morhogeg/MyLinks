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

LINES = [
    (1.1, 1.4, "A recipe here. A video there. A thread somewhere else."),
    (2.55, 0.7, "Multiple apps, countless saved links."),
    # a deliberate beat of silence before this one — the first wrong pile
    # opens wordless (owner note, round 13c)
    (3.7, 1.2, "Saved, and rarely seen again."),
    (5.45, 1.35, f"Introducing {SAY_NAME} — one place for all your saved links."),
    (7.35, 1.25, "Save anything, from anywhere."),
    (8.95, 2.4, f"{SAY_NAME} reads it, summarizes it, and files it."),
    (12.3, 2.45, "Lose nothing. Find everything."),
    (15.35, 1.6, f"Ask {SAY_NAME} anything."),
    (17.4, 1.9, "Every answer comes straight from your saves."),
    (20.4, 2.3, f"{SAY_NAME} notices when things you saved belong together."),
    (23.3, 1.35, "Group your saves into collections."),
    (24.8, 1.15, "Every topic you care about, complete."),
    (26.1, 2.6, f"And {SAY_NAME} turns your saves into one short read."),
    # the closing statement, over the endcard's own line
    (30.1, 1.6, f"{SAY_NAME}. Everything you save — finally useful."),
]

k = Kokoro(os.path.join(VO, "kokoro-v1.0.onnx"), os.path.join(VO, "voices-v1.0.bin"))

manifest = []
ok = True
for i, (bar, bars, text) in enumerate(LINES):
    samples, sr = k.create(text, voice="af_heart", speed=0.95)
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
