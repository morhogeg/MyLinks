/**
 * Guards for URLs that came from scraped page metadata (e.g. `thumbnailUrl`)
 * before they reach an attribute sink like `<img src>`.
 *
 * A `javascript:`/`data:` value in `img src` doesn't execute script, but
 * non-https schemes still leak referer/mixed-content and are never legitimate
 * for scraped thumbnails — every real source serves https. Constrain to
 * `https:` and let callers fall back to their placeholder (audit L6).
 */
export function httpsImageSrc(url: string | undefined | null): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url).protocol === 'https:' ? url : undefined;
    } catch {
        return undefined;
    }
}
