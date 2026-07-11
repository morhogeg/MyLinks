import type { Link } from './types';

/**
 * A hand-crafted example card seeded into a brand-new account with one tap from
 * the empty feed ("Try it with an example"). It gives Ask, semantic search, and
 * Collections something real to work against in the first minute — before the
 * user has captured anything of their own.
 *
 * It is written client-side through the normal `saveLink` path (NOT the analyze
 * pipeline), so seeding is instant and offline-safe. `saveLink` stamps
 * `createdAt`/`status`/`isRead`, and the `sync_link_embedding` Firestore trigger
 * embeds it server-side because `needsEmbedding` is set — so it becomes fully
 * searchable/askable just like a real save.
 *
 * `isExample: true` marks it so it can be recognized, filtered, or cleaned up
 * later. The URL points at a real, stable, on-topic page so tapping through the
 * card lands somewhere sensible.
 */
type ExampleCard = Partial<Link> & { isExample: true; needsEmbedding: true };

export const EXAMPLE_CARD: ExampleCard = {
    url: 'https://en.wikipedia.org/wiki/Spaced_repetition',
    title: 'Spaced Repetition: Why Spacing Beats Cramming',
    summary:
        'Reviewing material at gradually widening intervals cements it in long-term memory far better than cramming — the science behind flashcard apps and durable learning.',
    detailedSummary:
        "Spaced repetition schedules each review for the moment you're about to forget something, forcing an effortful recall that strengthens the memory a little more every time. It builds on Hermann Ebbinghaus's \"forgetting curve\" and was refined by systems like the Leitner box and SuperMemo. The practical payoff: to remember something for years, don't study it harder — study it later, and then later again. Minutes of well-timed practice beat hours of passive re-reading.",
    category: 'Learning',
    tags: ['memory', 'learning', 'productivity'],
    status: 'unread',
    sourceType: 'web',
    sourceName: 'Wikipedia',
    metadata: {
        originalTitle: 'Spaced repetition',
        estimatedReadTime: 6,
        actionableTakeaway:
            'Schedule your next review of anything important for tomorrow, then in three days, then a week.',
    },
    // Let the backend embed it so it shows up in semantic search and Ask.
    needsEmbedding: true,
    // Marker so this seeded demo card can be recognized / cleaned up later.
    isExample: true,
};
