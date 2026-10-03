# The narrator, voiced by Gemini TTS (Google's `gemini-3.8-flash-tts`): an
# alternative engine for audio/synth-vo.py, chosen with VO_ENGINE=gemini.
# Kokoro (offline) stays the default until the owner picks a Gemini voice.
#
# Why: Kokoro reads every line with the same flat prosody. Gemini TTS is
# DIRECTED: the words go in verbatim, and a separate note ("director's notes",
# `speech_metadata.style`) sets the delivery: warm, unhurried, a person
# talking to a friend. A line may carry its own note (a caption's `style`).
#
# Needs (the container blocks both by default):
#   - GEMINI_API_KEY in the environment (an AI Studio key; paid tier: the free
#     tier allows only 10 TTS requests a day, and a script is one per line)
#   - network access to generativelanguage.googleapis.com
#
# Every line is cached by (model, voice, style, text) in out/vo/gemini-cache/,
# so a re-run only pays for lines that changed (the cache is gitignored and
# lives with the container; what persists is the committed mix).
#
#   GEMINI_VOICE=Sulafat VO_ENGINE=gemini python3 audio/synth-vo.py adtodo
#   python3 audio/vo-audition.py      # one line in several voices, to choose

import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.request

import numpy as np

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
# a warm prebuilt voice; the owner picks the house voice by ear (vo-audition.py)
VOICE = os.environ.get("GEMINI_VOICE", "Sulafat")
SR = 24000  # the API returns 24kHz mono 16-bit PCM (Kokoro's rate too)

# THE HOUSE DELIVERY, for every line unless a line brings its own note
STYLE = (
    "A real person talking to a friend, not an announcer and not an ad: warm, "
    "relaxed, lightly amused, sincere. Unhurried, an easy conversational pace "
    "with natural breaths and small pauses at commas and ellipses. Sentences "
    "land softly; no sales emphasis, no rising 'presenter' tone."
)

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _cache_path(cache_dir, text, voice, style):
    key = hashlib.sha256(json.dumps([MODEL, voice, style, text]).encode()).hexdigest()[:20]
    return os.path.join(cache_dir, f"{key}.npy")


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
            raise SystemExit(f"Gemini TTS {e.code}: {detail}")
        except urllib.error.URLError as e:
            raise SystemExit(f"Gemini TTS unreachable ({e.reason}): allow generativelanguage.googleapis.com in the environment's network access")
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


def synth(text, cache_dir, voice=None, style=None):
    """(samples, sample_rate) for one line, from the cache when it is there."""
    if not os.environ.get("GEMINI_API_KEY"):
        raise SystemExit("VO_ENGINE=gemini needs GEMINI_API_KEY in the environment")
    voice, style = voice or VOICE, style or STYLE
    os.makedirs(cache_dir, exist_ok=True)
    path = _cache_path(cache_dir, text, voice, style)
    if os.path.exists(path):
        return np.load(path), SR
    samples = _trim(_request(text, voice, style), SR)
    np.save(path, samples)
    return samples, SR
