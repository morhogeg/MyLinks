/**
 * Frame-accurate recording of the real app.
 *
 * A "take" is a folder of numbered PNGs plus a manifest. Two kinds of frames
 * go in it:
 *  - STATES: `snap()` after the app has settled (a typed character, a stage
 *    of the save pipeline, a slice of the streamed answer).
 *  - MOTION: `roll(n)` records the app's OWN animation at exactly 30fps. Time
 *    is frozen and then stepped by hand: Playwright's fake clock advances the
 *    JS side (timers, requestAnimationFrame, Date, performance.now: the graph
 *    camera, the save orb) and every CSS animation / transition on the page is
 *    paused and seeked by the same 1/30s. So a captured fling is the deck's
 *    real transition at its real curve and speed, not a re-animation of it.
 *
 * Every frame also records the text visible on screen (for `npm run verify`,
 * which holds the app's copy to the same rules as the reel's captions) and the
 * on-screen rectangles of any named elements, which the reel's camera aims at.
 */

import fs from 'node:fs';
import path from 'node:path';

export const FPS = 30;
const DT = 1000 / FPS;

/** In-page helpers: CSS animation stepping and visible-text/rect readers. */
const PAGE_HELPERS = () => {
  if (window.__rec) return;
  window.__rec = {
    tracked: new Map(),
    frozen: false,
    /** Pause every animation now on the page and remember where it was. */
    adopt() {
      for (const a of document.getAnimations()) {
        if (this.tracked.has(a)) continue;
        const t = a.currentTime ?? 0;
        a.pause();
        this.tracked.set(a, typeof t === 'number' ? t : 0);
      }
    },
    step(dt) {
      this.adopt();
      for (const [a, t] of this.tracked) {
        const nt = t + dt;
        this.tracked.set(a, nt);
        try {
          a.currentTime = nt;
        } catch {
          /* an animation that was cancelled underneath us */
        }
      }
    },
    release() {
      for (const [a] of this.tracked) {
        try {
          a.play();
        } catch {
          /* gone */
        }
      }
      this.tracked.clear();
    },
    /** Text actually on screen: visible text nodes intersecting the viewport. */
    visibleText() {
      const out = [];
      const vw = innerWidth;
      const vh = innerHeight;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const s = n.textContent.replace(/\s+/g, ' ').trim();
        if (!s) continue;
        const el = n.parentElement;
        if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > vh || b.right < 0 || b.left > vw) continue;
        out.push(s);
      }
      // values typed into fields are on screen too
      for (const f of document.querySelectorAll('input, textarea')) {
        if (f.value && f.checkVisibility()) {
          const b = f.getBoundingClientRect();
          if (b.bottom > 0 && b.top < vh) out.push(f.value);
        }
      }
      return out;
    },
    /** The on-screen box of the innermost visible element matching
     *  `selector` (and containing `text`, when given). */
    rect(selector, text) {
      let els = [...document.querySelectorAll(selector)];
      const texts = text == null ? null : Array.isArray(text) ? text : [text];
      if (texts) els = els.filter((e) => texts.some((t) => e.textContent.includes(t)));
      els = els
        .filter((e) => e.checkVisibility())
        .map((e) => ({ e, b: e.getBoundingClientRect() }))
        .filter(({ b }) => b.width > 0 && b.height > 0);
      if (!els.length) return null;
      if (texts) els.sort((a, z) => a.b.width * a.b.height - z.b.width * z.b.height);
      const b = els[0].b;
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    },
  };
};

export class Take {
  constructor(dev, dir, name) {
    this.dev = dev;
    this.page = dev.page;
    this.name = name;
    this.dir = path.join(dir, name);
    this.frames = [];
    this.marks = {};
    this.paused = false;
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async helpers() {
    await this.page.evaluate(PAGE_HELPERS);
  }

  /** Name the NEXT frame, so the reel timeline can refer to it by meaning. */
  mark(label) {
    this.marks[label] = this.frames.length;
  }

  /**
   * One frame. `rects` maps names → [selector, textFilter?]: each is measured
   * on this frame and stored in CSS pixels of the 393×852 screen.
   */
  async snap({ rects = {}, note, caret = 'initial' } = {}) {
    await this.helpers();
    const i = this.frames.length;
    const file = `${String(i).padStart(4, '0')}.png`;
    await this.page.screenshot({ path: path.join(this.dir, file), animations: 'allow', caret });
    const text = await this.page.evaluate(() => window.__rec.visibleText());
    const measured = {};
    for (const [k, [sel, txt]] of Object.entries(rects)) {
      measured[k] = await this.page.evaluate(([s, t]) => window.__rec.rect(s, t), [sel, txt ?? null]);
    }
    this.frames.push({ file, text, rects: measured, ...(note ? { note } : {}) });
    return i;
  }

  /** Freeze time: the JS clock and every CSS animation stop until stepped. */
  async freeze() {
    if (this.paused) return;
    await this.helpers();
    // Time is still flowing while we ask for it, so aim a little ahead (and
    // retry further ahead if the moment has already passed).
    for (let margin = 25; ; margin *= 2) {
      const now = await this.page.evaluate(() => Date.now());
      try {
        await this.page.clock.pauseAt(now + margin);
        break;
      } catch (e) {
        if (margin > 2000) throw e;
      }
    }
    // and the page's animation timeline itself, so a transition that an
    // action starts while frozen waits at its first frame to be stepped
    await this.dev.cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    await this.page.evaluate(() => window.__rec.adopt());
    this.paused = true;
  }

  /** Advance frozen time by `ms` on both clocks. */
  async advance(ms = DT) {
    await this.page.clock.runFor(ms);
    await this.page.evaluate((dt) => window.__rec.step(dt), ms);
  }

  /** Record `n` frames of the app's own motion, `step` ms apart (30fps by
   *  default; DT / 2 records at 60fps, for motion the reel plays slowed). */
  async roll(n, { rects, every, step = DT } = {}) {
    await this.freeze();
    const first = this.frames.length;
    for (let k = 0; k < n; k++) {
      if (k > 0) await this.advance(step);
      else await this.page.evaluate(() => window.__rec.adopt());
      await every?.(k);
      // (round 15) the text caret blinks on the browser's REAL clock, not the
      // stepped one, so across rolled frames it was on or off at random: a
      // 30Hz flicker in any focused field (the Add dialog's tabs, Find).
      // Rolled frames hide it; a typed character's frame keeps it (a
      // keystroke restarts the blink, so it is reliably on right after one)
      await this.snap({ rects, caret: 'hide' });
    }
    return [first, this.frames.length - 1];
  }

  /** Let time run normally again (for waits, typing, network). */
  async thaw() {
    if (!this.paused) return;
    await this.page.evaluate(() => window.__rec.release());
    await this.dev.cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
    await this.page.clock.resume();
    this.paused = false;
  }

  save(extra = {}) {
    const manifest = {
      take: this.name,
      fps: FPS,
      screen: { width: 393, height: 852 },
      dpr: this.dev.dpr,
      marks: this.marks,
      frames: this.frames,
      ...extra,
    };
    fs.writeFileSync(path.join(this.dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    return manifest;
  }
}
