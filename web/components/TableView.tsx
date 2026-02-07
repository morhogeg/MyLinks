'use client';

import { Link, LinkStatus } from '@/lib/types';
import { ExternalLink, Tag, Trash2, Archive, Star, Inbox } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';

interface TableViewProps {
    links: Link[];
    onStatusChange: (id: string, status: LinkStatus) => void;
    onDelete: (id: string) => void;
    isSelectionMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
}

/**
 * High-density table view for rapid link scanning
 */
export default function TableView({ links, onStatusChange, onDelete }: TableViewProps) {
    const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
    const [now, setNow] = useState<number>(0);

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

    const getTimeAgo = (timestamp: number, now: number): string => {
        const seconds = Math.floor((now - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 84600) return `${Math.floor(seconds / 3600)}h`;
        return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <div className="w-full overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
            <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                    <tr className="border-b border-border-subtle bg-white/[0.01] dark:bg-white/[0.02]">
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest w-[40%]">Source & Insight</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest text-center">Category</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest">Tags</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest text-center">Saved</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-widest text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {links.map((link) => (
                        <tr key={link.id} className="group hover:bg-white/[0.03] transition-colors relative">
                            <td className="px-6 py-5">
                                <div className="flex flex-col gap-1">
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-bold text-text group-hover:text-accent transition-colors flex items-center gap-2"
                                    >
                                        {link.title}
                                        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </a>
                                    <p className="text-xs text-text-secondary line-clamp-1 opacity-80">{link.summary}</p>
                                </div>
                            </td>
                            <td className="px-6 py-5 text-center">
                                <span className={`text-[10px] uppercase font-black tracking-tighter px-2.5 py-1 rounded-lg ${getCategoryColor(link.category)}`}>
                                    {link.category}
                                </span>
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                                    {link.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[10px] text-text-muted flex items-center gap-1 bg-background/50 px-1.5 py-0.5 rounded border border-border-subtle">
                                            <Tag className="w-2.5 h-2.5" />
                                            {tag}
                                        </span>
                                    ))}
                                    {link.tags.length > 3 && <span className="text-[10px] text-text-muted font-medium">+{link.tags.length - 3}</span>}
                                </div>
                            </td>
                            <td className="px-6 py-5 text-center text-[11px] font-medium text-text-muted tabular-nums">
                                {now > 0 ? getTimeAgo(link.createdAt, now) : '...'}
                            </td>
                            <td className="px-6 py-5 text-right">
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
