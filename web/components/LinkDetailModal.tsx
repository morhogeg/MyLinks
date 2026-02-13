'use client';

import { useState, useEffect } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { Archive, ExternalLink, Star, X, Clock, Tag, Trash2, Bell, BellOff, Plus, Pencil, CheckCircle2, Circle, Check, Network } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import SimpleMarkdown from './SimpleMarkdown';
import { getCategoryColorStyle } from '@/lib/colors';
import CategoryInput from './CategoryInput';
import TagInput from './TagInput';
import { hasHebrew } from '@/lib/rtl';

interface LinkDetailModalProps {
    link: Link;
    allLinks: Link[];
    allCategories: string[];
    uid: string | null;
    isOpen: boolean;
    onClose: () => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onUpdateCategory: (id: string, category: string) => void;
    onDelete: (id: string) => void;
    onUpdateReminder: (link: Link) => void;
    onOpenOtherLink?: (link: Link) => void;
}

export default function LinkDetailModal({
    link,
    allLinks,
    allCategories,
    uid,
    isOpen,
    onClose,
    onStatusChange,
    onReadStatusChange,
    onUpdateTags,
    onUpdateCategory,
    onDelete,
    onUpdateReminder,
    onOpenOtherLink
}: LinkDetailModalProps) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [editedCategory, setEditedCategory] = useState(link.category);
    const [now, setNow] = useState<number>(0);
    const [isAddingTag, setIsAddingTag] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        setEditedCategory(link.category);
    }, [link.category]);

    useEffect(() => {
        const initialTimer = setTimeout(() => setNow(Date.now()), 0);
        const timer = setInterval(() => setNow(Date.now()), 1000 * 60);
        return () => {
            clearTimeout(initialTimer);
            clearInterval(timer);
        };
    }, []);



    if (!isOpen) return null;

    const getRelatedLinks = () => {
        if (!allLinks || !allLinks.length) return [];
        return allLinks
            .filter(l => l.id !== link.id)
            .map(l => {
                let score = 0;
                if (l.category === link.category) score += 3;
                const sharedTags = l.tags.filter(t => link.tags.includes(t));
                score += sharedTags.length * 2;
                return { link: l, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(item => item.link);
    };

    const relatedLinks = getRelatedLinks();
    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary) || (link.detailedSummary ? hasHebrew(link.detailedSummary) : false);

    const getTimeAgo = (timestamp: any, now: number): string => {
        if (!timestamp || !now) return '...';
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

    const isReminderActive = link.reminderStatus === 'pending';
    const nextReminderDate = link.nextReminderAt ? new Date(link.nextReminderAt) : null;

    const handleToggleReminder = () => {
        if (!uid) return;
        onUpdateReminder(link);
    };

    const allTags = Array.from(new Set(allLinks.flatMap(l => l.tags))).sort();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative bg-card border-0 sm:border border-white/10 w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header Actions */}
                <div className="flex items-center justify-between p-3 sm:p-4 safe-pt">
                    <div className="flex gap-1.5 sm:gap-2">
                        <button
                            onClick={() => onReadStatusChange(link.id, !link.isRead)}
                            title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                            className={`p-2 rounded-xl border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${link.isRead
                                ? 'bg-white/10 border-white/5 text-text shadow-lg opacity-100'
                                : 'bg-transparent border-transparent text-text-muted/40 hover:text-text'
                                }`}
                        >
                            {link.isRead ? (
                                <Check className="w-4 h-4" />
                            ) : (
                                <Circle className="w-4 h-4 opacity-40" />
                            )}
                        </button>
                        <button
                            onClick={() => onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite')}
                            title={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            className={`p-2 rounded-xl border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${link.status === 'favorite'
                                ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500 shadow-lg shadow-yellow-500/5'
                                : 'bg-transparent border-transparent text-text-muted hover:text-yellow-500'
                                }`}
                        >
                            <Star className={`w-4 h-4 ${link.status === 'favorite' ? 'fill-current' : ''}`} />
                        </button>
                        <button
                            onClick={() => onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived')}
                            title={link.status === 'archived' ? 'Unarchive' : 'Archive'}
                            className={`p-2 rounded-xl border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${link.status === 'archived'
                                ? 'bg-accent/10 border-accent/20 text-accent shadow-lg shadow-accent/5'
                                : 'bg-transparent border-transparent text-text-muted hover:text-accent'
                                }`}
                        >
                            <Archive className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleToggleReminder}
                            title={isReminderActive ? `Reminder active (next: ${nextReminderDate?.toLocaleDateString()})` : 'Set reminder'}
                            className={`p-2 rounded-xl border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${isReminderActive
                                ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-lg shadow-blue-500/5'
                                : 'bg-transparent border-transparent text-text-muted hover:text-blue-500'
                                }`}
                        >
                            {isReminderActive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            title="Delete"
                            className="p-2 rounded-xl bg-transparent border border-transparent text-text-muted hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-500 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex gap-1.5 sm:gap-2">
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-transparent border border-transparent text-text-muted hover:bg-accent hover:border-accent hover:text-white transition-all shadow-lg shadow-accent/0 hover:shadow-accent/20 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-transparent border border-transparent text-text-muted hover:bg-white/10 hover:text-accent transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div
                    className="flex-1 overflow-y-auto pt-4 px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 md:pb-8 scrollbar-thin scrollbar-thumb-white/10"
                    dir="auto"
                >
                    {/* Content Section */}
                    {link.sourceType === 'image' && (
                        <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 bg-white/5 group/img relative">
                            <img
                                src={link.url}
                                alt="Source Screenshot"
                                className="w-full h-auto max-h-[400px] object-contain cursor-zoom-in transition-transform duration-500 group-hover/img:scale-105"
                                onClick={() => window.open(link.url, '_blank')}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <span className="text-white text-xs font-bold px-3 py-1.5 bg-black/60 rounded-full backdrop-blur-md border border-white/20">
                                    Click to View Original
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="mb-4">
                        {(() => {
                            const colorStyle = getCategoryColorStyle(link.category);
                            return (
                                <div className="relative group/cat inline-block flex items-center gap-1.5">
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
                                            className="w-32 text-[10px] px-2.5 py-1.5"
                                        />
                                    ) : (
                                        <>
                                            <span
                                                className="text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-lg inline-block cursor-pointer hover:brightness-110 transition-all flex items-center shadow-lg shadow-black/5"
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
                                            </span>
                                            {link.sourceName && (
                                                <span className="text-[10px] font-bold text-text-muted/70 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10 shadow-sm">
                                                    {link.sourceName}
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsEditingCategory(true);
                                                }}
                                                className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-1.5 -ms-1.5 hover:bg-white/5 rounded-md"
                                            >
                                                <Pencil className="w-3.5 h-3.5 text-text-muted/40 hover:text-text-muted" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    <h2
                        dir="auto"
                        className={`font-bold text-2xl text-text mb-4 leading-tight ${isRtl ? 'text-right' : ''}`}
                    >
                        {link.title}
                    </h2>

                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Summary */}
                        <div className="mb-6">
                            {link.detailedSummary ? (
                                <SimpleMarkdown
                                    content={link.detailedSummary}
                                    isRtl={isRtl}
                                    className="mb-6 text-base"
                                />
                            ) : (
                                <p
                                    dir="auto"
                                    className={`text-text-secondary mb-6 leading-relaxed text-lg ${isRtl ? 'text-right' : ''}`}
                                >
                                    {link.summary}
                                </p>
                            )}
                        </div>


                        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted mb-8">
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5">
                                <Clock className="w-3.5 h-3.5" />
                                {link.metadata.estimatedReadTime} {isRtl ? 'דק׳ קריאה' : 'min read'}
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5">
                                <Tag className="w-3.5 h-3.5 text-accent" />
                                {getTimeAgo(link.createdAt, now)}
                            </span>
                            {isReminderActive && nextReminderDate && (
                                <span
                                    onClick={handleToggleReminder}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                                >
                                    <Bell className="w-3.5 h-3.5" />
                                    {link.reminderProfile?.startsWith('spaced') && (
                                        <span className="font-bold flex items-center mr-1">
                                            {(() => {
                                                const parts = link.reminderProfile.split('-');
                                                const interval = parts.length > 1 ? ` - ${parts[1]}` : '';
                                                return isRtl ? `[חזרתי${interval}]` : `[Spaced${interval}]`;
                                            })()}
                                        </span>
                                    )}
                                    {isRtl ? 'תזכורת:' : 'Reminder:'} {nextReminderDate.toLocaleDateString(isRtl ? 'he-IL' : undefined)}
                                </span>
                            )}
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-10">
                            {link.tags.map((tag) => {
                                const parts = tag.split('/');
                                const leaf = parts[parts.length - 1];
                                const parents = parts.slice(0, -1).join('/');
                                return (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted/70 hover:text-accent transition-all group/tag bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg border border-transparent hover:border-accent/10"
                                    >
                                        <span className="flex items-center">
                                            {parents && <span className="opacity-30 font-normal mr-0.5">{parents}/</span>}
                                            {leaf}
                                        </span>
                                        <X
                                            className="w-3 h-3 ml-1 opacity-40 group-hover/tag:opacity-100 hover:text-red-400 cursor-pointer transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onUpdateTags(link.id, link.tags.filter(t => t !== tag));
                                            }}
                                        />
                                    </span>
                                );
                            })}

                            {isAddingTag ? (
                                <TagInput
                                    allTags={allTags}
                                    existingTags={link.tags}
                                    onAdd={(tag) => {
                                        onUpdateTags(link.id, [...link.tags, tag]);
                                        setIsAddingTag(false);
                                    }}
                                    onCancel={() => setIsAddingTag(false)}
                                />
                            ) : (
                                <button
                                    onClick={() => setIsAddingTag(true)}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-text-muted/50 hover:text-accent transition-all bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg border border-dashed border-white/10 hover:border-accent/30"
                                >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Tag</span>
                                </button>
                            )}
                        </div>

                        {/* See Also / Contextual Connections */}
                        {link.relatedLinks && link.relatedLinks.length > 0 && (
                            <div className="mb-8 border-t border-white/5 pt-6">
                                <h3 className={`text-sm font-bold text-text-muted uppercase tracking-wider mb-4 flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <Network className="w-4 h-4" />
                                    {isRtl ? 'קשרים סמנטיים' : 'See Also (AI Connections)'}
                                </h3>
                                <div className="grid gap-3">
                                    {link.relatedLinks.map((rel) => {
                                        const fullLink = allLinks.find(l => l.id === rel.id);
                                        if (!fullLink && !rel.title) return null; // Skip if dead link and no title fallback

                                        return (
                                            <div
                                                key={rel.id}
                                                onClick={() => {
                                                    if (fullLink && onOpenOtherLink) {
                                                        onOpenOtherLink(fullLink);
                                                    }
                                                }}
                                                className={`group p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/20 transition-all cursor-pointer ${!fullLink ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <div className="flex justify-between items-start gap-3">
                                                    <h4
                                                        dir={isRtl ? "rtl" : "ltr"}
                                                        className={`font-medium text-text-secondary group-hover:text-accent transition-colors text-sm ${isRtl ? 'text-right' : ''}`}
                                                    >
                                                        {fullLink?.title || rel.title}
                                                    </h4>
                                                    {rel.similarity > 0.85 && (
                                                        <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-mono">
                                                            strong
                                                        </span>
                                                    )}
                                                </div>
                                                <p
                                                    dir={isRtl ? "rtl" : "ltr"}
                                                    className={`text-xs text-text-muted/60 mt-1.5 font-normal italic ${isRtl ? 'text-right' : ''}`}
                                                >
                                                    {isRtl ? "✨ " : "✨ "}{rel.reason}
                                                </p>
                                                {rel.commonConcepts && rel.commonConcepts.length > 0 && (
                                                    <div className={`flex flex-wrap gap-1.5 mt-2 ${isRtl ? 'justify-end' : ''}`}>
                                                        {rel.commonConcepts.map(c => (
                                                            <span key={c} className="text-[10px] text-text-muted/50 bg-black/20 px-1.5 py-0.5 rounded">
                                                                {c}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title="Delete Link"
                message="Are you sure you want to delete this link? This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => {
                    onDelete(link.id);
                    onClose();
                }}
                onClose={() => setShowDeleteConfirm(false)}
            />
        </div>
    );
}
