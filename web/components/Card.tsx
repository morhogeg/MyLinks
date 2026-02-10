'use client';
// Refreshed colors


import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { useState, useEffect } from 'react';
import { Archive, Star, Clock, Tag, Trash2, ChefHat, Utensils, Bell, BellOff, Pencil, CheckCircle2 } from 'lucide-react';
import SimpleMarkdown from './SimpleMarkdown';

interface CardProps {
    link: Link;
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateCategory: (id: string, category: string) => void;
    onDelete: (id: string) => void;
    onUpdateReminder: (link: Link) => void;
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
    onReadStatusChange,
    onUpdateCategory,
    onDelete,
    onUpdateReminder,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection
}: CardProps) {
    const isRtl = link.language === 'he';
    const [now, setNow] = useState<number>(0);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [editedCategory, setEditedCategory] = useState(link.category);

    useEffect(() => {
        setEditedCategory(link.category);
    }, [link.category]);

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
        if (isNaN(time)) return isRtl ? 'לאחרונה' : 'recently';

        const seconds = Math.floor((now - time) / 1000);
        if (seconds < 60) return isRtl ? 'זה עתה' : 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return isRtl ? `לפני ${minutes} דק׳` : `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return isRtl ? `לפני ${hours} שע׳` : `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return isRtl ? `לפני ${days} ימים` : `${days}d ago`;
    };

    return (
        <article
            className={`group bg-card rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col items-stretch h-full ${isSelected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-white/5 hover:border-accent/30 hover:bg-white/5'
                } ${link.isRead ? 'opacity-60 grayscale-[0.3]' : ''}`}
            onClick={() => {
                if (isSelectionMode && onToggleSelection) {
                    onToggleSelection(link.id);
                } else {
                    onOpenDetails(link);
                }
            }}
        >
            <div
                className="p-4 sm:p-5 flex flex-col h-full space-y-3 sm:space-y-4"
                dir={isRtl ? "rtl" : "ltr"}
            >
                {/* Header Row: Category Badge */}
                <div className="flex justify-between items-start gap-3">
                    {(() => {
                        const colorStyle = getCategoryColorStyle(link.category);
                        return (
                            <div className="relative group/cat">
                                {isEditingCategory ? (
                                    <input
                                        autoFocus
                                        className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg inline-block w-24 bg-white/10 outline-none focus:ring-1 focus:ring-accent/50"
                                        style={{
                                            color: colorStyle.color,
                                        }}
                                        value={editedCategory}
                                        onChange={(e) => setEditedCategory(e.target.value)}
                                        onBlur={() => {
                                            setIsEditingCategory(false);
                                            if (editedCategory.trim() && editedCategory !== link.category) {
                                                onUpdateCategory(link.id, editedCategory.trim());
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.currentTarget.blur();
                                            } else if (e.key === 'Escape') {
                                                setEditedCategory(link.category);
                                                setIsEditingCategory(false);
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span
                                        className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg inline-block cursor-pointer hover:brightness-110 transition-all flex items-center gap-1 group/chip"
                                        style={{
                                            backgroundColor: colorStyle.backgroundColor,
                                            color: colorStyle.color,
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsEditingCategory(true);
                                        }}
                                    >
                                        {link.category}
                                        <Pencil className="w-2 h-2 opacity-0 group-hover/chip:opacity-100 transition-opacity" />
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReadStatusChange(link.id, !link.isRead);
                            }}
                            title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                            className={`p-2 sm:p-1.5 rounded-lg transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center ${link.isRead ? 'text-green-500 bg-green-500/10' : 'text-text-muted hover:text-green-500 hover:bg-white/10'
                                }`}
                        >
                            <CheckCircle2 className={`w-3.5 h-3.5 ${link.isRead ? 'fill-current' : ''}`} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                            }}
                            title={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            className={`p-2 sm:p-1.5 rounded-lg transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center ${link.status === 'favorite' ? 'text-yellow-500 bg-yellow-500/10' : 'text-text-muted hover:text-accent hover:bg-white/10'
                                }`}
                        >
                            <Star className={`w-3.5 h-3.5 ${link.status === 'favorite' ? 'fill-yellow-500' : ''}`} />
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
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdateReminder(link);
                            }}
                            title={link.reminderStatus === 'pending' ? 'Cancel reminder' : 'Remind me'}
                            className={`p-2 sm:p-1.5 rounded-lg transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center ${link.reminderStatus === 'pending' ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-accent hover:bg-white/10'
                                }`}
                        >
                            {link.reminderStatus === 'pending' ? (
                                <Bell className="w-3.5 h-3.5 fill-current" />
                            ) : (
                                <Bell className="w-3.5 h-3.5" />
                            )}
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(link.id);
                            }}
                            title="Delete"
                            className="p-2 sm:p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Title - NO LINE CLAMP */}
                <h3
                    dir={isRtl ? "rtl" : "ltr"}
                    className={`font-bold text-base sm:text-lg text-text transition-colors leading-tight ${isRtl ? 'text-right' : ''}`}
                >
                    {link.title}
                </h3>

                {/* Summary - Structured display */}
                <SimpleMarkdown
                    content={link.summary}
                    isCompact={true}
                    isRtl={isRtl}
                    className="flex-grow"
                />

                {/* Footer Section */}
                <div className="pt-3 sm:pt-4 border-t border-white/5 flex flex-col space-y-2 sm:space-y-3">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                        {link.tags.slice(0, 3).map((tag) => {
                            const parts = tag.split('/');
                            const leaf = parts[parts.length - 1];
                            const parents = parts.slice(0, -1).join('/');

                            return (
                                <span
                                    key={tag}
                                    title={tag}
                                    className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/5 text-text-muted/60 group-hover:text-accent group-hover:bg-accent/10 transition-all border border-transparent group-hover:border-accent/10"
                                >
                                    {parents && <span className="opacity-40 font-normal mr-0.5">{parents}/</span>}
                                    {leaf}
                                </span>
                            );
                        })}
                        {link.tags.length > 3 && (
                            <span className="text-[9px] font-bold text-text-muted/30 self-center">
                                +{link.tags.length - 3}
                            </span>
                        )}
                    </div>

                    {/* Metadata Buttons Row */}
                    <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-3 text-text-muted/60 text-[11px] font-medium">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {link.metadata.estimatedReadTime}{isRtl ? ' דק׳' : 'm'}
                            </span>
                            {now > 0 && <span>{getTimeAgo(link.createdAt, now)}</span>}
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}
