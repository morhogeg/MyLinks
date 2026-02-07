'use client';

import { useState, useEffect } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { getLinks, updateLinkStatus, deleteLink, searchLinks } from '@/lib/storage';
import Card from './Card';
import { Search, Filter, Inbox, Archive, Star, X } from 'lucide-react';

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
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [isLoading, setIsLoading] = useState(true);

    // Load links on mount and poll for changes
    // TODO: Replace with Firestore onSnapshot for real-time updates:
    // useEffect(() => {
    //   const unsubscribe = onSnapshot(
    //     collection(db, 'users', uid, 'links'),
    //     (snapshot) => setLinks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    //   );
    //   return unsubscribe;
    // }, [uid]);
    useEffect(() => {
        const loadLinks = () => {
            const storedLinks = getLinks();
            setLinks(storedLinks);
            setIsLoading(false);
        };

        loadLinks();

        // Poll for changes (localStorage doesn't have events across tabs)
        const interval = setInterval(loadLinks, 1000);
        return () => clearInterval(interval);
    }, []);

    // Filter links based on search and status
    const filteredLinks = links
        .filter((link) => {
            if (filter === 'all') return true;
            return link.status === filter;
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

    const handleStatusChange = (id: string, status: LinkStatus) => {
        updateLinkStatus(id, status);
        setLinks(getLinks()); // Refresh
    };

    const handleDelete = (id: string) => {
        deleteLink(id);
        setLinks(getLinks()); // Refresh
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

                {/* Filter Tabs */}
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
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
            </div>

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
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredLinks.map((link) => (
                        <Card
                            key={link.id}
                            link={link}
                            onStatusChange={handleStatusChange}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
