"""The Ask idle screen — AskBrain.tsx:1116, the 64px 'listening' hero.

This is the largest mark anywhere inside the app and it is NOT a loader: it is a
resting state on an invitation screen. It gets REST — locked, with a breathe so
slow you notice it only if you look. The moment a question is submitted it picks
up TRACE and then the beats, so the hero and the thinking indicator are the same
object changing state rather than two different graphics swapping places.

Layout copied from the component: subheader, hero mb-5, h2 text-xl semibold,
count-free copy, suggestion chips, More ideas, composer with the accent send.
"""
import os, subprocess
from PIL import Image

from render import HERE, CHROME

TOP, BOT, W, ARM = 300.0, 700.0, 58.0, 100.0
LX, RX, CX, CY = 296.0, 728.0, 512.0, 500.0
VB = "288 292 448 416"


def mark(size, glow):
    left = (f"M{LX} {TOP} L{LX+ARM} {TOP} L{LX+ARM} {TOP+W} L{LX+W} {TOP+W} "
            f"L{LX+W} {BOT-W} L{LX+ARM} {BOT-W} L{LX+ARM} {BOT} L{LX} {BOT} Z")
    right = (f"M{RX} {TOP} L{RX-ARM} {TOP} L{RX-ARM} {TOP+W} L{RX-W} {TOP+W} "
             f"L{RX-W} {BOT-W} L{RX-ARM} {BOT-W} L{RX-ARM} {BOT} L{RX} {BOT} Z")
    return (f'<svg viewBox="{VB}" style="width:{size}px;height:auto;display:block;'
            f'filter:drop-shadow(0 0 {size*0.22:.0f}px {glow})" aria-label="Machina is ready">'
            f'<path d="{left}" fill="currentColor"/><path d="{right}" fill="currentColor"/>'
            f'<circle cx="{CX}" cy="{CY}" r="52" fill="currentColor"/></svg>')


CHIPS = ['Why is "Breaking Bad: Walter White\'s Birthday Breakfast" worth my time?',
         "Key takeaways from my Sports saves",
         "What's my latest Recipe save about?",
         'What was "Cheeseburger with Fresh Vegetables" about again?']

CSS = """
*{box-sizing:border-box;margin:0}
body{background:#EEEEF1;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:28px}
h2{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.16em;
 text-transform:uppercase;color:#7A7A88;margin-bottom:16px}
.row{display:flex;gap:38px}
.col{display:grid;gap:11px;justify-items:center}
.cap{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.12em;
 text-transform:uppercase;color:#55555F;text-align:center}
.phone{width:290px;aspect-ratio:9/19.5;border-radius:34px;overflow:hidden;position:relative;
 border:1px solid #C9C9D2;display:flex;flex-direction:column}

.sub{display:flex;align-items:center;gap:11px;padding:14px 16px 13px;border-bottom:1px solid var(--ln)}
.chev{font-size:19px;color:var(--mut);line-height:1}
.lead{width:22px;height:22px;display:grid;place-items:center;color:var(--ink)}
.lead svg{width:100%;height:auto}
.subttl{font-size:16px;font-weight:700;color:var(--ink);letter-spacing:-.01em}

.body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
 text-align:center;padding:0 18px}
.hero{color:var(--ink);margin-bottom:18px}
.q{font-size:19px;font-weight:600;color:var(--ink);letter-spacing:-.02em;margin-bottom:6px}
.sub2{font-size:12.5px;color:var(--mut);line-height:1.5;max-width:230px;margin-bottom:20px}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:7px}
.chip{border:1px solid var(--ln);background:var(--card);border-radius:14px;padding:9px 13px;
 font-size:12.5px;color:var(--ink);line-height:1.35;text-align:center}
.more{margin-top:16px;font-size:12.5px;color:var(--mut)}

.composer{padding:12px 14px 16px}
.field{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--ln);
 border-radius:16px;padding:9px 9px 9px 14px}
.ph{flex:1;font-size:13.5px;color:var(--mut)}
.send{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;
 background:var(--accent);color:#fff;font-size:15px}

.light{--ink:#22222A;--mut:#8A8A96;--ln:#E4E2DE;--card:#FFFFFF;--accent:#A855F7;
 background:#F7F7F9}
.dark{--ink:#E9E9F2;--mut:#82828F;--ln:#22222C;--card:#14141A;--accent:#8B5CF6;
 background:#0C0C11}
"""

SIDEBAR = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
           '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>')


def phone(theme, glow):
    chips = "".join(f'<div class="chip">{c}</div>' for c in CHIPS)
    return f"""<div class="phone {theme}">
      <div class="sub"><span class="chev">‹</span><span class="lead">{SIDEBAR}</span>
        <span class="subttl">Ask Machina</span></div>
      <div class="body">
        <div class="hero">{mark(58, glow)}</div>
        <div class="q">What do you want to recall?</div>
        <div class="sub2">Answers come only from your 105 saves — with sources you can open.</div>
        <div class="chips">{chips}</div>
        <div class="more">↻ More ideas</div>
      </div>
      <div class="composer"><div class="field">
        <span class="ph">Ask about anything you've saved…</span>
        <span class="send">↑</span></div></div>
    </div>"""


def main():
    body = (f'<h2>Ask idle hero — REST</h2><div class="row">'
            f'<div class="col">{phone("light", "rgba(90,88,80,.18)")}'
            f'<div class="cap">light</div></div>'
            f'<div class="col">{phone("dark", "rgba(174,184,206,.30)")}'
            f'<div class="cap">dark</div></div></div>')
    html = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'
    hp, pp = os.path.join(HERE, "_ai.html"), os.path.join(HERE, "_ai.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--screenshot={pp}", "--window-size=720,760",
                    "file://" + hp], capture_output=True)
    Image.open(pp).convert("RGB").crop((0, 0, 1440, 1500)).resize(
        (720, 750), Image.LANCZOS).save(os.path.join(HERE, "ask_idle_mock.png"))
    os.remove(hp); os.remove(pp)
    print("ask_idle_mock.png written")


if __name__ == "__main__":
    main()
