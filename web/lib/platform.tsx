'use client';

import { Youtube, Instagram, Linkedin, Github } from 'lucide-react';
import type { ReactNode } from 'react';

/** Up-to-date X (formerly Twitter) wordmark — lucide still ships the old bird. */
function XLogo({ className = 'w-3 h-3' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
        </svg>
    );
}

/** Facebook "f" badge — solid brand glyph with the f as negative space, so
    `currentColor` tints the whole mark in the brand blue like our other logos. */
function FacebookLogo({ className = 'w-3 h-3' }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.313 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    );
}

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
    if (is('linkedin.com')) return 'linkedin';
    if (is('facebook.com') || is('fb.com') || is('fb.watch')) return 'facebook';
    if (is('github.com')) return 'github';
    return null;
}

/**
 * Render the icon element for a platform. Returns a JSX element (not a
 * component reference) so callers can drop it straight into markup.
 */
export function platformIcon(key: PlatformKey, className = 'w-3 h-3'): ReactNode {
    switch (key) {
        case 'youtube':
            return <Youtube className={className} />;
        case 'x':
            return <XLogo className={className} />;
        case 'instagram':
            return <Instagram className={className} />;
        case 'linkedin':
            return <Linkedin className={className} />;
        case 'facebook':
            return <FacebookLogo className={className} />;
        case 'github':
            return <Github className={className} />;
    }
}

/** Brand RGB per platform, so each source filter lights up its own color. */
const PLATFORM_RGB: Record<PlatformKey, string> = {
    youtube: '255, 0, 0',
    x: '191, 201, 214',
    instagram: '225, 48, 108',
    linkedin: '10, 102, 194',
    facebook: '24, 119, 242',
    github: '139, 148, 158',
};

/** Solid brand color for a platform, e.g. for tinting an icon. */
export function platformColor(key: PlatformKey): string {
    return `rgb(${PLATFORM_RGB[key]})`;
}

/** Non-username path segments on x.com / twitter.com that aren't post authors. */
const X_RESERVED = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'settings',
    'compose', 'hashtag', 'i', 'intent', 'login', 'signup', 'about',
]);

/**
 * Extract the author's @handle from an X / Twitter post URL
 * (e.g. https://x.com/naval/status/123 → "naval"). Returns null when the URL
 * isn't an X post or points at a reserved route rather than a user.
 */
export function xHandle(url?: string): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        const isX = host === 'x.com' || host.endsWith('.x.com')
            || host === 'twitter.com' || host.endsWith('.twitter.com');
        if (!isX) return null;
        const seg = u.pathname.split('/').filter(Boolean)[0];
        if (!seg) return null;
        const handle = seg.replace(/^@/, '');
        if (X_RESERVED.has(handle.toLowerCase())) return null;
        // X usernames are 1–15 chars, letters/numbers/underscore only.
        if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
        return handle;
    } catch {
        return null;
    }
}

/**
 * The Instagram author @handle for a card. Unlike X (whose handle lives in the
 * post URL) an Instagram short-code URL — instagram.com/p/<code>, /reel/<code> —
 * carries no username, so the backend extracts the author while scraping and
 * stores it in `sourceName` as "@handle". This reads that back: it returns the
 * bare handle (no @) when sourceName is a stored IG handle, else null (so the
 * card falls back to the plain "Instagram" label). Validates the IG charset
 * (`[A-Za-z0-9._]`, ≤30) so a page/publisher name never renders as a handle.
 */
export function instagramHandle(sourceName?: string | null): string | null {
    const m = /^@([A-Za-z0-9._]{1,30})$/.exec((sourceName || '').trim());
    return m ? m[1] : null;
}

/**
 * Extract the author/profile name from a LinkedIn URL
 * (linkedin.com/posts/<slug>_…, /in/<slug>, /company/<slug>). LinkedIn stores
 * no author field, but the slug carries it — e.g.
 * "omri-zerachovitz-699331b7" → "Omri Zerachovitz". Returns null when no
 * usable name is present.
 */
export function linkedinAuthor(url?: string): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (!(host === 'linkedin.com' || host.endsWith('.linkedin.com'))) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        if (!(parts[0] === 'posts' || parts[0] === 'in' || parts[0] === 'company') || !parts[1]) return null;
        const tokens = parts[1].split('_')[0].split('-');
        // Drop the trailing LinkedIn id hash (tokens containing a digit).
        while (tokens.length > 1 && /\d/.test(tokens[tokens.length - 1])) tokens.pop();
        const name = tokens
            .filter(Boolean)
            .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
            .join(' ')
            .trim();
        return name || null;
    } catch {
        return null;
    }
}

/**
 * Best display name for a LinkedIn source: the stored author name when the
 * backend captured a real one, otherwise the name recovered from the URL slug.
 */
export function linkedinDisplayName(url?: string, sourceName?: string | null): string | null {
    if (sourceName) {
        const s = sourceName.trim();
        const lower = s.toLowerCase();
        if (s && lower !== 'linkedin' && lower !== 'none' && lower !== 'screenshot') return s;
    }
    return linkedinAuthor(url);
}

/** Inline style for an *active* platform filter chip, tinted in its brand color. */
export function platformActiveStyle(key: PlatformKey): {
    backgroundColor: string;
    color: string;
    borderColor: string;
} {
    const rgb = PLATFORM_RGB[key];
    return {
        backgroundColor: `rgba(${rgb}, 0.16)`,
        color: `rgb(${rgb})`,
        borderColor: `rgba(${rgb}, 0.40)`,
    };
}

/**
 * Human-friendly hostname for display, e.g. "youtube.com". Never throws — a
 * malformed or empty URL returns a safe fallback instead of crashing render.
 */
export function prettyHost(url?: string): string {
    if (!url) return 'link';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        // Best-effort: strip scheme/path from a non-URL string.
        return url.replace(/^https?:\/\//, '').split('/')[0] || 'link';
    }
}
