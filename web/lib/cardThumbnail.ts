/**
 * THE single answer to "what image does this card show in its closed state?"
 *
 * Link/video cards carry a scraped poster at `metadata.thumbnailUrl`.
 * **Screenshot captures have no such field** — the capture itself IS the image,
 * stored at `link.url` — so gating the banner (and the ⋯ → Hide/Show image
 * toggle) on `metadata.thumbnailUrl` silently excluded them: a screenshot card
 * showed its picture in the detail modal but never in the feed.
 *
 * Every surface that draws a card banner or offers the toggle reads this, so
 * the two can never disagree about whether a card has an image.
 */

import { isHttpUrl } from './url';

export interface ThumbnailLink {
    url?: string;
    sourceType?: string;
    metadata?: { thumbnailUrl?: string };
}

export function cardThumbnailUrl(link: ThumbnailLink): string | null {
    if (link.sourceType === 'image') {
        // Guard the scheme — never render a stored javascript:/data: URL.
        return isHttpUrl(link.url) ? link.url! : null;
    }
    return link.metadata?.thumbnailUrl || null;
}
