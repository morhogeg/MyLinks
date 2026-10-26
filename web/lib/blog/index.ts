import type { Post } from './types';
import whatIsASecondBrain from './posts/what-is-a-second-brain';
import bestSecondBrainApps from './posts/best-second-brain-apps';
import readLaterVsSecondBrain from './posts/read-later-app-vs-second-brain';
import activeRecall from './posts/active-recall';
import spacedRepetition from './posts/spaced-repetition';
import forgettingCurve from './posts/forgetting-curve';
import rememberWhatYouRead from './posts/how-to-remember-what-you-read';
import saveTikTokInstagram from './posts/save-tiktok-and-instagram-videos';
import searchableScreenshots from './posts/make-screenshots-searchable';
import saveRecipes from './posts/save-recipes-from-instagram-and-tiktok';
import neverLookAgain from './posts/why-you-never-look-at-saved-posts-again';

/**
 * Every published post. To add one: write `posts/<slug>.ts` (see `types.ts`),
 * import it here. The blog index, sitemap, RSS feed and llms.txt all read this
 * list, so nothing else needs touching.
 */
const ALL: Post[] = [
    whatIsASecondBrain,
    activeRecall,
    bestSecondBrainApps,
    neverLookAgain,
    forgettingCurve,
    saveTikTokInstagram,
    spacedRepetition,
    readLaterVsSecondBrain,
    rememberWhatYouRead,
    searchableScreenshots,
    saveRecipes,
];

/** Newest first; ties keep the curated order above. */
export const POSTS: Post[] = [...ALL].sort((a, b) => b.date.localeCompare(a.date));

export function getPost(slug: string): Post | undefined {
    return POSTS.find((p) => p.slug === slug);
}

/** Words per minute for the "x min read" line. */
export function readingMinutes(post: Post) {
    return Math.max(1, Math.round(post.body.split(/\s+/).length / 230));
}

/** Up to `n` other posts, same category first. */
export function relatedPosts(post: Post, n = 3): Post[] {
    const others = POSTS.filter((p) => p.slug !== post.slug);
    const same = others.filter((p) => p.category === post.category);
    const rest = others.filter((p) => p.category !== post.category);
    return [...same, ...rest].slice(0, n);
}
