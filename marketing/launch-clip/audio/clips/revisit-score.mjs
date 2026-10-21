/**
 * The REVISIT clip's score (the nocturne engine, audio/nocturne.mjs):
 *   node audio/clips/revisit-score.mjs  →  public/clips/revisit/score.wav
 *   node audio/mix-vo.mjs revisit       →  public/clips/revisit/score-vo.wav
 *
 * The opening's saves lost; the light as they gather into the point and iris
 * into Revisit; the app DRIVES from the first reminder to the lockup
 * (2026-10-21, owner: "too slow, make it more engaging": the recap was calm,
 * it now keeps the drive on the quicker 128.6 BPM grid); the lockup lands it.
 * HITS are app frames: clip frame = HITS + OPEN.
 *
 * THE CLEAN-UP (2026-10-21, owner: "the audio sounds a bit metallic and the
 * music is too loud"):
 *  - the bed sits BED_DB under the engine's level (the mix masters the whole
 *    to −14 LUFS, so the voice comes up by as much as the music goes down),
 *    and every line ducks it deeper (`duck` on the captions);
 *  - the engine's bright, ringing layers (hats, sparks, glints, ticks, claps)
 *    are pulled back (GAINS), and the drive never tips into the peak;
 *  - the narrator's lines (Gemini's 24kHz) are resampled to the score's rate
 *    HERE, with SoX's resampler, before the mix: mix-vo.mjs interpolates
 *    linearly, which mirrors the voice's top octave up into a metallic
 *    sizzle. At the score's rate the mix plays them sample for sample.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from '../../clips/revisit-timeline.mjs';
import { renderCues, voiceSpans, writeWav } from '../nocturne.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const H = T.HITS;
const O = T.OPEN;
const c = (f) => f + O;

const BED_DB = -4;
const GAINS = { hat: 0.55, spark: 0.5, glint: 0.6, tick: 0.6, clap: 0.7, air: 0.7 };

// the narrator's lines, at the score's rate (synth-vo.py writes 24kHz)
const SR = 44100;
const voDir = path.join(root, 'out', 'vo', 'revisit');
const manifest = path.join(voDir, 'manifest.json');
for (const { file } of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
  const wav = path.join(voDir, file);
  const tmp = `${wav}.tmp.wav`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-af', `aresample=${SR}:resampler=soxr:precision=28`, '-c:a', 'pcm_s16le', tmp]);
  fs.renameSync(tmp, wav);
}

const t0 = Date.now();
const mix = renderCues({
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  gains: GAINS,
  voice: voiceSpans(manifest),
  sections: [
    { from: 0, kind: 'dark' },
    { from: T.OPENING.gather[0], kind: 'turn' },
    { from: c(H.settle), kind: 'drive' },
    { from: c(H.out), kind: 'end' },
  ],
  hits: {
    booms: [T.OPENING.gather[1], c(H.markStrike)],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [H.bell, H.cancel, H.openTap, H.tick, H.recapTap, H.cardTap].map(c),
    glints: [H.dueLift, H.smartLift, H.keyPoints[0], H.todoLift, H.standout].map(c),
    whooshes: [c(H.travel[0]), c(H.out)],
  },
});
const out = path.join(root, 'public', 'clips', 'revisit', 'score.wav');
writeWav(out, mix);
// writeWav normalises to −1 dBFS; the bed goes BED_DB under that
const buf = fs.readFileSync(out);
const g = 10 ** (BED_DB / 20);
for (let o = 44; o + 1 < buf.length; o += 2) buf.writeInt16LE(Math.round(buf.readInt16LE(o) * g), o);
fs.writeFileSync(out, buf);
console.log(`revisit: ${mix.seconds.toFixed(1)}s, bed ${BED_DB}dB, lines at ${SR}Hz → public/clips/revisit/score.wav (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
