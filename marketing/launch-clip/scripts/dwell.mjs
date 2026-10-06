/**
 * The dwell rule, checked for every narrated video against its CURRENT
 * narration (out/vo/<script>/manifest.json):
 *   node scripts/dwell.mjs [script…]
 * A caption must hold its whole line (spoken ≤ window), leave 0.3–1.2s after
 * the voice (≤4s for an `until` line; the lockup just holds), and rise at
 * least 3 frames after the previous caption leaves (the mask-rise motion
 * arrives 3 frames early).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const SCRIPTS = {
  reel: './reel-timeline.mjs',
  save: './clips/save-timeline.mjs',
  find: './clips/find-timeline.mjs',
  ask: './clips/ask-timeline.mjs',
  revisit: './clips/revisit-timeline.mjs',
  adcard: './ads/card-timeline.mjs',
  adtodo: './clips/ad-todo-timeline.mjs',
  trip: './ads/trip-timeline.mjs',
  asktalk: './ads/asktalk-timeline.mjs',
};
let bad = 0;
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCRIPTS)) {
  const T = await import(path.join(root, SCRIPTS[name]));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', name, 'manifest.json'), 'utf8'));
  const caps = [...T.CAPTIONS].sort((a, b) => a.at - b.at);
  const rows = [];
  caps.forEach((c, i) => {
    const m = man.find((x) => x.frame === c.at);
    const spoken = m ? m.spoken : null;
    const win = (c.to - c.at) / T.FPS;
    const dwell = spoken == null ? null : win - spoken;
    const issues = [];
    if (spoken == null && c.place !== 'voice') issues.push('no voice line at this frame');
    if (spoken != null && spoken > win + 1e-6) issues.push(`OVERRUN ${(spoken - win).toFixed(2)}s`);
    else if (dwell != null && c.place !== 'lockup') {
      const max = c.until ? 4 : 1.2;
      if (dwell < 0.3 - 1e-6) issues.push(`leaves ${dwell.toFixed(2)}s after the voice (<0.3)`);
      if (dwell > max + 1e-6) issues.push(`lingers ${dwell.toFixed(2)}s (>${max})`);
    }
    if (i && c.at < caps[i - 1].to + 3 && caps[i - 1].place !== 'voice' && c.place !== 'voice') issues.push(`rises ${caps[i - 1].to + 3 - c.at}f early over the previous line`);
    if (issues.length) bad++;
    rows.push(`${issues.length ? '✗' : '✓'} ${String(c.at).padStart(5)}→${String(c.to).padEnd(5)} ${spoken == null ? '  -  ' : spoken.toFixed(2)}/${win.toFixed(2)}s  ${(c.say ?? c.text).replace(/\n/g, ' / ').slice(0, 58).padEnd(58)} ${issues.join('; ')}`);
  });
  console.log(`\n── ${name}`);
  console.log(rows.join('\n'));
}
process.exit(bad ? 1 : 0);
