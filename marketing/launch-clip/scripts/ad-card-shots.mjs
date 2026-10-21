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
// app chrome). Articles: a page preview; X: a post card; Instagram: a drawn
// scene of the place. Real demo saves (titles and bylines as the demo
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
// (round 12, owner: the Instagram tiles read as grey squares) each place is a
// drawn scene, not a flat colour: a torii tunnel at dawn, a cove under its
// limestone spire, Webb's nebula cliffs. Drawn for the ad (SVG), no photo.
const place = (name, handle, scene) => tile(`<div style="position:absolute;inset:0">${scene}</div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:150px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.55))"></div>
  <div style="position:absolute;left:16px;right:16px;bottom:18px;color:#fff"><div style="font-size:23px;line-height:1.08;font-weight:800;letter-spacing:-0.02em">${name}</div>
  <div style="margin-top:6px;font-size:12px;font-weight:600;opacity:0.85">${handle}</div></div>`);
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="352" viewBox="0 0 240 352">${body}</svg>`;
// a tunnel of vermilion gates toward the dawn light at its end
const torii = () => {
  const vx = 120, vy = 168;
  let gates = '';
  for (let k = 22; k >= 0; k--) {
    const z = 1 + k * 0.42;
    const s = 1 / z;
    const hw = 150 * s, top = vy - 230 * s, foot = vy + 210 * s, post = Math.max(2, 24 * s);
    const lit = Math.min(1, 0.35 + k * 0.05);
    const red = `rgb(${Math.round(150 + 80 * (1 - lit * 0.4))},${Math.round(40 + 40 * lit)},${Math.round(22 + 30 * lit)})`;
    gates += `<g opacity="${(1 - k * 0.025).toFixed(3)}">
      <rect x="${vx - hw - post / 2}" y="${top}" width="${post}" height="${foot - top}" fill="${red}"/>
      <rect x="${vx + hw - post / 2}" y="${top}" width="${post}" height="${foot - top}" fill="${red}"/>
      <rect x="${vx - hw - post / 2}" y="${foot - 30 * s}" width="${post}" height="${30 * s}" fill="#1A1210"/>
      <rect x="${vx + hw - post / 2}" y="${foot - 30 * s}" width="${post}" height="${30 * s}" fill="#1A1210"/>
      <rect x="${vx - hw - 26 * s}" y="${top - 18 * s}" width="${2 * hw + 52 * s}" height="${16 * s}" fill="#1A1210"/>
      <rect x="${vx - hw - 18 * s}" y="${top - 4 * s}" width="${2 * hw + 36 * s}" height="${12 * s}" fill="${red}"/>
      <rect x="${vx - hw}" y="${top + 34 * s}" width="${2 * hw}" height="${10 * s}" fill="${red}"/></g>`;
  }
  return svg(`<defs><radialGradient id="dawn" cx="0.5" cy="0.47" r="0.6"><stop offset="0" stop-color="#FFF1C9"/><stop offset="0.18" stop-color="#F9C27A"/><stop offset="0.55" stop-color="#5B3A22"/><stop offset="1" stop-color="#1F1A12"/></radialGradient>
    <linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9A27A"/><stop offset="1" stop-color="#5A4636"/></linearGradient></defs>
    <rect width="240" height="352" fill="url(#dawn)"/>
    <polygon points="${vx - 6},${vy + 8} ${vx + 6},${vy + 8} 300,352 -60,352" fill="url(#path)"/>${gates}`);
};
// a white-pebble cove, turquoise water, the limestone spire over it
const cove = () => svg(`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FC8EE"/><stop offset="1" stop-color="#DDF0FA"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D6F9A"/><stop offset="0.45" stop-color="#1FA3B5"/><stop offset="1" stop-color="#7FE0D6"/></linearGradient>
    <linearGradient id="rock" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F1E9DC"/><stop offset="0.55" stop-color="#D9CDBA"/><stop offset="1" stop-color="#A89A86"/></linearGradient>
    <linearGradient id="cliff" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9C8C76"/><stop offset="1" stop-color="#D8CCB8"/></linearGradient></defs>
  <rect width="240" height="352" fill="url(#sky)"/>
  <rect y="150" width="240" height="202" fill="url(#sea)"/>
  <polygon points="0,40 34,52 58,96 70,150 84,210 64,262 0,290" fill="url(#cliff)"/>
  <polygon points="0,120 26,128 44,180 30,240 0,250" fill="#6F8A4E" opacity="0.55"/>
  <polygon points="172,10 186,6 196,40 204,92 214,150 222,196 160,196 166,130 168,70" fill="url(#rock)"/>
  <polygon points="186,6 196,40 204,92 214,150 222,196 200,196 194,120 188,50" fill="#8E806C" opacity="0.5"/>
  <polygon points="150,196 240,186 240,214 156,210" fill="#B9AC97"/>
  <path d="M0 300 Q 110 268 240 286 L 240 352 L 0 352 Z" fill="#F4F1EA"/>
  <path d="M0 300 Q 110 268 240 286" stroke="#FFFFFF" stroke-width="5" fill="none" opacity="0.9"/>
  <g stroke="#FFFFFF" stroke-width="1.6" opacity="0.5" stroke-linecap="round"><line x1="96" y1="176" x2="128" y2="176"/><line x1="60" y1="222" x2="86" y2="222"/><line x1="130" y1="240" x2="170" y2="240"/><line x1="100" y1="200" x2="118" y2="200"/></g>
  <path d="M112 232 l16 0 l-3 5 l-10 0 Z" fill="#FFFFFF"/><line x1="120" y1="232" x2="120" y2="220" stroke="#FFFFFF" stroke-width="1.2"/>`);
// the "Cosmic Cliffs": a glowing ridge of gas under a blue sky of stars
const nebula = () => {
  let stars = '';
  const pts = [[38, 40, 1.4], [196, 58, 2.6], [90, 92, 1], [150, 30, 1.2], [214, 120, 1.1], [24, 140, 1.6], [70, 22, 0.9], [128, 70, 0.8], [176, 96, 1], [52, 186, 0.8], [228, 26, 0.9], [104, 140, 1.2]];
  for (const [x, y, r] of pts) {
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF"/>`;
    if (r > 1.3) stars += `<g stroke="#FFFFFF" stroke-width="0.8" opacity="0.8"><line x1="${x - r * 7}" y1="${y}" x2="${x + r * 7}" y2="${y}"/><line x1="${x - r * 3.5}" y1="${y - r * 6}" x2="${x + r * 3.5}" y2="${y + r * 6}"/><line x1="${x + r * 3.5}" y1="${y - r * 6}" x2="${x - r * 3.5}" y2="${y + r * 6}"/></g>`;
  }
  return svg(`<defs><linearGradient id="space" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1430"/><stop offset="0.45" stop-color="#1E3A78"/><stop offset="0.62" stop-color="#5A6FB0"/></linearGradient>
    <linearGradient id="ridge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD7A0"/><stop offset="0.12" stop-color="#E08A3C"/><stop offset="0.5" stop-color="#8A3F1E"/><stop offset="1" stop-color="#2A120C"/></linearGradient>
    <filter id="gas" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.03" numOctaves="5" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0.75  0 0 0 0 0.5  0 0 0 1.4 -0.45"/></filter>
    <filter id="haze"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="4" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.75  0 0 0 0 1  0 0 0 0.9 -0.3"/></filter>
    <clipPath id="cliffs"><path d="M0 214 C 20 196 30 206 46 188 C 60 172 72 190 88 176 C 104 160 116 182 132 168 C 146 154 160 176 176 160 C 192 146 206 170 222 158 L 240 150 L 240 352 L 0 352 Z"/></clipPath></defs>
    <rect width="240" height="352" fill="url(#space)"/>
    <rect width="240" height="230" filter="url(#haze)" opacity="0.6"/>
    ${stars}
    <g clip-path="url(#cliffs)"><rect y="140" width="240" height="212" fill="url(#ridge)"/><rect y="140" width="240" height="212" filter="url(#gas)" opacity="0.55"/></g>
    <path d="M0 214 C 20 196 30 206 46 188 C 60 172 72 190 88 176 C 104 160 116 182 132 168 C 146 154 160 176 176 160 C 192 146 206 170 222 158 L 240 150" stroke="#FFE6BF" stroke-width="3" fill="none" opacity="0.7" style="filter:blur(2px)"/>`);
};

const TILES = {
  'article-1': article('markmanson.net', 'The Most Important Question of Your Life', '#F1E6D6'),
  'article-2': article('Wait But Why', 'The Tail End', '#E3ECF6'),
  'article-3': article('lawsofux.com', 'Laws of UX', '#E6F2EA'),
  'article-4': article('Vitsœ', 'Dieter Rams: ten principles for good design', '#EEEEEE'),
  'post-x-1': post('N', 'Naval', '@naval', 'How to Get Rich (without getting lucky)', '#3A4A5C'),
  'post-x-2': post('J', 'James Clear', '@JamesClear', 'You do not rise to the level of your goals.', '#5C7A4A'),
  'post-x-3': post('M', 'marginalia', '@marginalia', 'How I read 40 books a year without speed reading', '#8A5CF6'),
  'ig-1': place('Fushimi Inari at dawn', '@earlytrains', torii()),
  'ig-2': place('Cala Goloritzé, Sardinia', '@slowcoasts', cove()),
  'ig-3': place('Cosmic Cliffs in the Carina Nebula', '@nasawebb', nebula()),
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
