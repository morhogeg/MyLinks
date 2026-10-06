/**
 * The film as a plain video page: what the shared link plays (since
 * 2026-10-06; the live 3D page did not open for the owner, and the film's
 * home is a video file).
 *
 *   node live/player.mjs [--force]   →   out/live/player/
 *   node live/player.mjs --page      the page and posters only (no encodes)
 *
 * Reads the masters live/render.mjs writes (out/live/machina-in-motion-
 * landscape.mp4 / -portrait.mp4) and packs each cut for a static host that
 * takes at most 15 MB a file (claude.ai artifacts): H.264 MP4 first, VP9 WebM
 * for browsers without H.264, both 1080p60 at ~1.6 Mb/s (the film is flat
 * paper and type, so this holds up next to the 6 Mb/s master), plus a poster
 * (the hook over the ring) and the page, live/player.html, with the film's
 * chapters (film/edit.js) written in. Encodes are skipped when the output is
 * newer than its master, unless --force.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './media.mjs';
import { chaptersOf, makeEdit } from './film/edit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clip = path.join(here, '..');
const OUT = path.join(clip, 'out', 'live');
const DIR = path.join(OUT, 'player');
const TAKES = path.join(OUT, process.env.LIVE_TAKES ?? 'takes');
const FORCE = process.argv.includes('--force');
const PAGE_ONLY = process.argv.includes('--page');
const LIMIT = 15e6;
const VIDEO_KBPS = 1620;
const POSTER_T = 7.4; // the hook line, fully in, over the ring of cards

fs.mkdirSync(DIR, { recursive: true });
const stale = (out, src) => FORCE || !fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs;
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

for (const cut of ['landscape', 'portrait']) {
  const master = path.join(OUT, `machina-in-motion-${cut}.mp4`);
  if (!fs.existsSync(master)) throw new Error(`no master for ${cut}: run node live/render.mjs --format ${cut} first`);
  const log = path.join(OUT, `player-pass-${cut}`);

  const mp4 = path.join(DIR, `film-${cut}.mp4`);
  if (!PAGE_ONLY && stale(mp4, master)) {
    const v = ['-c:v', 'libx264', '-preset', 'slower', '-b:v', `${VIDEO_KBPS}k`, '-maxrate', '4000k', '-bufsize', '8000k', '-passlogfile', log];
    ff(['-i', master, ...v, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
    ff(['-i', master, ...v, '-pass', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]);
  }
  const webm = path.join(DIR, `film-${cut}.webm`);
  if (!PAGE_ONLY && stale(webm, master)) {
    const v = ['-c:v', 'libvpx-vp9', '-b:v', `${VIDEO_KBPS}k`, '-row-mt', '1', '-deadline', 'good', '-g', '120', '-passlogfile', `${log}-vp9`];
    ff(['-i', master, ...v, '-cpu-used', '4', '-pass', '1', '-an', '-f', 'webm', '/dev/null']);
    ff(['-i', master, ...v, '-cpu-used', '2', '-pass', '2', '-c:a', 'libopus', '-b:a', '112k', webm]);
  }
  ff(['-ss', String(POSTER_T), '-i', master, '-frames:v', '1', '-q:v', '3', path.join(DIR, `poster-${cut}.jpg`)]);

  for (const f of [mp4, webm].filter((f) => fs.existsSync(f))) {
    const mb = fs.statSync(f).size / 1e6;
    console.log(`  ${path.basename(f)} ${mb.toFixed(1)} MB${mb * 1e6 > LIMIT ? '  ✗ over the 15 MB a file a static host takes' : ''}`);
  }
}

// the page, with the film's chapters and length written in
const S = makeEdit(buildIndex(TAKES).takes.session);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const list = chaptersOf(S.at)
  .map((ch, i) =>
    `          <li><button type="button" id="chapter-${ch.name.toLowerCase()}" data-t="${ch.t.toFixed(2)}"${i === 0 ? ' aria-current="true"' : ''}>` +
    `<span class="tc">${clock(ch.t)}</span><span class="nm">${ch.name}</span></button></li>`)
  .join('\n');
const page = fs
  .readFileSync(path.join(here, 'player.html'), 'utf8')
  .replace('<!-- chapters -->', list)
  .replace('__DURATION__', clock(S.dur));
fs.writeFileSync(path.join(DIR, 'index.html'), page);
console.log(`✓ player → ${path.relative(process.cwd(), DIR)} (index.html, 2 cuts × MP4 + WebM, posters)`);
