/**
 * Meta ad 1, "What one save becomes" (take `adcard` in shoot.mjs): ONE save,
 * fully read, and brought back. Round 5 (owner, 2026-10-03: the ad is about
 * saves, not videos): the save is an article, Mark Manson's "The Most
 * Important Question of Your Life", a real essay that is already in the demo
 * account (library.mjs `question`).
 *
 * In the ad it arrives as a fresh share, so the take removes the demo's copy
 * and writes this one at the top of the feed: the card as the backend writes
 * an article (capture/clip-save.mjs sourceCards `src-article`: its gist, Key
 * Points and "Do this", written for the SAVE clip true to the essay), with
 * the demo's own three connections for it (library.mjs EDGES: Naval's thread,
 * Steve Jobs' Stanford address, Bret Victor's talk, each with its reason).
 */

import { CARDS, EDGES } from './library.mjs';
import { sourceCards } from './clip-save.mjs';

const title = (id) => CARDS.find((c) => c.id === id).title;

/** the demo's copy of the essay, removed so the share is the only one */
export const DEMO_ESSAY_ID = 'question';
export const AD_CARD_ID = 'ad-essay';

/** the essay's connections, from the demo account's own graph, in this order */
const RELATED_ORDER = ['naval', 'jobs', 'bretvictor'];
export const AD_RELATED = RELATED_ORDER.map((id, k) => {
  const e = EDGES.find(([a, b]) => (a === DEMO_ESSAY_ID && b === id) || (b === DEMO_ESSAY_ID && a === id));
  return { id, reason: e[2], similarity: [0.87, 0.84, 0.83][k], commonConcepts: e[3] };
});

/** the card as the backend writes it, with its Related row */
export const adCard = () => {
  const essay = sourceCards('').find((c) => c.id === 'src-article').doc;
  return {
    ...essay,
    relatedLinks: AD_RELATED.map((r) => ({ ...r, title: title(r.id) })),
  };
};
