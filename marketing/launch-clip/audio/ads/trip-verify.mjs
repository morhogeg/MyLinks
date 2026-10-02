/**
 * The trip ad's gates ("── ad: trip" in `npm run verify`). The Ask clip's
 * gates on the ad's own clock, plus what a Meta ad needs:
 *
 *  - the script: captions never overlap, start on an 8th, at most 8 words on
 *    screen at once; the hook is on screen from frame 0 and spoken by 0.5s;
 *    Machina is named before the close; the close is "Download Machina."
 *    then the tagline, exactly,
 *    said nowhere earlier, held ≥ 1.6s after its last word; the ad runs at
 *    most 30s; the narrator mirrors every caption, fits it, and leaves on
 *    time (the dwell rule);
 *  - the words: no em dash, literal "AI", "second brain", "library", "share
 *    sheet" or "bookmarks", and no price, "free" or availability claim
 *    ("App Store", "available"; the one "Download Machina." is the owner's
 *    call to action), in the captions, the voice, the
 *    hook's piles, the trip's cards, the question and the answer, or the
 *    text of ANY frame of the take; and the app's thinking line on no frame;
 *  - honesty: the piles show real saves of the demo account; the answer
 *    cites three cards from three different platforms and names each cited
 *    card by its title (never by id);
 *  - no recipe: no recipe card's title on any frame of the take;
 *  - the take fits the windows the ad plays it in;
 *  - the sound: both deliveries (narrator, music only) at −14 LUFS ±0.5,
 *    true peak ≤ −1 dBTP; every narrator line ≥ 3dB over the music in the
 *    speech band (500 Hz – 4 kHz).
 *
 * Returns true when every gate passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lufs, powerDb, speechBand, truePeak } from '../loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

export default async function verifyTrip() {
  console.log('\n── ad: trip');
  const A = await import('../../ads/trip-timeline.mjs');
  const LIB = await import('../../capture/library.mjs');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const bad = [];
  const BANNED = [
    [/—/, 'em dash'],
    [/\bAI\b/, 'literal "AI"'],
    [/second brain/i, '"second brain"'],
    [/librar(y|ies)/i, '"library"'],
    [/share sheet/i, '"share sheet"'],
    [/bookmarks?/i, '"bookmarks"'],
  ];
  // what the ad itself must never claim (the app's own frames are not held
  // to these: its screens may say "Save" or "Share")
  const CLAIMS = [
    [/\bfree\b/i, '"free"'],
    [/[$€£]\s?\d|\bprice\b|\bper month\b/i, 'a price'],
    // (owner, round 3: the ad ends on "Download Machina." before the tagline;
    // it runs only once the listing is live. Nothing else claims availability)
    [/app store|available|\bnow on\b/i, 'an availability claim'],
    [/\bpro\b/i, 'a plan'],
  ];
  const scan = (where, text, claims = true) => {
    for (const [re, what] of claims ? [...BANNED, ...CLAIMS] : BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
  };

  // ── the script
  const caps = [...A.CAPTIONS].sort((a, b) => a.at - b.at);
  caps.forEach((c, i) => {
    scan(`caption ${i + 1}`, c.text);
    if (c.say) scan(`caption ${i + 1} (spoken)`, c.say);
    if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
    if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" starts at ${c.at}, "${caps[i - 1].text}" runs to ${caps[i - 1].to}`);
    if (c.to > A.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the ad`);
    if (c.at % (A.BEAT_FRAMES / 2)) bad.push(`caption "${c.text}" starts at ${c.at}, not on an 8th`);
    const words = c.text.split(/\s+/).filter(Boolean).length;
    if (words > 8) bad.push(`caption "${c.text}" puts ${words} words on screen (max 8)`);
  });
  const hook = caps[0];
  if (!hook?.hook || !hook.pre) bad.push('the ad does not open on its hook, on screen from frame 0');
  if (hook && hook.at > 0.5 * A.FPS) bad.push(`the narrator starts at ${(hook.at / A.FPS).toFixed(2)}s (by 0.5s)`);
  if (A.HITS.bracketsClose / A.FPS > 4.5) bad.push(`the mark forms at ${(A.HITS.bracketsClose / A.FPS).toFixed(2)}s (by about 3s; at most 4.5s)`);
  const lines = caps.filter((c) => !c.place);
  if (!lines.some((c) => /\bMachina\b/.test(c.say ?? c.text))) bad.push('no line before the close names Machina');
  const close = caps.find((c) => c.place === 'lockup');
  if (close?.text !== 'Everything you save, finally useful.') bad.push(`the ad does not end on the tagline: "${close?.text}"`);
  const cta = caps.filter((c) => c.cta);
  if (cta.length !== 1 || cta[0].text !== 'Download Machina.' || caps[caps.indexOf(close) - 1] !== cta[0]) bad.push('the close is not "Download Machina." then the tagline');
  for (const c of caps) if (c !== close && /finally useful/i.test(`${c.text} ${c.say ?? ''}`)) bad.push(`the tagline appears before the end: "${c.text}"`);
  if (caps.some((c) => /great find/i.test(`${c.text} ${c.say ?? ''}`))) bad.push('the ad says the App Store subtitle');
  if (A.TOTAL_SEC > 30) bad.push(`the ad runs ${A.TOTAL_SEC.toFixed(1)}s (max 30s)`);
  if (A.TOTAL_SEC > 23.5) console.log(`  (the ad runs ${A.TOTAL_SEC.toFixed(1)}s: over the 15–20s aim)`);

  // the narrator
  const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
  const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
  const timing = JSON.parse(read('src/reels/ads/trip/vo.json'));
  caps.forEach((c) => {
    const t = timing.find((x) => x.frame === c.at);
    if (!t) return bad.push(`no narrator timing for caption at ${c.at}: run synth-vo.py trip`);
    if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}"`);
    const words = (c.say ?? c.text).split(/\s+/).filter(Boolean).length;
    if (t.words.length !== words) bad.push(`caption at ${c.at} has ${words} words but ${t.words.length} timings`);
  });
  const manifestPath = path.join(root, 'out', 'vo', 'trip', 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (manifest) {
    for (const line of manifest) {
      const c = caps.find((x) => x.at === line.frame);
      if (!c) continue;
      const window = (c.to - c.at) / A.FPS;
      if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s caption`);
      if (c.place === 'lockup') {
        const hold = A.TOTAL_SEC - (line.start + line.spoken);
        if (hold < 1.6) bad.push(`the end card holds ${hold.toFixed(2)}s after its last word (min 1.6s)`);
        continue;
      }
      const dwell = window - line.spoken;
      const max = c.until ? 4 : 1.2;
      if (dwell < 0.3) bad.push(`caption "${c.text}" leaves ${dwell.toFixed(2)}s after its voice (min 0.3s)`);
      if (dwell > max) bad.push(`caption "${c.text}" lingers ${dwell.toFixed(2)}s after its voice (max ${max}s)`);
    }
  } else {
    console.log('  (no out/vo/trip/manifest.json: VO fit not re-checked; run synth-vo.py trip)');
  }

  // ── honesty: the piles, the trip's cards, the answer
  const piles = read('src/reels/ads/trip/Piles.tsx');
  const pileBlock = /export const PILES[^=]*= \[([\s\S]*?)\n\];/.exec(piles)?.[1] ?? '';
  const pileTitles = [...pileBlock.matchAll(/titles: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map((x) => x[2].replace(/\\'/g, "'")));
  const all = [...LIB.CARDS, ...LIB.TRIP_CARDS];
  if (pileTitles.length !== 10) bad.push(`expected 10 pile titles, read ${pileTitles.length}`);
  for (const t of pileTitles) {
    scan('a pile', t);
    if (!all.some((c) => c.title === t)) bad.push(`pile title "${t}" is not a save in the demo account`);
  }
  for (const c of LIB.TRIP_CARDS) for (const k of ['title', 'summary', 'sourceName', 'youtubeChannel']) if (c[k]) scan(`trip card ${c.id}.${k}`, c[k]);
  scan('the question', LIB.TRIP_ASK.question);
  scan('the answer', LIB.TRIP_ASK.answer);
  const cited = LIB.TRIP_ASK.sources.map((id) => all.find((c) => c.id === id));
  if (cited.some((c) => !c)) bad.push('the answer cites a card that does not exist');
  else {
    const mark = (c) =>
      /instagram\.com/.test(c.url) ? 'instagram' : /youtube\.com|youtu\.be/.test(c.url) ? 'youtube' : /facebook\.com/.test(c.url) ? 'facebook' : c.sourceType === 'image' ? 'screenshot' : c.sourceType === 'note' ? 'note' : 'web';
    const marks = new Set(cited.map(mark));
    if (cited.length !== 3 || marks.size !== 3) bad.push(`the answer should cite three cards from three platforms (got ${[...marks].join(', ')})`);
    for (const c of cited) {
      if (!LIB.TRIP_ASK.answer.includes(c.title)) bad.push(`the answer does not name "${c.title}" by its title`);
    }
    for (const c of all) if (new RegExp(`\\b${c.id}\\b`).test(LIB.TRIP_ASK.answer) && !LIB.TRIP_ASK.answer.includes(c.title)) bad.push(`the answer names a card by its id: ${c.id}`);
  }

  // ── the take: banned words, the thinking line and recipes on no frame
  const RECIPES = LIB.CARDS.filter((c) => c.recipe || c.concepts?.includes('recipe') || /V60/.test(c.title)).map((c) => c.title);
  const takes = JSON.parse(read('src/reels/data/takes.json'));
  const t = takes[A.TAKE];
  if (!t) bad.push(`no capture take "${A.TAKE}": run CAPTURE_ONLY=adtrip npm run reel:capture`);
  else {
    const seen = new Set();
    t.frames.forEach((fr, i) =>
      fr.t.forEach((k) => {
        const text = t.texts[k];
        if (seen.has(text)) return;
        seen.add(text);
        scan(`the app on ${A.TAKE} frame ${i}`, text, false);
        if (/Searching your/i.test(text)) bad.push(`the app's thinking line is on ${A.TAKE} frame ${i}`);
        for (const r of RECIPES) if (text.includes(r)) bad.push(`a recipe ("${r}") is on ${A.TAKE} frame ${i}`);
      }),
    );
    const runs = [
      ['typing', 'stream', A.HITS.send - A.HITS.typeFrom, A.TYPE_STEP],
      ['stream', 'sources', A.HITS.sources - A.HITS.send, A.K],
      ['sources', 'card', A.HITS.citeTap - A.HITS.sources, A.K],
    ];
    for (const [a, b, window, step] of runs) {
      const n = t.marks[b] - t.marks[a];
      if (a !== 'sources' && n * step > window) bad.push(`the ${a} run (${n} frames × ${step}) overruns its ${window}-frame window`);
    }
  }

  let failed = false;
  if (bad.length) {
    console.error('✗ trip ad:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ ${caps.length} captions, no overlaps, ≤ 8 words each, hook up from frame 0 and spoken at ${(hook.at / A.FPS).toFixed(2)}s, ends on the tagline; ${A.TOTAL_SEC.toFixed(1)}s`);
    console.log('✓ narrator mirrors, fits and leaves on time; the end card holds ≥ 1.6s');
    console.log('✓ the piles are real demo saves; the answer cites three platforms, each card by its title');
    console.log(`✓ no banned word, claim, thinking line or recipe on any of the ${t.count} frames of ${A.TAKE}`);
  }

  // ── the sound
  const P = (f) => path.join(root, f);
  const wavOf = (f) => {
    const b = fs.readFileSync(P(f));
    const SR = b.readUInt32LE(24);
    const n = (b.length - 44) / 4;
    const L = new Float64Array(n);
    const R = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = b.readInt16LE(44 + i * 4) / 32768;
      R[i] = b.readInt16LE(46 + i * 4) / 32768;
    }
    return { SR, n, L, R };
  };
  const files = ['public/ads/trip/score.wav', 'public/ads/trip/score-vo.wav', 'public/ads/trip/score-music.wav'];
  if (!files.every((f) => fs.existsSync(P(f)))) {
    console.error('✗ the trip audio is missing: run `node audio/ads/trip-score.mjs && node audio/mix-vo.mjs trip`');
    return false;
  }
  const bed = wavOf(files[0]);
  const mix = wavOf(files[1]);
  const music = wavOf(files[2]);
  for (const [name, w] of [['narrator mix', mix], ['music-only mix', music]]) {
    const I = lufs(w.L, w.R, w.SR);
    const tp = truePeak(w.L, w.R);
    const ok = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (ok ? console.log : console.error)(`${ok ? '✓' : '✗'} the trip ${name}: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5, ≤ −1 dBTP)`);
    if (!ok) failed = true;
    if (Math.abs(w.n / w.SR - A.TOTAL_SEC) > 0.1) {
      console.error(`✗ the trip ${name} runs ${(w.n / w.SR).toFixed(2)}s, the picture ${A.TOTAL_SEC.toFixed(2)}s`);
      failed = true;
    }
  }
  const mixInfo = path.join(root, 'out', 'vo', 'trip', 'mix.json');
  const gain = fs.existsSync(mixInfo) ? JSON.parse(fs.readFileSync(mixInfo, 'utf8')).gain : null;
  if (manifest && gain) {
    const duckOf = Object.fromEntries(A.CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck]));
    const perLine = manifest.map((line) => {
      const s0 = Math.round(line.start * mix.SR);
      const e = s0 + Math.round(line.spoken * mix.SR);
      const duck = duckOf[line.frame] ?? 0.55;
      const voice = new Float64Array(e - s0);
      const m = new Float64Array(e - s0);
      for (let i = s0; i < e; i++) {
        const x = (mix.L[i] + mix.R[i]) / 2 / gain;
        const c = ((bed.L[i] + bed.R[i]) / 2) * duck;
        voice[i - s0] = x - c;
        m[i - s0] = c;
      }
      return { text: line.text, speech: powerDb(speechBand(voice, mix.SR)) - powerDb(speechBand(m, mix.SR)) };
    });
    const worst = perLine.reduce((a, b) => (b.speech < a.speech ? b : a));
    const masked = perLine.filter((x) => x.speech < 3);
    if (masked.length) {
      for (const x of masked) console.error(`✗ the music masks "${x.text}": ${x.speech.toFixed(1)}dB over it in the speech band (min 3dB)`);
      failed = true;
    } else {
      console.log(`✓ every trip line sits 3dB or more over the music in the speech band (min ${worst.speech.toFixed(1)}dB, "${worst.text.slice(0, 30)}…")`);
    }
  }
  return !failed;
}
