# Lay Meta ad 1 out FROM its narration (round 9: Gemini TTS, Sulafat). Gemini
# performs rather than reads, so its lines run to new lengths: each line
# starts after the previous one's measured speech (plus a breath), never
# earlier than its picture already had it, and every beat that belongs to its
# section (HITS, SCROLLS) moves by the same amount, on the 8th grid. Lines
# that came out SHORTER keep the picture's approved pacing (nothing pulls
# in). Writes ads/card-timeline.mjs; then re-run synth-vo (so the word
# timings carry the new frames), the score, the mixes and verify:
#
#   python3 audio/synth-vo.py adcard && python3 scripts/ad-card-layout.py \
#     && python3 audio/synth-vo.py adcard && node audio/ads/card-score.mjs \
#     && node audio/mix-vo.mjs adcard && node audio/mix-vo.mjs adcardMusic \
#     && npm run verify
#
# Word times are estimated from the audio (about ±0.2s), not recognised.
import json, math, re, subprocess

FPS = 30
BREATH = 9  # frames of air after a line's speech before the next (0.3s)
up8 = lambda x: int(math.ceil(x / 8) * 8)

man = json.load(open('out/vo/adcard/manifest.json'))
spoken = [m['spoken'] for m in man]
T = json.loads(subprocess.run(['node', '-e', "import('./ads/card-timeline.mjs').then(m=>console.log(JSON.stringify({H:m.HITS,S:m.SCROLLS,C:m.CAPTIONS,T:m.TOTAL_FRAMES})))"], capture_output=True, text=True, check=True).stdout)
H, S, C, TOTAL = T['H'], T['S'], T['C'], T['T']
assert len(C) == len(spoken) == 11, (len(C), len(spoken))

# which line each beat travels with
SECTION = {
    'lost': 0, 'article': 1, 'thread': 2, 'screenshot': 3,
    'collapse': 4, 'dotLands': 4, 'bracketsClose': 4,
    'shareStarts': 5, 'shareTaps': 5, 'shareLands': 5, 'part': 5, 'toApp': 5,
    'cardTap': 6, 'keyPoints': 6, 'related': 7, 'graphTap': 7,
    'back': 8, 'bellTap': 8, 'smart': 8, 'saveTap': 8, 'reminderSet': 8,
    'due': 9, 'dueLift': 9, 'throw': 9, 'lockup': 10, 'markStrike': 10,
}
SCROLL_SECTION = [6, 7]

old = [c['at'] for c in C]
new, delta = [], []
for i, c in enumerate(C):
    at = old[i] + (delta[-1] if delta else 0)
    if i:
        at = max(at, new[-1] + spoken[i - 1] * FPS + BREATH)
    # moves come in whole 8ths, so every beat stays on the grid
    at = old[i] + up8(max(0, at - old[i]))
    new.append(at)
    delta.append(at - old[i])
# a section never moves before the one ahead of it
for i in range(1, 11):
    delta[i] = max(delta[i], delta[i - 1])
    new[i] = old[i] + delta[i]

shift = lambda v, d: [x + d for x in v] if isinstance(v, list) else v + d
H2 = {k: shift(v, delta[SECTION[k]]) for k, v in H.items()}
S2 = [[a + delta[SCROLL_SECTION[j]], b + delta[SCROLL_SECTION[j]], t] for j, (a, b, t) in enumerate(S)]
# each line leaves where it left before (moved with it), but never before its
# voice has had 0.3s, nor after the next line starts
tos = []
for i, c in enumerate(C):
    to = c['to'] + delta[i]
    to = max(to, math.ceil(new[i] + spoken[i] * FPS + 9))
    if i < 10:
        to = min(to, new[i + 1])
    tos.append(to)
# the tagline holds 1.6s after the voice
TOTAL2 = max(TOTAL + delta[10], up8(new[10] + spoken[10] * FPS + 48))
tos[10] = TOTAL2
print('lines', list(zip(new, tos)))
print('deltas', delta, 'total', TOTAL2, round(TOTAL2 / FPS, 2))

p = 'ads/card-timeline.mjs'
s = open(p).read()
for k, v in H2.items():
    s = re.sub(r"(\n  %s: )(\[[^\]]*\]|\d+)," % k, lambda m: m.group(1) + json.dumps(v, separators=(', ', ': ')) + ",", s, count=1)
it = iter(S2)
s = re.sub(r"\n  \[\d+, \d+, '(\w+)'\],", lambda m: "\n  [%d, %d, '%s']," % tuple(next(it)), s, count=2)
s = re.sub(r"export const TOTAL_FRAMES = \d+;", f"export const TOTAL_FRAMES = {TOTAL2};", s)
# the lines: `{ at: N, to: M,` in order (the lockup's is HITS-driven)
k = iter(range(10))
def line(m):
    i = next(k)
    return "{ at: %d, to: %d," % (new[i], tos[i])
s = re.sub(r"\{ at: \d+, to: \d+,", line, s, count=10)
open(p, 'w').write(s)
