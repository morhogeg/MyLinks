/**
 * Capture the real app for the reel.
 *
 *   node capture/build-app.mjs     (once per app change: the real app, built)
 *   node capture/shoot.mjs         →  public/reel/app/<take>/NNNN.png + manifest.json
 *
 * Four TAKES, each one continuous use of the app on the capture device
 * (capture/device.mjs), recorded with capture/recorder.mjs: settled states
 * are snapped, the app's own motion is rolled at 30fps on a stepped clock.
 *
 *   save     Home → "+" → Add to Machina → the five-phase pipeline → the new
 *            card landing in the feed
 *   find     a plain-words search landing on the one card it means
 *   ask      a question → the streamed answer → citations from three
 *            platforms → the answer's Graph chip → the graph lighting them
 *   revisit  Revisit → today's Daily Brew → the review deck dealing cards
 *            (not in the pilot reel; kept for the feature clips)
 *   recall   Revisit → "This week in Machina", the weekly recap, opened and
 *            read down to its standout and its question
 *   findClip the FIND feature clip: the feed, then search in your own words,
 *            close matches, a source jump, and the card opened (data
 *            beside the clip, see writeClipTakesData)
 *   askfull  (the ASK feature clip) the feed → Ask → the question → the
 *            answer and its sources → a source opened and closed → the
 *            suggested follow-up → its answer → its Graph chip
 *   adtrip   (the trip ad, rounds 1–3) the trip's saves written in → Ask →
 *            "What should we do in Sardinia?" → the answer and its three
 *            sources → the first source opened
 *   adask    (the Ask ad, round 4) the feed → Ask: a simple question and
 *            its answer → a new chat: a big question, its three sources and
 *            the questions suggested next
 *
 * What the backend would do (finish analysing a card, answer a question) is
 * driven through the capture server and `window.__capture`, so the app
 * reacts to it exactly as it does to the real one.
 *
 * Env: CAPTURE_DPR (default 4: the reel's camera goes up to 3.6 px per point,
 * and a capture must carry at least that to stay crisp), CAPTURE_ONLY=save,ask
 * (a subset of takes; the others keep their frames).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { openDevice } from './device.mjs';
import { Take } from './recorder.mjs';
import { ADASK_TED, ASK, CAPTURE_USER, CARDS, SAVE, SEARCH, SYNTHESIS, TRIP_ASK } from './library.mjs';
import { tripDocs } from './ad-trip.mjs';
import { NOTE_READ, SHOTS_DIR, renderPost, renderShots, shotsCard, sourceCards } from './clip-save.mjs';
import { AD_CARD_ID, DEMO_ESSAY_ID, adCard } from './ad-card.mjs';
import * as AD_TODO from './ad-todo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public', 'reel', 'app');
const DPR = Number(process.env.CAPTURE_DPR ?? 4);
const ONLY = process.env.CAPTURE_ONLY?.split(',');
const UID = CAPTURE_USER.uid;
const linkPath = (id) => `users/${UID}/links/${id}`;

fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(4640);
const dev = await openDevice(server.url, { dpr: DPR });
const { page } = dev;

const visible = (loc) => loc.filter({ visible: true }).first();
const tab = (name) => visible(page.locator(`nav[aria-label=Main] button[aria-label="${name}"]`));

/** A fresh, freshly seeded app on the Home feed. */
async function fresh(prepare) {
  await page.goto(server.url + '/');
  await visible(page.getByText('Read Piranesi')).waitFor({ timeout: 30000 });
  if (prepare) await prepare();
  await page.waitForTimeout(900);
}

/** Wait (in real time) until the page shows `text`. */
const until = (text, timeout = 10000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).catch((e) => {
    throw new Error(`waited ${timeout}ms for "${text}": ${e.message.split('\n')[0]}`);
  });

/**
 * Scrolling, recorded. Tags the scrollable ancestor of the element showing
 * `text` (or the page itself), then moves it in even steps of `step` points,
 * one captured frame per step, so the reel can play a scroll at any speed
 * and on any curve by choosing which step to show.
 */
async function tagScroller(text) {
  await page.evaluate((t) => {
    document.querySelectorAll('[data-capture-scroller]').forEach((e) => e.removeAttribute('data-capture-scroller'));
    let el = [...document.querySelectorAll('body *')].find(
      (e) => e.children.length === 0 && e.textContent?.includes(t) && e.getClientRects().length,
    );
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) break;
      el = el.parentElement;
    }
    const target = !el || el === document.body ? document.scrollingElement : el;
    target.setAttribute('data-capture-scroller', '');
  }, text);
}

/** The scroll offset that puts the bottom of the element showing `text` at
 *  screen y `at` (points), clamped to what the scroller can do. */
const scrollTargetFor = (text, at) =>
  page.evaluate(
    ([t, y]) => {
      const sc = document.querySelector('[data-capture-scroller]');
      const el = [...document.querySelectorAll('body *')].find(
        (e) => e.children.length === 0 && e.textContent?.includes(t) && e.getClientRects().length,
      );
      const r = el.getBoundingClientRect();
      const want = sc.scrollTop + r.bottom - y;
      return Math.max(0, Math.min(want, sc.scrollHeight - sc.clientHeight));
    },
    [text, at],
  );

async function rollScroll(t, to, step, rects) {
  const from = await page.evaluate(() => document.querySelector('[data-capture-scroller]').scrollTop);
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  for (let k = 1; k <= n; k++) {
    await page.evaluate((v) => {
      document.querySelector('[data-capture-scroller]').scrollTo({ top: v, behavior: 'instant' });
    }, from + ((to - from) * k) / n);
    await t.advance();
    await t.snap({ rects });
  }
  return n;
}

/** ISO week id, exactly as web/components/DigestView.tsx computes it. */
const isoWeekId = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

// Element rects the reel's camera aims at, by take. [selector, text filter?]
const R = {
  plus: ['nav[aria-label=Main] button[aria-label="Add to Machina"]'],
  search: ['input[placeholder="Search your saves"]'],
  firstCard: ['main article.surface-card'],
  dialog: ['[role=dialog]'],
  askTab: ['nav[aria-label=Main] button[aria-label="Ask"]'],
  composer: ['textarea'],
  send: ['button[aria-label="Send"]'],
  toast: ['[role=status]', 'Saved to Machina'],
  revisitTab: ['nav[aria-label=Main] button[aria-label="Revisit"]'],
};

const takes = {
  // ─────────────────────────────────────────────────────────── save
  async save() {
    await fresh(async () => {
      // the card this take saves must not exist yet
      await page.evaluate((p) => window.__capture.remove(p), linkPath(SAVE.id));
    });
    const t = new Take(dev, OUT, 'save');
    t.mark('home');
    await t.snap({ rects: { plus: R.plus } });

    // tap + : the dialog's own entrance, frame by frame
    await t.freeze();
    await visible(page.locator(R.plus[0])).click();
    t.mark('dialogOpen');
    await t.roll(10, { rects: { dialog: R.dialog } });
    await t.thaw();

    // "Save anything, from anywhere" (owner, round 7): the dialog's three real
    // ways in, each tapped, recorded at 60fps (the reel lingers on each)
    const MODES = {
      dialog: R.dialog,
      tabLink: ['[role=dialog] button', 'Link'],
      tabImage: ['[role=dialog] button', 'Image'],
      tabNote: ['[role=dialog] button', 'Note'],
    };
    for (const [mark, name] of [['modeImage', 'Image'], ['modeNote', 'Note'], ['modeLink', 'Link']]) {
      await page.waitForTimeout(250);
      await t.freeze();
      await visible(page.locator('[role=dialog]').getByRole('button', { name, exact: true })).click();
      t.mark(mark);
      await t.roll(24, { rects: MODES, step: 1000 / 60 });
      await t.thaw();
    }

    // the link arrives (a paste is instant)
    await visible(page.getByPlaceholder('example.com or https://...')).fill(SAVE.url);
    await page.waitForTimeout(200);
    t.mark('filled');
    await t.snap({ rects: { dialog: R.dialog, save: ['[role=dialog] button', 'Save'] } });

    // Save: the placeholder card is written, the stepper takes over
    await visible(page.getByRole('button', { name: 'Save', exact: true })).click();
    await until('Fetching the link');
    const cardPath = await page.evaluate(
      () =>
        window.__capture
          .list('users/reel-demo/links/')
          .find((p) => window.__capture.get(p)?.status === 'processing') ?? null,
    );
    if (!cardPath) throw new Error('save: no processing card was written');

    // the five phases, each held long enough to see the mark working
    const stages = [null, 'scraping', 'analyzing', 'connecting', 'organizing'];
    const labels = ['Fetching the link', 'Reading the page', 'Writing the summary', 'Searching connections', 'Organizing & tagging'];
    for (let i = 0; i < stages.length; i++) {
      if (stages[i]) {
        await page.evaluate(([p, st]) => window.__capture.merge(p, { processingStage: st }), [cardPath, stages[i]]);
        await page.waitForTimeout(250);
      }
      t.mark(`phase${i}`);
      await t.roll(10, { rects: { dialog: R.dialog } });
      await t.thaw();
      void labels;
    }

    // the backend finishes: the card becomes the real, filed Tail End
    const c = CARDS.find((x) => x.id === SAVE.id);
    await t.freeze();
    await page.evaluate(
      ([p, card]) => {
        const cur = window.__capture.get(p) ?? {};
        const { processingStage, ...rest } = cur;
        void processingStage;
        window.__capture.set(p, { ...rest, ...card });
      },
      [
        cardPath,
        {
          title: c.title,
          summary: c.summary,
          detailedSummary: c.detail ?? c.summary,
          actionableTakeaway: c.takeaway,
          category: c.category,
          tags: c.tags,
          concepts: c.concepts,
          status: 'unread',
          sourceType: c.sourceType,
          sourceName: c.sourceName,
          url: c.url,
          hideThumbnail: true,
          language: 'en',
          collectionIds: ['time'],
          metadata: { originalTitle: c.title, estimatedReadTime: c.readTime },
        },
      ],
    );
    await page.waitForTimeout(250);
    t.mark('done');
    // "Done!" → the 800ms completed frame → close → the card in the feed
    await t.roll(48, { rects: { dialog: R.dialog, toast: R.toast, firstCard: R.firstCard } });
    await t.thaw();
    await page.waitForTimeout(600);
    t.mark('landed');
    await t.snap({ rects: { firstCard: R.firstCard, toast: R.toast } });

    // open it: the card's own detail view, then read down it to the Key
    // Points and the one thing it asks you to do
    const DETAIL = {
      detailTitle: ['h2', 'The Tail End'],
      keyPoints: ['h1,h2,h3,h4', 'Key Points'],
      points: ['ul', 'Counted in visits'],
      takeaway: ['div', 'Call your parents'],
    };
    await t.freeze();
    await visible(page.locator(R.firstCard[0])).click({ position: { x: 120, y: 40 } });
    t.mark('detail');
    // at 60fps: the reel plays this transition slowed, and it must stay smooth
    await t.roll(36, { rects: DETAIL, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(500);
    await t.freeze();
    await tagScroller('Key Points');
    t.mark('detailScroll');
    await rollScroll(t, await scrollTargetFor('Call your parents', 700), 5, DETAIL);
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── find
  async find() {
    await fresh();
    const t = new Take(dev, OUT, 'find');
    t.mark('home');
    await t.snap({ rects: { search: R.search } });

    await t.freeze();
    await visible(page.getByPlaceholder('Search your saves')).click();
    t.mark('focus');
    await t.roll(8, { rects: { search: R.search } });

    // typed at a steady 30 characters a second on the frozen clock, so the
    // search debounce cannot fire mid-word
    t.mark('typing');
    for (const ch of SEARCH.query) {
      await page.keyboard.type(ch);
      await t.advance();
      await t.snap({ rects: { search: R.search } });
    }
    // let the debounce + the request run, then roll the result arriving
    await t.thaw();
    await page.waitForTimeout(700);
    await t.freeze();
    t.mark('result');
    await t.roll(16, { rects: { search: R.search, card: ['main article.surface-card', 'Marcella'] } });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── ask
  async ask() {
    await fresh();
    const t = new Take(dev, OUT, 'ask');
    t.mark('home');
    await t.snap({ rects: { askTab: R.askTab } });

    await t.freeze();
    await tab('Ask').click();
    t.mark('open');
    await t.roll(12, { rects: { composer: R.composer } });
    await t.thaw();

    await visible(page.locator('textarea')).click();
    await page.waitForTimeout(150);
    await t.freeze();
    t.mark('typing');
    for (const ch of ASK.question) {
      await page.keyboard.type(ch);
      await t.advance();
      await t.snap({ rects: { composer: R.composer, send: R.send } });
    }
    await t.thaw();

    // send, and have the first words already on their way so the thinking
    // line is on screen as briefly as the real backend's first token allows
    await page.keyboard.press('Enter');
    for (let k = 0; k < 40 && !server.chatOpen(); k++) await page.waitForTimeout(25);
    await t.freeze();
    t.mark('sent');
    await t.roll(4, { rects: { bubble: ['div', ASK.question] } });

    t.mark('stream');
    let done = false;
    while (!done) {
      done = server.advanceChat(9);
      await page.waitForTimeout(90); // the chunk crosses the (real) network
      await t.advance();
      await t.snap();
    }
    server.finishChat();
    await page.waitForTimeout(400);
    t.mark('sources');
    await t.roll(20, {
      rects: {
        answer: ['div', 'Your saves keep circling'],
        chip1: ['button[title="The Tail End"]'],
        chip2: ['button[title="Inside the mind of a master procrastinator"]'],
        chip3: ['button[title="How to Get Rich (without getting lucky)"]'],
        graphChip: ['button', 'Graph'],
      },
    });

    // the answer's Graph chip: where these three live
    await visible(page.getByText('Graph', { exact: true })).click();
    t.mark('graph');
    // at 60fps (2.5s of the app's own graph opening): the reel plays it
    // slowed, and 30fps frames held twice read as lag (owner, round 5)
    await t.roll(150, { rects: { canvas: ['canvas'], revisitTab: R.revisitTab }, step: 1000 / 60 });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── recall
  async recall() {
    const refs = [...new Set([...SYNTHESIS.themes.flatMap((x) => x.cardIds), SYNTHESIS.standoutCardId])].map((id) => {
      const c = CARDS.find((x) => x.id === id);
      return { id, title: c.title, category: c.category };
    });
    await fresh(async () => {
      await page.evaluate(
        ([uid, syn, todos]) => {
          // the recap is the Revisit tab's lead: no review row above it
          for (const p of window.__capture.list(`users/${uid}/digests/`)) window.__capture.remove(p);
          window.__capture.set(`users/${uid}/syntheses/${syn.weekId}`, syn);
          // the saves that call for an action carry their "Do this" (the app
          // writes one only then); Revisit lists the open ones above the recap
          for (const [id, text] of todos) {
            const p = `users/${uid}/links/${id}`;
            const cur = window.__capture.get(p);
            if (cur) window.__capture.set(p, { ...cur, actionableTakeaway: text });
          }
        },
        [
          UID,
          { ...SYNTHESIS, weekId: isoWeekId(new Date()), cards: refs, createdAt: Date.now() - 3_600_000 },
          CARDS.filter((c) => c.takeaway).map((c) => [c.id, c.takeaway]),
        ],
      );
    });
    const RECAP = {
      recap: ['div[class*="border-accent/25"]'],
      narrative: ['p', 'Five saves this week'],
      theme1: ['section', 'Counting the time'],
      theme2: ['section', 'Somewhere to be slow'],
      standout: ['button', 'Standout'],
      question: ['div[class*="bg-card-hover"]', 'Worth sitting with'],
      todo: ['div[class*="divide-y"]', 'Call your parents'],
      todoFirst: ['div[class*="ps-1.5"]', 'Call your parents'],
      revisitTab: R.revisitTab,
    };
    const t = new Take(dev, OUT, 'recall');
    await t.freeze();
    await tab('Revisit').click();
    t.mark('open');
    await t.roll(10, { rects: RECAP });
    await t.thaw();
    await page.waitForTimeout(400);

    await t.freeze();
    await visible(page.getByText('This week in Machina')).click();
    t.mark('expand');
    await t.roll(32, { rects: RECAP, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(300);

    await t.freeze();
    await tagScroller('Counting the time');
    t.mark('scroll');
    await rollScroll(t, await scrollTargetFor('who would you call', 720), 6, RECAP);
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── revisit
  async revisit() {
    await fresh();
    const t = new Take(dev, OUT, 'revisit');
    await t.freeze();
    await tab('Revisit').click();
    t.mark('open');
    await t.roll(10, { rects: { review: ['button', 'Review 5 cards'], revisitTab: R.revisitTab } });
    await t.thaw();

    await t.freeze();
    await visible(page.getByText('Review 5 cards')).click();
    t.mark('deck');
    await t.roll(14, { rects: { card: ['.surface-card', 'The Most Important Question of Your Life'] } });
    // Keep, Keep, Keep: each is the deck's real fling and the next card settling
    for (let k = 0; k < 3; k++) {
      await t.thaw();
      await page.waitForTimeout(250);
      await t.freeze();
      await page.keyboard.press('ArrowRight');
      t.mark(`fling${k}`);
      await t.roll(16, { rects: { card: ['.surface-card', ['The Most Important Question of Your Life', 'Dieter Rams', 'Steve Jobs'][k]] } });
    }
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── saveclip
  // The SAVE feature clip (clips/save-timeline.mjs): three screenshots of one
  // recipe post picked in the Add dialog's Image tab, saved as ONE card, read
  // in the background (the feed's own "Saving…" card), opened, and read down
  // to its Key Points, tags and Related cards. Rolls at 60fps: the clip plays
  // the app at half speed, like the reel. (capture/clip-save.mjs has the
  // screenshots and the card the backend returns.)
  async saveclip() {
    const shotsDir = path.join(here, '..', 'out', 'capture', 'app', 'out', SHOTS_DIR);
    const files = await renderShots(dev.browser, shotsDir);
    const urls = files.map((f) => `${server.url}/${SHOTS_DIR}/${path.basename(f)}`);
    await fresh();
    const t = new Take(dev, OUT, 'saveclip');
    const F60 = 1000 / 60;
    const D = {
      dialog: R.dialog,
      tabImage: ['[role=dialog] button', 'Image'],
      dropzone: ['[role=dialog] label, [role=dialog] div', 'Tap to add images'],
      hint: ['[role=dialog] p, [role=dialog] div', 'Screens of one post'],
      strip: ['[role=dialog] ol, [role=dialog] ul, [role=dialog] div', 'Screens of one post'],
      save: ['[role=dialog] button', 'Save'],
    };
    t.mark('home');
    await t.snap({ rects: { plus: R.plus } });

    // + : the dialog's own entrance
    await t.freeze();
    await visible(page.locator(R.plus[0])).click();
    t.mark('dialogOpen');
    await t.roll(20, { rects: { dialog: R.dialog }, step: F60 });
    await t.thaw();

    // the Image tab
    await page.waitForTimeout(250);
    await t.freeze();
    await visible(page.locator('[role=dialog]').getByRole('button', { name: 'Image', exact: true })).click();
    t.mark('modeImage');
    await t.roll(24, { rects: D, step: F60 });
    await t.thaw();

    // three screens of one post, picked (the photo picker is native; the
    // dialog shows them the moment they are chosen)
    await page.locator('#image-upload').setInputFiles(files);
    await until('Screens of one post');
    await page.waitForTimeout(600);
    t.mark('picked');
    await t.roll(24, { rects: D, step: F60 });
    await t.thaw();

    // Save: the placeholder card is written; /api/share is held until time
    // is frozen, so the dialog's close is recorded from its first frame
    let held = null;
    await page.route('**/api/share', (route) => {
      held = route;
    });
    await visible(page.getByRole('button', { name: 'Save', exact: true })).click();
    for (let k = 0; k < 200 && !held; k++) await page.waitForTimeout(50);
    if (!held) throw new Error('saveclip: /api/share was never called');
    const cardPath = await page.evaluate(
      (uid) =>
        window.__capture
          .list(`users/${uid}/links/`)
          .find((p) => window.__capture.get(p)?.status === 'processing') ?? null,
      UID,
    );
    if (!cardPath) throw new Error('saveclip: no processing card was written');
    await t.freeze();
    t.mark('saving');
    await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, cardId: cardPath.split('/').pop() }) });
    await page.unroute('**/api/share');
    await t.roll(60, { rects: { dialog: R.dialog, toast: ['[role=status]'], firstCard: R.firstCard }, step: F60 });
    // the feed's own working card while the screenshots are read
    t.mark('reading');
    await t.roll(60, { rects: { toast: ['[role=status]'], firstCard: R.firstCard }, step: F60 });

    // the backend finishes: the placeholder becomes the card
    await page.evaluate(
      ([p, card]) => {
        const cur = window.__capture.get(p) ?? {};
        const { processingStartedAt, ...rest } = cur;
        void processingStartedAt;
        window.__capture.set(p, { ...rest, ...card });
      },
      [cardPath, shotsCard(urls)],
    );
    await page.waitForTimeout(150);
    t.mark('done');
    await t.roll(48, { rects: { toast: ['[role=status]'], firstCard: R.firstCard }, step: F60 });
    await t.thaw();
    await page.waitForTimeout(800);
    t.mark('landed');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // open it, then read down: the screenshots, the gist, the Key Points, the
    // recipe, the "Do this", the tags and the Related cards
    const DETAIL = {
      gallery: ['[aria-label^="Screenshots"]'],
      detailTitle: ['h2', 'Crispy smashed potatoes'],
      keyPoints: ['h1,h2,h3,h4', 'Key Points'],
      points: ['ul', 'Boil first'],
      ingredients: ['ul', 'small waxy potatoes'],
      takeaway: ['div', 'Make them this week'],
      tags: ['div', 'side dish'],
      related: ['h1,h2,h3,h4,div,span', 'Related cards'],
      related1: ['button,a,div', "Marcella Hazan"],
      related2: ['button,a,div', 'Samin Nosrat'],
    };
    await t.freeze();
    await visible(page.locator(R.firstCard[0]).first()).click({ position: { x: 120, y: 40 } });
    t.mark('detail');
    await t.roll(40, { rects: DETAIL, step: F60 });
    await t.thaw();
    await page.waitForTimeout(500);
    await t.freeze();
    await tagScroller('Key Points');
    t.mark('detailScroll');
    await rollScroll(t, await scrollTargetFor('Samin Nosrat', 760), 5, DETAIL);
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── sources
  // The SAVE clip's source tour: a YouTube video, a long-form X Article, an
  // Instagram photo post, an article and a typed note, each arriving at the
  // top of the feed, opened, and read down to what the app made of it (the
  // Key moments with their timestamps, the Key Points, the "Do this"); the
  // note is kept verbatim and summarized on demand ("Summarize with
  // Machina"). The finished cards are written onto the store the way the
  // backend writes them (capture/clip-save.mjs sourceCards). 60fps rolls.
  async sources() {
    const shotsDir = path.join(here, '..', 'out', 'capture', 'app', 'out', SHOTS_DIR);
    await renderPost(dev.browser, shotsDir);
    const postUrl = `${server.url}/${SHOTS_DIR}/post-1.png`;
    await fresh();
    const t = new Take(dev, OUT, 'sources');
    const F60 = 1000 / 60;
    const DETAIL = {
      title: ['h2'],
      moments: ['div', 'Explains that dopamine'],
      moment1: ['li', '2:24'],
      moment2: ['li', '6:44'],
      moment3: ['li', '19:20'],
      moment4: ['li', '26:20'],
      keyPoints: ['h1,h2,h3,h4', 'Key Points'],
      points: ['ul', ['Twenty pages a day', 'Pack for four days', 'Wanting the good things', 'Dopamine is not a pleasure']],
      takeaway: ['div', ['Read twenty pages tonight', 'Lay out four days', 'Name one goal', 'Pick one tech-free zone']],
      photo: ['img[src*="post-1"]'],
      noteBody: ['div,p', 'Marco came by'],
      summarize: ['button', ['Summarize with Machina', 'Reading your text']],
      read: ['div', 'beam checks out'],
      readPoints: ['ul', 'Cabinets and counters'],
      tags: ['div', ['screen time', 'reading', 'carry-on', 'purpose', 'renovation']],
    };
    t.mark('home');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // where each card's read-down stops: the bottom of this text at y (pt)
    const STOP = {
      youtube: ['Suggests turning off color', 720],
      x: ['Write three lines', 740],
      instagram: ['The caption adds', 760],
      article: ['Name one goal', 760],
      note: ['Summarize with Machina', 740],
    };
    for (const { id, doc } of sourceCards(postUrl)) {
      const key = id.replace('src-', '');
      // it arrives at the top of the feed
      await t.freeze();
      await page.evaluate(([p, d]) => window.__capture.set(p, { ...d, createdAt: Date.now() }), [linkPath(id), doc]);
      t.mark(`${key}Land`);
      await t.roll(36, { rects: { firstCard: R.firstCard }, step: F60 });
      await t.thaw();
      await page.waitForTimeout(600);
      t.mark(`${key}Landed`);
      await t.snap({ rects: { firstCard: R.firstCard } });

      // opened
      await t.freeze();
      await visible(page.locator(R.firstCard[0]).first()).click({ position: { x: 120, y: 40 } });
      t.mark(`${key}Open`);
      await t.roll(40, { rects: DETAIL, step: F60 });
      await t.thaw();
      await page.waitForTimeout(500);

      // read down to what the app made of it
      await t.freeze();
      // (the scroller is found from text only the open card shows: its title
      // is also on the feed card behind it, which would scroll the feed)
      const [txt, y] = STOP[key];
      await tagScroller(txt);
      t.mark(`${key}Scroll`);
      await rollScroll(t, await scrollTargetFor(txt, y), 4, DETAIL);
      await t.snap({ rects: DETAIL });
      await t.thaw();

      if (key === 'note') {
        // "Summarize with Machina": the words stay; the read is asked for
        let held = null;
        await page.route('**/api/analyze', (route) => {
          held = route;
        });
        await t.freeze();
        await visible(page.getByRole('button', { name: /Summarize with Machina/ })).click();
        t.mark('noteTap');
        await t.roll(30, { rects: DETAIL, step: F60 });
        await t.thaw();
        for (let k = 0; k < 200 && !held; k++) await page.waitForTimeout(50);
        if (!held) throw new Error('sources: /api/analyze was never called');
        await t.freeze();
        await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, link: NOTE_READ }) });
        await page.unroute('**/api/analyze');
        t.mark('noteRead');
        await t.roll(48, { rects: DETAIL, step: F60 });
        await t.thaw();
        await page.waitForTimeout(500);
        await t.freeze();
        await tagScroller('Earliest start');
        t.mark('noteReadScroll');
        await rollScroll(t, await scrollTargetFor('Earliest start', 760), 4, DETAIL);
        await t.snap({ rects: DETAIL });
        await t.thaw();
      }

      // back to the feed for the next one
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);
    }
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── findClip
  // The FIND feature clip (clips/find-timeline.mjs), one continuous use of
  // Home and its search: the feed scrolled (too many saves to scan), then
  // the search's four sides, each on its own query from SEARCH.clip:
  //  1. your own words: a card that shares no word with the query (meaning);
  //  2. close matches: a query with a word no card has still gets the card
  //     that has the others, under "Close matches", never a dead end;
  //  3. a source, typed: the Sources row offers it, one tap shows every
  //     save from there;
  //  4. the first of them opened: its summary, right there.
  // Queries are cleared a word at a time, as a held delete key does (the
  // app's × moves focus in this browser and would need a second tap). App
  // motion the clip plays at K = 2 is rolled at 60fps. Frames go under
  // clips/find/, data beside the clip (writeClipTakesData), not into the
  // reel's takes.json.
  async findClip() {
    await fresh();
    const Q = SEARCH.clip;
    const t = new Take(dev, OUT, 'clips/find/search');
    const RECTS = {
      search: R.search,
      firstCard: R.firstCard,
      marcella: ['main article.surface-card', 'Marcella'],
      goloritze: ['main article.surface-card', 'Goloritz'],
      closeMatches: ['main span', 'Close matches'],
      sourceChip: ['main div[class*="mb-5"] button', Q.source.source],
      sourcesRow: ['main div[class*="mb-5"]', 'Sources'],
    };
    t.mark('home');
    await t.snap({ rects: RECTS });

    // the hook: the feed, scrolled at speed (every save, too many to scan)
    await t.freeze();
    await tagScroller('Read Piranesi');
    t.mark('scroll');
    // (5pt steps: the clip eases this flick, and at its slow ends coarser
    // steps alternated a hop and a hold; the camera cannot take up the
    // rounding, the fixed chrome is in frame)
    await rollScroll(t, 2700, 5, RECTS);
    await page.evaluate(() => document.querySelector('[data-capture-scroller]').scrollTo({ top: 0, behavior: 'instant' }));
    await t.advance();
    t.mark('top');
    await t.snap({ rects: RECTS });

    await visible(page.getByPlaceholder('Search your saves')).click();
    t.mark('focus');
    await t.roll(16, { rects: RECTS, step: 1000 / 60 });

    const type = async (mark, query) => {
      t.mark(mark);
      for (const ch of query) {
        await page.keyboard.type(ch);
        await t.advance();
        await t.snap({ rects: RECTS });
      }
    };
    /** step the frozen clock (debounce, request) until `ready` holds */
    const until = async (what, ready, arg) => {
      for (let k = 0; !(await page.evaluate(ready, arg)); k++) {
        if (k > 300) throw new Error(`findClip: never ${what}`);
        await page.waitForTimeout(20);
        await t.advance(1000 / 60);
      }
    };
    const clear = async (mark) => {
      t.mark(mark);
      while (await page.evaluate(() => document.activeElement?.value?.length ?? 0)) {
        await page.keyboard.press('Control+Backspace');
        await t.advance();
        await t.snap({ rects: RECTS });
      }
    };

    // 1. your own words
    await type('typing1', Q.words.query);
    await until('showed the meaning card', () =>
      [...document.querySelectorAll('main article.surface-card h3')].some((h) => h.textContent.includes('Marcella')),
    );
    t.mark('result1');
    await t.roll(24, { rects: RECTS, step: 1000 / 60 });

    // 2. close matches (the literal tiers answer as it types; no request)
    await clear('clear1');
    await type('typing2', Q.close.query);
    t.mark('result2');
    await t.roll(24, { rects: RECTS, step: 1000 / 60 });

    // 3. a source, typed, then tapped: the Sources row's own entrance, rolled
    await clear('clear2');
    await type('typing3', Q.source.query);
    await until('offered the source', (name) => [...document.querySelectorAll('main div[class*="mb-5"] button')].some((b) => b.textContent.includes(name)), Q.source.source);
    t.mark('sources');
    await t.roll(24, { rects: RECTS, step: 1000 / 60 });
    await visible(page.locator('main div[class*="mb-5"] button', { hasText: Q.source.source })).click();
    t.mark('filtered');
    await t.roll(36, { rects: RECTS, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(400);

    // 4. the first of them opened: the app's own open transition
    const DETAIL = { ...RECTS, detailTitle: ['h2', ''] };
    await t.freeze();
    await visible(page.locator(R.firstCard[0])).click({ position: { x: 120, y: 40 } });
    t.mark('detail');
    await t.roll(40, { rects: DETAIL, step: 1000 / 60 });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── askfull
  // The ASK feature clip (clips/ask-timeline.mjs), in ONE continuous take so
  // the clip never swaps takes:
  //   hook     the Home feed scrolled through (many saves, the one you need
  //            somewhere in there), 60fps steps
  //   open     the Ask tab: the screen's fade and its mark's own launch, 60fps
  //   typing   the question, typed
  //   stream   the answer, a few words a frame; `sources` its three sources
  //   card     the first source tapped: the card it cites opens (60fps);
  //   close    and is closed again (60fps)
  //   stream2  the answer's own suggested follow-up tapped, the new answer;
  //            `sources2` its sources
  //   graph    that answer's Graph chip: the cited saves lit in the graph (60fps)
  // The thinking line the app shows between a question and its first words
  // ("Searching your …", banned wording for reels) is never recorded: the
  // first words are released before the first frame after each send, so no
  // frame of this take can show it (verify checks).
  async askfull() {
    await fresh();
    const t = new Take(dev, OUT, 'askfull');
    const ASKING = {
      composer: R.composer,
      send: R.send,
      mark: ['[aria-label="Machina is ready"]'],
      heading: ['h2', 'What do you want to recall?'],
      promise: ['p', 'Answers come only from'],
    };
    const ANSWER = {
      lead: ['p', 'Your saves keep circling'],
      body: ['p', 'The Tail End counts'],
      chip1: ['button[title="The Tail End"]'],
      chip2: ['button[title="Inside the mind of a master procrastinator"]'],
      chip3: ['button[title="How to Get Rich (without getting lucky)"]'],
      followUp: ['button', 'What else did I save on time?'],
    };
    const CARD = {
      title: ['h2', 'The Tail End'],
      summary: ['p', 'Counted in visits instead of years'],
      close: ['button[aria-label="Close"]'],
    };
    const ANSWER2 = {
      lead2: ['p', 'Two more saves on time'],
      chipA: ['button[title="Four Thousand Weeks"]'],
      chipB: ['button[title="Perfect Days"]'],
      followUp: ['button', 'What else did I save on time?'],
    };
    // characters released per captured frame (whole words; ~1.5 words)
    const STREAM = 8;
    // (follow: keep the conversation bottom-anchored every frame, as the app's
    // own auto-scroll does in real time; it is a smooth scroll the stepped
    // clock would otherwise freeze)
    const toBottom = () =>
      page.evaluate(() => {
        const sc = document.querySelector('[data-capture-scroller]');
        sc.scrollTo({ top: sc.scrollHeight, behavior: 'instant' });
      });
    const stream = async (first, rects, follow = false) => {
      let done = server.advanceChat(STREAM);
      await until(first);
      await page.waitForTimeout(90);
      if (follow) await toBottom();
      // (caret hidden: the composer keeps focus after send, and its caret
      // blinks on the browser's real clock, so across these frames it was on
      // and off by turns, measured; the reel's round-15 rule for rolls)
      await t.freeze();
      await t.snap({ rects, caret: 'hide' });
      while (!done) {
        done = server.advanceChat(STREAM);
        await page.waitForTimeout(90);
        await t.advance();
        if (follow) await toBottom();
        await t.snap({ rects, caret: 'hide' });
      }
      server.finishChat();
      await page.waitForTimeout(400);
    };

    // the hook: the feed, scrolled through at an even pace
    await t.freeze();
    await tagScroller('Read Piranesi');
    t.mark('hook');
    const feedEnd = await page.evaluate(() => {
      const sc = document.querySelector('[data-capture-scroller]');
      return Math.min(2600, sc.scrollHeight - sc.clientHeight);
    });
    await rollScroll(t, feedEnd, 12, {});
    await t.thaw();
    // (unrecorded: back to the top, where the tab bar the scroll hid returns;
    // the clip cuts from the feed to Ask opening)
    await page.evaluate(() => document.querySelector('[data-capture-scroller]').scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(900);

    // Ask opens: the screen fades in and its mark plays the app's own launch
    await t.freeze();
    await tab('Ask').click();
    t.mark('open');
    await t.roll(90, { rects: ASKING, step: 1000 / 60 });
    await t.thaw();

    // the question, typed at 30 characters a second on the frozen clock
    await visible(page.locator('textarea')).click();
    await page.waitForTimeout(150);
    await t.freeze();
    t.mark('typing');
    for (const ch of ASK.question) {
      await page.keyboard.type(ch);
      await t.advance();
      await t.snap({ rects: ASKING });
    }
    await t.thaw();

    // send: the first words are on screen before the first frame is taken
    await page.keyboard.press('Enter');
    for (let k = 0; k < 40 && !server.chatOpen(); k++) await page.waitForTimeout(25);
    t.mark('stream');
    await stream('Your saves', ANSWER);
    t.mark('sources');
    await t.roll(24, { rects: ANSWER });
    await t.thaw();
    await page.waitForTimeout(600);

    // the first source, tapped: the card it cites opens, then is closed
    await t.freeze();
    await visible(page.locator(ANSWER.chip1[0])).click();
    t.mark('card');
    await t.roll(48, { rects: CARD, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(500);
    await t.freeze();
    await visible(page.locator(CARD.close[0])).click();
    t.mark('close');
    await t.roll(36, { rects: ANSWER, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(500);

    // the answer's own suggested follow-up, tapped: a second answer
    await visible(page.getByRole('button', { name: 'What else did I save on time?' })).click();
    for (let k = 0; k < 200 && !server.chatOpen(); k++) await page.waitForTimeout(25);
    if (!server.chatOpen()) throw new Error(`the follow-up never reached /api/chat: ${JSON.stringify(server.log.slice(-4))}`);
    await tagScroller('Your saves keep circling');
    t.mark('stream2');
    await stream('Two more', ANSWER2, true);
    t.mark('sources2');
    // (two answers, two Graph chips: tag the second one's)
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('button[title="See these cards in the graph"]')];
      all[all.length - 1]?.setAttribute('data-capture', 'graph2');
    });
    const ANSWER2G = { ...ANSWER2, graph2: ['[data-capture="graph2"]'] };
    await t.roll(24, { rects: ANSWER2G });
    // the sources arrived below the fold: scroll them into view (4pt steps)
    t.mark('scroll2');
    await rollScroll(t, await page.evaluate(() => {
      const sc = document.querySelector('[data-capture-scroller]');
      return sc.scrollHeight - sc.clientHeight;
    }), 4, ANSWER2G);
    await t.thaw();
    await page.waitForTimeout(600);

    // its Graph chip: where these saves sit among the rest
    await t.freeze();
    await visible(page.locator('[data-capture="graph2"]')).click();
    t.mark('graph');
    await t.roll(150, { rects: { canvas: ['canvas'] }, step: 1000 / 60 });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────── revisitClip
  // The REVISIT feature clip (clips/revisit-timeline.mjs). The same week as
  // `recall`, seeded the same way, recorded for a slower read: the Revisit
  // tab settled on its "Do this" list, the recap opened (60fps), read down in
  // 3pt steps (half the camera's rounding correction of the reel's 6pt), and
  // then the recap's Standout TAPPED: the save it points to opens, the app's
  // own transition at 60fps. `recall` itself is untouched (the reel's take).
  async revisitClip() {
    const refs = [...new Set([...SYNTHESIS.themes.flatMap((x) => x.cardIds), SYNTHESIS.standoutCardId])].map((id) => {
      const c = CARDS.find((x) => x.id === id);
      return { id, title: c.title, category: c.category };
    });
    await fresh(async () => {
      await page.evaluate(
        ([uid, syn, todos, due]) => {
          for (const p of window.__capture.list(`users/${uid}/digests/`)) window.__capture.remove(p);
          window.__capture.set(`users/${uid}/syntheses/${syn.weekId}`, syn);
          for (const [id, text] of todos) {
            const p = `users/${uid}/links/${id}`;
            const cur = window.__capture.get(p);
            if (cur) window.__capture.set(p, { ...cur, actionableTakeaway: text });
          }
          // (clip round 3) a reminder the user set on Four Thousand Weeks has
          // come due: Revisit lists it first, under "Due now" (the app's own
          // Smart review, the Remind me sheet's default)
          const d = `users/${uid}/links/${due}`;
          const cur = window.__capture.get(d);
          if (cur)
            window.__capture.set(d, {
              ...cur,
              reminderStatus: 'pending',
              reminderProfile: 'smart',
              reminderCount: 1,
              nextReminderAt: Date.now() - 1_800_000,
            });
        },
        [
          UID,
          { ...SYNTHESIS, weekId: isoWeekId(new Date()), cards: refs, createdAt: Date.now() - 3_600_000 },
          CARDS.filter((c) => c.takeaway).map((c) => [c.id, c.takeaway]),
          'fourthousand',
        ],
      );
    });
    const RECAP = {
      recap: ['div[class*="border-accent/25"]'],
      narrative: ['p', 'Five saves this week'],
      recapTitle: ['div', SYNTHESIS.title],
      theme1: ['section', 'Counting the time'],
      theme2: ['section', 'Somewhere to be slow'],
      theme1Link: ['section button', 'Four Thousand Weeks'],
      standout: ['button', 'Standout'],
      question: ['div[class*="bg-card-hover"]', 'Worth sitting with'],
      todo: ['div[class*="divide-y"]', 'Call your parents'],
      todoFirst: ['div[class*="ps-1.5"]', 'Call your parents'],
      todoHeader: ['button', 'Do this'],
      due: ['button', 'Four Thousand Weeks'],
      dueRow: ['div[class*="rounded-2xl"][class*="border-border-subtle"]', 'Four Thousand Weeks'],
      doneToast: ['[role=status]', 'Marked as done'],
      dueHeader: ['button', 'Due now'],
      todoLast: ['div[class*="ps-1.5"]', 'Tomorrow morning'],
      revisitTab: R.revisitTab,
    };
    const CARD = {
      dialog: R.dialog,
      detailTitle: ['h2', 'The Tail End'],
      back: ['button[aria-label="Back to Revisit"]'],
    };
    const t = new Take(dev, OUT, 'revisitClip');
    // the Revisit tab, settled (the clip opens on it; no tab switch in shot)
    await tab('Revisit').click();
    await page.waitForTimeout(700);
    t.mark('tab');
    await t.snap({ rects: RECAP });

    // (clip round 5, owner: "show the usefulness") the due save's bell: its
    // reminder's own sheet, Smart review (a day, a week, a month: "1 of 3"),
    // then closed with its X (in frame, where Cancel is not)
    const SHEET = {
      sheet: ['[role=dialog]'],
      current: ['[role=dialog] div[class*="bg-accent/10"]'],
      smart: ['[role=dialog] button[role=radio]', 'Smart review'],
      close: ['[role=dialog] button[aria-label="Close"]'],
      bell: ['button[aria-label^="Change the reminder"]'],
    };
    await t.freeze();
    await visible(page.locator('button[aria-label^="Change the reminder"]')).click();
    t.mark('bell');
    await t.roll(40, { rects: SHEET, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(600);
    t.mark('sheet');
    await t.snap({ rects: SHEET });
    await t.freeze();
    await visible(page.locator('[role=dialog] button[aria-label="Close"]')).click();
    t.mark('sheetClose');
    await t.roll(30, { rects: SHEET, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(700);

    // …and the save itself, opened: it comes back as its point (the summary,
    // the key points), then back to Revisit
    const DUE = {
      dialog: R.dialog,
      dueTitle: ['h2', 'Four Thousand Weeks'],
      keyPoints: ['h2, h3, h4, strong, p', 'Key Points'],
      back: ['button[aria-label="Back to Revisit"]'],
      due: ['button', 'Four Thousand Weeks'],
    };
    await t.freeze();
    await visible(page.locator('button', { hasText: 'Four Thousand Weeks' })).click();
    t.mark('open');
    await t.roll(40, { rects: DUE, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(600);
    t.mark('opened');
    await t.snap({ rects: DUE });
    await t.freeze();
    await visible(page.locator('button[aria-label="Back to Revisit"]')).click();
    t.mark('back');
    await t.roll(40, { rects: { ...DUE, ...RECAP }, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(700);
    t.mark('tab2');
    await t.snap({ rects: RECAP });

    // (clip round 3) the V60 step, ticked off: the app's own "Marked as done"
    // (the row leaves the list, the step stays on its card)
    await t.freeze();
    await visible(page.locator('div[class*="ps-1.5"]', { hasText: 'Tomorrow morning' }).getByRole('button', { name: 'Mark as done' })).click();
    t.mark('tick');
    await t.roll(40, { rects: RECAP, step: 1000 / 60 });
    await t.thaw();
    // (the toast has gone before the recap is opened)
    await page.waitForTimeout(6000);
    t.mark('ticked');
    await t.snap({ rects: RECAP });

    await t.freeze();
    await visible(page.getByText('This week in Machina')).click();
    t.mark('expand');
    await t.roll(36, { rects: RECAP, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(300);

    await t.freeze();
    await tagScroller('Counting the time');
    t.mark('scroll');
    await rollScroll(t, await scrollTargetFor('who would you call', 720), 3, RECAP);
    await t.thaw();
    await page.waitForTimeout(300);

    // the Standout, tapped: the save it names opens over Revisit
    await t.freeze();
    await visible(page.locator('button', { hasText: 'Standout' })).click();
    t.mark('card');
    await t.roll(40, { rects: CARD, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(600);
    t.mark('cardSettled');
    await t.snap({ rects: CARD });
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── adcard
  // Meta ad 1, "What one save becomes" (round 5: an article, not a video):
  // Mark Manson's essay (capture/ad-card.mjs) arrives at the top of the feed
  // as a fresh share, is opened, and is read down in fine steps: the gist,
  // the Key Points, the Related cards; then "See in graph"; back on the card,
  // its bell, "Remind me", Save; the reminder coming due in the feed. 60fps rolls.
  async adcard() {
    // the demo's copy of the essay goes: the share is the only one
    await fresh(() => page.evaluate((p) => window.__capture.remove(p), linkPath(DEMO_ESSAY_ID)));
    const t = new Take(dev, OUT, 'adcard');
    const F60 = 1000 / 60;
    const DETAIL = {
      title: ['h2'],
      gist: ['p,div', 'Everybody wants the rewards'],
      keyPoints: ['h1,h2,h3,h4', 'Key Points'],
      points: ['ul', 'Wanting the good things'],
      takeaway: ['div', 'Name one goal'],
      relatedHead: ['h3', 'Related cards'],
      related1: ['div.group', 'Choosing the game you are willing'],
      related2: ['div.group', 'Do what you love'],
      related3: ['div.group', 'Finding the cause worth'],
      seeGraph: ['button', 'See in graph'],
    };
    t.mark('home');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // it arrives at the top of the feed
    await t.freeze();
    await page.evaluate(([p, d]) => window.__capture.set(p, { ...d, createdAt: Date.now() }), [linkPath(AD_CARD_ID), adCard()]);
    t.mark('land');
    await t.roll(36, { rects: { firstCard: R.firstCard }, step: F60 });
    await t.thaw();
    await page.waitForTimeout(600);
    t.mark('landed');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // opened
    await t.freeze();
    await visible(page.locator(R.firstCard[0]).first()).click({ position: { x: 120, y: 40 } });
    t.mark('open');
    await t.roll(48, { rects: DETAIL, step: F60 });
    await t.thaw();
    await page.waitForTimeout(500);

    // read all the way down, in fine steps (the ad plays parts of this at
    // its own pace): the last Related card's reason ends at 800pt
    await t.freeze();
    await tagScroller('Wanting the good things');
    t.mark('scroll');
    await rollScroll(t, await scrollTargetFor('Finding the cause worth', 800), 3, DETAIL);
    await t.snap({ rects: DETAIL });
    await t.thaw();

    // "See in graph": the same ties as a map, this card in focus (the
    // app's own graph opening, 2.5s at 60fps, as the reel's take records it)
    await t.freeze();
    await visible(page.getByRole('button', { name: 'See this card in the graph' })).click();
    t.mark('graph');
    await t.roll(150, { rects: { canvas: ['canvas'] }, step: F60 });
    await t.thaw();

    // back on the card: its bell, "Remind me", Smart review, Save (the app's
    // own sheet over its own scrim; the ad lifts the sheet off its screen)
    const REMIND = {
      bell: ['button[aria-label="Set reminder"]'],
      sheet: ['[role=dialog][aria-label="Set reminder"]'],
      smart: ['button,label,div[role=radio]', 'Smart review'],
      save: ['button', 'Save'],
      toast: ['li[data-sonner-toast],[role=status]', 'Reminder set'],
    };
    await visible(page.getByText('Back to card')).click();
    await page.waitForTimeout(900);
    // the card from its top, the header's bell in reach
    await page.evaluate(() => document.querySelector('[data-capture-scroller]')?.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    t.mark('back');
    await t.snap({ rects: { ...DETAIL, ...REMIND } });
    await t.freeze();
    await visible(page.locator(REMIND.bell[0])).click();
    t.mark('remind');
    await t.roll(40, { rects: REMIND, step: F60 });
    await t.thaw();
    await page.waitForTimeout(500);
    await t.freeze();
    await visible(page.getByText('Smart review', { exact: true })).click();
    t.mark('smart');
    await t.roll(16, { rects: REMIND, step: F60 });
    await t.thaw();
    await page.waitForTimeout(300);
    await t.freeze();
    await visible(page.getByRole('dialog', { name: 'Set reminder' }).getByRole('button', { name: 'Save', exact: true })).click();
    t.mark('set');
    await t.roll(60, { rects: REMIND, step: F60 });
    await t.thaw();
    await page.waitForTimeout(4500); // the toast has gone

    // tomorrow, 9:00: the backend flags the reminder due (reminder_service),
    // and the feed's own "Reminders due" strip carries it (Feed.tsx)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    const DUE = { strip: ['div.rounded-2xl', 'Reminders due'], dueRow: ['button', 'The Most Important Question'], firstCard: R.firstCard };
    t.mark('feed');
    await t.snap({ rects: DUE });
    await t.freeze();
    await page.evaluate((p) => window.__capture.merge(p, { reminderDue: true, reminderDueAt: Date.now() }), linkPath(AD_CARD_ID));
    t.mark('due');
    await t.roll(40, { rects: DUE, step: F60 });
    await t.thaw();
    await page.waitForTimeout(600);
    t.mark('dueHeld');
    await t.snap({ rects: DUE });
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── adtrip
  // The trip ad (ads/trip-timeline.mjs), one continuous take:
  //   open     the Ask tab: the screen's fade and its mark's own launch,
  //            then its promise, settled (60fps)
  //   typing   "What should we do in Sardinia?", a character a frame
  //   stream   the answer, a few words a frame; `sources` its three sources
  //   card     the first source (Cala Goloritzé) tapped: its card opens (60fps)
  // The trip's saves are written onto the store first, as the backend writes
  // finished cards (capture/ad-trip.mjs), so Ask's promise counts them. As in
  // askfull, the thinking line is never recorded (verify checks).
  async adtrip() {
    await fresh(async () => {
      const docs = tripDocs(Date.now());
      await page.evaluate((d) => d.forEach(([p, v]) => window.__capture.set(p, v)), docs);
    });
    const t = new Take(dev, OUT, 'adtrip');
    const ASKING = {
      composer: R.composer,
      send: R.send,
      mark: ['[aria-label="Machina is ready"]'],
      heading: ['h2', 'What do you want to recall?'],
      promise: ['p', 'Answers come only from'],
    };
    const ANSWER = {
      question: ['p', TRIP_ASK.question],
      lead: ['p', 'Three of your saves'],
      body: ['p', 'Cala Goloritzé, Sardinia: the trail'],
      chip1: ['button[title="Cala Goloritzé, Sardinia"]'],
      chip2: ['button[title="A boat day on the Gulf of Orosei"]'],
      chip3: ['button[title="Dana\'s Sardinia tips"]'],
    };
    const CARD = {
      title: ['h2', 'Cala Goloritzé, Sardinia'],
      summary: ['p', 'A white-pebble cove'],
      close: ['button[aria-label="Close"]'],
    };
    // characters released per captured frame (whole words)
    const STREAM = 10;

    // Ask opens: the screen fades in, its mark plays the app's own launch and
    // settles under its promise
    await t.freeze();
    await tab('Ask').click();
    t.mark('open');
    await t.roll(120, { rects: ASKING, step: 1000 / 60 });
    await t.thaw();

    // the question, a character per frame on the frozen clock
    await visible(page.locator('textarea')).click();
    await page.waitForTimeout(150);
    await t.freeze();
    t.mark('typing');
    for (const ch of TRIP_ASK.question) {
      await page.keyboard.type(ch);
      await t.advance();
      // (a keystroke restarts the caret's blink: on in every typed frame)
      await t.snap({ rects: ASKING });
    }
    await t.thaw();

    // send: the first words are on screen before the first frame is taken
    await page.keyboard.press('Enter');
    for (let k = 0; k < 40 && !server.chatOpen(); k++) await page.waitForTimeout(25);
    if (!server.chatOpen()) throw new Error(`the question never reached /api/chat: ${JSON.stringify(server.log.slice(-4))}`);
    t.mark('stream');
    let done = server.advanceChat(STREAM);
    await until('Three of your');
    await page.waitForTimeout(90);
    await t.freeze();
    await t.snap({ rects: ANSWER, caret: 'hide' });
    while (!done) {
      done = server.advanceChat(STREAM);
      await page.waitForTimeout(90);
      await t.advance();
      await t.snap({ rects: ANSWER, caret: 'hide' });
    }
    server.finishChat();
    await page.waitForTimeout(400);
    t.mark('sources');
    await t.roll(24, { rects: ANSWER, caret: 'hide' });
    await t.thaw();
    await page.waitForTimeout(600);

    // the first source, tapped: the card it cites opens
    await t.freeze();
    await visible(page.locator(ANSWER.chip1[0])).click();
    t.mark('card');
    await t.roll(60, { rects: CARD, step: 1000 / 60 });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── adask
  // The Ask ad, round 4 (ads/trip-timeline.mjs), one continuous take:
  //   feed     the Home feed scrolled through, 12pt steps ("…hundreds of saves")
  //   typing1  a simple question, a character a frame, in a fresh chat
  //   stream1  its answer, from one save; `sources1` its source
  //   typing2  "+ New", then the big question, a character a frame
  //   stream2  its answer, from three saves; `sources2` its sources and the
  //            questions the app suggests next
  // The trip's saves are written in as in adtrip (the hook's Photos pile shows
  // one). As in askfull, the thinking line is never recorded (verify checks).
  async adask() {
    await fresh(async () => {
      const docs = tripDocs(Date.now());
      await page.evaluate((d) => d.forEach(([p, v]) => window.__capture.set(p, v)), docs);
    });
    const t = new Take(dev, OUT, 'adask');
    const ASKING = { composer: R.composer, send: R.send, promise: ['p', 'Answers come only from'] };
    const ANSWER1 = {
      question: ['p', ADASK_TED.question],
      ans: ['p', 'Inside the mind of a master procrastinator:'],
      chip: ['button[title="Inside the mind of a master procrastinator"]'],
    };
    const ANSWER2 = {
      question: ['p', ASK.question],
      lead: ['p', 'Your saves keep circling'],
      body: ['p', 'The Tail End counts'],
      chip1: ['button[title="The Tail End"]'],
      chip2: ['button[title="Inside the mind of a master procrastinator"]'],
      chip3: ['button[title="How to Get Rich (without getting lucky)"]'],
      next1: ['button', 'Compare the Time saves'],
      next2: ['button', 'What else did I save on time?'],
    };
    const STREAM = 10;
    const stream = async (first, rects) => {
      let done = server.advanceChat(STREAM);
      await until(first);
      await page.waitForTimeout(90);
      await t.freeze();
      await t.snap({ rects, caret: 'hide' });
      while (!done) {
        done = server.advanceChat(STREAM);
        await page.waitForTimeout(90);
        await t.advance();
        await t.snap({ rects, caret: 'hide' });
      }
      server.finishChat();
      await page.waitForTimeout(400);
    };
    const ask = async (question, rects, first, n) => {
      await visible(page.locator('textarea')).click();
      await page.waitForTimeout(150);
      await t.freeze();
      t.mark(`typing${n}`);
      for (const ch of question) {
        await page.keyboard.type(ch);
        await t.advance();
        await t.snap({ rects: ASKING });
      }
      await t.thaw();
      await page.keyboard.press('Enter');
      for (let k = 0; k < 40 && !server.chatOpen(); k++) await page.waitForTimeout(25);
      if (!server.chatOpen()) throw new Error(`"${question}" never reached /api/chat`);
      t.mark(`stream${n}`);
      await stream(first, rects);
      t.mark(`sources${n}`);
      await t.roll(24, { rects, caret: 'hide' });
      await t.thaw();
      await page.waitForTimeout(500);
    };

    // the feed, scrolled through at an even pace
    await t.freeze();
    await tagScroller('Read Piranesi');
    t.mark('feed');
    const feedEnd = await page.evaluate(() => {
      const sc = document.querySelector('[data-capture-scroller]');
      return Math.min(2600, sc.scrollHeight - sc.clientHeight);
    });
    await rollScroll(t, feedEnd, 12, {});
    await t.thaw();
    await page.evaluate(() => document.querySelector('[data-capture-scroller]').scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(900);

    // Ask, a fresh chat: the simple question
    await tab('Ask').click();
    await until('What do you want to recall?');
    await page.waitForTimeout(1200);
    await ask(ADASK_TED.question, ANSWER1, 'Inside the', 1);

    // "+ New", then the big question
    await visible(page.getByRole('button', { name: 'New', exact: true })).click();
    await until('What do you want to recall?');
    await page.waitForTimeout(1200);
    await ask(ASK.question, ANSWER2, 'Your saves', 2);

    // its Graph chip: the saves it connected, lit among the rest (round 5,
    // owner: show the graph on "themes and connections"). The chip is tagged
    // and its box recorded on one settled frame, then tapped; the graph view
    // draws itself over its first frames (60fps)
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('button[title="See these cards in the graph"]')];
      all[all.length - 1]?.setAttribute('data-capture', 'graph2');
    });
    await t.freeze();
    t.mark('graphChip');
    await t.snap({ rects: { ...ANSWER2, graph2: ['[data-capture="graph2"]'] }, caret: 'hide' });
    await visible(page.locator('[data-capture="graph2"]')).click();
    t.mark('graph');
    await t.roll(150, { rects: { canvas: ['canvas'] }, step: 1000 / 60 });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── adTodo
  // Meta ad 3 (clips/ad-todo-timeline.mjs), round 5: "Share anything to
  // Machina. From any app. Even screenshots. Analyzed, summarized, and linked
  // to related saves." Four saves from four places land at the top of the
  // feed (a YouTube video, an Instagram post, an article, a screenshot:
  // capture/ad-todo.mjs); the feed is glided down, every card summarized;
  // then the Graph view lays itself out, the saves linked. Rolls at 60fps. No
  // recipe, money or workout card is in the store, and no Pro surface is
  // seeded.
  async adTodo() {
    const shotsDir = path.join(here, '..', 'out', 'capture', 'app', 'out', AD_TODO.SHOTS_DIR);
    await AD_TODO.renderPost(dev.browser, shotsDir);
    const postUrl = `${server.url}/${AD_TODO.SHOTS_DIR}/post-1.png`;
    const sources = AD_TODO.sourceCards(postUrl);
    await fresh(async () => {
      await page.evaluate(
        ([uid, hidden, hiddenCols]) => {
          for (const p of window.__capture.list(`users/${uid}/digests/`)) window.__capture.remove(p);
          for (const p of window.__capture.list(`users/${uid}/syntheses/`)) window.__capture.remove(p);
          for (const id of hidden) window.__capture.remove(`users/${uid}/links/${id}`);
          for (const id of hiddenCols) window.__capture.remove(`users/${uid}/collections/${id}`);
          // (the hidden cards leave no dangling links behind)
          for (const p of window.__capture.list(`users/${uid}/links/`)) {
            const cur = window.__capture.get(p);
            if (cur?.relatedLinks) window.__capture.set(p, { ...cur, relatedLinks: cur.relatedLinks.filter((r) => !hidden.includes(r.id)) });
          }
        },
        [UID, AD_TODO.HIDDEN, AD_TODO.HIDDEN_COLLECTIONS],
      );
    });
    const t = new Take(dev, OUT, 'adTodo');
    const F60 = 1000 / 60;
    t.mark('home');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // the four saves land at the top of the feed, one after another (a
    // re-saved card keeps its doc and its links; a new one brings its links)
    const linksOf = (id) =>
      AD_TODO.LINKS.filter(([a]) => a === id).map(([, b, reason, common], k) => ({
        id: b,
        title: CARDS.find((c) => c.id === b).title,
        reason,
        similarity: 0.86 - k * 0.03,
        commonConcepts: common,
      }));
    for (const { key, id, doc, reuse } of sources) {
      await t.freeze();
      await page.evaluate(
        ([p, d, reuse, links]) => {
          const cur = window.__capture.get(p);
          window.__capture.set(p, reuse ? { ...cur, createdAt: Date.now() } : { ...d, relatedLinks: links, createdAt: Date.now() });
        },
        [linkPath(id), doc ?? null, !!reuse, linksOf(id)],
      );
      t.mark(`${key}Land`);
      await t.roll(36, { rects: { firstCard: R.firstCard }, step: F60 });
      await t.thaw();
      await page.waitForTimeout(500);
    }
    // …and their related saves link back to them (the app links both ways)
    await page.evaluate(
      ([uid, links]) => {
        for (const [a, b, reason, common] of links) {
          const p = `users/${uid}/links/${b}`;
          const cur = window.__capture.get(p);
          const title = window.__capture.get(`users/${uid}/links/${a}`)?.title;
          if (cur) window.__capture.set(p, { ...cur, relatedLinks: [...(cur.relatedLinks ?? []), { id: a, title, reason, similarity: 0.84, commonConcepts: common }] });
        }
      },
      [UID, AD_TODO.LINKS],
    );
    await page.waitForTimeout(500);
    t.mark('landed');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // the feed, glided down: every save already summarized
    await t.freeze();
    await tagScroller('How to overcome your addiction');
    t.mark('glide');
    await rollScroll(t, 1500, 4, { firstCard: R.firstCard });
    await t.thaw();
    await page.evaluate(() => document.querySelector('[data-capture-scroller]')?.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);

    // (round 6) one card, opened to its Key Points: "pulls out the key points"
    const KP = {
      dialog: R.dialog,
      keyPoints: ['[role=dialog] h1, [role=dialog] h2, [role=dialog] h3, [role=dialog] h4', 'Key Points'],
      points: ['[role=dialog] ul', 'Pack for four days'],
      title: ['[role=dialog] h2', 'One week, one small bag'],
    };
    const igCard = visible(page.locator(R.firstCard[0], { hasText: 'One week, one small bag' }));
    await igCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await t.freeze();
    await igCard.click({ position: { x: 200, y: 20 } });
    t.mark('kpOpen');
    await t.roll(40, { rects: KP, step: F60 });
    await t.thaw();
    await page.waitForTimeout(500);
    await t.freeze();
    await tagScroller('Pack for four days and do one wash');
    t.mark('kpScroll');
    await rollScroll(t, await scrollTargetFor('keep one outfit in your personal bag', 640), 4, KP);
    await t.thaw();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);

    // the Graph view: every save, linked to the ones it relates to
    await visible(page.locator('button[aria-label^="View:"]')).click();
    await page.waitForTimeout(700);
    await page.locator('[role=radio]', { hasText: 'Graph' }).first().click();
    await page.waitForTimeout(3500);
    t.mark('graphSettled');
    await t.snap({ rects: { canvas: ['canvas'] } });

    // its largest cluster, then a second one, focused in turn: the saves each
    // links light up together (the app's own cluster focus and zoom)
    for (const [mark, label] of [['cluster', 'time'], ['cluster2', 'travel']]) {
      await t.freeze();
      await visible(page.locator('button[aria-pressed]', { hasText: label })).click();
      t.mark(mark);
      await t.roll(60, { rects: { canvas: ['canvas'] }, step: F60 });
      await t.thaw();
      await page.waitForTimeout(600);
    }
    return t.save();
  },
};

/**
 * The reel reads its takes as DATA (src/reels/data/takes.json, committed):
 * frame counts, marks, element rects and the text on screen per frame. The
 * PNGs stay out of git (they regenerate from the app), but the edit, the
 * camera aims and \`npm run verify\` all work from this file.
 */
function writeTakesData() {
  const out = {};
  for (const name of fs.readdirSync(OUT).sort()) {
    const f = path.join(OUT, name, 'manifest.json');
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    const texts = [];
    const id = new Map();
    const tid = (s) => {
      if (!id.has(s)) {
        id.set(s, texts.length);
        texts.push(s);
      }
      return id.get(s);
    };
    const r1 = (v) => Math.round(v * 2) / 2;
    out[name] = {
      dpr: m.dpr,
      fps: m.fps,
      count: m.frames.length,
      marks: m.marks,
      texts,
      frames: m.frames.map((fr) => ({
        t: fr.text.map(tid),
        r: Object.fromEntries(
          Object.entries(fr.rects)
            .filter(([, v]) => v)
            .map(([k, v]) => [k, [r1(v.x), r1(v.y), r1(v.w), r1(v.h)]]),
        ),
      })),
    };
  }
  const dest = path.join(here, '..', 'src', 'reels', 'data', 'takes.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out) + '\n');
  console.log(`wrote ${path.relative(path.join(here, '..'), dest)} (${Object.keys(out).join(', ')})`);
}

/**
 * A feature clip's own takes (named `clips/<clip>/<take>`, so their frames
 * sit under public/reel/app/clips/, where writeTakesData does not look)
 * keep their data BESIDE the clip: src/reels/clips/<clip>/takes.json, in the
 * same format as the reel's. The clips are built on parallel branches, and
 * one generated file shared by all of them could not merge. The clip hands
 * its file to the kit (`addTakes`, src/reels/kit/takes.ts).
 */
function writeClipTakesData() {
  const dir = path.join(OUT, 'clips');
  if (!fs.existsSync(dir)) return;
  for (const clip of fs.readdirSync(dir).sort()) {
    const out = {};
    for (const take of fs.readdirSync(path.join(dir, clip)).sort()) {
      const f = path.join(dir, clip, take, 'manifest.json');
      if (!fs.existsSync(f)) continue;
      const m = JSON.parse(fs.readFileSync(f, 'utf8'));
      // (the same summary writeTakesData makes: texts de-duplicated, rects
      // in points rounded to half a point)
      const texts = [];
      const id = new Map();
      const tid = (s) => (id.has(s) ? id.get(s) : (id.set(s, texts.length), texts.push(s) - 1));
      const r1 = (v) => Math.round(v * 2) / 2;
      out[`clips/${clip}/${take}`] = {
        dpr: m.dpr,
        fps: m.fps,
        count: m.frames.length,
        marks: m.marks,
        texts,
        frames: m.frames.map((fr) => ({
          t: fr.text.map(tid),
          r: Object.fromEntries(
            Object.entries(fr.rects)
              .filter(([, v]) => v)
              .map(([k, v]) => [k, [r1(v.x), r1(v.y), r1(v.w), r1(v.h)]]),
          ),
        })),
      };
    }
    if (!Object.keys(out).length) continue;
    const dest = path.join(here, '..', 'src', 'reels', 'clips', clip, 'takes.json');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out) + '\n');
    console.log(`wrote ${path.relative(path.join(here, '..'), dest)} (${Object.keys(out).join(', ')})`);
  }
}

const results = {};
for (const [name, run] of Object.entries(takes)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const t0 = Date.now();
  const m = await run();
  results[name] = { frames: m.frames.length, marks: m.marks };
  console.log(`✓ ${name}: ${m.frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(m.marks));
}
writeTakesData();
writeClipTakesData();
if (dev.errors.length) console.log('page errors:', dev.errors.slice(0, 10));
await dev.browser.close();
await server.close();
