/**
 * Canonical dedupe key for a saved URL (`urlKey` on a link doc).
 *
 * MIRRORS `functions/url_key.py` (`url_key`) rule for rule: the web form dedupes
 * against the same Firestore field the backend writes, so the two must produce
 * identical keys. functions/tests/test_url_key.py pins the cases; change both
 * files together.
 *
 * https always, host lower-cased with www./m./mobile. stripped and
 * twitter.com → x.com, YouTube short forms → youtube.com/watch?v=ID, no
 * fragment (except a hash route like `#/inbox` or `#!/post`, which IS the page
 * in a single-page app), no trailing slash, tracking params dropped, remaining params sorted.
 * Returns '' for anything that isn't an http(s) URL with a host.
 */

const TRACKING_PARAMS = new Set([
    'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid',
    'twclid', 'ttclid', 'li_fat_id', 'igsh', 'igshid', 'ref', 'ref_src',
    'ref_url', '_ga', '_gl', 'mkt_tok', 'oly_anon_id', 'oly_enc_id',
    'vero_id', 'wickedid', 'rb_clickid', 's_cid', '__s', '_hsenc', '_hsmi',
    'spm', 'share_id', 'sharesource', 'cmpid',
]);
const TRACKING_PREFIXES = ['utm_', 'mc_', 'pk_', 'hsa_'];

const HOST_TRACKING: Record<string, Set<string>> = {
    'x.com': new Set(['s', 't']),
    'youtube.com': new Set(['si', 'feature', 'pp']),
    'open.spotify.com': new Set(['si', 'context', 'nd']),
    'spotify.com': new Set(['si']),
    'instagram.com': new Set(['img_index']),
};

const HOST_PREFIXES = ['www.', 'm.', 'mobile.'];
const HOST_ALIASES: Record<string, string> = { 'twitter.com': 'x.com' };
const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com'];
const YOUTUBE_PATH_IDS = ['/shorts/', '/live/', '/embed/', '/v/'];

function cleanHost(raw: string): string {
    let host = raw.trim().toLowerCase().replace(/\.+$/, '');
    for (const prefix of HOST_PREFIXES) {
        if (host.startsWith(prefix) && host.split('.').length - 1 >= 2) {
            host = host.slice(prefix.length);
            break;
        }
    }
    return HOST_ALIASES[host] ?? host;
}

function validYtId(value: string): string | null {
    const v = (value || '').trim();
    return v.length >= 6 && v.length <= 20 && /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
}

function youtubeId(host: string, path: string, params: [string, string][]): string | null {
    if (host === 'youtu.be') return validYtId(path.replace(/^\/+|\/+$/g, '').split('/')[0]);
    if (YOUTUBE_HOSTS.includes(host)) {
        if (path.replace(/\/+$/, '') === '/watch') {
            const v = params.find(([k]) => k === 'v');
            if (v) return validYtId(v[1]);
        }
        for (const prefix of YOUTUBE_PATH_IDS) {
            if (path.startsWith(prefix)) return validYtId(path.slice(prefix.length).split('/')[0]);
        }
    }
    return null;
}

function isTracking(key: string, host: string): boolean {
    const k = key.toLowerCase();
    if (TRACKING_PARAMS.has(k) || TRACKING_PREFIXES.some(p => k.startsWith(p))) return true;
    return HOST_TRACKING[host]?.has(k) ?? false;
}

// Python's urllib.parse.quote with the safe set url_key.py uses.
function quotePath(path: string): string {
    return path.replace(/[^A-Za-z0-9/:@!$&'()*+,;=\-._~%]/g, c => {
        try { return encodeURIComponent(c); } catch { return c; }
    });
}

// A hash route (`#/…` or `#!…`) is kept, trailing slashes trimmed; any other
// fragment (an in-page anchor) is dropped. Mirrors url_key._route_fragment.
function routeFragment(hash: string): string {
    const frag = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!frag || (frag[0] !== '/' && frag[0] !== '!')) return '';
    const trimmed = frag.replace(/\/+$/, '');
    if (trimmed === '' || trimmed === '!') return '';
    return trimmed.replace(/[^A-Za-z0-9/:@!$&'()*+,;=\-._~%?#]/g, c => {
        try { return encodeURIComponent(c); } catch { return c; }
    });
}

// Python's urlencode (quote_plus): space → '+', and !'()* escaped.
function quotePlus(s: string): string {
    return encodeURIComponent(s)
        .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
        .replace(/%20/g, '+');
}

export function urlKey(input: unknown): string {
    if (typeof input !== 'string') return '';
    const raw = input.trim();
    if (!raw) return '';
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    let host = cleanHost(parsed.hostname);
    if (!host) return '';
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') host = `${host}:${parsed.port}`;

    const path = parsed.pathname;
    const params: [string, string][] = [];
    parsed.searchParams.forEach((v, k) => { params.push([k, v]); });

    const yt = youtubeId(host, path, params);
    if (yt) return `https://youtube.com/watch?v=${yt}`;

    const cleanPath = quotePath(path).replace(/\/+$/, '');
    const kept = params
        .filter(([k]) => !isTracking(k, host))
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const query = kept.map(([k, v]) => `${quotePlus(k)}=${quotePlus(v)}`).join('&');
    const frag = routeFragment(parsed.hash);
    return `https://${host}${cleanPath}${query ? `?${query}` : ''}${frag ? `#${frag}` : ''}`;
}
