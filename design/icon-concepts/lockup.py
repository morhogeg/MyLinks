"""MACHINA vs MACHINA AI, on the launch screen and in the login lockup."""
import os, subprocess
from PIL import Image

from wordmark import wordmark, CAP
from nonletter import citation
from marks import emit
from render import HERE, CHROME, SENTINEL

CIT = citation()
MARK = emit(CIT, "#FFFFFF")

VARIANTS = []
for text in ("MACHINA", "MACHINA AI"):
    subs, total = wordmark(text)
    VARIANTS.append((text, f"0 0 {total:.0f} {CAP:.0f}", " ".join(subs)))


def word(vb, d, width, colour="#E9E9F2"):
    return (f'<svg viewBox="{vb}" style="width:{width}px;height:auto;display:block">'
            f'<path d="{d}" fill="{colour}"/></svg>')


def phone(vb, d):
    return f"""<div class="phone">
      <div class="splash">
        <svg class="mk" viewBox="0 0 1024 1024">{MARK}</svg>
        {word(vb, d, 132)}
      </div>
    </div>"""


def lockup(vb, d):
    return f"""<div class="lock">
      <div class="tile"><svg viewBox="0 0 1024 1024">{MARK}</svg></div>
      {word(vb, d, 150)}
      <div class="tag">Capture. Connect. Recall.</div>
    </div>"""


CSS = """
*{box-sizing:border-box;margin:0}
body{background:#EEEEF1;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;
  padding:34px 34px 40px}
h2{font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.16em;
  text-transform:uppercase;color:#7A7A88;margin-bottom:18px}
.row{display:flex;gap:38px;margin-bottom:38px}
.col{display:grid;gap:12px;justify-items:center}
.cap{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.13em;
  text-transform:uppercase;color:#55555F}
.phone{width:236px;aspect-ratio:9/19.5;border-radius:32px;overflow:hidden;
  background:#08080C;border:1px solid #C9C9D2;position:relative}
.splash{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;
  gap:24px;background:radial-gradient(120% 90% at 50% 42%,#1B1B23,#08080C 72%)}
.mk{width:88px;height:88px;color:#fff;filter:drop-shadow(0 0 15px rgba(174,184,206,.34))}
.lock{width:300px;padding:34px 22px;border-radius:16px;background:#0E0E13;
  border:1px solid #C9C9D2;display:grid;gap:18px;justify-items:center}
.lock .tile{width:62px;height:62px;border-radius:17px;
  background:radial-gradient(120% 110% at 50% 34%,#34343F,#14141B);
  display:grid;place-items:center}
.lock .tile svg{width:100%;height:100%;color:#fff}
.tag{font-size:12.5px;color:#8B8B9C;letter-spacing:.02em}
"""


def main():
    body = ['<h2>Launch screen</h2><div class="row">']
    for text, vb, d in VARIANTS:
        body.append(f'<div class="col">{phone(vb, d)}<div class="cap">{text}</div></div>')
    body.append('</div><h2>Login lockup — replacing the purple gradient type</h2><div class="row">')
    for text, vb, d in VARIANTS:
        body.append(f'<div class="col">{lockup(vb, d)}<div class="cap">{text}</div></div>')
    body.append("</div>")

    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style>'
            f'</head><body>{"".join(body)}</body></html>')
    hp, pp = os.path.join(HERE, "_lock.html"), os.path.join(HERE, "_lock.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--screenshot={pp}", "--window-size=700,1250",
                    "file://" + hp], capture_output=True)
    im = Image.open(pp).convert("RGB")
    im.crop((0, 0, 1400, 2180)).resize((700, 1090), Image.LANCZOS).save(
        os.path.join(HERE, "lockup_compare.png"))
    os.remove(hp); os.remove(pp)
    print("lockup_compare.png written")


if __name__ == "__main__":
    main()
