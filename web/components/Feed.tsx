'use client';
// Refreshed colors, layout, and synchronized typography



import { useState, useEffect, useRef } from 'react';
import { Link, LinkStatus, Collection } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { getPlatform, PLATFORM_LABELS, platformIcon, platformActiveStyle, type PlatformKey } from '@/lib/platform';
import Dropdown from './Dropdown';
import { updateLinkStatus, deleteLink, updateLinkTags, updateLinkReminder, updateLinkCategory, updateLinkReadStatus } from '@/lib/storage';
import { collection, query, orderBy, onSnapshot, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { httpsCallable } from 'firebase/functions';
import Card from './Card';
import CompactCard from './CompactCard';
import Masonry from './Masonry';
import ReminderModal from './ReminderModal';
import SwipeDeck from './SwipeDeck';
import AskBrain from './AskBrain';
import LinkDetailModal from './LinkDetailModal';
import ConfirmDialog from './ConfirmDialog';
import AddToCollectionSheet from './AddToCollectionSheet';
import CollectionsGallery from './CollectionsGallery';
import CollectionFormModal from './CollectionFormModal';
import ManageCollectionCardsSheet from './ManageCollectionCardsSheet';
import { Search, Inbox, Archive, Star, X, LayoutGrid, MessageCircleQuestion, Trash2, ArrowUpDown, Tag as TagIcon, Filter, Bell, Grid2X2, CheckCircle2, CheckSquare, Layers, Image as ImageIcon, ChevronDown, ChevronLeft, Share2, Globe, Plus } from 'lucide-react';
import { publishCard, publishCollection, unpublishCollection, deleteCollection, removeLinkFromCollection } from '@/lib/collections';
import { shareLink, shareUrlFor } from '@/lib/share';
import TagExplorer from './TagExplorer';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

type FilterType = 'all' | 'unread' | 'read' | 'archived' | 'favorite' | 'reminders';
type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

/**
 * Main feed component displaying saved links
 * Features:
 * - Real-time updates via Firestore onSnapshot
 * - Keyword + semantic search
 * - Filter by status, category, and tags
 * - Multiple view modes (grid / compact / table / insights)
 * - Deep linking to specific links via URL params
 */
function FeedContent({ onAskModeChange, onHideAddButton }: { onAskModeChange?: (isAsk: boolean) => void; onHideAddButton?: (hide: boolean) => void }) {
    const searchParams = useSearchParams();
    const { uid } = useAuth();
    const toast = useToast();
    const [links, setLinks] = useState<Link[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedCategory, setSelectedCategory] = useState<Set<string>>(new Set());
    const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const activeLink = links.find(l => l.id === activeLinkId) || null;
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'review' | 'ask' | 'collections'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [sortBy, setSortBy] = useState<SortType>('date-desc');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformKey>>(new Set());
    const [screenshotOnly, setScreenshotOnly] = useState(false);
    const [isTagExplorerOpen, setIsTagExplorerOpen] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
    const [isTagExplorerCollapsed, setIsTagExplorerCollapsed] = useState(false);
    const [reminderModalLink, setReminderModalLink] = useState<Link | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

    // Collections
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
    const [addToCollectionLink, setAddToCollectionLink] = useState<Link | null>(null);
    const [collectionFormOpen, setCollectionFormOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<Collection | null>(null);
    const [manageCardsCollection, setManageCardsCollection] = useState<Collection | null>(null);

    // Semantic Search State
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Link[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Semantic Search Effect
    useEffect(() => {
        if (!debouncedQuery.trim()) {
            setIsSearching(false);
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        const performSearch = async () => {
            setIsSearching(true);
            setSearchError(null);
            try {
                const searchFn = httpsCallable(functions, 'search_links');
                const result = await searchFn({
                    query: debouncedQuery,
                    limit: 20
                    // We can pass uid here if needed for dev, but auth context should handle it
                });
                const data = result.data as { links: Link[] };
                setSearchResults(data.links || []);
            } catch (err: any) {
                console.error("Search failed:", err);
                // Extract error message from the Firebase callable error
                let errorMessage = 'Search failed. Please try again.';
                if (err?.message) {
                    if (err.message.includes('SEMANTIC_SEARCH_NOT_CONFIGURED')) {
                        errorMessage = 'Semantic search is not configured. Please set GEMINI_API_KEY in Firebase Functions.';
                    } else if (err.message.includes('SEMANTIC_SEARCH_ERROR')) {
                        errorMessage = 'Failed to generate search embeddings. Check your API key.';
                    } else if (err.message.includes('VECTOR_SEARCH_ERROR')) {
                        errorMessage = 'Vector search failed. Please ensure Firestore vector index is deployed.';
                    } else if (err.message.includes('GEMINI_API_KEY')) {
                        errorMessage = 'API key not configured for semantic search.';
                    } else {
                        errorMessage = err.message;
                    }
                }
                setSearchError(errorMessage);
                // Fall back to local filtering only - semantic search errors shouldn't break the app
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        performSearch();
    }, [debouncedQuery]);

    // Load collapsed state from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('tag-explorer-collapsed');
        if (saved !== null) {
            setIsTagExplorerCollapsed(saved === 'true');
        }
    }, []);

    // Save collapsed state to localStorage
    const toggleTagExplorer = () => {
        const newState = !isTagExplorerCollapsed;
        setIsTagExplorerCollapsed(newState);
        localStorage.setItem('tag-explorer-collapsed', String(newState));
    };

    // uid comes from AuthProvider — no mock lookup needed

    // 2. Real-time sync from Firestore
    useEffect(() => {
        if (!uid) return;

        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedLinks = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
                id: doc.id,
                ...doc.data()
            } as Link));
            setLinks(fetchedLinks);
            setIsLoading(false);
        }, (error: Error) => {
            console.error("Firestore sync error:", error);
            toast.error("Lost connection to your library. Reconnecting…");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [uid, toast]);

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

    // Helper to get consistent number for timestamps (handles number, string, or Firestore Timestamp)
    const getTimestampNumber = (val: any): number => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return new Date(val).getTime();
        if (val.toMillis && typeof val.toMillis === 'function') return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        return 0;
    };

    // 3. Handle deep linking
    useEffect(() => {
        const linkId = searchParams.get('linkId');
        if (linkId && links.length > 0) {
            const link = links.find(l => l.id === linkId);
            if (link) {
                setActiveLinkId(link.id);
                // Clear the param after opening to avoid re-opening on re-renders
                // but keep it if the user wants to share the URL. 
                // For now, just opening it is enough.
            }
        }
    }, [searchParams, links]);

    // 4. Hybrid Search Logic
    const filteredLinks = links
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

    // Calculate category counts
    const categoryCounts = links.reduce((acc, link) => {
        acc[link.category] = (acc[link.category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const categories = Array.from(new Set(links.map(l => l.category))).sort();

    // Calculate tag counts for all links (not just filtered)
    const tagCounts = links.reduce((acc, link) => {
        link.tags.forEach(tag => {
            acc[tag] = (acc[tag] || 0) + 1;
        });
        return acc;
    }, {} as Record<string, number>);

    const allTags = Array.from(new Set(links.flatMap(l => l.tags))).sort();

    const handleToggleTag = (tag: string) => {
        const next = new Set(selectedTags);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        setSelectedTags(next);
    };

    // Source/platform filter: only surface platforms actually present in the library.
    const platformCounts = links.reduce((acc, link) => {
        const p = getPlatform(link.url);
        if (p) acc[p] = (acc[p] || 0) + 1;
        return acc;
    }, {} as Record<PlatformKey, number>);
    const availablePlatforms = (Object.keys(PLATFORM_LABELS) as PlatformKey[]).filter(p => platformCounts[p]);
    const screenshotCount = links.filter(l => l.sourceType === 'image').length;

    const handleTogglePlatform = (p: PlatformKey) => {
        const next = new Set(selectedPlatforms);
        if (next.has(p)) next.delete(p);
        else next.add(p);
        setSelectedPlatforms(next);
    };

    const reminderCount = links.filter(l => l.reminderStatus === 'pending').length;



    // Firestore's onSnapshot applies writes optimistically (latency
    // compensation) and reverts them if the write fails, so the UI updates
    // instantly. We just surface failures and confirm meaningful actions.
    const handleStatusChange = async (id: string, status: LinkStatus) => {
        if (!uid) return;
        try {
            await updateLinkStatus(uid, id, status);
            const labels: Record<string, string> = {
                archived: 'Archived',
                favorite: 'Added to favorites',
                unread: 'Marked as unread',
            };
            if (labels[status]) toast.success(labels[status]);
        } catch {
            toast.error("Couldn't update the link. Please try again.");
        }
    };

    const handleReadStatusChange = async (id: string, isRead: boolean) => {
        if (!uid) return;
        try {
            await updateLinkReadStatus(uid, id, isRead);
        } catch {
            toast.error("Couldn't update read status. Please try again.");
        }
    };

    const handleUpdateTags = async (id: string, tags: string[]) => {
        if (!uid) return;
        try {
            await updateLinkTags(uid, id, tags);
        } catch {
            toast.error("Couldn't save tags. Please try again.");
        }
    };

    const handleUpdateCategory = async (id: string, category: string) => {
        if (!uid) return;
        try {
            await updateLinkCategory(uid, id, category);
        } catch {
            toast.error("Couldn't change category. Please try again.");
        }
    };

    // Open the branded confirm dialog instead of a native window.confirm. The
    // card/sheet/table all call this; actual deletion happens on confirm.
    const handleDelete = (id: string) => {
        setConfirmDeleteId(id);
    };

    const performDelete = async (id: string) => {
        if (!uid) return;
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

    const handleOpenReminderModal = (link: Link) => {
        setReminderModalLink(link);
    };

    // ── Collections ──────────────────────────────────────────────────────────
    // Open a collection: scope the feed to it and drop back into the card grid.
    const openCollection = (collectionId: string) => {
        setSelectedCollections(new Set([collectionId]));
        setViewMode('grid');
    };

    const handleRemoveFromCollection = async (link: Link, collectionId: string) => {
        if (!uid) return;
        try {
            await removeLinkFromCollection(uid, link.id, collectionId);
            toast.success('Removed from collection');
        } catch {
            toast.error("Couldn't remove from the collection. Please try again.");
        }
    };

    // Share a single card as a public Machina page.
    const handleShareCard = async (link: Link) => {
        if (!uid) return;
        try {
            const shareId = await publishCard(uid, link);
            const outcome = await shareLink(
                shareUrlFor(`/s?id=${shareId}`),
                link.title,
                'Saved on Machina'
            );
            if (outcome === 'copied') toast.success('Share link copied to clipboard');
            else if (outcome === 'failed') toast.error("Couldn't create a share link. Please try again.");
        } catch {
            toast.error("Couldn't share this card. Please try again.");
        }
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

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

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
        { key: 'compact', label: 'Compact', icon: <Grid2X2 className="w-4 h-4" />, hint: 'Compact grid' },
        { key: 'review', label: 'Review', icon: <Layers className="w-4 h-4" />, hint: 'Swipe to review' },
    ];
    // The layout the Ask/Collections buttons return you to when you leave them.
    const lastLayout = useRef<'grid' | 'compact' | 'review'>('grid');
    if (viewMode === 'grid' || viewMode === 'compact' || viewMode === 'review') lastLayout.current = viewMode;
    // True for the card-browsing layouts (everything except the full-screen
    // Ask chat and the Collections gallery), which share the search/filter chrome.
    const isLibraryView = viewMode === 'grid' || viewMode === 'compact' || viewMode === 'review';
    // When scoped to exactly one collection, cards offer a quick "remove from it".
    const activeCollectionId = selectedCollections.size === 1 ? Array.from(selectedCollections)[0] : undefined;
    // Count of active grid filters — badges the mobile "Filters" button.
    const activeMobileFilters =
        (filter !== 'all' ? 1 : 0) + selectedPlatforms.size + (screenshotOnly ? 1 : 0) + selectedTags.size + selectedCollections.size;

    // Tell the page when we're in Ask mode (drives the full-height chat layout).
    useEffect(() => {
        onAskModeChange?.(viewMode === 'ask');
    }, [viewMode, onAskModeChange]);

    // Hide the add-link FAB in Ask *and* Collections — neither view captures links.
    useEffect(() => {
        onHideAddButton?.(viewMode === 'ask' || viewMode === 'collections');
    }, [viewMode, onHideAddButton]);

    if (isLoading) {
        return (
            <div className="space-y-4" aria-busy="true" aria-label="Loading your links">
                <div className="h-11 rounded-xl bg-card border border-white/5 relative overflow-hidden skeleton-shimmer" />
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="bg-card border border-white/5 rounded-2xl p-5 relative overflow-hidden skeleton-shimmer surface-card shadow-[var(--shadow-card)]"
                        >
                            <div className="h-3 w-20 bg-white/10 rounded-full mb-4" />
                            <div className="h-5 w-3/4 bg-white/10 rounded mb-3" />
                            <div className="space-y-2 mb-5">
                                <div className="h-3 w-full bg-white/5 rounded" />
                                <div className="h-3 w-5/6 bg-white/5 rounded" />
                                <div className="h-3 w-2/3 bg-white/5 rounded" />
                            </div>
                            <div className="flex gap-2">
                                <div className="h-5 w-14 bg-white/5 rounded-full" />
                                <div className="h-5 w-16 bg-white/5 rounded-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={viewMode === 'ask' ? 'space-y-2' : 'space-y-4 lg:space-y-6'}>
            {/* Header Section (Not Sticky) */}
            <div className={`pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 transition-all duration-300 ${viewMode === 'ask' ? 'space-y-2 pb-0' : 'space-y-3 sm:space-y-4 pb-3'}`}>
                {/* Ask mode drops the search bar entirely (typing there just exits Ask)
                    and shows only a Back button, so the chat gets the full height. */}
                {viewMode === 'ask' ? (
                    <div className="flex items-center">
                        <button
                            onClick={() => setViewMode(lastLayout.current)}
                            title="Back to your library"
                            aria-label="Back to your library"
                            className="shrink-0 inline-flex items-center gap-1 ps-2 pe-3 py-2 rounded-xl bg-card border border-border-subtle text-text-secondary text-sm font-medium hover:text-text hover:border-accent/40 transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                    </div>
                ) : viewMode === 'collections' ? (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setViewMode(lastLayout.current)}
                            title="Back to your library"
                            aria-label="Back to your library"
                            className="shrink-0 inline-flex items-center gap-1 ps-2 pe-3 py-2 rounded-xl bg-card border border-border-subtle text-text-secondary text-sm font-medium hover:text-text hover:border-accent/40 transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                        <h2 className="flex items-center gap-2 text-lg font-bold text-text">
                            <Layers className="w-5 h-5 text-accent" />
                            Collections
                        </h2>
                        {/* Explicit add affordance — the only way to create a collection. */}
                        <button
                            onClick={openNewCollectionForm}
                            title="New collection"
                            aria-label="New collection"
                            className="ms-auto shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-accent text-white shadow-sm shadow-accent/20 hover:bg-accent-hover transition-colors cursor-pointer"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <div className="relative">
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
                                className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-all"
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

                {/* Mobile: category selector + Filters share one row (saves a line vs.
                    a full-width category button stacked above the toolbar). */}
                {isLibraryView && (
                    <div className="flex sm:hidden items-center gap-2">
                        {selectedCollections.size === 0 && (
                            <button
                                onClick={() => setIsCategoriesOpen(true)}
                                aria-label="Filter by category"
                                className={`${ctrlBase} flex-1 min-w-0 justify-between px-3.5 ${selectedCategory.size > 0
                                    ? 'bg-accent text-white border border-accent shadow-sm'
                                    : ctrlIdle
                                    }`}
                            >
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                    <LayoutGrid className="w-4 h-4 shrink-0" />
                                    <span className="truncate">
                                        {selectedCategory.size === 0
                                            ? 'All Categories'
                                            : `${selectedCategory.size} ${selectedCategory.size === 1 ? 'category' : 'categories'}`}
                                    </span>
                                </span>
                                <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
                            </button>
                        )}
                        <button
                            onClick={() => setIsFiltersOpen(true)}
                            aria-label="Filters"
                            className={`${ctrlBase} shrink-0 px-3.5 ${activeMobileFilters > 0
                                ? 'bg-accent text-white border border-accent shadow-sm'
                                : ctrlIdle
                                }`}
                        >
                            <Filter className="w-4 h-4" />
                            <span>Filters{activeMobileFilters > 0 ? ` (${activeMobileFilters})` : ''}</span>
                        </button>
                    </div>
                )}

                {/* Row 2: Toolbar — filter / sort / source on the left, view & actions on the
                    right. Card-browsing layouts only; Ask and Collections hide it. */}
                {isLibraryView && (
                <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 -mx-2 px-2 sm:mx-0 sm:px-0">
                    {/* Grid filters — inline on desktop/tablet; on mobile they move into the
                        Filters sheet. Hidden entirely in Ask mode (no grid to filter). */}
                    <div className="hidden sm:flex items-center gap-2">
                        {isLibraryView && (<>
                        {/* Status Filter — accent-themed dropdown (no native OS blue) */}
                        <Dropdown
                            ariaLabel="Filter by status"
                            value={filter === 'reminders' ? 'all' : filter}
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

                        {/* Reminders Toggle */}
                        <button
                            onClick={() => setFilter(filter === 'reminders' ? 'all' : 'reminders')}
                            aria-pressed={filter === 'reminders'}
                            title="Show items with reminders"
                            className={`${ctrlBase} px-3.5 ${filter === 'reminders'
                                ? 'bg-blue-500 text-white border border-blue-500 shadow-sm'
                                : ctrlIdle + ' hover:text-blue-500 hover:border-blue-500/40'
                                }`}
                        >
                            <Bell className={`w-4 h-4 ${filter === 'reminders' ? 'fill-current' : ''}`} />
                            <span className="hidden sm:inline">Reminders</span>
                            {reminderCount > 0 && (
                                <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${filter === 'reminders' ? 'bg-white/25 text-white' : 'bg-blue-500/15 text-blue-500'
                                    }`}>
                                    {reminderCount}
                                </span>
                            )}
                        </button>

                        {/* Source filter — toggle icons for platforms + screenshots present in the library */}
                        {(availablePlatforms.length > 0 || screenshotCount > 0) && (
                            <div className="flex items-center gap-1 ps-2 border-s border-border-subtle">
                                {availablePlatforms.map(p => {
                                    const active = selectedPlatforms.has(p);
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => handleTogglePlatform(p)}
                                            title={`${PLATFORM_LABELS[p]} (${platformCounts[p]})`}
                                            aria-label={`Filter by ${PLATFORM_LABELS[p]}`}
                                            aria-pressed={active}
                                            style={active ? platformActiveStyle(p) : undefined}
                                            className={`${ctrlBase} w-9 px-0 border ${active ? 'shadow-sm' : ctrlIdle}`}
                                        >
                                            {platformIcon(p, 'w-4 h-4')}
                                        </button>
                                    );
                                })}
                                {screenshotCount > 0 && (
                                    <button
                                        onClick={() => setScreenshotOnly(v => !v)}
                                        title={`Screenshots (${screenshotCount})`}
                                        aria-label="Filter by screenshots"
                                        aria-pressed={screenshotOnly}
                                        className={`${ctrlBase} w-9 px-0 border ${screenshotOnly ? 'bg-accent text-white border-accent shadow-sm' : ctrlIdle}`}
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                        </>)}
                    </div>

                    {/* (Mobile Filters now lives on the category row above, to save a line.) */}

                    <div className="flex items-center gap-2">
                        {/* Collections — opens the dedicated Collections gallery. */}
                        <button
                            onClick={() => setViewMode('collections')}
                            title="Browse collections"
                            aria-label="Browse collections"
                            className={`${ctrlBase} px-3.5 bg-card border border-border-subtle text-accent hover:bg-card-hover hover:border-accent/40`}
                        >
                            <Layers className="w-4 h-4" />
                            <span className="hidden sm:inline">Collections</span>
                        </button>

                        {/* Ask — a distinct AI mode. Hidden while in Ask mode (the Back
                            button beside the search bar leaves it), so the toolbar row
                            collapses and the chat sits right under the search. */}
                        {isLibraryView && (
                        <button
                            onClick={() => setViewMode('ask')}
                            title="Ask your brain"
                            aria-label="Ask your brain"
                            className={`${ctrlBase} px-3.5 bg-card border border-border-subtle text-accent hover:bg-card-hover hover:border-accent/40`}
                        >
                            <MessageCircleQuestion className="w-4 h-4" />
                            <span>Ask</span>
                        </button>
                        )}

                        {/* View Mode Switcher — layouts only; hidden in Ask mode (tap the
                            highlighted Ask button to exit back to your last layout). */}
                        {isLibraryView && (
                        <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-card border border-border-subtle">
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
                                            ? 'bg-accent text-white shadow-sm px-3'
                                            : 'w-7 text-text-muted hover:text-text hover:bg-card-hover'
                                            }`}
                                    >
                                        {vm.icon}
                                        {active && <span>{vm.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
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

                        {/* Selection Control */}
                        {isSelectionMode ? (
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
                        ) : (
                            <div className="hidden sm:block">
                            <button
                                onClick={() => setIsSelectionMode(true)}
                                title="Select multiple"
                                aria-label="Select multiple"
                                className={`${ctrlBase} w-9 px-0 ${ctrlIdle} hover:text-accent hover:border-accent/40`}
                            >
                                <CheckSquare className="w-4 h-4" />
                            </button>
                            </div>
                        )}
                        </>)}
                    </div>
                </div>
                )}
            </div>

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
                {isFiltersOpen && (
                    <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end isolate">
                        <div
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                            onClick={() => setIsFiltersOpen(false)}
                        />
                        <div className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-base font-bold text-text">Filters</h3>
                                <button
                                    onClick={() => setIsFiltersOpen(false)}
                                    aria-label="Close filters"
                                    className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-5">
                                {/* Status + Sort */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Show</label>
                                        <Dropdown
                                            ariaLabel="Filter by status"
                                            value={filter === 'reminders' ? 'all' : filter}
                                            onChange={(v) => setFilter(v as FilterType)}
                                            leadingIcon={statusTriggerIcon}
                                            options={statusOptions}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Sort</label>
                                        <Dropdown
                                            ariaLabel="Sort order"
                                            value={sortBy}
                                            onChange={(v) => setSortBy(v as SortType)}
                                            leadingIcon={<ArrowUpDown className="w-4 h-4 text-text-secondary" />}
                                            options={sortOptions}
                                        />
                                    </div>
                                </div>

                                {/* Reminders */}
                                <button
                                    onClick={() => setFilter(filter === 'reminders' ? 'all' : 'reminders')}
                                    aria-pressed={filter === 'reminders'}
                                    className={`${ctrlBase} w-full justify-start px-3.5 ${filter === 'reminders'
                                        ? 'bg-blue-500 text-white border border-blue-500 shadow-sm'
                                        : ctrlIdle
                                        }`}
                                >
                                    <Bell className={`w-4 h-4 ${filter === 'reminders' ? 'fill-current' : ''}`} />
                                    <span>Reminders{reminderCount > 0 ? ` (${reminderCount})` : ''}</span>
                                </button>

                                {/* Source */}
                                {(availablePlatforms.length > 0 || screenshotCount > 0) && (
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Source</label>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {availablePlatforms.map(p => {
                                                const active = selectedPlatforms.has(p);
                                                return (
                                                    <button
                                                        key={p}
                                                        onClick={() => handleTogglePlatform(p)}
                                                        aria-pressed={active}
                                                        title={`${PLATFORM_LABELS[p]} (${platformCounts[p]})`}
                                                        style={active ? platformActiveStyle(p) : undefined}
                                                        className={`${ctrlBase} w-10 px-0 border ${active ? 'shadow-sm' : ctrlIdle}`}
                                                    >
                                                        {platformIcon(p, 'w-4 h-4')}
                                                    </button>
                                                );
                                            })}
                                            {screenshotCount > 0 && (
                                                <button
                                                    onClick={() => setScreenshotOnly(v => !v)}
                                                    aria-pressed={screenshotOnly}
                                                    title={`Screenshots (${screenshotCount})`}
                                                    className={`${ctrlBase} w-10 px-0 border ${screenshotOnly ? 'bg-accent text-white border-accent shadow-sm' : ctrlIdle}`}
                                                >
                                                    <ImageIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Tags + Select multiple */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => { setIsFiltersOpen(false); setIsTagExplorerOpen(true); }}
                                        className={`${ctrlBase} px-3.5 ${selectedTags.size > 0
                                            ? 'bg-accent text-white border border-accent shadow-sm'
                                            : ctrlIdle
                                            }`}
                                    >
                                        <TagIcon className="w-4 h-4" />
                                        <span>Tags{selectedTags.size > 0 ? ` (${selectedTags.size})` : ''}</span>
                                    </button>
                                    <button
                                        onClick={() => { setIsFiltersOpen(false); setIsSelectionMode(true); }}
                                        className={`${ctrlBase} px-3.5 ${ctrlIdle}`}
                                    >
                                        <CheckSquare className="w-4 h-4" />
                                        <span>Select</span>
                                    </button>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center gap-3 pt-1">
                                    {activeMobileFilters > 0 && (
                                        <button
                                            onClick={() => { setFilter('all'); setSelectedPlatforms(new Set()); setScreenshotOnly(false); setSelectedTags(new Set()); }}
                                            className="text-sm font-semibold text-text-muted hover:text-accent transition-colors"
                                        >
                                            Clear all
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsFiltersOpen(false)}
                                        className="ms-auto px-6 h-10 rounded-full bg-accent text-white font-semibold text-sm shadow-sm hover:bg-accent-hover transition-colors"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Categories Sheet (Mobile) — the collapsed category chips. */}
                {isCategoriesOpen && (
                    <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end isolate">
                        <div
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                            onClick={() => setIsCategoriesOpen(false)}
                        />
                        <div className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-bold text-text">Categories</h3>
                                <button
                                    onClick={() => setIsCategoriesOpen(false)}
                                    aria-label="Close categories"
                                    className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedCategory(new Set())}
                                    className={`px-3 py-1.5 rounded-full text-[13px] font-bold border transition-all ${selectedCategory.size === 0
                                        ? 'bg-accent text-white border-accent shadow-sm'
                                        : 'bg-card border-border-subtle text-text-muted'
                                        }`}
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
                                                const next = new Set(selectedCategory);
                                                if (isSelected) next.delete(cat); else next.add(cat);
                                                setSelectedCategory(next);
                                            }}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold border transition-all ${isSelected
                                                ? ''
                                                : 'bg-card border-border-subtle text-text-muted'
                                                }`}
                                            style={isSelected ? {
                                                backgroundColor: colorStyle.backgroundColor,
                                                color: colorStyle.color,
                                                borderColor: colorStyle.backgroundColor,
                                            } : undefined}
                                        >
                                            {cat}
                                            <span className="opacity-60 font-medium">({categoryCounts[cat]})</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-3 pt-5">
                                {selectedCategory.size > 0 && (
                                    <button
                                        onClick={() => setSelectedCategory(new Set())}
                                        className="text-sm font-semibold text-text-muted hover:text-accent transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsCategoriesOpen(false)}
                                    className="ms-auto px-6 h-10 rounded-full bg-accent text-white font-semibold text-sm shadow-sm hover:bg-accent-hover transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tag Explorer Drawer (Mobile) */}
                {isTagExplorerOpen && (
                    <div className="lg:hidden fixed inset-0 z-50 flex justify-end isolate">
                        <div
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                            onClick={() => setIsTagExplorerOpen(false)}
                        />
                        <div className="relative w-full sm:w-80 h-[100dvh] bg-card border-l border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
                            <div className="flex-none p-4 border-b border-white/10 flex justify-between items-center bg-card/50 backdrop-blur-xl z-10 safe-pt">
                                <h2 className="text-base font-bold flex items-center gap-2">
                                    <TagIcon className="w-4 h-4 text-accent" />
                                    Filter Tags
                                </h2>
                                <button
                                    onClick={() => setIsTagExplorerOpen(false)}
                                    className="p-2 hover:bg-white/5 rounded-full touch-manipulation"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 safe-pb">
                                <TagExplorer
                                    tags={allTags}
                                    tagCounts={tagCounts}
                                    selectedTags={selectedTags}
                                    onToggleTag={handleToggleTag}
                                    onClearFilters={() => setSelectedTags(new Set())}
                                    className="p-4"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Links Grid / Ask */}
                <div className="flex-grow min-w-0">
                    {viewMode === 'collections' ? (
                        <CollectionsGallery
                            collections={collections}
                            links={links}
                            onOpen={openCollection}
                            onEdit={openEditCollectionForm}
                            onShare={handleShareCollection}
                            onDelete={(col) => setConfirmDeleteCollection(col)}
                            onManageCards={(col) => setManageCardsCollection(col)}
                        />
                    ) : viewMode === 'ask' ? (
                        <AskBrain
                            uid={uid}
                            totalLinks={links.length}
                            onOpenLink={(id) => setActiveLinkId(id)}
                            onExit={() => setViewMode(lastLayout.current)}
                            categories={[...categories].sort((a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0))}
                        />
                    ) : filteredLinks.length === 0 ? (
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
                            {(selectedTags.size > 0 || selectedPlatforms.size > 0 || screenshotOnly || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setSelectedTags(new Set());
                                        setSelectedPlatforms(new Set());
                                        setScreenshotOnly(false);
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
                            onFavorite={(link) => handleStatusChange(link.id, 'favorite')}
                            onArchive={(link) => handleStatusChange(link.id, 'archived')}
                            onRemind={(link) => handleOpenReminderModal(link)}
                            onOpen={(link) => setActiveLinkId(link.id)}
                            onResetStatus={(link) => handleStatusChange(link.id, 'unread')}
                        />
                    ) : viewMode === 'grid' ? (
                        <Masonry columnWidth={340} gap={16}>
                            {filteredLinks.map((link, idx) => (
                                <Card
                                    key={link.id}
                                    index={idx}
                                    link={link}
                                    onOpenDetails={(link) => setActiveLinkId(link.id)}
                                    onStatusChange={handleStatusChange}
                                    onReadStatusChange={handleReadStatusChange}
                                    onUpdateCategory={handleUpdateCategory}
                                    allCategories={categories}
                                    onDelete={handleDelete}
                                    onUpdateReminder={(link) => handleOpenReminderModal(link)}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedIds.has(link.id)}
                                    onToggleSelection={toggleSelection}
                                    onTagClick={handleToggleTag}
                                    onAddToCollection={(link) => setAddToCollectionLink(link)}
                                    onShare={handleShareCard}
                                    cardCollections={collections
                                        .filter(c => (link.collectionIds ?? []).includes(c.id))
                                        .map(c => ({ id: c.id, name: c.name }))}
                                    activeCollectionId={activeCollectionId}
                                    onRemoveFromCollection={handleRemoveFromCollection}
                                />
                            ))}
                        </Masonry>
                    ) : (
                        <div
                            className="grid gap-2 sm:gap-3"
                            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
                        >
                            {filteredLinks.map((link, idx) => (
                                <CompactCard
                                    key={link.id}
                                    index={idx}
                                    link={link}
                                    onOpenDetails={(link) => setActiveLinkId(link.id)}
                                    onStatusChange={handleStatusChange}
                                    onReadStatusChange={handleReadStatusChange}
                                    onUpdateCategory={handleUpdateCategory}
                                    allCategories={categories}
                                    onDelete={handleDelete}
                                    onUpdateReminder={(link) => handleOpenReminderModal(link)}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedIds.has(link.id)}
                                    onToggleSelection={toggleSelection}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Active Link Modal */}
            {activeLink && (
                <LinkDetailModal
                    link={activeLink}
                    allLinks={links}
                    allCategories={categories}
                    uid={uid}
                    isOpen={!!activeLink}
                    onClose={() => setActiveLinkId(null)}
                    onStatusChange={handleStatusChange}
                    onReadStatusChange={handleReadStatusChange}
                    onUpdateTags={handleUpdateTags}
                    onUpdateCategory={handleUpdateCategory}
                    onUpdateReminder={(link) => handleOpenReminderModal(link)}
                    onDelete={handleDelete}
                    onOpenOtherLink={(link) => setActiveLinkId(link.id)}
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
                    onClose={() => setReminderModalLink(null)}
                    onUpdate={() => setReminderModalLink(null)}
                />
            )}

            {/* Delete confirmation (single) — branded, replaces window.confirm */}
            <ConfirmDialog
                isOpen={confirmDeleteId !== null}
                onClose={() => setConfirmDeleteId(null)}
                onConfirm={() => {
                    if (confirmDeleteId) performDelete(confirmDeleteId);
                }}
                title="Delete this link?"
                message="This permanently removes it from your second brain. This can't be undone."
                confirmLabel="Delete"
                variant="danger"
            />

            {/* Delete confirmation (bulk) */}
            <ConfirmDialog
                isOpen={confirmBulkDelete}
                onClose={() => setConfirmBulkDelete(false)}
                onConfirm={performBulkDelete}
                title={`Delete ${selectedIds.size} link${selectedIds.size === 1 ? '' : 's'}?`}
                message="These will be permanently removed from your second brain. This can't be undone."
                confirmLabel="Delete"
                variant="danger"
            />
        </div>
    );
}

export default function Feed({ onAskModeChange, onHideAddButton }: { onAskModeChange?: (isAsk: boolean) => void; onHideAddButton?: (hide: boolean) => void }) {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        }>
            <FeedContent onAskModeChange={onAskModeChange} onHideAddButton={onHideAddButton} />
        </Suspense>
    );
}
