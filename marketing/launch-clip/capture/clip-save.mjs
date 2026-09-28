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
