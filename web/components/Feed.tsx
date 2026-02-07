'use client';

import { useState, useEffect } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { updateLinkStatus, deleteLink } from '@/lib/storage';
import { collection, query, orderBy, onSnapshot, where, getDocs, limit, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Card from './Card';
import TableView from './TableView';
import InsightsFeed from './InsightsFeed';
import SmartPulse from './SmartPulse';
import { Search, Inbox, Archive, Star, X, LayoutGrid, List, Sparkles, Trash2, Brain } from 'lucide-react';

type FilterType = 'all' | 'unread' | 'archived' | 'favorite';

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
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'table' | 'insights'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

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

    // Filter links based on search and status
    const filteredLinks = links
        .filter((link) => {
            if (filter === 'all') return true;
            return link.status === filter;
        })
        .filter((link) => {
            if (!selectedCategory) return true;
            return link.category === selectedCategory;
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
            {/* Search Bar */}
            <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg pb-4 pt-2 -mt-2">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search your brain..."
                        className="w-full pl-12 pr-10 py-3 bg-card rounded-xl text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-white/20"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full"
                        >
                            <X className="w-4 h-4 text-text-muted" />
                        </button>
                    )}
                </div>

                {/* Filter Tabs & View Switcher */}
                <div className="flex items-center justify-between mt-3 gap-4">
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                        {filterButtons.map((btn) => (
                            <button
                                key={btn.key}
                                onClick={() => setFilter(btn.key)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === btn.key
                                    ? 'bg-white text-black'
                                    : 'bg-card text-text-secondary hover:bg-card-hover'
                                    }`}
                            >
                                {btn.icon}
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center bg-card rounded-full p-1 border border-border-subtle shadow-sm">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-full transition-all ${viewMode === 'grid' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-secondary'}`}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`p-1.5 rounded-full transition-all ${viewMode === 'table' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-secondary'}`}
                            title="Table View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('insights')}
                            className={`p-1.5 rounded-full transition-all ${viewMode === 'insights' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-secondary'}`}
                            title="Insights View"
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {isSelectionMode ? (
                            <div className="flex items-center gap-2 animate-slide-up">
                                <span className="text-xs font-bold text-accent mr-1">{selectedIds.size} selected</span>
                                <button
                                    onClick={handleBulkArchive}
                                    disabled={selectedIds.size === 0}
                                    className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all disabled:opacity-50"
                                    title="Archive Selected"
                                >
                                    <Archive className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={selectedIds.size === 0}
                                    className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                                    title="Delete Selected"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => {
                                        setIsSelectionMode(false);
                                        setSelectedIds(new Set());
                                    }}
                                    className="p-1.5 rounded-lg text-text-muted hover:text-text transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsSelectionMode(true)}
                                className="p-2 rounded-xl text-text-muted hover:text-accent transition-all flex items-center gap-2 bg-card border border-border-subtle"
                            >
                                <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Select</span>
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Category Navigator */}
                <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${!selectedCategory
                            ? 'bg-accent/10 border-accent/20 text-accent'
                            : 'bg-card border-border-subtle text-text-muted hover:border-text-muted'}`}
                    >
                        All Categories
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedCategory === cat
                                ? 'bg-accent/10 border-accent/20 text-accent'
                                : 'bg-card border-border-subtle text-text-muted hover:border-text-muted'}`}
                        >
                            {cat}
                            <span className="opacity-50 font-black">{categoryCounts[cat]}</span>
                        </button>
                    ))}
                </div>
            </div>

            {uid && filter === 'all' && !searchQuery && !selectedCategory && (
                <div className="pb-4">
                    <SmartPulse links={links} uid={uid} />
                </div>
            )}

            {/* Links Grid */}
            {filteredLinks.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-card flex items-center justify-center">
                        <Inbox className="w-8 h-8 text-text-muted" />
                    </div>
                    <h3 className="text-lg font-medium text-text mb-2">
                        {searchQuery ? 'No results found' : 'Your Second Brain is empty'}
                    </h3>
                    <p className="text-text-secondary text-sm">
                        {searchQuery
                            ? 'Try a different search term'
                            : 'Add your first link using the + button below'}
                    </p>
                </div>
            ) : viewMode === 'table' ? (
                <TableView
                    links={filteredLinks}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                />
            ) : viewMode === 'insights' ? (
                <InsightsFeed
                    links={filteredLinks}
                    onOpenDetails={(link) => {
                        console.log('Open insight details', link);
                    }}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredLinks.map((link) => (
                        <Card
                            key={link.id}
                            link={link}
                            allLinks={links}
                            onStatusChange={handleStatusChange}
                            onDelete={handleDelete}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedIds.has(link.id)}
                            onToggleSelection={toggleSelection}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
