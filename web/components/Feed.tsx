'use client';
// Refreshed colors, layout, and synchronized typography



import { useState, useEffect, useRef } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { updateLinkStatus, deleteLink, updateLinkTags, updateLinkReminder, updateLinkCategory, updateLinkReadStatus } from '@/lib/storage';
import { collection, query, orderBy, onSnapshot, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { httpsCallable } from 'firebase/functions';
import Card from './Card';
import CompactCard from './CompactCard';
import ReminderModal from './ReminderModal';
import TableView from './TableView';
import InsightsFeed from './InsightsFeed';
import LinkDetailModal from './LinkDetailModal';
import { Search, Inbox, Archive, Star, X, LayoutGrid, List, Sparkles, Trash2, ArrowUpDown, Tag as TagIcon, Filter, Bell, Grid2X2, CheckCircle2 } from 'lucide-react';
import TagExplorer from './TagExplorer';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

type FilterType = 'all' | 'unread' | 'read' | 'archived' | 'favorite' | 'reminders';
type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

/**
 * Main feed component displaying saved links
 * Features:
 * - Real-time updates (via localStorage polling - TODO: Replace with Firestore onSnapshot)
 * - Search functionality
 * - Filter by status
 * - Infinite scroll / load more
 * - Deep linking to specific links via URL params
 */
function FeedContent() {
    const searchParams = useSearchParams();
    const { uid } = useAuth();
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
    const [viewMode, setViewMode] = useState<'grid' | 'table' | 'insights' | 'compact'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [sortBy, setSortBy] = useState<SortType>('date-desc');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [isTagExplorerOpen, setIsTagExplorerOpen] = useState(false);
    const [isTagExplorerCollapsed, setIsTagExplorerCollapsed] = useState(false);
    const [reminderModalLink, setReminderModalLink] = useState<Link | null>(null);

    // Semantic Search State
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Link[]>([]);
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
            return;
        }

        const performSearch = async () => {
            setIsSearching(true);
            try {
                const searchFn = httpsCallable(functions, 'search_links');
                const result = await searchFn({
                    query: debouncedQuery,
                    limit: 20
                    // We can pass uid here if needed for dev, but auth context should handle it
                });
                const data = result.data as { links: Link[] };
                setSearchResults(data.links || []);
            } catch (err) {
                console.error("Search failed:", err);
                // Fallback to local filtering if server search fails? 
                // For now, just show empty or previous results
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

        console.log("Starting real-time sync for user:", uid);
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
            setIsLoading(false);
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

    // Filter and sort links
    const linksToDisplay = debouncedQuery.trim() ? searchResults : links;

    const filteredLinks = linksToDisplay
        .filter((link) => {
            if (debouncedQuery.trim()) return true; // Skip keyword filtering if using semantic search
            if (filter === 'all') return true;
            if (filter === 'reminders') return link.reminderStatus === 'pending';
            if (filter === 'unread') return !link.isRead;
            if (filter === 'read') return !!link.isRead;
            return link.status === filter;
        })
        .filter((link) => {
            if (selectedCategory.size === 0) return true;
            return selectedCategory.has(link.category);
        })
        .filter((link) => {
            if (selectedTags.size === 0) return true;
            // Hierarchical matching: if any link tag matches or is a child of any selected tag
            return link.tags.some(tag => {
                return Array.from(selectedTags).some(selected => {
                    return tag === selected || tag.startsWith(`${selected}/`);
                });
            });
        })
        .filter((link) => {
            if (debouncedQuery.trim()) return true; // Skip local keyword search if doing semantic
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return (
                link.title.toLowerCase().includes(query) ||
                link.summary.toLowerCase().includes(query) ||
                link.tags.some((tag) => tag.toLowerCase().includes(query)) ||
                link.category.toLowerCase().includes(query)
            );
        })
        .sort((a, b) => {
            if (filter === 'reminders') {
                // specific sort for reminders: soonest first
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

    const reminderCount = links.filter(l => l.reminderStatus === 'pending').length;



    const handleStatusChange = async (id: string, status: LinkStatus) => {
        if (!uid) return;
        await updateLinkStatus(uid, id, status);
    };

    const handleReadStatusChange = async (id: string, isRead: boolean) => {
        if (!uid) return;
        await updateLinkReadStatus(uid, id, isRead);
    };

    const handleUpdateTags = async (id: string, tags: string[]) => {
        if (!uid) return;
        await updateLinkTags(uid, id, tags);
    };

    const handleUpdateCategory = async (id: string, category: string) => {
        if (!uid) return;
        await updateLinkCategory(uid, id, category);
    };

    const handleDelete = async (id: string) => {
        if (!uid) return;
        if (window.confirm('Delete this link?')) {
            await deleteLink(uid, id);
        }
    };

    const handleBulkArchive = async () => {
        if (!uid) return;
        await Promise.all(Array.from(selectedIds).map(id => updateLinkStatus(uid, id, 'archived')));
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    };

    const handleBulkDelete = async () => {
        if (!uid) return;
        if (window.confirm(`Delete ${selectedIds.size} links forever?`)) {
            await Promise.all(Array.from(selectedIds).map(id => deleteLink(uid, id)));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
        }
    };

    const handleOpenReminderModal = (link: Link) => {
        setReminderModalLink(link);
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header Section (Not Sticky) */}
            <div className="pb-3 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 transition-all duration-300">
                {/* Search Bar */}
                <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search your brain..."
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

                {/* Row 1: Category Navigator (Primary) - DRASTICALLY BIGGER */}
                <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0 mb-2 group/category-nav">
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

                {/* Row 2: Combined Controls - Status, Sort, View, Select (DRASTICALLY SUBTLE) */}
                <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-1 -mx-2 px-2 sm:mx-0 sm:px-0 py-0 mt-0">
                    <div className="flex items-center gap-1">
                        {/* Status Filter Dropdown */}
                        <div className="relative group">
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as FilterType)}
                                className="appearance-none bg-card/30 border border-transparent rounded-full pl-8 pr-3 py-0.5 text-[10px] font-medium text-text-muted/60 hover:bg-card-hover transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/10 min-h-[28px]"
                            >
                                {filterButtons.filter(btn => btn.key !== 'reminders').map(btn => (
                                    <option key={btn.key} value={btn.key}>{btn.label}</option>
                                ))}
                            </select>
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                {filter === 'all' && <Inbox className="w-3 h-3 text-text-muted" />}
                                {filter === 'unread' && <Inbox className="w-3 h-3 text-accent" />}
                                {filter === 'read' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                {filter === 'favorite' && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                                {filter === 'archived' && <Archive className="w-3 h-3 text-text-muted" />}
                            </div>
                        </div>

                        {/* Reminders Toggle */}
                        <button
                            onClick={() => setFilter(filter === 'reminders' ? 'all' : 'reminders')}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all min-h-[28px] ${filter === 'reminders'
                                ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                : 'bg-card/30 text-text-muted/60 hover:text-blue-500 border border-transparent'
                                }`}
                        >
                            <Bell className={`w-3 h-3 ${filter === 'reminders' ? 'fill-current' : ''}`} />
                            <span>Reminders</span>
                            {reminderCount > 0 && (
                                <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${filter === 'reminders' ? 'bg-blue-500 text-white' : 'bg-blue-500/10 text-blue-500'
                                    }`}>
                                    {reminderCount}
                                </span>
                            )}
                        </button>

                        {/* Sort Dropdown */}
                        <div className="relative">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortType)}
                                className="appearance-none bg-card/30 border border-transparent rounded-full pl-2 pr-6 py-0.5 text-[10px] font-medium text-text-muted/60 hover:bg-card-hover transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/10 min-h-[28px]"
                            >
                                <option value="date-desc">Newest</option>
                                <option value="date-asc">Oldest</option>
                                <option value="title-asc">A-Z</option>
                                <option value="category">Category</option>
                            </select>
                            <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-text-muted pointer-events-none opacity-40" />
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {/* View Mode Switcher */}
                        <div className="flex items-center bg-card/30 rounded-full p-0.5 border border-transparent shadow-sm">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-full transition-all min-h-[26px] min-w-[26px] flex items-center justify-center ${viewMode === 'grid' ? 'bg-accent/80 text-white shadow-sm' : 'text-text-muted/40 hover:text-text-secondary'}`}
                                title="Grid View"
                            >
                                <LayoutGrid className="w-3 h-3" />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-full transition-all min-h-[26px] min-w-[26px] flex items-center justify-center ${viewMode === 'table' ? 'bg-accent/80 text-white shadow-sm' : 'text-text-muted/40 hover:text-text-secondary'}`}
                                title="Table View"
                            >
                                <List className="w-3 h-3" />
                            </button>
                            <button
                                onClick={() => setViewMode('compact')}
                                className={`p-1.5 rounded-full transition-all min-h-[26px] min-w-[26px] flex items-center justify-center ${viewMode === 'compact' ? 'bg-accent/80 text-white shadow-sm' : 'text-text-muted/40 hover:text-text-secondary'}`}
                                title="Compact View"
                            >
                                <Grid2X2 className="w-3 h-3" />
                            </button>
                            <button
                                onClick={() => setViewMode('insights')}
                                className={`p-1.5 rounded-full transition-all min-h-[26px] min-w-[26px] flex items-center justify-center ${viewMode === 'insights' ? 'bg-accent/80 text-white shadow-sm' : 'text-text-muted/40 hover:text-text-secondary'}`}
                                title="Insights View"
                            >
                                <Sparkles className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Tag Explorer Toggle (Mobile) */}
                        <button
                            onClick={() => setIsTagExplorerOpen(!isTagExplorerOpen)}
                            className={`lg:hidden h-[28px] px-2 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 border ${selectedTags.size > 0
                                ? 'bg-accent/10 border-accent/20 text-accent'
                                : 'bg-card/30 border-transparent text-text-muted/40'
                                }`}
                        >
                            <TagIcon className="w-3 h-3" />
                            <span>Tags {selectedTags.size > 0 && `(${selectedTags.size})`}</span>
                        </button>

                        {/* Selection Control */}
                        <div className="flex items-center">
                            {isSelectionMode ? (
                                <div className="flex items-center gap-1 animate-slide-up bg-accent/5 px-1 py-0.5 rounded-full border border-accent/10 min-h-[28px]">
                                    <span className="text-[9px] font-bold text-accent px-1">{selectedIds.size}</span>
                                    <button
                                        onClick={handleBulkArchive}
                                        disabled={selectedIds.size === 0}
                                        className="p-1 rounded-full bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all disabled:opacity-30"
                                    >
                                        <Archive className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(false);
                                            setSelectedIds(new Set());
                                        }}
                                        className="p-1 rounded-full text-text-muted hover:text-text transition-all"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsSelectionMode(true)}
                                    className="h-[28px] w-[28px] rounded-full text-text-muted/40 hover:text-accent transition-all flex items-center justify-center bg-card/30 border border-transparent"
                                >
                                    <LayoutGrid className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Tag Filters (Visible when sidebar is collapsed or on mobile) */}
            {selectedTags.size > 0 && (
                <div className={`flex flex-wrap items-center gap-2 -mx-2 px-2 sm:mx-0 sm:px-0 mb-1 animate-in fade-in slide-in-from-top-1 duration-300 ${!isTagExplorerCollapsed ? 'lg:hidden' : ''
                    }`}>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/5 border border-accent/10">
                        <TagIcon className="w-3 h-3 text-accent" />
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Filtered By:</span>
                    </div>
                    {Array.from(selectedTags).map(tag => (
                        <button
                            key={tag}
                            onClick={() => handleToggleTag(tag)}
                            className="group flex items-center gap-1.5 px-2 py-1 rounded-full bg-card border border-border-subtle hover:border-accent/30 text-text-muted hover:text-accent transition-all text-xs font-semibold shadow-sm"
                        >
                            <span>{tag.split('/').pop()}</span>
                            <X className="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors" />
                        </button>
                    ))}
                    <button
                        onClick={() => setSelectedTags(new Set())}
                        className="text-[10px] font-bold text-text-muted/60 hover:text-accent hover:underline px-2 transition-colors uppercase tracking-tight"
                    >
                        Clear All
                    </button>
                </div>
            )}

            {/* Main Content with Tag Sidebar */}
            <div className="flex flex-col lg:flex-row gap-6 relative">
                {/* Tag Explorer Sidebar (Desktop) */}
                <aside
                    className={`hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out ${isTagExplorerCollapsed ? 'w-10' : 'w-64'
                        }`}
                >
                    <div className={`sticky top-[72px] h-[calc(100vh-88px)] flex flex-col ${isTagExplorerCollapsed ? '' : 'min-w-[256px]'}`}>
                        {isTagExplorerCollapsed ? (
                            <button
                                onClick={toggleTagExplorer}
                                className="w-10 h-10 rounded-xl bg-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-accent hover:border-accent/30 transition-all shadow-sm"
                                title="Expand Tags Explorer"
                            >
                                <TagIcon className="w-5 h-5 transition-transform hover:scale-110" />
                            </button>
                        ) : (
                            <div className="overflow-hidden">
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

                {/* Links Grid/Table */}
                <div className="flex-grow min-w-0">
                    {filteredLinks.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-card flex items-center justify-center">
                                {filter === 'favorite' ? (
                                    <Star className="w-8 h-8 text-text-muted" />
                                ) : filter === 'archived' ? (
                                    <Archive className="w-8 h-8 text-text-muted" />
                                ) : filter === 'reminders' ? (
                                    <Bell className="w-8 h-8 text-text-muted" />
                                ) : (
                                    <Inbox className="w-8 h-8 text-text-muted" />
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
                                                            'Your Second Brain is empty'}
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
                            {(selectedTags.size > 0 || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setSelectedTags(new Set());
                                        setSearchQuery('');
                                    }}
                                    className="mt-4 px-4 py-2 bg-accent text-white rounded-xl text-sm font-bold hover:bg-accent-hover transition-all"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'table' ? (
                        <TableView
                            links={filteredLinks}
                            onOpenDetails={(link) => setActiveLinkId(link.id)}
                            onStatusChange={handleStatusChange}
                            onReadStatusChange={handleReadStatusChange}
                            onUpdateTags={handleUpdateTags}
                            onUpdateCategory={handleUpdateCategory}
                            allCategories={categories}
                            onDelete={handleDelete}
                            onUpdateReminder={(link) => handleOpenReminderModal(link)}
                            isSelectionMode={isSelectionMode}
                            selectedIds={selectedIds}
                            onToggleSelection={toggleSelection}
                        />
                    ) : viewMode === 'insights' ? (
                        <InsightsFeed
                            links={filteredLinks}
                            onOpenDetails={(link) => setActiveLinkId(link.id)}
                            onUpdateCategory={handleUpdateCategory}
                            onReadStatusChange={handleReadStatusChange}
                            isSelectionMode={isSelectionMode}
                            selectedIds={selectedIds}
                            allCategories={categories}
                            onToggleSelection={toggleSelection}
                        />
                    ) : viewMode === 'grid' ? (
                        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                            {filteredLinks.map((link) => (
                                <Card
                                    key={link.id}
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
                    ) : (
                        <div
                            className="grid gap-2 sm:gap-3"
                            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
                        >
                            {filteredLinks.map((link) => (
                                <CompactCard
                                    key={link.id}
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
                />
            )}

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
        </div>
    );
}

export default function Feed() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        }>
            <FeedContent />
        </Suspense>
    );
}
