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
                    return (b.createdAt as number) - (a.createdAt as number);
                case 'date-asc':
                    return (a.createdAt as number) - (b.createdAt as number);
                case 'title-asc':
                    return a.title.localeCompare(b.title);
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
            {/* Sticky Header Section */}
            <div className="sticky top-[64px] sm:top-[72px] z-30 bg-background/95 backdrop-blur-xl pb-4 pt-4 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-border-subtle shadow-sm">
                {/* Search Bar */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search your brain..."
                        className="w-full pl-10 sm:pl-12 pr-12 sm:pr-10 py-3 bg-card rounded-2xl text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all shadow-inner"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full transition-all"
                        >
                            <X className="w-4 h-4 text-text-muted" />
                        </button>
                    )}
                </div>

                {/* Row 1: Category Navigator (Primary) */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mb-4">
                    <button
                        onClick={() => setSelectedCategory(new Set())}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all border whitespace-nowrap min-h-[40px] flex-shrink-0 ${selectedCategory.size === 0
                            ? 'bg-accent text-white border-accent shadow-md shadow-accent/20'
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
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border whitespace-nowrap min-h-[40px] flex-shrink-0 ${isSelected
                                    ? ''
                                    : 'bg-card border-border-subtle text-text-muted hover:border-text-secondary hover:text-text-secondary'
                                    }`}
                                style={isSelected ? {
                                    backgroundColor: colorStyle.backgroundColor,
                                    color: colorStyle.color,
                                    borderColor: colorStyle.backgroundColor,
                                    boxShadow: `0 4px 12px ${colorStyle.backgroundColor}33`,
                                } : undefined}
                            >
                                {cat}
                                <span className="opacity-60 font-medium ml-1">({categoryCounts[cat]})</span>
                            </button>
                        );
                    })}
                </div>

                {/* Row 2 & 3: Status Filters & View Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Status Filters - Secondary */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
                        {filterButtons.map((btn) => {
                            const isActive = filter === btn.key;
                            let icon = btn.icon;

                            // Use filled icons when active
                            if (isActive) {
                                if (btn.key === 'favorite') {
                                    icon = <Star className="w-3.5 h-3.5 fill-current" />;
                                } else if (btn.key === 'archived') {
                                    icon = <Archive className="w-3.5 h-3.5 fill-current" />;
                                }
                            }

                            return (
                                <button
                                    key={btn.key}
                                    onClick={() => setFilter(btn.key)}
                                    title={btn.label}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-200 min-h-[36px] flex-shrink-0 ${isActive
                                        ? btn.key === 'favorite'
                                            ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                            : 'bg-accent/10 text-accent border border-accent/20'
                                        : 'bg-card/50 text-text-muted hover:bg-card-hover border border-transparent'
                                        }`}
                                >
                                    <div className={isActive ? btn.key === 'favorite' ? 'text-yellow-500' : 'text-accent' : 'text-text-muted'}>
                                        {icon}
                                    </div>
                                    <span>{btn.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 scrollbar-hide overflow-visible">
                        {/* Sort Dropdown */}
                        <div className="relative">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortType)}
                                className="appearance-none bg-card/50 border border-transparent rounded-full pl-3 pr-8 py-1.5 text-[11px] font-semibold text-text-muted hover:bg-card-hover transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[36px]"
                            >
                                <option value="date-desc">Newest First</option>
                                <option value="date-asc">Oldest First</option>
                                <option value="title-asc">Title A-Z</option>
                                <option value="category">Category</option>
                            </select>
                            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                        </div>

                        {/* View Mode Switcher */}
                        <div className="flex items-center bg-card/50 rounded-full p-0.5 border border-transparent shadow-sm flex-shrink-0">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-full transition-all min-h-[28px] min-w-[28px] flex items-center justify-center ${viewMode === 'grid' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                                title="Grid View"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-full transition-all min-h-[28px] min-w-[28px] flex items-center justify-center ${viewMode === 'table' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                                title="Table View"
                            >
                                <List className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setViewMode('insights')}
                                className={`p-1.5 rounded-full transition-all min-h-[28px] min-w-[28px] flex items-center justify-center ${viewMode === 'insights' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                                title="Insights View"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Selection Control */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {isSelectionMode ? (
                                <div className="flex items-center gap-1.5 animate-slide-up bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10 min-h-[36px]">
                                    <span className="text-[10px] font-bold text-accent px-1">{selectedIds.size}</span>
                                    <button
                                        onClick={handleBulkArchive}
                                        disabled={selectedIds.size === 0}
                                        className="p-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all disabled:opacity-30"
                                        title="Archive Selected"
                                    >
                                        <Archive className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={selectedIds.size === 0}
                                        className="p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all disabled:opacity-30"
                                        title="Delete Selected"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(false);
                                            setSelectedIds(new Set());
                                        }}
                                        className="p-1.5 rounded-full text-text-muted hover:text-text transition-all"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsSelectionMode(true)}
                                    className="h-9 px-3 rounded-full text-text-muted hover:text-accent transition-all flex items-center gap-2 bg-card/50 border border-transparent"
                                >
                                    <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Select</span>
                                    <LayoutGrid className="w-3.5 h-3.5" />
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
