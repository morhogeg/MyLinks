"""Side-by-side mockup of the two tuned Apex finalists."""
import os
from PIL import Image, ImageDraw

import marks, final
from render import rasterize, tile, font, HERE

APEX = marks.apex()
OPTIONS = [("apex_lumen_edge", "APEX  ·  LUMEN", final.lumen_edge),
           ("apex_monolith", "APEX  ·  MONOLITH", final.monolith_tuned)]
SIZES = [(120, "60pt"), (80, "40pt"), (58, "29pt"), (38, "notif")]
BG = (238, 238, 241)


def build():
    out = {}
    for key, _, fn in OPTIONS:
        name = f"final_{key}.svg"
        with open(os.path.join(HERE, name), "w") as f:
            f.write(fn(APEX))
        out[key] = rasterize(name)
        print("built", key)
    return out


def wallpaper(w, h):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t, u = y / h, x / w
            px[x, y] = (int(46 + 34 * u + 22 * t), int(43 + 22 * u + 30 * t),
                        int(60 + 26 * u + 36 * t))
    return im


def mockup(R):
    HERO, GAP, PAD, TOP = 470, 90, 70, 96
    colw = HERO
    W = PAD * 2 + colw * 2 + GAP
    small_y = TOP + HERO + 74
    strip_y = small_y + 150 + 60
    H = strip_y + 300
    out = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(out)
    d.text((PAD, 34), "MACHINA AI  ·  APEX, TUNED FOR BOTH PALETTES",
           font=font(32, True), fill=(22, 22, 26))

    for i, (key, label, _) in enumerate(OPTIONS):
        x = PAD + i * (colw + GAP)
        ic = tile(R[key], HERO)
        out.paste(ic, (x, TOP), ic)
        d.text((x, TOP + HERO + 20), label, font=font(27, True), fill=(30, 30, 36))

        sx = x
        for px_, cap in SIZES:
            t = tile(R[key], px_)
            flat = Image.new("RGB", (px_, px_), BG)
            flat.paste(t, (0, 0), t)
            out.paste(flat, (sx, small_y + (120 - px_) // 2))
            d.text((sx, small_y + 128), cap, font=font(16), fill=(110, 110, 120))
            sx += px_ + 26

    # both together on a wallpaper, at true home-screen scale
    strip = wallpaper(W - PAD * 2, 240)
    sd = ImageDraw.Draw(strip)
    ix = 120
    for key, label, _ in OPTIONS:
        ic = tile(R[key], 156)
        strip.paste(ic, (ix, 40), ic)
        name = label.split("·")[1].strip()
        tw = sd.textlength(name, font=font(19, True))
        sd.text((ix + 78 - tw / 2, 210), name, font=font(19, True), fill=(242, 242, 246))
        ix += 300
    out.paste(strip, (PAD, strip_y))
    d.text((PAD, strip_y - 34), "ON A HOME SCREEN, SAME SCALE",
           font=font(21, True), fill=(60, 60, 70))
    out.save(os.path.join(HERE, "mockup_final.png"))


if __name__ == "__main__":
    mockup(build())
    print("mockup written")
