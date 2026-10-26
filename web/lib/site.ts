/**
 * The public website's identity, in one place: what search engines, link
 * previews and AI assistants are told Machina is. Used by the metadata in
 * `app/layout.tsx` and `app/welcome/page.tsx`, the JSON-LD in `lib/seo.ts`,
 * `app/robots.ts`, `app/sitemap.ts`, `app/llms.txt` and the blog.
 *
 * Website copy MAY say "second brain" and "AI" (owner call 2026-10-26,
 * `docs/BRANDING.md` D-3 scope note): D-3 governs the App Store storefront and
 * the app itself, not the marketing site. The name is still never "Machina AI"
 * (D-1).
 */
export const SITE_URL = 'https://mymachina.app';
export const SITE_NAME = 'Machina';
export const TAGLINE = 'Everything you save, finally useful.';

/** The home page's search title and description. */
export const HOME_TITLE = 'Machina: the AI second brain for everything you save';
export const HOME_DESCRIPTION =
    'Save links, screenshots, TikToks, Reels and YouTube videos from any app. '
    + 'Machina summarizes each one, connects it to what you saved before, and '
    + 'answers your questions with citations to your own saves. iPhone and web.';

/**
 * The numeric App Store id (App Store Connect → App Information → Apple ID).
 * Not known to the repo yet. Setting it turns on Safari's Smart App Banner on
 * the website and adds the App Store install URL to the JSON-LD; nothing
 * else depends on it.
 */
export const APP_STORE_ID: string | null = null;
export const APP_STORE_URL = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

/** Machina's own accounts (the landing footer's order). */
export const SOCIAL_URLS = [
    'https://x.com/machinaapp',
    'https://www.instagram.com/machinaapp',
    'https://www.tiktok.com/@machinaapp',
    'https://www.youtube.com/@MachinaApp',
];

/** The site-wide preview card (`app/opengraph-image.tsx`), for pages that set
 *  their own Open Graph block and so don't inherit it. */
export const SITE_OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: `Machina: ${TAGLINE}` };

export const SUPPORT_EMAIL = 'support@mymachina.app';
