'use client';
// Refreshed colors, layout, and synchronized typography



import { useState, useEffect, useRef, useMemo, useCallback, cloneElement, type ReactElement } from 'react';
import { Link, Collection, WeeklySynthesis, CuratedDigest, DigestCardRef } from '@/lib/types';
import { getColorStyleByKey } from '@/lib/colors';
import { platformIcon, platformColor, type PlatformKey } from '@/lib/platform';
import DigestView from './DigestView';
import DigestCard from './DigestCard';
import Dropdown from './Dropdown';
import { deleteLink, updateLinkReminder, saveLink, toLink } from '@/lib/storage';
import { EXAMPLE_CARD } from '@/lib/exampleCard';
import { track } from '@/lib/analytics';
import { collection, onSnapshot, doc, getDoc, updateDoc, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useLinks } from '@/lib/useLinks';
import { useSemanticSearch } from '@/lib/useSemanticSearch';
import { useLinkActions } from '@/lib/useLinkActions';
import { useFeedFilters, type FilterType, type SortType } from '@/lib/useFeedFilters';
import { isPending, getTimestampNumber } from '@/lib/feedUtils';
import FeedSkeleton from './feed/FeedSkeleton';
import PullRefreshSpinner from './feed/PullRefreshSpinner';
import MobileFiltersSheet from './feed/MobileFiltersSheet';
import MobileSortSheet from './feed/MobileSortSheet';
import MobileDisplaySheet from './feed/MobileDisplaySheet';
import MobileSourcesSheet from './feed/MobileSourcesSheet';
import BottomTabBar, { type BottomTab } from './BottomTabBar';
import { useScrollAwayBar } from '@/lib/useScrollAwayBar';
import MobileTagExplorerDrawer from './feed/MobileTagExplorerDrawer';
import Card from './Card';
import ListCard from './ListCard';
import Masonry from './Masonry';
import ReminderModal from './ReminderModal';
import SwipeDeck from './SwipeDeck';
import AskBrain from './AskBrain';
import LinkDetailModal from './LinkDetailModal';
import SynthesisCard from './SynthesisCard';
import ConfirmDialog from './ConfirmDialog';
import AddToCollectionSheet from './AddToCollectionSheet';
import CollectionsGallery from './CollectionsGallery';
import CollectionFormModal from './CollectionFormModal';
import ManageCollectionCardsSheet from './ManageCollectionCardsSheet';
import MobileSubheader from './MobileSubheader';
import LoadMoreSentinel from './feed/LoadMoreSentinel';
import { Search, Inbox, Archive, Star, X, LayoutGrid, MessagesSquare, Trash2, ArrowUpDown, Tag as TagIcon, Filter, Bell, CheckCircle2, CheckSquare, Layers, GalleryHorizontalEnd, List, Image as ImageIcon, Share2, Globe, Plus, Pencil, Newspaper, Sparkles, Lock, BookOpenCheck, ChevronLeft, BarChart3 } from 'lucide-react';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useProcessingBanner } from '@/lib/useProcessingBanner';
import { subscribeLatestSynthesis } from '@/lib/synthesis';
import { subscribeDigests, deleteDigest } from '@/lib/digest';
import { PUSH_INTENT_EVENT, PUSH_FOREGROUND_EVENT, consumePendingPushIntent, readLocalPushPrompt, type PushIntent } from '@/lib/push';
import { isNativeApp } from '@/lib/api';
import { reportError } from '@/lib/errorReporter';
import PushNudge from './PushNudge';
import { deleteCollection, createCollection, addLinksToCollection, isShareStale, updateCollection, unpublishCollection, batchedUpdate } from '@/lib/collections';
import { useCollectionLinks } from '@/lib/useCollectionLinks';
import { suggestNewCollections, dismissSuggestion, type CollectionSuggestion } from '@/lib/collectionSuggest';
import ShareCollectionSheet from './ShareCollectionSheet';
import PinLockModal from './PinLockModal';
import { usePrivacyLock, relock } from '@/lib/privacyLock';
import { openExternal } from '@/lib/share';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import TagExplorer from './TagExplorer';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useScrollLock } from '@/lib/useScrollLock';

// Stable no-op for card slots that don't wire up an action (pending cards).
const noop = () => { };

/**
 * Main feed component displaying saved links
 * Features:
 * - Real-time updates via Firestore onSnapshot
 * - Keyword + semantic search
 * - Filter by status, category, and tags
 * - Two card views (grid / list), plus review, ask, and collections modes
 * - Deep linking to specific links via URL params
 */
function FeedContent({ onAskModeChange, onHideAddButton, onProcessingChange, onOpenDigestSettings, onHasCardsChange, libraryFacet, onLibraryFacetApplied, onBackToInsights, headerCommand, onCapture, onTabChange, onFullBleedChange }: { onAskModeChange?: (isAsk: boolean) => void; onHideAddButton?: (hide: boolean) => void; onProcessingChange?: (state: import('@/components/AnalyzingBanner').AnalyzingState | null) => void; onOpenDigestSettings?: () => void; onHasCardsChange?: (hasCards: boolean) => void; libraryFacet?: import('@/lib/stats').LibraryFacetRequest | null; onLibraryFacetApplied?: () => void; onBackToInsights?: () => void; headerCommand?: { action: 'search' | 'sources' | 'display'; nonce: number } | null; onCapture?: () => void; onTabChange?: (tab: BottomTab) => void; onFullBleedChange?: (full: boolean) => void }) {
    const searchParams = useSearchParams();
    const { uid } = useAuth();
    const toast = useToast();
    // Links subscription + pull-refresh (R-3: useLinks). Windowed (report 3.15):
    // loadMore grows the subscription window; hasMore gates the scroll sentinel.
    const { links, isLoading, handlePullRefresh, loadMore, hasMore } = useLinks(uid, toast);
    // Collections — declared before the filter pipeline so private-collection
    // membership can hide cards from it while the privacy vault is locked.
    const [collections, setCollections] = useState<Collection[]>([]);
    // Privacy vault: one app-level PIN protects every collection marked
    // Private. While locked, member cards vanish from the library, search,
    // related cards, Ask context, and suggestions.
    const { hasPin, locked: vaultLocked } = usePrivacyLock(uid);
    const privateCollectionIds = useMemo(
        () => new Set(collections.filter((c) => c.isPrivate).map((c) => c.id)),
        [collections]
    );
    // Effectively private = own flag OR inherited from a private collection.
    const isEffectivelyPrivateCard = useCallback(
        (l: Link) => !!l.isPrivate || (l.collectionIds ?? []).some((id) => privateCollectionIds.has(id)),
        [privateCollectionIds]
    );
    const visibleLinks = useMemo(() => {
        if (!vaultLocked) return links;
        return links.filter((l) => !isEffectivelyPrivateCard(l));
    }, [links, vaultLocked, isEffectivelyPrivateCard]);
    const [searchQuery, setSearchQuery] = useState('');
    // Debounced, generation-guarded semantic search (R-3: useSemanticSearch).
    const { debouncedQuery, isSearching, searchResults, searchError } = useSemanticSearch(searchQuery, uid);
    // True while the server half of the search hasn't answered for what's typed
    // — either the request is in flight or the debounce hasn't fired yet. Drives
    // the "Searching by meaning…" hints so a just-typed query never flashes a
    // premature "No matches".
    const awaitingServer = isSearching || (!!searchQuery.trim() && searchQuery !== debouncedQuery);
    // Selection state + filter/sort pipeline + facet counts (R-3: useFeedFilters).
    const {
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
    // LIVE query in, so keyword ranking is instant; only the server call debounces.
    } = useFeedFilters(visibleLinks, searchQuery, searchResults, privateCollectionIds);
    // Card action handlers that depend only on [uid, toast] (R-3: useLinkActions).
    const {
        handleStatusChange,
        handleReadStatusChange,
        handleUpdateTags,
        handleUpdateCategory,
        handleUpdateTitle,
        handleUpdateSummary,
        handleUpdateNote,
        handleUpdateNotes,
        handleRetryProcessing,
        handleRemoveFromCollection,
        handleShareCard,
    } = useLinkActions(uid, toast);
    const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
    // Cards fetched directly by id for a deep-link (?linkId) that targets a card
    // older than the loaded window — reminder push taps and dup-save redirects
    // point at arbitrary-age links. Keyed by id; consulted by activeLink below.
    const [fetchedCards, setFetchedCards] = useState<Record<string, Link>>({});
    // Back-stack for related-card navigation: opening a card *from* another card
    // pushes the current one, so closing returns there instead of dismissing all.
    const [linkStack, setLinkStack] = useState<string[]>([]);
    // Resolved against visibleLinks so a locked private card can never be opened
    // (deep link, push tap) — and an open one closes itself when the vault relocks.
    // A directly-fetched deep-link card (outside the window) is the fallback, and
    // it goes through the SAME vault gate: while locked it stays hidden if it's
    // effectively private, so the fetch can never bypass the PIN.
    const activeLink = useMemo(() => {
        if (!activeLinkId) return null;
        const inWindow = visibleLinks.find(l => l.id === activeLinkId);
        if (inWindow) return inWindow;
        const fetched = fetchedCards[activeLinkId];
        if (!fetched) return null;
        if (vaultLocked && isEffectivelyPrivateCard(fetched)) return null;
        return fetched;
    }, [activeLinkId, visibleLinks, fetchedCards, vaultLocked, isEffectivelyPrivateCard]);

    // Open a card reached from another card's "Related" list — remember where we
    // came from so the back-stack can return there.
    const openRelatedLink = (link: Link) => {
        if (activeLinkId) setLinkStack(prev => [...prev, activeLinkId]);
        setActiveLinkId(link.id);
    };
    // Step back one card: return to the one we came from, or dismiss if there's
    // none. Wired to the modal's back arrow + iOS edge-swipe-back.
    const goBackOrClose = () => {
        if (linkStack.length === 0) {
            setActiveLinkId(null);
        } else {
            setActiveLinkId(linkStack[linkStack.length - 1]);
            setLinkStack(linkStack.slice(0, -1));
        }
    };
    // Close everything at once: the X button + backdrop dismiss the whole stack,
    // however deep the related-card back-and-forth went.
    const closeActiveLinkStack = () => {
        setLinkStack([]);
        setActiveLinkId(null);
    };
    // View modes. The card-browsing layouts (grid/list/review) share the search +
    // filter chrome; 'ask' is the full-screen chat; 'collections' is the gallery
    // and 'collection' is a single collection opened as its own place (Task A);
    // 'digest' is the list of digests and 'digestDetail' is one opened digest
    // (Task B). The detail places are history-like: back returns to their parent
    // list, never to the home library.
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'review' | 'ask' | 'collections' | 'collection' | 'digest' | 'digestDetail'>('grid');
    // The collection currently open as a place (viewMode 'collection').
    const [openCollectionId, setOpenCollectionId] = useState<string | null>(null);
    // The digest currently open as a place (viewMode 'digestDetail'); the sentinel
    // 'synthesis' opens the weekly-synthesis entry.
    const [openDigestId, setOpenDigestId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isTagExplorerOpen, setIsTagExplorerOpen] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    // Mobile v4 chrome: the header ⋯ (view/sort/filter/select) and the
    // dedicated Sources sheet, both reachable from the page header's glyphs.
    const [isDisplayOpen, setIsDisplayOpen] = useState(false);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);
    // Mobile: the search bar is collapsed to an icon; tapping it expands a large
    // search field in place, so the card grid gets the vertical space back.
    const [isTagExplorerCollapsed, setIsTagExplorerCollapsed] = useState(false);
    const [reminderModalLink, setReminderModalLink] = useState<Link | null>(null);
    // Outcome of the SwipeDeck-triggered reminder modal, threaded back to the deck
    // so an up-swipe is only "acted on" if a reminder was actually saved (F-29).
    const [remindSignal, setRemindSignal] = useState<{ id: string; saved: boolean; seq: number } | null>(null);
    const remindSeq = useRef(0);
    // ReminderModal fires onUpdate (saved) and then onClose (dismissed) on a
    // successful save; this flag keeps that trailing onClose from also emitting
    // a "cancelled" signal for the same open.
    const remindSavedRef = useRef(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    // PIN prompt for a gated private-collection action (see withPrivacyGate).
    const [unlockPrompt, setUnlockPrompt] = useState<(() => void) | null>(null);
    // First-time PIN setup triggered by "Make private"; holds the pending action.
    const [pinSetupAction, setPinSetupAction] = useState<(() => void) | null>(null);

    // One-tap "Try it with an example" on a brand-new empty feed: seed a real,
    // hand-crafted card so Ask / search / Collections have something to work
    // against in the first minute. Written through the normal saveLink path (not
    // the analyze pipeline) so it's instant and offline-safe; the backend embeds
    // it via the needsEmbedding flag. Guarded so a double-tap can't seed twice.
    const [seedingExample, setSeedingExample] = useState(false);
    const handleSeedExample = useCallback(async () => {
        if (!uid || seedingExample) return;
        setSeedingExample(true);
        try {
            await saveLink(uid, EXAMPLE_CARD);
            track('example_card_seeded');
            // The feed is live via onSnapshot, so the card streams in on its own.
        } catch {
            toast.error('Could not add the example. Please try again.');
            setSeedingExample(false);
        }
        // On success we deliberately leave seedingExample true: the card arriving
        // flips the feed out of the empty state, so this button unmounts anyway.
    }, [uid, seedingExample, toast]);

    // Collections (the `collections` state itself is declared above the filter
    // pipeline — see the privacy-vault block near useLinks).
    const [addToCollectionLink, setAddToCollectionLink] = useState<Link | null>(null);
    const [collectionFormOpen, setCollectionFormOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<Collection | null>(null);
    const [manageCardsCollection, setManageCardsCollection] = useState<Collection | null>(null);
    const [shareCollection, setShareCollection] = useState<Collection | null>(null);
    // Bumped when a suggestion is dismissed so the memo below re-reads localStorage.
    const [suggestionTick, setSuggestionTick] = useState(0);

    // Weekly synthesis (M12) — the in-app "What you learned" special card.
    const [latestSynthesis, setLatestSynthesis] = useState<WeeklySynthesis | null>(null);
    const [dismissedSynthesisWeek, setDismissedSynthesisWeek] = useState<string | null>(null);

    // Curated digest history — the dedicated Digest section (written
    // server-side to users/{uid}/digests; the in-app view is the always-on
    // surface, push/email are extra delivery channels).
    const [digests, setDigests] = useState<CuratedDigest[]>([]);

    // First-run notifications nudge (native only, once per account). By the
    // time Feed mounts, AuthProvider has reconciled the user-doc mirror
    // (pushPromptedAt) into localStorage, so the local record is trustworthy.
    const [showPushNudge, setShowPushNudge] = useState(false);
    useEffect(() => {
        setShowPushNudge(isNativeApp() && readLocalPushPrompt() === null);
    }, []);

    // Server-side captures (the iOS Share Extension) show up as `processing`
    // cards; surface the same app-level "Analyzing… N%" banner for them. Report
    // the state up to the page, throttled to meaningful changes so it doesn't
    // fire every ramp frame.
    const processingBanner = useProcessingBanner(links);
    const procSig = processingBanner
        ? `${processingBanner.active}:${Math.round(processingBanner.progress)}:${processingBanner.kind}`
        : 'null';
    useEffect(() => {
        onProcessingChange?.(processingBanner);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [procSig]);

    // Lift "does this library have any cards yet" so page.tsx can gate the
    // first-run tour to a non-empty feed (never spotlight over zero cards).
    useEffect(() => {
        onHasCardsChange?.(links.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [links.length > 0]);

    // Load collapsed state from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('tag-explorer-collapsed');
        if (saved !== null) {
            setIsTagExplorerCollapsed(saved === 'true');
        }
        // Which weekly synthesis (if any) the user has already dismissed (M12).
        setDismissedSynthesisWeek(localStorage.getItem('synthesis-dismissed-week'));
    }, []);

    // Subscribe to the latest weekly synthesis (M12), surfaced as a feed card.
    useEffect(() => {
        if (!uid) return;
        return subscribeLatestSynthesis(uid, setLatestSynthesis);
    }, [uid]);

    // Subscribe to the curated digest history for the Digest section.
    useEffect(() => {
        if (!uid) return;
        return subscribeDigests(uid, setDigests);
    }, [uid]);

    // Push-notification deep links (native): a tapped notification carries
    // {view: 'digest'} or {linkId}. Handle both the live event (app already
    // running) and the intent stashed before this component mounted (cold
    // start from the lock screen). Foreground pushes surface as a toast —
    // iOS shows no OS banner while the app is frontmost.
    useEffect(() => {
        const applyIntent = (intent: PushIntent | null) => {
            if (!intent) return;
            if (intent.view === 'digest') setViewMode('digest');
            else if (intent.linkId) setActiveLinkId(intent.linkId);
        };
        applyIntent(consumePendingPushIntent());
        const onIntent = (e: Event) => applyIntent((e as CustomEvent<PushIntent>).detail);
        const onForeground = (e: Event) => {
            const message = (e as CustomEvent<{ message?: string }>).detail?.message;
            if (message) toast.info(message);
        };
        window.addEventListener(PUSH_INTENT_EVENT, onIntent);
        window.addEventListener(PUSH_FOREGROUND_EVENT, onForeground);
        return () => {
            window.removeEventListener(PUSH_INTENT_EVENT, onIntent);
            window.removeEventListener(PUSH_FOREGROUND_EVENT, onForeground);
        };
    }, [toast]);

    // Open a card referenced by a digest: prefer the live card (detail modal);
    // if it was deleted since the digest was written, fall back to the
    // denormalized source URL so the tap still lands somewhere useful.
    const openDigestCard = (card: DigestCardRef) => {
        if (links.some((l) => l.id === card.id)) {
            setActiveLinkId(card.id);
        } else if (card.url) {
            openExternal(card.url);
        } else {
            toast.info('That card is no longer in your library.');
        }
    };

    const dismissSynthesis = () => {
        if (latestSynthesis) {
            localStorage.setItem('synthesis-dismissed-week', latestSynthesis.weekId);
            setDismissedSynthesisWeek(latestSynthesis.weekId);
        }
    };

    // Save collapsed state to localStorage
    const toggleTagExplorer = () => {
        const newState = !isTagExplorerCollapsed;
        setIsTagExplorerCollapsed(newState);
        localStorage.setItem('tag-explorer-collapsed', String(newState));
    };

    // uid comes from AuthProvider — no mock lookup needed

    // 2b. Real-time sync of collections from Firestore
    useEffect(() => {
        if (!uid) return;
        const ref = collection(db, 'users', uid, 'collections');
        const unsubscribe = onSnapshot(ref, (snapshot: QuerySnapshot<DocumentData>) => {
            setCollections(snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
                id: d.id,
                ...d.data()
            } as Collection)));
        }, (error: Error) => {
            reportError(error, 'feed-collections-snapshot');
        });
        return () => unsubscribe();
    }, [uid]);

    // 3. Handle deep linking
    //
    // The effect depends on `links`, which Firestore's onSnapshot mutates on every
    // background change (favorite, read, scan completes). Without a guard, each
    // such update re-ran this effect and re-opened the modal the user had just
    // closed — forever. We consume a given linkId exactly once (ref guard) and
    // strip it from the URL so a refresh doesn't re-trigger it either.
    const consumedDeepLinkRef = useRef<string | null>(null);
    useEffect(() => {
        const linkId = searchParams.get('linkId');
        if (!linkId) return;
        if (consumedDeepLinkRef.current === linkId) return;

        const inList = links.find(l => l.id === linkId);
        // Still doing the first window load — wait before deciding whether the
        // card is genuinely outside the window and needs a direct fetch.
        if (!inList && isLoading) return;

        // Consume once (both the in-window and fetched paths): onSnapshot mutates
        // `links` constantly, and without this the effect would re-open a modal
        // the user just closed, or re-fetch on every background change.
        consumedDeepLinkRef.current = linkId;

        // Drop ?linkId from the URL so closing the modal is final and a manual
        // refresh won't re-open it. history.replaceState avoids a Next navigation
        // (and the scroll reset that comes with it).
        const stripLinkIdFromUrl = () => {
            if (typeof window === 'undefined') return;
            const url = new URL(window.location.href);
            url.searchParams.delete('linkId');
            window.history.replaceState(window.history.state, '', url.toString());
        };

        if (inList) {
            setActiveLinkId(inList.id);
            stripLinkIdFromUrl();
            return;
        }

        // Outside the loaded window — fetch the doc directly and open it. Reuses
        // useLinks' toLink mapping so the fetched card is normalized identically.
        if (!uid) return;
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'users', uid, 'links', linkId));
                if (cancelled) return;
                if (!snap.exists()) return; // deleted/unknown id — no crash, just no-op
                const card = toLink(snap as QueryDocumentSnapshot<DocumentData>);
                setFetchedCards(prev => ({ ...prev, [linkId]: card }));
                setActiveLinkId(linkId);
                stripLinkIdFromUrl();
            } catch (e) {
                reportError(e, 'feed-deeplink-fetch');
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams, links, isLoading, uid]);

    // Only the scrollable card layouts drive pull-to-refresh; disable it while a
    // full-screen mode (Ask/Collections) or any overlay/sheet owns the screen so
    // the gesture never fights a modal's own scrolling.
    const anyOverlayOpen =
        activeLinkId !== null || isTagExplorerOpen || isFiltersOpen || isSortOpen ||
        isDisplayOpen || isSourcesOpen ||
        reminderModalLink !== null || confirmDeleteId !== null || confirmBulkDelete ||
        addToCollectionLink !== null || collectionFormOpen || confirmDeleteCollection !== null ||
        manageCardsCollection !== null || shareCollection !== null || unlockPrompt !== null ||
        pinSetupAction !== null;
    const { pull, refreshing, animating } = usePullToRefresh({
        onRefresh: handlePullRefresh,
        enabled: (viewMode === 'grid' || viewMode === 'list') && !anyOverlayOpen,
    });

    // Lock the page behind any open overlay/sheet so scrolling inside a menu (the
    // Filters sheet, a confirm dialog, etc.) never scrolls the feed behind it.
    useScrollLock(anyOverlayOpen);

    // Render the brand icon for a source row (platform logo, screenshot, or a
    // generic globe for plain websites), tinted in the platform's brand color.
    const sourceIconFor = (s: { platform: PlatformKey | null; isScreenshot: boolean }, size = 'w-4 h-4') => {
        if (s.platform) return <span style={{ color: platformColor(s.platform) }}>{platformIcon(s.platform, size)}</span>;
        if (s.isScreenshot) return <ImageIcon className={`${size} text-text-secondary`} />;
        return <Globe className={`${size} text-text-secondary`} />;
    };

    // Pending capture cards to surface, pinned above the feed. Only shown on the
    // default library views (All/Unread, no active facet/search) so they're always
    // visible right where a fresh capture lands, without cluttering narrowed views.
    // The default library view (All/Unread, no active facet/search) is the only
    // place we pin extra surfaces — pending captures (above) and the proactive
    // feed modules (weekly synthesis M12 + connection insight M10) — so they
    // land right where a fresh capture does, without cluttering narrowed views.
    const isDefaultLibraryView =
        (viewMode === 'grid' || viewMode === 'list')
        && (filter === 'all' || filter === 'unread')
        && selectedCollections.size === 0
        && selectedCategory.size === 0
        && selectedTags.size === 0
        && selectedSources.size === 0
        && !searchQuery.trim();

    const pendingCards = useMemo(
        () => isDefaultLibraryView
            ? links.filter(isPending).sort((a, b) => getTimestampNumber(b.createdAt) - getTimestampNumber(a.createdAt))
            : [],
        [isDefaultLibraryView, links]
    );

    // Precomputed collection chips per card — built once per links/collections
    // change instead of filtering `collections` for every card on every render.
    const cardCollectionsByLink = useMemo(() => {
        const map = new Map<string, { id: string; name: string }[]>();
        for (const link of links) {
            const ids = link.collectionIds;
            if (!ids || ids.length === 0) continue;
            const chips = collections
                .filter(c => ids.includes(c.id))
                .map(c => ({ id: c.id, name: c.name }));
            if (chips.length > 0) map.set(link.id, chips);
        }
        return map;
    }, [links, collections]);

    // In-app reminder fallback: the backend flags a link `reminderDue` when its
    // reminder fires (for EVERY user, push or not). Surface those due links in a
    // "Reminders due" strip so the promise "I'll remind you" always produces
    // something visible in-app. Clearing is best-effort — onSnapshot resyncs.
    const clearReminderDue = useCallback(async (id: string) => {
        if (!uid) return;
        try {
            await updateDoc(doc(db, 'users', uid, 'links', id), { reminderDue: false, reminderDueAt: null });
        } catch (e) {
            // Best-effort dismiss; the live snapshot keeps the source of truth.
            reportError(e, 'feed-clear-reminder-due');
        }
    }, [uid]);
    // Derived from visibleLinks so a due reminder never leaks a locked private
    // card's title into the feed strip; effectively-private cards (own flag OR
    // inherited from a private collection) are excluded even while unlocked —
    // they surface only under the Private filter / inside their collection.
    const dueLinks = useMemo(
        () => visibleLinks.filter((l) => l.reminderDue === true && !isEffectivelyPrivateCard(l)),
        [visibleLinks, isEffectivelyPrivateCard]
    );

    // The proactive feed modules, rendered once and reused in both the grid and
    // list layouts (above pending + real cards). The weekly synthesis recap plus
    // the in-app "reminders due" strip — the connection insight moved into the
    // dedicated Connections view/pill.
    const feedModules = isDefaultLibraryView ? (
        <>
            {showPushNudge && uid && (
                <PushNudge uid={uid} onDone={() => setShowPushNudge(false)} />
            )}
            {dueLinks.length > 0 && (
                <div className="mb-4 rounded-2xl border border-accent/25 bg-card overflow-hidden shadow-lg shadow-accent/5 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                        <div className="w-9 h-9 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                            <Bell className="w-[18px] h-[18px] text-white" />
                        </div>
                        <div className="flex-grow min-w-0">
                            <div className="text-[15px] font-bold text-text">Reminders due</div>
                            <div className="text-[13px] text-text-secondary leading-snug">
                                {dueLinks.length} saved {dueLinks.length === 1 ? 'item is' : 'items are'} ready to revisit.
                            </div>
                        </div>
                        <button
                            onClick={() => dueLinks.forEach((l) => clearReminderDue(l.id))}
                            aria-label="Dismiss all due reminders"
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="divide-y divide-border-subtle">
                        {dueLinks.slice(0, 5).map((l) => (
                            <button
                                key={l.id}
                                onClick={() => { openLinkDetails(l); clearReminderDue(l.id); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-card-hover transition-colors"
                            >
                                <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                                <span className="flex-grow min-w-0 truncate text-[14px] text-text">{l.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {latestSynthesis && latestSynthesis.weekId !== dismissedSynthesisWeek && (
                <SynthesisCard
                    synthesis={latestSynthesis}
                    onOpenCard={(id) => setActiveLinkId(id)}
                    onDismiss={dismissSynthesis}
                />
            )}
        </>
    ) : null;



    // Open the branded confirm dialog instead of a native window.confirm. The
    // card/sheet/table all call this; actual deletion happens on confirm.
    const handleDelete = useCallback((id: string) => {
        setConfirmDeleteId(id);
    }, []);

    // Stable card-open + reminder + add-to-collection handlers so memoized cards
    // keep identical props across unrelated re-renders.
    const openLinkDetails = useCallback((link: Link) => setActiveLinkId(link.id), []);
    const handleAddToCollection = useCallback((link: Link) => setAddToCollectionLink(link), []);

    const performDelete = async (id: string) => {
        if (!uid) return;
        // If the deleted card is the one open in the modal, step back to whatever
        // opened it (or dismiss) so we don't leave a dangling back-stack.
        if (id === activeLinkId) goBackOrClose();
        try {
            await deleteLink(uid, id);
            // No success toast on delete — the card disappearing is feedback enough.
        } catch {
            toast.error("Couldn't delete the link. Please try again.");
        }
    };

    // Apply the same mutation to many link docs via chunked writeBatch (report
    // 3.17): ≤450 ops per batch (under Firestore's 500-op limit) instead of N
    // parallel single-doc writes. Shares lib/collections.ts's batchedUpdate —
    // deleteLink's client path is a plain deleteDoc (screenshot cleanup is a
    // server-side concern) and archive is a field update, so both batch cleanly
    // with no per-doc side effects to preserve.
    const linkRefs = (ids: string[]) => ids.map((id) => doc(db, 'users', uid!, 'links', id));

    const handleBulkArchive = async () => {
        if (!uid) return;
        const ids = Array.from(selectedIds);
        try {
            await batchedUpdate(linkRefs(ids), (batch, ref) => batch.update(ref, { status: 'archived' }));
            toast.success(`Archived ${ids.length} link${ids.length === 1 ? '' : 's'}`);
        } catch {
            toast.error("Couldn't archive some links. Please try again.");
        }
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    };

    const performBulkDelete = async () => {
        if (!uid) return;
        const ids = Array.from(selectedIds);
        try {
            await batchedUpdate(linkRefs(ids), (batch, ref) => batch.delete(ref));
            toast.success(`Deleted ${ids.length} link${ids.length === 1 ? '' : 's'}`);
        } catch {
            toast.error("Couldn't delete some links. Please try again.");
        }
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    };

    const handleOpenReminderModal = useCallback((link: Link) => {
        remindSavedRef.current = false;
        setReminderModalLink(link);
    }, []);

    // A pending capture (processing / failed) rendered with Card's dedicated
    // skeleton / retry treatment. Reused above both the grid and list layouts.
    const renderPendingCard = (link: Link) => (
        <Card
            key={link.id}
            index={0}
            link={link}
            onOpenDetails={noop}
            onStatusChange={handleStatusChange}
            onReadStatusChange={handleReadStatusChange}
            onUpdateCategory={handleUpdateCategory}
            allCategories={categories}
            onDelete={handleDelete}
            onUpdateReminder={noop}
            onRetry={handleRetryProcessing}
        />
    );

    // ── Collections ──────────────────────────────────────────────────────────
    // Privacy gate: any action on a private collection while the vault is
    // locked first routes through the PIN pad; the intended action runs after
    // a successful unlock (which opens the whole vault for the session).
    // (unlockPrompt state lives up with the other overlay states.)
    const withPrivacyGate = useCallback((col: Collection, fn: () => void) => {
        if (col.isPrivate && vaultLocked) setUnlockPrompt(() => fn);
        else fn();
    }, [vaultLocked]);

    // Insights → library deep-link: a tapped category/tag/source row in
    // Settings arrives here as `libraryFacet`. Apply it the way openCollection
    // scopes the feed — the one facet set, everything else cleared — landing on
    // the grid so the user sees exactly "the cards behind that number".
    // The facet that Insights applied — kept so the "Back to Insights" chip can
    // show while (and only while) that facet is still the feed's sole scope.
    const [insightsFacet, setInsightsFacet] = useState<import('@/lib/stats').LibraryFacetRequest | null>(null);
    useEffect(() => {
        if (!libraryFacet) return;
        setSelectedCategory(libraryFacet.kind === 'category' ? new Set([libraryFacet.value]) : new Set());
        setSelectedTags(libraryFacet.kind === 'tag' ? new Set([libraryFacet.value]) : new Set());
        setSelectedSources(libraryFacet.kind === 'source' ? new Set([libraryFacet.value]) : new Set());
        setSelectedCollections(new Set());
        setFilter('all');
        setSearchQuery('');
        setOpenCollectionId(null);
        setViewMode('grid');
        setInsightsFacet(libraryFacet);
        window.scrollTo({ top: 0 });
        onLibraryFacetApplied?.();
    }, [libraryFacet, onLibraryFacetApplied, setSelectedCategory, setSelectedTags, setSelectedSources, setSelectedCollections, setFilter]);

    // True while the Insights-applied facet is still exactly what the feed
    // shows. The user changing ANYTHING (adding/removing a facet, searching,
    // picking a collection) dissolves the "came from Insights" context and the
    // back chip disappears — it never lies about where back would go.
    const insightsBackVisible = !!onBackToInsights && !!insightsFacet && !searchQuery
        && selectedCollections.size === 0 && filter === 'all'
        && (insightsFacet.kind === 'category'
            ? selectedCategory.size === 1 && selectedCategory.has(insightsFacet.value) && selectedTags.size === 0 && selectedSources.size === 0
            : insightsFacet.kind === 'tag'
                ? selectedTags.size === 1 && selectedTags.has(insightsFacet.value) && selectedCategory.size === 0 && selectedSources.size === 0
                : selectedSources.size === 1 && selectedSources.has(insightsFacet.value) && selectedCategory.size === 0 && selectedTags.size === 0);

    // Back to Insights: undo the facet this chip belongs to, then reopen
    // Settings deep-linked to the Insights screen — a true "back", landing the
    // user where they tapped with the library restored to unfiltered.
    const backToInsights = () => {
        setSelectedCategory(new Set());
        setSelectedTags(new Set());
        setSelectedSources(new Set());
        setInsightsFacet(null);
        onBackToInsights?.();
    };

    // Open a collection as its own place (Task A): a dedicated detail view with
    // its own header + back navigation, NOT the generic filtered grid. We scope
    // the feed to just this collection (clearing every other filter so it shows
    // the whole collection), then switch into the 'collection' view mode.
    const openCollection = (collectionId: string) => {
        setSelectedCollections(new Set([collectionId]));
        setSelectedCategory(new Set());
        setSelectedTags(new Set());
        setSelectedSources(new Set());
        setFilter('all');
        setSearchQuery('');
        setOpenCollectionId(collectionId);
        setViewMode('collection');
    };
    // Leave a collection: always back to the gallery it was opened from — never
    // dumped to the home library (the old clear-filter behaviour). Backing out
    // of a PRIVATE collection relocks the vault right away — no waiting for the
    // app to background — so the tile behind you is masked again.
    const closeCollectionToGallery = () => {
        const col = openCollectionId ? collections.find((c) => c.id === openCollectionId) : null;
        if (col?.isPrivate) relock();
        setSelectedCollections(new Set());
        setOpenCollectionId(null);
        setViewMode('collections');
    };
    // ── Digest ───────────────────────────────────────────────────────────────
    // Open one digest (or the weekly synthesis) as its own place (Task B).
    const openDigestDetail = (id: string) => {
        setOpenDigestId(id);
        setViewMode('digestDetail');
    };
    // Leave a digest: back to the list of all digests.
    const closeDigestToList = () => {
        setOpenDigestId(null);
        setViewMode('digest');
    };

    // Sharing lives in a dedicated sheet (preview → publish → copy/share/update/
    // stop) instead of blind-publishing on tap.
    const handleShareCollection = (col: Collection) => setShareCollection(col);

    // Gallery handlers, privacy-gated (the gallery itself masks locked tiles;
    // the gate here is what actually demands the PIN before anything opens).
    const gatedOpenCollection = useCallback((collectionId: string) => {
        const col = collections.find((c) => c.id === collectionId);
        if (!col) return;
        withPrivacyGate(col, () => openCollection(collectionId));
        // openCollection only touches state, so the stale-closure risk is nil.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collections, withPrivacyGate]);
    const gatedEditCollection = (col: Collection) => withPrivacyGate(col, () => openEditCollectionForm(col));
    const gatedShareCollection = (col: Collection) => withPrivacyGate(col, () => handleShareCollection(col));
    const gatedDeleteCollection = (col: Collection) => withPrivacyGate(col, () => setConfirmDeleteCollection(col));
    const gatedManageCollection = (col: Collection) => withPrivacyGate(col, () => setManageCardsCollection(col));

    // ── Make private / remove private (collections + individual cards) ──────
    // Making something private with no PIN yet routes through first-time PIN
    // setup, then runs the pending action (pinSetupAction, declared with the
    // overlay states above, drives that modal).
    const makeCollectionPrivate = async (col: Collection) => {
        if (!uid) return;
        try {
            // A collection can't be private AND have a public page.
            if (col.isPublic) await unpublishCollection(uid, col);
            await updateCollection(uid, col.id, { isPrivate: true });
            toast.success(`“${col.name}” is now private`);
        } catch {
            toast.error("Couldn't make the collection private. Please try again.");
        }
    };
    const handleToggleCollectionPrivate = (col: Collection) => {
        if (!uid) return;
        if (col.isPrivate) {
            // Removing protection is itself a protected action.
            withPrivacyGate(col, () => {
                updateCollection(uid, col.id, { isPrivate: false })
                    .then(() => toast.success(`“${col.name}” is no longer private`))
                    .catch(() => toast.error("Couldn't update the collection. Please try again."));
            });
        } else if (hasPin === true) {
            void makeCollectionPrivate(col);
        } else {
            setPinSetupAction(() => () => void makeCollectionPrivate(col));
        }
    };

    const setCardPrivate = useCallback(async (link: Link, isPrivate: boolean) => {
        if (!uid) return;
        try {
            await updateDoc(doc(db, 'users', uid, 'links', link.id), { isPrivate });
            toast.success(isPrivate
                ? 'Moved to Private — find it under Show → Private'
                : 'Removed from Private');
        } catch {
            toast.error("Couldn't update the card. Please try again.");
        }
    }, [uid, toast]);
    const handleToggleCardPrivate = useCallback((link: Link) => {
        // "Remove from Private" is only reachable inside the unlocked Private
        // view, so no extra gate; hiding a card never needs the vault open.
        if (link.isPrivate) void setCardPrivate(link, false);
        else if (hasPin === true) void setCardPrivate(link, true);
        else setPinSetupAction(() => () => void setCardPrivate(link, true));
    }, [hasPin, setCardPrivate]);

    // Status-filter selection, PIN-gated for 'private': entering the Private
    // view demands the PIN while the vault is locked, and LEAVING it relocks
    // the vault immediately (mirrors backing out of a private collection).
    const handleFilterSelect = useCallback((next: FilterType) => {
        if (next === 'private' && vaultLocked) {
            setUnlockPrompt(() => () => setFilter('private'));
            return;
        }
        if (filter === 'private' && next !== 'private') relock();
        setFilter(next);
    }, [vaultLocked, filter, setFilter]);

    // Suggested collections — topic clusters detected client-side from the
    // loaded feed (M20-lite). Only surfaced in the Collections view.
    const collectionSuggestions = useMemo(
        // Effectively-private cards never seed suggestions — a suggested cluster
        // must not surface a hidden card's title in the gallery.
        () => (viewMode === 'collections'
            ? suggestNewCollections(visibleLinks.filter((l) => !isEffectivelyPrivateCard(l)), collections)
            : []),
        // suggestionTick re-reads the localStorage dismissal list after a dismiss.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [viewMode, visibleLinks, collections, suggestionTick]
    );

    const handleCreateSuggestion = async (s: CollectionSuggestion) => {
        if (!uid) return;
        try {
            const id = await createCollection(uid, { name: s.name });
            await addLinksToCollection(uid, s.linkIds, id);
            track('collection_suggestion_accepted', { cards: s.linkIds.length });
            toast.success(`Created “${s.name}” with ${s.linkIds.length} cards`);
        } catch {
            toast.error("Couldn't create the collection. Please try again.");
        }
    };

    const handleDismissSuggestion = (s: CollectionSuggestion) => {
        dismissSuggestion(s.key);
        setSuggestionTick(t => t + 1);
    };

    const performDeleteCollection = async (col: Collection) => {
        if (!uid) return;
        try {
            await deleteCollection(uid, col.id, col.shareId);
            setSelectedCollections(prev => {
                const next = new Set(prev);
                next.delete(col.id);
                return next;
            });
        } catch {
            toast.error("Couldn't delete the collection. Please try again.");
        }
    };

    const openNewCollectionForm = () => {
        setEditingCollection(null);
        setCollectionFormOpen(true);
    };

    const openEditCollectionForm = (col: Collection) => {
        setEditingCollection(col);
        setCollectionFormOpen(true);
    };

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Stable SwipeDeck (Review mode) action handlers. Silent: the deck's own
    // motion + session tallies confirm each action, and stacked success toasts
    // were covering the deck's Undo/Archive/Remind/Keep buttons.
    const swipeFavorite = useCallback((link: Link) => handleStatusChange(link.id, 'favorite', { silent: true }), [handleStatusChange]);
    const swipeArchive = useCallback((link: Link) => handleStatusChange(link.id, 'archived', { silent: true }), [handleStatusChange]);
    const swipeResetStatus = useCallback((link: Link) => handleStatusChange(link.id, 'unread', { silent: true }), [handleStatusChange]);
    // Undo of an up-swipe: clear the reminder the deck just set for this card (F-29).
    // Clearing (not restoring a prior state) is safe because reviewQueue.isOpen
    // excludes reminder-pending cards from every deck queue — a dealt card can't
    // have carried a pre-existing reminder. Keep that invariant if queues change.
    const swipeCancelRemind = useCallback(async (link: Link) => {
        if (!uid) return;
        try {
            await updateLinkReminder(uid, link.id, false);
        } catch {
            toast.error("Couldn't cancel the reminder. Please try again.");
        }
    }, [uid, toast]);
    // Report the reminder modal's outcome back to the deck: saved vs. cancelled.
    const resolveRemind = useCallback((link: Link, saved: boolean) => {
        setRemindSignal({ id: link.id, saved, seq: ++remindSeq.current });
    }, []);

    const filterButtons: { key: FilterType; label: string; icon: React.ReactNode }[] = [
        { key: 'all', label: 'All', icon: <Inbox className="w-4 h-4" /> },
        { key: 'unread', label: 'Unread', icon: <Inbox className="w-4 h-4" /> },
        { key: 'read', label: 'Read', icon: <CheckCircle2 className="w-4 h-4" /> },
        { key: 'favorite', label: 'Favorites', icon: <Star className="w-4 h-4" /> },
        { key: 'reminders', label: 'Reminders', icon: <Bell className="w-4 h-4" /> },
        { key: 'archived', label: 'Archived', icon: <Archive className="w-4 h-4" /> },
        { key: 'private', label: 'Private', icon: <Lock className="w-4 h-4" /> },
    ];

    // Shared styling so every toolbar control is the same height, weight, and
    // clearly interactive (consistent 36px target, readable text, real cursor).
    const ctrlBase =
        'h-9 inline-flex items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';
    const ctrlIdle =
        'bg-card border border-border-subtle text-text-secondary hover:bg-card-hover hover:text-text hover:border-text-muted/40';
    // Row A (mobile "Categories & Tags / Filters / Search") is secondary chrome —
    // a quieter, smaller variant of ctrlBase scoped to that row only (never mutate
    // the shared ctrlBase). Active/accent states reuse the filled style inline.

    // Status filter options for the custom dropdown (Reminders has its own toggle).
    const statusOptions = [
        { value: 'all', label: 'All', icon: <Inbox className="w-4 h-4 text-text-secondary" /> },
        { value: 'unread', label: 'Unread', icon: <Inbox className="w-4 h-4 text-accent" /> },
        { value: 'read', label: 'Read', icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
        { value: 'favorite', label: 'Favorites', icon: <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> },
        // Reminders lives here as a Show option (was a separate toolbar button).
        { value: 'reminders', label: reminderCount > 0 ? `Reminders (${reminderCount})` : 'Reminders', icon: <Bell className="w-4 h-4 text-blue-500" /> },
        { value: 'archived', label: 'Archived', icon: <Archive className="w-4 h-4 text-text-secondary" /> },
        // Private cards (Photos-Hidden model) — only offered once the privacy
        // vault exists or something is already in it; entering is PIN-gated.
        ...(hasPin === true || links.some((l) => l.isPrivate)
            ? [{ value: 'private', label: 'Private', icon: <Lock className="w-4 h-4 text-text-secondary" /> }]
            : []),
    ];
    const statusTriggerIcon = (statusOptions.find(o => o.value === filter) ?? statusOptions[0]).icon;

    const sortOptions = [
        { value: 'date-desc', label: 'Newest' },
        { value: 'date-asc', label: 'Oldest' },
        { value: 'title-asc', label: 'A–Z' },
        { value: 'category', label: 'Category' },
    ];

    // View modes, in a single source of truth so the switcher stays in sync.
    // Layout views only — Ask is a distinct mode, surfaced as its own button.
    const viewModes: { key: typeof viewMode; label: string; icon: React.ReactNode; hint: string }[] = [
        { key: 'grid', label: 'Cards', icon: <LayoutGrid className="w-4 h-4" />, hint: 'Card view' },
        { key: 'list', label: 'List', icon: <List className="w-4 h-4" />, hint: 'List view' },
        { key: 'review', label: 'Review', icon: <GalleryHorizontalEnd className="w-4 h-4" />, hint: 'Swipe to review' },
    ];
    // The layout the Ask/Collections buttons return you to when you leave them.
    const lastLayout = useRef<'grid' | 'list' | 'review'>('grid');
    if (viewMode === 'grid' || viewMode === 'list' || viewMode === 'review') lastLayout.current = viewMode;

    // ---- Mobile v4 chrome (bottom tab bar + header glyphs) ----
    // Which bottom tab the current viewMode belongs to; detail places roll up
    // to their parent tab so the bar's highlight never goes blank.
    const activeTab: BottomTab =
        viewMode === 'ask' ? 'ask'
            : viewMode === 'collections' || viewMode === 'collection' ? 'collections'
                : viewMode === 'digest' || viewMode === 'digestDetail' ? 'digest'
                    : 'home';
    useEffect(() => { onTabChange?.(activeTab); }, [activeTab, onTabChange]);

    // Scroll-away bar state, owned here so the tab overlays can grow to reclaim
    // the space when the bar hides (like the Home feed does). Reset on view
    // change so a freshly opened screen shows the bar.
    const barHidden = useScrollAwayBar(viewMode);
    // How far the full-screen overlays sit above the bar. When the bar hides,
    // they drop to 0 and use the freed space; the transition matches the bar's.
    const overlayBottom = barHidden ? '0px' : 'calc(45px + max(calc(env(safe-area-inset-bottom) - 18px), 4px))';

    // Header glyphs (page.tsx) → feed actions. Same nonce-channel pattern as
    // libraryFacet: the page can't reach into this component's state, so it
    // hands down a command and we consume it here.
    useEffect(() => {
        if (!headerCommand) return;
        if (headerCommand.action === 'search') setSearchOpen(true);
        else if (headerCommand.action === 'sources') setIsSourcesOpen(true);
        else setIsDisplayOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [headerCommand]);

    const selectTab = (tab: BottomTab) => {
        if (tab === activeTab && tab === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (tab === 'home') setViewMode(lastLayout.current);
        else if (tab === 'collections') { setSelectedCollections(new Set()); setOpenCollectionId(null); setViewMode('collections'); }
        else if (tab === 'ask') setViewMode('ask');
        else setViewMode('digest');
    };

    // Swipe in from the left edge to leave the Digest / Collections pages —
    // the same iOS-style back gesture used by the card detail and Ask screens.
    const [isMobileView, setIsMobileView] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 640px)');
        const onChange = () => setIsMobileView(!mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    // One back gesture, target chosen by where you are: a detail place pops to
    // its parent list; a top-level sub-view pops home. Mirrors the visible back
    // button so the chevron and the swipe always agree.
    const handleEdgeBack = useCallback(() => {
        if (viewMode === 'collection') closeCollectionToGallery();
        else if (viewMode === 'digestDetail') closeDigestToList();
        else setViewMode(lastLayout.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode]);
    useEdgeSwipeBack(
        handleEdgeBack,
        isMobileView && (viewMode === 'digest' || viewMode === 'collections' || viewMode === 'collection' || viewMode === 'digestDetail'),
    );

    // If the open collection is deleted out from under the detail view (e.g. from
    // another device), fall back to the gallery instead of a blank place.
    useEffect(() => {
        if (viewMode === 'collection' && openCollectionId && collections.length > 0
            && !collections.some((c) => c.id === openCollectionId)) {
            closeCollectionToGallery();
        }
        // Likewise, if the vault re-locks (app backgrounded) while a private
        // collection is open, bounce back to the gallery — its masked tile.
        if (viewMode === 'collection' && openCollectionId && vaultLocked
            && privateCollectionIds.has(openCollectionId)) {
            closeCollectionToGallery();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, openCollectionId, collections, vaultLocked, privateCollectionIds]);

    // Same bounce for the Private cards view: if the vault relocks while it's
    // showing (app backgrounded), fall back to All so nothing stays exposed.
    useEffect(() => {
        if (vaultLocked && filter === 'private') setFilter('all');
    }, [vaultLocked, filter, setFilter]);
    // True for the card-browsing layouts (everything except the full-screen
    // Ask chat and the Collections gallery), which share the search/filter chrome.
    const isLibraryView = viewMode === 'grid' || viewMode === 'list' || viewMode === 'review';
    // When scoped to exactly one collection, cards offer a quick "remove from it".
    const activeCollectionId = selectedCollections.size === 1 ? Array.from(selectedCollections)[0] : undefined;
    // Count of active grid filters — badges the mobile "Filters" button.
    const activeMobileFilters =
        (filter !== 'all' ? 1 : 0) + selectedCategory.size + selectedTags.size + selectedSources.size;

    // The Digest section's scrollable history — the weekly synthesis rides on
    // top, then every curated digest, newest first. Built once and rendered in
    // both layouts (desktop inline / mobile full-screen overlay).
    const activeSynthesis = latestSynthesis && latestSynthesis.weekId !== dismissedSynthesisWeek ? latestSynthesis : null;
    const digestContent = (
        <DigestView
            digests={digests}
            synthesis={activeSynthesis}
            onOpenCard={openDigestCard}
            onOpenSynthesisCard={(id) => setActiveLinkId(id)}
            onDismissSynthesis={dismissSynthesis}
            onOpenDigestSettings={onOpenDigestSettings}
            onDeleteDigest={uid ? (id) => { void deleteDigest(uid, id); } : undefined}
            onOpenDigest={openDigestDetail}
        />
    );

    // One digest opened as its own place (Task B). 'synthesis' opens the weekly
    // synthesis; any other id opens that curated digest, pinned open with no
    // collapse chrome. Deleting from here pops back to the list.
    const openDigest = openDigestId && openDigestId !== 'synthesis' ? digests.find((d) => d.id === openDigestId) ?? null : null;
    const digestDetailTitle = openDigestId === 'synthesis'
        ? (activeSynthesis?.title || 'Weekly synthesis')
        : (openDigest?.title || 'Digest');
    const digestDetailContent = openDigestId === 'synthesis' && activeSynthesis ? (
        <SynthesisCard synthesis={activeSynthesis} onOpenCard={(id) => setActiveLinkId(id)} onDismiss={dismissSynthesis} />
    ) : openDigest ? (
        <DigestCard
            key={openDigest.id}
            digest={openDigest}
            alwaysOpen
            onOpenCard={openDigestCard}
            onOpenSettings={onOpenDigestSettings}
            onDelete={uid ? (id: string) => { void deleteDigest(uid, id); closeDigestToList(); } : undefined}
        />
    ) : (
        <div className="text-center py-16 text-text-secondary text-sm">That digest is no longer available.</div>
    );

    // Complete member sets, direct-subscribed per collection so neither the
    // detail view's list/count nor a published snapshot is ever truncated by the
    // windowed feed (report 3.15 follow-up). One for the open collection, one for
    // whichever collection the Share sheet targets (they can differ — Share is
    // reachable from the gallery without opening the detail).
    const openCollectionMembers = useCollectionLinks(uid, openCollectionId);
    const shareCollectionMembers = useCollectionLinks(uid, shareCollection?.id ?? null);

    // One collection opened as its own place (Task A): a real header (name,
    // description, count, share status + actions) over the normal card grid.
    const openCol = openCollectionId ? collections.find((c) => c.id === openCollectionId) ?? null : null;
    const collectionDetailContent = openCol ? (() => {
        // The COMPLETE member set (not the windowed feed), so the count and the
        // grid can't silently drop old members. Pending cards are excluded (as in
        // the main feed) and — mirroring visibleLinks — a card that's ALSO in a
        // locked private collection stays hidden here while the vault is locked.
        const members = openCollectionMembers
            .filter((l) => !isPending(l) && (!vaultLocked || !isEffectivelyPrivateCard(l)))
            .sort((a, b) => getTimestampNumber(b.createdAt) - getTimestampNumber(a.createdAt));
        const count = members.length;
        const stale = isShareStale(openCol, members.map((m) => ({ id: m.id })));
        const colStyle = getColorStyleByKey(openCol.color || openCol.name);
        return (
            <div>
                {/* Header — the collection's identity + its own actions, not a
                    filter pill. iOS large-title feel: the bar carries the name,
                    this hero restates it big with the collection's meta below. */}
                <div className="mb-5">
                    <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colStyle.color }} />
                        <h1 className="min-w-0 truncate text-[22px] sm:text-[26px] font-extrabold tracking-tight text-text">{openCol.name}</h1>
                        <span className="shrink-0 whitespace-nowrap text-[13px] sm:text-[14px] font-medium text-text-muted tabular-nums">· {count} {count === 1 ? 'card' : 'cards'}</span>
                        {openCol.isPublic && (
                            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${stale ? 'bg-amber-500/15 text-amber-600' : 'bg-accent/10 text-accent'}`}>
                                <Globe className="w-3 h-3" /> {stale ? 'Update link' : 'Shared'}
                            </span>
                        )}
                    </div>
                    {openCol.description && (
                        <p className="mt-1.5 text-[14px] leading-relaxed text-text-secondary max-w-2xl">{openCol.description}</p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        {/* A private collection can't have a public page — no Share. */}
                        {!openCol.isPrivate && (
                            <button
                                onClick={() => handleShareCollection(openCol)}
                                className={`${ctrlBase} px-3.5 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                            >
                                {openCol.isPublic ? <Globe className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                                <span>{openCol.isPublic ? 'Shared' : 'Share'}</span>
                            </button>
                        )}
                        <button
                            onClick={() => setManageCardsCollection(openCol)}
                            className={`${ctrlBase} px-3.5 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                        >
                            <Plus className="w-4 h-4" /><span>Add cards</span>
                        </button>
                        <button
                            onClick={() => openEditCollectionForm(openCol)}
                            className={`${ctrlBase} px-3.5 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                        >
                            <Pencil className="w-4 h-4" /><span>Edit</span>
                        </button>
                        <button
                            onClick={() => setConfirmDeleteCollection(openCol)}
                            aria-label="Delete collection"
                            className={`${ctrlBase} w-9 px-0 ${ctrlIdle} hover:text-red-500 hover:border-red-500/40`}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Cards — the complete member set for this collection. */}
                {members.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                            <Layers className="w-7 h-7 text-accent" />
                        </div>
                        <h3 className="text-base font-bold text-text">Nothing here yet</h3>
                        <p className="mt-1.5 text-sm text-text-muted">Add cards to build out this collection.</p>
                        <button
                            onClick={() => setManageCardsCollection(openCol)}
                            className="mt-5 inline-flex items-center gap-2 px-4 h-11 rounded-full bg-accent text-white text-sm font-bold shadow-sm shadow-accent/20 hover:bg-accent-hover transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add cards
                        </button>
                    </div>
                ) : (
                    <Masonry columnWidth={340} gap={16}>
                        {members.map((link, idx) => (
                            <Card
                                key={link.id}
                                index={idx}
                                link={link}
                                onOpenDetails={openLinkDetails}
                                onStatusChange={handleStatusChange}
                                onReadStatusChange={handleReadStatusChange}
                                onUpdateCategory={handleUpdateCategory}
                                allCategories={categories}
                                onDelete={handleDelete}
                                onUpdateReminder={handleOpenReminderModal}
                                onTagClick={handleToggleTag}
                                onAddToCollection={handleAddToCollection}
                                onShare={handleShareCard}
                                onTogglePrivate={handleToggleCardPrivate}
                                cardCollections={cardCollectionsByLink.get(link.id)}
                                activeCollectionId={openCol.id}
                                onRemoveFromCollection={handleRemoveFromCollection}
                            />
                        ))}
                    </Masonry>
                )}
            </div>
        );
    })() : null;

    // Tell the page when we're in Ask mode (drives the full-height chat layout).
    useEffect(() => {
        onAskModeChange?.(viewMode === 'ask');
    }, [viewMode, onAskModeChange]);

    // Full-bleed modes (Ask + Review) manage their own height and hide the tab
    // bar, so the page's main should drop its bottom padding — otherwise that
    // padding stacks under the self-sized deck and makes Review scroll.
    useEffect(() => {
        onFullBleedChange?.(viewMode === 'ask' || viewMode === 'review');
    }, [viewMode, onFullBleedChange]);

    // Hide the add-link FAB in Ask, Collections (gallery + detail), Digest (list
    // + detail), and Review — none of these views capture links (and in Review it
    // overlaps the Keep button).
    useEffect(() => {
        onHideAddButton?.(
            viewMode === 'ask' || viewMode === 'collections' || viewMode === 'collection'
            || viewMode === 'digest' || viewMode === 'digestDetail' || viewMode === 'review'
        );
    }, [viewMode, onHideAddButton]);

    if (isLoading) {
        return <FeedSkeleton />;
    }

    return (
        <div className={viewMode === 'ask' ? 'space-y-2' : 'space-y-2 sm:space-y-4 lg:space-y-6'}>
            {/* Pull-to-refresh spinner (M16) — rides the finger down from just under
                the safe-area inset and spins while the refetch is in flight. */}
            <PullRefreshSpinner pull={pull} refreshing={refreshing} animating={animating} />
            {/* Header Section (Not Sticky) */}
            <div className={`pt-1 sm:pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 transition-all duration-300 ${viewMode === 'ask' ? 'space-y-2 pb-0' : 'space-y-2 sm:space-y-4 pb-0 sm:pb-3'}`}>
                {/* Ask mode drops the search bar entirely (typing there just exits Ask)
                    and shows only a Back button, so the chat gets the full height. */}
                {viewMode === 'ask' ? (
                    // Desktop only: the unified subheader (back + icon + title),
                    // matching the Collections tab. On mobile, Ask is a full-screen
                    // fixed overlay that renders its own MobileSubheader.
                    <div className="hidden sm:block">
                        <MobileSubheader
                            onBack={() => setViewMode(lastLayout.current)}
                            backLabel="Back to your library"
                            icon={<MessagesSquare className="w-5 h-5" />}
                            title="Ask Machina"
                        />
                    </div>
                ) : viewMode === 'collections' ? (
                    // Desktop only: the unified subheader rendered inline below the
                    // global header. On mobile, Collections is a full-screen fixed
                    // overlay (rendered separately below) that matches the Ask tab
                    // exactly — flush at the top, no double header, no notch gap.
                    <div className="hidden sm:block">
                        <MobileSubheader
                            onBack={() => setViewMode(lastLayout.current)}
                            backLabel="Back to your library"
                            icon={<Layers className="w-5 h-5" />}
                            title="Collections"
                        >
                            {/* Explicit add affordance — the only way to create a collection. */}
                            <button
                                onClick={openNewCollectionForm}
                                aria-label="New collection"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-text-muted text-xs font-medium hover:text-text active:bg-card-hover transition-colors cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                New
                            </button>
                        </MobileSubheader>
                    </div>
                ) : viewMode === 'collection' ? (
                    // Desktop/tablet: the collection detail flows inline beneath a
                    // subheader whose back returns to the gallery (Task A). Mobile
                    // renders its own full-screen overlay below.
                    <div className="hidden sm:block">
                        <MobileSubheader
                            onBack={closeCollectionToGallery}
                            backLabel="Back to collections"
                            icon={<Layers className="w-5 h-5" />}
                            title={openCol?.name ?? 'Collection'}
                        />
                    </div>
                ) : viewMode === 'digest' ? (
                    // Desktop only: the digest history flows inline beneath this
                    // subheader. Mobile renders its own full-screen overlay below.
                    <div className="hidden sm:block">
                        <MobileSubheader
                            onBack={() => setViewMode(lastLayout.current)}
                            backLabel="Back to your library"
                            icon={<Newspaper className="w-5 h-5" />}
                            title="Digest"
                        />
                    </div>
                ) : viewMode === 'digestDetail' ? (
                    // Tablet: one digest opened inline beneath a subheader whose
                    // back returns to the list (Task B). Mobile uses the overlay.
                    <div className="hidden sm:block">
                        <MobileSubheader
                            onBack={closeDigestToList}
                            backLabel="Back to digests"
                            icon={<Newspaper className="w-5 h-5" />}
                            title={digestDetailTitle}
                        />
                    </div>
                ) : searchOpen ? (
                    // Desktop: like iOS, search is an icon in the toolbar that expands
                    // this input on demand — so the resting layout reclaims the line the
                    // always-on search bar used to occupy. Esc or the × collapses it.
                    <div data-tour="search" className="relative hidden sm:block animate-in fade-in slide-in-from-top-1 duration-200">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                            type="text"
                            autoFocus
                            dir="auto"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') { if (searchQuery) setSearchQuery(''); else setSearchOpen(false); } }}
                            placeholder="Search Machina…"
                            className="w-full pl-9 pr-10 py-2 bg-card rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
                        />
                        <button
                            onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                            aria-label="Close search"
                            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-fill-strong rounded-full transition-all"
                        >
                            <X className="w-4 h-4 text-text-muted" />
                        </button>
                    </div>
                ) : null}


                {/* Mobile Row 1 — the ANCHOR: an always-live search field (tap, type,
                    results — no expand dance) with the filter funnel inside it as a
                    trailing accessory, plus ONE tools capsule (view switcher ‖ select).
                    Selection mode swaps in for the whole row. */}
                {isLibraryView && (
                    isSelectionMode ? (
                        <div className="flex sm:hidden items-center animate-in fade-in slide-in-from-top-1 duration-200">
                            {/* Same 40px height as the row it replaces — no layout hop. */}
                            <div className="flex items-center gap-1 h-10 px-1.5 rounded-full bg-accent/10 border border-accent/20 animate-slide-up">
                                <span className="text-xs font-bold text-accent px-1.5 tabular-nums">{selectedIds.size}</span>
                                <button
                                    onClick={handleBulkArchive}
                                    disabled={selectedIds.size === 0}
                                    title="Archive selected"
                                    aria-label="Archive selected"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-full text-accent cursor-pointer hover:bg-accent hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Archive className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setConfirmBulkDelete(true)}
                                    disabled={selectedIds.size === 0}
                                    title="Delete selected"
                                    aria-label="Delete selected"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-full text-text-secondary cursor-pointer hover:bg-red-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => {
                                        setIsSelectionMode(false);
                                        setSelectedIds(new Set());
                                    }}
                                    title="Cancel selection"
                                    aria-label="Cancel selection"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-full text-text-secondary cursor-pointer hover:bg-card-hover hover:text-text transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : searchOpen ? (
                        <div className="flex sm:hidden items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                <input
                                    type="text"
                                    autoFocus
                                    enterKeyHint="search"
                                    dir="auto"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
                                    placeholder="Search Machina…"
                                    className="w-full h-10 ps-9 pe-9 bg-card border border-border-subtle rounded-full text-[15px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent transition-shadow"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        aria-label="Clear search"
                                        className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text hover:bg-fill-strong transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setSearchOpen(false)}
                                className="shrink-0 text-[13px] font-semibold text-accent px-1.5 py-2"
                            >
                                Done
                            </button>
                        </div>
                    ) : null
                )}


                {/* Row 2: Toolbar — filter / sort / source on the left, view & actions on the
                    right. DESKTOP ONLY (mobile v4 moved all of this to the header
                    glyphs + bottom bar); `hidden sm:flex` so it adds no empty row —
                    or gap — on phones. */}
                {isLibraryView && (
                <div className="hidden sm:flex flex-wrap items-center justify-between gap-y-3 gap-x-2 -mx-2 px-2 sm:mx-0 sm:px-0">
                    {/* Grid filters — inline on desktop/tablet; on mobile they move into the
                        Filters sheet. Hidden entirely in Ask mode (no grid to filter). */}
                    <div className="hidden sm:flex items-center gap-2">
                        {isLibraryView && (<>
                        {/* Search — an icon that expands the input above (iOS-style), so
                            the resting toolbar keeps the reclaimed line. Accent while a
                            query is active so it reads as "on" even when collapsed. */}
                        <button
                            data-tour="search"
                            onClick={() => setSearchOpen(o => !o)}
                            aria-label="Search"
                            title="Search"
                            className={`${ctrlBase} w-9 px-0 border ${searchQuery
                                ? 'bg-accent text-white border-accent shadow-sm'
                                : ctrlIdle}`}
                        >
                            <Search className="w-4 h-4" />
                        </button>
                        {/* ONE consolidated Filter button (mirrors the iOS drawer): opens
                            the responsive filters modal holding Show (status), Categories,
                            and Tags. Sources graduated to their own control (globe, next). */}
                        <button
                            onClick={() => setIsFiltersOpen(true)}
                            aria-label="Filters — status, categories, tags"
                            title="Filters"
                            className={`${ctrlBase} px-3.5 border relative ${activeMobileFilters > 0
                                ? 'bg-accent text-white border-accent shadow-sm'
                                : ctrlIdle}`}
                        >
                            <Filter className="w-4 h-4" />
                            <span>Filter</span>
                            {activeMobileFilters > 0 && (
                                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white/25 text-white">
                                    {activeMobileFilters}
                                </span>
                            )}
                        </button>

                        {/* Sources — the dedicated publisher/channel browser. */}
                        <button
                            onClick={() => setIsSourcesOpen(true)}
                            aria-label="Sources"
                            title="Sources"
                            className={`${ctrlBase} px-3.5 border ${selectedSources.size > 0
                                ? 'bg-accent text-white border-accent shadow-sm'
                                : ctrlIdle}`}
                        >
                            <Globe className="w-4 h-4" />
                            <span>Sources</span>
                        </button>

                        {/* Sort — ordering is orthogonal to filtering, so it stays its own control. */}
                        <Dropdown
                            ariaLabel="Sort order"
                            value={sortBy}
                            onChange={(v) => setSortBy(v as SortType)}
                            leadingIcon={<ArrowUpDown className="w-4 h-4 text-text-secondary" />}
                            options={sortOptions}
                        />
                        </>)}
                    </div>

                    {/* (Mobile: the Filter funnel lives in the search row above. Desktop:
                        the Filter button is in the left cluster of this row.) */}

                    {/* Destinations. Mobile v4: these moved to the bottom tab bar —
                        this row is now desktop-only (`hidden sm:contents` wrappers). */}
                    <div className="flex items-center w-full gap-2 sm:w-auto">
                        {/* Desktop: the original inline chips. */}
                        <div className="hidden sm:contents">
                            <button
                                data-tour="collections"
                                onClick={() => setViewMode('collections')}
                                title="Browse collections"
                                aria-label="Browse collections"
                                className={`${ctrlBase} px-3.5 ${ctrlIdle}`}
                            >
                                <Layers className="w-4 h-4" />
                                <span>Collections</span>
                            </button>
                            {isLibraryView && (
                            <button
                                data-tour="ask"
                                onClick={() => setViewMode('ask')}
                                title="Ask your brain"
                                aria-label="Ask your brain"
                                className={`${ctrlBase} px-3.5 ${ctrlIdle}`}
                            >
                                <MessagesSquare className="w-4 h-4" />
                                <span>Ask</span>
                            </button>
                            )}
                            <button
                                onClick={() => setViewMode('digest')}
                                title="Your curated digests"
                                aria-label="Digest"
                                className={`${ctrlBase} px-3.5 ${ctrlIdle}`}
                            >
                                <Newspaper className="w-4 h-4" />
                                <span>Digest</span>
                            </button>
                        </div>

                        {/* Right zone — view switcher + select chip. Desktop-only here (the
                            mobile copies live in Row 1); `hidden sm:contents` keeps them out
                            of the mobile row while dissolving into the desktop cluster. */}
                        <div className="hidden sm:contents">
                        {isLibraryView && (
                        <div data-tour="views" className="inline-flex items-center gap-0.5 p-1 rounded-full bg-card border border-border-subtle">
                            {viewModes.map(vm => {
                                const active = viewMode === vm.key;
                                return (
                                    <button
                                        key={vm.key}
                                        onClick={() => setViewMode(vm.key)}
                                        title={vm.hint}
                                        aria-pressed={active}
                                        aria-label={vm.hint}
                                        className={`h-7 inline-flex items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${active
                                            ? 'bg-accent text-white shadow-sm px-2 sm:px-3'
                                            : 'w-7 text-text-muted hover:text-text hover:bg-card-hover'
                                            }`}
                                    >
                                        {vm.icon}
                                        {/* Label only on desktop — mobile keeps the pills icon-only. */}
                                        {active && <span className="hidden sm:inline">{vm.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        )}

                        {/* Select multiple — an icon chip beside the view switcher. Hidden
                            while already in selection mode (the accent toolbar takes its
                            place). */}
                        {isLibraryView && !isSelectionMode && (
                            <button
                                onClick={() => setIsSelectionMode(true)}
                                title="Select multiple"
                                aria-label="Select multiple"
                                className={`${ctrlBase} w-9 px-0 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                            >
                                <CheckSquare className="w-4 h-4" />
                            </button>
                        )}

                        {/* Tag filter + bulk selection act on the grid — hide them in Ask mode. */}
                        {isLibraryView && (<>
                        {/* Tag toggle — tablet only (mobile uses the Filters sheet; desktop
                            ≥lg has the persistent sidebar). */}
                        <div className="hidden sm:block lg:hidden">
                        <button
                            onClick={() => setIsTagExplorerOpen(!isTagExplorerOpen)}
                            title="Filter by tags"
                            className={`${ctrlBase} px-3.5 ${selectedTags.size > 0
                                ? 'bg-accent text-white border border-accent shadow-sm'
                                : ctrlIdle
                                }`}
                        >
                            <TagIcon className="w-4 h-4" />
                            <span>Tags{selectedTags.size > 0 && ` (${selectedTags.size})`}</span>
                        </button>
                        </div>

                        {/* Selection Control — the active toolbar. The idle trigger now
                            lives as an icon chip beside the view switcher above. */}
                        {isSelectionMode && (
                            <div className="flex items-center gap-1 h-9 px-1.5 rounded-full bg-accent/10 border border-accent/20 animate-slide-up">
                                <span className="text-xs font-bold text-accent px-1.5 tabular-nums">{selectedIds.size}</span>
                                <button
                                    onClick={handleBulkArchive}
                                    disabled={selectedIds.size === 0}
                                    title="Archive selected"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-full text-accent cursor-pointer hover:bg-accent hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Archive className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setConfirmBulkDelete(true)}
                                    disabled={selectedIds.size === 0}
                                    title="Delete selected"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-full text-text-secondary cursor-pointer hover:bg-red-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => {
                                        setIsSelectionMode(false);
                                        setSelectedIds(new Set());
                                    }}
                                    title="Cancel selection"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-full text-text-secondary cursor-pointer hover:bg-card-hover hover:text-text transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        </>)}
                        </div>{/* /right zone */}
                    </div>
                </div>
                )}
            </div>

            {/* Active "Show by" status filter — a single dismissable pill so
                Archive/Favorites/Unread/etc. are visible and clearable (previously
                the status filter left no on-page trace). It's single-select, so the
                chip's ✕ is the clear — no separate "Clear All" (unlike the
                multi-select tag row below). */}
            {isLibraryView && filter !== 'all' && (() => {
                const active = filterButtons.find(b => b.key === filter);
                if (!active) return null;
                return (
                    <div className="flex flex-wrap items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0 mb-1 animate-in fade-in slide-in-from-top-1 duration-300">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/5 border border-accent/10">
                            {cloneElement(
                                active.icon as ReactElement<{ className?: string }>,
                                { className: 'w-3 h-3 text-accent' }
                            )}
                            <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Showing:</span>
                        </div>
                        <div className="group flex items-center gap-1 ps-2.5 pe-1 py-1 rounded-full bg-card border border-border-subtle text-text-secondary text-xs font-semibold shadow-sm">
                            <span>{active.label}</span>
                            <button
                                type="button"
                                onClick={() => handleFilterSelect('all')}
                                aria-label={`Clear ${active.label} filter`}
                                title="Clear filter"
                                className="flex items-center justify-center rounded-full p-0.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Back to Insights — shown while the feed is scoped to exactly the
                facet a tapped Insights row applied (see insightsBackVisible). */}
            {isLibraryView && insightsBackVisible && (
                <div className="-mx-2 px-2 sm:mx-0 sm:px-0 mb-1 animate-in fade-in slide-in-from-top-1 duration-300">
                    <button
                        onClick={backToInsights}
                        className="inline-flex items-center gap-1 ps-1.5 pe-3 py-1.5 rounded-full bg-card border border-border-subtle text-xs font-semibold text-text-secondary hover:text-text hover:border-accent/40 shadow-sm transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4 rtl:rotate-180 text-accent" />
                        <BarChart3 className="w-3.5 h-3.5 text-accent" />
                        <span>Back to Insights</span>
                    </button>
                </div>
            )}

            {/* Active Tag Filters — shown above the cards (not in Ask mode). */}
            {isLibraryView && selectedTags.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0 mb-1 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/5 border border-accent/10">
                        <TagIcon className="w-3 h-3 text-accent" />
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Filtered By:</span>
                    </div>
                    {Array.from(selectedTags).map(tag => (
                        <div
                            key={tag}
                            className="group flex items-center gap-1 ps-2.5 pe-1 py-1 rounded-full bg-card border border-border-subtle text-text-secondary text-xs font-semibold shadow-sm"
                        >
                            <span>{tag.split('/').pop()}</span>
                            <button
                                type="button"
                                onClick={() => handleToggleTag(tag)}
                                aria-label={`Remove ${tag.split('/').pop()} filter`}
                                title="Remove filter"
                                className="flex items-center justify-center rounded-full p-0.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => setSelectedTags(new Set())}
                        className="text-[10px] font-bold text-text-muted/60 hover:text-accent hover:underline px-2 transition-colors uppercase tracking-tight"
                    >
                        Clear All
                    </button>
                </div>
            )}

            {/* Active Source filters — removable chips, like tags. */}
            {isLibraryView && selectedSources.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0 mb-1 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/5 border border-accent/10">
                        <Globe className="w-3 h-3 text-accent" />
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Sources:</span>
                    </div>
                    {sourceChips.map(chip => (
                        <div
                            key={chip.id}
                            className="group flex items-center gap-1 ps-2.5 pe-1 py-1 rounded-full bg-card border border-border-subtle text-text-secondary text-xs font-semibold shadow-sm"
                        >
                            <span>{chip.label}</span>
                            <button
                                type="button"
                                onClick={() => handleToggleSourceKeys(chip.keys)}
                                aria-label={`Remove ${chip.label} filter`}
                                title="Remove filter"
                                className="flex items-center justify-center rounded-full p-0.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    {sourceChips.length > 1 && (
                        <button
                            onClick={() => setSelectedSources(new Set())}
                            className="text-[10px] font-bold text-text-muted/60 hover:text-accent hover:underline px-2 transition-colors uppercase tracking-tight"
                        >
                            Clear All
                        </button>
                    )}
                </div>
            )}

            {/* Active Collection — banner shown when the feed is scoped to a collection. */}
            {isLibraryView && selectedCollections.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0 mb-1 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/5 border border-accent/10">
                        <Layers className="w-3 h-3 text-accent" />
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Collection:</span>
                    </div>
                    {Array.from(selectedCollections).map(id => {
                        const col = collections.find(c => c.id === id);
                        if (!col) return null;
                        return (
                            <div key={id} className="flex items-center gap-2">
                                <div className="group flex items-center gap-1 ps-2.5 pe-1 py-1 rounded-full bg-card border border-border-subtle text-text text-xs font-semibold shadow-sm">
                                    <span>{col.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCollections(prev => { const n = new Set(prev); n.delete(id); return n; })}
                                        aria-label={`Remove ${col.name} filter`}
                                        title="Clear collection filter"
                                        className="flex items-center justify-center rounded-full p-0.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => setManageCardsCollection(col)}
                                    title="Add or remove cards in this collection"
                                    className={`${ctrlBase} px-2.5 h-7 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add cards</span>
                                </button>
                                <button
                                    onClick={() => handleShareCollection(col)}
                                    title={col.isPublic ? 'Manage sharing (copy link, update, or stop)' : 'Share this collection'}
                                    className={`${ctrlBase} px-2.5 h-7 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                                >
                                    {col.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                                    <span>{col.isPublic ? 'Shared' : 'Share'}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Main Content with Tag Sidebar */}
            <div className="flex flex-col lg:flex-row gap-6 xl:gap-8 relative">
                {/* Tag Explorer Sidebar (Desktop) — card-browsing layouts only. */}
                {isLibraryView && (
                <aside
                    className={`hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out ${isTagExplorerCollapsed ? 'w-10' : 'w-64 xl:w-72'
                        }`}
                >
                    <div className={`sticky top-[72px] h-[calc(100vh-88px)] flex flex-col ${isTagExplorerCollapsed ? '' : 'min-w-[256px] surface-card rounded-2xl border border-border-subtle shadow-[var(--shadow-card)] p-4'}`}>
                        {isTagExplorerCollapsed ? (
                            <button
                                onClick={toggleTagExplorer}
                                className="w-10 h-10 rounded-xl bg-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-accent hover:border-accent/30 transition-all shadow-sm"
                                title="Expand Tags Explorer"
                                aria-label="Expand Tags Explorer"
                            >
                                <TagIcon className="w-5 h-5 transition-transform hover:scale-110" />
                            </button>
                        ) : (
                            <div className="overflow-hidden h-full">
                                <TagExplorer
                                    tags={allTags}
                                    tagCounts={tagCounts}
                                    selectedTags={selectedTags}
                                    onToggleTag={handleToggleTag}
                                    onClearFilters={() => setSelectedTags(new Set())}
                                    onCollapse={toggleTagExplorer}
                                />
                            </div>
                        )}
                    </div>
                </aside>
                )}

                {/* Filters Sheet (Mobile) — consolidates the grid controls behind one tap,
                    keeping the mobile toolbar to a single tidy row. Desktop is untouched. */}
                <MobileFiltersSheet
                    isOpen={isFiltersOpen}
                    onClose={() => setIsFiltersOpen(false)}
                    filter={filter}
                    setFilter={handleFilterSelect}
                    statusTriggerIcon={statusTriggerIcon}
                    statusOptions={statusOptions}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    activeMobileFilters={activeMobileFilters}
                    setSelectedTags={setSelectedTags}
                    categories={categories}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    categoryCounts={categoryCounts}
                    allTags={allTags}
                    tagCounts={tagCounts}
                    selectedTags={selectedTags}
                    onToggleTag={handleToggleTag}
                />

                {/* Sort Sheet (Mobile) — the designated home for sort order. */}
                <MobileSortSheet
                    isOpen={isSortOpen}
                    onClose={() => setIsSortOpen(false)}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    sortOptions={sortOptions}
                />

                {/* Display Sheet (Mobile) — header ⋯: view, sort, filter, select. */}
                <MobileDisplaySheet
                    isOpen={isDisplayOpen}
                    onClose={() => setIsDisplayOpen(false)}
                    viewModes={viewModes}
                    viewMode={viewMode}
                    setViewMode={(v) => setViewMode(v as typeof viewMode)}
                    sortOptions={sortOptions}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    onOpenFilters={() => setIsFiltersOpen(true)}
                    onSelectCards={() => { setViewMode(lastLayout.current); setIsSelectionMode(true); }}
                />

                {/* Sources Sheet — the dedicated publisher/channel browser (all
                    breakpoints; sources moved OUT of the Filters sheet). */}
                <MobileSourcesSheet
                    isOpen={isSourcesOpen}
                    onClose={() => setIsSourcesOpen(false)}
                    sourceFacets={sourceFacets}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onToggleSource={handleToggleSource}
                    onToggleSourceKeys={handleToggleSourceKeys}
                />

                {/* Bottom tab bar (phones) — on EVERY card/collection/digest
                    screen with a consistent scroll-away (LinkedIn) feel. Hidden
                    only in Ask (the chat composer owns the bottom edge) and
                    Review (a focused swipe session whose action row sits where
                    the bar would be). */}
                {viewMode !== 'ask' && viewMode !== 'review' && (
                    <BottomTabBar active={activeTab} onSelect={selectTab} onCapture={() => onCapture?.()} hidden={barHidden} />
                )}

                {/* Tag Explorer Drawer (Mobile) */}
                <MobileTagExplorerDrawer
                    isOpen={isTagExplorerOpen}
                    onClose={() => setIsTagExplorerOpen(false)}
                    tags={allTags}
                    tagCounts={tagCounts}
                    selectedTags={selectedTags}
                    onToggleTag={handleToggleTag}
                    onClearFilters={() => setSelectedTags(new Set())}
                />

                {/* Links Grid / Ask */}
                <div className="flex-grow min-w-0">
                    {/* Search typeahead — split the live results into a "Sources" row
                        (tap a publisher to jump straight to its cards) above the
                        "Cards" grid below, so searching "ynet" offers both. */}
                    {(viewMode === 'grid' || viewMode === 'list') && searchQuery.trim() && matchingSources.length > 0 && (
                        <div className="mb-5 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex items-center gap-2 mb-2.5">
                                <Globe className="w-3.5 h-3.5 text-accent/70" />
                                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">Sources</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {matchingSources.map(s => {
                                    const active = selectedSources.has(s.key);
                                    return (
                                        <button
                                            key={s.key}
                                            onClick={() => {
                                                handleToggleSource(s.key);
                                                // Jump to the source's library view: filter, drop the query.
                                                setSearchQuery('');
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${active
                                                ? 'bg-accent/12 border-accent/40 text-text'
                                                : 'bg-card border-border-subtle text-text-secondary hover:border-text-muted/40 hover:text-text'}`}
                                        >
                                            <span className="shrink-0">{sourceIconFor(s, 'w-3.5 h-3.5')}</span>
                                            <span className="truncate max-w-[12rem]">{s.label}</span>
                                            <span className="tabular-nums text-text-muted">{s.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {filteredLinks.length > 0 && (
                                <div className="flex items-center gap-2 mt-5 mb-1">
                                    <LayoutGrid className="w-3.5 h-3.5 text-accent/70" />
                                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                                        Cards<span className="ms-1 normal-case tracking-normal font-semibold text-text-muted/70">· {filteredLinks.length}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Meaning-search status. Keyword matches render immediately
                        (the hybrid filter runs client-side), so while the semantic
                        half is still in flight — or if it failed — show a subtle
                        line above the grid instead of blocking the results. The
                        empty state owns the no-results case (spinner there). */}
                    {(viewMode === 'grid' || viewMode === 'list') && searchQuery.trim()
                        && filteredLinks.length > 0 && (awaitingServer || searchError) && (
                        <div className="flex items-center gap-2 mb-4 text-xs" aria-live="polite">
                            {awaitingServer ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-accent/20 border-t-accent rounded-full animate-spin shrink-0" />
                                    <span className="text-text-muted font-medium">Searching by meaning…</span>
                                </>
                            ) : (
                                <span className="text-text-muted">Showing keyword matches — meaning search is unavailable right now.</span>
                            )}
                        </div>
                    )}
                    {viewMode === 'collection' ? (
                        // Desktop/tablet: the collection detail place, inline beneath
                        // its subheader. Mobile renders the full-screen overlay below.
                        <div className="hidden sm:block">
                            {collectionDetailContent}
                        </div>
                    ) : viewMode === 'digestDetail' ? (
                        // Desktop/tablet: one opened digest, inline. Mobile overlay below.
                        <div className="hidden sm:block">
                            {digestDetailContent}
                        </div>
                    ) : viewMode === 'digest' ? (
                        // Desktop only: the digest history flows inline beneath the
                        // subheader. Mobile renders the full-screen overlay below.
                        <div className="hidden sm:block">
                            {digestContent}
                        </div>
                    ) : viewMode === 'collections' ? (
                        // Desktop only: gallery flows inline beneath the inline subheader.
                        // Mobile renders the full-screen overlay below (mirrors Ask).
                        <div className="hidden sm:block">
                            <CollectionsGallery
                                collections={collections}
                                links={visibleLinks}
                                suggestions={collectionSuggestions}
                                lockedIds={vaultLocked ? privateCollectionIds : undefined}
                                onOpen={gatedOpenCollection}
                                onEdit={gatedEditCollection}
                                onShare={gatedShareCollection}
                                onDelete={gatedDeleteCollection}
                                onManageCards={gatedManageCollection}
                                onTogglePrivate={handleToggleCollectionPrivate}
                                onCreate={openNewCollectionForm}
                                onCreateSuggestion={handleCreateSuggestion}
                                onDismissSuggestion={handleDismissSuggestion}
                            />
                        </div>
                    ) : viewMode === 'ask' ? (
                        <AskBrain
                            uid={uid}
                            totalLinks={visibleLinks.length}
                            onOpenLink={(id) => setActiveLinkId(id)}
                            onExit={() => setViewMode(lastLayout.current)}
                            // A cited-card modal (or any Feed sheet/dialog) open over
                            // Ask owns the edge-swipe; Ask stands down so one swipe
                            // pops only the modal, back to the chat — not out to home.
                            overlayOpen={anyOverlayOpen}
                            links={visibleLinks}
                        />
                    ) : filteredLinks.length === 0 && pendingCards.length === 0 ? (
                        (() => {
                            // One (icon, title, body) per state, matched to the view's
                            // actual topic — the search case wins over the filter cases,
                            // and every FilterType has its own branch so a filtered view
                            // never falls through to the "empty account" pitch.
                            const empty = searchQuery
                                ? {
                                    Icon: Search, title: 'No matches',
                                    body: awaitingServer ? null
                                        : searchError ? 'No keyword matches, and meaning search is unavailable right now.'
                                        : 'Try different words — search reads titles, summaries, and meaning.',
                                }
                                : filter === 'reminders' ? {
                                    Icon: Bell, title: 'No reminders set',
                                    body: 'Pick “Remind me” on any card and it will resurface here when it’s due.',
                                }
                                : filter === 'favorite' ? {
                                    Icon: Star, title: 'No favorites yet',
                                    body: 'Tap the star on a card to keep your best saves in one place.',
                                }
                                : filter === 'archived' ? {
                                    Icon: Archive, title: 'Nothing archived',
                                    body: 'Archive cards you’re done with to keep your feed focused.',
                                }
                                : filter === 'unread' ? {
                                    Icon: CheckCircle2, title: 'All caught up',
                                    body: 'Every save has been read. New links land here first.',
                                }
                                : filter === 'read' ? {
                                    Icon: BookOpenCheck, title: 'Nothing read yet',
                                    body: 'Cards you open and finish collect here.',
                                }
                                : filter === 'private' ? {
                                    Icon: Lock, title: 'No private cards',
                                    body: 'Choose “Make private” on a card to keep it behind your PIN.',
                                }
                                : selectedCategory.size > 0 ? {
                                    Icon: LayoutGrid, title: `Nothing in ${Array.from(selectedCategory).join(', ')}`,
                                    body: 'Machina files new saves automatically — try another category for now.',
                                }
                                : selectedTags.size > 0 ? {
                                    Icon: TagIcon, title: 'No cards with these tags',
                                    body: 'Remove a tag or two to widen the results.',
                                }
                                : (selectedSources.size > 0 || selectedCollections.size > 0) ? {
                                    Icon: Filter, title: 'Nothing matches these filters',
                                    body: 'Clear a filter or two to widen the results.',
                                }
                                : {
                                    Icon: Inbox, title: 'Your Machina is empty',
                                    body: 'Save your first link with the + button — Machina reads it, tags it, and files it for you.',
                                };
                            return (
                        <div className="text-center py-16 px-6 animate-fade-in">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                                <empty.Icon className="w-7 h-7 text-accent" strokeWidth={1.75} />
                            </div>
                            <h3 className="text-base font-bold text-text">{empty.title}</h3>
                            {searchQuery && awaitingServer && (
                                <div className="flex items-center justify-center gap-2 text-accent mt-2">
                                    <div className="w-4 h-4 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                                    <span className="text-sm font-medium">Searching by meaning…</span>
                                </div>
                            )}
                            {empty.body && (
                                <p className="mt-1.5 max-w-xs mx-auto text-sm text-text-muted leading-relaxed">{empty.body}</p>
                            )}
                            {/* Brand-new, genuinely empty account (no query, no
                                filters): offer a one-tap seeded example so Ask /
                                search / Collections demo against something real
                                in the first minute — instead of a dead end. */}
                            {links.length === 0 && filter === 'all' && !searchQuery && !debouncedQuery &&
                                selectedCategory.size === 0 && selectedTags.size === 0 &&
                                selectedSources.size === 0 && selectedCollections.size === 0 && (
                                <button
                                    onClick={handleSeedExample}
                                    disabled={seedingExample}
                                    className="mt-5 inline-flex items-center gap-2 px-4 h-11 rounded-full bg-accent text-white text-sm font-bold shadow-sm shadow-accent/20 hover:bg-accent-hover active:scale-95 transition-all disabled:opacity-60 disabled:pointer-events-none"
                                >
                                    {seedingExample ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Adding…
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            Try it with an example
                                        </>
                                    )}
                                </button>
                            )}
                            {(selectedTags.size > 0 || selectedSources.size > 0 || selectedCategory.size > 0 || selectedCollections.size > 0 || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setSelectedTags(new Set());
                                        setSelectedSources(new Set());
                                        setSelectedCategory(new Set());
                                        setSelectedCollections(new Set());
                                        setSearchQuery('');
                                    }}
                                    className="mt-5 inline-flex items-center gap-2 px-4 h-10 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover active:scale-95 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                    Clear filters
                                </button>
                            )}
                        </div>
                            );
                        })()
                    ) : viewMode === 'review' ? (
                        <SwipeDeck
                            links={filteredLinks}
                            onFavorite={swipeFavorite}
                            onArchive={swipeArchive}
                            onRemind={handleOpenReminderModal}
                            onOpen={openLinkDetails}
                            onResetStatus={swipeResetStatus}
                            onCancelRemind={swipeCancelRemind}
                            remindSignal={remindSignal}
                            onExit={() => setViewMode(lastLayout.current === 'review' ? 'grid' : lastLayout.current)}
                        />
                    ) : viewMode === 'list' ? (
                        <div className="flex flex-col gap-2 max-w-3xl mx-auto">
                            {feedModules}
                            {pendingCards.map(renderPendingCard)}
                            {filteredLinks.map((link, idx) => (
                                // cv-card: off-screen rows skip layout/paint (3.15).
                                <div key={link.id} className="cv-card">
                                    <ListCard
                                        index={idx}
                                        link={link}
                                        onOpenDetails={openLinkDetails}
                                        onStatusChange={handleStatusChange}
                                        onDelete={handleDelete}
                                        isSelectionMode={isSelectionMode}
                                        isSelected={selectedIds.has(link.id)}
                                        onToggleSelection={toggleSelection}
                                    />
                                </div>
                            ))}
                            <LoadMoreSentinel hasMore={hasMore} onLoadMore={loadMore} />
                        </div>
                    ) : (
                        <>
                        {feedModules}
                        <Masonry columnWidth={340} gap={16}>
                            {pendingCards.map(renderPendingCard)}
                            {filteredLinks.map((link, idx) => (
                                <Card
                                    key={link.id}
                                    index={idx}
                                    link={link}
                                    onOpenDetails={openLinkDetails}
                                    onStatusChange={handleStatusChange}
                                    onReadStatusChange={handleReadStatusChange}
                                    onUpdateCategory={handleUpdateCategory}
                                    allCategories={categories}
                                    onDelete={handleDelete}
                                    onUpdateReminder={handleOpenReminderModal}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedIds.has(link.id)}
                                    onToggleSelection={toggleSelection}
                                    onTagClick={handleToggleTag}
                                    onAddToCollection={handleAddToCollection}
                                    onShare={handleShareCard}
                                    onTogglePrivate={handleToggleCardPrivate}
                                    cardCollections={cardCollectionsByLink.get(link.id)}
                                    activeCollectionId={activeCollectionId}
                                    onRemoveFromCollection={handleRemoveFromCollection}
                                />
                            ))}
                        </Masonry>
                        <LoadMoreSentinel hasMore={hasMore} onLoadMore={loadMore} />
                        </>
                    )}
                </div>
            </div>

            {/* Collections — full-screen overlay (mobile only). Mirrors the Ask tab's
                container exactly so entering Collections feels identical: the
                fixed overlay covers the global header, MobileSubheader sits flush
                at the top (its env(safe-area-inset-top) padding now lands at the
                real screen top), and the gallery scrolls in the region below. */}
            {viewMode === 'collections' && (
                <div className="sm:hidden fixed inset-x-0 top-0 z-50 bg-background flex flex-col animate-fade-in transition-[bottom] duration-300 [transition-timing-function:var(--ease-modal)]" style={{ bottom: overlayBottom }}>
                    <MobileSubheader
                        onBack={() => setViewMode(lastLayout.current)}
                        backLabel="Back to your library"
                        icon={<Layers className="w-5 h-5" />}
                        title="Collections"
                    >
                        <button
                            onClick={openNewCollectionForm}
                            aria-label="New collection"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-text-muted text-xs font-medium hover:text-text active:bg-card-hover transition-colors cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            New
                        </button>
                    </MobileSubheader>
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: '1rem' }}>
                        <CollectionsGallery
                            collections={collections}
                            links={visibleLinks}
                            suggestions={collectionSuggestions}
                            lockedIds={vaultLocked ? privateCollectionIds : undefined}
                            onOpen={gatedOpenCollection}
                            onEdit={gatedEditCollection}
                            onShare={gatedShareCollection}
                            onDelete={gatedDeleteCollection}
                            onManageCards={gatedManageCollection}
                            onTogglePrivate={handleToggleCollectionPrivate}
                            onCreate={openNewCollectionForm}
                            onCreateSuggestion={handleCreateSuggestion}
                            onDismissSuggestion={handleDismissSuggestion}
                        />
                    </div>
                </div>
            )}

            {/* Digest — mobile full-screen overlay (mirrors Collections). */}
            {viewMode === 'digest' && (
                <div className="sm:hidden fixed inset-x-0 top-0 z-50 bg-background flex flex-col animate-fade-in transition-[bottom] duration-300 [transition-timing-function:var(--ease-modal)]" style={{ bottom: overlayBottom }}>
                    <MobileSubheader
                        onBack={() => setViewMode(lastLayout.current)}
                        backLabel="Back to your library"
                        icon={<Newspaper className="w-5 h-5" />}
                        title="Digest"
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: '1rem' }}>
                        {digestContent}
                    </div>
                </div>
            )}

            {/* Collection detail — mobile full-screen place (Task A). Back returns
                to the gallery (button + edge-swipe), never to the home library. */}
            {viewMode === 'collection' && openCol && (
                <div className="sm:hidden fixed inset-x-0 top-0 z-50 bg-background flex flex-col animate-fade-in transition-[bottom] duration-300 [transition-timing-function:var(--ease-modal)]" style={{ bottom: overlayBottom }}>
                    <MobileSubheader
                        onBack={closeCollectionToGallery}
                        backLabel="Back to collections"
                        icon={<Layers className="w-5 h-5" />}
                        title={openCol.name}
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: '1rem' }}>
                        {collectionDetailContent}
                    </div>
                </div>
            )}

            {/* Digest detail — mobile full-screen place (Task B). Back returns to
                the list of digests. */}
            {viewMode === 'digestDetail' && (
                <div className="sm:hidden fixed inset-x-0 top-0 z-50 bg-background flex flex-col animate-fade-in transition-[bottom] duration-300 [transition-timing-function:var(--ease-modal)]" style={{ bottom: overlayBottom }}>
                    <MobileSubheader
                        onBack={closeDigestToList}
                        backLabel="Back to digests"
                        icon={<Newspaper className="w-5 h-5" />}
                        title={digestDetailTitle}
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: '1rem' }}>
                        {digestDetailContent}
                    </div>
                </div>
            )}

            {/* Active Link Modal */}
            {activeLink && (
                <LinkDetailModal
                    link={activeLink}
                    allLinks={visibleLinks}
                    allCategories={categories}
                    uid={uid}
                    isOpen={!!activeLink}
                    onClose={closeActiveLinkStack}
                    onBack={goBackOrClose}
                    canGoBack={linkStack.length > 0}
                    onStatusChange={handleStatusChange}
                    onReadStatusChange={handleReadStatusChange}
                    onUpdateTags={handleUpdateTags}
                    onUpdateCategory={handleUpdateCategory}
                    onUpdateTitle={handleUpdateTitle}
                    onUpdateSummary={handleUpdateSummary}
                    onUpdateNote={handleUpdateNote}
                    onUpdateNotes={handleUpdateNotes}
                    onUpdateReminder={handleOpenReminderModal}
                    onDelete={handleDelete}
                    onOpenOtherLink={openRelatedLink}
                    excludeRelatedIds={linkStack}
                    onAddToCollection={(link) => setAddToCollectionLink(link)}
                    onShare={handleShareCard}
                />
            )}

            {/* Add to collection sheet */}
            {addToCollectionLink && (
                <AddToCollectionSheet
                    uid={uid}
                    link={links.find(l => l.id === addToCollectionLink.id) ?? addToCollectionLink}
                    collections={collections}
                    links={visibleLinks}
                    isOpen={!!addToCollectionLink}
                    onClose={() => setAddToCollectionLink(null)}
                />
            )}

            {/* Share collection — preview, publish/update, copy link, stop sharing. */}
            {shareCollection && (
                <ShareCollectionSheet
                    uid={uid}
                    collection={collections.find(c => c.id === shareCollection.id) ?? shareCollection}
                    memberLinks={shareCollectionMembers}
                    isOpen={!!shareCollection}
                    onClose={() => setShareCollection(null)}
                />
            )}

            {/* Create / edit collection */}
            <CollectionFormModal
                uid={uid}
                collection={editingCollection}
                isOpen={collectionFormOpen}
                onClose={() => setCollectionFormOpen(false)}
            />

            {/* Add / remove cards in a collection */}
            {manageCardsCollection && (
                <ManageCollectionCardsSheet
                    uid={uid}
                    collection={collections.find(c => c.id === manageCardsCollection.id) ?? manageCardsCollection}
                    links={visibleLinks}
                    isOpen={!!manageCardsCollection}
                    onClose={() => setManageCardsCollection(null)}
                />
            )}

            {/* Privacy vault — PIN prompt gating actions on a private collection.
                A successful unlock opens the vault for the session (until the
                app is backgrounded) and then runs the intended action. */}
            {unlockPrompt && uid && (
                <PinLockModal
                    uid={uid}
                    mode="unlock"
                    isOpen
                    onClose={() => setUnlockPrompt(null)}
                    onSuccess={() => {
                        const run = unlockPrompt;
                        setUnlockPrompt(null);
                        run();
                    }}
                />
            )}

            {/* First-time PIN setup on "Make private" (card or collection);
                runs the pending make-private action after the PIN is saved. */}
            {pinSetupAction && uid && (
                <PinLockModal
                    uid={uid}
                    mode="setup"
                    isOpen
                    onClose={() => setPinSetupAction(null)}
                    onSuccess={() => {
                        const run = pinSetupAction;
                        setPinSetupAction(null);
                        run();
                    }}
                />
            )}

            {/* Delete collection confirmation */}
            <ConfirmDialog
                isOpen={confirmDeleteCollection !== null}
                onClose={() => setConfirmDeleteCollection(null)}
                onConfirm={() => { if (confirmDeleteCollection) performDeleteCollection(confirmDeleteCollection); }}
                title={`Delete “${confirmDeleteCollection?.name ?? ''}”?`}
                message="This removes the collection and unlinks its cards. The cards themselves are kept. This can't be undone."
                confirmLabel="Delete"
                variant="danger"
            />

            {/* Reminder Modal */}
            {reminderModalLink && uid && (
                <ReminderModal
                    uid={uid}
                    link={reminderModalLink}
                    isOpen={!!reminderModalLink}
                    onClose={() => { if (!remindSavedRef.current) resolveRemind(reminderModalLink, false); setReminderModalLink(null); }}
                    onUpdate={() => {
                        remindSavedRef.current = true;
                        resolveRemind(reminderModalLink, true);
                        setReminderModalLink(null);
                        // Moment of intent: the user just asked to be reminded. On
                        // native, if push has never been prompted (so it's off),
                        // surface the existing push nudge to offer notifications —
                        // reusing PushNudge, not a new permission flow. Once
                        // prompted (granted or dismissed) we respect that choice
                        // and don't re-nag; the in-app "Reminders due" strip is the
                        // guaranteed channel either way.
                        if (isNativeApp() && readLocalPushPrompt() === null) {
                            setShowPushNudge(true);
                        }
                    }}
                />
            )}

            {/* Delete confirmation (single) — branded, replaces window.confirm */}
            <ConfirmDialog
                isOpen={confirmDeleteId !== null}
                onClose={() => setConfirmDeleteId(null)}
                onConfirm={() => {
                    if (confirmDeleteId) performDelete(confirmDeleteId);
                }}
                title="Delete this card?"
                message="It'll be removed from your Machina, along with its summary and connections."
                confirmLabel="Delete"
                variant="danger"
            />

            {/* Delete confirmation (bulk) */}
            <ConfirmDialog
                isOpen={confirmBulkDelete}
                onClose={() => setConfirmBulkDelete(false)}
                onConfirm={performBulkDelete}
                title={`Delete ${selectedIds.size} card${selectedIds.size === 1 ? '' : 's'}?`}
                message="They'll be removed from your Machina, along with their summaries and connections."
                confirmLabel="Delete"
                variant="danger"
            />
        </div>
    );
}

export default function Feed({ onAskModeChange, onHideAddButton, onProcessingChange, onOpenDigestSettings, onHasCardsChange, libraryFacet, onLibraryFacetApplied, onBackToInsights, headerCommand, onCapture, onTabChange, onFullBleedChange }: { onAskModeChange?: (isAsk: boolean) => void; onHideAddButton?: (hide: boolean) => void; onProcessingChange?: (state: import('@/components/AnalyzingBanner').AnalyzingState | null) => void; onOpenDigestSettings?: () => void; onHasCardsChange?: (hasCards: boolean) => void; libraryFacet?: import('@/lib/stats').LibraryFacetRequest | null; onLibraryFacetApplied?: () => void; onBackToInsights?: () => void; headerCommand?: { action: 'search' | 'sources' | 'display'; nonce: number } | null; onCapture?: () => void; onTabChange?: (tab: BottomTab) => void; onFullBleedChange?: (full: boolean) => void }) {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-text/20 border-t-text rounded-full animate-spin" />
            </div>
        }>
            <FeedContent onAskModeChange={onAskModeChange} onHideAddButton={onHideAddButton} onProcessingChange={onProcessingChange} onOpenDigestSettings={onOpenDigestSettings} onHasCardsChange={onHasCardsChange} libraryFacet={libraryFacet} onLibraryFacetApplied={onLibraryFacetApplied} onBackToInsights={onBackToInsights} headerCommand={headerCommand} onCapture={onCapture} onTabChange={onTabChange} onFullBleedChange={onFullBleedChange} />
        </Suspense>
    );
}
