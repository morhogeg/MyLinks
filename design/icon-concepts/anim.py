"""Animated Citation mark — a candidate replacement for the Ask thinking orb.

The point is that the motion DEPICTS THE OPERATION rather than signalling
'busy'. Brackets sweep while Machina searches, pull in and settle when it locks
onto sources, then hold while the point breathes as the answer is written. That
maps onto the beats OrbStatus already retargets.

All frames are laid out in one grid and rasterised in a single Chromium pass,
then sliced — 36 separate screenshots would be ~40s of browser startup.
"""
import math, os, subprocess
from PIL import Image, ImageDraw

from render import font, HERE, CHROME, SENTINEL

CELL = 300
COLS = 6
N = 36

# citation geometry, authored in the 1024 icon space
TOP, BOT, W, ARM = 300.0, 700.0, 58.0, 100.0
LX, RX, CX, CY = 296.0, 728.0, 512.0, 500.0


def ease(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def state(i):
    """(spread, dot radius, dot opacity, label) for frame i."""
    if i < 12:                                    # searching
        s = 58 + 11 * math.sin(2 * math.pi * i / 6.0)
        return s, 16, 0.30 + 0.16 * (0.5 + 0.5 * math.sin(2 * math.pi * i / 6.0)), "searching"
    if i < 20:                                    # locking on
        e = ease((i - 12) / 7.0)
        return 58 * (1 - e), 16 + 36 * e, 0.36 + 0.64 * e, "locking"
    if i < 32:                                    # answering
        p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 20) / 12.0)
        return 0.0, 50 + 5 * p, 1.0, "answering"
    e = ease((i - 32) / 3.0)                      # release, back into the loop
    return 58 * e, 52 - 36 * e, 1.0 - 0.64 * e, "release"


def frame_svg(i):
    spread, dr, dop, _ = state(i)
    lx, rx = LX - spread, RX + spread
    left = (f"M{lx} {TOP} L{lx + ARM} {TOP} L{lx + ARM} {TOP + W} L{lx + W} {TOP + W} "
            f"L{lx + W} {BOT - W} L{lx + ARM} {BOT - W} L{lx + ARM} {BOT} L{lx} {BOT} Z")
    right = (f"M{rx} {TOP} L{rx - ARM} {TOP} L{rx - ARM} {TOP + W} L{rx - W} {TOP + W} "
             f"L{rx - W} {BOT - W} L{rx - ARM} {BOT - W} L{rx - ARM} {BOT} L{rx} {BOT} Z")
    u = i  # unique suffix: filter/gradient ids collide when all frames share a document
    return f"""<svg viewBox="0 0 1024 1024" width="{CELL}" height="{CELL}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="br{u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#CDD4E2"/>
    </linearGradient>
    <radialGradient id="bloom{u}" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="{0.85 * dop:.2f}"/>
      <stop offset="45%"  stop-color="#E6ECFA" stop-opacity="{0.30 * dop:.2f}"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
    <filter id="g{u}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="#14141A"/>
  <g filter="url(#g{u})" opacity="0.40">
    <path d="{left}"  fill="#AEB8CE"/>
    <path d="{right}" fill="#AEB8CE"/>
  </g>
  <path d="{left}"  fill="url(#br{u})"/>
  <path d="{right}" fill="url(#br{u})"/>
  <circle cx="{CX}" cy="{CY}" r="{dr * 3.4:.1f}" fill="url(#bloom{u})"/>
  <circle cx="{CX}" cy="{CY}" r="{dr:.1f}" fill="#FFFFFF" opacity="{dop:.2f}"/>
</svg>"""


def render_frames():
    rows = (N + COLS - 1) // COLS
    cells = "".join(frame_svg(i) for i in range(N))
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f0f}}
#g{{display:grid;grid-template-columns:repeat({COLS},{CELL}px);width:{COLS * CELL}px}}
svg{{display:block}}</style></head><body><div id="g">{cells}</div></body></html>"""
    hp = os.path.join(HERE, "_anim.html")
    pp = os.path.join(HERE, "_anim.png")
    with open(hp, "w") as f:
        f.write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--screenshot={pp}",
                    f"--window-size={COLS * CELL + 300},{rows * CELL + 300}",
                    "file://" + hp], capture_output=True)
    sheet = Image.open(pp).convert("RGB").crop((0, 0, COLS * CELL, rows * CELL))
    if any(p == SENTINEL for p in sheet.getdata()):
        raise RuntimeError("frame grid clipped")
    return [sheet.crop(((i % COLS) * CELL, (i // COLS) * CELL,
                        (i % COLS + 1) * CELL, (i // COLS + 1) * CELL))
            for i in range(N)]


def rounded(im, r=54):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], r, fill=255)
    out = im.copy()
    out.putalpha(m)
    return out


def main():
    frames = render_frames()
    gif = [rounded(f).convert("P", palette=Image.ADAPTIVE) for f in frames]
    gif[0].save(os.path.join(HERE, "citation_thinking.gif"), save_all=True,
                append_images=gif[1:], duration=62, loop=0, disposal=2)

    # a labelled filmstrip, since a still can't show the loop
    picks = [(4, "SEARCHING", "brackets sweep, point faint"),
             (16, "LOCKING ON", "they pull in and settle"),
             (26, "ANSWERING", "held; the point breathes"),
             (34, "RELEASE", "back into the loop")]
    S, GAP, PAD, TOP_ = 264, 34, 40, 92
    W_ = PAD * 2 + S * len(picks) + GAP * (len(picks) - 1)
    strip = Image.new("RGB", (W_, TOP_ + S + 116), (238, 238, 241))
    d = ImageDraw.Draw(strip)
    d.text((PAD, 30), "CITATION AS THE ASK INDICATOR  —  the motion depicts the operation",
           font=font(27, True), fill=(22, 22, 26))
    x = PAD
    for idx, name, note in picks:
        ic = rounded(frames[idx].resize((S, S), Image.LANCZOS), 46)
        strip.paste(ic, (x, TOP_), ic)
        d.text((x + 2, TOP_ + S + 16), name, font=font(22, True), fill=(30, 30, 36))
        d.text((x + 2, TOP_ + S + 48), note, font=font(17), fill=(108, 108, 118))
        x += S + GAP
    strip.save(os.path.join(HERE, "citation_thinking_strip.png"))
    for f in ("_anim.html", "_anim.png"):
        os.remove(os.path.join(HERE, f))
    print("gif + filmstrip written")


if __name__ == "__main__":
    main()
