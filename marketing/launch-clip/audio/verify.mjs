/**
 * Pre-render checks that catch the things a still review cannot.
 *
 *   node audio/verify.mjs
 *
 * 1. CAPTION OVERLAPS. Two lines on screen at once is the one thing the subtitle
 *    track must never do — the component renders every cue whose window contains
 *    the frame, so a 0.2-bar overlap silently stacks two lines in the same place.
 *    (This is not hypothetical: cue 3 ran 0.2 bars into cue 4 and it took a
 *    by-hand audit to notice.)
 * 0. EM DASHES. The app bans them from every string a user can see
 *    (web/scripts/check-em-dash.mjs, a build gate since 2026-08-27). Burned-in
 *    captions and the endcard are user-facing copy, so the film has the same
 *    gate: every SUBTITLES text, plus every non-comment line of src/. A
 *    legitimate non-copy use is exempted with `emdash-ok` on the line.
 * 2. SCORE DYNAMICS. There is no audio device in the render environment, so the
 *    mix is verified numerically: per-bar RMS and peak, DC offset, and a
 *    near-clip count. What to look for — a quiet cold open, a build through
 *    capture/library, the peak on Ask, and no bar sitting more than ~3dB below
 *    its neighbours (a bigger hole reads as "the music stopped").
 *
 * THE REEL (reel-timeline.mjs, src/reels, capture/) gets the same gates plus
 * the ones a reel built from the real app needs:
 * 3. Captions and kickers never overlap; the narrator mirrors the captions
 *    line for line (only the SAY_NAME respelling may differ); every spoken
 *    line fits its caption window; every caption word has a timing.
 * 4. Banned on-screen strings: no em dash, no literal "AI", no "second
 *    brain", no "library", in the captions, the kickers, the demo account
 *    (capture/library.mjs), the hook's chips, AND the text the real app
 *    showed on every captured frame the reel may use (src/reels/data/
 *    takes.json). The one range the reel never shows (the app's own
 *    "Searching your …" line) is declared below, and the scenes are checked
 *    for never asking for it.
 * 5. The reel's score dynamics, and its VOICE-OVER BALANCE measured against
 *    the film's (the one mix the owner has listened to).
 * 6. (round 13) THE GRID: every hold starts on an 8th and adds whole beats,
 *    so the cuts, taps and sound design stay on the score's beat. The
 *    NARRATOR'S CLARITY: every line sits at least 3dB over the music in the
 *    speech band (500 Hz – 4 kHz), where masking actually happens (a
 *    full-band median hid a closing line the music covered). The DELIVERY:
 *    the reel's mix is −14 LUFS ±0.5 with true peaks at or under −1 dBTP.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, SUBTITLES, TOTAL_BARS } from '../timeline.mjs';
import { lufs, powerDb, speechBand, truePeak } from './loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = false;
// ── 0. em dashes (the app-wide ban, mirrored)
{
  const hits = [];
  SUBTITLES.forEach((c, i) => {
    if (c.text.includes('—')) hits.push(`caption ${i + 1}: ${c.text}`);
  });
  const srcRoot = path.join(here, '..', 'src');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) scan(p);
    }
  };
  // comment-aware, same heuristics as web/scripts/check-em-dash.mjs
  const scan = (file) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let inBlock = false;
    lines.forEach((raw, i) => {
      if (raw.includes('emdash-ok')) return;
      let l = raw;
      if (inBlock) {
        const end = l.indexOf('*/');
        if (end === -1) return;
        l = l.slice(end + 2);
        inBlock = false;
      }
      let open;
      while ((open = l.indexOf('/*')) !== -1) {
        const close = l.indexOf('*/', open + 2);
        if (close === -1) {
          l = l.slice(0, open);
          inBlock = true;
          break;
        }
        l = l.slice(0, open) + l.slice(close + 2);
      }
      if (/^\s*\*/.test(raw)) return;
      const slash = l.indexOf('//');
      if (slash !== -1 && !/https?:$/.test(l.slice(0, slash).trimEnd().slice(-6))) l = l.slice(0, slash);
      if (l.includes('—')) hits.push(`${path.relative(path.join(here, '..'), file)}:${i + 1}: ${raw.trim().slice(0, 120)}`);
    });
  };
  walk(srcRoot);
  if (hits.length) {
    console.error('✗ em dash in user-facing film text (the app-wide ban; use a period, colon or comma):');
    for (const h of hits) console.error('    ' + h);
    failed = true;
  } else {
    console.log('✓ no em dashes in captions or src/');
  }
}

// ── 1. captions
{
  const sorted = [...SUBTITLES].sort((a, b) => a.bar - b.bar);
  let prevEnd = -Infinity;
  let prev = null;
  for (const cue of sorted) {
    if (cue.bar < prevEnd - 1e-9) {
      console.error(
        `✗ caption overlap: "${cue.text}" starts at bar ${cue.bar} but "${prev.text}" runs to ${prevEnd.toFixed(2)}`,
      );
      failed = true;
    }
    prevEnd = cue.bar + cue.bars;
    prev = cue;
  }
  if (prevEnd > TOTAL_BARS) {
    console.error(`✗ last caption runs to bar ${prevEnd} past the film's ${TOTAL_BARS}`);
    failed = true;
  }
  if (!failed) console.log(`✓ ${SUBTITLES.length} captions, no overlaps, last ends bar ${prevEnd.toFixed(2)}`);
}

// ── 1b. caption motion (2026-10-04): each caption rises in 3 frames BEFORE
// the narrator's first word (src/film/vo.json) and rolls out on its end
// (src/film/Subtitles.tsx), so the bar-level check above is not enough: the
// early arrival must not land on the previous caption's way out. Two captions
// on screen at once is the one thing the track must never do.
{
  const vo = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'film', 'vo.json'), 'utf8'));
  const BAR_FRAMES = Math.round(BAR * 30);
  const cues = [...SUBTITLES]
    .sort((a, b) => a.bar - b.bar)
    .map((s) => {
      const first = vo.find((v) => v.bar === s.bar)?.words[0];
      return { s, first, from: Math.round(s.bar * BAR_FRAMES + (first ?? 0) * 30) - 3, to: Math.round((s.bar + s.bars) * BAR_FRAMES) };
    });
  const bad = [];
  for (const c of cues) if (c.first === undefined) bad.push(`"${c.s.text}" has no voiced line at bar ${c.s.bar} (re-run audio/synth-vo.py film)`);
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].from <= cues[i - 1].to) bad.push(`"${cues[i].s.text}" rises at frame ${cues[i].from}, before "${cues[i - 1].s.text}" is gone (${cues[i - 1].to})`);
  }
  if (bad.length) {
    console.error('✗ caption motion:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    const gap = Math.min(...cues.slice(1).map((c, i) => c.from - cues[i].to));
    console.log(`✓ caption motion: never two at once (tightest hand-over ${gap} frames)`);
  }
}

// ── 1c. the tagline closes the film (owner, 2026-10-04): it is the endcard's
// line and the closing voice line, and no caption says it before then
{
  const bad = [];
  const tagline = /everything you save, finally useful/i;
  const endcard = fs.readFileSync(path.join(here, '..', 'src', 'scenes', 'Endcard.tsx'), 'utf8');
  if (!tagline.test(endcard)) bad.push('the endcard does not carry the tagline');
  for (const c of SUBTITLES) if (tagline.test(c.text)) bad.push(`the tagline appears before the end: "${c.text}"`);
  const vo = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'film', 'vo.json'), 'utf8'));
  const last = vo[vo.length - 1];
  if (!tagline.test(last?.text ?? '')) bad.push(`the closing voice line is not the tagline: "${last?.text}"`);
  for (const v of vo.slice(0, -1)) if (tagline.test(v.text)) bad.push(`the voice says the tagline before the end: "${v.text}"`);
  if (bad.length) {
    console.error('✗ tagline:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log('✓ the tagline closes the film (endcard + last line), and only there');
  }
}

// ── 2. score
{
  const wav = path.join(here, '..', 'public', 'score.wav');
  if (!fs.existsSync(wav)) {
    console.error('✗ public/score.wav missing — run `npm run score` first');
    process.exit(1);
  }
  const b = fs.readFileSync(wav);
  const SR = b.readUInt32LE(24);
  const n = (b.length - 44) / 4;
  const at = (i) => b.readInt16LE(44 + i * 4) / 32768;

  let dc = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const v = at(i);
    dc += v;
    if (Math.abs(v) > 0.995) clipped++;
  }
  console.log(`\nDC offset ${(dc / n).toFixed(5)} · near-clip samples ${clipped}`);
  if (clipped > 0) {
    console.error('✗ the master is clipping');
    failed = true;
  }

  const rows = [];
  for (let bar = 0; bar * BAR * SR < n; bar++) {
    const s = Math.floor(bar * BAR * SR);
    const e = Math.min(n, Math.floor((bar + 1) * BAR * SR));
    let sum = 0;
    let peak = 0;
    for (let i = s; i < e; i++) {
      const v = at(i);
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    const db = 20 * Math.log10(Math.sqrt(sum / (e - s)) || 1e-9);
    rows.push({ bar, db, peak });
  }

  for (const r of rows) {
    const bars = '#'.repeat(Math.max(0, Math.round(r.db + 40)));
    console.log(
      `bar ${String(r.bar).padStart(2)}  ${r.db.toFixed(1).padStart(6)}dB  peak ${r.peak.toFixed(2)}  ${bars}`,
    );
  }

  // a hole mid-film reads as the score dropping out
  for (let i = 1; i < rows.length - 2; i++) {
    const dip = Math.min(rows[i - 1].db, rows[i + 1].db) - rows[i].db;
    if (dip > 3.5) {
      console.error(`✗ bar ${rows[i].bar} sits ${dip.toFixed(1)}dB below its neighbours`);
      failed = true;
    }
  }
}

console.log(failed ? '\nFAILED' : '\nOK');

// ───────────────────────────────────────────────────────────────── THE REEL
console.log('\n── reel');
{
  const R = await import('../reel-timeline.mjs');
  const L = await import('../capture/library.mjs');
  const root = path.join(here, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const bad = [];
  const BANNED = [
    [/—/, 'em dash'],
    [/\bAI\b/, 'literal "AI"'],
    [/second brain/i, '"second brain"'],
    [/librar(y|ies)/i, '"library"'],
  ];
  const scan = (where, text) => {
    for (const [re, what] of BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
  };

  // ── 3. captions, kickers, narrator
  const caps = [...R.CAPTIONS].sort((a, b) => a.at - b.at);
  caps.forEach((c, i) => {
    if (c.say) scan(`caption ${i + 1} (spoken)`, c.say);
    if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
    if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" starts at ${c.at}, "${caps[i - 1].text}" runs to ${caps[i - 1].to}`);
    if (c.to > R.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the reel (${c.to} > ${R.TOTAL_FRAMES})`);
    scan(`caption ${i + 1}`, c.text);
  });
  const kick = [...R.KICKERS].sort((a, b) => a.at - b.at);
  kick.forEach((k, i) => {
    if (i && k.at < kick[i - 1].to) bad.push(`kicker overlap: ${k.text} / ${kick[i - 1].text}`);
    // a chapter's label is up only with its narration: it ends on a line's end
    if (!caps.some((c) => !c.place && c.to === k.to && c.at >= k.at)) bad.push(`kicker ${k.text} (${k.at}–${k.to}) does not leave with a line`);
    scan(`kicker ${k.text}`, k.text);
  });
  // the grid (round 13): a hold may start on an 8th, but what it ADDS to the
  // output must be whole beats, or everything after it slides off the beat
  for (const h of R.HOLDS) {
    const start = R.holdStart(h.id);
    const adds = h.len - h.adv * R.K;
    if (start % (R.BEAT_FRAMES / 2)) bad.push(`hold ${h.id} starts at ${start}, not on an 8th`);
    if (adds % R.BEAT_FRAMES) bad.push(`hold ${h.id} adds ${adds} frames, not whole beats (${(adds / R.BEAT_FRAMES).toFixed(2)})`);
  }
  const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
  const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
  const timing = JSON.parse(read('src/reels/data/reel-vo.json'));
  caps.forEach((c) => {
    const t = timing.find((x) => x.frame === c.at);
    if (!t) return bad.push(`no narrator timing for caption at ${c.at} ("${c.text}"): run synth-vo.py reel`);
    // a caption may carry a voice-only lead-in (`say`); what it SHOWS must
    // still be the end of what is said
    if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}", scripted "${c.say ?? c.text}"`);
    if (c.say && !spoken(c.say).endsWith(spoken(c.text).replace(/\s+/g, ' '))) bad.push(`caption at ${c.at} shows "${c.text}", which is not the end of what is said`);
    const words = (c.say ?? c.text).split(/\s+/).filter(Boolean).length;
    if (t.words.length !== words) bad.push(`caption at ${c.at} has ${words} words but ${t.words.length} timings`);
  });
  const manifest = path.join(root, 'out', 'vo', 'reel', 'manifest.json');
  if (fs.existsSync(manifest)) {
    for (const line of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
      const c = caps.find((x) => x.at === line.frame);
      if (!c) continue;
      const window = (c.to - c.at) / R.FPS;
      if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s caption`);
      // the dwell rule (reel-timeline.mjs): off 0.3–1.2s after the voice, or
      // up to 4s while the action it names plays (`until`); the end card holds
      if (c.place === 'lockup') continue;
      const dwell = window - line.spoken;
      const max = c.until ? 4 : 1.2;
      if (dwell < 0.3) bad.push(`caption "${c.text}" leaves ${dwell.toFixed(2)}s after its voice (min 0.3s)`);
      if (dwell > max) bad.push(`caption "${c.text}" lingers ${dwell.toFixed(2)}s after its voice (max ${max}s${c.until ? '' : '; set `until` if its action is still playing'})`);
    }
  } else {
    console.log('  (no out/vo/reel/manifest.json: VO fit not re-checked; run synth-vo.py reel)');
  }
  // the line the reel shares with the film: its endcard line, the tagline
  const film = read('src/scenes/Endcard.tsx');
  const close = caps.find((c) => c.place === 'lockup');
  const closeLine = close?.text.split('\n').slice(1).join(' ');
  if (!close || !film.includes(closeLine)) bad.push('the reel lockup line is not the film endcard line');

  // ── 4. banned strings, everywhere a viewer can read one
  for (const c of L.CARDS) {
    for (const k of ['title', 'summary', 'category', 'sourceName', 'youtubeChannel', 'note']) if (c[k]) scan(`card ${c.id}.${k}`, c[k]);
    c.tags.forEach((t) => scan(`card ${c.id} tag`, t));
  }
  L.COLLECTIONS.forEach((c) => scan(`collection ${c.id}`, c.name));
  scan('Ask question', L.ASK.question);
  scan('Ask answer', L.ASK.answer);
  scan('search query', L.SEARCH.query);
  for (const c of L.CARDS) for (const k of ['detail', 'takeaway']) if (c[k]) scan(`card ${c.id}.${k}`, c[k]);
  const Y = L.SYNTHESIS;
  [Y.title, Y.narrative, Y.standoutReason, Y.openQuestion, ...Y.themes.flatMap((x) => [x.title, x.insight])].forEach((x) =>
    scan('weekly recap', x),
  );
  const hookSrc = read('src/reels/scenes/Hook.tsx');
  const titles = [...hookSrc.matchAll(/title: (?:'([^']+)'|"([^"]+)")/g)].map((m) => m[1] ?? m[2]);
  for (const t of titles) {
    scan('hook chip', t);
    if (!L.CARDS.some((c) => c.title === t)) bad.push(`hook chip "${t}" is not a save in the demo account`);
  }
  // the app's own text on the captured frames the reel may show
  const takes = JSON.parse(read('src/reels/data/takes.json'));
  const NEVER_SHOWN = { ask: ['sent', 'stream'] }; // [from mark, to mark): the thinking line
  let seen = 0;
  for (const [name, t] of Object.entries(takes)) {
    const skip = NEVER_SHOWN[name];
    t.frames.forEach((fr, i) => {
      if (skip && i >= t.marks[skip[0]] && i < t.marks[skip[1]]) return;
      seen++;
      for (const k of fr.t) scan(`the app on ${name} frame ${i}`, t.texts[k]);
    });
  }
  for (const f of fs.readdirSync(path.join(root, 'src', 'reels', 'scenes'))) {
    if (/'sent'/.test(read(`src/reels/scenes/${f}`))) bad.push(`src/reels/scenes/${f} uses the never-shown 'sent' frames`);
  }

  if (bad.length) {
    console.error('✗ reel:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ ${caps.length} captions + ${kick.length} kickers, no overlaps; narrator mirrors every caption; timings for every word`);
    console.log(`✓ ${R.HOLDS.length} holds, each on an 8th and adding whole beats: the cut stays on the score's grid`);
    console.log(`✓ no em dash / "AI" / "second brain" / "library" in captions, demo account, hook chips, or ${seen} captured app frames`);
  }

  // ── 5. the reel's score, and the voice sitting where the film's does
  const wavPath = path.join(root, 'public', 'reel-score.wav');
  if (!fs.existsSync(wavPath)) {
    console.error('✗ public/reel-score.wav missing — run `npm run reel:score`');
    failed = true;
  } else {
    const b = fs.readFileSync(wavPath);
    const SR = b.readUInt32LE(24);
    const n = (b.length - 44) / 4;
    const at = (i) => b.readInt16LE(44 + i * 4) / 32768;
    let clipped = 0;
    for (let i = 0; i < n; i++) if (Math.abs(at(i)) > 0.995) clipped++;
    const rows = [];
    for (let k = 0; k * R.BAR * SR < n; k++) {
      const s0 = Math.floor(k * R.BAR * SR);
      const e = Math.min(n, Math.floor((k + 1) * R.BAR * SR));
      let sum = 0;
      for (let i = s0; i < e; i++) sum += at(i) ** 2;
      rows.push(20 * Math.log10(Math.sqrt(sum / (e - s0)) || 1e-9));
    }
    console.log(`  reel bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
    if (clipped) {
      console.error(`✗ the reel master clips (${clipped} samples)`);
      failed = true;
    }
    for (let i = 1; i < rows.length - 2; i++) {
      const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
      if (dip > 3.5) {
        console.error(`✗ reel bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
        failed = true;
      }
    }
  }
  // voice-over balance: during each spoken line, how far the voice sits above
  // the music bed, reel vs film (the film's is the owner-approved reference)
  // (the reel's mix is mastered: mix-vo.mjs writes the gain it applied, and a
  // line may duck the music further than the rest, `duck` on its caption)
  const reelMaster = path.join(root, 'out', 'vo', 'reel', 'mix.json');
  const reelGain = fs.existsSync(reelMaster) ? JSON.parse(fs.readFileSync(reelMaster, 'utf8')).gain : 1;
  const reelDuck = Object.fromEntries(R.CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck]));
  const lines = (mixFile, scoreFile, manifestFile, startOf, duckOf, gain = 1) => {
    const P = (f) => path.join(root, f);
    if (![mixFile, scoreFile, manifestFile].every((f) => fs.existsSync(P(f)))) return null;
    const mix = fs.readFileSync(P(mixFile));
    const bed = fs.readFileSync(P(scoreFile));
    const SR = mix.readUInt32LE(24);
    return JSON.parse(fs.readFileSync(P(manifestFile), 'utf8')).map((line) => {
      const s0 = Math.round(startOf(line) * SR);
      const e = s0 + Math.round((line.spoken ?? line.sec) * SR);
      const duck = duckOf(line);
      const voice = new Float64Array(e - s0);
      const music = new Float64Array(e - s0);
      // the mid channel (L+R)/2: the voice is centred, the music spread wide
      const mid = (buf, i) => (buf.readInt16LE(44 + i * 4) + buf.readInt16LE(46 + i * 4)) / 65536;
      for (let i = s0; i < e; i++) {
        const a = mid(mix, i) / gain;
        const c = mid(bed, i);
        // the mix minus the (ducked) bed is the voice; the bed under it is duck×
        voice[i - s0] = a - c * duck;
        music[i - s0] = c * duck;
      }
      return { line, SR, voice, music, ratio: powerDb(voice) - powerDb(music) };
    });
  };
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const filmLines = lines('public/score-vo.wav', 'public/score.wav', 'out/vo/manifest.json', (l) => l.bar * 2.5, () => 0.65);
  const reelLines = lines('public/reel-score-vo.wav', 'public/reel-score.wav', 'out/vo/reel/manifest.json', (l) => l.start, (l) => reelDuck[l.frame] ?? 0.55, reelGain);
  const filmBal = filmLines && median(filmLines.map((x) => x.ratio));
  const reelBal = reelLines && median(reelLines.map((x) => x.ratio));
  if (filmBal !== null && reelBal !== null) {
    console.log(`  voice over music, median line: film ${filmBal.toFixed(1)}dB · reel ${reelBal.toFixed(1)}dB`);
    if (reelBal < filmBal - 3) {
      console.error('✗ the reel voice sits >3dB lower in its mix than the film\'s does');
      failed = true;
    } else {
      console.log('✓ the reel voice sits at the film\'s balance (within 3dB)');
    }
  } else {
    console.log('  (VO balance not measured: needs both mixes and out/vo manifests)');
  }
  // the narrator's clarity: each line against the music in the speech band
  if (reelLines) {
    const clear = reelLines.map(({ line, SR, voice, music }) => ({
      text: line.text,
      db: powerDb(speechBand(voice, SR)) - powerDb(speechBand(music, SR)),
    }));
    const worst = clear.reduce((a, b) => (b.db < a.db ? b : a));
    console.log(`  voice over music in the speech band: min ${worst.db.toFixed(1)}dB ("${worst.text.slice(0, 32)}…"), median ${median(clear.map((c) => c.db)).toFixed(1)}dB`);
    const masked = clear.filter((c) => c.db < 3);
    if (masked.length) {
      for (const c of masked) console.error(`✗ the music masks "${c.text}": ${c.db.toFixed(1)}dB over it in the speech band (min 3dB)`);
      failed = true;
    } else {
      console.log('✓ every reel line sits 3dB or more over the music where speech is heard');
    }
  }
  // the delivery: loudness and true peak of the finished reel mix
  const mixPath = path.join(root, 'public', 'reel-score-vo.wav');
  if (fs.existsSync(mixPath)) {
    const b = fs.readFileSync(mixPath);
    const SR = b.readUInt32LE(24);
    const n = (b.length - 44) / 4;
    const L = new Float64Array(n);
    const Rr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = b.readInt16LE(44 + i * 4) / 32768;
      Rr[i] = b.readInt16LE(44 + i * 4 + 2) / 32768;
    }
    const I = lufs(L, Rr, SR);
    const tp = truePeak(L, Rr);
    const okLoud = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (okLoud ? console.log : console.error)(`${okLoud ? '✓' : '✗'} the reel mix: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
    if (!okLoud) failed = true;
  }
}

// ─────────────────────────────────────────────────────── THE FIND CLIP
// (clips/find-timeline.mjs, src/reels/clips/find/, the take clips/find/search):
// the reel's gates on the clip's own files, plus what the clip claims about
// the search, checked against the demo data and the frames it shows: the
// own-words query shares no word with its card and finds it alone; the
// close-match query is answered under "Close matches" with its one card; the
// source is offered (never over "No matches" in the frames used) and one tap
// shows only saves from it.
console.log('\n── find clip');
{
  const F = await import('../clips/find-timeline.mjs');
  const L = await import('../capture/library.mjs');
  const root = path.join(here, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const bad = [];
  const BANNED = [
    [/—/, 'em dash'],
    [/\bAI\b/, 'literal "AI"'],
    [/second brain/i, '"second brain"'],
    [/librar(y|ies)/i, '"library"'],
  ];
  const scan = (where, text) => {
    for (const [re, what] of BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
  };

  // captions and the chapter word: no overlaps, lines on the beat, in the clip
  const caps = [...F.CAPTIONS].sort((a, b) => a.at - b.at);
  caps.forEach((c, i) => {
    scan(`caption ${i + 1}`, c.text);
    if (c.say) scan(`caption ${i + 1} (spoken)`, c.say);
    if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
    if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" / "${caps[i - 1].text}"`);
    if (c.to > F.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the clip`);
    if (c.at % F.BEAT_FRAMES) bad.push(`caption "${c.text}" starts at ${c.at}, not on a beat`);
  });
  const kick = [...F.KICKERS].sort((a, b) => a.at - b.at);
  kick.forEach((k, i) => {
    scan(`kicker ${k.text}`, k.text);
    if (i && k.at < kick[i - 1].to) bad.push(`kicker overlap at ${k.at}`);
    if (!caps.some((c) => !c.place && c.to === k.to && c.at >= k.at)) bad.push(`kicker ${k.text} (${k.at}–${k.to}) does not leave with a line`);
  });
  // the grid: every tap, landing and cut on a beat (typing and the delete run
  // between beats; the only things allowed to)
  for (const k of ['fieldTap', 'type1', 'found1', 'back1', 'type2', 'found2', 'back2', 'type3', 'chipTap', 'cardTap', 'throwOut', 'lockup', 'markStrike']) {
    if (F.HITS[k] % F.BEAT_FRAMES) bad.push(`HITS.${k} = ${F.HITS[k]} is not on a beat`);
  }
  // the narrator mirrors the captions, and every line fits and leaves in time
  const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
  const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
  const timing = JSON.parse(read('src/reels/clips/find/find-vo.json'));
  caps.forEach((c) => {
    const t = timing.find((x) => x.frame === c.at);
    if (!t) return bad.push(`no narrator timing for "${c.text}": run synth-vo.py find`);
    if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}"`);
    if (t.words.length !== (c.say ?? c.text).split(/\s+/).filter(Boolean).length) bad.push(`caption at ${c.at}: words ≠ timings`);
  });
  const manifest = path.join(root, 'out', 'vo', 'find', 'manifest.json');
  if (fs.existsSync(manifest)) {
    for (const line of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
      const c = caps.find((x) => x.at === line.frame);
      if (!c) continue;
      const window = (c.to - c.at) / F.FPS;
      if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s caption`);
      if (c.place === 'lockup') continue;
      const dwell = window - line.spoken;
      if (dwell < 0.3) bad.push(`caption "${c.text}" leaves ${dwell.toFixed(2)}s after its voice (min 0.3s)`);
      if (dwell > (c.until ? 4 : 1.2)) bad.push(`caption "${c.text}" lingers ${dwell.toFixed(2)}s after its voice`);
    }
  } else {
    console.log('  (no out/vo/find/manifest.json: VO fit not re-checked; run synth-vo.py find)');
  }
  const close = caps.find((c) => c.place === 'lockup');
  if (!close || !read('src/scenes/Endcard.tsx').includes(close.text.split('\n').slice(1).join(' '))) {
    bad.push('the clip lockup line is not the film endcard line');
  }

  // the searches, element by element
  const takes = JSON.parse(read('src/reels/clips/find/takes.json'));
  const T = takes['clips/find/search'];
  const Q = L.SEARCH.clip;
  const words = (s) => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/'s$/, '').replace(/'/g, ''));
  const onFrame = (i) => T.frames[i].t.map((k) => T.texts[k]);
  const titles = L.CARDS.map((c) => c.title);
  const shownTitles = (i) => titles.filter((x) => onFrame(i).includes(x));
  for (const q of [Q.words, Q.close, Q.source]) scan('search query', q.query);
  // 1. your own words
  {
    const card = L.CARDS.find((c) => c.id === Q.words.hits[0]);
    const cardWords = new Set(words([card.title, card.summary, card.tags.join(' '), card.category, card.sourceName, card.note ?? ''].join(' ')));
    const shared = words(Q.words.query).filter((w) => cardWords.has(w));
    if (shared.length) bad.push(`"${Q.words.query}" shares ${shared.join(', ')} with "${card.title}"`);
    if (!onFrame(T.marks.result1 - 1).includes(Q.words.query)) bad.push(`the take never shows "${Q.words.query}" typed whole`);
    for (let i = T.marks.result1 + 1; i < T.marks.clear1; i++) {
      const shown = shownTitles(i);
      if (shown.length !== 1 || shown[0] !== card.title) bad.push(`"${Q.words.query}" frame ${i} shows ${JSON.stringify(shown)}`);
    }
  }
  // 2. close matches
  {
    const card = L.CARDS.find((c) => c.id === Q.close.card);
    for (let i = T.marks.result2; i < T.marks.clear2; i++) {
      const shown = shownTitles(i);
      if (!onFrame(i).includes('Close matches') || shown.length !== 1 || shown[0] !== card.title) bad.push(`"${Q.close.query}" frame ${i}: not "${card.title}" alone under Close matches`);
    }
  }
  // 3. the source: offered (never over "No matches" in the frames the clip
  // plays: the scene holds at most OFFERED = 10 frames of the roll), then only its saves
  {
    for (let i = T.marks.sources; i <= T.marks.sources + 10; i++) {
      if (!onFrame(i).includes(Q.source.source)) bad.push(`frame ${i} does not offer ${Q.source.source}`);
      if (onFrame(i).includes('No matches')) bad.push(`frame ${i} shows "No matches" under the source (the clip plays it)`);
    }
    const last = T.marks.detail - 1;
    const shown = L.CARDS.filter((c) => onFrame(last).includes(c.title));
    const other = shown.filter((c) => c.sourceName !== Q.source.source && c.sourceType !== Q.source.source.toLowerCase());
    if (!shown.length || other.length) bad.push(`after the ${Q.source.source} tap the feed shows ${JSON.stringify(other.map((c) => c.title))}`);
  }
  // the hook's scroll is eased, and shown at the nearest captured step with
  // the chrome in frame (the camera cannot take up the rounding): its steps
  // must stay fine, or the slow ends alternate a hop and a hold (measured)
  {
    let worst = 0;
    for (let i = T.marks.scroll + 1; i < T.marks.top; i++) {
      const a = T.frames[i - 1].r.firstCard;
      const b = T.frames[i].r.firstCard;
      if (a && b) worst = Math.max(worst, Math.abs(b[1] - a[1]));
    }
    if (worst > 6) bad.push(`the hook's scroll was captured in ${worst}pt steps (max 6: coarser steps judder at the ease's slow ends)`);
  }
  // the app's own text on every frame of the take (the clip uses all of it)
  T.frames.forEach((fr, i) => fr.t.forEach((k) => scan(`the app on the find take, frame ${i}`, T.texts[k])));

  if (bad.length) {
    console.error('✗ find clip:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ ${caps.length} captions + ${kick.length} kickers, no overlaps, each on a beat; narrator mirrors every caption; each leaves in time`);
    console.log('✓ taps, landings and cuts on the beat');
    console.log(`✓ own words: no shared word, one card; close matches: one card under the label; the source offered, then only its saves; no banned string in captions or ${T.count} captured frames`);
  }

  // the score and the mix: no clipping or holes, the voice clear of the music
  // in the speech band, mastered like the reel
  const wav = (p) => {
    const b = fs.readFileSync(path.join(root, p));
    const n = (b.length - 44) / 4;
    const L2 = new Float64Array(n);
    const R2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      L2[i] = b.readInt16LE(44 + i * 4) / 32768;
      R2[i] = b.readInt16LE(46 + i * 4) / 32768;
    }
    return { SR: b.readUInt32LE(24), n, L: L2, R: R2 };
  };
  const scorePath = 'public/clips/find/score.wav';
  const mixPath = 'public/clips/find/score-vo.wav';
  if (!fs.existsSync(path.join(root, scorePath)) || !fs.existsSync(path.join(root, mixPath))) {
    console.error('✗ the find score or mix is missing: run `node audio/find-score.mjs && node audio/mix-vo.mjs find`');
    failed = true;
  } else {
    const score = wav(scorePath);
    const mix = wav(mixPath);
    let clipped = 0;
    for (let i = 0; i < score.n; i++) if (Math.abs(score.L[i]) > 0.995 || Math.abs(score.R[i]) > 0.995) clipped++;
    const rows = [];
    for (let k = 0; k * F.BAR * score.SR < score.n; k++) {
      const s0 = Math.floor(k * F.BAR * score.SR);
      const e = Math.min(score.n, Math.floor((k + 1) * F.BAR * score.SR));
      let sum = 0;
      for (let i = s0; i < e; i++) sum += ((score.L[i] + score.R[i]) / 2) ** 2;
      rows.push(10 * Math.log10(sum / (e - s0) || 1e-18));
    }
    console.log(`  find bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
    if (clipped) {
      console.error(`✗ the find score clips (${clipped} samples)`);
      failed = true;
    }
    for (let i = 1; i < rows.length - 2; i++) {
      const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
      if (dip > 3.5) {
        console.error(`✗ find bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
        failed = true;
      }
    }
    // each line: the mix minus the ducked bed is the voice (mix-vo.mjs writes
    // the gain the master applied), measured where speech is heard
    const master = path.join(root, 'out', 'vo', 'find', 'mix.json');
    const gain = fs.existsSync(master) ? JSON.parse(fs.readFileSync(master, 'utf8')).gain : 1;
    if (fs.existsSync(manifest)) {
      const clear = JSON.parse(fs.readFileSync(manifest, 'utf8')).map((line) => {
        const duck = caps.find((c) => c.at === line.frame)?.duck ?? 0.55;
        const s0 = Math.round(line.start * mix.SR);
        const e = Math.min(mix.n, s0 + Math.round(line.spoken * mix.SR));
        const voice = new Float64Array(e - s0);
        const music = new Float64Array(e - s0);
        for (let i = s0; i < e; i++) {
          const m = (mix.L[i] + mix.R[i]) / 2 / gain;
          const b = ((score.L[i] + score.R[i]) / 2) * duck;
          voice[i - s0] = m - b;
          music[i - s0] = b;
        }
        return { text: line.text, all: powerDb(voice) - powerDb(music), db: powerDb(speechBand(voice, mix.SR)) - powerDb(speechBand(music, mix.SR)) };
      });
      for (const c of clear) console.log(`  "${c.text.slice(0, 34)}…": ${c.db.toFixed(1)}dB over the music in the speech band (${c.all.toFixed(1)}dB full band)`);
      const masked = clear.filter((c) => c.db < 3);
      if (masked.length) {
        for (const c of masked) console.error(`✗ the music masks "${c.text}": ${c.db.toFixed(1)}dB (min 3dB)`);
        failed = true;
      } else {
        console.log('✓ every find line sits 3dB or more over the music where speech is heard');
      }
    }
    const I = lufs(mix.L, mix.R, mix.SR);
    const tp = truePeak(mix.L, mix.R);
    const ok = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (ok ? console.log : console.error)(`${ok ? '✓' : '✗'} the find mix: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
    if (!ok) failed = true;
  }
}

console.log(failed ? '\nFAILED' : '\nOK');
// ─────────────────────────────────────────────────────── THE SAVE CLIP
// clips/save-timeline.mjs, src/reels/clips/save: the reel's gates, held to
// the clip's own clock, plus the ones a clip adds (at most three lines and
// the subtitle; the shots it borrows from the reel start on the reel's grid)
console.log('\n── clip: save');
{
  const C = await import('../clips/save-timeline.mjs');
  const L = await import('../capture/library.mjs');
  const root = path.join(here, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const exists = (p) => fs.existsSync(path.join(root, p));
  const bad = [];
  const BANNED = [
    [/—/, 'em dash'],
    [/\bAI\b/, 'literal "AI"'],
    [/second brain/i, '"second brain"'],
    [/librar(y|ies)/i, '"library"'],
  ];
  const scan = (where, text) => {
    for (const [re, what] of BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
  };

  // captions and kickers: no overlaps, inside the clip, every line on a
  // beat; the clip names the app in its voice and closes on the lockup
  // (the owner's brief: the video must stand on its own)
  const caps = [...C.CAPTIONS].sort((a, b) => a.at - b.at);
  caps.forEach((c, i) => {
    scan(`caption ${i + 1}`, c.text);
    if (c.say) scan(`caption ${i + 1} (spoken)`, c.say);
    if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
    if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" / "${caps[i - 1].text}"`);
    if (c.to > C.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the clip`);
    if (c.at % (C.BEAT_FRAMES / 2)) bad.push(`caption "${c.text}" starts at ${c.at}, not on an 8th`);
  });
  const lines = caps.filter((c) => !c.place);
  const close = caps.find((c) => c.place === 'lockup');
  // a row of a line arrives whole when its first word is spoken, so a row
  // must never start the NEXT sentence too (owner, 2026-10-01: "Get its"
  // appeared with "Share a YouTube video.", before it was said)
  caps.forEach((c) => {
    c.text.split('\n').forEach((row) => {
      if (/[.?!]\s+\S/.test(row)) bad.push(`caption row "${row}" starts a new sentence mid-row (break the line there)`);
    });
  });
  if (!close || close !== caps[caps.length - 1]) bad.push('the clip does not close on its lockup line');
  if (!lines.some((c) => /\bMachina\b/.test(c.text))) bad.push('no narrator line names Machina before the close');
  if (!close || !/\bMachina\b/.test(close.text)) bad.push('the closing line does not name Machina');
  // owner call 2026-09-28: every launch film ENDS on the tagline, exactly as
  // written, and says it nowhere earlier (the name may lead it, as the drawn
  // wordmark); nothing ends on the App Store subtitle
  const TAGLINE = 'Everything you save, finally useful.';
  const flat = (t) => t.split(/\s+/).join(' ');
  if (!close || !flat(close.text).endsWith(TAGLINE) || !/^(Machina\.\s+)?$/.test(flat(close.text).slice(0, -TAGLINE.length))) bad.push(`the close is "${flat(close?.text ?? '')}", not the tagline "${TAGLINE}" (optionally led by "Machina.")`);
  if (lines.some((c) => flat(c.say ?? c.text).includes(TAGLINE))) bad.push('the tagline also appears before the close');
  if (caps.some((c) => /never lose another great find/i.test(c.text))) bad.push('the clip says the App Store subtitle');
  // (owner, 2026-09-29: saving is a core feature, show every kind of save; the
  // clip may run longer than the first brief's 30s)
  if (C.TOTAL_SEC < 45 || C.TOTAL_SEC > 75) bad.push(`the clip runs ${C.TOTAL_SEC.toFixed(1)}s (brief: about a minute)`);
  const kick = [...C.KICKERS].sort((a, b) => a.at - b.at);
  kick.forEach((k, i) => {
    scan(`kicker ${k.text}`, k.text);
    if (/ /.test(k.text)) bad.push(`kicker "${k.text}" has a plain space (the Kicker collapses it: use \\u00a0)`);
    if (i && k.at < kick[i - 1].to) bad.push(`kicker overlap: ${k.text}`);
    if (!lines.some((c) => c.to === k.to && c.at >= k.at)) bad.push(`kicker ${k.text} (${k.at}–${k.to}) does not leave with a line`);
  });

  // the grid: every tap, landing, lift and phase on the beat or an 8th
  for (const [k, v] of Object.entries(C.HITS)) {
    for (const fr of [v].flat()) if (fr % (C.BEAT_FRAMES / 2)) bad.push(`hit ${k} at ${fr} is not on an 8th`);
  }

  // the narrator mirrors the captions, every word timed; each line fits its
  // window and leaves by the dwell rule (0.3–1.2s after its voice, ≤ 4s with
  // `until`; the lockup holds)
  const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
  const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
  const timing = JSON.parse(read('src/reels/clips/save/vo.json'));
  caps.forEach((c) => {
    const t = timing.find((x) => x.frame === c.at);
    if (!t) return bad.push(`no narrator timing for "${c.text}" at ${c.at}: run synth-vo.py save`);
    if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}"`);
    if (t.words.length !== (c.say ?? c.text).split(/\s+/).filter(Boolean).length) bad.push(`caption at ${c.at}: word timings don't match its words`);
  });
  const manifestPath = 'out/vo/save/manifest.json';
  const manifest = exists(manifestPath) ? JSON.parse(read(manifestPath)) : null;
  if (manifest) {
    for (const line of manifest) {
      const c = caps.find((x) => x.at === line.frame);
      if (!c) continue;
      const window = (c.to - c.at) / C.FPS;
      if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s caption`);
      if (c.place === 'lockup') continue;
      const dwell = window - line.spoken;
      const max = c.until ? 4 : 1.2;
      if (dwell < 0.3 || dwell > max) bad.push(`caption "${c.text}" leaves ${dwell.toFixed(2)}s after its voice (0.3–${max}s)`);
    }
  } else {
    console.log('  (no out/vo/save/manifest.json: VO fit not re-checked; run synth-vo.py save)');
  }

  // what a viewer can read: the hook's saves are real saves from the demo
  // account; the share cards are the cards the source tour opens (or the
  // montage's one Facebook post); the tour's scripted cards pass the same
  // bans; and the app's own text on every frame of both takes the clip plays
  const CS = await import('../capture/clip-save.mjs');
  const tour = CS.sourceCards('');
  for (const c of tour) {
    const d = c.doc;
    [d.title, d.summary, d.detailedSummary, d.actionableTakeaway, ...(d.tags ?? []), ...(d.metadata?.videoHighlights ?? [])].filter(Boolean).forEach((x) => scan(`source card ${c.id}`, x));
  }
  Object.values(CS.NOTE_READ).forEach((x) => scan('the note read', x));
  // the hook's piles: each app's save list holds titles of real demo saves
  const hookSrc = read('src/reels/clips/save/Hook.tsx');
  const hookTitles = [...hookSrc.matchAll(/titles: \[([^\]]+)\]/g)].flatMap(([, list]) => [...list.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]));
  if (hookTitles.length < 12) bad.push(`found ${hookTitles.length} titles in the hook's piles: the gate no longer reads Hook.tsx`);
  for (const title of hookTitles) {
    scan('Hook.tsx', title);
    if (!L.CARDS.some((c) => c.title === title)) bad.push(`"${title}" (Hook.tsx) is not a save in the demo account`);
  }
  for (const [, list] of hookSrc.matchAll(/list: '([^']+)'/g)) scan('Hook.tsx', list);
  for (const [, title] of read('src/reels/clips/save/Shares.tsx').matchAll(/title: '([^']+)'/g)) {
    scan('Shares.tsx', title);
    if (!tour.some((c) => c.doc.title === title) && title !== CS.FACEBOOK_SHARE.title) bad.push(`"${title}" (Shares.tsx) is not a card the source tour opens`);
  }
  const takes = JSON.parse(read('src/reels/data/takes.json'));
  const src = takes.sources;
  if (!src) bad.push('no "sources" take: run CAPTURE_ONLY=sources node capture/shoot.mjs');
  else {
    src.frames.forEach((fr, i) => fr.t.forEach((k) => scan(`the app on sources frame ${i}`, src.texts[k])));
    for (const k of C.SOURCES.flatMap((b) => [`${b.key}Land`, `${b.key}Landed`, `${b.key}Open`, `${b.key}Scroll`]).concat(['noteTap', 'noteRead', 'noteReadScroll']))
      if (src.marks[k] === undefined) bad.push(`the sources take has no mark "${k}"`);
  }
  const take = takes.saveclip;
  if (!take) bad.push('no "saveclip" take: run CAPTURE_ONLY=saveclip node capture/shoot.mjs');
  else take.frames.forEach((fr, i) => fr.t.forEach((k) => scan(`the app on saveclip frame ${i}`, take.texts[k])));
  for (const [k, p] of Object.entries(C.PLAY)) {
    if (take && take.marks[k] === undefined) bad.push(`the saveclip take has no mark "${k}"`);
    void p;
  }

  // round 2 (finishing pass) gates. Taps: the pad touches (35% of the Tap
  // gesture) on the frame of its hit, where the app responds and the tick sounds
  for (const [file, want] of [['App.tsx', 5], ['Sources.tsx', 2]]) {
    let taps = 0;
    for (const [, hit, a, b] of read(`src/reels/clips/save/${file}`).matchAll(/<Tap [^>]*t=\{prog\(f, ([\w.]+) - (\d+), \1 \+ (\d+)/g)) {
      taps++;
      // the first whole frame drawn at or past the touch
      const touch = Math.ceil(-Number(a) + 0.35 * (Number(a) + Number(b)) - 1e-9);
      if (touch !== 0) bad.push(`${file}: the tap on ${hit} first shows its touch ${touch} frames off its hit`);
    }
    if (taps < want) bad.push(`found ${taps} taps in ${file} (expected ${want}): the tap gate no longer reads it`);
  }
  // the source tour's taps are ALSO where the score ticks: its card taps and
  // the Summarize tap are hits
  C.SOURCES.forEach((b, n) => {
    if (C.HITS.srcTaps[n] !== b.at + 40) bad.push(`HITS.srcTaps[${n}] is ${C.HITS.srcTaps[n]}, not the ${b.key} card's touch (${b.at + 40})`);
  });
  // exits ease in and out: a fast-start curve on a fade-out reads as a blink
  for (const file of ['Hook.tsx', 'App.tsx', 'Sources.tsx', 'Shares.tsx', 'End.tsx']) {
    for (const [, name, curve] of read(`src/reels/clips/save/${file}`).matchAll(/const (\w*Out|part) = prog\([^;]*(EASE_MODAL|EASE_SPRING|EASE_FLING)\)/g))
      bad.push(`${file}: exit ${name} uses ${curve} (a fast start reads as a blink: EASE_IN_OUT)`);
  }
  // a lift on an element the app is still animating sits on its settled box:
  // the landed card's measured box may differ from it by at most 2pt while the
  // lift is up (else the copy and the app's card visibly part)
  if (take) {
    const landed = take.frames[take.marks.landed].r.firstCard;
    for (let i = take.marks.done + 8; i < take.marks.landed; i++) {
      const r = take.frames[i].r.firstCard;
      if (r && r.some((v, k) => Math.abs(v - landed[k]) > 2)) bad.push(`saveclip frame ${i}: the new card's box is ${JSON.stringify(r)}, > 2pt off its settled box`);
    }
  }

  if (bad.length) {
    console.error('✗ clip save:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ ${caps.length} captions (${lines.length} lines + the close) + ${kick.length} kickers, no overlaps; Machina named in the voice and on the close; ${C.TOTAL_SEC.toFixed(1)}s`);
    console.log(`✓ narrator mirrors every caption; dwell rule holds; ${Object.values(C.HITS).flat().length} hits on beats or 8ths`);
    console.log(`✓ no em dash / "AI" / "second brain" / "library" in the clip's captions, kickers, saves shown, or ${take.frames.length} captured saveclip frames`);
  }

  // the score: no clipping, no hole; the voice where the reel's sits, 3dB+
  // over the music in the speech band on every line, mastered for the feeds
  const scorePath = 'public/clips/save/score.wav';
  const mixPath = 'public/clips/save/score-vo.wav';
  if (!exists(scorePath) || !exists(mixPath)) {
    console.error('✗ public/clips/save/score.wav or score-vo.wav missing: run node audio/clips/save-score.mjs && node audio/mix-vo.mjs save');
    failed = true;
  } else {
    const wav = (p) => {
      const b = fs.readFileSync(path.join(root, p));
      const n = (b.length - 44) / 4;
      const l = new Float64Array(n);
      const r = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        l[i] = b.readInt16LE(44 + i * 4) / 32768;
        r[i] = b.readInt16LE(46 + i * 4) / 32768;
      }
      return { SR: b.readUInt32LE(24), n, l, r };
    };
    const bed = wav(scorePath);
    const mix = wav(mixPath);
    let clipped = 0;
    for (let i = 0; i < bed.n; i++) if (Math.abs(bed.l[i]) > 0.995 || Math.abs(bed.r[i]) > 0.995) clipped++;
    const rows = [];
    for (let k = 0; k * C.BAR * bed.SR < bed.n; k++) {
      const s0 = Math.floor(k * C.BAR * bed.SR);
      const e = Math.min(bed.n, Math.floor((k + 1) * C.BAR * bed.SR));
      let sum = 0;
      for (let i = s0; i < e; i++) sum += (bed.l[i] ** 2 + bed.r[i] ** 2) / 2;
      rows.push(20 * Math.log10(Math.sqrt(sum / (e - s0)) || 1e-9));
    }
    console.log(`  clip bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
    if (clipped) {
      console.error(`✗ the clip's score clips (${clipped} samples)`);
      failed = true;
    }
    for (let i = 1; i < rows.length - 2; i++) {
      const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
      if (dip > 3.5) {
        console.error(`✗ clip bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
        failed = true;
      }
    }
    if (manifest) {
      const gain = exists('out/vo/save/mix.json') ? JSON.parse(read('out/vo/save/mix.json')).gain : 1;
      const duckOf = Object.fromEntries(C.CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck]));
      const per = manifest.map((line) => {
        const s0 = Math.round(line.start * mix.SR);
        const e = s0 + Math.round(line.spoken * mix.SR);
        const duck = duckOf[line.frame] ?? 0.55;
        const voice = new Float64Array(e - s0);
        const music = new Float64Array(e - s0);
        for (let i = s0; i < e; i++) {
          const m = (mix.l[i] + mix.r[i]) / 2 / gain;
          const c = ((bed.l[i] + bed.r[i]) / 2) * duck;
          voice[i - s0] = m - c;
          music[i - s0] = c;
        }
        return {
          text: line.text,
          full: powerDb(voice) - powerDb(music),
          band: powerDb(speechBand(voice, mix.SR)) - powerDb(speechBand(music, mix.SR)),
        };
      });
      const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const worst = per.reduce((a, b) => (b.band < a.band ? b : a));
      console.log(`  voice over music: median line ${median(per.map((x) => x.full)).toFixed(1)}dB; speech band min ${worst.band.toFixed(1)}dB ("${worst.text.slice(0, 32)}…"), median ${median(per.map((x) => x.band)).toFixed(1)}dB`);
      const masked = per.filter((x) => x.band < 3);
      if (masked.length) {
        for (const x of masked) console.error(`✗ the music masks "${x.text}": ${x.band.toFixed(1)}dB over it in the speech band (min 3dB)`);
        failed = true;
      } else {
        console.log('✓ every clip line sits 3dB or more over the music where speech is heard');
      }
    }
    const I = lufs(mix.l, mix.r, mix.SR);
    const tp = truePeak(mix.l, mix.r);
    const okLoud = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (okLoud ? console.log : console.error)(`${okLoud ? '✓' : '✗'} the clip mix: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
    if (!okLoud) failed = true;
  }
}

// Meta ad 1, "What one save becomes" (its gates live with it)
// ─────────────────────────────────────────────────────── THE ASK CLIP
// The feature clip (clips/ask-timeline.mjs, src/reels/clips/ask/, capture
// take `askfull`) under the reel's gates, on its own clock: captions and
// kickers, the narrator mirroring them and fitting them, the dwell rule, the
// closing tagline, banned strings on screen and in the voice, the score, the
// voice over the music, the delivery loudness. Plus what a clip written
// straight in output frames needs: every picture event on the grid (cuts and
// taps on beats, the rest on 8ths), every line starting on a beat, at most
// three lines before the close, and the app's thinking line on NO frame of
// its take (the clip never has to skip a range).
console.log('\n── clip: ask');
{
  const C = await import('../clips/ask-timeline.mjs');
  const LIB = await import('../capture/library.mjs');
  const root = path.join(here, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const bad = [];
  const BANNED = [
    [/—/, 'em dash'],
    [/\bAI\b/, 'literal "AI"'],
    [/second brain/i, '"second brain"'],
    [/librar(y|ies)/i, '"library"'],
  ];
  const scan = (where, text) => {
    for (const [re, what] of BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
  };

  // captions and kickers
  const caps = [...C.CAPTIONS].sort((a, b) => a.at - b.at);
  caps.forEach((c, i) => {
    scan(`caption ${i + 1}`, c.text);
    if (c.say) scan(`caption ${i + 1} (spoken)`, c.say);
    if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
    if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" starts at ${c.at}, "${caps[i - 1].text}" runs to ${caps[i - 1].to}`);
    if (c.to > C.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the clip (${c.to} > ${C.TOTAL_FRAMES})`);
    if (c.at % C.BEAT_FRAMES) bad.push(`caption "${c.text}" starts at ${c.at}, not on a beat`);
  });
  // (2026-10-04) the caption motion: a line rises 3 frames (HEAD_LEAD,
  // kit/Type.tsx) before its `at`, so the line before it must be gone by then
  caps.forEach((c, i) => {
    const prev = caps[i - 1];
    if (prev && !c.place && !prev.place && c.at - 3 < prev.to) bad.push(`"${c.text.split('\n')[0]}" rises at ${c.at - 3} while "${prev.text.split('\n')[0]}" runs to ${prev.to}: two captions at once`);
  });
  const lines = caps.filter((c) => !c.place);
  // it stands on its own: the product is named before the close
  if (!lines.some((c) => /\bMachina\b/.test(c.say ?? c.text))) bad.push('no line before the close names Machina');
  // it opens on the problem (a hook line, before any chapter word)
  if (!caps[0]?.hook) bad.push('the clip does not open on its hook line');
  const kick = [...C.KICKERS].sort((a, b) => a.at - b.at);
  kick.forEach((k, i) => {
    if (i && k.at < kick[i - 1].to) bad.push(`kicker overlap: ${k.text} / ${kick[i - 1].text}`);
    if (!lines.some((c) => !c.hook && c.to === k.to && c.at >= k.at)) bad.push(`kicker ${k.text} (${k.at}–${k.to}) does not leave with a line`);
    scan(`kicker ${k.text}`, k.text);
  });
  if (kick.some((k) => k.at < caps[0].to)) bad.push('a chapter word sits on the hook');

  // the grid: cuts and taps on beats, every other picture event on an 8th
  const ON_BEAT = ['open', 'appMark', 'typeFrom', 'send', 'citeTap', 'summary', 'closeTap', 'followTap', 'scroll2', 'graphTap', 'lockup', 'markStrike'];
  for (const [k, v] of Object.entries(C.HITS)) {
    for (const fr of [v].flat()) {
      const step = ON_BEAT.includes(k) || k === 'chips' ? C.BEAT_FRAMES : C.BEAT_FRAMES / 2;
      if (fr % step) bad.push(`hit ${k} at ${fr} is not on ${step === C.BEAT_FRAMES ? 'a beat' : 'an 8th'}`);
    }
  }

  // the narrator mirrors the captions, fits them, and obeys the dwell rule
  const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
  const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
  const timing = JSON.parse(read('src/reels/clips/ask/vo.json'));
  caps.forEach((c) => {
    const t = timing.find((x) => x.frame === c.at);
    if (!t) return bad.push(`no narrator timing for caption at ${c.at} ("${c.text}"): run synth-vo.py ask`);
    if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}", scripted "${c.say ?? c.text}"`);
    const words = (c.say ?? c.text).split(/\s+/).filter(Boolean).length;
    if (t.words.length !== words) bad.push(`caption at ${c.at} has ${words} words but ${t.words.length} timings`);
  });
  const manifestPath = path.join(root, 'out', 'vo', 'ask', 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (manifest) {
    for (const line of manifest) {
      const c = caps.find((x) => x.at === line.frame);
      if (!c) continue;
      const window = (c.to - c.at) / C.FPS;
      if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s caption`);
      if (c.place === 'lockup') continue;
      const dwell = window - line.spoken;
      const max = c.until ? 4 : 1.2;
      if (dwell < 0.3) bad.push(`caption "${c.text}" leaves ${dwell.toFixed(2)}s after its voice (min 0.3s)`);
      if (dwell > max) bad.push(`caption "${c.text}" lingers ${dwell.toFixed(2)}s after its voice (max ${max}s)`);
    }
  } else {
    console.log('  (no out/vo/ask/manifest.json: VO fit not re-checked; run synth-vo.py ask)');
  }
  const close = caps.find((c) => c.place === 'lockup');
  // the close is the tagline, exactly, and said nowhere earlier; the App
  // Store subtitle is never said (owner 2026-09-28: every launch film ends on
  // the tagline)
  const closeLine = close?.text.split('\n').slice(1).join(' ');
  if (closeLine !== 'Everything you save, finally useful.') bad.push(`the clip does not end on the tagline: "${closeLine}"`);
  for (const c of caps) if (c !== close && /finally useful/i.test(`${c.text} ${c.say ?? ''}`)) bad.push(`the tagline appears before the end: "${c.text}"`);
  if (caps.some((c) => /great find/i.test(`${c.text} ${c.say ?? ''}`))) bad.push('the clip says the App Store subtitle');
  // the end card holds (finishing pass: it held 1.3s; the owner's rule for
  // the reel is ~2s): at least 1.6s from the last spoken word to the end
  const closeVo = manifest?.find((l) => l.frame === close?.at);
  if (closeVo && C.TOTAL_FRAMES / C.FPS - (closeVo.start + closeVo.spoken) < 1.6)
    bad.push(`the end card holds ${(C.TOTAL_FRAMES / C.FPS - (closeVo.start + closeVo.spoken)).toFixed(2)}s after its last word (min 1.6s)`);

  // banned strings on every frame of the take, and the thinking line nowhere
  scan('Ask question', LIB.ASK.question);
  scan('Ask answer', LIB.ASK.answer);
  scan('Ask follow-up answer', LIB.ASK_MORE.answer);
  const takes = JSON.parse(read('src/reels/data/takes.json'));
  const t = takes[C.TAKE];
  if (!t) bad.push(`no capture take "${C.TAKE}": run \`npm run reel:capture\``);
  else {
    t.frames.forEach((fr, i) =>
      fr.t.forEach((k) => {
        scan(`the app on ${C.TAKE} frame ${i}`, t.texts[k]);
        if (/Searching your/i.test(t.texts[k])) bad.push(`the app's thinking line is on ${C.TAKE} frame ${i}`);
      }),
    );
    // each captured run fits the window the clip plays it in (at K frames each)
    const runs = [
      ['typing', 'stream', C.HITS.send - C.HITS.typeFrom],
      ['stream', 'sources', C.HITS.sources - C.HITS.send],
      ['stream2', 'sources2', C.HITS.scroll2 - C.HITS.followTap],
    ];
    for (const [a, b2, window] of runs) {
      const n = t.marks[b2] - t.marks[a];
      if (n * C.K > window) bad.push(`the ${a} run (${n} frames × ${C.K}) overruns its ${window}-frame window`);
    }
  }

  if (bad.length) {
    console.error('✗ ask clip:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ ${caps.length} captions + ${kick.length} kickers, no overlaps, lines on beats, opens on its hook, names Machina; narrator mirrors, fits and leaves on time`);
    console.log('✓ every cut and tap on a beat, every other picture event on an 8th');
    console.log(`✓ no em dash / "AI" / "second brain" / "library", and no thinking line, on any of the ${t.count} frames of ${C.TAKE}`);
  }

  // the score, the voice over it, the delivery
  const P = (f) => path.join(root, f);
  const wavOf = (f) => {
    const b = fs.readFileSync(P(f));
    const SR = b.readUInt32LE(24);
    const n = (b.length - 44) / 4;
    const L = new Float64Array(n);
    const Rr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = b.readInt16LE(44 + i * 4) / 32768;
      Rr[i] = b.readInt16LE(46 + i * 4) / 32768;
    }
    return { SR, n, L, R: Rr };
  };
  if (!fs.existsSync(P('public/ask-score.wav')) || !fs.existsSync(P('public/ask-score-vo.wav'))) {
    console.error('✗ public/ask-score.wav or ask-score-vo.wav missing: run `node audio/clips/ask-score.mjs && node audio/mix-vo.mjs ask`');
    failed = true;
  } else {
    const bed = wavOf('public/ask-score.wav');
    const mix = wavOf('public/ask-score-vo.wav');
    let clipped = 0;
    for (let i = 0; i < bed.n; i++) if (Math.abs(bed.L[i]) > 0.995 || Math.abs(bed.R[i]) > 0.995) clipped++;
    const rows = [];
    for (let k = 0; k * C.BAR * bed.SR < bed.n; k++) {
      const s0 = Math.floor(k * C.BAR * bed.SR);
      const e = Math.min(bed.n, Math.floor((k + 1) * C.BAR * bed.SR));
      let sum = 0;
      for (let i = s0; i < e; i++) sum += ((bed.L[i] + bed.R[i]) / 2) ** 2;
      rows.push(20 * Math.log10(Math.sqrt(sum / (e - s0)) || 1e-9));
    }
    console.log(`  ask bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
    if (clipped) {
      console.error(`✗ the ask score clips (${clipped} samples)`);
      failed = true;
    }
    for (let i = 1; i < rows.length - 2; i++) {
      const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
      if (dip > 3.5) {
        console.error(`✗ ask bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
        failed = true;
      }
    }
    // the voice: the mix (un-mastered) minus the ducked bed, per line
    const mixInfo = path.join(root, 'out', 'vo', 'ask', 'mix.json');
    const gain = fs.existsSync(mixInfo) ? JSON.parse(fs.readFileSync(mixInfo, 'utf8')).gain : 1;
    const duckOf = Object.fromEntries(C.CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck]));
    const perLine = (manifest ?? []).map((line) => {
      const s0 = Math.round(line.start * mix.SR);
      const e = s0 + Math.round(line.spoken * mix.SR);
      const duck = duckOf[line.frame] ?? 0.55;
      const voice = new Float64Array(e - s0);
      const music = new Float64Array(e - s0);
      for (let i = s0; i < e; i++) {
        const m = (mix.L[i] + mix.R[i]) / 2 / gain;
        const c = ((bed.L[i] + bed.R[i]) / 2) * duck;
        voice[i - s0] = m - c;
        music[i - s0] = c;
      }
      return {
        text: line.text,
        ratio: powerDb(voice) - powerDb(music),
        speech: powerDb(speechBand(voice, mix.SR)) - powerDb(speechBand(music, mix.SR)),
      };
    });
    if (perLine.length) {
      const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      // the film's balance, the one mix the owner has listened to
      let filmBal = null;
      if (['public/score-vo.wav', 'public/score.wav', 'out/vo/manifest.json'].every((f) => fs.existsSync(P(f)))) {
        const fmix = fs.readFileSync(P('public/score-vo.wav'));
        const fbed = fs.readFileSync(P('public/score.wav'));
        const FSR = fmix.readUInt32LE(24);
        const mid = (buf, i) => (buf.readInt16LE(44 + i * 4) + buf.readInt16LE(46 + i * 4)) / 65536;
        filmBal = median(
          JSON.parse(fs.readFileSync(P('out/vo/manifest.json'), 'utf8')).map((line) => {
            const s0 = Math.round(line.bar * 2.5 * FSR);
            const e = s0 + Math.round((line.spoken ?? line.sec) * FSR);
            const voice = new Float64Array(e - s0);
            const music = new Float64Array(e - s0);
            for (let i = s0; i < e; i++) {
              voice[i - s0] = mid(fmix, i) - mid(fbed, i) * 0.65;
              music[i - s0] = mid(fbed, i) * 0.65;
            }
            return powerDb(voice) - powerDb(music);
          }),
        );
      }
      const bal = median(perLine.map((x) => x.ratio));
      console.log(`  voice over music, median line: ${filmBal === null ? '' : `film ${filmBal.toFixed(1)}dB · `}ask ${bal.toFixed(1)}dB`);
      if (filmBal !== null && bal < filmBal - 3) {
        console.error("✗ the ask clip's voice sits >3dB lower in its mix than the film's does");
        failed = true;
      }
      const worst = perLine.reduce((a, b) => (b.speech < a.speech ? b : a));
      console.log(`  voice over music in the speech band: min ${worst.speech.toFixed(1)}dB ("${worst.text.slice(0, 32)}…"), median ${median(perLine.map((x) => x.speech)).toFixed(1)}dB`);
      const masked = perLine.filter((x) => x.speech < 3);
      if (masked.length) {
        for (const x of masked) console.error(`✗ the music masks "${x.text}": ${x.speech.toFixed(1)}dB over it in the speech band (min 3dB)`);
        failed = true;
      } else {
        console.log('✓ every ask line sits 3dB or more over the music where speech is heard');
      }
    }
    const I = lufs(mix.L, mix.R, mix.SR);
    const tp = truePeak(mix.L, mix.R);
    const okLoud = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (okLoud ? console.log : console.error)(`${okLoud ? '✓' : '✗'} the ask mix: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
    if (!okLoud) failed = true;
  }
}


// ─────────────────────────────────────────────── THE REVISIT CLIP
if (!(await import('./clips/revisit-verify.mjs')).ok) failed = true;
// ─────────────────────────────────────────────── META AD 1
if (await (await import('./ads/card-verify.mjs')).default()) failed = true;
// ─────────────────────────────────────────────── META AD 2, the trip
if (!(await (await import('./ads/trip-verify.mjs')).default())) failed = true;
// ─────────────────────────────── META AD 2, "talking to a friend" edition
if (!(await (await import('./ads/asktalk-verify.mjs')).default())) failed = true;
// ─────────────────────────────────────────────── META AD 3
if (!(await import('./ads/todo-verify.mjs')).ok) failed = true;

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
