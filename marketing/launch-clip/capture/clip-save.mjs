/**
 * The SAVE clip's own capture material (the take itself is `saveclip` in
 * shoot.mjs). Everything the app shows is the app; what stands in for the
 * outside world and the backend is here:
 *
 *  - SHOTS: three screenshots of ONE recipe post, the kind of thing people
 *    screenshot and lose. Written for the clip (an invented cook, no platform
 *    chrome, no third-party image), rendered to PNGs and picked in the Add
 *    dialog's real Image tab, which reads up to five screens of one post into
 *    one card, in order.
 *  - SHOTS_CARD: the card the backend would return for them (web/functions
 *    ai_service.analyze_images: a recipe's detailed summary is "## Key Points"
 *    then "## Ingredients" and "## Steps"; tags; a "Do this" only when the
 *    content supports an action; related saves with a reason each). Its
 *    related saves are real cards of the demo account.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CARDS } from './library.mjs';

/** where the capture server serves the screenshots from (its static root) */
export const SHOTS_DIR = 'capture-shots';

const page = (n, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 390px; height: 844px; font-family: Inter, system-ui, sans-serif; background: #F3EADB; color: #3A2A1C; }
  .bar { height: 50px; padding: 16px 26px 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .who { display: flex; align-items: center; gap: 10px; padding: 18px 26px 0; }
  .av { width: 38px; height: 38px; border-radius: 50%; background: #C8643B; color: #FFF6EA; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .name { font-weight: 700; font-size: 15px; } .handle { font-size: 13px; color: #8A7461; }
  .slide { margin: 22px 20px 0; height: 610px; border-radius: 26px; background: #FFFBF4; padding: 34px 30px; position: relative; box-shadow: 0 1px 0 rgba(58,42,28,0.06); }
  .n { position: absolute; top: 22px; right: 24px; font-size: 13px; font-weight: 700; color: #C8643B; letter-spacing: 0.04em; }
  h1 { font-size: 46px; line-height: 1.02; letter-spacing: -0.035em; font-weight: 800; margin-top: 40px; }
  h2 { font-size: 30px; letter-spacing: -0.03em; font-weight: 800; margin-bottom: 18px; }
  p { font-size: 19px; line-height: 1.42; color: #5C4633; }
  ul, ol { padding-left: 0; list-style: none; }
  li { font-size: 19px; line-height: 1.35; padding: 11px 0; border-bottom: 1px solid #EFE3D1; color: #3A2A1C; }
  li b { color: #C8643B; margin-right: 8px; }
  .dots { position: absolute; bottom: 26px; left: 0; right: 0; display: flex; justify-content: center; gap: 7px; }
  .dots i { width: 7px; height: 7px; border-radius: 50%; background: #E4D3BC; } .dots i.on { background: #C8643B; }
  .potato { margin-top: 44px; display: flex; gap: 14px; }
  .potato span { width: 74px; height: 58px; border-radius: 50% 46% 52% 48%; background: radial-gradient(circle at 40% 35%, #F2C77A, #D99A45 70%, #B97330); transform: rotate(-8deg); }
  .potato span:nth-child(2) { transform: rotate(12deg) scale(0.9); } .potato span:nth-child(3) { transform: rotate(-20deg) scale(1.05); }
</style></head><body>
  <div class="bar">9:41</div>
  <div class="who"><div class="av">WC</div><div><div class="name">Weeknight Cook</div><div class="handle">@weeknight.cook</div></div></div>
  <div class="slide"><div class="n">${n}/3</div>${body}
    <div class="dots">${[1, 2, 3].map((k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</div></div>
</body></html>`;

export const SHOTS = [
  page(
    1,
    `<h1>Crispy smashed potatoes</h1><p style="margin-top:18px">The only way I make them now. Soft inside, shatter-crisp outside, one tray, about 45 minutes.</p>
     <div class="potato"><span></span><span></span><span></span></div>`,
  ),
  page(
    2,
    `<h2>You need</h2><ul>
      <li><b>1 kg</b>small waxy potatoes</li><li><b>4 tbsp</b>olive oil</li><li><b>3</b>cloves garlic, crushed</li>
      <li><b>+</b>flaky salt</li><li><b>+</b>rosemary or thyme</li></ul>`,
  ),
  page(
    3,
    `<h2>How</h2><ol>
      <li><b>1</b>Boil in well-salted water until a knife slides in, about 20 min.</li>
      <li><b>2</b>Drain. Let them steam dry for 5 min. Don't skip this.</li>
      <li><b>3</b>Smash flat on an oiled tray, oil the tops, salt.</li>
      <li><b>4</b>Roast at 230°C for 25 to 30 min. Garlic and herbs for the last 5.</li></ol>`,
  ),
];

/** Render SHOTS to PNGs (an iPhone's 3× screenshot) with a page of the capture browser. */
export async function renderShots(browser, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const files = [];
  for (const [k, html] of SHOTS.entries()) {
    await p.setContent(html);
    await p.evaluate(() => document.fonts.ready);
    const file = path.join(dir, `shot-${k + 1}.png`);
    await p.screenshot({ path: file });
    files.push(file);
  }
  await p.close();
  return files;
}

const title = (id) => CARDS.find((c) => c.id === id).title;

/** The finished card, as the backend writes it onto the placeholder. */
export const shotsCard = (imageUrls) => ({
  url: imageUrls[0],
  imageUrls,
  title: 'Crispy smashed potatoes',
  summary:
    'A one-tray method for potatoes that are **soft inside and shatter-crisp outside**: boil them, let them steam dry, then smash and roast hot.',
  detailedSummary: [
    '## Key Points',
    '- Boil first, in well-salted water, until a knife slides in.',
    '- Let them steam dry for five minutes, or they will never crisp.',
    '- Smash flat, oil the tops and roast hot until deep gold.',
    '',
    '## Ingredients',
    '- 1 kg small waxy potatoes',
    '- 4 tbsp olive oil',
    '- 3 cloves garlic, crushed',
    '- Flaky salt, rosemary or thyme',
    '',
    '## Steps',
    '1. Boil in salted water, about 20 minutes.',
    '2. Drain and let them steam dry for 5 minutes.',
    '3. Smash on an oiled tray, oil the tops, salt well.',
    '4. Roast at 230°C for 25 to 30 minutes; add garlic and herbs for the last 5.',
  ].join('\n'),
  actionableTakeaway: 'Make them this week, and let them steam dry before you smash them.',
  category: 'Recipes',
  tags: ['potatoes', 'side dish', 'weeknight'],
  concepts: ['cooking', 'recipe'],
  sourceType: 'image',
  sourceName: 'Screenshot',
  status: 'unread',
  language: 'en',
  hideThumbnail: false,
  relatedLinks: [
    {
      id: 'marcella',
      title: title('marcella'),
      reason: 'Another weeknight recipe that trusts a few good ingredients.',
      similarity: 0.88,
      commonConcepts: ['cooking', 'recipe'],
    },
    {
      id: 'chicken',
      title: title('chicken'),
      reason: 'The same idea for chicken: salt it early, then roast it hot.',
      similarity: 0.86,
      commonConcepts: ['cooking', 'recipe'],
    },
  ],
  metadata: { originalTitle: 'Crispy smashed potatoes', estimatedReadTime: 2 },
});

/* ─────────────────────────────────────────────────────────────── sources
 * The SAVE clip's source tour (take `sources` in shoot.mjs): one finished
 * card per kind of save, written the way the backend writes each kind, and
 * opened in the real app's detail view.
 *
 *  - YOUTUBE: the card is the app's own output for a real video, copied from
 *    the owner's phone (2026-09-29): its title, channel, category, gist and
 *    the four Key moments with their timestamps, verbatim. `videoId` is a
 *    stand-in (the card hides its thumbnail and nothing is tapped, so no frame
 *    shows it or plays it).
 *  - X: a long-form X Article (the scraper reads an Article's body blocks,
 *    functions/scraper.py). The author and article are INVENTED, as the demo
 *    invents its Instagram handles: putting words in a real account's mouth is
 *    worse than an obviously ordinary byline.
 *  - INSTAGRAM: a photo post whose photo is a text graphic, so the card can
 *    show that the photo was read as well as the caption (the backend reads a
 *    photo post's cover image, scraper.py `best_image`). The image is drawn
 *    here (renderPost), invented handle, no third-party image.
 *  - ARTICLE: Paul Graham's "How to Do Great Work", a real essay, with key
 *    points and a "Do this" true to it.
 *  - NOTE: a note typed in the Note tab. The app keeps the words verbatim;
 *    "Summarize with Machina" asks /api/analyze for a read on demand
 *    (web/lib/storage.ts generateCardSummary). NOTE_READ is that answer.
 */

/** the Instagram post's photo: a carousel cover, drawn for the clip */
export async function renderPost(browser, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = await browser.newPage({ viewport: { width: 540, height: 540 }, deviceScaleFactor: 2 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 540px; height: 540px; font-family: Inter, system-ui, sans-serif; background: #E9EEF2; color: #17324A; }
    .wrap { position: absolute; inset: 28px; border-radius: 30px; background: #F8FAFB; padding: 40px 42px; }
    .k { font-size: 15px; font-weight: 700; letter-spacing: 0.14em; color: #2F7A8C; text-transform: uppercase; }
    h1 { font-size: 44px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 800; margin: 14px 0 22px; }
    li { list-style: none; font-size: 21px; line-height: 1.3; padding: 9px 0; border-top: 1px solid #E1E8EC; }
    li b { color: #2F7A8C; margin-right: 10px; }
    .h { position: absolute; bottom: 34px; left: 42px; font-size: 14px; font-weight: 600; color: #6B8496; }
  </style></head><body><div class="wrap">
    <div class="k">Carry-on only</div>
    <h1>One week,<br>one small bag.</h1>
    <ul>
      <li><b>1</b>Pack for four days, wash once.</li>
      <li><b>2</b>Every top goes with every bottom.</li>
      <li><b>3</b>Wear the bulkiest things on the plane.</li>
      <li><b>4</b>Decant liquids into 100 ml bottles.</li>
    </ul>
    <div class="h">@slowcoasts</div>
  </div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const file = path.join(dir, 'post-1.png');
  await p.screenshot({ path: file });
  await p.close();
  return file;
}

const card = (c) => ({
  status: 'unread',
  language: 'en',
  reminderStatus: 'none',
  hideThumbnail: true,
  collectionIds: [],
  relatedLinks: [],
  ...c,
});

/** the tour's cards, in the order the clip shows them */
export const sourceCards = (postUrl) => [
  {
    id: 'src-youtube',
    doc: card({
      url: 'https://www.youtube.com/watch?v=big-think-clip',
      title: 'How to overcome your addiction to technology',
      summary:
        "Modern technology is designed to hijack the brain's natural **dopamine** system, creating a cycle of anticipation and reward that leads to addiction. The way out is deliberate: tech-free times, tech-free zones and tech fasts.",
      detailedSummary: [
        '## Key Points',
        '- Dopamine is not a pleasure hormone; it is the anticipation of reward.',
        '- Apps are built around that anticipation, which is why they are hard to put down.',
        '- Three protocols break the habit: tech-free times, tech-free zones and tech fasts.',
        '- Turning off color on screens weakens the pull of visual stimulation.',
      ].join('\n'),
      actionableTakeaway: 'Pick one tech-free zone at home, like the dinner table, and keep it for a week.',
      category: 'Tech',
      tags: ['dopamine', 'habits', 'screen time'],
      concepts: ['habits', 'technology', 'attention'],
      sourceType: 'youtube',
      sourceName: 'YouTube',
      metadata: {
        originalTitle: 'How to overcome your addiction to technology',
        estimatedReadTime: 30,
        youtubeChannel: 'Big Think Clips',
        videoId: 'big-think-clip',
        videoHighlights: [
          '2:24 Explains that dopamine is not a pleasure hormone but an anticipation of reward.',
          '6:44 Identifies the dorsal anterior cingulate cortex as the part of the brain dedicated to social exclusion sadness.',
          '19:20 Outlines three categories of protocols to break tech habits: tech-free times, tech-free zones, and tech fasts.',
          '26:20 Suggests turning off color on screens to reduce the hook of visual stimulation.',
        ],
      },
    }),
  },
  {
    id: 'src-x',
    doc: card({
      url: 'https://x.com/marginalia/status/1840000000000000000',
      title: 'How I read 40 books a year without speed reading',
      summary:
        'An X Article on reading more by reading **every day**, not faster: a small daily page count, a book always within reach, and permission to quit the ones that do not earn their time.',
      detailedSummary: [
        '## Key Points',
        '- Twenty pages a day adds up to about 40 books a year.',
        '- Keep a book everywhere you wait: the bag, the car, the bedside.',
        '- Quit a book at page 50 if it has not earned the rest.',
        '- Write three lines on the last page when you finish, or it fades.',
      ].join('\n'),
      actionableTakeaway: 'Read twenty pages tonight, before your phone.',
      category: 'Books',
      tags: ['reading', 'habits'],
      concepts: ['reading', 'habits'],
      sourceType: 'web',
      sourceName: '@marginalia',
      metadata: { originalTitle: 'How I read 40 books a year without speed reading', estimatedReadTime: 9 },
    }),
  },
  {
    id: 'src-instagram',
    doc: card({
      url: 'https://www.instagram.com/p/slowcoasts-carry-on/',
      title: 'One week, one small bag',
      summary:
        'A carry-on packing system from the post and its caption: pack for **four days and wash once**, choose clothes that all mix, wear the bulkiest layers on the plane, and decant liquids into 100 ml bottles.',
      detailedSummary: [
        '## Key Points',
        '- Pack for four days and do one wash, however long the trip.',
        '- Every top should go with every bottom.',
        '- Wear the heaviest shoes and jacket on the plane.',
        '- The caption adds: roll clothes, and keep one outfit in your personal bag.',
      ].join('\n'),
      actionableTakeaway: 'Lay out four days of clothes for your next trip and leave the rest.',
      category: 'Travel',
      tags: ['packing', 'carry-on', 'travel tips'],
      concepts: ['travel', 'packing'],
      sourceType: 'web',
      sourceName: '@slowcoasts',
      hideThumbnail: false,
      metadata: { originalTitle: 'One week, one small bag', estimatedReadTime: 1, thumbnailUrl: postUrl },
    }),
  },
  {
    id: 'src-article',
    doc: card({
      url: 'https://paulgraham.com/greatwork.html',
      title: 'How to Do Great Work',
      summary:
        'Choose work you have a natural aptitude for and a **deep interest** in, learn enough to reach the frontier, then notice the gaps. Curiosity, delight and the desire to do something impressive, in that order.',
      detailedSummary: [
        '## Key Points',
        '- Pick a field from aptitude and interest, not from what seems prestigious.',
        '- Learn enough to reach the frontier, where the gaps become visible.',
        '- Curiosity is the engine: follow the questions you cannot stop asking.',
        '- Work on your own projects; great work often starts as something that looks like play.',
        '- Consistency beats bursts: small daily progress compounds.',
      ].join('\n'),
      actionableTakeaway: 'Spend an hour this week on the question you are most curious about.',
      category: 'Career',
      tags: ['curiosity', 'ambition', 'work'],
      concepts: ['work', 'curiosity', 'career'],
      sourceType: 'web',
      sourceName: 'Paul Graham',
      metadata: { originalTitle: 'How to Do Great Work', estimatedReadTime: 45 },
    }),
  },
  {
    id: 'src-note',
    doc: card({
      url: '',
      title: 'Kitchen: after the contractor visit',
      summary: [
        'Kitchen: after the contractor visit',
        '',
        'Marco came by at 10. He thinks the wall between the kitchen and the dining room can go, but only if the beam is checked first, and the engineer is booked out three weeks.',
        'Quote for cabinets and counters is 14,500, not counting the floor. He says the floor should wait until the end or it gets wrecked.',
        'We still have to pick the counter (quartz vs wood), and tell him by Friday if we want the extra outlet by the window.',
        'Start date could be the 12th if the beam is fine.',
      ].join('\n'),
      category: 'Home',
      tags: ['renovation', 'kitchen'],
      concepts: ['home', 'renovation'],
      sourceType: 'note',
      sourceName: 'Note',
      metadata: { originalTitle: 'Kitchen: after the contractor visit', estimatedReadTime: 1 },
    }),
  },
];

/** what /api/analyze answers when the note is summarized on demand */
export const NOTE_READ = {
  summary: 'The kitchen wall can come down if the **beam checks out**; the engineer is three weeks out, so that sets the start date.',
  detailedSummary: [
    '## Key Points',
    '- Cabinets and counters: 14,500, floor not included, and the floor goes in last.',
    '- Decide by Friday: quartz or wood counter, and the outlet by the window.',
    '- Earliest start is the 12th, if the beam is fine.',
  ].join('\n'),
};

/** the Facebook share in the clip's "any app" montage (motion graphics, not a
 *  capture): an invented local page, like the demo's invented handles */
export const FACEBOOK_SHARE = { by: 'Riverside Market', title: 'The Saturday market is back, 8 to 1' };
