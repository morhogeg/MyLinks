/**
 * Meta ad 1's opening: the screenshots in its Photos · Screenshots list.
 * Invented for the ad (no platform chrome, no third-party image, no recipe):
 * a friend's chat about a hike, a list of books people keep recommending, a
 * quote card (James Clear's line, attributed). The fourth thumbnail is the
 * SAVE clip's own packing post (public/clips/save/hook/post-1.jpg), copied.
 *
 *   node scripts/ad-card-shots.mjs   →  public/ads/card/hook/*.jpg (screenshots + every list's tiles)
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

// round 6 (owner: make every list dynamic, like the screenshots): each
// list's saves as tiles, drawn for the ad (text and colour only, no photo, no
// app chrome). Articles: a page preview; X: a post card; Instagram: a colour
// tile with the place. Real demo saves (titles and bylines as the demo
// account has them), plus the kit's invented @marginalia post.
const tile = (inner, bg = '#FFFFFF') => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 240px; height: 352px; font-family: Inter, system-ui, sans-serif; background: ${bg}; color: #1B1F27; overflow: hidden; }
  .site { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6B7380; }
  .lines i { display:block; height: 7px; border-radius: 4px; background: #E7E9EE; margin-top: 9px; }
</style></head><body>${inner}</body></html>`;
const article = (site, title, band) => tile(`<div style="height:64px;background:${band}"></div>
  <div style="padding:16px 16px"><div class="site">${site}</div>
  <div style="margin-top:8px;font-size:21px;line-height:1.12;font-weight:800;letter-spacing:-0.02em">${title}</div>
  <div class="lines"><i></i><i style="width:88%"></i><i style="width:94%"></i><i style="width:60%"></i></div></div>`);
const post = (initial, name, handle, text, hue) => tile(`<div style="padding:18px 16px">
  <div style="display:flex;gap:9px;align-items:center"><div style="width:34px;height:34px;border-radius:50%;background:${hue};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">${initial}</div>
  <div><div style="font-weight:800;font-size:14px">${name}</div><div style="font-size:12px;color:#6B7380">${handle}</div></div></div>
  <div style="margin-top:14px;font-size:19px;line-height:1.22;font-weight:600">${text}</div>
  <div class="lines" style="margin-top:6px"><i style="width:80%"></i><i style="width:55%"></i></div></div>`, '#FAFAFB');
const place = (name, handle, from, to) => tile(`<div style="position:absolute;inset:0;background:linear-gradient(160deg, ${from}, ${to})"></div>
  <div style="position:absolute;left:16px;right:16px;bottom:18px;color:#fff"><div style="font-size:23px;line-height:1.08;font-weight:800;letter-spacing:-0.02em">${name}</div>
  <div style="margin-top:6px;font-size:12px;font-weight:600;opacity:0.85">${handle}</div></div>`);

const TILES = {
  'article-1': article('markmanson.net', 'The Most Important Question of Your Life', '#F1E6D6'),
  'article-2': article('Wait But Why', 'The Tail End', '#E3ECF6'),
  'article-3': article('lawsofux.com', 'Laws of UX', '#E6F2EA'),
  'article-4': article('Vitsœ', 'Dieter Rams: ten principles for good design', '#EEEEEE'),
  'post-x-1': post('N', 'Naval', '@naval', 'How to Get Rich (without getting lucky)', '#3A4A5C'),
  'post-x-2': post('J', 'James Clear', '@JamesClear', 'You do not rise to the level of your goals.', '#5C7A4A'),
  'post-x-3': post('M', 'marginalia', '@marginalia', 'How I read 40 books a year without speed reading', '#8A5CF6'),
  'ig-1': place('Fushimi Inari at dawn', '@earlytrains', '#F2A65A', '#C2412D'),
  'ig-2': place('Cala Goloritzé, Sardinia', '@slowcoasts', '#7FD1D8', '#2A7FA6'),
  'ig-3': place('Cosmic Cliffs in the Carina Nebula', '@nasawebb', '#6B4FA0', '#1C1840'),
};

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
const t = await browser.newPage({ viewport: { width: 240, height: 352 }, deviceScaleFactor: 2 });
for (const [name, html] of Object.entries(TILES)) {
  await t.setContent(html);
  await t.evaluate(() => document.fonts.ready);
  const png = path.join(out, `${name}.png`);
  await t.screenshot({ path: png });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-q:v', '3', path.join(out, `${name}.jpg`)]);
  fs.rmSync(png);
}
await browser.close();
fs.copyFileSync(path.join(here, '..', 'public', 'clips', 'save', 'hook', 'post-1.jpg'), path.join(out, 'post-1.jpg'));
console.log('wrote', fs.readdirSync(out).join(', '));
