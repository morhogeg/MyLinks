import { useCallback, useMemo, useState } from 'react';
import { Link } from '@/lib/types';
import { getSourceInfo, buildSourceFacets, sourceMatchesQuery } from '@/lib/source';
import { PLATFORM_LABELS, prettyHost, type PlatformKey } from '@/lib/platform';
import { isPending, getTimestampNumber, tokenizeQuery, buildSearchHaystack, matchesAllTokens } from '@/lib/feedUtils';

export type FilterType = 'all' | 'unread' | 'read' | 'archived' | 'favorite' | 'reminders' | 'private';
export type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

/**
 * Feed selection state + the memoized filter/sort pipeline and facet counts,
 * extracted verbatim from Feed (R-3) — same behavior. Owns filter/category/
 * tags/collections/sources/sort selection; consumes the live links plus the
 * debounced query + semantic results to produce `filteredLinks` and every facet.
 */
export function useFeedFilters(links: Link[], debouncedQuery: string, searchResults: Link[]) {
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedCategory, setSelectedCategory] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortType>('date-desc');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    // Source (publisher/site) facet — keyed by getSourceInfo().key, e.g. a card
    // from Ynet, an MKBHD video, or @naval on X. Sits alongside the coarse
    // platform quick-filters and is unioned with them (see the filter chain).
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
    const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());

    // Pending captures (M3) — processing/failed cards. They're excluded from the
    // normal filtered feed and from every facet derivation below (so a still-empty
    // card never spawns a phantom "Processing" category/tag), then surfaced
    // separately, pinned at the top of the library, so a capture is always visible.
    // Private cards are excluded too (Photos-Hidden model): they exist ONLY under
    // the 'private' show-filter, never in the main feed or its facets — even while
    // the privacy vault is unlocked. (While the vault is LOCKED they don't reach
    // this hook at all — Feed's visibleLinks strips them.)
    const contentLinks = useMemo(() => links.filter((l) => !isPending(l) && !l.isPrivate), [links]);
    const privateCards = useMemo(() => links.filter((l) => !isPending(l) && !!l.isPrivate), [links]);

    // Keyword-search tokens for the current query, prepped ONCE per query (not per
    // card): lowercased, punctuation-stripped, stopwords dropped. Every token must
    // then appear in a card's text for a keyword match (see the search filter below).
    const queryTokens = useMemo(() => tokenizeQuery(debouncedQuery), [debouncedQuery]);

    // 4. Hybrid Search Logic — memoized so a banner tick or any unrelated state
    // change (search typing, overlay toggles) doesn't re-run the 6-stage filter +
    // sort. Recomputes only when an input it actually reads changes.
    const filteredLinks = useMemo(() => (filter === 'private' ? privateCards : contentLinks)
        .filter((link) => {
            // Apply status filters ('private' already picked its base list above)
            if (filter === 'private') return true;
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
            // Apply source filters — publisher/site sources (incl. the Screenshots
            // bucket), OR across every selection (picking Ynet AND YouTube shows both).
            if (selectedSources.size === 0) return true;
            return selectedSources.has(getSourceInfo(link).key);
        })
        .filter((link) => {
            // Apply search (Hybrid: keyword OR semantic result)
            if (!debouncedQuery.trim()) return true;

            const query = debouncedQuery.toLowerCase();

            // If it's in the semantic search results, it's a match
            const isSemanticMatch = searchResults.some(r => r.id === link.id);
            if (isSemanticMatch) return true;

            // Token-based keyword match: EVERY query token must appear (as a
            // substring, or its light singular) somewhere in the card's searchable
            // text — title, summary, detailedSummary, tags, concepts, category,
            // sourceName, and your own notes (all folded into one haystack). This is
            // what makes a natural-language query like "a collection of articles"
            // match on "collection" AND "article", instead of the old whole-phrase
            // substring test that any multi-word query failed. Skipped for a query
            // that tokenizes to nothing (e.g. punctuation only), which then falls
            // through to the precise source/host tests below.
            if (queryTokens.length > 0 && matchesAllTokens(buildSearchHaystack(link), queryTokens)) {
                return true;
            }

            // Precise source matching — publisher label + platform aliases, so
            // "twitter"/"x" finds every X card (labelled by @handle) and "ynet"
            // surfaces its cards even when that word isn't in the card's text.
            // Kept on the raw query so single-word source/host search never regresses.
            return (
                sourceMatchesQuery(getSourceInfo(link), query) ||
                prettyHost(link.url).toLowerCase().includes(query)
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
        }),
        [contentLinks, filter, selectedCategory, selectedTags, selectedCollections, selectedSources, debouncedQuery, queryTokens, searchResults, sortBy]);

    // Faceted counts — the numbers update live as you tap. Each facet's counts are
    // computed against the OTHER facet's current selection (but never its own), so
    // picking the "Tech" category instantly drops a non-overlapping tag like
    // "politics" to 0, while the category chips keep reflecting the tag selection.
    // Pure client-side derivation — no extra reads, no backend cost. Memoized so it
    // recomputes only when the library or the relevant selection changes.
    const categoryCounts = useMemo(() => {
        const forCounts = selectedTags.size === 0
            ? contentLinks
            : contentLinks.filter(link => link.tags.some(tag => Array.from(selectedTags).some(s => tag === s || tag.startsWith(`${s}/`))));
        return forCounts.reduce((acc, link) => {
            acc[link.category] = (acc[link.category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [contentLinks, selectedTags]);

    // Category chips stay derived from the whole library so they never vanish —
    // they just read 0 when nothing matches the current tag selection.
    const categories = useMemo(
        () => Array.from(new Set(contentLinks.map(l => l.category).filter(Boolean))).sort(),
        [contentLinks]
    );

    const tagCounts = useMemo(() => {
        const forCounts = selectedCategory.size === 0
            ? contentLinks
            : contentLinks.filter(link => selectedCategory.has(link.category));
        return forCounts.reduce((acc, link) => {
            link.tags.forEach(tag => {
                acc[tag] = (acc[tag] || 0) + 1;
            });
            return acc;
        }, {} as Record<string, number>);
    }, [contentLinks, selectedCategory]);

    const allTags = useMemo(
        () => Array.from(new Set(contentLinks.flatMap(l => l.tags))).sort(),
        [contentLinks]
    );

    const handleToggleTag = useCallback((tag: string) => {
        setSelectedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }, []);

    // Source (publisher/site) facet — every distinct source in the library, ranked
    // by count. Drives the Sources submenu and the search "Sources" suggestions.
    const sourceFacets = useMemo(() => buildSourceFacets(contentLinks), [contentLinks]);
    const sourceLabelByKey = useMemo(() => {
        const m = new Map<string, string>();
        sourceFacets.forEach(s => m.set(s.key, s.label));
        return m;
    }, [sourceFacets]);

    // Chips for the active source filter. A fully-selected platform collapses to a
    // single platform chip (e.g. one "Facebook" chip, not one per page/account);
    // everything else stays an individual source chip.
    const sourceChips = useMemo(() => {
        if (selectedSources.size === 0) return [] as { id: string; label: string; keys: string[] }[];
        const keysByPlatform = new Map<PlatformKey, string[]>();
        sourceFacets.forEach(s => {
            if (s.platform) {
                const arr = keysByPlatform.get(s.platform) ?? [];
                arr.push(s.key);
                keysByPlatform.set(s.platform, arr);
            }
        });
        const chips: { id: string; label: string; keys: string[] }[] = [];
        const covered = new Set<string>();
        keysByPlatform.forEach((keys, platform) => {
            if (keys.length > 1 && keys.every(k => selectedSources.has(k))) {
                chips.push({ id: `platform:${platform}`, label: PLATFORM_LABELS[platform], keys });
                keys.forEach(k => covered.add(k));
            }
        });
        selectedSources.forEach(k => {
            if (covered.has(k)) return;
            chips.push({ id: k, label: sourceLabelByKey.get(k) ?? k, keys: [k] });
        });
        return chips;
    }, [selectedSources, sourceFacets, sourceLabelByKey]);

    const handleToggleSource = (key: string) => {
        const next = new Set(selectedSources);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSelectedSources(next);
    };
    // Toggle a whole platform group at once: if every key is already on, clear
    // them; otherwise select them all (used by the grouped Sources list headers).
    const handleToggleSourceKeys = (keys: string[]) => {
        setSelectedSources((prev) => {
            const next = new Set(prev);
            if (keys.every((k) => next.has(k))) keys.forEach((k) => next.delete(k));
            else keys.forEach((k) => next.add(k));
            return next;
        });
    };

    // Search "Sources" suggestions — the sources whose label matches the live
    // query, so a search splits into a Sources row (tap to filter) + the Cards grid.
    const matchingSources = useMemo(
        () => debouncedQuery.trim()
            ? sourceFacets.filter(s => sourceMatchesQuery(s, debouncedQuery)).slice(0, 8)
            : [],
        [debouncedQuery, sourceFacets]
    );

    const reminderCount = useMemo(
        () => contentLinks.filter(l => l.reminderStatus === 'pending').length,
        [contentLinks]
    );

    return {
        filter, setFilter,
        selectedCategory, setSelectedCategory,
        sortBy, setSortBy,
        selectedTags, setSelectedTags,
        selectedSources, setSelectedSources,
        selectedCollections, setSelectedCollections,
        filteredLinks,
        categoryCounts,
        categories,
        tagCounts,
        allTags,
        handleToggleTag,
        sourceFacets,
        sourceChips,
        handleToggleSource,
        handleToggleSourceKeys,
        matchingSources,
        reminderCount,
    };
}
