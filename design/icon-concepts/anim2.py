"""Four bracket motions for the Ask indicator, animated side by side.

The brackets already move in the first prototype; the real decision is HOW,
because each motion asserts something different about what Machina is doing:

  CLAMP   brackets slide in and close on the point.      "narrowing in"
  ROTATE  the pair snaps through quarter-turns, then
          settles upright.                               "sweeping / looking"
  STEP    they ratchet inward in discrete ticks, one
          per candidate considered.                      "counting down sources"
  TRACE   the reticle assembles itself, arms first,
          then the point strikes.                        "acquiring"

Each variant is rasterised as its own 6x6 frame grid (one Chromium pass each),
then the four are composited per frame into a single synchronised GIF.
"""
import math, os, subprocess
from PIL import Image, ImageDraw

from render import font, HERE, CHROME, SENTINEL

CELL, COLS, N = 240, 6, 36
TOP, BOT, W, ARM = 300.0, 700.0, 58.0, 100.0
LX, RX, CX, CY = 296.0, 728.0, 512.0, 500.0


def ease(t):
    t = max(0.0, min(1.0, t))
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


# ------------------------------------------------------------------ motions
def clamp(i):
    if i < 12:
        return dict(spread=58 + 11 * math.sin(2 * math.pi * i / 6.0), dot_r=16,
                    dot_op=0.34)
    if i < 20:
        e = ease((i - 12) / 7.0)
        return dict(spread=58 * (1 - e), dot_r=16 + 36 * e, dot_op=0.36 + 0.64 * e)
    if i < 32:
        p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 20) / 12.0)
        return dict(spread=0, dot_r=50 + 5 * p, dot_op=1.0)
    e = ease((i - 32) / 3.0)
    return dict(spread=58 * e, dot_r=52 - 36 * e, dot_op=1.0 - 0.64 * e)


def rotate(i):
    """Quarter-turn snaps: 2 frames of travel, 3 held. Mechanical, not smooth."""
    if i < 20:
        k, f = divmod(i, 5)
        rot = 90 * (k + ease(f / 2.0) if f < 2 else k + 1)
        return dict(spread=14, rot=rot, dot_r=18, dot_op=0.38)
    if i < 27:
        # the sweep has come full circle (360 ≡ upright); settle and strike
        e = ease((i - 20) / 6.0)
        return dict(spread=14 * (1 - e), rot=360,
                    dot_r=18 + 34 * e, dot_op=0.38 + 0.62 * e)
    p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 27) / 9.0)
    return dict(spread=0, rot=360, dot_r=50 + 5 * p, dot_op=1.0)


def step(i):
    """Ratchets inward in five discrete ticks — one per source considered."""
    if i < 25:
        k, f = divmod(i, 5)
        a, b = 90 - 18 * k, 90 - 18 * (k + 1)
        s = a + (b - a) * ease(f / 1.6)
        return dict(spread=s, dot_r=14 + 5 * k, dot_op=0.30 + 0.12 * k)
    if i < 30:
        e = ease((i - 25) / 4.0)
        return dict(spread=0, dot_r=34 + 18 * e, dot_op=0.78 + 0.22 * e)
    p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 30) / 6.0)
    return dict(spread=0, dot_r=50 + 5 * p, dot_op=1.0)


def trace(i):
    """The reticle assembles: arms extend toward the spine, then the point strikes."""
    half = (BOT - TOP) / 2.0
    if i < 14:
        return dict(spread=0, clip_h=W + (half - W) * ease(i / 13.0), dot_r=0, dot_op=0)
    if i < 20:
        e = ease((i - 14) / 5.0)
        return dict(spread=0, clip_h=half, dot_r=52 * e, dot_op=e)
    if i < 30:
        p = 0.5 + 0.5 * math.sin(2 * math.pi * (i - 20) / 10.0)
        return dict(spread=0, clip_h=half, dot_r=50 + 5 * p, dot_op=1.0)
    e = ease((i - 30) / 5.0)
    return dict(spread=0, clip_h=half, dot_r=52, dot_op=1.0, alpha=1.0 - e)


VARIANTS = [("clamp", "CLAMP", "narrowing in", clamp),
            ("rotate", "ROTATE", "sweeping / looking", rotate),
            ("step", "STEP", "counting down sources", step),
            ("trace", "TRACE", "acquiring", trace)]


# ------------------------------------------------------------------- render
def panel(i, p, u):
    spread = p.get("spread", 0.0)
    rot = p.get("rot", 0.0)
    dot_r, dot_op = p.get("dot_r", 0.0), p.get("dot_op", 0.0)
    clip_h, alpha = p.get("clip_h"), p.get("alpha", 1.0)
    lx, rx = LX - spread, RX + spread
    left = (f"M{lx} {TOP} L{lx + ARM} {TOP} L{lx + ARM} {TOP + W} L{lx + W} {TOP + W} "
            f"L{lx + W} {BOT - W} L{lx + ARM} {BOT - W} L{lx + ARM} {BOT} L{lx} {BOT} Z")
    right = (f"M{rx} {TOP} L{rx - ARM} {TOP} L{rx - ARM} {TOP + W} L{rx - W} {TOP + W} "
             f"L{rx - W} {BOT - W} L{rx - ARM} {BOT - W} L{rx - ARM} {BOT} L{rx} {BOT} Z")

    clip = clip_attr = ""
    if clip_h is not None:
        clip = (f'<clipPath id="c{u}">'
                f'<rect x="0" y="{TOP}" width="1024" height="{clip_h:.1f}"/>'
                f'<rect x="0" y="{BOT - clip_h:.1f}" width="1024" height="{clip_h:.1f}"/>'
                f'</clipPath>')
        clip_attr = f' clip-path="url(#c{u})"'

    return f"""<svg viewBox="0 0 1024 1024" width="{CELL}" height="{CELL}" xmlns="http://www.w3.org/2000/svg">
  <defs>{clip}
    <linearGradient id="br{u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#CDD4E2"/>
    </linearGradient>
    <radialGradient id="bl{u}" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="{0.85 * dot_op:.2f}"/>
      <stop offset="45%"  stop-color="#E6ECFA" stop-opacity="{0.30 * dot_op:.2f}"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
    <filter id="g{u}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="#14141A"/>
  <g opacity="{alpha:.2f}">
    <g transform="rotate({rot:.1f} {CX} {CY})"{clip_attr}>
      <g filter="url(#g{u})" opacity="0.40">
        <path d="{left}" fill="#AEB8CE"/><path d="{right}" fill="#AEB8CE"/>
      </g>
      <path d="{left}" fill="url(#br{u})"/><path d="{right}" fill="url(#br{u})"/>
    </g>
    <circle cx="{CX}" cy="{CY}" r="{dot_r * 3.4:.1f}" fill="url(#bl{u})"/>
    <circle cx="{CX}" cy="{CY}" r="{dot_r:.1f}" fill="#FFFFFF" opacity="{dot_op:.2f}"/>
  </g>
</svg>"""


def render_variant(key, fn):
    rows = (N + COLS - 1) // COLS
    cells = "".join(panel(i, fn(i), f"{key}{i}") for i in range(N))
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f0f}}
#g{{display:grid;grid-template-columns:repeat({COLS},{CELL}px);width:{COLS * CELL}px}}
svg{{display:block}}</style></head><body><div id="g">{cells}</div></body></html>"""
    hp, pp = os.path.join(HERE, f"_a_{key}.html"), os.path.join(HERE, f"_a_{key}.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--screenshot={pp}",
                    f"--window-size={COLS * CELL + 300},{rows * CELL + 300}",
                    "file://" + hp], capture_output=True)
    sheet = Image.open(pp).convert("RGB").crop((0, 0, COLS * CELL, rows * CELL))
    if any(p == SENTINEL for p in sheet.getdata()):
        raise RuntimeError(f"{key}: frame grid clipped")
    os.remove(hp); os.remove(pp)
    return [sheet.crop(((i % COLS) * CELL, (i // COLS) * CELL,
                        (i % COLS + 1) * CELL, (i // COLS + 1) * CELL)) for i in range(N)]


def rounded(im, r=42):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], r, fill=255)
    o = im.copy(); o.putalpha(m); return o


def main():
    grids = {k: render_variant(k, fn) for k, _, _, fn in VARIANTS}
    print("rendered", len(grids), "variants")

    PAD, GAP, LAB = 30, 26, 76
    W_ = PAD * 2 + CELL * len(VARIANTS) + GAP * (len(VARIANTS) - 1)
    H_ = PAD + CELL + LAB
    frames = []
    for i in range(N):
        f = Image.new("RGB", (W_, H_), (238, 238, 241))
        d = ImageDraw.Draw(f)
        x = PAD
        for key, name, note, _ in VARIANTS:
            ic = rounded(grids[key][i])
            f.paste(ic, (x, PAD), ic)
            d.text((x + 2, PAD + CELL + 14), name, font=font(21, True), fill=(28, 28, 34))
            d.text((x + 2, PAD + CELL + 42), note, font=font(16), fill=(112, 112, 122))
            x += CELL + GAP
        frames.append(f.convert("P", palette=Image.ADAPTIVE))
    frames[0].save(os.path.join(HERE, "bracket_motions.gif"), save_all=True,
                   append_images=frames[1:], duration=62, loop=0, disposal=2)
    print("bracket_motions.gif written")


if __name__ == "__main__":
    main()
