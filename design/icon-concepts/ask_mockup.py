"""The clamp indicator in a real Ask chat, animated.

The whole panel is rendered in Chromium per frame — real type, real layout —
rather than compositing an SVG onto a Pillow-drawn approximation, because the
question is whether the mark works IN SITU and a fake surround would not
answer that.

Beats and timings are the ones AskBrain.tsx actually ships (THINKING_STAGES,
`free` origin): 'Searching your library…' → 'Reviewing relevant cards…' at
1600ms → 'Writing your answer…' at 4200ms. The citation chip on the answer is
the same bracket vocabulary as the indicator — the thing that was searching is
the thing that found this.
"""
import math, os, subprocess
from PIL import Image

from render import HERE, CHROME, SENTINEL

PW, PH = 620, 680          # panel size
COLS, CHUNK = 3, 18
N = 54

TOP, BOT, W, ARM = 300.0, 700.0, 58.0, 100.0
LX, RX, CX, CY = 296.0, 728.0, 512.0, 500.0


def ease(t):
    t = max(0.0, min(1.0, t))
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def beat(i):
    """(status, spread, dot_r, dot_op, answer_alpha)"""
    if i < 12:
        return ("Searching your library…",
                58 + 11 * math.sin(2 * math.pi * i / 6.0), 16, 0.34, 0.0)
    if i < 24:
        e = ease((i - 12) / 11.0)
        return ("Reviewing relevant cards…",
                58 * (1 - e), 16 + 36 * e, 0.36 + 0.64 * e, 0.0)
    if i < 30:
        p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 24) / 6.0)
        return ("Reviewing relevant cards…", 0.0, 50 + 5 * p, 1.0, 0.0)
    if i < 40:
        p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 30) / 10.0)
        return ("Writing your answer…", 0.0, 50 + 5 * p, 1.0, 0.0)
    return (None, 0.0, 52, 1.0, ease(min(1.0, (i - 40) / 5.0)))


def indicator(i, spread, dot_r, dot_op):
    lx, rx = LX - spread, RX + spread
    left = (f"M{lx} {TOP} L{lx + ARM} {TOP} L{lx + ARM} {TOP + W} L{lx + W} {TOP + W} "
            f"L{lx + W} {BOT - W} L{lx + ARM} {BOT - W} L{lx + ARM} {BOT} L{lx} {BOT} Z")
    right = (f"M{rx} {TOP} L{rx - ARM} {TOP} L{rx - ARM} {TOP + W} L{rx - W} {TOP + W} "
             f"L{rx - W} {BOT - W} L{rx - ARM} {BOT - W} L{rx - ARM} {BOT} L{rx} {BOT} Z")
    return f"""<svg class="ind" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="br{i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#CDD4E2"/>
    </linearGradient>
    <radialGradient id="bl{i}" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#FFFFFF" stop-opacity="{0.8 * dot_op:.2f}"/>
      <stop offset="45%" stop-color="#E6ECFA" stop-opacity="{0.28 * dot_op:.2f}"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
    <filter id="g{i}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <g filter="url(#g{i})" opacity="0.38">
    <path d="{left}" fill="#AEB8CE"/><path d="{right}" fill="#AEB8CE"/>
  </g>
  <path d="{left}" fill="url(#br{i})"/><path d="{right}" fill="url(#br{i})"/>
  <circle cx="{CX}" cy="{CY}" r="{dot_r * 3.3:.1f}" fill="url(#bl{i})"/>
  <circle cx="{CX}" cy="{CY}" r="{dot_r:.1f}" fill="#FFFFFF" opacity="{dot_op:.2f}"/>
</svg>"""


CSS = f"""
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:#f0f}}
.grid{{display:grid;grid-template-columns:repeat({COLS},{PW}px);width:{COLS * PW}px}}
.panel{{width:{PW}px;height:{PH}px;background:#0E0E13;padding:26px 26px 0;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:flex;flex-direction:column;overflow:hidden}}
.hdr{{display:flex;align-items:center;gap:9px;padding-bottom:20px;
  border-bottom:1px solid #1E1E26;color:#6E6E7C;font-size:13px;letter-spacing:.09em}}
.hdr b{{color:#C9C9D6;font-weight:600;letter-spacing:.02em;font-size:14px}}
.q{{display:flex;justify-content:flex-end;margin-top:26px}}
.q span{{background:#212129;color:#E7E7EF;font-size:16px;line-height:1.45;
  padding:13px 17px;border-radius:17px 17px 5px 17px;max-width:80%}}
.row{{display:flex;align-items:center;gap:15px;margin-top:26px;min-height:60px}}
.ind{{width:52px;height:52px;flex:0 0 52px}}
.status{{color:#8E8E9E;font-size:16px}}
.ans{{margin-top:26px;color:#DFDFE9;font-size:16px;line-height:1.62}}
.chip{{display:inline-flex;align-items:center;gap:8px;margin-top:17px;
  background:#181820;border:1px solid #262631;border-radius:11px;
  padding:8px 13px;color:#A9A9BA;font-size:13.5px}}
.chip .bk{{color:#F2F4FA;font-weight:700;letter-spacing:-.5px}}
.dot{{width:5px;height:5px;border-radius:50%;background:#8A8A99}}
"""

QUESTION = "What did I save about spaced repetition?"
ANSWER = ("You saved three pieces on it. The through-line is that recall beats "
          "re-reading — testing yourself is what moves something into long-term "
          "memory, and the spacing only decides how efficiently.")


def panel_html(i):
    status, spread, dr, dop, aa = beat(i)
    if status is not None:
        body = (f'<div class="row">{indicator(i, spread, dr, dop)}'
                f'<div class="status">{status}</div></div>')
    else:
        body = (f'<div class="ans" style="opacity:{aa:.2f}">{ANSWER}'
                f'<div class="chip"><span class="bk">[&#8202;&bull;&#8202;]</span>'
                f'Make It Stick &mdash; ch. 2</div></div>')
    return (f'<div class="panel"><div class="hdr"><b>Ask Machina</b>'
            f'<span class="dot"></span><span>LIBRARY</span></div>'
            f'<div class="q"><span>{QUESTION}</span></div>{body}</div>')


def render_chunk(lo, hi):
    cells = "".join(panel_html(i) for i in range(lo, hi))
    rows = (hi - lo + COLS - 1) // COLS
    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style>'
            f'</head><body><div class="grid">{cells}</div></body></html>')
    hp, pp = os.path.join(HERE, "_ask.html"), os.path.join(HERE, "_ask.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--screenshot={pp}",
                    f"--window-size={COLS * PW + 300},{rows * PH + 300}",
                    "file://" + hp], capture_output=True)
    sheet = Image.open(pp).convert("RGB").crop((0, 0, COLS * PW, rows * PH))
    if any(p == SENTINEL for p in sheet.getdata()):
        raise RuntimeError(f"chunk {lo}-{hi} clipped")
    os.remove(hp); os.remove(pp)
    out = []
    for k in range(hi - lo):
        c, r = k % COLS, k // COLS
        out.append(sheet.crop((c * PW, r * PH, (c + 1) * PW, (r + 1) * PH)))
    return out


def main():
    frames = []
    for lo in range(0, N, CHUNK):
        frames += render_chunk(lo, min(lo + CHUNK, N))
        print("rendered through", min(lo + CHUNK, N))
    p = [f.convert("P", palette=Image.ADAPTIVE, colors=128) for f in frames]
    p[0].save(os.path.join(HERE, "ask_in_situ.gif"), save_all=True,
              append_images=p[1:], duration=105, loop=0, disposal=2)
    frames[8].save(os.path.join(HERE, "ask_in_situ_still.png"))
    frames[47].save(os.path.join(HERE, "ask_in_situ_answer.png"))
    print("ask_in_situ.gif written")


if __name__ == "__main__":
    main()
