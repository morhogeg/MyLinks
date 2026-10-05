/**
 * The demo library (capture/library.mjs) as the Firestore documents the app
 * reads: the user doc, every card under users/{uid}/links, collections, and
 * today's Daily Brew digest. Shapes follow web/lib/types.ts (`Link`,
 * `Collection`, `CuratedDigest`) field for field, because the app renders
 * whatever is here with its real components.
 */
import { CAPTURE_USER, CARDS, COLLECTIONS, DAILY_BREW, EDGES } from './library.mjs';
import type { Data } from './store';

const DAY = 86_400_000;

export function seedEntries(now: number): [string, Data][] {
  const uid = CAPTURE_USER.uid;
  const out: [string, Data][] = [];

  out.push([
    `users/${uid}`,
    {
      authUids: [uid],
      email: CAPTURE_USER.email,
      displayName: CAPTURE_USER.displayName,
      createdAt: now - 400 * DAY,
      aiConsentAt: now - 400 * DAY,
      onboarded: true,
      // stamped current, so the app does not start a background re-link of
      // every card (lib/rebuildConnections.ts) in the middle of a capture
      graphVersion: 2,
      settings: {
        theme: 'light',
        daily_digest: true,
        reminders_enabled: true,
        reminder_frequency: 'smart',
        push_enabled: true,
        reminders_channel: ['push'],
        digest_enabled: true,
        digest_frequency: 'daily',
        digest_channels: ['push'],
        digest_mode: 'smart',
        digest_topics: [],
        digest_topic: null,
        digest_count: 5,
        digest_hour: 8,
        digest_minute: 0,
        digest_day: 0,
        digest_skip_empty: true,
        synthesis_enabled: true,
        synthesis_day: 6,
      },
    },
  ]);

  const related = new Map<string, Data[]>();
  const title = (id: string) => CARDS.find((c) => c.id === id)?.title ?? id;
  const link = (a: string, b: string, reason: string, common: string[], sim: number) => {
    const list = related.get(a) ?? [];
    list.push({ id: b, title: title(b), reason, similarity: sim, commonConcepts: common });
    related.set(a, list);
  };
  EDGES.forEach(([a, b, reason, common], i) => {
    const sim = 0.86 - (i % 5) * 0.03;
    link(a as string, b as string, reason as string, common as string[], sim);
    link(b as string, a as string, reason as string, common as string[], sim);
  });

  const collectionIds = (id: string) => COLLECTIONS.filter((c) => c.cards.includes(id)).map((c) => c.id);

  for (const c of CARDS) {
    const createdAt = Math.round(now - c.age * DAY);
    const card: Data = {
      url: c.url,
      title: c.title,
      summary: c.summary,
      detailedSummary: (c as { detail?: string }).detail ?? c.summary,
      tags: c.tags,
      category: c.category,
      status: c.status,
      createdAt,
      sourceType: c.sourceType,
      language: 'en',
      concepts: c.concepts,
      relatedLinks: related.get(c.id) ?? [],
      collectionIds: collectionIds(c.id),
      reminderStatus: 'none',
      // No third-party imagery in the reel (brand rule): every card renders as
      // the app's plain text card.
      hideThumbnail: true,
      metadata: {
        originalTitle: c.title,
        estimatedReadTime: c.readTime,
        ...(c.youtubeChannel ? { youtubeChannel: c.youtubeChannel } : {}),
      },
    };
    if (c.sourceName) card.sourceName = c.sourceName;
    if (c.recipe) card.recipe = c.recipe;
    if (c.note) card.userNotes = [{ id: `${c.id}-note`, text: c.note, createdAt: createdAt + 3_600_000 }];
    out.push([`users/${uid}/links/${c.id}`, card]);
  }

  for (const col of COLLECTIONS) {
    out.push([
      `users/${uid}/collections/${col.id}`,
      {
        name: col.name,
        color: col.color,
        createdAt: now - col.age * DAY,
        updatedAt: now - 2 * DAY,
      },
    ]);
  }

  const today = new Date(now);
  const digestId = today.toISOString().slice(0, 10);
  const brewAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0).getTime();
  out.push([
    `users/${uid}/digests/${digestId}`,
    {
      createdAt: Math.min(brewAt, now - 60_000),
      mode: 'smart',
      frequency: 'daily',
      title: 'Your Daily Brew',
      topics: [],
      cardCount: DAILY_BREW.length,
      cards: DAILY_BREW.map((id) => {
        const c = CARDS.find((x) => x.id === id)!;
        return { id, title: c.title, category: c.category, summary: c.summary, sourceName: c.sourceName ?? null, url: c.url };
      }),
    },
  ]);

  return out;
}
