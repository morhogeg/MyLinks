'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { ExternalLink, Tag, Trash2, Archive, Star, Inbox, X, Plus, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';

interface TableViewProps {
    links: Link[];
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onDelete: (id: string) => void;
    isSelectionMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
}

/**
 * High-density table view for rapid link scanning
 */
export default function TableView({ links, onOpenDetails, onStatusChange, onUpdateTags, onDelete }: TableViewProps) {
    const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
    const [activeTagPicker, setActiveTagPicker] = useState<string | null>(null);
    const [tagSearch, setTagSearch] = useState('');
    const [now, setNow] = useState<number>(0);

    // Get all unique tags from all links
    const allUniqueTags = Array.from(new Set(links.flatMap(l => l.tags))).sort();

    // Filter tags based on search
    const filteredAllTags = tagSearch.trim() === ''
        ? allUniqueTags
        : allUniqueTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));

    const isExistingTag = allUniqueTags.some(t => t.toLowerCase() === tagSearch.toLowerCase().trim());

    useEffect(() => {
        const timer = setTimeout(() => setNow(Date.now()), 0);
        return () => clearTimeout(timer);
    }, []);

    const getCategoryColor = (category: string): string => {
        const colors: Record<string, string> = {
            'Tech': 'bg-blue-500/20 text-blue-400',
            'Articles': 'bg-purple-500/20 text-purple-400',
            'Video': 'bg-red-500/20 text-red-400',
            'Social': 'bg-pink-500/20 text-pink-400',
            'Research': 'bg-green-500/20 text-green-400',
            'Health': 'bg-emerald-500/20 text-emerald-400',
            'General': 'bg-gray-500/20 text-gray-400',
        };
        return colors[category] || colors['General'];
    };

    const getTimeAgo = (timestamp: any, now: number): string => {
        if (!timestamp || !now) return '...';
        const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (isNaN(time)) return 'recently';

        const seconds = Math.floor((now - time) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 84600) return `${Math.floor(seconds / 3600)}h`;
        return new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <div className="w-full overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-border-subtle bg-white/[0.01] dark:bg-white/[0.02]">
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest w-[50%]">Source & Insight</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest text-center w-[12%]">Category</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest w-[25%]">Tags</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest text-right w-[13%]">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {links.map((link) => (
                        <tr key={link.id} className="group hover:bg-white/[0.03] transition-colors relative">
                            <td className="px-6 py-6 cursor-pointer" onClick={() => onOpenDetails(link)}>
                                <div className="flex flex-col gap-1">
                                    <div className="text-sm font-bold text-text group-hover:text-accent transition-colors flex items-center gap-2">
                                        {link.title}
                                        <ExternalLink
                                            className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-white"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(link.url, '_blank');
                                            }}
                                        />
                                    </div>
                                    <p className="text-xs text-text-secondary line-clamp-2 opacity-80">{link.summary}</p>
                                    <div className="flex items-center gap-3 mt-1 text-[10px] font-medium text-text-muted/50 tabular-nums uppercase tracking-wider">
                                        <span className="flex items-center gap-1">
                                            <Inbox className="w-3 h-3" />
                                            Saved {now > 0 ? getTimeAgo(link.createdAt, now) : '...'}
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-6 text-center">
                                {(() => {
                                    const colorStyle = getCategoryColorStyle(link.category);
                                    return (
                                        <span
                                            className="text-[10px] uppercase font-black tracking-tighter px-2.5 py-1 rounded-lg inline-block"
                                            style={{
                                                backgroundColor: colorStyle.backgroundColor,
                                                color: colorStyle.color,
                                            }}
                                        >
                                            {link.category}
                                        </span>
                                    );
                                })()}
                            </td>
                            <td className="px-6 py-6 relative">
                                <div
                                    className="flex flex-col gap-1 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTagPicker(activeTagPicker === link.id ? null : link.id);
                                    }}
                                >
                                    <div className="flex flex-wrap gap-1">
                                        {link.tags.length > 0 ? (
                                            link.tags.slice(0, 3).map(tag => {
                                                const parts = tag.split('/');
                                                const leaf = parts[parts.length - 1];
                                                const parents = parts.slice(0, -1).join('/');
                                                return (
                                                    <span
                                                        key={tag}
                                                        className="text-[9px] font-bold text-text-muted/60 bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1 group/tag relative"
                                                    >
                                                        {parents && <span className="opacity-30 font-normal">{parents}/</span>}
                                                        {leaf}
                                                        <X
                                                            className="w-2.5 h-2.5 ml-0.5 opacity-0 group-hover/tag:opacity-100 hover:text-red-400 transition-all cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onUpdateTags(link.id, link.tags.filter(t => t !== tag));
                                                            }}
                                                        />
                                                    </span>
                                                );
                                            })
                                        ) : (
                                            <span className="text-[10px] text-text-muted/40 italic flex items-center gap-1">
                                                <Plus className="w-2.5 h-2.5" />
                                                Add tags
                                            </span>
                                        )}
                                        {link.tags.length > 3 && <span className="text-[9px] text-text-muted/30 self-center">+{link.tags.length - 3}</span>}
                                    </div>
                                </div>

                                {/* Multi-select Popover */}
                                {activeTagPicker === link.id && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={() => setActiveTagPicker(null)}
                                        />
                                        <div className="absolute top-full left-6 mt-1 w-64 bg-card border border-white/10 rounded-xl shadow-2xl z-20 flex flex-col p-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Tags</span>
                                                <X
                                                    className="w-3 h-3 text-text-muted hover:text-white cursor-pointer"
                                                    onClick={() => {
                                                        setActiveTagPicker(null);
                                                        setTagSearch('');
                                                    }}
                                                />
                                            </div>

                                            {/* Search Input */}
                                            <div className="p-1 mb-1">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="Search or create tag..."
                                                    className="w-full bg-white/5 border border-white/5 rounded-md px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                                                    value={tagSearch}
                                                    onChange={(e) => setTagSearch(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>

                                            <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-1">
                                                {filteredAllTags.map(tag => {
                                                    const isSelected = link.tags.includes(tag);
                                                    return (
                                                        <button
                                                            key={tag}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newTags = isSelected
                                                                    ? link.tags.filter(t => t !== tag)
                                                                    : [...link.tags, tag];
                                                                onUpdateTags(link.id, newTags);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-white/5 ${isSelected ? 'text-accent font-bold bg-accent/5' : 'text-text-secondary'}`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Tag className={`w-3 h-3 ${isSelected ? 'text-accent' : 'text-text-muted'}`} />
                                                                {tag}
                                                            </div>
                                                            {isSelected && <Check className="w-3 h-3" />}
                                                        </button>
                                                    );
                                                })}

                                                {/* Create New Tag Button */}
                                                {tagSearch.trim() !== '' && !isExistingTag && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onUpdateTags(link.id, [...link.tags, tagSearch.trim()]);
                                                            setTagSearch('');
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-accent hover:bg-accent/5 transition-all text-left mt-1 border border-dashed border-accent/20"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        <span>Create &quot;{tagSearch}&quot;</span>
                                                    </button>
                                                )}

                                                {filteredAllTags.length === 0 && tagSearch.trim() === '' && (
                                                    <div className="py-4 text-center text-text-muted/40 italic text-[10px]">
                                                        No tags yet. Type to create one.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </td>

                            <td className="px-6 py-6 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                    <button
                                        onClick={() => onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite')}
                                        className={`p-2 rounded-xl transition-all ${link.status === 'favorite' ? 'text-yellow-500 bg-yellow-500/10' : 'text-text-muted hover:bg-white/5 hover:text-text'}`}
                                        title="Favorite"
                                    >
                                        <Star className={`w-4 h-4 ${link.status === 'favorite' ? 'fill-yellow-500' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived')}
                                        className={`p-2 rounded-xl transition-all ${link.status === 'archived' ? 'text-accent bg-accent/10' : 'text-text-muted hover:bg-white/5 hover:text-text'}`}
                                        title={link.status === 'archived' ? 'Unarchive' : 'Archive'}
                                    >
                                        {link.status === 'archived' ? <Inbox className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={() => setDeleteLinkId(link.id)}
                                        className="p-2 rounded-xl text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <ConfirmDialog
                isOpen={!!deleteLinkId}
                onClose={() => setDeleteLinkId(null)}
                onConfirm={() => deleteLinkId && onDelete(deleteLinkId)}
                title="Delete Link?"
                message="This will permanently remove this insight from your second brain. This action cannot be undone."
                confirmLabel="Delete Forever"
            />
        </div>
    );
}
