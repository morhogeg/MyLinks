/**
 * Copy checks for the live film, run before any render ships.
 *
 *   node live/verify.mjs
 *
 * Reads EVERY string the app put on screen in the frames the edit actually
 * uses (the capture recorded each frame's visible text), plus the film's own
 * words (the captions in film/script.js), and holds both to the house rules:
 *
 *  - no "AI" as a word and no "second brain" (docs/BRANDING.md D-3)
 *  - the name is Machina, never "Machina AI" (D-1)
 *  - no em dashes (the app-wide ban, web/scripts/check-em-dash.mjs)
 *  - no recipe or cooking content (owner, 2026-10-02)
 *  - the film's own words never say "library" (the launch film's rule)
 *
 * Exits non-zero on a failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, visibleTexts } from './media.mjs';
import { makeEdit, stillFrames } from './film/edit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TAKES = path.join(here, '..', 'out', 'live', process.env.LIVE_TAKES ?? 'takes');
const index = buildIndex(TAKES);
const E = makeEdit(index.takes.session);

// the session frames the film shows (sampled finer than any segment)
const used = new Set();
for (let t = 0; t < E.dur; t += 1 / 60) used.add(E.frameAt(t));
for (const f of Object.values(stillFrames(index.takes.session))) used.add(f);
const appText = [
  ...visibleTexts(TAKES, 'session', [...used]),
  ...visibleTexts(TAKES, 'cards', Object.values(index.takes.cards.marks)),
];

// the film's own words: every caption and kicker in script.js
const script = fs.readFileSync(path.join(here, 'film', 'script.js'), 'utf8');
const filmText = [...script.matchAll(/captions\.add\(\{[^}]*?\}\);/gs)].flatMap((m) => {
  const out = [];
  for (const k of m[0].matchAll(/(?:text|kicker):\s*'((?:[^'\\]|\\.)*)'/g)) out.push(k[1].replace(/\\n/g, ' '));
  return out;
});
// lines kept in a variable (a caption that differs per format)
for (const m of script.matchAll(/const \w+Line = ([^;]+);/g)) {
  for (const k of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (k[1].includes(' ')) filmText.push(k[1].replace(/\\n/g, ' '));
}

const RULES = [
  { name: '"AI" as a word', re: /\bAI\b/, where: 'both' },
  { name: '"second brain"', re: /second\s+brain/i, where: 'both' },
  { name: '"Machina AI"', re: /Machina\s+AI/i, where: 'both' },
  { name: 'em dash', re: /—/, where: 'both' },
  { name: 'recipe or cooking content', re: /recipe|cook this week|cooking|marcella|tomato sauce|roast chicken/i, where: 'app' },
  { name: '"library" in the film’s own words', re: /\blibrary\b/i, where: 'film' },
];

let failed = 0;
for (const r of RULES) {
  const pools = r.where === 'both' ? [['app', appText], ['film', filmText]] : [[r.where, r.where === 'app' ? appText : filmText]];
  for (const [label, pool] of pools) {
    const hits = pool.filter((s) => r.re.test(s));
    if (hits.length) {
      failed++;
      console.log(`✗ ${r.name} in ${label} text:`, [...new Set(hits)].slice(0, 6));
    }
  }
}
// the app's own "library" (its Ask thinking line) is never shown either:
// the edit holds the question over those frames, as the reel does
const appLibrary = appText.filter((s) => /\blibrary\b/i.test(s));
if (appLibrary.length) {
  failed++;
  console.log('✗ the app\u2019s own "library" is on a frame the edit uses:', [...new Set(appLibrary)]);
}

console.log(`${failed ? '✗' : '✓'} live film copy: ${used.size} app frames (${new Set(appText).size} distinct strings) and ${filmText.length} lines of the film's own words checked`);
if (failed) process.exit(1);
