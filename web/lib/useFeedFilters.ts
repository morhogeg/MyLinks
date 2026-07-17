import { useCallback, useMemo, useState } from 'react';
import { Link } from '@/lib/types';
import { getSourceInfo, buildSourceFacets, sourceMatchesQuery } from '@/lib/source';
import { PLATFORM_LABELS, type PlatformKey } from '@/lib/platform';
import { isPending, getTimestampNumber } from '@/lib/feedUtils';
import { tokenizeSearch, matchCard } from '@/lib/searchMatch';

export type FilterType = 'all' | 'unread' | 'read' | 'archived' | 'favorite' | 'reminders' | 'private';
export type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

/**
 * Feed selection state + the memoized filter/sort pipeline and facet counts,
 * extracted verbatim from Feed (R-3). Owns filter/category/tags/collections/
 * sources/sort selection; consumes the live links plus the LIVE search query
 * (matching is instant, per keystroke) + the full-library snapshot so search
 * reaches cards older than the loaded window, producing `filteredLinks` and
 * every facet.
 */
export function useFeedFilters(
    links: Link[],
    /** The LIVE query (not debounced): matching reacts per keystroke. */
    searchQuery: string,
    /** Full-library snapshot (useSearchLibrary) — empty until search is first used. */
    searchLibrary: Link[],
    /** Ids of collections marked Private — their members INHERIT privacy (see below). */
    privateCollectionIds: Set<string>,
) {
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
    //
    // Privacy (Photos-Hidden model): a card is EFFECTIVELY private when it carries
    // its own isPrivate flag OR belongs to a private collection — membership is
    // inherited live, never stamped onto member docs, so cards added later hide
    // automatically and removing one (or un-privating the collection) restores it
    // with no sweep. Effectively-private cards exist only under the 'private'
    // show-filter and inside their own explicitly opened (PIN-gated) private
    // collection — never in the main feed or its facets, even while the vault is
    // unlocked. (While the vault is LOCKED they don't reach this hook at all —
    // Feed's visibleLinks strips them.)
    const isEffectivelyPrivate = useCallback(
        (l: Link) => !!l.isPrivate || (l.collectionIds ?? []).some((id) => privateCollectionIds.has(id)),
        [privateCollectionIds]
    );
    // Membership predicate for the main (non-private) feed. Factored out so the
    // semantic-search union below can gate out-of-window server matches through
    // the exact same pending/privacy rules the window is filtered by.
    const isContentCard = useCallback((l: Link) => {
        if (isPending(l)) return false;
        if (!isEffectivelyPrivate(l)) return true;
        // The one place an effectively-private card surfaces outside the Private
        // filter: the feed scoped to a private collection the user opened
        // through the PIN gate (selectedCollections only ever holds an opened
        // collection). Membership in a selected NON-private collection doesn't
        // count — privacy inherited from one collection follows the card into
        // its other collections.
        return (l.collectionIds ?? []).some((id) => selectedCollections.has(id) && privateCollectionIds.has(id));
    }, [isEffectivelyPrivate, selectedCollections, privateCollectionIds]);
    const isPrivateCard = useCallback(
        (l: Link) => !isPending(l) && isEffectivelyPrivate(l),
        [isEffectivelyPrivate]
    );
    const contentLinks = useMemo(() => links.filter(isContentCard), [links, isContentCard]);
    const privateCards = useMemo(() => links.filter(isPrivateCard), [links, isPrivateCard]);

    // Query words for the LIVE query, tokenized ONCE per keystroke (not per card).
    const queryTokens = useMemo(() => tokenizeSearch(searchQuery), [searchQuery]);

    // Base set for the filter pipeline. While searching, UNION the full-library
    // snapshot (useSearchLibrary) into the loaded window so a match OLDER than
    // the window still renders — the window alone can't reach old cards. The
    // unioned docs are deduped by id (window docs win — they're the live
    // snapshot) and run through the SAME pending/privacy predicate as the
    // window, then flow through every facet/status filter below, so e.g.
    // archived filtering stays consistent.
    const searchBase = useMemo(() => {
        const base = filter === 'private' ? privateCards : contentLinks;
        if (queryTokens.length === 0 || searchLibrary.length === 0) return base;
        const gate = filter === 'private' ? isPrivateCard : isContentCard;
        const seen = new Set(base.map((l) => l.id));
        const extra = searchLibrary.filter((r) => !seen.has(r.id) && gate(r));
        return extra.length ? base.concat(extra) : base;
    }, [filter, privateCards, contentLinks, queryTokens, searchLibrary, isPrivateCard, isContentCard]);

    // The matches for the live query: id → whether the TITLE covered every
    // query word (those rank above summary matches). Recomputed per keystroke;
    // per-card normalized text is cached, so this is a cheap substring pass.
    const searchMatches = useMemo(() => {
        const m = new Map<string, boolean>();
        if (queryTokens.length === 0) return m;
        for (const link of searchBase) {
            const match = matchCard(link, queryTokens);
            if (match) m.set(link.id, match.titleHit);
        }
        return m;
    }, [searchBase, queryTokens]);

    // 4. Hybrid Search Logic — memoized so a banner tick or any unrelated state
    // change (search typing, overlay toggles) doesn't re-run the 6-stage filter +
    // sort. Recomputes only when an input it actually reads changes.
    const filteredLinks = useMemo(() => searchBase
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
            // Apply search: every query word in the title or the summary.
            if (queryTokens.length === 0) return true;
            return searchMatches.has(link.id);
        })
        .sort((a, b) => {
            // While searching (under the default sort): title matches first,
            // then summary matches, newest first within each tier. An explicit
            // non-default sort wins outright.
            if (queryTokens.length > 0 && sortBy === 'date-desc') {
                const ta = searchMatches.get(a.id) ? 1 : 0;
                const tb = searchMatches.get(b.id) ? 1 : 0;
                if (ta !== tb) return tb - ta;
                return getTimestampNumber(b.createdAt) - getTimestampNumber(a.createdAt);
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
        [searchBase, filter, selectedCategory, selectedTags, selectedCollections, selectedSources, queryTokens, searchMatches, sortBy]);

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
        () => Array.from(new Set(contentLinks.map(l => l.category).filter(Boolean)))
            // Case-insensitive A–Z so chips read in a predictable order regardless
            // of how a category happens to be capitalized.
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
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
        () => searchQuery.trim()
            ? sourceFacets.filter(s => sourceMatchesQuery(s, searchQuery)).slice(0, 8)
            : [],
        [searchQuery, sourceFacets]
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
