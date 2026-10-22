# De-ess a script's voice lines (out/vo/<script>/line-NN.wav, 44.1kHz) in
# place, after audio/vo-to-44k.py and before audio/mix-vo.mjs.
#
# Gemini TTS now and then hits an "s" as hard as the vowels around it (SAVE
# THIS, 2026-10-22: "every save" peaked at -7 and -9 dBFS above 4.5kHz in
# two lines, level with the voice itself; the other nine lines sit at -12 to
# -20), and a phone's speaker turns that into a hiss. This is a split-band
# compressor on the STFT: only the band above 4.5kHz (ramped in from
# 3.5kHz), only in the frames where it rises over THRESHOLD, at RATIO, by at
# most MAX_CUT; instant attack, RELEASE back. A line whose sibilants stay
# under the threshold comes back unchanged.
#
#   python3 audio/vo-deess.py out/vo/savethis

import glob
import os
import sys

import numpy as np
import soundfile as sf

THRESHOLD = -12.5  # dBFS, the band's level over one 23ms frame
RATIO = 6.0
MAX_CUT = 9.0  # dB
RELEASE = 0.03  # seconds
LO, HI = 3500.0, 4500.0  # the band's edge: a ramp, not a step
N, HOP = 1024, 256  # Hann, 75% overlap


def deess(x, sr):
    win = np.hanning(N + 1)[:-1]
    f = np.fft.rfftfreq(N, 1 / sr)
    band = np.clip((f - LO) / (HI - LO), 0, 1)
    pad = np.concatenate([np.zeros(N), x, np.zeros(N)])
    out = np.zeros(len(pad))
    norm = np.zeros(len(pad))
    power = lambda S: (2 / N) * np.sum(np.abs(S) ** 2) / N / np.mean(win**2)
    back = HOP / (RELEASE * sr)
    g, deepest = 1.0, 0.0
    for k in range(1 + (len(pad) - N) // HOP):
        S = np.fft.rfft(pad[k * HOP:k * HOP + N] * win)
        level = 10 * np.log10(power(S * band) + 1e-12)
        cut = min(MAX_CUT, max(0.0, (level - THRESHOLD) * (1 - 1 / RATIO)))
        target = 10 ** (-cut / 20)
        g = target if target < g else g + (target - g) * back
        deepest = max(deepest, -20 * np.log10(g))
        y = np.fft.irfft(S * (1 - band * (1 - g)), N) * win
        out[k * HOP:k * HOP + N] += y
        norm[k * HOP:k * HOP + N] += win**2
    return (out / np.maximum(norm, 1e-9))[N:N + len(x)], deepest


for path in sorted(glob.glob(os.path.join(sys.argv[1], "line-*.wav"))):
    x, sr = sf.read(path, dtype="float64")
    done = [deess(c, sr) for c in (x.T if x.ndim > 1 else [x])]
    deepest = max(d for _, d in done)
    if deepest > 0.05:
        sf.write(path, np.stack([c for c, _ in done], 1) if x.ndim > 1 else done[0][0], sr, subtype="PCM_16")
    print(f"de-ess {os.path.basename(path)}: {deepest:.1f}dB at most")
