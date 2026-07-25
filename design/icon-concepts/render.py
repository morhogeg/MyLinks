"""Render the concept SVGs through Chromium, mask to the iOS squircle, and
build the comparison sheets."""
import os, subprocess, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

CONCEPTS = [
    ("current.svg",              "CURRENT"),
    ("concept1_lumen.svg",       "1 · LUMEN"),
    ("concept2_threshold.svg",   "2 · THRESHOLD"),
    ("concept3b_monolith.svg",   "3 · MONOLITH"),
]


def font(sz, bold=False):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default(sz)


# Sentinel background: any of it surviving inside the crop means the headless
# viewport clipped the artwork, which is otherwise invisible against a dark icon.
SENTINEL = (255, 0, 255)
WRAP = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f0f}}
img{{display:block;width:{s}px;height:{s}px}}</style></head>
<body><img src="{f}"></body></html>"""


def rasterize(svg, size=1024):
    """Headless Chromium's viewport runs ~88px shorter than --window-size, so
    over-request the window and crop back to the real icon box."""
    base = os.path.basename(svg).replace(".svg", "")
    html = os.path.join(HERE, base + "_wrap.html")
    png = os.path.join(HERE, base + "_raw.png")
    with open(html, "w") as f:
        f.write(WRAP.format(s=size, f=os.path.basename(svg)))
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--screenshot={png}", f"--window-size={size + 260},{size + 260}",
                    "file://" + html], capture_output=True)
    im = Image.open(png).convert("RGB").crop((0, 0, size, size))
    if any(p == SENTINEL for p in im.getdata()):
        raise RuntimeError(f"{svg}: sentinel visible in crop — render clipped")
    return im.resize((1024, 1024), Image.LANCZOS)


def squircle(n=5.0, size=1024, ss=4):
    """iOS-style continuous-curvature mask: |u|^n + |v|^n <= 1."""
    g = (np.arange(size * ss) + 0.5) / (size * ss) * 2 - 1
    u, v = np.meshgrid(g, g)
    m = (np.abs(u) ** n + np.abs(v) ** n) <= 1.0
    m = Image.fromarray((m * 255).astype(np.uint8), "L")
    return m.resize((size, size), Image.LANCZOS)


MASK = squircle()


def tile(img, px):
    """Squircle-masked icon at px, with the soft drop shadow iOS gives it."""
    ic = img.resize((px, px), Image.LANCZOS)
    ic.putalpha(MASK.resize((px, px), Image.LANCZOS))
    return ic


def sheet_hero():
    """Each concept large, side by side, on neutral grey."""
    S, GAP, PAD, TOP = 420, 46, 46, 92
    W = PAD * 2 + S * len(CONCEPTS) + GAP * (len(CONCEPTS) - 1)
    H = TOP + S + 96
    out = Image.new("RGB", (W, H), (232, 232, 235))
    d = ImageDraw.Draw(out)
    d.text((PAD, 34), "MACHINA AI  ·  APP ICON CONCEPTS  ·  1024pt",
           font=font(30, True), fill=(28, 28, 32))
    x = PAD
    for svg, label in CONCEPTS:
        out.paste(tile(RENDER[svg], S), (x, TOP), tile(RENDER[svg], S))
        d.text((x + 4, TOP + S + 22), label, font=font(27, True), fill=(40, 40, 46))
        x += S + GAP
    out.save(os.path.join(HERE, "sheet_hero.png"))


def sheet_small():
    """The test that matters: real delivered sizes, nearest-upscaled."""
    SIZES = [(120, "60pt @2x  home"), (80, "40pt @2x  spotlight"),
             (58, "29pt @2x  settings"), (38, "notification")]
    CELL, GAP, PAD, TOP, ROWH = 168, 26, 210, 96, 214
    W = PAD + len(SIZES) * (CELL + GAP) + 20
    H = TOP + len(CONCEPTS) * ROWH + 30
    out = Image.new("RGB", (W, H), (232, 232, 235))
    d = ImageDraw.Draw(out)
    d.text((28, 34), "LEGIBILITY AT DELIVERED SIZES  (downscaled, then nearest-upscaled to inspect)",
           font=font(24, True), fill=(28, 28, 32))
    for j, (_, cap) in enumerate(SIZES):
        d.text((PAD + j * (CELL + GAP), TOP - 26), cap, font=font(18), fill=(90, 90, 100))
    for i, (svg, label) in enumerate(CONCEPTS):
        y = TOP + i * ROWH
        d.text((24, y + CELL // 2 - 12), label, font=font(21, True), fill=(40, 40, 46))
        for j, (px, _) in enumerate(SIZES):
            small = tile(RENDER[svg], px)
            flat = Image.new("RGB", (px, px), (232, 232, 235))
            flat.paste(small, (0, 0), small)
            out.paste(flat.resize((CELL, CELL), Image.NEAREST),
                      (PAD + j * (CELL + GAP), y))
    out.save(os.path.join(HERE, "sheet_small.png"))


def sheet_homescreen():
    """On a wallpaper, at true relative scale, with the label underneath."""
    S, GAP, PAD = 200, 76, 66
    W = PAD * 2 + S * len(CONCEPTS) + GAP * (len(CONCEPTS) - 1)
    H = 330
    bg = Image.new("RGB", (W, H))
    px = bg.load()
    for y in range(H):                       # muted photographic-ish wallpaper
        for x in range(W):
            t, u = y / H, x / W
            px[x, y] = (int(58 + 40 * u + 26 * t), int(54 + 26 * u + 34 * t),
                        int(72 + 30 * u + 40 * t))
    d = ImageDraw.Draw(bg)
    x = PAD
    for svg, label in CONCEPTS:
        ic = tile(RENDER[svg], S)
        bg.paste(ic, (x, 58), ic)
        w = d.textlength(label, font=font(20, True))
        d.text((x + S / 2 - w / 2, 58 + S + 18), label, font=font(20, True),
               fill=(244, 244, 248))
        x += S + GAP
    bg.save(os.path.join(HERE, "sheet_homescreen.png"))


def sheet_tinted():
    """iOS 26 dark/tinted home screen desaturates everything."""
    S, GAP, PAD, TOP = 260, 40, 40, 78
    W = PAD * 2 + S * len(CONCEPTS) + GAP * (len(CONCEPTS) - 1)
    out = Image.new("RGB", (W, TOP + S + 64), (18, 18, 22))
    d = ImageDraw.Draw(out)
    d.text((PAD, 30), "DESATURATED  —  iOS tinted / monochrome home screen",
           font=font(23, True), fill=(228, 228, 234))
    x = PAD
    for svg, label in CONCEPTS:
        g = RENDER[svg].convert("L").convert("RGB")
        ic = tile(g, S)
        out.paste(ic, (x, TOP), ic)
        d.text((x + 2, TOP + S + 18), label, font=font(19, True), fill=(190, 190, 200))
        x += S + GAP
    out.save(os.path.join(HERE, "sheet_tinted.png"))


RENDER = {}
if __name__ == "__main__":
    for svg, _ in CONCEPTS:
        RENDER[svg] = rasterize(svg)
        print("rendered", svg)
    sheet_hero(); sheet_small(); sheet_homescreen(); sheet_tinted()
    for f in glob.glob(os.path.join(HERE, "*_raw.png")) + glob.glob(os.path.join(HERE, "*_wrap.html")):
        os.remove(f)
    print("sheets written")
