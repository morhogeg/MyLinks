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

// ── 1b. the brand lines (owner call 2026-09-28): the film ENDS on the tagline,
// exactly as written, once; the endcard shows it and the closing voice line
// says it word for word, nothing else; the introduction carries "Never lose
// another great find", which appears nowhere at the end
{
  const TAGLINE = 'Everything you save, finally useful.';
  const SUBTITLE = 'Never lose another great find';
  const bad = [];
  const endcard = fs.readFileSync(path.join(here, '..', 'src', 'scenes', 'Endcard.tsx'), 'utf8');
  const jsx = endcard.slice(endcard.indexOf('return ('));
  const vo = fs.readFileSync(path.join(here, 'synth-vo.py'), 'utf8');
  const film = vo.slice(vo.indexOf('FILM_LINES = ['), vo.indexOf('def film_script'));
  const spoken = [...film.matchAll(/^\s*\(([\d.]+), [\d.]+, f?"([^"]+)"/gm)].map((m) => ({ bar: Number(m[1]), text: m[2] }));
  const last = spoken[spoken.length - 1];
  const count = (hay, needle) => hay.split(needle).length - 1;
  if (count(jsx, TAGLINE) !== 1) bad.push(`the endcard shows the tagline ${count(jsx, TAGLINE)} times (want once, exactly "${TAGLINE}")`);
  if (/textTransform:\s*'uppercase'/.test(jsx.slice(jsx.indexOf(TAGLINE) - 600, jsx.indexOf(TAGLINE)))) bad.push('the endcard tagline is set in caps (it is kept exactly as written)');
  if (jsx.includes(SUBTITLE)) bad.push(`the endcard still shows "${SUBTITLE}"`);
  if (!last || last.text !== TAGLINE) bad.push(`the closing voice line is "${last?.text}", not the endcard's "${TAGLINE}" word for word`);
  const inCaptions = SUBTITLES.filter((c) => c.text.replace(/\n/g, ' ').includes(TAGLINE));
  if (inCaptions.length) bad.push(`the tagline also appears in a caption (bar ${inCaptions.map((c) => c.bar).join(', ')}): once per film, at the end`);
  if (spoken.slice(0, -1).some((l) => l.text.includes(TAGLINE))) bad.push('the tagline is spoken before the close');
  const intro = SUBTITLES.find((c) => c.kicker === 'Introducing');
  if (!intro || !intro.text.includes(SUBTITLE)) bad.push(`the introduction does not carry "${SUBTITLE}"`);
  const introVo = spoken.find((l) => intro && l.bar === intro.bar);
  if (intro && (!introVo || !introVo.text.endsWith(intro.text.split('\n').slice(-1)[0]))) bad.push(`the introduction's voice line does not say its caption ("${introVo?.text}")`);
  if (bad.length) {
    console.error('✗ film brand lines:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ the film ends on the tagline, once, screen and voice word for word; the introduction says "${SUBTITLE}."`);
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
  // the line the reel shares with the film: its endcard's, the tagline (2026-09-28)
  const film = read('src/scenes/Endcard.tsx');
  const close = caps.find((c) => c.place === 'lockup');
  const closeLine = close?.text.split('\n').slice(-1)[0].replace(/\.$/, '');
  if (!close || !film.includes(closeLine)) bad.push('the reel lockup line is not the film endcard line (the tagline)');
  // (2026-09-28, owner) every launch film ENDS on the tagline, once, word for
  // word; the film's endcard carries it, and no earlier line repeats it
  {
    const TAGLINE = 'Everything you save, finally useful.';
    if (!film.includes(TAGLINE)) bad.push(`the film endcard does not carry the tagline "${TAGLINE}"`);
    if (!close || !close.text.endsWith(TAGLINE)) bad.push('the reel does not end on the tagline');
    for (const c of caps) if (c !== close && /finally useful/i.test(`${c.text} ${c.say ?? ''}`)) bad.push(`the tagline appears before the end: "${c.text}"`);
    for (const c of SUBTITLES) if (/finally useful/i.test(c.text)) bad.push(`the film repeats the tagline before its endcard: "${c.text}"`);
    const filmVo = read('audio/synth-vo.py');
    if (!filmVo.includes(`f"{SAY_NAME}. ${TAGLINE}"`)) bad.push('the film\'s closing voice line is not the tagline');
  }

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

// ── the REVISIT feature clip: its own gates (audio/clips/revisit-verify.mjs)
if (!(await import('./clips/revisit-verify.mjs')).ok) failed = true;
// ── Meta ad 3 (TODO): its own gates (audio/ads/todo-verify.mjs)
if (!(await import('./ads/todo-verify.mjs')).ok) failed = true;
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
if (await (await import('./ads/card-verify.mjs')).default()) failed = true;

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
