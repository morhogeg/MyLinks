'use client';

import { Youtube, Twitter, Instagram, Linkedin, Github } from 'lucide-react';
import type { ReactNode } from 'react';

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
            return <Twitter className={className} />;
        case 'instagram':
            return <Instagram className={className} />;
        case 'linkedin':
            return <Linkedin className={className} />;
        case 'github':
            return <Github className={className} />;
    }
}
