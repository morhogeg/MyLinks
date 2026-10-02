// URL → platform detection, kept free of JSX so `npm run test:platform` can
// import it directly. platform.tsx re-exports everything here.

/**
 * Recognized content platforms we can detect from a link's URL. Generic web
 * pages return null — their publisher name already conveys origin.
 */
export type PlatformKey = 'youtube' | 'x' | 'instagram' | 'linkedin' | 'facebook' | 'github';

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
    youtube: 'YouTube',
    x: 'X',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
    github: 'GitHub',
};

/** Map a link URL to its platform via the hostname (null = generic web). */
export function getPlatform(url?: string): PlatformKey | null {
    if (!url) return null;
    let host = '';
    try {
        host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return null;
    }
    const is = (d: string) => host === d || host.endsWith(`.${d}`);
    if (is('youtube.com') || is('youtu.be')) return 'youtube';
    if (is('twitter.com') || is('x.com')) return 'x';
    if (is('instagram.com')) return 'instagram';
    // lnkd.in is LinkedIn's own shortener: a share can hand over that form, and
    // the card keeps the URL as shared, so it must read as LinkedIn too.
    if (is('linkedin.com') || is('lnkd.in')) return 'linkedin';
    if (is('facebook.com') || is('fb.com') || is('fb.watch')) return 'facebook';
    if (is('github.com')) return 'github';
    return null;
}

const STAMPABLE_PLATFORMS = new Set<PlatformKey>(['youtube', 'x', 'instagram', 'linkedin', 'facebook']);

/**
 * The platform of a saved LINK card: its URL's host first, else the platform
 * the backend stamped from where the scrape actually landed (`sourcePlatform`,
 * see main._scrape_extras). The stamp covers any short or redirect URL form a
 * share sheet hands over, so the brand mark never depends on the URL's shape.
 * Screenshot cards are excluded: their `sourcePlatform` is the app read off the
 * image (see screenshotSource), a different claim with its own byline.
 */
export function linkPlatform(link: { url?: string; sourceType?: string; sourcePlatform?: string | null }): PlatformKey | null {
    const fromUrl = getPlatform(link.url);
    if (fromUrl || link.sourceType === 'image') return fromUrl;
    const stamped = (link.sourcePlatform || '').trim().toLowerCase() as PlatformKey;
    return STAMPABLE_PLATFORMS.has(stamped) ? stamped : null;
}
