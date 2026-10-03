# Audition Gemini TTS voices for the narrator: the same two lines (Meta ad 3's
# opening) in each candidate voice, with the house direction (gemini_tts.STYLE),
# one request per voice. The owner picks the voice by ear; it then becomes the
# house voice (GEMINI_VOICE, or gemini_tts.VOICE) for every video.
#
# (New voices are voiced on GitHub: audio/narration-request.json + push; once
# their takes are committed this runs anywhere, no key needed.)
#
#   python3 audio/vo-audition.py                  # → out/vo/audition/<voice>.wav
#   python3 audio/vo-audition.py Sulafat Achird   # just these voices

import os
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gemini_tts  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "out", "vo", "audition")

# warm, conversational prebuilt voices, female and male
CANDIDATES = ["Sulafat", "Achernar", "Aoede", "Leda", "Achird", "Umbriel"]

TEXT = (
    "Okay, be honest. How many things did you save this month… and never open again? "
    "That's exactly why we made Makeena."
)

os.makedirs(OUT, exist_ok=True)
for voice in sys.argv[1:] or CANDIDATES:
    samples, sr = gemini_tts.synth(TEXT, voice=voice)
    sf.write(os.path.join(OUT, f"{voice}.wav"), np.asarray(samples), sr)
    print(f"{voice:10s} {len(samples) / sr:5.2f}s")
