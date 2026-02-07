'use client';
// Refreshed colors, layout, and synchronized typography



import { useState, useEffect } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { updateLinkStatus, deleteLink, updateLinkTags } from '@/lib/storage';
import { collection, query, orderBy, onSnapshot, where, getDocs, limit, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Card from './Card';
import TableView from './TableView';
import InsightsFeed from './InsightsFeed';
import LinkDetailModal from './LinkDetailModal';
import { Search, Inbox, Archive, Star, X, LayoutGrid, List, Sparkles, Trash2, ArrowUpDown } from 'lucide-react';

type FilterType = 'all' | 'unread' | 'archived' | 'favorite';
type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'category';

/**
 * Main feed component displaying saved links
 * Features:
 * - Real-time updates (via localStorage polling - TODO: Replace with Firestore onSnapshot)
 * - Search functionality
 * - Filter by status
 * - Infinite scroll / load more
 */
export default function Feed() {
    const [links, setLinks] = useState<Link[]>([]);
    const [uid, setUid] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedCategory, setSelectedCategory] = useState<Set<string>>(new Set());
    const [activeLink, setActiveLink] = useState<Link | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'table' | 'insights'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [sortBy, setSortBy] = useState<SortType>('date-desc');

    // 1. Find the user by phone number (mocking auth for now)
    useEffect(() => {
        async function findUser() {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('phone_number', '==', '+16462440305'), limit(1));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                setUid(snapshot.docs[0].id);
            } else {
                console.error("User not found in Firestore. Please add a document to 'users' collection with phone_number: +16462440305");
                setIsLoading(false);
            }
        }
        findUser();
    }, []);

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

    // Filter and sort links
    const filteredLinks = links
        .filter((link) => {
            if (filter === 'all') return true;
            return link.status === filter;
        })
        .filter((link) => {
            if (selectedCategory.size === 0) return true;
            return selectedCategory.has(link.category);
        })
        .filter((link) => {
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

    const handleStatusChange = async (id: string, status: LinkStatus) => {
        if (!uid) return;
        await updateLinkStatus(uid, id, status);
    };

    const handleUpdateTags = async (id: string, tags: string[]) => {
        if (!uid) return;
        await updateLinkTags(uid, id, tags);
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

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const filterButtons: { key: FilterType; label: string; icon: React.ReactNode }[] = [
        { key: 'all', label: 'All', icon: <Inbox className="w-4 h-4" /> },
        { key: 'unread', label: 'Unread', icon: <Inbox className="w-4 h-4" /> },
        { key: 'favorite', label: 'Favorites', icon: <Star className="w-4 h-4" /> },
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
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mb-2">
                    <button
                        onClick={() => setSelectedCategory(new Set())}
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

                {/* Row 2: Combined Controls - Status, Sort, View, Select (DRASTICALLY SUBTLE) */}
                <div className="flex items-center justify-between gap-1 -mx-2 px-2 sm:mx-0 sm:px-0 py-0 mt-0">
                    <div className="flex items-center gap-1">
                        {/* Status Filter Dropdown */}
                        <div className="relative group">
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as FilterType)}
                                className="appearance-none bg-card/30 border border-transparent rounded-full pl-6 pr-6 py-0.5 text-[10px] font-medium text-text-muted/60 hover:bg-card-hover transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/10 min-h-[28px]"
                            >
                                {filterButtons.map(btn => (
                                    <option key={btn.key} value={btn.key}>{btn.label}</option>
                                ))}
                            </select>
                            <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                {filter === 'all' && <Inbox className="w-3 h-3 text-text-muted" />}
                                {filter === 'unread' && <Inbox className="w-3 h-3 text-accent" />}
                                {filter === 'favorite' && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                                {filter === 'archived' && <Archive className="w-3 h-3 text-text-muted" />}
                            </div>
                            <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-text-muted pointer-events-none opacity-40" />
                        </div>

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
                                onClick={() => setViewMode('insights')}
                                className={`p-1.5 rounded-full transition-all min-h-[26px] min-w-[26px] flex items-center justify-center ${viewMode === 'insights' ? 'bg-accent/80 text-white shadow-sm' : 'text-text-muted/40 hover:text-text-secondary'}`}
                                title="Insights View"
                            >
                                <Sparkles className="w-3 h-3" />
                            </button>
                        </div>

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



            {/* Links Grid */}
            {filteredLinks.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-card flex items-center justify-center">
                        {filter === 'favorite' ? (
                            <Star className="w-8 h-8 text-text-muted" />
                        ) : filter === 'archived' ? (
                            <Archive className="w-8 h-8 text-text-muted" />
                        ) : (
                            <Inbox className="w-8 h-8 text-text-muted" />
                        )}
                    </div>
                    <h3 className="text-lg font-medium text-text mb-2">
                        {searchQuery ? 'No results found' :
                            filter === 'favorite' ? 'No favorites yet' :
                                filter === 'archived' ? 'No archived links' :
                                    filter === 'unread' ? 'No unread links' :
                                        selectedCategory.size > 0 ? `No links in ${Array.from(selectedCategory).join(', ')}` :
                                            'Your Second Brain is empty'}
                    </h3>
                    <p className="text-text-secondary text-sm">
                        {searchQuery ? 'Try a different search term' :
                            filter === 'favorite' ? 'Star links to add them to your favorites' :
                                filter === 'archived' ? 'Archive links to see them here' :
                                    filter === 'unread' ? 'All caught up! No unread links' :
                                        selectedCategory.size > 0 ? 'Try selecting a different category' :
                                            'Add your first link using the + button below'}
                    </p>
                </div>
            ) : viewMode === 'table' ? (
                <TableView
                    links={filteredLinks}
                    onOpenDetails={setActiveLink}
                    onStatusChange={handleStatusChange}
                    onUpdateTags={handleUpdateTags}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                />
            ) : viewMode === 'insights' ? (
                <InsightsFeed
                    links={filteredLinks}
                    onOpenDetails={setActiveLink}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                />
            ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredLinks.map((link) => (
                        <Card
                            key={link.id}
                            link={link}
                            onOpenDetails={setActiveLink}
                            onStatusChange={handleStatusChange}
                            onDelete={handleDelete}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedIds.has(link.id)}
                            onToggleSelection={toggleSelection}
                        />
                    ))}
                </div>
            )}
            {/* Active Link Modal */}
            {activeLink && (
                <LinkDetailModal
                    link={activeLink}
                    allLinks={links}
                    isOpen={!!activeLink}
                    onClose={() => setActiveLink(null)}
                    onStatusChange={handleStatusChange}
                    onUpdateTags={handleUpdateTags}
                    onDelete={handleDelete}
                    onOpenOtherLink={(link) => setActiveLink(link)}
                />
            )}
        </div>
    );
}
