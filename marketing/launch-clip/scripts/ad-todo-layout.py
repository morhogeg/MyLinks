# Lay Meta ad 3 out FROM its narration: after the voice changes (new takes,
# a new model or direction), place each line after the last one's measured
# speech, re-derive every beat in HITS from the measured word times, and
# write both into clips/ad-todo-timeline.mjs. Then re-run synth-vo (so the
# word timings carry the new frames), the score, the mixes and verify:
#
#   python3 audio/synth-vo.py adtodo && python3 scripts/ad-todo-layout.py \
#     && python3 audio/synth-vo.py adtodo && node audio/ads/todo-score.mjs \
#     && node audio/mix-vo.mjs adtodo && node audio/mix-vo.mjs adtodo-music \
#     && npm run verify
#
# GAP: frames of air before each line after the previous one's speech ends
# (tight through the problem, owner: "punchier"; more at the turns).
import json, math, re, sys
FPS=30
vo=json.load(open('src/reels/ads/todo/vo.json'))
man=json.load(open('out/vo/adtodo/manifest.json'))
sp=[m['spoken'] for m in man]
GAP=[None, 6, 3, 3, 3, 8, 10, 14, 10, 18, 12, 8, 0]
up8=lambda x: int(math.ceil(x/8)*8)
r8=lambda x: int(round(x/8)*8)
ats=[8]
for i in range(1,12): ats.append(up8(ats[-1]+sp[i-1]*FPS+GAP[i]))
W=lambda i,k: ats[i]+round(vo[i]['words'][k]*FPS)
end=lambda i: ats[i]+sp[i]*FPS
H={}
H['stir']=W(0,3)+4; H['grey']=W(0,12)-2
H['named']=[W(i,1)-3 for i in (1,2,3,4)]
H['bury']=[W(5,5)-8, W(5,5)+48]
mach=ats[6]+vo[6]['words'][5]*FPS; H['snap']=min((8*int(mach//8), 8*int(mach//8)+8), key=lambda x: abs(x-mach))
H['gather']=[H['snap']-24,H['snap']-4]; H['iris']=[H['snap']+28,H['snap']+44]  # the name holds ~1s before the app opens
H['lands']=[W(8,k)-4 for k in range(4)]
key=W(10,10)
H['keyPoints']=key+3; H['kpScroll']=[key-24,key]
H['kpOpen']=(key-46)//8*8; H['glide']=[ats[9], H['kpOpen']-8]
H['cluster']=ats[11]; H['cluster2']=r8(W(11,11)-16)
H['out']=up8(end(11)+4); H['markStrike']=up8(H['out']+24)
lock=H['markStrike']+8
T=up8(lock+sp[12]*FPS+52)
tos=ats[1:]+['HITS.out']
assert H['iris'][1] < H['lands'][0] and H['kpOpen']+18 < H['kpScroll'][0] and H['glide'][1]-H['glide'][0] > 60, H
print(ats, T, T/FPS); print(H)
p='clips/ad-todo-timeline.mjs'; s=open(p).read()
it=iter(zip(ats,tos))
s=re.sub(r"line\(\d+, (?:\d+|HITS\.out), ", lambda m: "line(%d, %s, " % next(it), s)
for k,v in H.items():
    s=re.sub(r"(\n  %s: )(\[[^\]]*\]|\d+)," % k, lambda m: m.group(1)+json.dumps(v, separators=(', ', ': '))+",", s, count=1)
s=re.sub(r"export const TOTAL_FRAMES = \d+;", f"export const TOTAL_FRAMES = {T};", s)
open(p,'w').write(s)
