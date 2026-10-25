/** A PCM16 wav as mono floats (the channels summed): { rate, data }. */
import fs from 'node:fs';

export const readWav = (p) => {
  const b = fs.readFileSync(p);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`not a wav: ${p}`);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error(`expect a PCM16 wav: ${p}`);
  const frames = data.length / 2 / fmt.channels;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
    out[i] = s / fmt.channels;
  }
  return { rate: fmt.rate, data: out };
};
