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
import { ASK, CAPTURE_USER, CARDS, SAVE, SEARCH, SYNTHESIS } from './library.mjs';
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

  // ─────────────────────────────────────────────────────────── adTodo
  // The TODO ad (clips/ad-todo-timeline.mjs): an advice carousel's three
  // slides picked in the Add dialog's Image tab and saved as ONE card, read in
  // the background (the feed's own "Reading 3 screenshots…" card), opened on
  // its screenshots, gist and Key Points; then Revisit's "Do this", where its
  // step now leads the list, ticked: the ring fills, the task strikes, the
  // row folds, "Marked as done". No recipe, money or workout card is in the
  // store, and no Pro surface (the Daily Brew, the weekly recap) is seeded.
  // Rolls at 60fps. (capture/ad-todo.mjs has the slides and the card.)
  async adTodo() {
    const shotsDir = path.join(here, '..', 'out', 'capture', 'app', 'out', AD_TODO.SHOTS_DIR);
    const shots = await AD_TODO.renderShots(dev.browser, shotsDir);
    const urls = shots.slides.map((f) => `${server.url}/${AD_TODO.SHOTS_DIR}/${path.basename(f)}`);
    await fresh(async () => {
      await page.evaluate(
        ([uid, hidden, hiddenCols, todos]) => {
          for (const p of window.__capture.list(`users/${uid}/digests/`)) window.__capture.remove(p);
          for (const p of window.__capture.list(`users/${uid}/syntheses/`)) window.__capture.remove(p);
          for (const id of hidden) window.__capture.remove(`users/${uid}/links/${id}`);
          for (const id of hiddenCols) window.__capture.remove(`users/${uid}/collections/${id}`);
          // only these carry an open "Do this" (the app writes one only when
          // the content calls for an action)
          for (const p of window.__capture.list(`users/${uid}/links/`)) {
            const cur = window.__capture.get(p);
            if (cur?.actionableTakeaway) {
              const { actionableTakeaway, ...rest } = cur;
              void actionableTakeaway;
              window.__capture.set(p, rest);
            }
          }
          for (const [id, text] of todos) {
            const p = `users/${uid}/links/${id}`;
            const cur = window.__capture.get(p);
            if (cur) window.__capture.set(p, { ...cur, actionableTakeaway: text });
          }
        },
        [UID, AD_TODO.HIDDEN, AD_TODO.HIDDEN_COLLECTIONS, AD_TODO.TODOS],
      );
    });
    const t = new Take(dev, OUT, 'adTodo');
    const F60 = 1000 / 60;
    const D = {
      dialog: R.dialog,
      tabImage: ['[role=dialog] button', 'Image'],
      dropzone: ['[role=dialog] label, [role=dialog] div', 'Tap to add images'],
      strip: ['[role=dialog] ol, [role=dialog] ul, [role=dialog] div', 'Screens of one post'],
      save: ['[role=dialog] button', 'Save'],
    };
    t.mark('home');
    await t.snap({ rects: { plus: R.plus, firstCard: R.firstCard } });

    // + : the dialog's own entrance
    await t.freeze();
    await visible(page.locator(R.plus[0])).click();
    t.mark('dialogOpen');
    await t.roll(24, { rects: D, step: F60 });
    await t.thaw();

    // the Image tab
    await page.waitForTimeout(250);
    await t.freeze();
    await visible(page.locator('[role=dialog]').getByRole('button', { name: 'Image', exact: true })).click();
    t.mark('modeImage');
    await t.roll(24, { rects: D, step: F60 });
    await t.thaw();

    // the three slides, picked (the photo picker is native; the dialog shows
    // them the moment they are chosen)
    await page.locator('#image-upload').setInputFiles(shots.slides);
    await until('Screens of one post');
    await page.waitForTimeout(600);
    t.mark('picked');
    await t.roll(24, { rects: D, step: F60 });
    await t.thaw();

    // Save: the placeholder card is written; /api/share is held until time is
    // frozen, so the dialog's close is recorded from its first frame
    let held = null;
    await page.route('**/api/share', (route) => {
      held = route;
    });
    await visible(page.getByRole('button', { name: 'Save', exact: true })).click();
    for (let k = 0; k < 200 && !held; k++) await page.waitForTimeout(50);
    if (!held) throw new Error('adTodo: /api/share was never called');
    const cardPath = await page.evaluate(
      (uid) => window.__capture.list(`users/${uid}/links/`).find((p) => window.__capture.get(p)?.status === 'processing') ?? null,
      UID,
    );
    if (!cardPath) throw new Error('adTodo: no processing card was written');
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
      [cardPath, AD_TODO.raiseCard(urls)],
    );
    await page.waitForTimeout(150);
    t.mark('done');
    await t.roll(48, { rects: { toast: ['[role=status]'], firstCard: R.firstCard }, step: F60 });
    await t.thaw();
    await page.waitForTimeout(800);
    t.mark('landed');
    await t.snap({ rects: { firstCard: R.firstCard } });

    // opened: the screenshots, the gist, then down to the Key Points
    const DETAIL = {
      gallery: ['[aria-label^="Screenshots"]'],
      detailTitle: ['h2', 'How to ask for a raise'],
      gist: ['div,p', 'bring your wins with numbers'],
      keyPoints: ['h1,h2,h3,h4', 'Key Points'],
      points: ['ul', 'Keep a list of your wins'],
      takeaway: ['div', 'Write down three wins'],
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
    // (round 2) on past the Key Points to the card's own "Do this": the step
    // the analysis wrote, the same one Revisit lists
    await rollScroll(t, await scrollTargetFor('before your next review', 640), 4, DETAIL);
    await t.thaw();

    // Revisit: its "Do this" list, the new step on top
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    const TODO = {
      list: ['div[class*="rounded-2xl"][class*="overflow-hidden"]', AD_TODO.RAISE_TODO],
      header: ['button', 'Do this'],
      row1: ['div[class*="ps-1.5"]', AD_TODO.RAISE_TODO],
      row2: ['div[class*="ps-1.5"]', AD_TODO.TODOS[0][1]],
      row3: ['div[class*="ps-1.5"]', AD_TODO.TODOS[1][1]],
      check1: [`button[role=checkbox][aria-label*="Write down three wins"]`],
      toast: ['[role=status]', 'Marked as done'],
      done: ['button', 'Done 1'],
      revisitTab: R.revisitTab,
    };
    await t.freeze();
    await tab('Revisit').click();
    t.mark('revisit');
    await t.roll(24, { rects: TODO, step: F60 });
    await t.thaw();
    await page.waitForTimeout(900);
    t.mark('todo');
    await t.snap({ rects: TODO });

    // the tick: the ring fills with the accent and a check, the task strikes,
    // a ~650ms hold, the row folds, then the write and "Marked as done"
    await t.freeze();
    await visible(page.locator(TODO.check1[0])).click();
    t.mark('tick');
    await t.roll(132, { rects: TODO, step: F60 });
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
