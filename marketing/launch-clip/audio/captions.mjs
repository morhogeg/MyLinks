/**
 * Emits `out/machina-launch.srt` from the same SUBTITLES array the picture
 * renders, so the sidecar file can never disagree with what is burned in.
 *
 *   node audio/captions.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, SUBTITLES } from '../timeline.mjs';

const stamp = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const f = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${f}`;
};

const srt = SUBTITLES.map((c, i) =>
  [
    i + 1,
    `${stamp(c.bar * BAR)} --> ${stamp((c.bar + c.bars) * BAR)}`,
    c.text,
    '',
  ].join('\n'),
).join('\n');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'out', 'machina-launch.srt');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, srt);
console.log(`wrote ${out} — ${SUBTITLES.length} cues`);
