/**
 * `npm run verify` gates for Meta ad 1, "What one save becomes"
 * (ads/card-timeline.mjs, src/reels/ads/card, take "adcard"). The SAVE clip's
 * gates held to the ad's clock, plus the Meta spec:
 *
 *  - length: 15–30s (aim ≤ 20s: over it is a warning, over 30 fails);
 *  - the first second: a `poster` line set on frame 0, the narrator in by
 *    0.5s, the mark by ~3.5s; at most 8 words on screen at once;
 *  - the close is the tagline, exactly, held ≥ 1.6s after its last word;
 *  - brand and Meta bans in every line and every frame of app the ad plays:
 *    em dash, "AI", "second brain", "library", "share sheet", "bookmark",
 *    "free", a price, availability ("App Store", "available", "download");
 *  - no recipes: no recipe card on any frame of the take the ad plays;
 *  - safe zones (9:16): the line under the top 270px, the + and every lifted
 *    element above the bottom 670px;
 *  - taps on their hits, exits eased in and out, every hit on an 8th;
 *  - the mixes: no clipping, no hole, every line ≥ 3dB over the music in the
 *    speech band, both cuts −14 ±0.5 LUFS with true peaks ≤ −1 dBTP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lufs, powerDb, speechBand, truePeak } from '../loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

export default async function verifyAdCard() {
  console.log('\n── ad: card (Meta ad 1, "What one save becomes")');
  const C = await import('../../ads/card-timeline.mjs');
  const L = await import('../../capture/library.mjs');
  const AD = await import('../../capture/ad-card.mjs');
  let failed = false;
  const bad = [];
  const BANNED = [
    [/—/, 'em dash'],
    [/\bAI\b/, 'literal "AI"'],
    [/second brain/i, '"second brain"'],
    [/librar(y|ies)/i, '"library"'],
    [/share sheet/i, '"share sheet"'],
    [/bookmark/i, '"bookmarks"'],
    [/\btalks?\b/i, '"talk" (owner, round 3: say video)'],
  ];
  // what the ad itself says (lines, the share card): no plan, no price, no
  // availability (the listing is not live; Meta's Install button is the CTA)
  const AD_COPY = [
    [/\bfree\b/i, '"free"'],
    [/\bpro\b/i, 'a plan name'],
    [/[$€£]\s?\d|\bprice\b/i, 'a price'],
    [/app store|available|download/i, 'an availability claim'],
    [/\blearn/i, 'a learning-app claim'],
  ];
  const scan = (where, text, copy = false) => {
    for (const [re, what] of copy ? [...BANNED, ...AD_COPY] : BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
  };

  // ── captions
  const caps = [...C.CAPTIONS].sort((a, b) => a.at - b.at);
  caps.forEach((c, i) => {
    scan(`caption ${i + 1}`, c.text, true);
    if (c.kicker) scan(`kicker ${i + 1}`, c.kicker, true);
    if (c.kicker && / /.test(c.kicker)) bad.push(`kicker "${c.kicker}" has a plain space (the Kicker collapses it: use \\u00a0)`);
    if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
    if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" / "${caps[i - 1].text}"`);
    if (c.to > C.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the ad`);
    if (c.at % (C.BEAT_FRAMES / 2)) bad.push(`caption "${c.text}" starts at ${c.at}, not on an 8th`);
    const words = c.text.split(/\s+/).filter(Boolean).length - (c.place === 'lockup' ? 1 : 0) + (c.kicker ? c.kicker.split(/[\s\u00a0]+/).length : 0); // the name is the drawn wordmark; a kicker counts
    if (words > 8) bad.push(`caption "${c.text}" puts ${words} words on screen (Meta spec: at most about 8)`);
    c.text.split('\n').forEach((row) => {
      if (/[.?!]\s+\S/.test(row)) bad.push(`caption row "${row}" starts a new sentence mid-row`);
    });
  });
  const lines = caps.filter((c) => !c.place);
  const close = caps.find((c) => c.place === 'lockup');
  const TAGLINE = 'Everything you save, finally useful.';
  const flat = (t) => t.split(/\s+/).join(' ');
  if (!close || close !== caps[caps.length - 1]) bad.push('the ad does not close on its lockup line');
  if (!close || flat(close.text) !== `Machina. ${TAGLINE}`) bad.push(`the close is "${flat(close?.text ?? '')}", not "Machina. ${TAGLINE}"`);
  if (lines.some((c) => flat(c.text).includes(TAGLINE))) bad.push('the tagline also appears before the close');
  if (caps.some((c) => /never lose another great find/i.test(c.text))) bad.push('the ad says the App Store subtitle');
  if (!lines.some((c) => /\bMachina\b/.test(c.text))) bad.push('no line names Machina before the close');
  if (!caps[0].poster || caps[0].at > 15) bad.push('the first line is not set on frame 0 (`poster`) with its voice by 0.5s');
  if (C.TOTAL_SEC > 30 || C.TOTAL_SEC < 15) bad.push(`the ad runs ${C.TOTAL_SEC.toFixed(1)}s (Meta spec: 15–30s, aim ≤ 20s)`);
  else if (C.TOTAL_SEC > 20) console.log(`  (note: ${C.TOTAL_SEC.toFixed(1)}s, over the 20s aim)`);
  if (C.HITS.bracketsClose > 105) bad.push(`the mark closes at ${C.HITS.bracketsClose} (spec: by about 3s)`);

  // ── the grid
  for (const [k, v] of Object.entries(C.HITS)) for (const fr of [v].flat()) if (fr % (C.BEAT_FRAMES / 2)) bad.push(`hit ${k} at ${fr} is not on an 8th`);

  // ── the narrator: mirrors the captions, every word timed, in by 0.5s,
  // the dwell rule, and the tagline held 1.6s after its last word
  const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
  const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
  const timing = JSON.parse(read('src/reels/ads/card/vo.json'));
  caps.forEach((c) => {
    const t = timing.find((x) => x.frame === c.at);
    if (!t) return bad.push(`no narrator timing for "${c.text}" at ${c.at}: run synth-vo.py adcard`);
    if (t.text !== spoken(c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}"`);
    if (t.words.length !== c.text.split(/\s+/).filter(Boolean).length) bad.push(`caption at ${c.at}: word timings don't match its words`);
  });
  const t0 = timing.find((x) => x.frame === caps[0].at);
  if (t0 && caps[0].at + t0.words[0] * C.FPS > 15) bad.push('the narrator starts after 0.5s');
  const manifestPath = 'out/vo/adcard/manifest.json';
  const manifest = exists(manifestPath) ? JSON.parse(read(manifestPath)) : null;
  if (manifest) {
    for (const line of manifest) {
      const c = caps.find((x) => x.at === line.frame);
      if (!c) continue;
      const window = (c.to - c.at) / C.FPS;
      if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s caption`);
      if (c.place === 'lockup') {
        const held = (C.TOTAL_FRAMES - c.at) / C.FPS - line.spoken;
        if (held < 1.6) bad.push(`the tagline holds ${held.toFixed(2)}s after the voice (spec: ≥ 1.6s)`);
        continue;
      }
      const dwell = window - line.spoken;
      const max = c.until ? 4 : 1.2;
      if (dwell < 0.3 || dwell > max) bad.push(`caption "${c.text}" leaves ${dwell.toFixed(2)}s after its voice (0.3–${max}s)`);
    }
  } else console.log('  (no out/vo/adcard/manifest.json: VO fit not re-checked; run synth-vo.py adcard)');

  // ── what a viewer can read: the pile holds the talk and real demo saves;
  // the share card is the card the ad opens; the card's scripted Related
  // reasons pass the bans; the app's own text on every frame of the take
  const card = AD.adCard();
  [card.title, card.summary, card.detailedSummary, card.actionableTakeaway, ...card.tags, ...card.metadata.videoHighlights, ...card.relatedLinks.map((r) => r.reason)].forEach((x) => scan('the ad card', x));
  for (const r of card.relatedLinks) if (!L.CARDS.some((c) => c.id === r.id)) bad.push(`Related card ${r.id} is not a demo save`);
  const hookSrc = read('src/reels/ads/card/Hook.tsx');
  const pile = [...hookSrc.matchAll(/TITLES = \[([^\]]+)\]/g)].flatMap(([, list]) => [...list.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]));
  if (pile.length < 3) bad.push(`found ${pile.length} titles in the pile: the gate no longer reads Hook.tsx`);
  for (const title of pile) {
    scan('Hook.tsx', title, true);
    if (title !== card.title && !L.CARDS.some((c) => c.title === title)) bad.push(`"${title}" (Hook.tsx) is not a demo save or the ad's talk`);
  }
  const talk = /TALK = \{ title: '([^']+)'/.exec(hookSrc)?.[1];
  if (talk !== card.title) bad.push(`the shared talk "${talk}" is not the card the ad opens`);
  const RECIPES = L.CARDS.filter((c) => /recipe|cook|kitchen|food/i.test(`${c.category} ${(c.tags ?? []).join(' ')}`) || ['marcella', 'chicken', 'coffee'].includes(c.id)).map((c) => c.title).filter(Boolean);
  for (const t of pile) if (RECIPES.includes(t)) bad.push(`the pile shows a recipe: "${t}"`);
  const takes = JSON.parse(read('src/reels/data/takes.json'));
  const take = takes.adcard;
  if (!take) bad.push('no "adcard" take: run CAPTURE_ONLY=adcard node capture/shoot.mjs');
  else {
    for (const k of ['home', 'land', 'landed', 'open', 'scroll', 'graph', 'back', 'remind', 'set', 'feed', 'due', 'dueHeld']) if (take.marks[k] === undefined) bad.push(`the adcard take has no mark "${k}"`);
    // the ad plays from the landing on (the home frame before it is never shown)
    take.frames.slice(take.marks.land).forEach((fr, i) =>
      fr.t.forEach((k) => {
        const s = take.texts[k];
        scan(`the app on adcard frame ${i + take.marks.land}`, s);
        if (RECIPES.some((r) => s.includes(r)) || /crispy smashed potatoes/i.test(s)) bad.push(`a recipe on adcard frame ${i + take.marks.land}: "${s}"`);
      }),
    );
  }

  // ── safe zones (9:16): the line under 270px; the + where the point lands,
  // the hero and the lockup's line above the bottom 670px
  const fmt = read('src/reels/ads/card/format.ts');
  const tallLine = Number(/tall: \{[^}]*line: (\d+)/.exec(fmt)?.[1]);
  if (!(tallLine >= 290)) bad.push(`the 9:16 line sits at ${tallLine}px (Meta's top 270px; the kit's band is 290+)`);
  const ho = read('src/reels/ads/card/handoff.ts');
  const fy = Number(/fy: (\d+)/.exec(ho)[1]);
  const cy = Number(/cy: (\d+)/.exec(ho)[1]);
  const z = Number(/z: ([\d.]+)/.exec(ho)[1]);
  const plusY = fy + (811 - cy) * z;
  if (plusY > 1250) bad.push(`the + sits at ${plusY.toFixed(0)}px, inside Meta's bottom 670px`);
  const hero = Number(/const HERO = (\d+)/.exec(read('src/reels/ads/card/Card.tsx'))?.[1]);
  if (!(hero >= 720 && hero <= 1240)) bad.push(`the app's hero line is ${hero}px (aim between 720 and 1240)`);

  // ── taps touch on their hits; exits ease in and out
  for (const [file, want] of [['Card.tsx', 2], ['Share.tsx', 1], ['Remind.tsx', 2]]) {
    let taps = 0;
    for (const [, hit, a, b] of read(`src/reels/ads/card/${file}`).matchAll(/<Tap [^>]*t=\{prog\(f, ([\w.]+) - (\d+), \1 \+ (\d+)/g)) {
      taps++;
      const touch = Math.ceil(-Number(a) + 0.35 * (Number(a) + Number(b)) - 1e-9);
      if (touch !== 0) bad.push(`${file}: the tap on ${hit} first shows its touch ${touch} frames off its hit`);
    }
    if (taps < want) bad.push(`found ${taps} taps in ${file} (expected ${want}): the tap gate no longer reads it`);
  }
  for (const file of ['Hook.tsx', 'Share.tsx', 'Card.tsx', 'Remind.tsx', 'End.tsx']) {
    for (const [, name, curve] of read(`src/reels/ads/card/${file}`).matchAll(/const (\w*Out|part|leave) = prog\([^;]*(EASE_MODAL|EASE_SPRING|EASE_FLING)\)/g))
      bad.push(`${file}: exit ${name} uses ${curve} (a fast start reads as a blink: EASE_IN_OUT)`);
  }

  if (bad.length) {
    console.error('✗ ad card:');
    for (const b of bad) console.error('    ' + b);
    failed = true;
  } else {
    console.log(`✓ ${caps.length} captions, no overlaps, ≤ 8 words on screen, poster line on frame 0, voice by 0.5s, the mark by ${(C.HITS.bracketsClose / C.FPS).toFixed(1)}s; ${C.TOTAL_SEC.toFixed(1)}s`);
    console.log(`✓ narrator mirrors every caption; dwell rule holds; the tagline exact and held; ${Object.values(C.HITS).flat().length} hits on 8ths`);
    console.log(`✓ no banned word, plan, price, availability or recipe in the lines, the pile, the card or ${take.frames.length - take.marks.land} captured frames; safe zones hold`);
  }

  // ── the mixes
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
  const paths = { score: 'public/ads/card/score.wav', vo: 'public/ads/card/score-vo.wav', music: 'public/ads/card/score-music.wav' };
  const missing = Object.values(paths).filter((p) => !exists(p));
  if (missing.length) {
    console.error(`✗ missing ${missing.join(', ')}: run node audio/ads/card-score.mjs && node audio/mix-vo.mjs adcard && node audio/mix-vo.mjs adcardMusic`);
    return true;
  }
  const bed = wav(paths.score);
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
  console.log(`  ad bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
  if (clipped) {
    console.error(`✗ the ad's score clips (${clipped} samples)`);
    failed = true;
  }
  for (let i = 1; i < rows.length - 2; i++) {
    const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
    if (dip > 3.5) {
      console.error(`✗ ad bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
      failed = true;
    }
  }
  const mix = wav(paths.vo);
  if (manifest) {
    const gain = exists('out/vo/adcard/mix.json') ? JSON.parse(read('out/vo/adcard/mix.json')).gain : 1;
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
      return { text: line.text, band: powerDb(speechBand(voice, mix.SR)) - powerDb(speechBand(music, mix.SR)) };
    });
    const worst = per.reduce((a, b) => (b.band < a.band ? b : a));
    console.log(`  voice over music in the speech band: min ${worst.band.toFixed(1)}dB ("${worst.text.slice(0, 32)}…")`);
    const masked = per.filter((x) => x.band < 3);
    if (masked.length) {
      for (const x of masked) console.error(`✗ the music masks "${x.text}": ${x.band.toFixed(1)}dB over it in the speech band (min 3dB)`);
      failed = true;
    } else console.log('✓ every ad line sits 3dB or more over the music where speech is heard');
  }
  for (const [label, p] of [['main cut (narrator)', paths.vo], ['A/B cut (no narrator)', paths.music]]) {
    const m = p === paths.vo ? mix : wav(p);
    const I = lufs(m.l, m.r, m.SR);
    const tp = truePeak(m.l, m.r);
    const ok = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (ok ? console.log : console.error)(`${ok ? '✓' : '✗'} the ad's ${label} mix: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
    if (!ok) failed = true;
  }
  return failed;
}
