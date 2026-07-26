"""Mockups for the three non-letter marks, with Apex kept in as the benchmark."""
import os
from PIL import Image, ImageDraw

import marks, nonletter, final, treatments as T
from render import rasterize, tile, font, HERE

APEX = marks.apex()
ROW = nonletter.DESIGNS + [dict(APEX, label="APEX  (benchmark)")]
PALETTES = [("lumen", final.lumen_edge), ("monolith", final.monolith_tuned)]
SIZES = [(120, "60pt"), (80, "40pt"), (58, "29pt"), (38, "notif")]
BG = (238, 238, 241)
R = {}


def build():
    for mk in ROW:
        for pal, fn in PALETTES:
            name = f"nl_{mk['key']}_{pal}.svg"
            with open(os.path.join(HERE, name), "w") as f:
                f.write(fn(mk))
            R[(mk["key"], pal)] = rasterize(name)
        name = f"nl_{mk['key']}_skel.svg"
        with open(os.path.join(HERE, name), "w") as f:
            f.write(T.skeleton(mk))
        R[(mk["key"], "skel")] = rasterize(name)
        print("built", mk["key"])


def sheet_naked():
    S, GAP, PAD, TOP = 380, 30, 40, 92
    W = PAD * 2 + S * len(ROW) + GAP * (len(ROW) - 1)
    out = Image.new("RGB", (W, TOP + S + 116), BG)
    d = ImageDraw.Draw(out)
    d.text((PAD, 30), "THE MARK ALONE  —  no lighting, no palette",
           font=font(29, True), fill=(22, 22, 26))
    x = PAD
    for mk in ROW:
        out.paste(R[(mk["key"], "skel")].resize((S, S), Image.LANCZOS), (x, TOP))
        d.text((x + 2, TOP + S + 14), mk["label"], font=font(24, True), fill=(30, 30, 36))
        d.text((x + 2, TOP + S + 48), mk.get("note", ""), font=font(16),
               fill=(108, 108, 118))
        x += S + GAP
    out.save(os.path.join(HERE, "sheet_nonletter_naked.png"))


def sheet_dressed():
    S, GAP, PAD, TOP, ROWH = 380, 30, 40, 100, 448
    W = PAD * 2 + S * len(ROW) + GAP * (len(ROW) - 1)
    out = Image.new("RGB", (W, TOP + ROWH * 2 + 24), BG)
    d = ImageDraw.Draw(out)
    d.text((PAD, 30), "THREE NON-LETTER MARKS, IN BOTH PALETTES",
           font=font(29, True), fill=(22, 22, 26))
    for r, (pal, _) in enumerate(PALETTES):
        y, x = TOP + r * ROWH, PAD
        for mk in ROW:
            ic = tile(R[(mk["key"], pal)], S)
            out.paste(ic, (x, y), ic)
            d.text((x + 2, y + S + 14),
                   f"{mk['label']}  ·  {pal.upper()}", font=font(21, True),
                   fill=(30, 30, 36))
            x += S + GAP
    out.save(os.path.join(HERE, "sheet_nonletter_dressed.png"))


def sheet_small():
    CELL, GAP, PAD, TOP, ROWH = 150, 22, 240, 92, 186
    rows = [(mk, p) for p, _ in PALETTES for mk in ROW]
    W = PAD + len(SIZES) * (CELL + GAP) + 20
    out = Image.new("RGB", (W, TOP + len(rows) * ROWH + 26), BG)
    d = ImageDraw.Draw(out)
    d.text((24, 28), "SMALL-SIZE TEST  —  the test the last non-letter mark failed",
           font=font(24, True), fill=(22, 22, 26))
    for j, (_, cap) in enumerate(SIZES):
        d.text((PAD + j * (CELL + GAP), TOP - 26), cap, font=font(17), fill=(98, 98, 108))
    for i, (mk, pal) in enumerate(rows):
        y = TOP + i * ROWH
        d.text((22, y + CELL // 2 - 20), mk["label"], font=font(20, True), fill=(30, 30, 36))
        d.text((22, y + CELL // 2 + 6), pal.upper(), font=font(16), fill=(112, 112, 122))
        for j, (px_, _) in enumerate(SIZES):
            t = tile(R[(mk["key"], pal)], px_)
            flat = Image.new("RGB", (px_, px_), BG)
            flat.paste(t, (0, 0), t)
            out.paste(flat.resize((CELL, CELL), Image.NEAREST),
                      (PAD + j * (CELL + GAP), y))
    out.save(os.path.join(HERE, "sheet_nonletter_small.png"))


if __name__ == "__main__":
    build()
    sheet_naked(); sheet_dressed(); sheet_small()
    print("sheets written")
