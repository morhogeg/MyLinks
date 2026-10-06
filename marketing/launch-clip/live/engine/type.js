/**
 * The film's words: the reel kit's two voices (src/reels/kit/Type.tsx),
 * rebuilt for the DOM so they stay crisp at any size.
 *
 *  - The LINE: each word comes into focus in turn (12px blur → sharp, a
 *    0.28em lift, MODAL, 0.24s), 0.05s apart; the line leaves as one, a soft
 *    focus fade eased in and out (never a fast start on an exit).
 *  - The KICKER names the chapter (SAVE, FIND…): uppercase, tracking settling
 *    0.62 → 0.44em, letters coming into focus 0.027s apart, out with its line.
 *
 * Copy rules (npm run live:verify): no em dashes, no "AI", no "second
 * brain", the name is Machina.
 */

import { EXIT, MODAL, clamp, prog } from './ease.js';

const WORD_IN = 0.24;
const WORD_GAP = 0.05;
const LETTER_GAP = 0.027;
const LINE_OUT = 0.32;

export class Captions {
  /** @param {HTMLElement} layer */
  constructor(layer) {
    this.layer = layer;
    this.cues = [];
  }

  /**
   * @param {{t0:number,t1:number,text:string,kicker?:string,place?:string,size?:number,cls?:string}} cue
   */
  add(cue) {
    const el = document.createElement('div');
    el.className = `cue cue-${cue.place ?? 'left'} ${cue.cls ?? ''}`;
    if (cue.kicker) {
      const k = document.createElement('div');
      k.className = 'kicker';
      for (const ch of cue.kicker.toUpperCase()) {
        const s = document.createElement('span');
        s.textContent = ch;
        k.appendChild(s);
      }
      el.appendChild(k);
      cue.kickerEl = k;
    }
    const line = document.createElement('div');
    line.className = 'line';
    if (cue.size) line.style.fontSize = `${cue.size}px`;
    const words = [];
    cue.text.split('\n').forEach((row, r) => {
      if (r > 0) line.appendChild(document.createElement('br'));
      row.split(' ').forEach((w, i, arr) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w;
        line.appendChild(s);
        words.push(s);
        if (i < arr.length - 1) line.appendChild(document.createTextNode(' '));
      });
    });
    el.appendChild(line);
    this.layer.appendChild(el);
    Object.assign(cue, { el, line, words });
    this.cues.push(cue);
    return cue;
  }

  update(t) {
    for (const c of this.cues) {
      const on = t >= c.t0 - 0.01 && t <= c.t1 + 0.01;
      c.el.style.display = on ? '' : 'none';
      if (!on) continue;
      const out = prog(t, c.t1 - LINE_OUT, c.t1, EXIT);
      c.el.style.opacity = String(1 - out);
      c.el.style.filter = out > 0.01 ? `blur(${(out * 8).toFixed(2)}px)` : '';
      c.words.forEach((w, i) => {
        const p = prog(t, c.t0 + i * WORD_GAP, c.t0 + i * WORD_GAP + WORD_IN, MODAL);
        w.style.opacity = String(clamp(p * 1.15));
        w.style.filter = p < 0.999 ? `blur(${((1 - p) * 12).toFixed(2)}px)` : '';
        w.style.transform = p < 0.999 ? `translateY(${((1 - p) * 0.28).toFixed(3)}em)` : '';
      });
      if (c.kickerEl) {
        const k0 = c.t0 - 0.13;
        const settle = prog(t, k0, k0 + 0.7, MODAL);
        c.kickerEl.style.letterSpacing = `${(0.62 - 0.18 * settle).toFixed(3)}em`;
        [...c.kickerEl.children].forEach((s, i) => {
          const p = prog(t, k0 + i * LETTER_GAP, k0 + i * LETTER_GAP + 0.22, MODAL);
          s.style.opacity = String(p);
          s.style.filter = p < 0.999 ? `blur(${((1 - p) * 8).toFixed(2)}px)` : '';
        });
      }
    }
  }
}
