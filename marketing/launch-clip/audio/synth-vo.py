# Voice-over synthesis — Kokoro (local neural TTS, runs offline once
# out/vo/kokoro-v1.0.onnx + voices-v1.0.bin are present; see README).
#
#   python3 audio/synth-vo.py          # the launch film (default)
#   python3 audio/synth-vo.py reel     # the highlight reel
#
#   film →  out/vo/line-NN.wav + out/vo/manifest.json
#   reel →  out/vo/reel/line-NN.wav + out/vo/reel/manifest.json
#
# ONE NARRATOR. Every Machina video speaks with the voice config below (the
# film's, owner-approved): Kokoro `af_heart` at 0.95, "Machina" respelled for
# the synthesizer's ear. A new video adds a SCRIPT, never a new voice.
#
# The film's lines MIRROR `SUBTITLES` in timeline.mjs (bar = caption start)
# plus one closing line over the endcard; they live here because a few carry
# documented spoken-only differences. The reel's lines are not copied at all:
# they are read from `CAPTIONS` in reel-timeline.mjs, so the reel's captions
# and its voice cannot disagree.

import json
import os
import subprocess
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VO = os.path.join(ROOT, "out", "vo")

# ── the narrator (shared by every script) ────────────────────────────────────
VOICE = "af_heart"  # Kokoro's flagship female voice
SPEED = 0.95  # for weight (owner-approved)

# The brand reads "Machina" but is SPOKEN "mah-KEE-nah" (machine, in Latin) —
# the respelling below is for the synthesizer's ear only; captions keep the
# real spelling.
SAY_NAME = "Makeena"

BAR_SEC = 2.5  # the film's bar (timeline.mjs)

# ── the film ─────────────────────────────────────────────────────────────────
# (bar, bars, text, speed?) — speed defaults to SPEED (owner-approved).
# Act one speaks at 0.9 (round 13e: the owner heard the opening VO as rushed),
# and the retimed caption windows put real air between the lines.
FILM_LINES = [
    (1.05, 0.85, "You save things everywhere.", 0.9),
    (2.0, 1.35, "An article here. A video there. A thread somewhere else.", 0.9),
    (3.6, 0.7, "Multiple apps, countless saved links.", 0.9),
    # a deliberate beat of silence before this one — the first wrong pile
    # opens wordless (owner note, round 13c)
    (4.8, 1.3, "Saved, and rarely seen again.", 0.9),
    (6.45, 1.35, f"Introducing {SAY_NAME}. Never lose another great find."),
    (8.35, 1.25, "Save anything, from anywhere."),
    (9.95, 2.4, f"{SAY_NAME} reads it, summarizes it, and files it."),
    # Spoken with the dichotomy CARVED (owner note, 13f): a full stop after
    # "From now on" forces the break, and "And" resets the breath before the
    # second half. The caption reads "From now on, lose nothing." (owner call
    # 2026-09-17: no full stop on screen); the stop stays spoken-only.
    (13.3, 2.45, "From now on. Lose nothing. And find everything."),
    (16.35, 1.6, f"Ask {SAY_NAME} anything."),
    (18.4, 1.9, "Every answer comes straight from your saves."),
    (21.4, 2.3, f"{SAY_NAME} notices when things you saved belong together."),
    (24.25, 1.7, "Group your saves into collections that mirror how you think."),
    # Full stop before "Ready" = the audible break; the caption has it too.
    # Spoken-only "And" (owner call, 13l): conversational lead-in the caption
    # deliberately doesn't carry — same precedent as the SAY_NAME respelling.
    (26.1, 2.6, f"And behind the scenes, {SAY_NAME} pieces it all together. Ready when you are."),
    # the closing statement = the endcard: the wordmark and its one line, the
    # tagline (owner call 2026-09-28: every film ends on it; 2026-09-17: the
    # voice says what the screen shows)
    (30.1, 1.6, f"{SAY_NAME}. Everything you save, finally useful."),
]


def film_script():
    """(start_sec, window_sec, spoken_text, speed) for the film."""
    out = []
    for line in FILM_LINES:
        bar, bars, text = line[0], line[1], line[2]
        speed = line[3] if len(line) > 3 else SPEED
        # a spoken line may breathe past the caption a touch
        out.append({"bar": bar, "start": bar * BAR_SEC, "window": bars * BAR_SEC + 0.9, "text": text, "speed": speed})
    return out


def reel_script():
    """The reel's captions, read from reel-timeline.mjs, spoken as written."""
    js = (
        "import('./reel-timeline.mjs').then(m => console.log(JSON.stringify("
        "{ fps: m.FPS, captions: m.CAPTIONS })))"
    )
    raw = subprocess.run(["node", "-e", js], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    data = json.loads(raw)
    fps = data["fps"]
    out = []
    for c in data["captions"]:
        # a "\n" is a line break on screen only; the voice reads straight on
        # `say` is the spoken form when it differs (a voice-only lead-in such
        # as "Introducing"); either way "Machina" is respelled for the voice
        spoken = " ".join((c.get("say") or c["text"]).split()).replace("Machina", SAY_NAME)
        # a reel line must be finished before its caption leaves the screen
        out.append({
            "frame": c["at"],
            "start": c["at"] / fps,
            "window": (c["to"] - c["at"]) / fps,
            "text": spoken,
            "speed": SPEED,
        })
    return out


SCRIPTS = {"film": (film_script, VO), "reel": (reel_script, os.path.join(VO, "reel"))}

# Scripts whose captions reveal word by word get the timing of every word,
# measured from the synthesized audio, written where the picture can read it.
WORD_TIMING = {"reel": os.path.join(ROOT, "src", "reels", "data", "reel-vo.json")}


def clip_script(name):
    """A feature clip's captions, read from clips/<name>-timeline.mjs and
    spoken as written (the reel's rules: `say` when it differs, "\\n" on screen
    only, "Machina" respelled for the voice)."""
    js = (
        f"import('./clips/{name}-timeline.mjs').then(m => console.log(JSON.stringify("
        "{ fps: m.FPS, captions: m.CAPTIONS })))"
    )
    raw = subprocess.run(["node", "-e", js], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    data = json.loads(raw)
    return [
        {
            "frame": c["at"],
            "start": c["at"] / data["fps"],
            "window": (c["to"] - c["at"]) / data["fps"],
            "text": " ".join((c.get("say") or c["text"]).split()).replace("Machina", SAY_NAME),
            "speed": SPEED,
        }
        for c in data["captions"]
    ]


# the REVISIT feature clip (clips/revisit-timeline.mjs): its own lines, the one voice
SCRIPTS["revisit"] = (lambda: clip_script("revisit"), os.path.join(VO, "revisit"))
WORD_TIMING["revisit"] = os.path.join(ROOT, "src", "reels", "clips", "revisit", "vo.json")


def speech_runs(samples, sr, gap=0.09):
    """[start, end] seconds of each run of speech, split at pauses >= gap."""
    import numpy as np

    hop = int(sr * 0.01)
    frames = len(samples) // hop
    rms = np.array([np.sqrt(np.mean(samples[i * hop:(i + 1) * hop] ** 2)) for i in range(frames)])
    on = rms > rms.max() * 0.06
    runs, start, quiet = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * 0.01 >= gap:
                runs.append([start * 0.01, (i - quiet + 1) * 0.01])
                start, quiet = None, 0
    if start is not None:
        runs.append([start * 0.01, (frames - quiet) * 0.01])
    return runs


def word_timing(text, runs):
    """Seconds at which each written word starts. Phrases (split after , . ? !)
    are matched to the pauses the voice actually took; words inside a phrase
    are spread by length."""
    import re

    words = text.split()
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.,?!]$", w):
            phrases.append(cur)
            cur = []
    if cur:
        phrases.append(cur)
    runs = [r[:] for r in runs]
    while len(runs) > len(phrases):  # merge across the shortest pause
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i:i + 2] = [[runs[i][0], runs[i + 1][1]]]
    if len(runs) < len(phrases):  # the voice ran phrases together: one span
        runs = [[runs[0][0], runs[-1][1]]]
        phrases = [words]
    out = []
    for (a, b), ph in zip(runs, phrases):
        total = sum(len(w) + 1 for w in ph)
        acc = 0
        for w in ph:
            out.append(round(a + (b - a) * acc / total, 3))
            acc += len(w) + 1
    return out


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "film"
    if name not in SCRIPTS:
        sys.exit(f"unknown script {name!r}; one of {', '.join(SCRIPTS)}")
    make, out_dir = SCRIPTS[name]
    os.makedirs(out_dir, exist_ok=True)

    k = Kokoro(os.path.join(VO, "kokoro-v1.0.onnx"), os.path.join(VO, "voices-v1.0.bin"))

    manifest = []
    timing = []
    ok = True
    for i, line in enumerate(make()):
        samples, sr = k.create(line["text"], voice=VOICE, speed=line["speed"])
        path = os.path.join(out_dir, f"line-{i:02d}.wav")
        sf.write(path, samples, sr)
        dur = len(samples) / sr
        # where the SPEECH ends: the file carries a little trailing silence,
        # which may overlap whatever comes next without anyone hearing it
        loud = abs(samples) > abs(samples).max() * 0.02
        spoken = (len(samples) - loud[::-1].argmax()) / sr
        fits = spoken <= line["window"]
        ok = ok and fits
        entry = {
            "text": line["text"],
            "file": f"line-{i:02d}.wav",
            "sec": round(dur, 2),
            "spoken": round(spoken, 2),
            "start": round(line["start"], 4),
        }
        if "bar" in line:
            entry = {"bar": line["bar"], **entry}
        if "frame" in line:
            entry = {"frame": line["frame"], **entry}
        manifest.append(entry)
        if name in WORD_TIMING:
            timing.append({
                "frame": line.get("frame"),
                "text": line["text"],
                "words": word_timing(line["text"], speech_runs(samples, sr)),
            })
        print(f"{'ok ' if fits else 'LONG'} {spoken:5.2f}s / {line['window']:4.2f}s  {line['text']}")

    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    if name in WORD_TIMING:
        os.makedirs(os.path.dirname(WORD_TIMING[name]), exist_ok=True)
        with open(WORD_TIMING[name], "w") as f:
            json.dump(timing, f, indent=1)
            f.write("\n")

    sys.exit(0 if ok else 1)


main()
