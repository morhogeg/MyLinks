/**
 * Which addresses can be saved, and what kind of page they are.
 *
 * Machina's server reads a page from its address, so only http(s) pages can
 * be saved. Browser pages (chrome://, edge://, the new-tab page), local files
 * and data: addresses are refused here, before anything is sent.
 */

const BROWSER_SCHEMES = new Set([
    'chrome:', 'chrome-extension:', 'chrome-search:', 'chrome-untrusted:', 'devtools:',
    'edge:', 'brave:', 'opera:', 'vivaldi:', 'about:', 'view-source:',
    'extension:', 'moz-extension:', 'safari-web-extension:',
]);

/**
 * @param {string | undefined} url
 * @returns {{ ok: true } | { ok: false, reason: 'browser' | 'file' | 'other' }}
 */
export function savability(url) {
    let parsed;
    try {
        parsed = new URL(String(url || ''));
    } catch {
        return { ok: false, reason: 'other' };
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.hostname ? { ok: true } : { ok: false, reason: 'other' };
    }
    if (parsed.protocol === 'file:') return { ok: false, reason: 'file' };
    if (BROWSER_SCHEMES.has(parsed.protocol)) return { ok: false, reason: 'browser' };
    return { ok: false, reason: 'other' };
}

/** Lower-case hostname, or '' for anything unparsable. */
export function hostOf(url) {
    try {
        return new URL(String(url)).hostname.toLowerCase();
    } catch {
        return '';
    }
}

/** True when `host` is `domain` or one of its subdomains. */
export function hostIs(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
}

/** Short, readable form for display: host + path, no scheme, no "www.". */
export function displayUrl(url) {
    try {
        const u = new URL(String(url));
        const host = u.hostname.replace(/^www\./, '');
        const path = u.pathname === '/' ? '' : u.pathname;
        return `${host}${path}`;
    } catch {
        return String(url || '');
    }
}

/**
 * Sites whose posts Machina's server can only read as a preview (they serve
 * cloud servers a login wall). The popup suggests adding a screenshot there.
 * Instagram and TikTok are handled differently: the extension reads the post
 * on the page (see capture.js) and sends it along.
 */
const PREVIEW_ONLY_SITES = [
    { domain: 'linkedin.com', name: 'LinkedIn' },
    { domain: 'facebook.com', name: 'Facebook' },
];

/** The display name of a preview-only site, or null. */
export function previewOnlySite(url) {
    const host = hostOf(url);
    const site = PREVIEW_ONLY_SITES.find((s) => hostIs(host, s.domain));
    return site ? site.name : null;
}

/** 'instagram' | 'tiktok' | null. Matches the server's _PAGE_PREVIEW_HOSTS. */
export function socialPostSite(url) {
    const host = hostOf(url);
    if (hostIs(host, 'instagram.com')) return 'instagram';
    if (hostIs(host, 'tiktok.com')) return 'tiktok';
    return null;
}

/**
 * The id of the post an Instagram or TikTok address points at, used to make
 * sure the preview tags on the page belong to the post on screen (both sites
 * are single-page apps, so after in-app navigation the tags can be stale).
 *   instagram.com/p/<code>/, /reel/<code>/, /tv/<code>/, /<user>/p/<code>/
 *   tiktok.com/@<user>/video/<id>, /@<user>/photo/<id>
 * @returns {string | null}
 */
export function socialPostId(url) {
    let u;
    try {
        u = new URL(String(url));
    } catch {
        return null;
    }
    const host = u.hostname.toLowerCase();
    if (hostIs(host, 'instagram.com')) {
        const m = u.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
        return m ? m[1] : null;
    }
    if (hostIs(host, 'tiktok.com')) {
        const m = u.pathname.match(/\/(?:video|photo)\/(\d+)/);
        return m ? m[1] : null;
    }
    return null;
}

/** The @handle in a TikTok or profile-scoped Instagram address, or ''. */
export function socialHandle(url) {
    let u;
    try {
        u = new URL(String(url));
    } catch {
        return '';
    }
    const host = u.hostname.toLowerCase();
    if (hostIs(host, 'tiktok.com')) {
        const m = u.pathname.match(/^\/@([A-Za-z0-9._]{1,64})\//);
        return m ? m[1] : '';
    }
    if (hostIs(host, 'instagram.com')) {
        const m = u.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/(?:p|reel|tv)\//);
        return m && !['p', 'reel', 'reels', 'tv', 'explore', 'stories'].includes(m[1]) ? m[1] : '';
    }
    return '';
}

/** An https URL on the given CDN domains, or ''. */
export function httpsOn(url, domains) {
    let u;
    try {
        u = new URL(String(url));
    } catch {
        return '';
    }
    if (u.protocol !== 'https:') return '';
    const host = u.hostname.toLowerCase();
    return domains.some((d) => hostIs(host, d)) ? u.href : '';
}
