# FIND THE BOOK: the field's half-size cards (a speed copy of each crop; the
# renderer draws a card from it until it is wider than 760px on screen), for
# the book's field and (round 3) the video's.
#
#   python3 scripts/needle-cards-sm.py   (after capture/shoot.mjs needleCards,
#                                         needleVideoCards)

import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for name in ("cards", "cards-video"):
    meta = os.path.join(HERE, "src", "reels", "clips", "needle", f"{name}.json")
    if not os.path.exists(meta):
        continue
    SRC = os.path.join(HERE, "public", "reel", "app", "clips", "needle", name)
    DST = os.path.join(HERE, "public", "reel", "app", "clips", "needle", f"{name}-sm")
    os.makedirs(DST, exist_ok=True)
    cards = json.load(open(meta))["cards"]
    for c in cards:
        im = Image.open(os.path.join(SRC, f"{c['id']}.png"))
        im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(os.path.join(DST, f"{c['id']}.png"), optimize=True)
    print(f"{len(cards)} half-size cards → {os.path.relpath(DST, HERE)}")
