/**
 * The capture "device": a Chromium page shaped and dressed like an iPhone
 * running the app, so a capture reads as an iPhone screenshot.
 *
 *  - 393 × 852 points (iPhone 15/16 Pro), touch, mobile viewport.
 *  - The iPhone's safe areas (59 top, 34 bottom) emulated through DevTools,
 *    so the app lays itself out exactly as it does on the phone: its header
 *    below the status bar, its tab bar above the home indicator.
 *  - The iOS status bar drawn into that top band (9:41, as Apple does).
 *  - THE SYSTEM FONT. The app asks for Geist, but its `--font-geist-sans`
 *    variable is set on <body> while the Tailwind tokens that read it resolve
 *    on :root, so every screen falls back to `ui-sans-serif, system-ui`: SF
 *    Pro on an iPhone. SF Pro cannot be used here, so this machine's system
 *    font is mapped to Inter (its closest open relative) through fontconfig.
 *    The app's CSS is untouched; only the device's system font differs.
 *  - Dark theme by default (the new look, 2026-10-05; CAPTURE_THEME=light
 *    for the old one), consent given, first-run tour seen: the state of a real
 *    account that has been using the app for a while.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const FONT_DIR = path.join(here, '..', 'out', 'capture', 'fonts');
/** The app's theme on the capture device (CAPTURE_THEME=light|dark). */
export const THEME = process.env.CAPTURE_THEME === 'light' ? 'light' : 'dark';
const GLYPH = THEME === 'dark' ? '#fff' : '#000';

export const SCREEN = { width: 393, height: 852, safeTop: 59, safeBottom: 34 };
export const CHROMIUM = process.env.CAPTURE_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** Inter as the device's system font: TTF files + a fontconfig that prefers it. */
export async function prepareFonts() {
  const conf = path.join(FONT_DIR, 'fonts.conf');
  if (fs.existsSync(conf)) return conf;
  const { decompress } = require('wawoff2');
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const src = path.join(path.dirname(require.resolve('inter-ui/package.json')), 'variable');
  for (const f of ['InterVariable', 'InterVariable-Italic']) {
    const ttf = await decompress(fs.readFileSync(path.join(src, `${f}.woff2`)));
    fs.writeFileSync(path.join(FONT_DIR, `${f}.ttf`), ttf);
  }
  fs.writeFileSync(
    conf,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>${FONT_DIR}</dir>
  <cachedir>${path.join(FONT_DIR, 'cache')}</cachedir>
  <alias binding="strong"><family>system-ui</family><prefer><family>Inter Variable</family><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>sans-serif</family><prefer><family>Inter Variable</family><family>Inter</family></prefer></alias>
</fontconfig>
`,
  );
  return conf;
}

/** The iOS status bar: dark glyphs on the light theme, white on the dark. */
const STATUS_BAR = `
<div style="position:fixed;left:0;right:0;top:0;height:54px;z-index:2147483647;pointer-events:none;
  display:flex;align-items:center;justify-content:space-between;padding:17px 32px 0 50px;box-sizing:border-box;
  font:600 17px/1 system-ui;letter-spacing:-0.2px;color:${GLYPH}">
  <span style="font-variant-numeric:tabular-nums">9:41</span>
  <span style="display:flex;align-items:center;gap:7px">
    <svg width="19" height="12" viewBox="0 0 19 12" fill="${GLYPH}">${[0, 1, 2, 3]
      .map((i) => `<rect x="${i * 5}" y="${8.4 - i * 2.8}" width="3.2" height="${3.6 + i * 2.8}" rx="0.9"/>`)
      .join('')}</svg>
    <svg width="17" height="12" viewBox="0 0 17 12" fill="${GLYPH}"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.6 10.6 0 0 0 8.5.5 10.6 10.6 0 0 0 1 3.5l1.2 1.3A9 9 0 0 1 8.5 2.3Zm0 3.5c1.4 0 2.8.6 3.8 1.5l1.2-1.3A7.3 7.3 0 0 0 8.5 4a7.3 7.3 0 0 0-5 2l1.2 1.3c1-.9 2.4-1.5 3.8-1.5Zm0 3.4c-.6 0-1.2.2-1.6.6L8.5 12l1.6-2.2c-.4-.4-1-.6-1.6-.6Z"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="${GLYPH}" stroke-opacity=".35"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="${GLYPH}"/><path d="M25 4.5v4a2.2 2.2 0 0 0 0-4Z" fill="${GLYPH}" fill-opacity=".4"/></svg>
  </span>
</div>`;

/**
 * Open the app on the capture device. `dpr` is the capture resolution: 4 gives
 * 1572 × 3408 frames, enough for the reel's closest push-ins at 1:1.
 */
export async function openDevice(baseUrl, { dpr = 4, statusBar = true } = {}) {
  const fontconfig = await prepareFonts();
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    env: { ...process.env, FONTCONFIG_FILE: fontconfig },
    // nothing but the local capture server is ever contacted
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-first-run',
      '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: SCREEN.width, height: SCREEN.height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    colorScheme: THEME,
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(
    ({ statusBar, bar, theme }) => {
      try {
        localStorage.setItem('theme', theme);
        localStorage.setItem('ai-consent-v1', String(Date.now() - 400 * 86_400_000));
        localStorage.setItem('machina_onboarding_v1', '1');
      } catch {
        /* storage unavailable: the seeded user doc carries the same flags */
      }
      if (statusBar) {
        const add = () => {
          if (document.getElementById('capture-status-bar')) return;
          const el = document.createElement('div');
          el.id = 'capture-status-bar';
          el.innerHTML = bar;
          document.documentElement.appendChild(el);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
        else add();
      }
    },
    { statusBar, bar: STATUS_BAR, theme: THEME },
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: {
      top: SCREEN.safeTop,
      topMax: SCREEN.safeTop,
      bottom: SCREEN.safeBottom,
      bottomMax: SCREEN.safeBottom,
      left: 0,
      leftMax: 0,
      right: 0,
      rightMax: 0,
    },
  });
  // The app runs on Playwright's fake clock from the first script: time flows
  // normally until a take freezes it and steps it frame by frame.
  await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseUrl + '/');
  return { browser, context, page, cdp, errors, dpr };
}
