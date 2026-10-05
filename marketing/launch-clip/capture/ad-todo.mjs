/**
 * Meta ad 3's capture material (the take itself is `adTodo` in shoot.mjs).
 * Round 5 (owner-approved script: "Share anything to Machina." / "From any
 * app. Even screenshots." / "Analyzed, summarized, and linked to related
 * saves."). Everything the app shows is the app; what stands in for the
 * outside world and the backend is here:
 *
 *  - SOURCES: four saves from four places, landing at the top of the feed one
 *    after another, the screenshot last (on "Even screenshots"):
 *     - a YOUTUBE video: the app's own output for a real video, copied from
 *       the owner's phone (2026-09-29, the SAVE clip's card), verbatim.
 *       `videoId` is a stand-in (the card hides its thumbnail; nothing plays);
 *     - an INSTAGRAM post whose photo is a text graphic (drawn here,
 *       renderPost; the demo's invented @slowcoasts; no third-party image);
 *     - an ARTICLE and a SCREENSHOT: the demo account's own cards (Mark
 *       Manson's essay, "Read Piranesi, and go in blind"), RE-SAVED: the take
 *       moves them to the top with their links intact.
 *  - LINKS: the two new saves' related saves, both ways, each with the reason
 *    the app shows (the graph draws them).
 *  - HIDDEN: taken out of the take's store: the recipe cards and their
 *    collection (owner, 2026-10-02), and, for Meta's ad review, the money and
 *    workout cards. No Daily Brew or weekly recap is seeded.
 */

import fs from 'node:fs';
import path from 'node:path';

/** where the capture server serves the post's photo from (its static root) */
export const SHOTS_DIR = 'ad-todo-shots';

/** the Instagram post's photo: a carousel cover, drawn for the ad */
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

/** the four saves, in the order they land (the last lands on top). `reuse`:
 *  a card the demo account already has, re-saved (its doc is kept) */
export const sourceCards = (postUrl) => [
  {
    key: 'youtube',
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
    key: 'instagram',
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
      category: 'Travel',
      tags: ['packing', 'carry-on', 'travel tips'],
      concepts: ['travel', 'packing'],
      sourceType: 'web',
      sourceName: '@slowcoasts',
      hideThumbnail: false,
      metadata: { originalTitle: 'One week, one small bag', estimatedReadTime: 1, thumbnailUrl: postUrl },
    }),
  },
  { key: 'article', id: 'question', reuse: true },
  { key: 'screenshot', id: 'piranesi', reuse: true },
];

/** the new saves' related saves, drawn both ways: [new, demo card, reason,
 *  common concepts] */
export const LINKS = [
  ['src-youtube', 'procrastinator', 'Why the easy thing wins over the thing you meant to do.', ['attention', 'habits']],
  ['src-youtube', 'systems', 'Habits that run on autopilot, and how to change them.', ['habits']],
  ['src-instagram', 'goloritze', 'The same traveller, the same way of travelling.', ['travel']],
  ['src-instagram', 'tmb', 'Packing light for days on the move.', ['travel', 'packing']],
];

/** taken out of the take's store: the recipe cards (owner, 2026-10-02: no
 *  recipes in frame), their collection, and, for Meta's ad review, the
 *  cards about money and a workout (nothing in an ad frame should read as a
 *  claim about the viewer's finances or health) */
export const HIDDEN = ['marcella', 'chicken', 'coffee', 'naval', 'money', 'yoga'];
export const HIDDEN_COLLECTIONS = ['cook'];
