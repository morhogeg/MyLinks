'use client';
// Refreshed colors


import { Link, LinkStatus } from '@/lib/types';
import { Archive, Star, Clock, Tag, Trash2, Bell, CheckCircle2, Pencil, Circle, Check, Image as ImageIcon, MoreHorizontal, Play, Youtube, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getPlatform, platformIcon } from '@/lib/platform';
import SimpleMarkdown from './SimpleMarkdown';
import { getCategoryColorStyle } from '@/lib/colors';
import CategoryInput from './CategoryInput';
import CardActionSheet from './CardActionSheet';
import { hasHebrew } from '@/lib/rtl';

interface CardProps {
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
    /** Position in the feed, used to stagger the entrance animation. */
    index?: number;
    /** Tapping a footer tag filters the feed by that tag. */
    onTagClick?: (tag: string) => void;
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
    allCategories,
    onDelete,
    onUpdateReminder,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection,
    index = 0,
    onTagClick
}: CardProps) {
    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [now, setNow] = useState<number>(0);

    // Cap the stagger so long feeds still finish assembling quickly.
    const enterDelay = `${Math.min(index, 12) * 30}ms`;

    const platform = getPlatform(link.url);
    const sourceIcon = platform ? platformIcon(platform, 'w-3 h-3 shrink-0 opacity-80') : null;
    // Detect YouTube by URL (reliable) or stored type, since newer items don't
    // always populate metadata.youtubeChannel. The channel name falls back to
    // the generic sourceName so every video gets the red byline treatment.
    const isYouTube = platform === 'youtube' || link.sourceType === 'youtube';
    const youtubeChannel = link.metadata?.youtubeChannel || link.sourceName;

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
        <>
        <article
            style={{ ['--enter-delay' as string]: enterDelay }}
            className={`group surface-card animate-card-enter bg-card rounded-2xl border shadow-[var(--shadow-card)] transition-all duration-300 ease-[var(--ease-spring)] cursor-pointer relative flex flex-col items-stretch h-full [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] ${isSelected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-white/5 hover:border-accent/30'
                } ${link.isRead ? 'opacity-60 grayscale-[0.3]' : ''} ${isEditingCategory ? 'overflow-visible z-50' : 'overflow-hidden'}`}
            onClick={() => {
                if (isSelectionMode && onToggleSelection) {
                    onToggleSelection(link.id);
                } else {
                    onOpenDetails(link);
                }
            }}
        >
            {/* Video thumbnail header — gives YouTube cards a real video shape. */}
            {link.sourceType === 'youtube' && link.metadata?.thumbnailUrl && (
                <div className="relative w-full aspect-video bg-black/40 overflow-hidden">
                    <img
                        src={link.metadata.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-110">
                            <Play className="w-5 h-5 text-white fill-white ms-0.5" />
                        </div>
                    </div>
                    {link.metadata.durationDisplay && (
                        <span className="absolute bottom-2 end-2 text-[10px] font-bold text-white bg-black/75 px-1.5 py-0.5 rounded-md tracking-wide">
                            {link.metadata.durationDisplay}
                        </span>
                    )}
                </div>
            )}
            <div
                className="p-4 sm:p-5 flex flex-col h-full space-y-3 sm:space-y-4"
                dir={isRtl ? "rtl" : "ltr"}
            >
                {/* Header Row: Category (start) and Source Badge (end). Inherits
                    the card's direction so the category chip sits on the same
                    edge the title starts from — right for Hebrew, left for
                    English — keeping each card internally coherent. */}
                <div className="relative flex items-center justify-between w-full h-7 mb-1">
                    {/* Category Section (Start) - Fades out on hover */}
                    <div className="flex items-center min-w-0 z-10 transition-opacity duration-200 group-hover:opacity-0">
                        {(() => {
                            const colorStyle = getCategoryColorStyle(link.category);
                            return (
                                <div className="relative group/cat flex items-center gap-2">
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
                                        />
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-1.5 overflow-visible">
                                                <span
                                                    className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg inline-block cursor-pointer hover:brightness-110 transition-all group/chip whitespace-nowrap"
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
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsEditingCategory(true);
                                                }}
                                                className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-1 -ms-1 hover:bg-white/5 rounded-md flex-shrink-0"
                                            >
                                                <Pencil className="w-3 h-3 text-text-muted/40 hover:text-text-muted" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Action Buttons (Absolute Center) - Fades in on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none group-hover:pointer-events-auto">
                        <div className="flex items-center gap-1 bg-card/90 backdrop-blur-md border border-white/10 p-1 rounded-full shadow-xl">
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Open source"
                                className="p-1.5 rounded-full text-text-muted hover:text-accent transition-all flex items-center justify-center"
                            >
                                <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReadStatusChange(link.id, !link.isRead);
                                }}
                                title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                                className={`p-1.5 rounded-full transition-all flex items-center justify-center ${link.isRead ? 'text-text bg-white/10' : 'text-text-muted/40 hover:text-text'
                                    }`}
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
                                    onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                                }}
                                title={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                                className={`p-1.5 rounded-full transition-all flex items-center justify-center ${link.status === 'favorite' ? 'text-yellow-500 bg-yellow-500/10' : 'text-text-muted hover:text-accent'
                                    }`}
                            >
                                <Star className={`w-3 h-3 ${link.status === 'favorite' ? 'fill-yellow-500' : ''}`} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived');
                                }}
                                title={link.status === 'archived' ? 'Unarchive' : 'Archive'}
                                className="p-1.5 rounded-full text-text-muted hover:text-accent transition-all flex items-center justify-center"
                            >
                                <Archive className="w-3 h-3" />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateReminder(link);
                                }}
                                title={link.reminderStatus === 'pending'
                                    ? `Reminder active${link.reminderProfile?.startsWith('spaced')
                                        ? ` (Spaced Repetition${link.reminderProfile.split('-')[1] ? ` - ${link.reminderProfile.split('-')[1]} days` : ''})`
                                        : ''}`
                                    : 'Remind me'}
                                className={`p-1.5 rounded-full transition-all flex items-center justify-center relative ${link.reminderStatus === 'pending' ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-accent'
                                    }`}
                            >
                                {link.reminderStatus === 'pending' ? (
                                    <>
                                        <Bell className="w-3 h-3 fill-current" />
                                        {link.reminderProfile?.startsWith('spaced') && (
                                            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent"></span>
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <Bell className="w-3 h-3" />
                                )}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(link.id);
                                }}
                                title="Delete"
                                className="p-1.5 rounded-full text-text-muted hover:text-red-500 transition-all flex items-center justify-center"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    {/* Source Tag (End) - Fades out on hover. YouTube uses the red
                        channel style right here in place of the muted chip; every
                        other source keeps the muted uppercase chip. */}
                    <div className="flex items-center gap-1.5 min-w-0 z-10 ms-auto transition-opacity duration-200 group-hover:opacity-0">
                        {isYouTube && youtubeChannel && (
                            <span
                                className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[220px]"
                                title={youtubeChannel}
                            >
                                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span className="truncate">{youtubeChannel}</span>
                            </span>
                        )}
                        {!isYouTube && link.sourceName && link.sourceName !== 'Screenshot' && link.sourceType !== 'image' && (
                            <span
                                className="flex items-center gap-1 text-[9px] font-bold text-text-muted/60 bg-black/5 border border-black/10 px-2 py-1 rounded-lg dark:bg-white/5 dark:border dark:border-white/10 uppercase tracking-widest whitespace-nowrap transition-all max-w-[220px]"
                                title={link.sourceName}
                            >
                                {sourceIcon}
                                <span className="truncate">{link.sourceName}</span>
                            </span>
                        )}
                        {link.sourceType === 'image' && link.url && (
                            <div className="w-8 h-8 rounded-md overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
                                <img src={link.url} alt="Thumbnail" className="w-full h-full object-cover" />
                            </div>
                        )}
                    </div>

                    {/* Touch-only actions trigger: hover actions are unreachable on a
                        phone, so coarse-pointer devices get a persistent menu button. */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsSheetOpen(true);
                        }}
                        aria-label="Actions"
                        className="hidden [@media(hover:none)]:flex items-center justify-center p-1.5 -me-1 ms-1 rounded-full text-text-muted hover:text-text active:bg-white/10 z-20 flex-shrink-0"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                </div>

                {/* Title - NO LINE CLAMP */}
                <h3
                    dir="auto"
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
                        {link.tags.map((tag) => {
                            const parts = tag.split('/');
                            const leaf = parts[parts.length - 1];
                            const parents = parts.slice(0, -1).join('/');

                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    title={`Filter by ${tag}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTagClick?.(tag);
                                    }}
                                    className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/5 text-text-muted/60 group-hover:text-accent group-hover:bg-accent/10 hover:!bg-accent/20 hover:!text-accent active:scale-95 transition-all border border-transparent group-hover:border-accent/10 cursor-pointer"
                                >
                                    {parents && <span className="opacity-40 font-normal mr-0.5">{parents}/</span>}
                                    {leaf}
                                </button>
                            );
                        })}
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
        </article >

        <CardActionSheet
            link={link}
            isOpen={isSheetOpen}
            onClose={() => setIsSheetOpen(false)}
            onStatusChange={onStatusChange}
            onReadStatusChange={onReadStatusChange}
            onUpdateReminder={onUpdateReminder}
            onDelete={onDelete}
        />
        </>
    );
}
