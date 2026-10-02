/**
 * The trip ad's own capture material (the take itself is `adtrip` in
 * shoot.mjs). The trip's saves (`TRIP_CARDS` in library.mjs) are written onto
 * the in-memory store as the Firestore documents the backend writes for a
 * finished card, field for field the shape capture/shims/seed.ts gives the
 * demo account's cards, so the real app renders them with its real
 * components. They live outside the seeded account so no other video's take
 * changes.
 */

import { CAPTURE_USER, DAY, TRIP_CARDS } from './library.mjs';

/** [path, data] for each trip card, as of `now` (ms) */
export const tripDocs = (now) =>
  TRIP_CARDS.map((c) => {
    const createdAt = Math.round(now - c.age * DAY);
    const card = {
      url: c.url,
      title: c.title,
      summary: c.summary,
      detailedSummary: c.summary,
      tags: c.tags,
      category: c.category,
      status: c.status,
      createdAt,
      sourceType: c.sourceType,
      language: 'en',
      concepts: c.concepts,
      relatedLinks: [],
      collectionIds: [],
      reminderStatus: 'none',
      // no third-party imagery (brand rule): the app's plain text card
      hideThumbnail: true,
      metadata: {
        originalTitle: c.title,
        estimatedReadTime: c.readTime,
        ...(c.youtubeChannel ? { youtubeChannel: c.youtubeChannel } : {}),
      },
      sourceName: c.sourceName,
    };
    return [`users/${CAPTURE_USER.uid}/links/${c.id}`, card];
  });
