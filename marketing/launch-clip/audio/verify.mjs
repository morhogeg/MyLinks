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
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, SUBTITLES, TOTAL_BARS } from '../timeline.mjs';

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
  // the lines the reel shares with the brand: tagline in, subtitle out
  const film = read('src/scenes/Endcard.tsx');
  const close = caps.find((c) => c.place === 'lockup');
  const closeLine = close?.text.split('\n').slice(-1)[0].replace(/\.$/, '');
  if (!close || !film.includes(closeLine)) bad.push('the reel lockup line is not the film endcard subtitle');
  // round 7 (owner): "Introducing Machina. All your saves, finally useful." after the problem

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
  const balance = (mixFile, scoreFile, manifestFile, startOf, duck) => {
    const P = (f) => path.join(root, f);
    if (![mixFile, scoreFile, manifestFile].every((f) => fs.existsSync(P(f)))) return null;
    const mix = fs.readFileSync(P(mixFile));
    const bed = fs.readFileSync(P(scoreFile));
    const SR = mix.readUInt32LE(24);
    const ratios = [];
    for (const line of JSON.parse(fs.readFileSync(P(manifestFile), 'utf8'))) {
      const s0 = Math.round(startOf(line) * SR);
      const e = s0 + Math.round((line.spoken ?? line.sec) * SR);
      let v = 0;
      let m = 0;
      for (let i = s0; i < e; i++) {
        const a = mix.readInt16LE(44 + i * 4) / 32768;
        const c = bed.readInt16LE(44 + i * 4) / 32768;
        // the mix minus the (ducked) bed is the voice; the bed under it is duck×
        v += (a - c * duck) ** 2;
        m += (c * duck) ** 2;
      }
      ratios.push(10 * Math.log10(v / m));
    }
    ratios.sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length / 2)];
  };
  const filmBal = balance('public/score-vo.wav', 'public/score.wav', 'out/vo/manifest.json', (l) => l.bar * 2.5, 0.65);
  const reelBal = balance('public/reel-score-vo.wav', 'public/reel-score.wav', 'out/vo/reel/manifest.json', (l) => l.start, 0.55);
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
}

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
