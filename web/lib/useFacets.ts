'use client';

import { useState } from 'react';
import { Link } from '@/lib/types';
import { getPlatform, PLATFORM_LABELS, type PlatformKey } from '@/lib/platform';
import { getTimestampNumber } from '@/lib/useLibraryData';

export type FilterType = 'all' | 'unread' | 'read' | 'archived' | 'favorite' | 'reminders';
export type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

/**
 * The feed's facet state (status filter, categories, tags, platforms,
 * screenshots, sort, collections) plus everything derived from it: the
 * filtered+sorted link list, live faceted counts, and the toggle handlers.
 *
 * `filteredLinks` is intentionally a plain per-render computation (no useMemo),
 * exactly as it was inline in Feed.
 */
export function useFacets({
    contentLinks,
    searchResults,
    debouncedQuery,
}: {
    /** The library minus pending (processing/failed) captures. */
    contentLinks: Link[];
    /** Semantic search results for the current debounced query. */
    searchResults: Link[];
    /** The debounced search query (drives the hybrid search filter). */
    debouncedQuery: string;
}) {
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedCategory, setSelectedCategory] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortType>('date-desc');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformKey>>(new Set());
    const [screenshotOnly, setScreenshotOnly] = useState(false);
    const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());

    // 4. Hybrid Search Logic
    const filteredLinks = contentLinks
        .filter((link) => {
            // Apply status filters
            if (filter === 'reminders') return link.reminderStatus === 'pending';
            if (filter === 'unread') return !link.isRead;
            if (filter === 'read') return !!link.isRead;
            if (filter !== 'all') return link.status === filter;
            return true;
        })
        .filter((link) => {
            // Apply category filters
            if (selectedCategory.size === 0) return true;
            return selectedCategory.has(link.category);
        })
        .filter((link) => {
            // Apply tag filters
            if (selectedTags.size === 0) return true;
            return link.tags.some(tag => {
                return Array.from(selectedTags).some(selected => {
                    return tag === selected || tag.startsWith(`${selected}/`);
                });
            });
        })
        .filter((link) => {
            // Apply collection filters — keep cards in ANY selected collection.
            if (selectedCollections.size === 0) return true;
            return (link.collectionIds ?? []).some(id => selectedCollections.has(id));
        })
        .filter((link) => {
            // Apply source filters (platforms + screenshots), OR across selections
            if (selectedPlatforms.size === 0 && !screenshotOnly) return true;
            const platform = getPlatform(link.url);
            const matchesPlatform = platform != null && selectedPlatforms.has(platform);
            const matchesScreenshot = screenshotOnly && link.sourceType === 'image';
            return matchesPlatform || matchesScreenshot;
        })
        .filter((link) => {
            // Apply search (Hybrid: keyword OR semantic result)
            if (!debouncedQuery.trim()) return true;

            const query = debouncedQuery.toLowerCase();

            // If it's in the semantic search results, it's a match
            const isSemanticMatch = searchResults.some(r => r.id === link.id);
            if (isSemanticMatch) return true;

            // Otherwise check keyword matching
            return (
                link.title.toLowerCase().includes(query) ||
                link.summary.toLowerCase().includes(query) ||
                link.tags.some((tag) => tag.toLowerCase().includes(query)) ||
                link.category.toLowerCase().includes(query)
            );
        })
        .sort((a, b) => {
            // Prioritize semantic matches at the top if they exist
            if (debouncedQuery.trim()) {
                const aIdx = searchResults.findIndex(r => r.id === a.id);
                const bIdx = searchResults.findIndex(r => r.id === b.id);

                if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                if (aIdx !== -1) return -1;
                if (bIdx !== -1) return 1;
            }

            if (filter === 'reminders') {
                const timeA = a.nextReminderAt || Number.MAX_SAFE_INTEGER;
                const timeB = b.nextReminderAt || Number.MAX_SAFE_INTEGER;
                return timeA - timeB;
            }
            switch (sortBy) {
                case 'date-desc':
                    return getTimestampNumber(b.createdAt) - getTimestampNumber(a.createdAt);
                case 'date-asc':
                    return getTimestampNumber(a.createdAt) - getTimestampNumber(b.createdAt);
                case 'title-asc':
                    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
                case 'category':
                    return a.category.localeCompare(b.category);
                default:
                    return 0;
            }
        });

    // Does a link carry any of the currently selected tags? (parent tags match
    // their children, e.g. "ai" matches "ai/agents"). Shared by the faceted counts.
    const matchesSelectedTags = (link: Link) =>
        link.tags.some(tag => Array.from(selectedTags).some(s => tag === s || tag.startsWith(`${s}/`)));

    // Faceted counts — the numbers update live as you tap. Each facet's counts are
    // computed against the OTHER facet's current selection (but never its own), so
    // picking the "Tech" category instantly drops a non-overlapping tag like
    // "politics" to 0, while the category chips keep reflecting the tag selection.
    // Pure client-side derivation — no extra reads, no backend cost.
    const linksForCategoryCounts = selectedTags.size === 0 ? contentLinks : contentLinks.filter(matchesSelectedTags);
    const categoryCounts = linksForCategoryCounts.reduce((acc, link) => {
        acc[link.category] = (acc[link.category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Category chips stay derived from the whole library so they never vanish —
    // they just read 0 when nothing matches the current tag selection.
    const categories = Array.from(new Set(contentLinks.map(l => l.category).filter(Boolean))).sort();

    const linksForTagCounts = selectedCategory.size === 0 ? contentLinks : contentLinks.filter(link => selectedCategory.has(link.category));
    const tagCounts = linksForTagCounts.reduce((acc, link) => {
        link.tags.forEach(tag => {
            acc[tag] = (acc[tag] || 0) + 1;
        });
        return acc;
    }, {} as Record<string, number>);

    const allTags = Array.from(new Set(contentLinks.flatMap(l => l.tags))).sort();

    const handleToggleTag = (tag: string) => {
        const next = new Set(selectedTags);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        setSelectedTags(next);
    };

    // Source/platform filter: only surface platforms actually present in the library.
    const platformCounts = contentLinks.reduce((acc, link) => {
        const p = getPlatform(link.url);
        if (p) acc[p] = (acc[p] || 0) + 1;
        return acc;
    }, {} as Record<PlatformKey, number>);
    const availablePlatforms = (Object.keys(PLATFORM_LABELS) as PlatformKey[]).filter(p => platformCounts[p]);
    const screenshotCount = contentLinks.filter(l => l.sourceType === 'image').length;

    const handleTogglePlatform = (p: PlatformKey) => {
        const next = new Set(selectedPlatforms);
        if (next.has(p)) next.delete(p);
        else next.add(p);
        setSelectedPlatforms(next);
    };

    const reminderCount = contentLinks.filter(l => l.reminderStatus === 'pending').length;

    return {
        filter, setFilter,
        selectedCategory, setSelectedCategory,
        sortBy, setSortBy,
        selectedTags, setSelectedTags,
        selectedPlatforms, setSelectedPlatforms,
        screenshotOnly, setScreenshotOnly,
        selectedCollections, setSelectedCollections,
        filteredLinks,
        categoryCounts, categories, tagCounts, allTags,
        platformCounts, availablePlatforms, screenshotCount, reminderCount,
        handleToggleTag, handleTogglePlatform,
    };
}
