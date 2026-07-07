// Canonical "source" identity for a card — the publisher / channel / site a card
// came from (e.g. "Ynet", "CNN", "MKBHD", "@naval", "github.com"). This is the
// grouping used by the Sources filter facet and by search-by-source, and it
// deliberately mirrors what the cards themselves display (see ListCard's source
// label) so the filter list always matches the labels a user sees on their cards.
//
// Resolution order (first match wins):
//   1. X / Twitter post  → the author @handle
//   2. LinkedIn post     → the author's name (from the stored name or the URL slug)
//   3. A real sourceName → the AI/scraper-extracted publisher (skips the generic
//                          "None"/"Screenshot" placeholders)
//   4. A known platform  → the platform label (YouTube/Instagram/…)
//   5. A screenshot      → "Screenshot"
//   6. Anything else     → the pretty hostname (ynet.co.il)

import {
    getPlatform,
    PLATFORM_LABELS,
    xHandle,
    linkedinDisplayName,
    prettyHost,
    type PlatformKey,
} from './platform';
import type { Link } from './types';

export interface SourceInfo {
    /** Stable, case-insensitive grouping key — cards with the same key are one source. */
    key: string;
    /** Human label shown in the filter list / suggestion chips. */
    label: string;
    /** The platform this source maps to, if any (drives the brand icon/color). */
    platform: PlatformKey | null;
    /** True when the card is a saved screenshot rather than a web source. */
    isScreenshot: boolean;
}

/** sourceName values the backend uses as "no real publisher" placeholders. */
const GENERIC_SOURCE_NAMES = new Set(['', 'none', 'screenshot', 'unknown']);

function cleanSourceName(sourceName?: string | null): string {
    const s = (sourceName || '').trim();
    return s && !GENERIC_SOURCE_NAMES.has(s.toLowerCase()) ? s : '';
}

/** Resolve a card to its source identity (see file header for the order). */
export function getSourceInfo(link: Pick<Link, 'url' | 'sourceName' | 'sourceType'>): SourceInfo {
    const platform = getPlatform(link.url);
    const isScreenshot = link.sourceType === 'image';

    // 1. X / Twitter → author handle (its own source, e.g. "@naval").
    const handle = xHandle(link.url);
    if (handle) {
        return { key: `x:@${handle.toLowerCase()}`, label: `@${handle}`, platform: 'x', isScreenshot: false };
    }

    // 2. LinkedIn → the author's name (stored or recovered from the slug).
    if (platform === 'linkedin') {
        const name = linkedinDisplayName(link.url, link.sourceName);
        if (name) {
            return { key: `linkedin:${name.toLowerCase()}`, label: name, platform: 'linkedin', isScreenshot: false };
        }
    }

    // 3. A real publisher name (news sites, blogs, YouTube channels, …).
    const name = cleanSourceName(link.sourceName);
    if (name) {
        return { key: name.toLowerCase(), label: name, platform, isScreenshot };
    }

    // 4. A recognized platform with no publisher name (e.g. a bare YouTube link).
    if (platform) {
        return { key: `platform:${platform}`, label: PLATFORM_LABELS[platform], platform, isScreenshot };
    }

    // 5. A screenshot with no extracted source.
    if (isScreenshot) {
        return { key: 'screenshot', label: 'Screenshot', platform: null, isScreenshot: true };
    }

    // 6. Fall back to the site's hostname.
    const host = prettyHost(link.url);
    return { key: `host:${host.toLowerCase()}`, label: host, platform: null, isScreenshot: false };
}

export interface SourceFacet extends SourceInfo {
    count: number;
}

/**
 * Build the deduped, ranked list of sources present in a set of cards — the data
 * behind the Sources filter list. Sorted by count (desc) then label (A–Z), with
 * the first-seen label winning for a given key (so casing stays stable).
 */
export function buildSourceFacets(links: Pick<Link, 'url' | 'sourceName' | 'sourceType'>[]): SourceFacet[] {
    const byKey = new Map<string, SourceFacet>();
    for (const link of links) {
        const info = getSourceInfo(link);
        const existing = byKey.get(info.key);
        if (existing) existing.count += 1;
        else byKey.set(info.key, { ...info, count: 1 });
    }
    return Array.from(byKey.values()).sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
}
