/**
 * Instagram reel posters arrive with a play triangle BURNED INTO THE PIXELS.
 * Nothing in this app draws that glyph — the card and detail views render the
 * poster as a bare <img> — so it comes from Instagram's CDN, which composites
 * the overlay as one of the transforms listed in the URL's `stp=` parameter
 * (an underscore-joined token list: crop, size, sharpen… and, for video posts,
 * a `tt<N>` overlay token). Dropping that token asks the CDN for the same frame
 * without the badge.
 *
 * Done on the CLIENT as well as in the scraper (functions/scraper.py —
 * `_instagram_poster_without_play_badge`, its TWIN: same token rule) because the
 * scraper can only fix posters saved from now on, while every reel already in
 * the library carries a badged URL in `metadata.thumbnailUrl`. Rewriting at
 * render time repairs those too, with no migration.
 *
 * Both sides are best-effort by construction: the server verifies its candidate
 * before storing it, and `PosterImage` falls back to the original URL on any
 * load error — so a URL the CDN won't serve costs a re-render, never a hole
 * where the picture should be.
 */

const PLAY_BADGE_TOKEN = /^tt\d+$/;

/**
 * The same poster without the play-overlay transform, or `null` when the URL
 * carries no such transform (a bridge-served poster, a plain photo cover, a
 * YouTube thumbnail — all left exactly as they are, no rewrite attempted).
 */
export function posterWithoutPlayBadge(url: string | undefined | null): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        const stp = parsed.searchParams.get('stp');
        if (!stp) return null;
        const tokens = stp.split('_');
        const kept = tokens.filter((t) => !PLAY_BADGE_TOKEN.test(t));
        if (kept.length === tokens.length) return null;
        if (kept.length) parsed.searchParams.set('stp', kept.join('_'));
        else parsed.searchParams.delete('stp');
        return parsed.toString();
    } catch {
        // A stored value that isn't a parseable URL — leave it alone.
        return null;
    }
}
