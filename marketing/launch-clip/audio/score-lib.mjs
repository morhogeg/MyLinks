/**
 * One call per video: its cue sheet → its score (audio/nocturne.mjs), written
 * where its mix (audio/mix-vo.mjs) reads it. Each video's score script is
 * nothing but its cue sheet: which stretches are the problem, the turn, the
 * product and its peak, and which frames get a tick, a glint, a boom.
 *
 * The narrator's spoken spans (out/vo/<script>/manifest.json) keep melodic
 * notes off the words. Deterministic: the same cue sheet renders the same bits.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCues, voiceSpans, writeWav } from './nocturne.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** frames every `step` from a to b (keystrokes) */
export const every = (a, b, step = 4) => {
  const out = [];
  for (let f = a; f < b; f += step) out.push(f);
  return out;
};

export function writeScore({ script, fps, bpm, total, sections, hits, out, seed }) {
  const voice = voiceSpans(path.join(root, 'out', 'vo', script, 'manifest.json'));
  const t0 = Date.now();
  const mix = renderCues({ fps, bpm, total, sections, hits, voice, seed });
  const file = path.join(root, 'public', out);
  const { peak } = writeWav(file, mix);
  console.log(
    `${script}: ${mix.seconds.toFixed(1)}s, ${sections.length} sections, ${voice.length} spoken lines kept clear → public/${out} (peak ${peak.toFixed(3)}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
