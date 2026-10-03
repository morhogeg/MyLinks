/**
 * Meta ad 1's opening: the screenshots in its Photos · Screenshots list.
 * Invented for the ad (no platform chrome, no third-party image, no recipe):
 * a friend's chat about a hike, a list of books people keep recommending, a
 * quote card (James Clear's line, attributed). The fourth thumbnail is the
 * SAVE clip's own packing post (public/clips/save/hook/post-1.jpg), copied.
 *
 *   node scripts/ad-card-shots.mjs   →  public/ads/card/hook/shot-{1,2,3}.jpg, post-1.jpg
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'ads', 'card', 'hook');
fs.mkdirSync(out, { recursive: true });

const shell = (body, bg = '#F4F5F7') => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 390px; height: 844px; font-family: Inter, system-ui, sans-serif; background: ${bg}; color: #1B1F27; }
  .bar { height: 50px; padding: 16px 26px 0; font-size: 15px; font-weight: 600; }
</style></head><body><div class="bar">9:41</div>${body}</body></html>`;

const SHOTS = [
  // the screenshot that slides in: a friend's message about a hike
  shell(`<style>
    .who { display:flex; align-items:center; gap:10px; padding: 10px 20px 18px; border-bottom: 1px solid #E3E6EA; }
    .av { width:38px; height:38px; border-radius:50%; background:#7FA88C; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; }
    .name { font-weight:700; font-size:16px; }
    .msgs { padding: 22px 16px; display:flex; flex-direction:column; gap:10px; }
    .in { align-self:flex-start; max-width:78%; background:#fff; border-radius:20px 20px 20px 6px; padding:12px 15px; font-size:17px; line-height:1.35; box-shadow:0 1px 0 rgba(0,0,0,0.05); }
    .out { align-self:flex-end; max-width:70%; background:#2F6FEB; color:#fff; border-radius:20px 20px 6px 20px; padding:12px 15px; font-size:17px; line-height:1.35; }
  </style>
  <div class="who"><div class="av">M</div><div class="name">Maya</div></div>
  <div class="msgs">
    <div class="in">You HAVE to do the Tour du Mont Blanc</div>
    <div class="in">11 days, three countries. Book the huts in January, they fill up fast</div>
    <div class="in">Go early September, fewer people</div>
    <div class="out">Okay saving this</div>
  </div>`),
  // books people keep recommending
  shell(`<style>
    .card { margin: 18px; background:#fff; border-radius:24px; padding: 28px 26px; }
    h1 { font-size: 30px; line-height:1.08; letter-spacing:-0.03em; font-weight:800; margin-bottom: 18px; }
    li { list-style:none; font-size:18px; padding: 12px 0; border-top:1px solid #EEF0F3; }
    li b { color:#8A5CF6; margin-right:10px; }
  </style>
  <div class="card"><h1>Books everyone keeps recommending</h1><ul>
    <li><b>1</b>The Psychology of Money</li><li><b>2</b>Four Thousand Weeks</li>
    <li><b>3</b>Piranesi</li><li><b>4</b>Atomic Habits</li><li><b>5</b>The Creative Act</li></ul></div>`, '#EFEAFB'),
  // a quote card
  shell(`<style>
    .q { margin: 120px 26px 0; font-size: 34px; line-height:1.15; letter-spacing:-0.02em; font-weight:800; color:#1E2A22; }
    .by { margin: 22px 26px; font-size:16px; font-weight:600; color:#4C6B57; }
  </style>
  <div class="q">"You do not rise to the level of your goals. You fall to the level of your systems."</div>
  <div class="by">James Clear</div>`, '#E4EFE6'),
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const [k, html] of SHOTS.entries()) {
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  const png = path.join(out, `shot-${k + 1}.png`);
  await p.screenshot({ path: png });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', 'scale=360:-1', '-q:v', '3', path.join(out, `shot-${k + 1}.jpg`)]);
  fs.rmSync(png);
}
await browser.close();
fs.copyFileSync(path.join(here, '..', 'public', 'clips', 'save', 'hook', 'post-1.jpg'), path.join(out, 'post-1.jpg'));
console.log('wrote', fs.readdirSync(out).join(', '));
