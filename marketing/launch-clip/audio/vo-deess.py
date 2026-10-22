# De-ess a script's voice lines (out/vo/<script>/line-NN.wav, 44.1kHz) in
# place, after audio/vo-to-44k.py and before audio/mix-vo.mjs.
#
# Gemini TTS now and then hits an "s" as hard as the vowels around it (SAVE
# THIS, 2026-10-22: "every save" peaked at -7 and -9 dBFS above 4.5kHz in
# two lines, level with the voice itself; the other nine lines sit at -12 to
# -20), and a phone's speaker turns that into a hiss; one of those takes
# also sprays its top octave (-12 dBFS above 9.5kHz where the rest sit at
# -17 to -23). Two split-band compressors on the STFT, one after the other:
# each touches only its band (ramped in over 1kHz), only in the frames where
# it rises over its threshold, at its ratio, by at most MAX_CUT; instant
# attack, RELEASE back. A line whose sibilants stay under both comes back
# unchanged, bit for bit. Run once per synth-vo.py run (it compresses what
# it is given).
#
#   python3 audio/vo-deess.py out/vo/savethis

import glob
import os
import sys

import numpy as np
import soundfile as sf

# (band from, band full at, threshold dBFS over one 23ms frame, ratio)
BANDS = [
    (3500.0, 4500.0, -12.5, 6.0),  # the "s" itself
    (8500.0, 9500.0, -16.5, 10.0),  # its top octave
]
MAX_CUT = 9.0  # dB
RELEASE = 0.03  # seconds
N, HOP = 1024, 256  # Hann, 75% overlap


def deess(x, sr, lo, hi, threshold, ratio):
    win = np.hanning(N + 1)[:-1]
    f = np.fft.rfftfreq(N, 1 / sr)
    band = np.clip((f - lo) / (hi - lo), 0, 1)
    pad = np.concatenate([np.zeros(N), x, np.zeros(N)])
    out = np.zeros(len(pad))
    norm = np.zeros(len(pad))
    power = lambda S: (2 / N) * np.sum(np.abs(S) ** 2) / N / np.mean(win**2)
    back = HOP / (RELEASE * sr)
    g, deepest = 1.0, 0.0
    for k in range(1 + (len(pad) - N) // HOP):
        S = np.fft.rfft(pad[k * HOP:k * HOP + N] * win)
        level = 10 * np.log10(power(S * band) + 1e-12)
        cut = min(MAX_CUT, max(0.0, (level - threshold) * (1 - 1 / ratio)))
        target = 10 ** (-cut / 20)
        g = target if target < g else g + (target - g) * back
        deepest = max(deepest, -20 * np.log10(g))
        y = np.fft.irfft(S * (1 - band * (1 - g)), N) * win
        out[k * HOP:k * HOP + N] += y
        norm[k * HOP:k * HOP + N] += win**2
    return (out / np.maximum(norm, 1e-9))[N:N + len(x)], deepest


for path in sorted(glob.glob(os.path.join(sys.argv[1], "line-*.wav"))):
    x, sr = sf.read(path, dtype="float64")
    chans, cuts = list(x.T) if x.ndim > 1 else [x], []
    for band in BANDS:
        done = [deess(c, sr, *band) for c in chans]
        chans = [c for c, _ in done]
        cuts.append(max(d for _, d in done))
    if max(cuts) > 0.05:
        sf.write(path, np.stack(chans, 1) if x.ndim > 1 else chans[0], sr, subtype="PCM_16")
    print(f"de-ess {os.path.basename(path)}: {' / '.join(f'{c:.1f}' for c in cuts)}dB at most")
