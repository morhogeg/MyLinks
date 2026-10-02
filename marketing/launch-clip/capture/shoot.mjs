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
 *   askfull  (the ASK feature clip) the feed → Ask → the question → the
 *            answer and its sources → a source opened and closed → the
 *            suggested follow-up → its answer → its Graph chip
 *   adtrip   (the trip ad) the trip's saves written in → Ask → "What should
 *            we do in Sardinia?" → the answer and its three sources → the
 *            first source opened
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
import { ASK, CAPTURE_USER, CARDS, SAVE, SEARCH, SYNTHESIS, TRIP_ASK } from './library.mjs';
import { tripDocs } from './ad-trip.mjs';

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
  page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout });

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

const results = {};
for (const [name, run] of Object.entries(takes)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const t0 = Date.now();
  const m = await run();
  results[name] = { frames: m.frames.length, marks: m.marks };
  console.log(`✓ ${name}: ${m.frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(m.marks));
}
writeTakesData();
if (dev.errors.length) console.log('page errors:', dev.errors.slice(0, 10));
await dev.browser.close();
await server.close();
