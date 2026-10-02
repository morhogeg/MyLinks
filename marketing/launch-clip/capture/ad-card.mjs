/**
 * Meta ad 1, "What one save becomes" (take `adcard` in shoot.mjs): ONE save,
 * fully read. The card is the SAVE clip's YouTube card, the app's own output
 * for a real video copied from the owner's phone (Big Think Clips, "How to
 * overcome your addiction to technology"; capture/clip-save.mjs sourceCards,
 * reused as is: title, channel, gist, the four Key moments and their
 * timestamps).
 *
 * The one thing added here is its Related row: three real cards of the demo
 * account that the backend would plausibly tie to a talk about dopamine and
 * screen habits, each with a one-line reason in the app's own style (the
 * Related cards' "why"). Every reason is true of both cards: Tim Urban's
 * Instant Gratification Monkey is the pull of instant reward; Oliver
 * Burkeman's Four Thousand Weeks is about where limited time and attention
 * go; James Clear's line is that systems, not goals, change habits, and the
 * talk's tech-free times and zones are such systems.
 */

import { CARDS } from './library.mjs';
import { sourceCards } from './clip-save.mjs';

const title = (id) => CARDS.find((c) => c.id === id).title;

export const AD_CARD_ID = 'ad-youtube';

/** the stored relations, in the order the card lists them */
export const AD_RELATED = [
  {
    id: 'procrastinator',
    reason: 'Both are about the pull of instant reward over what matters more.',
    similarity: 0.87,
    commonConcepts: ['habits', 'attention'],
  },
  {
    id: 'fourthousand',
    reason: 'Both ask where your limited time and attention should go.',
    similarity: 0.83,
    commonConcepts: ['attention', 'time'],
  },
  {
    id: 'systems',
    reason: 'Tech-free times and zones are systems, and systems change habits.',
    similarity: 0.82,
    commonConcepts: ['habits'],
  },
];

/** the card as the backend writes it, with its Related row */
export const adCard = () => {
  const yt = sourceCards('').find((c) => c.id === 'src-youtube').doc;
  return {
    ...yt,
    relatedLinks: AD_RELATED.map((r) => ({ ...r, title: title(r.id) })),
  };
};
