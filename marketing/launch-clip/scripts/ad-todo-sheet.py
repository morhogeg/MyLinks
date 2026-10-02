"""Contact sheets and the poster for Meta ad 3 (TODO), from
scripts/ad-todo-stills.mjs's stills.

  python3 scripts/ad-todo-sheet.py [--zones]

Writes out/ad-todo-stills/sheet-tall.png, sheet-feed.png (every beat, frame
and time under each) and poster-1080.png (frame 0 of the tall cut, the
1080 x 1080 square a thumbnail uses: the band from the top of the line to
the pile). --zones draws Meta's 9:16 safe zones on the tall sheet (top 270px,
bottom 670px, 65px sides).
"""
import glob
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "ad-todo-stills")
ZONES = "--zones" in sys.argv


def sheet(shape, cols, tw):
    files = sorted(glob.glob(os.path.join(ROOT, shape, "f*.png")))
    ims = [Image.open(f).convert("RGB") for f in files]
    w, h = ims[0].size
    th = round(h * tw / w)
    pad, lab = 16, 34
    rows = (len(ims) + cols - 1) // cols
    out = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + lab + pad) + pad), (232, 234, 238))
    d = ImageDraw.Draw(out)
    for k, (f, im) in enumerate(zip(files, ims)):
        if ZONES and shape == "tall":
            im = im.copy()
            z = ImageDraw.Draw(im, "RGBA")
            z.rectangle([0, 0, w, 270], fill=(255, 0, 80, 40))
            z.rectangle([0, h - 670, w, h], fill=(255, 0, 80, 40))
            z.rectangle([0, 0, 65, h], fill=(255, 0, 80, 40))
            z.rectangle([w - 65, 0, w, h], fill=(255, 0, 80, 40))
        x = pad + (k % cols) * (tw + pad)
        y = pad + (k // cols) * (th + lab + pad)
        out.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        fr = int(os.path.basename(f)[1:5])
        d.text((x, y + th + 8), f"frame {fr}  ·  {fr / 30:.2f}s", fill=(40, 44, 52))
    name = f"sheet-{shape}{'-zones' if ZONES and shape == 'tall' else ''}.png"
    out.save(os.path.join(ROOT, name))
    return name


print(sheet("tall", 7, 240))
print(sheet("feed", 7, 240))
p = Image.open(os.path.join(ROOT, "tall", "f0000.png")).convert("RGB")
p.crop((0, 300, 1080, 1380)).save(os.path.join(ROOT, "poster-1080.png"))
print("poster-1080.png")
