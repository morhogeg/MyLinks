# The narrator, voiced by Gemini TTS (Google's `gemini-3.8-flash-tts`): an
# alternative engine for audio/synth-vo.py, chosen with VO_ENGINE=gemini.
# Kokoro (offline) stays the default until the owner picks a Gemini voice.
#
# Why: Kokoro reads every line with the same flat prosody. Gemini TTS is
# DIRECTED: the words go in verbatim, and a separate note ("director's notes",
# `speech_metadata.style`) sets the delivery: warm, unhurried, a person
# talking to a friend. A line may carry its own note (a caption's `style`).
#
# A NEW line needs GEMINI_API_KEY and network access to
# generativelanguage.googleapis.com. Cloud sessions have neither, so new lines
# are voiced on GitHub by .github/workflows/narration-tts.yml (it holds the
# repo's GEMINI_API_KEY secret): edit audio/narration-request.json, push, and
# the workflow commits the takes back.
#
# THE TAKES: every line is kept by (model, voice, style, text) in
# audio/vo-takes/ (committed, FLAC), so any session re-uses a voiced line with
# no key and no network, a re-run only pays for lines that changed, and a take
# the owner liked is never re-rolled.
#
#   GEMINI_VOICE=Sulafat VO_ENGINE=gemini python3 audio/synth-vo.py adtodo
#   python3 audio/vo-audition.py      # one line in several voices, to choose

import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

import numpy as np
import soundfile as sf

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
# a warm prebuilt voice; the owner picks the house voice by ear (vo-audition.py)
VOICE = os.environ.get("GEMINI_VOICE", "Sulafat")
SR = 24000  # the API returns 24kHz mono 16-bit PCM (Kokoro's rate too)

# THE HOUSE DELIVERY, for every line unless a line brings its own note
STYLE = (
    "A real person talking to a friend, not an announcer and not an ad: warm, "
    "playful, lightly amused, sincere. Sentences land softly; no sales "
    "emphasis, no rising 'presenter' tone."
)
# THE PACE, added to every direction: asked to act, the model slows right
# down (about 120 words a minute, long dramatic beats); real chat is quicker
PACE = (
    " Pace: lively and quick, like real chatty conversation between friends, "
    "about 170 words a minute; keep pauses short and light, no long dramatic beats."
)

# THE NAME (owner's pick, 2026-10-03, audition "I"): Gemini reads the real
# spelling, "Machina", guided by a note to say it the classical Latin way,
# MAH-kee-nah: stress on the first syllable, a hard "k", "ah" as in "father".
# (Kokoro says the English-ized MACK-ee-nuh; the spelled-out variants read
# less naturally.) GEMINI_SAY_NAME / GEMINI_NAME_NOTE=0 override, for tests.
SAY_NAME = os.environ.get("GEMINI_SAY_NAME", "Machina")
NAME_NOTE = (
    ' The product name "Machina" is the Latin word, said the classical Latin way: MAH-kee-nah, '
    'stress on the FIRST syllable; "ch" is a hard "k"; open vowels, "a" as in "father" (not as in "cat"), '
    'a short "ee", and a clear "ah" at the end, not "nuh". Never mah-KEE-nah.'
)


def performed(text):
    """The words as Gemini gets them: the name spelled for its ear."""
    return text.replace("Machina", SAY_NAME).replace("Makeena", SAY_NAME)


def direct(style):
    """A line's direction: its own note, else the house one; plus the name note."""
    note = (style or STYLE) + PACE
    return note if os.environ.get("GEMINI_NAME_NOTE") == "0" else note + NAME_NOTE


TAKES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo-takes")

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _cache_path(cache_dir, text, voice, style):
    key = hashlib.sha256(json.dumps([MODEL, voice, style, text]).encode()).hexdigest()[:20]
    return os.path.join(cache_dir, f"{key}.flac")


def _request(text, voice, style):
    part = {"text": text}
    if MODEL.startswith("gemini-2.5"):
        # the 2.5 models take their direction inside the prompt itself
        part = {"text": f"{style}\nSay: {text}"}
    else:
        part["speech_metadata"] = {"style": style}
    body = {
        "contents": [{"role": "user", "parts": [part]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    req = urllib.request.Request(
        ENDPOINT.format(model=MODEL),
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:400]
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            print(f"Gemini TTS {e.code}: {detail}", file=sys.stderr)
            sys.exit(3)
        except urllib.error.URLError as e:
            print(f"Gemini TTS unreachable ({e.reason}): allow generativelanguage.googleapis.com in the environment's network access", file=sys.stderr)
            sys.exit(3)
    parts = data["candidates"][0]["content"]["parts"]
    pcm = b"".join(base64.b64decode(p["inlineData"]["data"]) for p in parts if "inlineData" in p)
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768


def _trim(samples, sr, keep=0.03):
    """Trim the silence the model leaves before and after the speech to `keep`
    seconds, so a line starts on its caption's frame."""
    loud = np.abs(samples) > np.abs(samples).max() * 0.02
    if not loud.any():
        return samples
    a = max(0, int(loud.argmax()) - int(keep * sr))
    b = min(len(samples), len(samples) - int(loud[::-1].argmax()) + int(keep * sr))
    return samples[a:b]


def cap_pauses(samples, sr, longest=0.34, fade=0.01):
    """Shorten every pause INSIDE a line to at most `longest` seconds. Gemini,
    asked to act, takes long dramatic beats (a 1.4s pause inside the opening);
    the beat survives at a third of a second, the dead air goes. Vocal sounds
    (a sigh, a chuckle) are not silence and stay. Lead-in and tail untouched."""
    hop = int(sr * 0.01)
    n = len(samples) // hop
    rms = np.array([np.sqrt(np.mean(samples[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
    quiet = rms <= rms.max() * 0.02
    out, pos, i = [], 0, 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            inner = i > 0 and j < n
            extra = (j - i) * hop - int(longest * sr)
            if inner and extra > 0:
                mid = (i + j) * hop // 2
                x0, x1 = mid - extra // 2, mid - extra // 2 + extra
                k = int(fade * sr)
                head, tail = samples[pos:x0].copy(), samples[x1:x1 + k]
                ramp = np.linspace(0, 1, len(tail))
                head[-len(tail):] = head[-len(tail):] * (1 - ramp) + tail * ramp
                out.append(head)
                pos = x1 + len(tail)
            i = j
        else:
            i += 1
    out.append(samples[pos:])
    return np.concatenate(out)


def gate(samples, sr, below=30.0, depth=40.0, look=0.01, release=0.025):
    """A smooth noise gate: Gemini's audio is not silent between words (a
    hiss floor around -52 to -64 dB) and the mix lifts it into audible static
    in every pause. Where the 5ms level is more than `below` dB under the
    line's loudest, fade it down by `depth` dB; open `look` seconds early (the
    level is read over a window) so no word onset is clipped, close over
    `release` seconds."""
    hop = int(sr * 0.005)
    n = -(-len(samples) // hop)  # every block, the last one partial (never empty)
    rms = np.array([np.sqrt(np.mean(samples[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(n)])
    db = 20 * np.log10(rms)
    open_ = db > db.max() - below
    w = max(1, int(look / 0.005))
    open_ = np.convolve(open_.astype(float), np.ones(2 * w + 1), "same") > 0  # look both ways
    floor = 10 ** (-depth / 20)
    g = np.where(open_, 1.0, floor)
    # smooth: instant-ish attack (already early), slow release
    out_g = np.empty_like(g)
    k = np.exp(-0.005 / release)
    cur = 1.0
    for i, t in enumerate(g):
        cur = t if t > cur else k * cur + (1 - k) * t
        out_g[i] = cur
    gain = np.repeat(out_g, hop)[: len(samples)]
    return samples * gain


def to_the_words(samples, sr, before=0.06, after=0.12, fade=0.02):
    """Trim a line to its words: Gemini opens each take with a click and a
    breath in (about 0.4s before "Okay"), and often breathes out after the
    last word. Keep `before`/`after` seconds around the first and last
    sustained loud stretch (RMS at least half the line's), with short fades."""
    hop = int(sr * 0.01)
    n = len(samples) // hop
    peak = np.array([np.abs(samples[i * hop:(i + 1) * hop]).max() for i in range(n)])
    rms = np.array([np.sqrt(np.mean(samples[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
    # sustained loudness (50ms running, against the line's typical loud level,
    # not its single loudest block): a click is not a word
    on = rms >= np.percentile(rms, 95) * 0.4
    run = np.convolve(on.astype(int), np.ones(5, int), "valid") == 5
    loud = np.nonzero(run)[0]
    if not len(loud):
        return samples
    a = max(0, loud[0] * hop - int(before * sr))
    b = min(len(samples), (loud[-1] + 5) * hop + int(after * sr))
    # back off to where the sound actually starts / dies away before the edge
    quiet = peak.max() * 0.02
    i = a // hop
    while i > 0 and peak[i - 1] > quiet and (a - (i - 1) * hop) < 0.15 * sr:
        i -= 1
    a = i * hop
    j = b // hop
    while j < n and peak[j] > quiet and (j * hop - b) < 0.3 * sr:
        j += 1
    b = min(len(samples), j * hop)
    if (b - a) < 0.67 * len(samples):  # never cut a third of a line: misread
        return samples
    out = samples[a:b].copy()
    k = min(int(fade * sr), len(out) // 2)
    out[:k] *= np.linspace(0, 1, k)
    out[-k:] *= np.linspace(1, 0, k)
    return out


def synth(text, cache_dir=TAKES, voice=None, style=None):
    """(samples, sample_rate) for one line: the committed take when there is
    one, else a new one from the API (kept for next time)."""
    voice, style = voice or VOICE, style or STYLE
    path = _cache_path(cache_dir, text, voice, style)
    if os.path.exists(path):
        samples, sr = sf.read(path, dtype="float32")
        return samples, sr
    if not os.environ.get("GEMINI_API_KEY"):
        print(
            f"no take for {voice!r}: {text[:60]!r}… — voice it on GitHub "
            "(audio/narration-request.json + push), or set GEMINI_API_KEY",
            file=sys.stderr,
        )
        sys.exit(3)
    os.makedirs(cache_dir, exist_ok=True)
    samples = _trim(_request(text, voice, style), SR)
    sf.write(path, samples, SR, subtype="PCM_16")
    return samples, SR
