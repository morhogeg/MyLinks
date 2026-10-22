# Resample a script's voice lines (out/vo/<script>/line-NN.wav, 24kHz from
# Gemini TTS) to the score's 44.1kHz with SoX's resampler (ffmpeg soxr),
# in place, before audio/mix-vo.mjs. The mix's own linear interpolation
# mirrors the top octave of a 24kHz voice into a sizzle (the REVISIT clip's
# "metallic" note, 2026-10-21); a band-limited resample does not.
#
#   python3 audio/vo-to-44k.py out/vo/savethis

import glob
import os
import subprocess
import sys
import tempfile

for path in sorted(glob.glob(os.path.join(sys.argv[1], "line-*.wav"))):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=os.path.dirname(path)) as tmp:
        out = tmp.name
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", path, "-af", "aresample=44100:resampler=soxr:precision=28", "-c:a", "pcm_s16le", out],
        check=True,
    )
    os.replace(out, path)
    print("44.1k", os.path.basename(path))
