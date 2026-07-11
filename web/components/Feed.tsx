'use client';
// Refreshed colors, layout, and synchronized typography



import { useState, useEffect, useRef, useMemo, useCallback, cloneElement, type ReactElement } from 'react';
import { Link, Collection, WeeklySynthesis, CuratedDigest, DigestCardRef } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { platformIcon, platformColor, type PlatformKey } from '@/lib/platform';
import SourceFacetList from './SourceFacetList';
import DigestView from './DigestView';
import Dropdown from './Dropdown';
import { updateLinkStatus, deleteLink, updateLinkReminder, saveLink } from '@/lib/storage';
import { EXAMPLE_CARD } from '@/lib/exampleCard';
import { track } from '@/lib/analytics';
import { collection, onSnapshot, doc, updateDoc, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
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
import MobileCategoriesTagsSheet from './feed/MobileCategoriesTagsSheet';
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
import { Search, Inbox, Archive, Star, X, LayoutGrid, MessagesSquare, Trash2, ArrowUpDown, Tag as TagIcon, Tags, Filter, Bell, CheckCircle2, CheckSquare, Layers, GalleryHorizontalEnd, List, Image as ImageIcon, ChevronDown, Share2, Globe, Plus, Newspaper, Sparkles } from 'lucide-react';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useProcessingBanner } from '@/lib/useProcessingBanner';
import { subscribeLatestSynthesis } from '@/lib/synthesis';
import { subscribeDigests, deleteDigest } from '@/lib/digest';
import { PUSH_INTENT_EVENT, PUSH_FOREGROUND_EVENT, consumePendingPushIntent, readLocalPushPrompt, type PushIntent } from '@/lib/push';
import { isNativeApp } from '@/lib/api';
import PushNudge from './PushNudge';
import { publishCollection, unpublishCollection, deleteCollection } from '@/lib/collections';
import { shareLink, shareUrlFor, openExternal } from '@/lib/share';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import TagExplorer from './TagExplorer';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

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
function FeedContent({ onAskModeChange, onHideAddButton, onProcessingChange, onOpenDigestSettings, onHasCardsChange }: { onAskModeChange?: (isAsk: boolean) => void; onHideAddButton?: (hide: boolean) => void; onProcessingChange?: (state: import('@/components/AnalyzingBanner').AnalyzingState | null) => void; onOpenDigestSettings?: () => void; onHasCardsChange?: (hasCards: boolean) => void }) {
    const searchParams = useSearchParams();
    const { uid } = useAuth();
    const toast = useToast();
    // Links subscription + pull-refresh (R-3: useLinks).
    const { links, isLoading, handlePullRefresh } = useLinks(uid, toast);
    const [searchQuery, setSearchQuery] = useState('');
    // Debounced, generation-guarded semantic search (R-3: useSemanticSearch).
    const { debouncedQuery, isSearching, searchResults } = useSemanticSearch(searchQuery);
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
    } = useFeedFilters(links, debouncedQuery, searchResults);
    // Card action handlers that depend only on [uid, toast] (R-3: useLinkActions).
    const {
        handleStatusChange,
        handleReadStatusChange,
        handleUpdateTags,
        handleUpdateCategory,
        handleUpdateTitle,
        handleUpdateSummary,
        handleUpdateNote,
        handleRetryProcessing,
        handleRemoveFromCollection,
        handleShareCard,
    } = useLinkActions(uid, toast);
    const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
    // Back-stack for related-card navigation: opening a card *from* another card
    // pushes the current one, so closing returns there instead of dismissing all.
    const [linkStack, setLinkStack] = useState<string[]>([]);
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const activeLink = links.find(l => l.id === activeLinkId) || null;

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
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'review' | 'ask' | 'collections' | 'digest'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);
    const [isTagExplorerOpen, setIsTagExplorerOpen] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
    // Mobile: the search bar is collapsed to an icon; tapping it expands a large
    // search field in place, so the card grid gets the vertical space back.
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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

    // Collections
    const [collections, setCollections] = useState<Collection[]>([]);
    const [addToCollectionLink, setAddToCollectionLink] = useState<Link | null>(null);
    const [collectionFormOpen, setCollectionFormOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<Collection | null>(null);
    const [manageCardsCollection, setManageCardsCollection] = useState<Collection | null>(null);

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
            console.error("Collections sync error:", error);
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
        if (!linkId || links.length === 0) return;
        if (consumedDeepLinkRef.current === linkId) return;

        const link = links.find(l => l.id === linkId);
        if (!link) return;

        consumedDeepLinkRef.current = linkId;
        setActiveLinkId(link.id);

        // Drop ?linkId from the URL so closing the modal is final and a manual
        // refresh won't re-open it. history.replaceState avoids a Next navigation
        // (and the scroll reset that comes with it).
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('linkId');
            window.history.replaceState(window.history.state, '', url.toString());
        }
    }, [searchParams, links]);

    // Only the scrollable card layouts drive pull-to-refresh; disable it while a
    // full-screen mode (Ask/Collections) or any overlay/sheet owns the screen so
    // the gesture never fights a modal's own scrolling.
    const anyOverlayOpen =
        activeLinkId !== null || isTagExplorerOpen || isFiltersOpen || isCategoriesOpen ||
        reminderModalLink !== null || confirmDeleteId !== null || confirmBulkDelete ||
        addToCollectionLink !== null || collectionFormOpen || confirmDeleteCollection !== null ||
        manageCardsCollection !== null;
    const { pull, refreshing, animating } = usePullToRefresh({
        onRefresh: handlePullRefresh,
        enabled: (viewMode === 'grid' || viewMode === 'list') && !anyOverlayOpen,
    });

    // Lock the page behind any open overlay/sheet so scrolling inside a menu (the
    // Filters sheet, a confirm dialog, etc.) never scrolls the feed behind it.
    useEffect(() => {
        if (!anyOverlayOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [anyOverlayOpen]);

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
        && !debouncedQuery.trim();

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
        } catch {
            /* best-effort dismiss; the live snapshot keeps the source of truth */
        }
    }, [uid]);
    const dueLinks = useMemo(() => links.filter((l) => l.reminderDue === true), [links]);

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

    const handleBulkArchive = async () => {
        if (!uid) return;
        try {
            await Promise.all(Array.from(selectedIds).map(id => updateLinkStatus(uid, id, 'archived')));
            toast.success(`Archived ${selectedIds.size} link${selectedIds.size === 1 ? '' : 's'}`);
        } catch {
            toast.error("Couldn't archive some links. Please try again.");
        }
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    };

    const performBulkDelete = async () => {
        if (!uid) return;
        try {
            await Promise.all(Array.from(selectedIds).map(id => deleteLink(uid, id)));
            toast.success(`Deleted ${selectedIds.size} link${selectedIds.size === 1 ? '' : 's'}`);
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
    // Open a collection: scope the feed to it and drop back into the card grid.
    const openCollection = (collectionId: string) => {
        setSelectedCollections(new Set([collectionId]));
        setViewMode('grid');
    };

    // Publish (or re-publish) a collection snapshot, then open the share sheet.
    const handleShareCollection = async (col: Collection) => {
        if (!uid) return;
        try {
            const members = links.filter(l => (l.collectionIds ?? []).includes(col.id));
            const shareId = await publishCollection(uid, col, members);
            const outcome = await shareLink(
                shareUrlFor(`/c?id=${shareId}`),
                col.name,
                `${col.name} — a collection on Machina`
            );
            if (outcome === 'copied') toast.success('Share link copied to clipboard');
            else if (outcome === 'failed') toast.error("Couldn't create a share link. Please try again.");
            else toast.success('Collection published');
        } catch {
            toast.error("Couldn't share this collection. Please try again.");
        }
    };

    const handleUnpublishCollection = async (col: Collection) => {
        if (!uid) return;
        try {
            await unpublishCollection(uid, col);
            toast.success('Sharing turned off');
        } catch {
            toast.error("Couldn't stop sharing. Please try again.");
        }
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

    // Stable SwipeDeck (Review mode) action handlers.
    const swipeFavorite = useCallback((link: Link) => handleStatusChange(link.id, 'favorite'), [handleStatusChange]);
    const swipeArchive = useCallback((link: Link) => handleStatusChange(link.id, 'archived'), [handleStatusChange]);
    const swipeResetStatus = useCallback((link: Link) => handleStatusChange(link.id, 'unread'), [handleStatusChange]);
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
    ];

    // Shared styling so every toolbar control is the same height, weight, and
    // clearly interactive (consistent 36px target, readable text, real cursor).
    const ctrlBase =
        'h-9 inline-flex items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';
    const ctrlIdle =
        'bg-card border border-border-subtle text-text-secondary hover:bg-card-hover hover:text-text hover:border-text-muted/40';

    // Status filter options for the custom dropdown (Reminders has its own toggle).
    const statusOptions = [
        { value: 'all', label: 'All', icon: <Inbox className="w-4 h-4 text-text-secondary" /> },
        { value: 'unread', label: 'Unread', icon: <Inbox className="w-4 h-4 text-accent" /> },
        { value: 'read', label: 'Read', icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
        { value: 'favorite', label: 'Favorites', icon: <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> },
        // Reminders lives here as a Show option (was a separate toolbar button).
        { value: 'reminders', label: reminderCount > 0 ? `Reminders (${reminderCount})` : 'Reminders', icon: <Bell className="w-4 h-4 text-blue-500" /> },
        { value: 'archived', label: 'Archived', icon: <Archive className="w-4 h-4 text-text-secondary" /> },
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
    useEdgeSwipeBack(
        () => setViewMode(lastLayout.current),
        isMobileView && (viewMode === 'digest' || viewMode === 'collections'),
    );
    // True for the card-browsing layouts (everything except the full-screen
    // Ask chat and the Collections gallery), which share the search/filter chrome.
    const isLibraryView = viewMode === 'grid' || viewMode === 'list' || viewMode === 'review';
    // When scoped to exactly one collection, cards offer a quick "remove from it".
    const activeCollectionId = selectedCollections.size === 1 ? Array.from(selectedCollections)[0] : undefined;
    // Count of active grid filters — badges the mobile "Filters" button.
    const activeMobileFilters =
        (filter !== 'all' ? 1 : 0) + selectedSources.size + selectedTags.size + selectedCollections.size;

    // The Digest section's scrollable history — the weekly synthesis rides on
    // top, then every curated digest, newest first. Built once and rendered in
    // both layouts (desktop inline / mobile full-screen overlay).
    const digestContent = (
        <DigestView
            digests={digests}
            synthesis={latestSynthesis && latestSynthesis.weekId !== dismissedSynthesisWeek ? latestSynthesis : null}
            onOpenCard={openDigestCard}
            onOpenSynthesisCard={(id) => setActiveLinkId(id)}
            onDismissSynthesis={dismissSynthesis}
            onOpenDigestSettings={onOpenDigestSettings}
            onDeleteDigest={uid ? (id) => { void deleteDigest(uid, id); } : undefined}
        />
    );

    // Tell the page when we're in Ask mode (drives the full-height chat layout).
    useEffect(() => {
        onAskModeChange?.(viewMode === 'ask');
    }, [viewMode, onAskModeChange]);

    // Hide the add-link FAB in Ask, Collections, Digest, and Review — none of
    // these views capture links (and in Review it overlaps the Keep button).
    useEffect(() => {
        onHideAddButton?.(viewMode === 'ask' || viewMode === 'collections' || viewMode === 'digest' || viewMode === 'review');
    }, [viewMode, onHideAddButton]);

    if (isLoading) {
        return <FeedSkeleton />;
    }

    return (
        <div className={viewMode === 'ask' ? 'space-y-2' : 'space-y-4 lg:space-y-6'}>
            {/* Pull-to-refresh spinner (M16) — rides the finger down from just under
                the safe-area inset and spins while the refetch is in flight. */}
            <PullRefreshSpinner pull={pull} refreshing={refreshing} animating={animating} />
            {/* Header Section (Not Sticky) */}
            <div className={`pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 transition-all duration-300 ${viewMode === 'ask' ? 'space-y-2 pb-0' : 'space-y-3 sm:space-y-4 pb-3'}`}>
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
                ) : (
                    // Desktop keeps the full search bar; on mobile it collapses to a
                    // search icon in the toolbar row below (expandable in place).
                    <div data-tour="search" className="relative hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search Machina…"
                            className="w-full pl-9 pr-10 py-2 bg-card rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-fill-strong rounded-full transition-all"
                            >
                                <X className="w-4 h-4 text-text-muted" />
                            </button>
                        )}
                    </div>
                )}

                {/* Row 1: Category Navigator — only relevant when browsing the full grid.
                    Hidden while scoped to a collection (the collection already narrows the set).
                    Desktop shows scrollable chips; mobile collapses them into one button. */}
                {isLibraryView && selectedCollections.size === 0 && (<>
                <div className="relative hidden sm:block -mx-4 px-4 sm:mx-0 sm:px-0 group/category-nav">
                    {/* Left/Right Fades for Scrollability Cue */}
                    <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none opacity-0 group-hover/category-nav:opacity-100 transition-opacity duration-300 sm:left-0 sm:from-background" />
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none opacity-0 group-hover/category-nav:opacity-100 transition-opacity duration-300 sm:right-0 sm:from-background" />

                    <div
                        ref={categoryScrollRef}
                        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide cursor-grab active:cursor-grabbing select-none"
                        onWheel={(e) => {
                            if (categoryScrollRef.current) {
                                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                                    categoryScrollRef.current.scrollLeft += e.deltaY;
                                }
                            }
                        }}
                        onMouseDown={(e) => {
                            if (!categoryScrollRef.current) return;
                            setIsDragging(true);
                            isDraggingRef.current = false; // Reset on mousedown
                            setStartX(e.pageX - categoryScrollRef.current.offsetLeft);
                            setScrollLeft(categoryScrollRef.current.scrollLeft);
                        }}
                        onMouseLeave={() => {
                            setIsDragging(false);
                            // Keep ref as is for a moment to block pending clicks
                            setTimeout(() => { isDraggingRef.current = false; }, 100);
                        }}
                        onMouseUp={() => {
                            setIsDragging(false);
                            // We use a small timeout to let any pending click event fire first (which we'll block)
                            setTimeout(() => { isDraggingRef.current = false; }, 100);
                        }}
                        onMouseMove={(e) => {
                            if (!isDragging || !categoryScrollRef.current) return;
                            const x = e.pageX - categoryScrollRef.current.offsetLeft;
                            const walk = (x - startX) * 2;
                            if (Math.abs(walk) > 5) {
                                isDraggingRef.current = true;
                            }
                            categoryScrollRef.current.scrollLeft = scrollLeft - walk;
                        }}
                    >
                        <button
                            onClick={() => {
                                if (isDraggingRef.current) return;
                                setSelectedCategory(new Set());
                            }}
                            className={`px-3 py-1.5 rounded-full text-[13px] font-bold transition-all border whitespace-nowrap min-h-[34px] flex-shrink-0 ${selectedCategory.size === 0
                                ? 'bg-accent text-white border-accent shadow-sm'
                                : 'bg-card border-border-subtle text-text-muted hover:border-text-secondary hover:text-text-secondary'}`}
                        >
                            All Categories
                        </button>
                        {categories.map(cat => {
                            const isSelected = selectedCategory.has(cat);
                            const colorStyle = getCategoryColorStyle(cat);
                            return (
                                <button
                                    key={cat}
                                    onClick={() => {
                                        if (isDraggingRef.current) return;
                                        const newSet = new Set(selectedCategory);
                                        if (isSelected) {
                                            newSet.delete(cat);
                                        } else {
                                            newSet.add(cat);
                                        }
                                        setSelectedCategory(newSet);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold transition-all border whitespace-nowrap min-h-[34px] flex-shrink-0 ${isSelected
                                        ? ''
                                        : 'bg-card border-border-subtle text-text-muted hover:border-text-secondary hover:text-text-secondary'
                                        }`}
                                    style={isSelected ? {
                                        backgroundColor: colorStyle.backgroundColor,
                                        color: colorStyle.color,
                                        borderColor: colorStyle.backgroundColor,
                                        boxShadow: `0 4px 10px ${colorStyle.backgroundColor}22`,
                                    } : undefined}
                                >
                                    {cat}
                                    <span className="opacity-60 font-medium ml-1">({categoryCounts[cat]})</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                </>)}

                {/* Mobile: one tidy line — Categories & Tags · Filters/Sort · Search.
                    The big search bar is gone (desktop-only above); tapping the search
                    icon expands a large field right here, so the grid keeps the space. */}
                {isLibraryView && (
                    mobileSearchOpen ? (
                        <div className="flex sm:hidden items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                <input
                                    type="text"
                                    autoFocus
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setMobileSearchOpen(false); }}
                                    placeholder="Search Machina…"
                                    className="w-full h-10 pl-9 pr-9 bg-card border border-border-subtle rounded-full text-[15px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        aria-label="Clear search"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text hover:bg-fill-strong transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setMobileSearchOpen(false)}
                                className="shrink-0 text-[13px] font-semibold text-accent px-1.5 py-2"
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                    <div className="flex sm:hidden items-center gap-2">
                        {selectedCollections.size === 0 && (
                            <button
                                onClick={() => setIsCategoriesOpen(true)}
                                aria-label="Filter by categories and tags"
                                className={`${ctrlBase} flex-1 min-w-0 justify-between px-3.5 ${(selectedCategory.size + selectedTags.size) > 0
                                    ? 'bg-accent text-white border border-accent shadow-sm'
                                    : ctrlIdle
                                    }`}
                            >
                                <span className="inline-flex items-center gap-2 min-w-0">
                                    <Tags className="w-4 h-4 shrink-0" />
                                    <span className="truncate">
                                        {(selectedCategory.size + selectedTags.size) === 0
                                            ? 'Categories & Tags'
                                            : `${selectedCategory.size + selectedTags.size} selected`}
                                    </span>
                                </span>
                                <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
                            </button>
                        )}
                        {/* When scoped to a collection the category button is hidden — keep
                            the remaining controls pinned to the trailing edge. */}
                        {selectedCollections.size > 0 && <span className="flex-1" />}
                        {/* Filters + sort live in the same sheet, so the button just shows
                            both icons (no label) — keeping it compact so the category
                            selector can take the rest of the row. */}
                        <button
                            onClick={() => setIsFiltersOpen(true)}
                            aria-label="Filters and sort"
                            className={`${ctrlBase} shrink-0 px-3 gap-1.5 ${activeMobileFilters > 0
                                ? 'bg-accent text-white border border-accent shadow-sm'
                                : ctrlIdle
                                }`}
                        >
                            <Filter className="w-4 h-4" />
                            <ArrowUpDown className="w-4 h-4" />
                            {activeMobileFilters > 0 && (
                                <span className="text-xs font-bold tabular-nums">{activeMobileFilters}</span>
                            )}
                        </button>
                        {/* Search — icon only; expands into a large field in place. Reads
                            accent when a query is active so it's clear a search is on. */}
                        <button
                            data-tour="search"
                            onClick={() => setMobileSearchOpen(true)}
                            aria-label="Search"
                            className={`${ctrlBase} shrink-0 w-9 px-0 ${searchQuery
                                ? 'bg-accent text-white border border-accent shadow-sm'
                                : ctrlIdle
                                }`}
                        >
                            <Search className="w-4 h-4" />
                        </button>
                    </div>
                    )
                )}

                {/* Row 2: Toolbar — filter / sort / source on the left, view & actions on the
                    right. Card-browsing layouts only; Ask and Collections hide it. */}
                {isLibraryView && (
                <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 -mx-2 px-2 sm:mx-0 sm:px-0">
                    {/* Grid filters — inline on desktop/tablet; on mobile they move into the
                        Filters sheet. Hidden entirely in Ask mode (no grid to filter). */}
                    <div className="hidden sm:flex items-center gap-2">
                        {isLibraryView && (<>
                        {/* Status Filter — accent-themed dropdown (Reminders is a Show
                            option now, not a separate button). */}
                        <Dropdown
                            ariaLabel="Filter by status"
                            value={filter}
                            onChange={(v) => setFilter(v as FilterType)}
                            leadingIcon={statusTriggerIcon}
                            options={statusOptions}
                        />

                        {/* Sort — accent-themed dropdown */}
                        <Dropdown
                            ariaLabel="Sort order"
                            value={sortBy}
                            onChange={(v) => setSortBy(v as SortType)}
                            leadingIcon={<ArrowUpDown className="w-4 h-4 text-text-secondary" />}
                            options={sortOptions}
                        />

                        {/* Sources — the single grouped source filter (platform → account),
                            opened as one popover. Replaces the old row of redundant
                            round platform icons. */}
                        {sourceFacets.length > 0 && (
                            <div className="relative ps-2 border-s border-border-subtle">
                                <button
                                    onClick={() => setIsSourcesOpen(o => !o)}
                                    aria-haspopup="menu"
                                    aria-expanded={isSourcesOpen}
                                    title="Filter by source"
                                    className={`${ctrlBase} px-3.5 border ${selectedSources.size > 0
                                        ? 'bg-accent text-white border-accent shadow-sm'
                                        : ctrlIdle}`}
                                >
                                    <Globe className="w-4 h-4" />
                                    <span>Sources</span>
                                    {selectedSources.size > 0 && (
                                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white/25 text-white">
                                            {selectedSources.size}
                                        </span>
                                    )}
                                    <ChevronDown className={`w-4 h-4 opacity-60 transition-transform ${isSourcesOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isSourcesOpen && (
                                    <>
                                        {/* Click-away layer */}
                                        <div className="fixed inset-0 z-40" onClick={() => setIsSourcesOpen(false)} />
                                        <div className="absolute z-50 mt-2 end-0 w-72 max-h-[60vh] overflow-y-auto bg-card surface-card rounded-2xl border border-border-subtle shadow-[var(--shadow-card)] p-2 animate-in fade-in slide-in-from-top-1 duration-150">
                                            <div className="flex items-center justify-between px-2 py-1.5">
                                                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                                                    {sourceFacets.length} source{sourceFacets.length === 1 ? '' : 's'}
                                                </span>
                                                {selectedSources.size > 0 && (
                                                    <button
                                                        onClick={() => setSelectedSources(new Set())}
                                                        className="text-[11px] font-semibold text-text-muted hover:text-accent transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                            <SourceFacetList
                                                facets={sourceFacets}
                                                selected={selectedSources}
                                                onToggleKey={handleToggleSource}
                                                onToggleKeys={handleToggleSourceKeys}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        </>)}
                    </div>

                    {/* (Mobile Filters now lives on the category row above, to save a line.) */}

                    {/* On mobile this row reads Collections (left) · Ask (centered) · View
                        (right) via three equal columns; on desktop the `sm:contents`
                        wrappers dissolve back into the normal inline cluster. */}
                    <div className="flex items-center w-full gap-2 sm:w-auto">
                        {/* Left zone — Collections + Connections (the two "browse"
                            surfaces). Connections only appears once there's a real
                            pattern to show, so it never clutters an empty library. */}
                        <div className="flex-1 flex justify-start items-center gap-2 sm:contents">
                            <button
                                data-tour="collections"
                                onClick={() => setViewMode('collections')}
                                title="Browse collections"
                                aria-label="Browse collections"
                                className={`${ctrlBase} px-3.5 ${ctrlIdle}`}
                            >
                                <Layers className="w-4 h-4" />
                                <span className="hidden sm:inline">Collections</span>
                            </button>
                            <button
                                onClick={() => setViewMode('digest')}
                                title="Your curated digests"
                                aria-label="Digest"
                                className={`${ctrlBase} px-3.5 ${ctrlIdle}`}
                            >
                                <Newspaper className="w-4 h-4" />
                                <span className="hidden sm:inline">Digest</span>
                                {digests.length > 0 && (
                                    <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-accent/15 text-accent">
                                        {digests.length}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Center zone — Ask (a distinct AI mode). */}
                        <div className="flex-1 flex justify-center sm:contents">
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
                        </div>

                        {/* Right zone — view switcher (icon-only on mobile) + desktop-only tools. */}
                        <div className="flex-1 flex justify-end items-center gap-2 sm:contents">
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

                        {/* Select multiple — an icon chip living right beside the view
                            switcher (visible on mobile too). Hidden while already in
                            selection mode (the accent toolbar below takes its place). */}
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
                                onClick={() => setFilter('all')}
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
                                    title={col.isPublic ? 'Re-share (updates the public snapshot)' : 'Share this collection'}
                                    className={`${ctrlBase} px-2.5 h-7 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                                >
                                    {col.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                                    <span>Share</span>
                                </button>
                                {col.isPublic && (
                                    <button
                                        onClick={() => handleUnpublishCollection(col)}
                                        title="Stop sharing this collection"
                                        className={`${ctrlBase} px-2.5 h-7 ${ctrlIdle} hover:text-red-400 hover:border-red-400/40`}
                                    >
                                        <span>Stop sharing</span>
                                    </button>
                                )}
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
                    setFilter={setFilter}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    statusTriggerIcon={statusTriggerIcon}
                    statusOptions={statusOptions}
                    sortOptions={sortOptions}
                    sourceFacets={sourceFacets}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onToggleSource={handleToggleSource}
                    onToggleSourceKeys={handleToggleSourceKeys}
                    activeMobileFilters={activeMobileFilters}
                    setSelectedTags={setSelectedTags}
                />

                {/* Categories & Tags Sheet (Mobile) — categories and the full tag
                    tree live together here, one tap from the home toolbar, so tags
                    aren't buried inside the Filters sheet. */}
                <MobileCategoriesTagsSheet
                    isOpen={isCategoriesOpen}
                    onClose={() => setIsCategoriesOpen(false)}
                    categories={categories}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    categoryCounts={categoryCounts}
                    allTags={allTags}
                    tagCounts={tagCounts}
                    selectedTags={selectedTags}
                    setSelectedTags={setSelectedTags}
                    onToggleTag={handleToggleTag}
                />

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
                    {(viewMode === 'grid' || viewMode === 'list') && debouncedQuery.trim() && matchingSources.length > 0 && (
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
                                                setMobileSearchOpen(false);
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
                    {viewMode === 'digest' ? (
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
                                links={links}
                                onOpen={openCollection}
                                onEdit={openEditCollectionForm}
                                onShare={handleShareCollection}
                                onDelete={(col) => setConfirmDeleteCollection(col)}
                                onManageCards={(col) => setManageCardsCollection(col)}
                            />
                        </div>
                    ) : viewMode === 'ask' ? (
                        <AskBrain
                            uid={uid}
                            totalLinks={links.length}
                            onOpenLink={(id) => setActiveLinkId(id)}
                            onExit={() => setViewMode(lastLayout.current)}
                            categories={[...categories].sort((a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0))}
                        />
                    ) : filteredLinks.length === 0 && pendingCards.length === 0 ? (
                        <div className="text-center py-16 animate-fade-in">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-accent/20">
                                {filter === 'favorite' ? (
                                    <Star className="w-8 h-8 text-white" />
                                ) : filter === 'archived' ? (
                                    <Archive className="w-8 h-8 text-white" />
                                ) : filter === 'reminders' ? (
                                    <Bell className="w-8 h-8 text-white" />
                                ) : (
                                    <Inbox className="w-8 h-8 text-white" />
                                )}
                            </div>
                            <h3 className="text-lg font-medium text-text mb-2">
                                {searchQuery ? 'No results found' :
                                    filter === 'favorite' ? 'No favorites yet' :
                                        filter === 'archived' ? 'No archived links' :
                                            filter === 'unread' ? 'No unread links' :
                                                filter === 'read' ? 'No read links yet' :
                                                    selectedCategory.size > 0 ? `No links in ${Array.from(selectedCategory).join(', ')}` :
                                                        selectedTags.size > 0 ? 'No links match selected tags' :
                                                            'Your Machina is empty'}
                            </h3>
                            {debouncedQuery && isSearching && (
                                <div className="flex items-center justify-center gap-2 text-accent mt-2">
                                    <div className="w-4 h-4 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                                    <span className="text-sm font-medium">Searching meanings...</span>
                                </div>
                            )}
                            <p className="text-text-secondary text-sm">
                                {searchQuery ? (isSearching ? 'Thinking...' : 'Try a different search term') :
                                    filter === 'favorite' ? 'Star links to add them to your favorites' :
                                        filter === 'archived' ? 'Archive links to see them here' :
                                            filter === 'unread' ? 'All caught up! No unread links' :
                                                filter === 'read' ? 'Items you mark as read will appear here' :
                                                    selectedCategory.size > 0 ? 'Try selecting a different category' :
                                                        selectedTags.size > 0 ? 'Try clearing some tag filters' :
                                                            'Add your first link using the + button below'}
                            </p>
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
                            {(selectedTags.size > 0 || selectedSources.size > 0 || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setSelectedTags(new Set());
                                        setSelectedSources(new Set());
                                        setSearchQuery('');
                                    }}
                                    className="mt-4 px-4 py-2 bg-accent text-white rounded-xl text-sm font-bold hover:bg-accent-hover transition-all"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
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
                        />
                    ) : viewMode === 'list' ? (
                        <div className="flex flex-col gap-2 max-w-3xl mx-auto">
                            {feedModules}
                            {pendingCards.map(renderPendingCard)}
                            {filteredLinks.map((link, idx) => (
                                <ListCard
                                    key={link.id}
                                    index={idx}
                                    link={link}
                                    onOpenDetails={openLinkDetails}
                                    onStatusChange={handleStatusChange}
                                    onDelete={handleDelete}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedIds.has(link.id)}
                                    onToggleSelection={toggleSelection}
                                />
                            ))}
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
                                    cardCollections={cardCollectionsByLink.get(link.id)}
                                    activeCollectionId={activeCollectionId}
                                    onRemoveFromCollection={handleRemoveFromCollection}
                                />
                            ))}
                        </Masonry>
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
                <div className="sm:hidden fixed inset-x-0 top-0 bottom-0 z-50 bg-background flex flex-col animate-fade-in">
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
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                        <CollectionsGallery
                            collections={collections}
                            links={links}
                            onOpen={openCollection}
                            onEdit={openEditCollectionForm}
                            onShare={handleShareCollection}
                            onDelete={(col) => setConfirmDeleteCollection(col)}
                            onManageCards={(col) => setManageCardsCollection(col)}
                        />
                    </div>
                </div>
            )}

            {/* Digest — mobile full-screen overlay (mirrors Collections). */}
            {viewMode === 'digest' && (
                <div className="sm:hidden fixed inset-x-0 top-0 bottom-0 z-50 bg-background flex flex-col animate-fade-in">
                    <MobileSubheader
                        onBack={() => setViewMode(lastLayout.current)}
                        backLabel="Back to your library"
                        icon={<Newspaper className="w-5 h-5" />}
                        title="Digest"
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                        {digestContent}
                    </div>
                </div>
            )}

            {/* Active Link Modal */}
            {activeLink && (
                <LinkDetailModal
                    link={activeLink}
                    allLinks={links}
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
                    isOpen={!!addToCollectionLink}
                    onClose={() => setAddToCollectionLink(null)}
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
                    links={links}
                    isOpen={!!manageCardsCollection}
                    onClose={() => setManageCardsCollection(null)}
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

export default function Feed({ onAskModeChange, onHideAddButton, onProcessingChange, onOpenDigestSettings, onHasCardsChange }: { onAskModeChange?: (isAsk: boolean) => void; onHideAddButton?: (hide: boolean) => void; onProcessingChange?: (state: import('@/components/AnalyzingBanner').AnalyzingState | null) => void; onOpenDigestSettings?: () => void; onHasCardsChange?: (hasCards: boolean) => void }) {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-text/20 border-t-text rounded-full animate-spin" />
            </div>
        }>
            <FeedContent onAskModeChange={onAskModeChange} onHideAddButton={onHideAddButton} onProcessingChange={onProcessingChange} onOpenDigestSettings={onOpenDigestSettings} onHasCardsChange={onHasCardsChange} />
        </Suspense>
    );
}
