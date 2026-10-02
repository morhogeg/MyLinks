/**
 * The TODO ad's own capture material ("The screenshot that becomes a
 * to-do"; the take itself is `adTodo` in shoot.mjs). Everything the app shows
 * is the app; what stands in for the outside world and the backend is here:
 *
 *  - SLIDES: an advice carousel, "How to ask for a raise", three slides,
 *    written and typeset for the ad (an original design: no creator, no
 *    handle, no platform chrome, no third-party image). Rendered to PNGs and
 *    picked in the Add dialog's real Image tab, which reads up to five
 *    screens of one post into one card, in order.
 *  - OTHERS: more screenshots for the hook's pile (a slide from a talk, a
 *    plain note, a packing list; round 3: three that land on it), same
 *    rules: invented, typographic only.
 *  - RAISE_CARD: what the backend returns for the slides (functions
 *    ai_service.analyze_images: a gist, "## Key Points", tags, and a "Do
 *    this" only because the content calls for an action). The "Do this"
 *    follows the analysis prompt's rule since 2026-10-02 (rule 8): one
 *    sentence, at most 20 words, verb first, one action.
 *  - TODOS: the other open "Do this" rows in the list the ad ticks: The Tail
 *    End's (library.mjs) and Mark Manson's essay's (the SAVE clip's card's
 *    step). No recipe card is in the take: they are removed from the store.
 */

import fs from 'node:fs';
import path from 'node:path';

/** where the capture server serves the screenshots from (its static root) */
export const SHOTS_DIR = 'ad-todo-shots';

const INK = '#16233B';
const ACCENT = '#2F5BEA';
const PAPER = '#F5F1EA';

const slide = (n, body, cover = false) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 390px; height: 844px; font-family: Inter, system-ui, sans-serif; background: ${cover ? ACCENT : PAPER}; color: ${cover ? '#FFFFFF' : INK}; position: relative; overflow: hidden; padding: 34px 30px; }
  .n { position: absolute; top: 34px; right: 30px; font-size: 14px; font-weight: 700; letter-spacing: 0.06em; color: ${cover ? 'rgba(255,255,255,0.75)' : ACCENT}; }
  .k { font-size: 14px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${cover ? 'rgba(255,255,255,0.8)' : ACCENT}; }
  h1 { font-size: 62px; line-height: 0.96; letter-spacing: -0.045em; font-weight: 800; margin-top: 22px; }
  .sub { margin-top: 26px; font-size: 21px; line-height: 1.35; color: rgba(255,255,255,0.86); }
  .step { display: flex; gap: 16px; margin-top: 44px; }
  .step:first-of-type { margin-top: 56px; }
  .num { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; background: ${ACCENT}; color: #fff; font-weight: 800; font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .step h2 { font-size: 30px; line-height: 1.06; letter-spacing: -0.03em; font-weight: 800; }
  .step p { margin-top: 10px; font-size: 19px; line-height: 1.38; color: #4A5872; }
  .bar { position: absolute; left: 30px; right: 30px; bottom: 44px; height: 5px; border-radius: 3px; background: ${cover ? 'rgba(255,255,255,0.25)' : '#E2E6F0'}; }
  .bar i { display: block; height: 100%; border-radius: 3px; background: ${cover ? '#FFFFFF' : ACCENT}; width: ${(n / 3) * 100}%; }
  .arrow { position: absolute; bottom: 74px; left: 30px; font-size: 17px; font-weight: 700; }
</style></head><body><div class="n">${n} / 3</div>${body}<div class="bar"><i></i></div></body></html>`;

export const SLIDES = [
  slide(
    1,
    `<div class="k">Before the meeting</div>
     <h1>How to ask for a raise</h1>
     <p class="sub">Three things to do first, so the conversation is about your work, not your nerves.</p>
     <div class="arrow">Swipe for the three →</div>`,
    true,
  ),
  slide(
    2,
    `<div class="k">Steps 1 and 2</div>
     <div class="step"><div class="num">1</div><div><h2>Bring your wins, with numbers</h2>
       <p>What you shipped, saved or fixed. "Cut onboarding from 3 weeks to 1" beats "worked hard".</p></div></div>
     <div class="step"><div class="num">2</div><div><h2>Know the range for your role</h2>
       <p>Look it up before you go in, so you are asking for a real figure.</p></div></div>`,
  ),
  slide(
    3,
    `<div class="k">Step 3</div>
     <div class="step"><div class="num">3</div><div><h2>Ask for one clear number. Then stop talking.</h2>
       <p>Let the silence do its work.</p></div></div>
     <div class="step"><div class="num">+</div><div><h2>If it's a no</h2>
       <p>Ask what would make it a yes, and when you can talk about it again.</p></div></div>`,
  ),
];

/** the rest of the hook's pile: other advice people screenshot (invented, type only) */
const plain = (bg, ink, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 390px; height: 844px; font-family: Inter, system-ui, sans-serif; background: ${bg}; color: ${ink}; padding: 120px 34px 0; }
  h1 { font-size: 44px; line-height: 1.02; letter-spacing: -0.04em; font-weight: 800; }
  p { margin-top: 22px; font-size: 20px; line-height: 1.4; opacity: 0.78; }
  li { list-style: none; font-size: 21px; line-height: 1.3; padding: 13px 0; border-top: 1px solid rgba(127,127,127,0.25); }
  .k { font-size: 14px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.6; margin-bottom: 18px; }
</style></head><body>${body}</body></html>`;

export const OTHERS = [
  // a slide from a talk
  plain('#1B1D24', '#F2F2F4', `<div class="k">Slide 14</div><h1>Say the conclusion first.</h1><p>Then the reasons. Nobody remembers the build-up.</p>`),
  // a friend's suggestion, kept as a note
  plain('#FFF8D9', '#3B3418', `<h1>Sunday reset</h1><ul style="margin-top:22px"><li>Plan the week in 10 minutes</li><li>Clear the inbox to five</li><li>One call you keep putting off</li></ul>`),
  // a packing list
  plain('#E8F1EE', '#173A33', `<div class="k">Carry-on only</div><h1>Pack for four days. Wash once.</h1><p>Every top goes with every bottom.</p>`),
  // (round 3) three more that land on the pile in the hook
  plain('#EDE7FB', '#2E2457', `<div class="k">Tip 3 of 7</div><h1>Batch the small stuff.</h1><p>Errands, emails, calls: one block, once a day.</p>`),
  plain('#FFE9E3', '#4A1F14', `<h1>Before you say yes</h1><ul style="margin-top:22px"><li>Does it move a goal forward?</li><li>Would I do it tomorrow?</li><li>What do I drop for it?</li></ul>`),
  plain('#E6F0FA', '#12324F', `<div class="k">Note to self</div><h1>Leave room in the day.</h1><p>Plan most of it. The rest is for what comes up.</p>`),
];

/** Render the slides and the others to PNGs (an iPhone's 3× screenshot). */
export async function renderShots(browser, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const out = { slides: [], others: [] };
  for (const [kind, list] of [['slides', SLIDES], ['others', OTHERS]]) {
    for (const [k, html] of list.entries()) {
      await p.setContent(html);
      await p.evaluate(() => document.fonts.ready);
      const file = path.join(dir, `${kind === 'slides' ? 'raise' : 'other'}-${k + 1}.png`);
      await p.screenshot({ path: file });
      out[kind].push(file);
    }
  }
  await p.close();
  return out;
}

/** The "Do this" the backend writes for the slides (rule 8: one sentence,
 *  at most 20 words, verb first, one action) */
export const RAISE_TODO = 'Write down three wins, each with a number, before your next review.';

/** The finished card, as the backend writes it onto the placeholder. */
export const raiseCard = (imageUrls) => ({
  url: imageUrls[0],
  imageUrls,
  title: 'How to ask for a raise',
  summary:
    'A three-step way to ask for a raise: **bring your wins with numbers**, know the range for your role, and ask for one clear figure, then stop talking.',
  detailedSummary: [
    '## Key Points',
    '- Keep a list of your wins, each with a number: what you shipped, saved or fixed.',
    '- Look up the range for your role before the meeting, so you ask for a real figure.',
    '- Ask for one clear number, then let the silence work.',
    '- If the answer is no, ask what would make it a yes, and when to talk again.',
  ].join('\n'),
  actionableTakeaway: RAISE_TODO,
  category: 'Career',
  tags: ['career', 'pay', 'negotiation'],
  concepts: ['career', 'negotiation'],
  sourceType: 'image',
  sourceName: 'Screenshot',
  status: 'unread',
  language: 'en',
  hideThumbnail: false,
  relatedLinks: [],
  metadata: { originalTitle: 'How to ask for a raise', estimatedReadTime: 1 },
});

/** the other open tasks in the list, [card id, "Do this"] (no recipe card) */
export const TODOS = [
  ['tailend', 'Call your parents this week, and put the next visit on the calendar.'],
  ['question', 'Name one goal, write down the daily struggle it takes, and ask if you want that struggle.'],
];

/** taken out of the take's store: the recipe cards (owner, 2026-10-02: no
 *  recipes in frame), their collection, and, for Meta's ad review, the
 *  cards about money and a workout (nothing in an ad frame should read as a
 *  claim about the viewer's finances or health) */
export const HIDDEN = ['marcella', 'chicken', 'coffee', 'naval', 'money', 'yoga'];
export const HIDDEN_COLLECTIONS = ['cook'];
