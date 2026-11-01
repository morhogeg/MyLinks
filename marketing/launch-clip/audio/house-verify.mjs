/**
 * The house gate for every video made from 2026-10-25 on (owner: all the
 * product videos share one design language, and the ending is identical).
 *
 *   node audio/house-verify.mjs            # every video in HOUSE below
 *   node audio/house-verify.mjs pov        # one of them
 *
 * A new video adds itself to HOUSE. Videos made before the rule (the ads,
 * the feature clips, the highlight reel, SAVE THIS, FIND THE BOOK, TICK IT
 * OFF) are not in it and are not re-done (owner, 2026-10-25).
 *
 * Checked, per video:
 *  1. it ends on the kit's Signature: its scene imports it, its timeline's
 *     SIGNATURE_AT + SIGNATURE.frames is TOTAL_FRAMES, and nothing else in the
 *     video says or shows the tagline (the signature says it, once);
 *  2. its colours come from the kit: no hex / rgb / hsl literal anywhere in
 *     its own scene files (kit/tokens.ts holds the palette);
 *  3. its type is the kit's: no fontFamily, no font import, no own easing
 *     curve (bezier / Easing) in its scene files;
 *  4. its final mix carries the signature take, sample for sample in shape,
 *     at the signature's voice frame (when the mix exists);
 *  5. its captions sit in the house band (kit HOUSE_BAND, the compact band
 *     the owner asked for twice) and its frame-0 hook is the kit HookTitle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNATURE } from '../src/reels/kit/signature.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

export const HOUSE = {
  // POV: YOU SAVED IT (2026-10-25)
  pov: { timeline: 'clips/pov-timeline.mjs', dir: 'src/reels/clips/pov', mix: 'public/clips/pov/score-vo.wav' },
  // THE APP STORE PREVIEW (2026-10-28)
  preview: { timeline: 'clips/preview-timeline.mjs', dir: 'src/reels/clips/preview', mix: 'public/clips/preview/score-vo.wav' },
  // LATER NEVER COMES, the Instagram Reel on the preview (2026-10-31)
  later: { timeline: 'clips/later-timeline.mjs', dir: 'src/reels/clips/later', mix: 'public/clips/later/score-vo.wav' },
  // SAME SCREENSHOTS, the before-and-after Reel (2026-11-01)
  shots: { timeline: 'clips/shots-timeline.mjs', dir: 'src/reels/clips/shots', mix: 'public/clips/shots/score-vo.wav' },
};

const TAGLINE = SIGNATURE.line;
const only = process.argv[2];
let failed = 0;

for (const [name, v] of Object.entries(HOUSE)) {
  if (only && only !== name) continue;
  const bad = [];
  const T = await import(path.join(root, v.timeline));
  const files = fs.readdirSync(path.join(root, v.dir)).filter((f) => /\.(tsx?|mjs)$/.test(f));
  const src = Object.fromEntries(files.map((f) => [f, read(path.join(v.dir, f))]));

  // 1. the signature
  if (!Object.values(src).some((s) => /import \{[^}]*\bSignature\b[^}]*\} from '..\/..\/kit\/Signature'/.test(s)))
    bad.push('no scene imports the kit Signature');
  if (T.SIGNATURE_AT + SIGNATURE.frames !== T.TOTAL_FRAMES)
    bad.push(`SIGNATURE_AT (${T.SIGNATURE_AT}) + ${SIGNATURE.frames} ≠ TOTAL_FRAMES (${T.TOTAL_FRAMES}): the signature must be the last frames`);
  for (const c of T.CAPTIONS ?? []) {
    if ((c.say ?? c.text).replace(/\s+/g, ' ').includes(TAGLINE)) bad.push(`caption at ${c.at} says the tagline (the signature says it)`);
    if (c.to > T.SIGNATURE_AT + SIGNATURE.voiceAt) bad.push(`caption at ${c.at} runs into the signature's voice`);
  }
  for (const [f, s] of Object.entries(src)) if (s.includes(TAGLINE)) bad.push(`${f} sets the tagline itself`);

  // 5. the house band and the house hook
  const all = Object.values(src).join('\n');
  if (!/\bHOUSE_BAND\b/.test(all)) bad.push('captions are not in the kit HOUSE_BAND');
  if ((T.CAPTIONS ?? []).some((c) => c.place === 'hook') && !/\bHookTitle\b/.test(all)) bad.push('the hook is not the kit HookTitle');

  // 2–3. colours, type and curves from the kit only
  for (const [f, s] of Object.entries(src)) {
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hex) bad.push(`${f}: colour literal ${[...new Set(hex)].join(', ')} (use kit/tokens.ts)`);
    if (/\b(rgba?|hsla?)\(/.test(code)) bad.push(`${f}: rgb()/hsl() colour (use kit/tokens.ts)`);
    if (/fontFamily\s*:/.test(code) || /from '[^']*fonts'/.test(code)) bad.push(`${f}: sets a font (type comes from the kit)`);
    if (/Easing\.|bezier\(/.test(code)) bad.push(`${f}: its own easing curve (use kit/curves.ts)`);
  }

  // 4. the take, in the mix
  const mixPath = path.join(root, v.mix);
  if (fs.existsSync(mixPath)) {
    const { readWav } = await import('./house-wav.mjs');
    const mix = readWav(mixPath);
    const take = readWav(path.join(root, SIGNATURE.voicePath));
    const at = Math.round(((T.SIGNATURE_AT + SIGNATURE.voiceAt) / SIGNATURE.fps) * mix.rate);
    const n = Math.min(take.data.length, Math.round(take.rate * SIGNATURE.voiceSec));
    // correlate the take with the mix's mono sum around the expected spot (±20ms)
    let best = 0;
    for (let lag = -Math.round(0.02 * mix.rate); lag <= Math.round(0.02 * mix.rate); lag += 4) {
      let xy = 0, xx = 0, yy = 0;
      for (let i = 0; i < n; i += 2) {
        const x = take.data[i], y = mix.data[at + lag + i] ?? 0;
        xy += x * y; xx += x * x; yy += y * y;
      }
      best = Math.max(best, xy / Math.sqrt(xx * yy || 1));
    }
    if (best < 0.6) bad.push(`the mix does not carry the signature take at frame ${T.SIGNATURE_AT + SIGNATURE.voiceAt} (correlation ${best.toFixed(2)})`);
    else console.log(`  ${name}: signature take in the mix (correlation ${best.toFixed(2)})`);
  }

  if (bad.length) {
    failed++;
    console.log(`✗ ${name}\n  - ${bad.join('\n  - ')}`);
  } else console.log(`✓ ${name}: ends on the Signature; the house band and hook; colours, type and curves from the kit`);
}
process.exit(failed ? 1 : 0);
