# Voice-over synthesis for the launch film. Two engines:
#
#   Kokoro (local neural TTS, offline once out/vo/kokoro-v1.0.onnx +
#   voices-v1.0.bin are present; see README), and
#   Gemini TTS (audio/gemini_tts.py: directed delivery; new lines are voiced
#   on GitHub by .github/workflows/narration-tts.yml, the committed takes in
#   audio/vo-takes/ are re-used here with no key and no network).
#
#   python3 audio/synth-vo.py [film]   →  out/vo/line-NN.wav + out/vo/manifest.json
#   VO_ENGINE=kokoro python3 audio/synth-vo.py film   # the Kokoro read
#
# The lines mirror SUBTITLES in timeline.mjs (bar = caption start) plus one
# closing line over the endcard. If a caption changes, change it here too —
# the film's captions stay burned in, so a drifted VO is instantly audible.
#
# Kokoro voice: af_heart — Kokoro's flagship female voice. speed 0.95 for weight.
# Gemini voice: Sulafat (the house narrator, owner 2026-10-03), "Machina" in
# its real spelling, said the Latin way (gemini_tts.NAME_NOTE).

import json
import os
import sys

import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VO = os.path.join(ROOT, "out", "vo")

BAR_SEC = 2.5

VOICE = "af_heart"  # Kokoro
SPEED = 0.95  # Kokoro, for weight (owner-approved)

# The brand reads "Machina" but is SPOKEN "mah-KEE-nah" (machine, in Latin) —
# the respelling below is for the synthesizer's ear only; captions keep the
# real spelling. Gemini gets the real spelling back (gemini_tts.performed).
SAY_NAME = "Makeena"

# ── the film's direction (Gemini only; Kokoro ignores it) ────────────────────
# Every video gets its own tone (owner, 2026-10-03). The film's: a calm,
# assured brand introduction. The opening is wistful recognition, the middle
# clear and assured, the end a warm resolve. Each line's `style` is this tone
# plus its own acting note; `pace` replaces gemini_tts's house "lively and
# quick" pace for every line.
FILM_TONE = (
    "A calm, assured brand introduction for a launch film: warm, intimate and "
    "quietly confident, like a thoughtful founder telling you about something "
    "they care about. Cinematic and unhurried, never salesy, no announcer tone. "
    "This line: "
)
FILM_PACE = "Measured and cinematic, about 145 words a minute; room to breathe between sentences."

# Each line: bar, bars (its caption window), text (Kokoro's words; the
# manifest's), and optionally:
#   speed      Kokoro speed (default SPEED)
#   style      Gemini acting note (FILM_TONE is prepended)
#   tts        Gemini's words when they differ from `text`
#   max_pause  Gemini: longest pause kept inside the line, seconds (default 0.34)
#   tempo      Gemini: pitch-preserving speed-up, applied after the take
#              (gemini_tts.stretch; up to ~1.12 stays natural)
# `style`, `tts` and the pace key the take (audio/vo-takes/); `max_pause` and
# `tempo` shape it afterwards, so they can be tuned with no re-voicing.
# Act one speaks at 0.9 on Kokoro (round 13e: the owner heard the opening VO as
# rushed), and the retimed caption windows put real air between the lines.
FILM_LINES = [
    {"bar": 1.05, "bars": 0.85, "text": "You save things everywhere.", "speed": 0.9,
     "style": "Soft, intimate opener, a knowing half-smile, as if noticing something true about the listener."},
    # Sulafat reads lines 2 and 3 longer than Kokoro did. Line 3 starts at bar 3.4
    # (was 3.6; its caption still ends at 4.3), and both lines run at tempo
    # 1.08 with pauses capped at 0.25s, so neither runs into the next line.
    {"bar": 2.0, "bars": 1.35, "text": "An article here. A video there. A thread somewhere else.", "speed": 0.9,
     "style": "Light, observational list, each item a small glance in a different direction; even rhythm.",
     "tempo": 1.08, "max_pause": 0.25},
    {"bar": 3.4, "bars": 0.9, "text": "Multiple apps, countless saved links.", "speed": 0.9,
     "style": "A touch heavier: the weight of the pile.",
     "tempo": 1.08, "max_pause": 0.25},
    # a deliberate beat of silence before this one — the first wrong pile
    # opens wordless (owner note, round 13c)
    {"bar": 4.8, "bars": 1.3, "text": "Saved, and rarely seen again.", "speed": 0.9,
     "style": "Quiet and a little wistful, landing softly; the low point."},
    # the tagline moved to the closing line (owner, 2026-10-04)
    {"bar": 6.45, "bars": 1.35, "text": f"Introducing {SAY_NAME}.",
     "style": "The turn: warmth rises, assured and proud, a gentle reveal of the name."},
    {"bar": 8.35, "bars": 1.25, "text": "Save anything, from anywhere.",
     "style": "Bright, simple, confident."},
    {"bar": 9.95, "bars": 2.4, "text": f"{SAY_NAME} reads it, summarizes it, and files it.",
     "style": "Crisp and capable, three even beats."},
    # Spoken with the dichotomy CARVED (owner note, 13f): a full stop after
    # "From now on" forces the break, and "And" resets the breath before the
    # second half. The caption reads "From now on, lose nothing." (owner call
    # 2026-09-17: no full stop on screen); the stop stays spoken-only.
    {"bar": 13.3, "bars": 2.45, "text": "From now on. Lose nothing. And find everything.",
     "style": "Deliberate, with conviction; small pauses carving the three parts; 'find everything' opens up.",
     "max_pause": 0.5},
    {"bar": 16.35, "bars": 1.6, "text": f"Ask {SAY_NAME} anything.",
     "style": "Inviting, a hint of a smile."},
    {"bar": 18.4, "bars": 1.9, "text": "Every answer comes straight from your saves.",
     "style": "Reassuring and trustworthy."},
    {"bar": 21.4, "bars": 2.3, "text": f"{SAY_NAME} notices when things you saved belong together.",
     "style": "Quiet wonder, a little delighted."},
    {"bar": 24.25, "bars": 1.7, "text": "Group your saves into collections that mirror how you think.",
     "style": "Thoughtful and personal."},
    # Full stop before "Ready" = the audible break; the caption has it too.
    # Spoken-only "And" (owner call, 13l): conversational lead-in the caption
    # deliberately doesn't carry — same precedent as the SAY_NAME respelling.
    {"bar": 26.1, "bars": 2.6, "text": f"And behind the scenes, {SAY_NAME} pieces it all together. Ready when you are.",
     "style": "Warm and calm, a gentle promise; 'Ready when you are' softer, like an open door.",
     "max_pause": 0.45},
    # the closing statement = the endcard's one line, the TAGLINE (owner,
    # 2026-10-04: the film ends on it; 2026-09-17: the voice says what the
    # screen shows)
    {"bar": 30.1, "bars": 1.6, "text": f"{SAY_NAME}. Everything you save, finally useful.",
     "style": "A confident, warm sign-off, unhurried; the tagline sincere, landing softly."},
]


def film_script():
    out = []
    for i, line in enumerate(FILM_LINES):
        nxt = FILM_LINES[i + 1]["bar"] * BAR_SEC if i + 1 < len(FILM_LINES) else None
        out.append({
            **line,
            "start": line["bar"] * BAR_SEC,
            # a spoken line may breathe past the caption a touch
            "window": line["bars"] * BAR_SEC + 0.9,
            # …but never into the next line's start (checked for Gemini, whose
            # takes run longer; Kokoro's check is unchanged)
            "room": None if nxt is None else nxt - line["bar"] * BAR_SEC - 0.15,
            "speed": line.get("speed", SPEED),
            "style": FILM_TONE + line["style"],
            "pace": FILM_PACE,
        })
    return out


SCRIPTS = {"film": (film_script, VO)}

# a script's own engine (VO_ENGINE overrides): the film is voiced by Gemini
# TTS, Sulafat (owner, 2026-10-03)
ENGINE = {"film": "gemini"}
# and its Gemini model (GEMINI_TTS_MODEL overrides)
GEMINI_MODEL = {"film": "gemini-3.8-flash-tts"}

# Where a Gemini-voiced script's word times go for the picture: each film
# caption rises 3 frames before its line's first spoken word
# (src/film/Subtitles.tsx). Estimated from the audio (word_timing_voiced,
# about ±0.2s), not recognised.
WORD_TIMING = {"film": os.path.join(ROOT, "src", "film", "vo.json")}


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


def word_timing_voiced(text, samples, sr):
    """Word start times for a Gemini TTS line, ESTIMATED from the audio (about
    ±0.2s; nothing is recognised). Gemini pauses between words, not only at
    punctuation, and breathes at the edges of a line: runs too short or too
    quiet to be words (a click, a breath) are dropped; the phrase breaks go to
    the longest real pauses (one fewer than the phrases, in order); each
    phrase's words are spread over its VOICED time only, by length."""
    import re

    import numpy as np

    runs = speech_runs(samples, sr)
    if not runs:
        return []
    hop = int(sr * 0.01)
    peak = lambda r: float(np.abs(samples[int(r[0] * sr):int(r[1] * sr) + hop]).max(initial=0))
    top = max(peak(r) for r in runs)
    runs = [r for r in runs if r[1] - r[0] >= 0.05 and peak(r) >= top * 0.25] or runs
    # a short, quiet burst cut off from the edge of the line by a long pause
    # is a breath (Gemini breathes in and out around a line), not a word (a
    # short LOUD one is a word: "Okay,")
    breath = lambda r, gap: r[1] - r[0] < 0.18 and gap > 0.2 and peak(r) < top * 0.5
    while len(runs) > 1 and breath(runs[-1], runs[-1][0] - runs[-2][1]):
        runs = runs[:-1]
    while len(runs) > 1 and breath(runs[0], runs[1][0] - runs[0][1]):
        runs = runs[1:]
    words = text.split()
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.,?!…]$", w):
            phrases.append(cur)
            cur = []
    if cur:
        phrases.append(cur)
    # each phrase break goes to the longest pause NEAR where that phrase should
    # end (its share of the line's letters, on the voiced timeline)
    voiced_at = []  # voiced time elapsed at the end of each run
    acc_v = 0.0
    for a_, b_ in runs:
        acc_v += b_ - a_
        voiced_at.append(acc_v)
    letters = sum(len(w) + 1 for w in words)
    cuts, done = [], 0
    for ph in phrases[:-1]:
        done += sum(len(w) + 1 for w in ph)
        want = acc_v * done / letters
        lo = cuts[-1] + 1 if cuts else 0
        cand = [i for i in range(lo, len(runs) - 1)]
        if not cand:
            break
        score = lambda i: (runs[i + 1][0] - runs[i][1]) - 0.6 * abs(voiced_at[i] - want)
        cuts.append(max(cand, key=score))
    groups, start = [], 0
    for c in cuts + [len(runs) - 1]:
        groups.append(runs[start:c + 1])
        start = c + 1
    if len(groups) < len(phrases):  # fewer pauses than phrases: one span
        groups, phrases = [runs], [words]
    out = []
    for g, ph in zip(groups, phrases):
        voiced = sum(b - a for a, b in g)
        total = sum(len(w) + 1 for w in ph)
        acc = 0
        for w in ph:
            t = voiced * acc / total  # this far into the phrase's voiced time
            for a, b in g:
                if t <= b - a:
                    out.append(round(a + t, 3))
                    break
                t -= b - a
            else:
                out.append(round(g[-1][1], 3))
            acc += len(w) + 1
    return out


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "film"
    if name not in SCRIPTS:
        sys.exit(f"unknown script {name!r}; one of {', '.join(SCRIPTS)}")
    make, out_dir = SCRIPTS[name]
    os.makedirs(out_dir, exist_ok=True)

    # the engine: Kokoro (offline) or Gemini TTS (audio/gemini_tts.py)
    engine = os.environ.get("VO_ENGINE", ENGINE.get(name, "kokoro"))
    if engine == "gemini":
        if name in GEMINI_MODEL:
            os.environ.setdefault("GEMINI_TTS_MODEL", GEMINI_MODEL[name])
        sys.path.insert(0, HERE)
        import gemini_tts

        def speak(line):
            samples, sr = gemini_tts.synth(gemini_tts.performed(line.get("tts") or line["text"]), style=gemini_tts.direct(line.get("style"), line.get("pace")))
            if os.environ.get("NARRATION_TAKES_ONLY"):
                # on GitHub (narration-tts.yml) only the raw takes are needed;
                # the shaping below runs where the film is built (it needs ffmpeg)
                return samples, sr
            capped = gemini_tts.cap_pauses(samples, sr, longest=line.get("max_pause") or 0.34)
            quick = gemini_tts.stretch(gemini_tts.to_the_words(capped, sr), sr, line.get("tempo"))
            return gemini_tts.gate(quick, sr), sr
    else:
        from kokoro_onnx import Kokoro

        k = Kokoro(os.path.join(VO, "kokoro-v1.0.onnx"), os.path.join(VO, "voices-v1.0.bin"))

        def speak(line):
            return k.create(line["text"], voice=VOICE, speed=line["speed"])

    manifest = []
    ok = True
    for i, line in enumerate(make()):
        samples, sr = speak(line)
        path = os.path.join(out_dir, f"line-{i:02d}.wav")
        sf.write(path, samples, sr)
        dur = len(samples) / sr
        entry = {"bar": line["bar"], "text": line["text"], "file": f"line-{i:02d}.wav", "sec": round(dur, 2)}
        if engine == "gemini":
            # where the SPEECH ends: the take carries a little trailing decay,
            # which may overlap whatever comes next without anyone hearing it
            loud = abs(samples) > abs(samples).max() * 0.02
            spoken = (len(samples) - loud[::-1].argmax()) / sr
            room = line["room"] if line.get("room") is not None else line["window"]
            fits = spoken <= min(line["window"], room)
            entry["spoken"] = round(spoken, 2)
            entry["words"] = word_timing_voiced(line["text"], samples, sr)
            limit = f"{min(line['window'], room):4.2f}s"
            shown = spoken
        else:
            fits = dur <= line["window"]
            limit = f"{line['window']:4.1f}s"
            shown = dur
        ok = ok and fits
        manifest.append(entry)
        print(f"{'ok ' if fits else 'LONG'} {shown:5.2f}s / {limit}  {line['text']}")

    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    if engine == "gemini" and name in WORD_TIMING:
        timing = [{"bar": e["bar"], "text": e["text"], "words": e["words"]} for e in manifest]
        with open(WORD_TIMING[name], "w") as f:
            json.dump(timing, f, indent=1)
            f.write("\n")

    sys.exit(0 if ok else 1)


main()
