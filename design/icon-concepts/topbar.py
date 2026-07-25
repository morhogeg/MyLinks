"""Launch wordmark: letterspaced vs the (now fixed) Apex drawing — plus the
top bar from app/page.tsx:159, today against proposed."""
import os, subprocess
from PIL import Image

from wordmark import wordmark, CAP
from nonletter import citation
from marks import emit
from render import HERE, CHROME

MARK = emit(citation(), "#FFFFFF")
MARK_D = emit(citation(), "#22222A")
SUBS, TOTAL = wordmark("MACHINA")
WORD_VB = f"0 0 {TOTAL:.0f} {CAP:.0f}"
WORD_D = " ".join(SUBS)


def word(px, colour="#E9E9F2"):
    return (f'<svg viewBox="{WORD_VB}" style="width:{px}px;height:auto;display:block">'
            f'<path d="{WORD_D}" fill="{colour}"/></svg>')


CSS = """
*{box-sizing:border-box;margin:0}
body{background:#EEEEF1;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:30px}
h2{font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.16em;
  text-transform:uppercase;color:#7A7A88;margin:26px 0 16px}
h2:first-child{margin-top:0}
.row{display:flex;gap:34px;align-items:flex-start}
.col{display:grid;gap:11px;justify-items:center}
.cap{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;color:#55555F;text-align:center}
.phone{width:244px;aspect-ratio:9/19.5;border-radius:32px;overflow:hidden;
  background:#08080C;border:1px solid #C9C9D2;position:relative}
.splash{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;
  gap:24px;background:radial-gradient(120% 90% at 50% 42%,#1B1B23,#08080C 72%)}
.mk{width:92px;height:92px;color:#fff;filter:drop-shadow(0 0 15px rgba(174,184,206,.34))}
.spaced{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;
  letter-spacing:.46em;text-indent:.46em;text-transform:uppercase;color:#E6E6F0}

/* top bar, at the real 68px desktop height from app/page.tsx */
.bar{width:620px;height:68px;display:flex;align-items:center;padding:0 20px;
  position:relative;border-bottom:1px solid var(--bd)}
.bar .glow{position:absolute;inset-inline:0;bottom:0;height:1px}
.brand{display:flex;align-items:center;gap:12px}
.tile{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;
  box-shadow:0 6px 16px rgba(0,0,0,.18)}
.tile svg{width:100%;height:100%}
.stack{display:grid;gap:4px}
.tag{font-size:11px;font-weight:500;letter-spacing:.02em}
.today{--bd:#22222C;background:#0E0E13}
.today .tile{background:linear-gradient(135deg,#8B5CF6,#EC4899)}
.today .glow{background:linear-gradient(90deg,#8B5CF6,#EC4899);opacity:.3}
.today h1{font-size:20px;font-weight:800;letter-spacing:-.02em;
  background:linear-gradient(135deg,#8B5CF6,#EC4899);-webkit-background-clip:text;
  background-clip:text;color:transparent}
.today .tag{color:#8B8B9C}
.prop{--bd:#22222C;background:#0E0E13}
.prop .tile{background:radial-gradient(120% 110% at 50% 34%,#34343F,#14141B)}
.prop .glow{background:linear-gradient(90deg,transparent,#5A5A6B,transparent);opacity:.5}
.prop .tag{color:#8B8B9C}
.lightbar{--bd:#DCD8CD;background:#FAF9F5}
.lightbar .tile{background:radial-gradient(120% 110% at 50% 34%,#FCFBF8,#DFDCD3)}
.lightbar .glow{background:linear-gradient(90deg,transparent,#C9C4B7,transparent);opacity:.7}
.lightbar .tag{color:#6D6A61}
"""


def bar(kind, w_html, mark_svg):
    return f"""<div class="bar {kind}"><div class="glow"></div>
      <div class="brand">
        <div class="tile"><svg viewBox="0 0 1024 1024">{mark_svg}</svg></div>
        <div class="stack">{w_html}<div class="tag">Capture. Connect. Recall.</div></div>
      </div></div>"""


def main():
    splash_spaced = f'<div class="splash"><svg class="mk" viewBox="0 0 1024 1024">{MARK}</svg><div class="spaced">Machina</div></div>'
    splash_apex = f'<div class="splash"><svg class="mk" viewBox="0 0 1024 1024">{MARK}</svg>{word(124)}</div>'

    today_h1 = "<h1>Machina AI</h1>"
    body = f"""
    <h2>Launch wordmark</h2>
    <div class="row">
      <div class="col"><div class="phone">{splash_spaced}</div>
        <div class="cap">letterspaced<br>(the earlier one)</div></div>
      <div class="col"><div class="phone">{splash_apex}</div>
        <div class="cap">apex drawing<br>(A now fixed)</div></div>
    </div>

    <h2>Top bar — app/page.tsx:159</h2>
    <div class="row" style="flex-direction:column;gap:20px">
      <div class="col" style="justify-items:start">{bar('today', today_h1, MARK)}
        <div class="cap">today · purple gradient type</div></div>
      <div class="col" style="justify-items:start">{bar('prop', word(112), MARK)}
        <div class="cap">proposed · apex wordmark, lumen</div></div>
      <div class="col" style="justify-items:start">{bar('lightbar', word(112, '#22222A'), MARK_D)}
        <div class="cap">proposed · light theme</div></div>
    </div>"""

    html = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'
    hp, pp = os.path.join(HERE, "_tb.html"), os.path.join(HERE, "_tb.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--screenshot={pp}", "--window-size=740,1130",
                    "file://" + hp], capture_output=True)
    Image.open(pp).convert("RGB").crop((0, 0, 1480, 2100)).resize(
        (740, 1050), Image.LANCZOS).save(os.path.join(HERE, "topbar_compare.png"))
    os.remove(hp); os.remove(pp)
    print("topbar_compare.png written")


if __name__ == "__main__":
    main()
