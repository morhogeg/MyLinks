"""Render the M studies: naked geometry, both palettes, and the small-size test."""
import os
from PIL import Image, ImageDraw

import marks
import treatments as T
from render import rasterize, tile, font, HERE

PALETTES = [("lumen", T.lumen), ("monolith", T.monolith)]
RAW = {}


def build():
    for mk in marks.DESIGNS:
        for pname, fn in [("skel", T.skeleton)] + PALETTES:
            name = f"m_{mk['key']}_{pname}.svg"
            with open(os.path.join(HERE, name), "w") as f:
                f.write(fn(mk))
            RAW[(mk["key"], pname)] = rasterize(name)
        print("built", mk["key"])


def sheet_skeleton():
    S, GAP, PAD, TOP = 400, 34, 40, 96
    W = PAD * 2 + S * len(marks.DESIGNS) + GAP * (len(marks.DESIGNS) - 1)
    out = Image.new("RGB", (W, TOP + S + 118), (236, 236, 238))
    d = ImageDraw.Draw(out)
    d.text((PAD, 32), "THE LETTERFORM ALONE  —  no lighting, no palette",
           font=font(30, True), fill=(24, 24, 28))
    x = PAD
    for mk in marks.DESIGNS:
        out.paste(RAW[(mk["key"], "skel")].resize((S, S), Image.LANCZOS), (x, TOP))
        d.text((x + 2, TOP + S + 16), mk["label"], font=font(26, True), fill=(30, 30, 36))
        d.text((x + 2, TOP + S + 52), mk["note"], font=font(18), fill=(105, 105, 115))
        x += S + GAP
    out.save(os.path.join(HERE, "sheet_marks_skeleton.png"))


def sheet_dressed():
    S, GAP, PAD, TOP, ROWH = 400, 34, 40, 100, 470
    W = PAD * 2 + S * len(marks.DESIGNS) + GAP * (len(marks.DESIGNS) - 1)
    out = Image.new("RGB", (W, TOP + ROWH * 2 + 30), (236, 236, 238))
    d = ImageDraw.Draw(out)
    d.text((PAD, 32), "EACH M IN BOTH PALETTES YOU LIKED",
           font=font(30, True), fill=(24, 24, 28))
    for r, (pname, _) in enumerate(PALETTES):
        y = TOP + r * ROWH
        x = PAD
        for mk in marks.DESIGNS:
            ic = tile(RAW[(mk["key"], pname)], S)
            out.paste(ic, (x, y), ic)
            lab = mk["label"] if r == 0 else f"{mk['label']}  ·  {pname.upper()}"
            d.text((x + 2, y + S + 14), lab, font=font(24, True), fill=(30, 30, 36))
            x += S + GAP
    out.save(os.path.join(HERE, "sheet_marks_dressed.png"))


def sheet_small():
    SIZES = [(120, "60pt @2x"), (80, "40pt @2x"), (58, "29pt @2x"), (38, "notif")]
    CELL, GAP, PAD, TOP, ROWH = 150, 22, 230, 92, 190
    rows = [(mk, p) for p, _ in PALETTES for mk in marks.DESIGNS]
    W = PAD + len(SIZES) * (CELL + GAP) + 20
    out = Image.new("RGB", (W, TOP + len(rows) * ROWH + 30), (236, 236, 238))
    d = ImageDraw.Draw(out)
    d.text((26, 30), "SMALL-SIZE TEST  —  does the letterform survive?",
           font=font(25, True), fill=(24, 24, 28))
    for j, (_, cap) in enumerate(SIZES):
        d.text((PAD + j * (CELL + GAP), TOP - 26), cap, font=font(18), fill=(95, 95, 105))
    for i, (mk, pname) in enumerate(rows):
        y = TOP + i * ROWH
        d.text((22, y + CELL // 2 - 22), mk["label"], font=font(21, True), fill=(30, 30, 36))
        d.text((22, y + CELL // 2 + 4), pname.upper(), font=font(17), fill=(115, 115, 125))
        for j, (px, _) in enumerate(SIZES):
            small = tile(RAW[(mk["key"], pname)], px)
            flat = Image.new("RGB", (px, px), (236, 236, 238))
            flat.paste(small, (0, 0), small)
            out.paste(flat.resize((CELL, CELL), Image.NEAREST),
                      (PAD + j * (CELL + GAP), y))
    out.save(os.path.join(HERE, "sheet_marks_small.png"))


if __name__ == "__main__":
    build()
    sheet_skeleton(); sheet_dressed(); sheet_small()
    print("sheets written")
