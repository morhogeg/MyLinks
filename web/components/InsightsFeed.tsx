'use client';

import { Link } from '@/lib/types';
import { Lightbulb, Tag, ArrowRight, X, Pencil, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getCategoryColorStyle } from '@/lib/colors';
import CategoryInput from './CategoryInput';

interface InsightsFeedProps {
    links: Link[];
    onOpenDetails: (link: Link) => void;
    onUpdateCategory: (id: string, category: string) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    allCategories: string[];
    isSelectionMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
}

export default function InsightsFeed({
    links,
    onOpenDetails,
    onUpdateCategory,
    onReadStatusChange,
    allCategories,
    isSelectionMode,
    selectedIds,
    onToggleSelection
}: InsightsFeedProps) {
    const [now, setNow] = useState<number>(0);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editedCategory, setEditedCategory] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setNow(Date.now()), 0);
        return () => clearTimeout(timer);
    }, []);

    const getTimeAgo = (timestamp: string | number, now_val: number): string => {
        const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (isNaN(time)) return 'recently';
        const seconds = Math.floor((now_val - time) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        return new Date(time).toLocaleDateString();
    };

    return (
        <div className="space-y-6">
            {links.map((link) => (
                <article
                    key={link.id}
                    className={`bg-card rounded-2xl border transition-all group flex items-start gap-3 p-4 sm:p-6 ${selectedIds?.has(link.id)
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border-subtle hover:shadow-lg'
                        } ${isSelectionMode ? 'cursor-pointer select-none' : 'cursor-default'} ${link.isRead ? 'opacity-50 grayscale-[0.2]' : ''}`}
                    onClick={() => {
                        if (isSelectionMode && onToggleSelection) {
                            onToggleSelection(link.id);
                        } else {
                            onOpenDetails(link);
                        }
                    }}
                >
                    {isSelectionMode && (
                        <div className="mt-1">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds?.has(link.id)
                                ? 'bg-accent border-accent text-white'
                                : 'border-text-muted bg-background'
                                }`}>
                                {selectedIds?.has(link.id) && <X className="w-3.5 h-3.5" />}
                            </div>
                        </div>
                    )}

                    <div className="flex-1">
                        <div className="flex items-start gap-3 sm:gap-4">
                            <div className="mt-1 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-yellow-500/10 text-yellow-500 shadow-inner group-hover:scale-105 transition-transform">
                                <Lightbulb className="w-5 h-5 sm:w-6 sm:h-6 fill-yellow-500/20" />
                            </div>

                            <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                    {(() => {
                                        const colorStyle = getCategoryColorStyle(link.category);
                                        const isEditing = editingCategoryId === link.id;
                                        return (
                                            <div className="relative group/cat flex items-center gap-1">
                                                {isEditing ? (
                                                    <CategoryInput
                                                        currentCategory={link.category}
                                                        allCategories={allCategories}
                                                        onUpdate={(newCategory) => {
                                                            setEditingCategoryId(null);
                                                            if (newCategory !== link.category) {
                                                                onUpdateCategory(link.id, newCategory);
                                                            }
                                                        }}
                                                        onCancel={() => setEditingCategoryId(null)}
                                                        className="w-24 text-[10px] px-2 py-0.5"
                                                    />
                                                ) : (
                                                    <>
                                                        <span
                                                            className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md inline-block cursor-pointer hover:brightness-110 transition-all flex items-center shadow-sm"
                                                            style={{
                                                                backgroundColor: colorStyle.backgroundColor,
                                                                color: colorStyle.color,
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingCategoryId(link.id);
                                                                setEditedCategory(link.category);
                                                            }}
                                                        >
                                                            {link.category}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingCategoryId(link.id);
                                                                setEditedCategory(link.category);
                                                            }}
                                                            className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-1 -ml-1 hover:bg-white/5 rounded-md"
                                                        >
                                                            <Pencil className="w-3 h-3 text-text-muted/40 hover:text-text-muted" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onReadStatusChange(link.id, !link.isRead);
                                            }}
                                            className={`p-1.5 rounded-lg transition-all ${link.isRead ? 'text-green-500 bg-green-500/10' : 'text-text-muted hover:text-green-500 hover:bg-white/5'}`}
                                            title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                                        >
                                            <CheckCircle2 className={`w-3.5 h-3.5 ${link.isRead ? 'fill-current' : ''}`} />
                                        </button>
                                        <span className="text-[10px] text-text-muted font-medium tabular-nums">
                                            {now > 0 ? getTimeAgo(link.createdAt, now) : '...'}
                                        </span>
                                    </div>
                                </div>

                                <h3 className="text-lg sm:text-xl font-bold text-text group-hover:text-accent transition-colors leading-snug">
                                    {link.title}
                                </h3>

                                <div className="bg-background/50 rounded-xl p-3 sm:p-4 border border-border-subtle relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-50" />
                                    <p className="text-text-secondary italic text-xs sm:text-sm leading-relaxed">
                                        &quot;{link.metadata.actionableTakeaway || 'Analyze this link to get an actionable insight...'}&quot;
                                    </p>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex gap-2">
                                        {link.tags.slice(0, 3).map(tag => (
                                            <span key={tag} className="text-[10px] text-text-muted flex items-center gap-1">
                                                <Tag className="w-3 h-3" />
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <button className="flex items-center gap-1 text-xs font-bold text-accent group-hover:translate-x-1 transition-transform">
                                        Full Summary <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
}
