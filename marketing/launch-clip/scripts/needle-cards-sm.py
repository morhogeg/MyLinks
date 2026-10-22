# FIND THE BOOK: the field's half-size cards (a speed copy of each crop; the
# renderer draws a card from it until it is wider than 760px on screen).
#
#   python3 scripts/needle-cards-sm.py   (after capture/shoot.mjs needleCards)

import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "public", "reel", "app", "clips", "needle", "cards")
DST = os.path.join(HERE, "public", "reel", "app", "clips", "needle", "cards-sm")
os.makedirs(DST, exist_ok=True)
cards = json.load(open(os.path.join(HERE, "src", "reels", "clips", "needle", "cards.json")))["cards"]
for c in cards:
    im = Image.open(os.path.join(SRC, f"{c['id']}.png"))
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(os.path.join(DST, f"{c['id']}.png"), optimize=True)
print(f"{len(cards)} half-size cards → {os.path.relpath(DST, HERE)}")
