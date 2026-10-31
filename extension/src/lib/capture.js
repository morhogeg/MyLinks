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
    return {
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
    };
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
