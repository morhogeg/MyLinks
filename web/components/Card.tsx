'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { useState, useEffect } from 'react';
import { Archive, Star, Clock, Tag } from 'lucide-react';

interface CardProps {
    link: Link;
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onDelete: (id: string) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
}

/**
 * Card component for displaying a saved link
 */
export default function Card({
    link,
    onOpenDetails,
    onStatusChange,
    onDelete,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection
}: CardProps) {
    const [now, setNow] = useState<number>(0);

    useEffect(() => {
        const initialTimer = setTimeout(() => setNow(Date.now()), 0);
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => {
            clearTimeout(initialTimer);
            clearInterval(timer);
        };
    }, []);

    // Format relative time (e.g., "2h ago")
    const getTimeAgo = (timestamp: any, now: number): string => {
        if (!timestamp || !now) return '...';

        // Handle ISO string or number
        const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (isNaN(time)) return 'recently';

        const seconds = Math.floor((now - time) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <article
            className={`group bg-card rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col items-stretch h-full ${isSelected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-white/5 hover:border-accent/30 hover:bg-white/5'
                }`}
            onClick={() => {
                if (isSelectionMode && onToggleSelection) {
                    onToggleSelection(link.id);
                } else {
                    onOpenDetails(link);
                }
            }}
        >
            <div className="p-5 flex flex-col h-full space-y-4">
                {/* Header Row: Category Badge */}
                <div className="flex justify-between items-start gap-3">
                    {(() => {
                        const colorStyle = getCategoryColorStyle(link.category);
                        return (
                            <span
                                className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg inline-block"
                                style={{
                                    backgroundColor: colorStyle.backgroundColor,
                                    color: colorStyle.color,
                                }}
                            >
                                {link.category}
                            </span>
                        );
                    })()}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                            }}
                            title={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            className={`p-2 sm:p-1.5 rounded-lg transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center ${link.status === 'favorite' ? 'text-yellow-500 bg-yellow-500/10' : 'text-text-muted hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <Star className={`w-3.5 h-3.5 ${link.status === 'favorite' ? 'fill-current' : ''}`} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived');
                            }}
                            title={link.status === 'archived' ? 'Unarchive' : 'Archive'}
                            className="p-2 sm:p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-white/10 transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                        >
                            <Archive className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Title - NO LINE CLAMP */}
                <h3 className="font-bold text-lg text-text transition-colors leading-tight">
                    {link.title}
                </h3>

                {/* Summary */}
                <p className="text-text-secondary text-sm line-clamp-3 leading-relaxed flex-grow">
                    {link.summary}
                </p>

                {/* Footer Section */}
                <div className="pt-4 border-t border-white/5 flex flex-col space-y-3">
                    {/* Tags */}
                    <div className="flex flex-col gap-1">
                        {link.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="text-[10px] font-bold text-text-muted/70 group-hover:text-accent transition-all"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>

                    {/* Metadata Buttons Row */}
                    <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-3 text-text-muted/60 text-[11px] font-medium">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {link.metadata.estimatedReadTime}m
                            </span>
                            {now > 0 && <span>{getTimeAgo(link.createdAt, now)}</span>}
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}
