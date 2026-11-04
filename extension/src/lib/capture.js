/**
 * Reading the tab the user chose to save. Everything here runs only after a
 * user gesture (toolbar click, shortcut, right-click), under the temporary
 * `activeTab` grant that gesture gives: there is no access to any other page,
 * and nothing runs in the background.
 */

import { fitScreenshot } from './image.js';
import { httpsOn, socialHandle, socialPostId, socialPostSite } from './urls.js';

/** CDNs the server accepts a post image from (main.py _PAGE_PREVIEW_IMAGE_HOSTS). */
const POST_IMAGE_CDNS = ['cdninstagram.com', 'fbcdn.net', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'];

/** Field caps match the server's _PAGE_PREVIEW_LIMITS. */
const LIMITS = { title: 500, description: 5000, author: 64, url: 2048 };

/**
 * Injected into the page (top frame, isolated world), so it must be
 * self-contained: no imports, no outer variables. Returns plain data.
 */
export function readPageInFrame() {
    const attr = (selector) => {
        const el = document.querySelector(selector);
        const value = el && el.getAttribute('content');
        return value ? value.trim() : '';
    };
    const meta = (...names) => {
        for (const name of names) {
            const value = attr(`meta[property="${name}"]`) || attr(`meta[name="${name}"]`);
            if (value) return value;
        }
        return '';
    };
    const canonical = document.querySelector('link[rel="canonical"]');
    const selection = window.getSelection ? String(window.getSelection() || '') : '';

    // TikTok's feeds (For You, Following, search, a profile) keep their own
    // address while a video plays, so the address doesn't say which video the
    // user means. Find the one on screen: the only video playing, or the only
    // one mostly in view. Its player box carries the video id
    // (id="xgwrapper-<n>-<videoId>", seen on tiktok.com 2026-11-04) and its
    // item holds a link to it. Walking up, links are taken from the nearest
    // box that has any (a grid shows its neighbours a few levels further
    // up), and the walk stops at a box holding another video.
    const tiktokVideo = (() => {
        const host = location.hostname.toLowerCase();
        if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) return null;
        const shown = (el) => {
            const r = el.getBoundingClientRect();
            const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
            const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
            return { seen: w * h, whole: Math.max(1, r.width * r.height) };
        };
        const inView = [...document.querySelectorAll('video')]
            .map((v) => ({ v, ...shown(v) }))
            .filter((x) => x.seen > 0);
        const playing = inView.filter((x) => !x.v.paused && !x.v.ended);
        const mostly = inView.filter((x) => x.seen >= 0.5 * x.whole);
        const pick = playing.length === 1 ? playing[0].v
            : playing.length === 0 && mostly.length === 1 ? mostly[0].v : null;
        if (!pick) return null;
        let id = '';
        let links = new Set();
        let handles = new Set();
        for (let el = pick, depth = 0; el && depth < 25; el = el.parentElement, depth++) {
            if (el !== pick && el.querySelectorAll('video').length > 1) break;
            const m = /^xgwrapper-\d+-(\d{6,25})$/.exec(el.id || '');
            if (m && !id) id = m[1];
            const here = new Set();
            const herePeople = new Set();
            const anchors = [el, ...el.querySelectorAll('a[href]')].filter((a) => a.tagName === 'A' && a.href);
            for (const a of anchors) {
                let u;
                try { u = new URL(a.href); } catch { continue; }
                if (/\/(?:video|photo)\/\d+/.test(u.pathname)) here.add(u.origin + u.pathname);
                const only = /^\/@([A-Za-z0-9._]{1,64})\/?$/.exec(u.pathname);
                if (only) herePeople.add(only[1]);
            }
            if (!links.size && here.size) links = here;
            if (!handles.size && herePeople.size) handles = herePeople;
            if (links.size && handles.size) break;
        }
        return { id, links: [...links].slice(0, 5), handles: [...handles].slice(0, 5) };
    })();

    return {
        tiktokVideo,
        url: location.href,
        title: document.title || '',
        selection: selection.slice(0, 20000),
        og: {
            title: meta('og:title', 'twitter:title'),
            description: meta('og:description', 'twitter:description'),
            image: meta('og:image:secure_url', 'og:image', 'twitter:image'),
            url: meta('og:url'),
        },
        canonical: canonical ? canonical.href : '',
    };
}

/**
 * Injected: the video links next to every link to `href` on the page (a
 * creator's name under a video in a TikTok grid). For each such link, walk up
 * to the nearest box holding any video link; one video there counts, more
 * than one means a list, and the walk stops. Self-contained (injected).
 */
export function videosNearLinkInFrame(href) {
    const key = (raw) => {
        try {
            const u = new URL(raw, location.href);
            return u.origin + u.pathname.replace(/\/+$/, '');
        } catch {
            return '';
        }
    };
    const videoOf = (raw) => {
        try {
            const u = new URL(raw, location.href);
            return /\/(?:video|photo)\/\d+/.test(u.pathname) ? u.origin + u.pathname : '';
        } catch {
            return '';
        }
    };
    const want = key(href);
    const found = new Set();
    if (!want) return [];
    for (const a of document.querySelectorAll('a[href]')) {
        if (key(a.href) !== want) continue;
        for (let el = a.parentElement, depth = 0; el && depth < 12; el = el.parentElement, depth++) {
            const near = new Set([...el.querySelectorAll('a[href]')].map((x) => videoOf(x.href)).filter(Boolean));
            if (near.size === 1) found.add([...near][0]);
            if (near.size) break;
        }
        if (found.size > 3) break;
    }
    return [...found].slice(0, 4);
}

/** The links Chrome reports for a TikTok video next to the right-clicked link. */
export async function readVideosNearLink(tabId, frameId, href) {
    try {
        const [first] = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            func: videosNearLinkInFrame,
            args: [href],
        });
        const list = first && Array.isArray(first.result) ? first.result : [];
        return list.filter((x) => typeof x === 'string').slice(0, 4).map((x) => x.slice(0, LIMITS.url));
    } catch {
        return [];
    }
}

/** Injected: the selection in one frame (keeps line breaks, unlike menu text). */
export function readSelectionInFrame() {
    return window.getSelection ? String(window.getSelection() || '').slice(0, 20000) : '';
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Shape-check what came back from the page; the page is untrusted. */
export function cleanFacts(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const og = raw.og && typeof raw.og === 'object' ? raw.og : {};
    return {
        url: str(raw.url, LIMITS.url),
        title: str(raw.title, LIMITS.title),
        selection: typeof raw.selection === 'string' ? raw.selection.slice(0, 20000) : '',
        og: {
            title: str(og.title, LIMITS.title),
            description: str(og.description, LIMITS.description),
            image: str(og.image, LIMITS.url),
            url: str(og.url, LIMITS.url),
        },
        canonical: str(raw.canonical, LIMITS.url),
        tiktokVideo: cleanTikTokVideo(raw.tiktokVideo),
    };
}

function cleanTikTokVideo(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5).map((x) => x.slice(0, LIMITS.url)) : []);
    return {
        id: typeof raw.id === 'string' && /^\d{6,25}$/.test(raw.id) ? raw.id : '',
        links: list(raw.links),
        handles: list(raw.handles),
    };
}

/**
 * The address of the TikTok video on screen when the tab is a feed (For You,
 * search, a profile) whose own address names no video, or ''. Only an answer
 * the page makes unambiguous: one video link around the playing video (and,
 * when the player names its id, the same id), or the player's id plus one
 * author link. Anything else is '' and the page is saved as it is.
 */
export function tiktokVideoUrl(tabUrl, facts) {
    if (socialPostSite(tabUrl) !== 'tiktok' || socialPostId(tabUrl)) return '';
    const found = facts && facts.tiktokVideo;
    if (!found) return '';
    const links = found.links
        .map((l) => httpsOn(l, ['tiktok.com']))
        .filter((l) => l && socialPostId(l) && socialHandle(l));
    const ids = new Set(links.map((l) => socialPostId(l)));
    if (ids.size === 1) {
        const [link] = links;
        return !found.id || socialPostId(link) === found.id ? link : '';
    }
    if (ids.size === 0 && found.id && found.handles.length === 1
        && /^[A-Za-z0-9._]{1,64}$/.test(found.handles[0])) {
        return `https://www.tiktok.com/@${found.handles[0]}/video/${found.id}`;
    }
    return '';
}

/**
 * Title, address, selection and preview tags of the tab's top frame, or null
 * where the browser doesn't allow reading (its own pages, the Web Store,
 * another extension, a PDF). Saving still works there from the address.
 */
export async function readPage(tabId) {
    try {
        const [first] = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [0] },
            func: readPageInFrame,
        });
        return cleanFacts(first && first.result);
    } catch {
        return null;
    }
}

/** The selection in the frame that was right-clicked, or '' if unreadable. */
export async function readSelection(tabId, frameId = 0) {
    try {
        const [first] = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            func: readSelectionInFrame,
        });
        return typeof first?.result === 'string' ? first.result : '';
    } catch {
        return '';
    }
}

/**
 * The Instagram or TikTok post as the page shows it, for the server's
 * `pagePreview` (the same field the iPhone share extension fills): those
 * sites give cloud servers a login wall, so without this the card is partial.
 *
 * Sent only when the page's own preview tags name the post on screen. Both
 * sites are single-page apps, and after in-app navigation the tags can still
 * describe the previous post.
 *
 * @returns {null | {title?: string, description?: string, image?: string, url: string, author?: string}}
 */
export function socialPreview(tabUrl, facts) {
    if (!facts || !socialPostSite(tabUrl)) return null;
    const postId = socialPostId(tabUrl);
    const tagUrl = facts.og.url || facts.canonical;
    if (!postId || socialPostId(tagUrl) !== postId) return null;
    const url = httpsOn(tagUrl, ['instagram.com', 'tiktok.com']);
    if (!url) return null;
    const preview = { url };
    if (facts.og.title) preview.title = facts.og.title;
    if (facts.og.description) preview.description = facts.og.description;
    if (!preview.title && !preview.description) return null;
    const image = httpsOn(facts.og.image, POST_IMAGE_CDNS);
    if (image) preview.image = image;
    const author = (socialHandle(url) || socialHandle(tabUrl)).slice(0, LIMITS.author);
    if (author) preview.author = author;
    return preview;
}

/**
 * The visible part of the window's active tab, sized for the server.
 * @param {number} windowId
 */
export async function captureVisible(windowId) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 92 });
    return fitScreenshot(dataUrl);
}
