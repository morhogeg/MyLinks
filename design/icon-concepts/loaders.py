"""Every place the orb currently rides, drawn with the Citation mark instead.

Layouts are copied from the components rather than invented:
  Ask            AskBrain.tsx:229 → OrbStatus (inline-flex, shrink-0 + sibling label)
  Saving a link  LinkScanProgress.tsx:70 → w-5 h-5 slot, gap-3, py-1.5
  Share capture  AnalyzingBanner.tsx:121 → max-w-xs toast, gap-2.5, % + bar

The one thing that has to be got right everywhere: the mark's ink is 432x400
inside a 1024 canvas, so dropping the full artboard into a 20px slot renders it
at ~8px. Every instance uses the tight viewBox so the ink fills the same box the
orb's canvas fills.
"""
import os, subprocess
from PIL import Image

from nonletter import citation
from render import HERE, CHROME

VB = "288 292 448 416"          # tight round the ink
TOP, BOT, W, ARM = 300.0, 700.0, 58.0, 100.0
LX, RX, CX, CY = 296.0, 728.0, 512.0, 500.0
STEPS = ["Fetching the link", "Reading the page", "Writing the summary",
         "Searching connections", "Organizing & tagging"]


def mark(spread=0.0, dot_r=52.0, dot_op=1.0, colour="currentColor", cls=""):
    lx, rx = LX - spread, RX + spread
    left = (f"M{lx} {TOP} L{lx+ARM} {TOP} L{lx+ARM} {TOP+W} L{lx+W} {TOP+W} "
            f"L{lx+W} {BOT-W} L{lx+ARM} {BOT-W} L{lx+ARM} {BOT} L{lx} {BOT} Z")
    right = (f"M{rx} {TOP} L{rx-ARM} {TOP} L{rx-ARM} {TOP+W} L{rx-W} {TOP+W} "
             f"L{rx-W} {BOT-W} L{rx-ARM} {BOT-W} L{rx-ARM} {BOT} L{rx} {BOT} Z")
    return (f'<svg class="{cls}" viewBox="{VB}" aria-hidden="true">'
            f'<path d="{left}" fill="{colour}"/><path d="{right}" fill="{colour}"/>'
            f'<circle cx="{CX}" cy="{CY}" r="{dot_r}" fill="{colour}" '
            f'opacity="{dot_op}"/></svg>')


WORKING = dict(spread=38, dot_r=30, dot_op=.62)

CSS = """
*{box-sizing:border-box;margin:0}
body{background:#EEEEF1;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:30px}
h2{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.16em;
 text-transform:uppercase;color:#7A7A88;margin:30px 0 14px}
h2:first-child{margin-top:0}
.note{font-size:12.5px;color:#6C6C79;margin-bottom:14px;max-width:62ch;line-height:1.5}
.row{display:flex;gap:30px;align-items:flex-start;flex-wrap:wrap}
.cap{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;
 text-transform:uppercase;color:#55555F;margin-top:9px}
.dark{background:#0E0E13;border:1px solid #23232D;border-radius:14px;color:#E6E6F0}

/* Ask — OrbStatus geometry */
.ask{width:360px;padding:18px}
.askrow{display:inline-flex;align-items:center;gap:10px;padding:4px}
.slot{width:20px;height:20px;flex:0 0 20px;display:inline-flex}
.slot svg{width:100%;height:100%;display:block;color:#F2F4FA}
.phrase{font-size:14px;color:#9A9AAA}
.guide .slot{outline:1px dashed #6E6EFF;outline-offset:2px}
.guide .phrase{outline:1px dashed #6E6EFF;outline-offset:2px}

/* Saving a link — the scanner window */
.win{width:340px;padding:18px}
.winhd{display:flex;align-items:center;gap:10px;padding-bottom:12px;border-bottom:1px solid #23232D}
.fav{width:24px;height:24px;border-radius:6px;background:#26262F;display:grid;place-items:center;
 font-size:10px;color:#8B8B9C}
.host{font-size:13px;color:#9A9AAA}
ol{list-style:none;margin-top:14px}
li{display:flex;align-items:center;gap:12px;padding:6px 0}
.sl{width:20px;height:20px;flex:0 0 20px;display:grid;place-items:center}
.sl svg{width:100%;height:100%;color:#F2F4FA}
.chk{width:15px;height:15px;color:#8E8E9E}
.pend{width:15px;height:15px;border-radius:50%;border:1.5px solid #33333F}
.lbl{font-size:13.5px}
.done .lbl{color:#8B8B9C}.act .lbl{color:#EFEFF6;font-weight:600}.pen .lbl{color:#5E5E6B}
.hint{font-size:11px;color:#5E5E6B;text-align:center;margin-top:12px}

/* Share capture — the toast */
.phone{width:250px;aspect-ratio:9/19.5;border-radius:32px;overflow:hidden;position:relative;
 background:#08080C;border:1px solid #C9C9D2}
.sheetbg{position:absolute;inset:0;background:linear-gradient(#15151C,#0A0A0E)}
.sheet{position:absolute;left:8px;right:8px;bottom:8px;border-radius:20px;background:#17171F;
 border:1px solid #262631;padding:14px}
.sheet .ttl{font-size:11px;color:#7A7A88;margin-bottom:10px}
.app{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:10px}
.app.on{background:#22222C}
.appicon{width:30px;height:30px;border-radius:9px;background:radial-gradient(120% 110% at 50% 34%,#34343F,#14141B);
 display:grid;place-items:center}
.appicon svg{width:100%;height:100%;color:#fff}
.appname{font-size:12.5px;color:#DDDDE8}
.toast{position:absolute;left:14px;right:14px;top:64px;border-radius:15px;background:rgba(20,20,26,.96);
 border:1px solid #262631;padding:10px 12px;backdrop-filter:blur(12px)}
.trow{display:flex;align-items:center;gap:10px}
.tslot{width:18px;height:18px;flex:0 0 18px;display:inline-flex}
.tslot svg{width:100%;height:100%;color:#F2F4FA}
/* AnalyzingBanner's label is `truncate`, so it clips rather than wraps —
   a second line would push the bar down and jitter the toast's height. */
.tlbl{flex:1;min-width:0;font-size:12.5px;color:#E6E6F0;font-weight:500;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pct{font-size:12.5px;font-weight:700;color:#9A9AAA;font-variant-numeric:tabular-nums}
.bar{margin-top:8px;height:4px;border-radius:3px;background:#26262F;overflow:hidden}
.bar i{display:block;height:100%;width:62%;border-radius:3px;background:#C9CFDD}
"""

CHECK = ('<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M20 6 9 17l-5-5"/></svg>')


def steps_html(active=2):
    out = []
    for i, label in enumerate(STEPS):
        if i < active:
            slot, cls = CHECK, "done"
        elif i == active:
            slot, cls = mark(**WORKING), "act"
        else:
            slot, cls = '<span class="pend"></span>', "pen"
        out.append(f'<li class="{cls}"><span class="sl">{slot}</span>'
                   f'<span class="lbl">{label}</span></li>')
    return "".join(out)


def main():
    ask = f"""<div class="dark ask">
      <div class="askrow"><span class="slot">{mark(**WORKING)}</span>
      <span class="phrase">Reviewing relevant cards…</span></div></div>"""
    ask_guide = f"""<div class="dark ask guide">
      <div class="askrow"><span class="slot">{mark(**WORKING)}</span>
      <span class="phrase">Reviewing relevant cards…</span></div></div>"""

    win = f"""<div class="dark win">
      <div class="winhd"><span class="fav">A</span><span class="host">arstechnica.com</span></div>
      <ol>{steps_html()}</ol>
      <p class="hint">You can close this window — Machina keeps working.</p></div>"""

    share = f"""<div class="phone"><div class="sheetbg"></div>
      <div class="toast"><div class="trow">
        <span class="tslot">{mark(**WORKING)}</span>
        <span class="tlbl">Writing the summary</span><span class="pct">62%</span>
      </div><div class="bar"><i></i></div></div>
      <div class="sheet"><div class="ttl">Share to</div>
        <div class="app on"><div class="appicon">{mark()}</div><div class="appname">Machina</div></div>
        <div class="app"><div class="appicon" style="background:#2A2A34"></div><div class="appname">Notes</div></div>
        <div class="app"><div class="appicon" style="background:#2A2A34"></div><div class="appname">Reading List</div></div>
      </div></div>"""

    body = f"""
    <h2>Ask — aligned to the orb's box</h2>
    <p class="note">Same geometry OrbStatus uses: a shrink-0 inline-flex slot at the orb's
      size, the phrase as a sibling, both centred on one axis. The dashed guides show the
      two boxes agreeing — the mark uses a tight viewBox so its ink fills the 20px slot the
      way the orb's canvas does, instead of floating at ~8px inside an empty artboard.</p>
    <div class="row">
      <div><div>{ask}</div><div class="cap">as it ships</div></div>
      <div><div>{ask_guide}</div><div class="cap">boxes shown</div></div>
    </div>

    <h2>Saving a link — the scanner window</h2>
    <p class="note">LinkScanProgress keeps its structure exactly: favicon and host, the five
      phases from lib/scanPhases.ts, done collapsing to a check, upcoming as a hollow dot.
      Only the active step's orb becomes the mark.</p>
    <div class="row"><div><div>{win}</div><div class="cap">save dialog</div></div></div>

    <h2>Share sheet from another app</h2>
    <p class="note">The share capture runs the same phases headlessly and reports through
      AnalyzingBanner. The mark rides the toast at 18px beside the phase and the percentage.</p>
    <div class="row"><div><div>{share}</div><div class="cap">capture in progress</div></div></div>"""

    html = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'
    hp, pp = os.path.join(HERE, "_ld.html"), os.path.join(HERE, "_ld.png")
    open(hp, "w").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--screenshot={pp}", "--window-size=820,1500",
                    "file://" + hp], capture_output=True)
    Image.open(pp).convert("RGB").crop((0, 0, 1640, 2760)).resize(
        (820, 1380), Image.LANCZOS).save(os.path.join(HERE, "loaders_mock.png"))
    os.remove(hp); os.remove(pp)
    print("loaders_mock.png written")


if __name__ == "__main__":
    main()
