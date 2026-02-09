'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { Archive, Star, Bell, Trash2 } from 'lucide-react';

interface CompactCardProps {
    link: Link;
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onDelete: (id: string) => void;
    onUpdateReminder: (link: Link) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
}

/**
 * CompactCard component for quick scannability
 */
export default function CompactCard({
    link,
    onOpenDetails,
    onStatusChange,
    onDelete,
    onUpdateReminder,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection
}: CompactCardProps) {
    const colorStyle = getCategoryColorStyle(link.category);

    return (
        <article
            className={`group bg-card rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col items-stretch aspect-square ${isSelected
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
            <div className="p-3 sm:p-4 flex flex-col h-full justify-between gap-2">
                {/* Top Section: Category and Actions */}
                <div className="flex justify-between items-start gap-2">
                    <span
                        className="text-[8px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-md inline-block whitespace-nowrap overflow-hidden text-ellipsis max-w-[75%]"
                        style={{
                            backgroundColor: colorStyle.backgroundColor,
                            color: colorStyle.color,
                        }}
                    >
                        {link.category}
                    </span>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                            }}
                            className={`p-1 rounded-md transition-all ${link.status === 'favorite' ? 'text-yellow-500' : 'text-text-muted hover:text-white'
                                }`}
                        >
                            <Star className={`w-3 h-3 ${link.status === 'favorite' ? 'fill-yellow-500' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Title: Centered and prominent */}
                <h3 className="font-bold text-[11px] sm:text-xs text-text transition-colors leading-tight text-center line-clamp-5 px-1 my-auto">
                    {link.title}
                </h3>

                {/* Bottom Section: Remaining Actions (only on hover) */}
                <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived');
                        }}
                        className="p-1 rounded-md text-text-muted hover:text-accent transition-all"
                    >
                        <Archive className="w-3 h-3" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdateReminder(link);
                        }}
                        className={`p-1 rounded-md transition-all ${link.reminderStatus === 'pending' ? 'text-accent' : 'text-text-muted hover:text-accent'}`}
                    >
                        <Bell className={`w-3 h-3 ${link.reminderStatus === 'pending' ? 'fill-current' : ''}`} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(link.id);
                        }}
                        className="p-1 rounded-md text-text-muted hover:text-red-500 transition-all"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </article>
    );
}
