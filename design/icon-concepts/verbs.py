"""One motion per verb — the Citation replacement for scanPhases' orb vocabulary.

lib/scanPhases.ts states the rule as "one verb → one orb, app-wide": the SHAPE
says what kind of work is running, and it repeats deliberately when two adjacent
phases do the same kind of work. A single mark can keep that rule by varying
MOTION instead of shape.

  listening  STATIC  locked, no motion at all          at ease, ready
  working    PULSE   tight fast pumping                 in flight, on the wire
  searching  SWEEP   wide slow sweep, point faint       scanning
  solving    STEP    ratchets, one tick per candidate   weighing candidates
  shaping    HOLD    locked, the point breathes         producing the output

Only REST and PULSE are new; SWEEP, STEP and HOLD are the phases already built
and reviewed. TRACE stays reserved for arrival — Ask opening, app launch — and
is never a loop.
"""
import math, os, subprocess
from PIL import Image, ImageDraw

from render import font, HERE, CHROME, SENTINEL

CELL, COLS, N = 200, 6, 30
TOP, BOT, W, ARM = 300.0, 700.0, 58.0, 100.0
LX, RX, CX, CY = 296.0, 728.0, 512.0, 500.0


def ease(t):
    t = max(0.0, min(1.0, t))
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def rest(t):
    """listening — the Ask idle hero. STATIC: motion means work is happening,
    and an invitation screen has none."""
    return dict(spread=0, dot_r=52, dot_op=1)


def pulse(t):
    """working — fetching. Tight and quick, so it reads busy next to SWEEP's
    slow wide scan rather than like a second kind of searching."""
    return dict(spread=18 + 10 * math.sin(2 * math.pi * 3 * t), dot_r=38, dot_op=.82)


def sweep(t):
    """searching — the clamp's search phase, looped."""
    amp = 11 * sstep(0, .12, t) * (1 - sstep(.88, 1, t))
    return dict(spread=58 + amp * math.sin(4 * math.pi * t), dot_r=21, dot_op=.46)


def step(t):
    """solving — five ticks, then a beat of hold."""
    if t < .8:
        k = min(4, int(t / .16))
        f = (t - k * .16) / .16
        a, b = 84 - 16 * k, 84 - 16 * (k + 1)
        return dict(spread=a + (b - a) * sstep(0, .4, f),
                    dot_r=20 + 6 * k, dot_op=.42 + .1 * k)
    e = sstep(0, 1, (t - .8) / .2)
    return dict(spread=4 * (1 - e), dot_r=44 + 8 * e, dot_op=.82 + .18 * e)


def hold(t):
    """shaping — locked, only the point breathes."""
    amp = 3.2 * sstep(0, .15, t) * (1 - sstep(.85, 1, t))
    return dict(spread=0, dot_r=52 + amp * math.sin(2 * math.pi * t), dot_op=1)


VERBS = [("listening", "STATIC", rest), ("working", "PULSE", pulse),
         ("searching", "SWEEP", sweep), ("solving", "STEP", step),
         ("shaping", "HOLD", hold)]


def panel(s, u):
    lx, rx = LX - s["spread"], RX + s["spread"]
    left = (f"M{lx} {TOP} L{lx+ARM} {TOP} L{lx+ARM} {TOP+W} L{lx+W} {TOP+W} "
            f"L{lx+W} {BOT-W} L{lx+ARM} {BOT-W} L{lx+ARM} {BOT} L{lx} {BOT} Z")
    right = (f"M{rx} {TOP} L{rx-ARM} {TOP} L{rx-ARM} {TOP+W} L{rx-W} {TOP+W} "
             f"L{rx-W} {BOT-W} L{rx-ARM} {BOT-W} L{rx-ARM} {BOT} L{rx} {BOT} Z")
    return f"""<svg viewBox="0 0 1024 1024" width="{CELL}" height="{CELL}" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="g{u}" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="13"/></filter></defs>
  <rect width="1024" height="1024" fill="#14141A"/>
  <g filter="url(#g{u})" opacity="0.36">
    <path d="{left}" fill="#AEB8CE"/><path d="{right}" fill="#AEB8CE"/></g>
  <path d="{left}" fill="#FFFFFF"/><path d="{right}" fill="#FFFFFF"/>
  <circle cx="{CX}" cy="{CY}" r="{s['dot_r']:.1f}" fill="#FFFFFF" opacity="{s['dot_op']:.2f}"/>
</svg>"""


def render(key, fn):
    rows = (N + COLS - 1) // COLS
    cells = "".join(panel(fn(i / N), f"{key}{i}") for i in range(N))
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f0f}}
#g{{display:grid;grid-template-columns:repeat({COLS},{CELL}px);width:{COLS*CELL}px}}
svg{{display:block}}</style></head><body><div id="g">{cells}</div></body></html>"""
    hp, pp = os.path.join(HERE, f"_v{key}.html"), os.path.join(HERE, f"_v{key}.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--screenshot={pp}",
                    f"--window-size={COLS*CELL+300},{rows*CELL+300}", "file://" + hp],
                   capture_output=True)
    sheet = Image.open(pp).convert("RGB").crop((0, 0, COLS * CELL, rows * CELL))
    if any(p == SENTINEL for p in sheet.getdata()):
        raise RuntimeError(f"{key} clipped")
    os.remove(hp); os.remove(pp)
    return [sheet.crop(((i % COLS) * CELL, (i // COLS) * CELL,
                        (i % COLS + 1) * CELL, (i // COLS + 1) * CELL)) for i in range(N)]


def rounded(im, r=34):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0]-1, im.size[1]-1], r, fill=255)
    o = im.copy(); o.putalpha(m); return o


def main():
    grids = {k: render(k, fn) for k, _, fn in VERBS}
    PAD, GAP, LAB = 26, 22, 74
    W_ = PAD * 2 + CELL * len(VERBS) + GAP * (len(VERBS) - 1)
    frames = []
    for i in range(N):
        f = Image.new("RGB", (W_, PAD + CELL + LAB), (238, 238, 241))
        d = ImageDraw.Draw(f)
        x = PAD
        for key, name, _ in VERBS:
            ic = rounded(grids[key][i])
            f.paste(ic, (x, PAD), ic)
            d.text((x + 2, PAD + CELL + 14), name, font=font(19, True), fill=(28, 28, 34))
            d.text((x + 2, PAD + CELL + 40), key, font=font(15), fill=(112, 112, 122))
            x += CELL + GAP
        frames.append(f.convert("P", palette=Image.ADAPTIVE, colors=96))
    frames[0].save(os.path.join(HERE, "verb_motions.gif"), save_all=True,
                   append_images=frames[1:], duration=66, loop=0, disposal=2)
    print("verb_motions.gif written")


if __name__ == "__main__":
    main()
