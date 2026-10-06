/**
 * Capture the REAL app for the live film (live/index.html).
 *
 *   npm run reel:app      (once per app change: builds the shipped web/ with
 *                          Firebase swapped for the demo account, capture/)
 *   npm run live:capture  →  out/live/takes/{session,cards}/NNNN.png + manifest.json
 *
 * Every pixel of app UI in the film comes from here: the shipped components,
 * styles, copy and animations, running on the capture device (capture/
 * device.mjs) and recorded frame by frame on a stepped clock (capture/
 * recorder.mjs). The film composes these frames in 3D; it never redraws UI.
 *
 * TAKES:
 *   session  ONE continuous use of the app, so the film never cuts: the boot
 *            (brackets close, the point strikes, MACHINA, the push-through)
 *            → + → Add to Machina (Link / Image / Note) → a link pasted → the
 *            five-phase save → the card landing → opened and read to its
 *            "Do this" → closed → a plain-words search landing on the one card
 *            it means → Ask: the streamed answer and its three sources → the
 *            Graph chip → the graph with those three lit → Revisit: the
 *            "Do this" list, then "This week in Machina" opened and read
 *   cards    single cards as the feed draws them, for the film's ring of
 *            saves and the Ask sources
 *
 * Demo account: capture/library.mjs, minus the two recipe cards and the
 * "Cook this week" collection (owner 2026-10-02: no recipe or cooking content
 * in new films). The Find beat asks its own question (FIND below), answered
 * through the capture server's `search` option.
 *
 * Env: CAPTURE_DPR (default 3: the iPhone 15 Pro's own pixel density, and the
 * film's closest push-in stays at or under 3 px per point), CAPTURE_ONLY=a,b.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../capture/server.mjs';
import { openDevice } from '../capture/device.mjs';
import { Take } from '../capture/recorder.mjs';
import { ASK, CAPTURE_USER, CARDS, SAVE, SYNTHESIS } from '../capture/library.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'out', 'live', 'takes');
const DPR = Number(process.env.CAPTURE_DPR ?? 3);
const ONLY = process.env.CAPTURE_ONLY?.split(',');
const UID = CAPTURE_USER.uid;
const linkPath = (id) => `users/${UID}/links/${id}`;

/** Left out of the film's account entirely (see header). */
const DROP_CARDS = ['marcella', 'chicken'];
const DROP_COLLECTIONS = ['cook'];

/** The Find beat: a question that shares no word with the card it finds. */
export const FIND = {
  query: 'somewhere quiet to swim in Italy',
  hits: ['goloritze'],
};

/** Cards the film lifts out whole (the `cards` take). */
export const LIFTS = ['tailend', 'procrastinator', 'naval', 'goloritze', 'fourthousand', 'perfectdays', 'webb', 'piranesi', 'optimistic', 'rams', 'tmb', 'coffee', 'question', 'jobs', 'money', 'fushimi'];

fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(4660, { search: { [FIND.query.toLowerCase()]: FIND.hits } });
const dev = await openDevice(server.url, { dpr: DPR });
const { page } = dev;

const visible = (loc) => loc.filter({ visible: true }).first();
const tab = (name) => visible(page.locator(`nav[aria-label=Main] button[aria-label="${name}"]`));
const until = (text, timeout = 10000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout });

/** The film's account: the demo library without the kitchen. */
async function filmAccount() {
  await page.evaluate(
    ([uid, dropCards, dropCols]) => {
      const cap = window.__capture;
      for (const id of dropCards) cap.remove(`users/${uid}/links/${id}`);
      for (const id of dropCols) cap.remove(`users/${uid}/collections/${id}`);
      for (const p of cap.list(`users/${uid}/links/`)) {
        const c = cap.get(p);
        if (!c) continue;
        const relatedLinks = (c.relatedLinks ?? []).filter((r) => !dropCards.includes(r.id));
        const collectionIds = (c.collectionIds ?? []).filter((x) => !dropCols.includes(x));
        if (relatedLinks.length !== (c.relatedLinks ?? []).length || collectionIds.length !== (c.collectionIds ?? []).length) {
          cap.set(p, { ...c, relatedLinks, collectionIds });
        }
      }
      for (const p of cap.list(`users/${uid}/digests/`)) {
        const d = cap.get(p);
        if (d?.cards) cap.set(p, { ...d, cards: d.cards.filter((x) => !dropCards.includes(x.id)) });
      }
    },
    [UID, DROP_CARDS, DROP_COLLECTIONS],
  );
}

/** A fresh, freshly seeded app on the Home feed. */
async function fresh(prepare) {
  await page.goto(server.url + '/');
  await visible(page.getByText('Read Piranesi')).waitFor({ timeout: 30000 });
  await filmAccount();
  if (prepare) await prepare();
  await page.waitForTimeout(900);
}

/** Tag the scrollable ancestor of the element showing `text` (capture/shoot.mjs). */
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

/** Scrolling, recorded: one frame per `step` points (the film picks its own speed). */
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

// Element rects the film aims at and lifts. [selector, text filter?]
const R = {
  plus: ['nav[aria-label=Main] button[aria-label="Add to Machina"]'],
  search: ['input[placeholder="Search your saves"]'],
  firstCard: ['main article.surface-card'],
  dialog: ['[role=dialog]'],
  askTab: ['nav[aria-label=Main] button[aria-label="Ask"]'],
  revisitTab: ['nav[aria-label=Main] button[aria-label="Revisit"]'],
  tabBar: ['nav[aria-label=Main]'],
  composer: ['textarea'],
  send: ['button[aria-label="Send"]'],
  toast: ['[role=status]', 'Saved to Machina'],
};

const cardRect = (title) => ['main article.surface-card', title];

const takes = {
  // ─────────────────────────────────────────────────────────── session
  /**
   * ONE continuous use of the app, boot to Revisit, so the film never has to
   * cut: every transition in it is the app's own navigation.
   */
  async session() {
    // The saved card is the demo library's Tail End: hold its seeded doc so
    // the save can recreate it under the SAME id (its connections, the Ask
    // citation and the graph node all point at `tailend`).
    const seededTailEnd = await (async () => {
      await page.goto(server.url + '/');
      await visible(page.getByText('Read Piranesi')).waitFor({ timeout: 30000 });
      return page.evaluate((p) => window.__capture.get(p), linkPath(SAVE.id));
    })();
    const refs = [...new Set([...SYNTHESIS.themes.flatMap((x) => x.cardIds), SYNTHESIS.standoutCardId])].map((id) => {
      const c = CARDS.find((x) => x.id === id);
      return { id, title: c.title, category: c.category };
    });
    /** Everything the session needs in place before the app opens. */
    const prepare = () =>
      page.evaluate(
        ([uid, tailPath, syn, todos]) => {
          const cap = window.__capture;
          cap.remove(tailPath); // the Save beat brings it in
          // Revisit leads with the week's recap, no review row above it
          for (const p of cap.list(`users/${uid}/digests/`)) cap.remove(p);
          void syn; // the recap itself is written just before Revisit opens
          // the saves that call for an action carry their "Do this"
          for (const [id, text] of todos) {
            const p = `users/${uid}/links/${id}`;
            const cur = cap.get(p);
            if (cur) cap.set(p, { ...cur, actionableTakeaway: text });
          }
        },
        [
          UID,
          linkPath(SAVE.id),
          { ...SYNTHESIS, weekId: isoWeekId(new Date()), cards: refs, createdAt: Date.now() - 3_600_000 },
          CARDS.filter((c) => c.takeaway && !DROP_CARDS.includes(c.id) && c.id !== SAVE.id).map((c) => [c.id, c.takeaway]),
        ],
      );

    // Hold every animation of the NEXT document at its first frame the moment
    // it exists, so the boot is recorded from its first painted frame.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('liveHoldBoot') !== '1') return;
      const hold = () => {
        for (const a of document.getAnimations()) {
          if (a.__held) continue;
          a.__held = 1;
          a.pause();
          a.currentTime = 0;
        }
      };
      new MutationObserver(hold).observe(document, { subtree: true, childList: true, attributes: true });
      document.addEventListener('DOMContentLoaded', hold);
      window.__liveHoldBoot = hold;
    });
    await page.evaluate(() => sessionStorage.setItem('liveHoldBoot', '1'));
    const now = await page.evaluate(() => Date.now());
    // Freeze the JS clock BEFORE the reload: the demo sign-in resolves on a
    // timer, so the app waits on its boot screen until the clock is stepped.
    await page.clock.pauseAt(now + 200);
    await page.goto(server.url + '/');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__liveHoldBoot?.());
    await filmAccount();
    await prepare();
    await page.waitForTimeout(300);

    const t = new Take(dev, OUT, 'session');
    // ── BOOT ────────────────────────────────────────────────────────────
    // Frozen by hand, not with t.freeze(): its pauseAt() jumps the clock
    // forward, which would fire the sign-in timer before the entrance plays.
    await t.helpers();
    await dev.cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    await page.evaluate(() => window.__rec.adopt());
    t.paused = true;
    // The staged arrival (pure CSS, web/app/page.tsx): step ONLY the CSS
    // animations, so sign-in cannot resolve mid-entrance. 2.0s at 30fps.
    t.mark('arrive');
    for (let k = 0; k < 60; k++) {
      if (k > 0) await page.evaluate((dt) => window.__rec.step(dt), 1000 / 30);
      await t.snap({ caret: 'hide' });
    }
    // Sign-in resolves; the app's own exit pushes through the mark into the
    // feed. Both clocks now, at 60fps (the film may slow it).
    t.mark('exit');
    await t.roll(84, { step: 1000 / 60, rects: { firstCard: R.firstCard, tabBar: R.tabBar } });
    await t.thaw();
    await page.evaluate(() => sessionStorage.removeItem('liveHoldBoot'));
    await page.waitForTimeout(500);
    t.mark('home');
    await t.snap({ rects: { firstCard: R.firstCard, plus: R.plus, search: R.search, tabBar: R.tabBar } });

    // ── SAVE ────────────────────────────────────────────────────────────
    await t.freeze();
    await visible(page.locator(R.plus[0])).click();
    t.mark('dialogOpen');
    await t.roll(16, { rects: { dialog: R.dialog, plus: R.plus } });
    await t.thaw();

    // The dialog's three real ways in, each tapped (60fps: the film lingers)
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

    await page.evaluate(([col, id]) => window.__capture.nextId(col, id), [`users/${UID}/links`, SAVE.id]);
    await visible(page.getByRole('button', { name: 'Save', exact: true })).click();
    await until('Fetching the link');
    const cardPath = linkPath(SAVE.id);
    if ((await page.evaluate((p) => window.__capture.get(p)?.status, cardPath)) !== 'processing') {
      throw new Error('session: the saved card did not land under its library id');
    }

    // the five phases, a second each: what it takes to actually read a row
    const stages = [null, 'scraping', 'analyzing', 'connecting', 'organizing'];
    for (let i = 0; i < stages.length; i++) {
      if (stages[i]) {
        await page.evaluate(([p, st]) => window.__capture.merge(p, { processingStage: st }), [cardPath, stages[i]]);
        await page.waitForTimeout(250);
      }
      t.mark(`phase${i}`);
      await t.roll(30, { rects: { dialog: R.dialog } });
      await t.thaw();
    }

    // the backend finishes: the card becomes the real, filed Tail End
    const c = CARDS.find((x) => x.id === SAVE.id);
    await t.freeze();
    await page.evaluate(
      ([p, card]) => {
        const cur = window.__capture.get(p) ?? {};
        const { processingStage, processingStartedAt, ...rest } = cur;
        void processingStage;
        void processingStartedAt;
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
          relatedLinks: seededTailEnd?.relatedLinks ?? [],
          reminderStatus: 'none',
          metadata: { originalTitle: c.title, estimatedReadTime: c.readTime },
        },
      ],
    );
    await page.waitForTimeout(250);
    t.mark('done');
    await t.roll(54, { rects: { dialog: R.dialog, toast: R.toast, firstCard: R.firstCard } });
    await t.thaw();
    await page.waitForTimeout(700);
    t.mark('landed');
    await t.snap({ rects: { firstCard: R.firstCard, toast: R.toast } });

    // open it: the card's own detail view, read down to its "Do this"
    const DETAIL = {
      detailTitle: ['h2', 'The Tail End'],
      summary: ['p', 'Counted in visits instead of years'],
      keyPoints: ['h1,h2,h3,h4', 'Key Points'],
      points: ['ul', 'Counted in visits'],
      takeaway: ['div', 'Call your parents'],
      close: ['button[aria-label="Close"]'],
    };
    await page.waitForTimeout(600);
    await t.freeze();
    await visible(page.locator(R.firstCard[0])).click({ position: { x: 120, y: 40 } });
    t.mark('detail');
    await t.roll(40, { rects: DETAIL, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(500);
    await t.freeze();
    await tagScroller('Key Points');
    t.mark('detailScroll');
    await rollScroll(t, await scrollTargetFor('Call your parents', 700), 5, DETAIL);
    await t.thaw();
    t.mark('detailEnd');
    await t.snap({ rects: DETAIL });

    // close it: back to the feed, the new card on top
    await page.waitForTimeout(300);
    await t.freeze();
    await visible(page.locator('button[aria-label="Close"]')).click();
    t.mark('detailClose');
    await t.roll(30, { rects: { firstCard: R.firstCard, search: R.search }, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(500);

    // ── FIND ────────────────────────────────────────────────────────────
    t.mark('findHome');
    await t.snap({ rects: { search: R.search, firstCard: R.firstCard } });
    await t.freeze();
    await visible(page.getByPlaceholder('Search your saves')).click();
    t.mark('focus');
    await t.roll(10, { rects: { search: R.search } });
    // typed at 30 characters a second on the frozen clock, so the search
    // debounce cannot fire mid-word
    t.mark('typing');
    for (const ch of FIND.query) {
      await page.keyboard.type(ch);
      await t.advance();
      await t.snap({ rects: { search: R.search } });
    }
    // the debounce, "Searching by meaning…", then the card: the app's pacing
    t.mark('searching');
    await t.roll(40, { rects: { search: R.search, card: cardRect('Cala Golorit') } });
    await t.thaw();
    await page.waitForTimeout(900);
    await t.freeze();
    t.mark('result');
    await t.roll(24, { rects: { search: R.search, card: cardRect('Cala Golorit') } });
    await t.thaw();
    await page.waitForTimeout(300);
    // Put the keyboard away (Done), then clear the query with the field's ×:
    // Done alone keeps the query (the graph would inherit it), and an × tapped
    // while the caret is in the field misses (Done unmounting on blur slides
    // the × out from under the tap; seen 2026-10-05, reported, not fixed here).
    await t.freeze();
    await visible(page.getByRole('button', { name: 'Done', exact: true })).click();
    t.mark('findDone');
    await t.roll(18, { rects: { search: R.search, card: cardRect('Cala Golorit') } });
    await t.thaw();
    await page.waitForTimeout(300);
    await t.freeze();
    await visible(page.locator('button[aria-label="Clear search"]')).click();
    t.mark('findClear');
    await t.roll(24, { rects: { firstCard: R.firstCard, askTab: R.askTab, search: R.search } });
    await t.thaw();
    if ((await page.evaluate(() => document.querySelector('input[placeholder="Search your saves"]')?.value)) !== '') {
      throw new Error('session: the search query did not clear');
    }
    await page.waitForTimeout(400);

    // ── ASK ─────────────────────────────────────────────────────────────
    t.mark('askHome');
    await t.snap({ rects: { askTab: R.askTab } });
    await t.freeze();
    await tab('Ask').click();
    t.mark('askOpen');
    await t.roll(18, { rects: { composer: R.composer } });
    await t.thaw();

    await visible(page.locator('textarea')).click();
    await page.waitForTimeout(150);
    await t.freeze();
    t.mark('askTyping');
    for (const ch of ASK.question) {
      await page.keyboard.type(ch);
      await t.advance();
      await t.snap({ rects: { composer: R.composer, send: R.send } });
    }
    await t.thaw();

    await page.keyboard.press('Enter');
    for (let k = 0; k < 40 && !server.chatOpen(); k++) await page.waitForTimeout(25);
    await t.freeze();
    t.mark('sent');
    await t.roll(6, { rects: { bubble: ['div', ASK.question] } });

    t.mark('stream');
    let done = false;
    while (!done) {
      done = server.advanceChat(7);
      await page.waitForTimeout(90); // the chunk crosses the (real) network
      await t.advance();
      await t.snap({ rects: { answer: ['div[class*="rounded"]', 'Your saves keep circling'] } });
    }
    server.finishChat();
    await page.waitForTimeout(400);
    t.mark('sources');
    await t.roll(30, {
      rects: {
        answer: ['div[class*="rounded"]', 'Your saves keep circling'],
        chip1: ['button[title="The Tail End"]'],
        chip2: ['button[title="Inside the mind of a master procrastinator"]'],
        chip3: ['button[title="How to Get Rich (without getting lucky)"]'],
        graphChip: ['button', 'Graph'],
      },
    });

    // ── CONNECT ─────────────────────────────────────────────────────────
    await visible(page.getByText('Graph', { exact: true })).click();
    t.mark('graph');
    await t.roll(180, { rects: { canvas: ['canvas'], revisitTab: R.revisitTab }, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(400);

    // ── REVISIT ─────────────────────────────────────────────────────────
    const RECAP = {
      recap: ['div[class*="border-accent/25"]'],
      todo: ['div[class*="divide-y"]', 'Call your parents'],
      todoRow: ['div[class*="ps-1.5"]', 'Call your parents'],
      narrative: ['p', 'Five saves this week'],
      theme1: ['section', 'Counting the time'],
      theme2: ['section', 'Somewhere to be slow'],
      standout: ['button', 'Standout'],
      question: ['div[class*="bg-card-hover"]', 'Worth sitting with'],
      revisitTab: R.revisitTab,
    };
    // The week's recap is written now (the server writes it on the user's
    // recap day): seeded at boot it would also head the Home feed throughout.
    await page.evaluate(
      ([uid, syn]) => window.__capture.set(`users/${uid}/syntheses/${syn.weekId}`, syn),
      [UID, { ...SYNTHESIS, weekId: isoWeekId(new Date()), cards: refs, createdAt: Date.now() - 3_600_000 }],
    );
    await page.waitForTimeout(400);
    await t.freeze();
    await tab('Revisit').click();
    t.mark('revisitOpen');
    await t.roll(16, { rects: RECAP });
    await t.thaw();
    await page.waitForTimeout(500);
    t.mark('revisitHold');
    await t.snap({ rects: RECAP });
    await t.freeze();
    await visible(page.getByText('This week in Machina')).click();
    t.mark('expand');
    await t.roll(40, { rects: RECAP, step: 1000 / 60 });
    await t.thaw();
    await page.waitForTimeout(300);
    await t.freeze();
    await tagScroller('Counting the time');
    t.mark('recapScroll');
    await rollScroll(t, await scrollTargetFor('who would you call', 720), 5, RECAP);
    // the last frame is snapped while time is still frozen: snapped after the
    // thaw, it caught the recap starting to fade (film/edit.js holds 'end' - 1)
    t.mark('end');
    await t.snap({ rects: RECAP });
    await t.thaw();
    return t.save();
  },

  // ─────────────────────────────────────────────────────────── cards
  async cards() {
    await fresh();
    const t = new Take(dev, OUT, 'cards');
    await tagScroller('Read Piranesi');
    for (const id of LIFTS) {
      const c = CARDS.find((x) => x.id === id);
      // centre the card on screen, settled, then snap it with its box
      await page.evaluate((title) => {
        const el = [...document.querySelectorAll('main article.surface-card')].find((e) => e.textContent.includes(title));
        el?.scrollIntoView({ block: 'center', behavior: 'instant' });
      }, c.title);
      await page.waitForTimeout(450);
      t.mark(id);
      await t.snap({ rects: { card: cardRect(c.title) } });
    }
    return t.save();
  },
};

const results = {};
for (const [name, run] of Object.entries(takes)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const t0 = Date.now();
  const m = await run();
  results[name] = { frames: m.frames.length, marks: m.marks };
  console.log(`✓ ${name}: ${m.frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(m.marks));
}
if (dev.errors.length) console.log('page errors:', dev.errors.slice(0, 10));
await dev.browser.close();
await server.close();
