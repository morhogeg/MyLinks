/**
 * Copy checks for the live film, run before any render ships.
 *
 *   node live/verify.mjs
 *
 * Reads EVERY string the app put on screen in the frames the edit actually
 * uses (the capture recorded each frame's visible text), plus the film's own
 * words (the captions and the narrator's lines, film/words.js), and holds both
 * to the house rules:
 *
 *  - no "AI" as a word and no "second brain" (docs/BRANDING.md D-3)
 *  - the name is Machina, never "Machina AI" (D-1)
 *  - no em dashes (the app-wide ban, web/scripts/check-em-dash.mjs)
 *  - no recipe or cooking content (owner, 2026-10-02)
 *  - the film's own words never say "library" (the launch film's rule)
 *  - the narrator says the film's words, each line 3dB or more over the music
 *    in the speech band, in a mix mastered to -14 LUFS / -1 dBTP
 *
 * Exits non-zero on a failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, visibleTexts } from './media.mjs';
import { lufs, powerDb, speechBand, truePeak } from '../audio/loudness.mjs';
import { makeEdit, stillFrames } from './film/edit.js';
import { voiceOf, wordsOf } from './film/words.js';

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

// the film's own words: every caption and kicker (film/words.js), as each cut
// sets them, and every line the narrator speaks (the same words, read on)
const filmText = [
  ...new Set([
    ...['landscape', 'portrait'].flatMap((f) => wordsOf(E.at, E.dur, f).flatMap((w) => [w.text.replace(/\n/g, ' '), w.kicker].filter(Boolean))),
    ...voiceOf(E.at, E.dur).map((l) => l.text),
  ]),
];

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

// the narrator (audio/synth-vo.py live + audio/mix-vo.mjs live): every line
// at least 3dB over the music in the speech band, where masking happens (the
// reel's bar), and the mix mastered for the feeds
const VO = path.join(here, '..', 'out', 'vo', 'live');
const MEDIA = path.join(here, '..', 'out', 'live', 'media');
const voFiles = [path.join(VO, 'manifest.json'), path.join(VO, 'mix.json'), path.join(MEDIA, 'score.wav'), path.join(MEDIA, 'score-vo.wav')];
if (voFiles.every((f) => fs.existsSync(f))) {
  const manifest = JSON.parse(fs.readFileSync(voFiles[0], 'utf8'));
  const { gain, bed: BED = 1 } = JSON.parse(fs.readFileSync(voFiles[1], 'utf8'));
  const bed = fs.readFileSync(voFiles[2]);
  const mix = fs.readFileSync(voFiles[3]);
  const SR = mix.readUInt32LE(24);
  const frames = (b) => (b.length - 44) / 4;
  const ch = (b, c) => Float64Array.from({ length: frames(b) }, (_, i) => b.readInt16LE(44 + i * 4 + c * 2) / 32768);
  // the narrator's script must still be the film's words (a stale manifest
  // would say lines the screen no longer shows)
  const want = voiceOf(E.at, E.dur).map((l) => l.text.replace(/Machina/g, 'Makeena'));
  const have = manifest.map((l) => l.text);
  if (want.join('|') !== have.join('|') || manifest.some((l, i) => Math.abs(l.start - voiceOf(E.at, E.dur)[i].start) > 0.01)) {
    failed++;
    console.log('✗ the narrator is stale: re-run python3 audio/synth-vo.py live && node audio/mix-vo.mjs live');
  }
  const mid = (b, i) => (b.readInt16LE(44 + i * 4) + b.readInt16LE(46 + i * 4)) / 65536;
  const rows = manifest.map((l) => {
    const s0 = Math.round(l.start * SR);
    const e = s0 + Math.round(l.spoken * SR);
    const voice = new Float64Array(e - s0);
    const music = new Float64Array(e - s0);
    // the mix minus the bed as it sat under this line is the voice
    const under = BED * (l.duck ?? 0.65);
    for (let i = s0; i < e; i++) {
      voice[i - s0] = mid(mix, i) / gain - mid(bed, i) * under;
      music[i - s0] = mid(bed, i) * under;
    }
    return { text: l.text, db: powerDb(speechBand(voice, SR)) - powerDb(speechBand(music, SR)) };
  });
  const worst = rows.reduce((a, b) => (b.db < a.db ? b : a));
  if (process.env.VERBOSE) for (const r of rows) console.log(`    ${r.db.toFixed(1).padStart(5)}dB  ${r.text}`);
  const I = lufs(ch(mix, 0), ch(mix, 1), SR);
  const tp = truePeak(ch(mix, 0), ch(mix, 1));
  console.log(`  narrator: ${rows.length} lines, voice over music in the speech band min ${worst.db.toFixed(1)}dB ("${worst.text.slice(0, 30)}…"); mix ${I.toFixed(1)} LUFS, ${tp.toFixed(1)} dBTP`);
  for (const r of rows.filter((r) => r.db < 3)) {
    failed++;
    console.log(`✗ the music masks "${r.text}": ${r.db.toFixed(1)}dB over it in the speech band (min 3dB)`);
  }
  if (Math.abs(I + 14) > 0.5 || tp > -1) {
    failed++;
    console.log('✗ the narrated mix is not mastered to -14 LUFS / -1 dBTP');
  }
} else {
  console.log('  (narrator not checked: run python3 audio/synth-vo.py live && node audio/mix-vo.mjs live)');
}

console.log(`${failed ? '✗' : '✓'} live film copy: ${used.size} app frames (${new Set(appText).size} distinct strings) and ${filmText.length} lines of the film's own words checked`);
if (failed) process.exit(1);
