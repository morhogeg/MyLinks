"""Contact sheets and the poster for the trip ad.

    python3 scripts/ad-trip-sheet.py [--safe]

Reads out/ads/trip/stills/{story,feed}/fNNNN.png (scripts/ad-trip-stills.mjs)
and writes out/ads/trip/contact-story.png, contact-feed.png and
poster-1080.png (the 1080 x 1080 thumbnail: frame 0 of the 9:16 cut, its
square from the line down through the piles). --safe draws Meta's 9:16 safe
zone (top 270px, bottom 670px, 65px sides) over the story stills.
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "out", "ads", "trip")
SAFE = "--safe" in sys.argv


def sheet(shape, cols, thumb_w):
    d = os.path.join(OUT, "stills", shape)
    files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    ims = []
    for f in files:
        im = Image.open(os.path.join(d, f)).convert("RGB")
        if SAFE and shape == "story":
            ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
            dr = ImageDraw.Draw(ov)
            W, H = im.size
            red = (230, 40, 40, 70)
            dr.rectangle([0, 0, W, 270], fill=red)
            dr.rectangle([0, H - 670, W, H], fill=red)
            dr.rectangle([0, 270, 65, H - 670], fill=red)
            dr.rectangle([W - 65, 270, W, H - 670], fill=red)
            im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
        ims.append((f, im))
    w = thumb_w
    h = round(ims[0][1].height * w / ims[0][1].width)
    rows = (len(ims) + cols - 1) // cols
    pad, lab = 16, 34
    S = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad + lab) + pad), "white")
    dr = ImageDraw.Draw(S)
    for k, (f, im) in enumerate(ims):
        x = pad + (k % cols) * (w + pad)
        y = pad + (k // cols) * (h + pad + lab)
        S.paste(im.resize((w, h), Image.LANCZOS), (x, y + lab))
        fr = int(f[1:5])
        dr.text((x, y + 8), f"frame {fr}  ({fr / 30:.2f}s)", fill=(40, 40, 40))
    name = f"contact-{shape}{'-safe' if SAFE else ''}.png"
    S.save(os.path.join(OUT, name))
    print("wrote", name)


sheet("story", 7, 300)
sheet("feed", 7, 300)
if not SAFE:
    p = Image.open(os.path.join(OUT, "stills", "story", "f0000.png")).convert("RGB")
    top = 300
    p.crop((0, top, 1080, top + 1080)).save(os.path.join(OUT, "poster-1080.png"))
    print("wrote poster-1080.png")
