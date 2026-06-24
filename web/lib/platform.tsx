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

/**
 * Recognized content platforms we can detect from a link's URL. Generic web
 * pages return null — their publisher name already conveys origin.
 */
export type PlatformKey = 'youtube' | 'x' | 'instagram' | 'linkedin' | 'github';

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
    youtube: 'YouTube',
    x: 'X',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
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
