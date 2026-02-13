'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { Archive, Star, Bell, Trash2, Pencil, Circle, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import CategoryInput from './CategoryInput';

interface CompactCardProps {
    link: Link;
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateCategory: (id: string, category: string) => void;
    allCategories: string[];
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
    onReadStatusChange,
    onUpdateCategory,
    allCategories,
    onDelete,
    onUpdateReminder,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection
}: CompactCardProps) {
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [editedCategory, setEditedCategory] = useState(link.category);

    useEffect(() => {
        setEditedCategory(link.category);
    }, [link.category]);

    const colorStyle = getCategoryColorStyle(link.category);
    const isRtl = link.language === 'he';

    return (
        <article
            className={`group bg-card rounded-xl border transition-all cursor-pointer relative flex flex-col items-stretch aspect-square ${isSelected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-white/5 hover:border-accent/30 hover:bg-white/5'
                } ${link.isRead ? 'opacity-60 grayscale-[0.3]' : ''} ${isEditingCategory ? 'overflow-visible z-50' : 'overflow-hidden'}`}
            onClick={() => {
                if (isSelectionMode && onToggleSelection) {
                    onToggleSelection(link.id);
                } else {
                    onOpenDetails(link);
                }
            }}
        >
            <div
                className="p-2 sm:p-3 flex flex-col h-full relative"
                dir={isRtl ? "rtl" : "ltr"}
            >
                {/* Top Section: Category and Star */}
                <div className="flex justify-between items-start gap-2 z-10">
                    <div className="relative group/cat max-w-[75%] flex items-center gap-1">
                        {isEditingCategory ? (
                            <CategoryInput
                                currentCategory={link.category}
                                allCategories={allCategories}
                                onUpdate={(newCategory) => {
                                    setIsEditingCategory(false);
                                    if (newCategory !== link.category) {
                                        onUpdateCategory(link.id, newCategory);
                                    }
                                }}
                                onCancel={() => setIsEditingCategory(false)}
                                className="text-[8px] px-1.5 py-0.5 w-full"
                            />
                        ) : (
                            <>
                                <span
                                    className="text-[8px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-md inline-block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer hover:brightness-110 transition-all flex items-center"
                                    style={{
                                        backgroundColor: colorStyle.backgroundColor,
                                        color: colorStyle.color,
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditingCategory(true);
                                    }}
                                    title={link.category}
                                >
                                    {link.category}
                                </span>
                                {link.sourceName && (
                                    <span className="shrink-0 text-[7px] font-bold text-text-muted/60 bg-white/5 px-1 py-0.5 rounded border border-white/5 uppercase tracking-tighter truncate max-w-[40px]">
                                        {link.sourceName}
                                    </span>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditingCategory(true);
                                    }}
                                    className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-0.5 -ms-1 hover:bg-white/5 rounded-md"
                                >
                                    <Pencil className="w-2 h-2 text-text-muted/40 hover:text-text-muted" />
                                </button>
                            </>
                        )}
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                        }}
                        className={`p-1 rounded-md transition-all ${link.status === 'favorite' ? 'text-yellow-500' : 'text-text-muted/40 hover:text-accent'
                            }`}
                    >
                        <Star className={`w-3 h-3 ${link.status === 'favorite' ? 'fill-yellow-500' : ''}`} />
                    </button>
                </div>

                {/* Title Container: Centered vertically and horizontally */}
                <div className="flex-1 flex items-center justify-center py-1">
                    <h3
                        dir={isRtl ? "rtl" : "ltr"}
                        className={`font-bold text-[11px] sm:text-xs text-text transition-colors leading-tight text-center line-clamp-5 px-1 ${isRtl ? 'font-hebrew' : ''}`}
                    >
                        {link.title}
                    </h3>
                </div>

                {/* Hover Action Overlay: Does not take up space in the layout flow */}
                <div className="absolute inset-x-0 bottom-0 p-2 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onReadStatusChange(link.id, !link.isRead);
                        }}
                        className={`p-1.5 rounded-lg transition-all ${link.isRead ? 'text-text items-center opacity-100 bg-white/10' : 'text-text-muted/40 hover:text-text hover:bg-white/10'}`}
                        title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                    >
                        {link.isRead ? (
                            <Check className="w-3 h-3" />
                        ) : (
                            <Circle className="w-3 h-3 opacity-40" />
                        )}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived');
                        }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-white/10 transition-all"
                    >
                        <Archive className="w-3 h-3" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdateReminder(link);
                        }}
                        className={`p-1.5 rounded-lg transition-all relative ${link.reminderStatus === 'pending' ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-accent hover:bg-white/10'}`}
                        title={link.reminderStatus === 'pending'
                            ? `Reminder active${link.reminderProfile?.startsWith('spaced')
                                ? ` (Spaced Repetition${link.reminderProfile.split('-')[1] ? ` - ${link.reminderProfile.split('-')[1]} days` : ''})`
                                : ''}`
                            : 'Remind me'}
                    >
                        <Bell className={`w-3 h-3 ${link.reminderStatus === 'pending' ? 'fill-current' : ''}`} />
                        {link.reminderStatus === 'pending' && link.reminderProfile && link.reminderProfile.startsWith('spaced') && (
                            <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent"></span>
                            </span>
                        )}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(link.id);
                        }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </article>
    );
}
