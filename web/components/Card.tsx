'use client';
// Refreshed colors


import { Link, LinkStatus } from '@/lib/types';
import { Archive, Star, Clock, Trash2, Bell, Pencil, Circle, Check, Image as ImageIcon, MoreHorizontal, Youtube, ExternalLink, Layers, Share2, X, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useState, memo } from 'react';
import { getPlatform, platformIcon, platformColor, xHandle } from '@/lib/platform';
import { useNow } from '@/lib/useNow';
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
    /** Open the "add to collection" sheet for this card. */
    onAddToCollection?: (link: Link) => void;
    /** Share this card as a public Machina page. */
    onShare?: (link: Link) => void;
    /** Collections this card belongs to — rendered as subtle chips. */
    cardCollections?: { id: string; name: string }[];
    /** When the feed is scoped to one collection, its id — enables a quick "remove" action. */
    activeCollectionId?: string;
    /** Remove this card from the given collection. */
    onRemoveFromCollection?: (link: Link, collectionId: string) => void;
    /** Retry analysis for a `failed` capture card (M3). */
    onRetry?: (link: Link) => void;
}

/**
 * Card component for displaying a saved link
 */
function Card({
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
    onTagClick,
    onAddToCollection,
    onShare,
    cardCollections,
    activeCollectionId,
    onRemoveFromCollection,
    onRetry,
}: CardProps) {
    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    // One shared app-wide minute clock (see lib/useNow) instead of a per-card
    // 60s interval — relative times still update once a minute, without dozens
    // of independent timers each triggering their own re-render.
    const now = useNow();

    // Cap the stagger so long feeds still finish assembling quickly (M-P4: tighter
    // per-card delay for a snappier entrance).
    const enterDelay = `${Math.min(index, 10) * 16}ms`;

    const platform = getPlatform(link.url);
    const sourceIcon = platform ? platformIcon(platform, 'w-3 h-3 shrink-0 opacity-80') : null;
    // Detect YouTube by URL (reliable) or stored type, since newer items don't
    // always populate metadata.youtubeChannel. The channel name falls back to
    // the generic sourceName so every video gets the red byline treatment.
    const isYouTube = platform === 'youtube' || link.sourceType === 'youtube';
    const youtubeChannel = link.metadata?.youtubeChannel || link.sourceName;
    // X posts carry the author in the URL (x.com/<handle>/status/...), so we
    // can credit them in the same byline style as YouTube — handle in the X
    // brand color from the source filter.
    const xAuthor = platform === 'x' ? xHandle(link.url) : null;
    // LinkedIn: show only the brand logo. Author/source name from scraping is
    // unreliable (often the first words of the post), so we don't render text.
    const isLinkedIn = platform === 'linkedin';
    // Facebook: credit the author/page name (recovered by the scraper from
    // og:title) next to the brand logo — same byline style as X, minus the @
    // since it's a real name, not a handle. Falls back to logo-only when we
    // couldn't recover a name (or it's a generic placeholder).
    const isFacebook = platform === 'facebook';
    const fbAuthor = isFacebook && link.sourceName
        && !['facebook', 'screenshot', 'none'].includes(link.sourceName.trim().toLowerCase())
        ? link.sourceName : null;

    // Format relative time (e.g., "2h ago")
    const getTimeAgo = (timestamp: any, now: number): string => {
        if (!timestamp || !now) return '...';

        // Handle ISO string or number
        let time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (isNaN(time) || time <= 0) return isRtl ? 'לאחרונה' : 'recently';
        // Some ingest paths (Facebook, screenshots) store Unix *seconds*, not ms —
        // anything below year-2001-in-ms is really a seconds value, so scale it up.
        if (time < 1e12) time *= 1000;

        const seconds = Math.floor((now - time) / 1000);
        if (seconds < 60) return isRtl ? 'זה עתה' : 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return isRtl ? `לפני ${minutes} דק׳` : `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return isRtl ? `לפני ${hours} שע׳` : `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return isRtl ? `לפני ${days} ימים` : `${days}d ago`;
    };

    // M3 — async-capture lifecycle. A card queued via the share sheet is written
    // as `processing` and flips to `failed` if analysis errors. Render
    // a skeleton (processing) or a retryable "couldn't analyze" card (failed) so a
    // capture is never invisible and never silently dropped. These are terminal
    // presentational states — the normal card body/actions don't apply.
    if (link.status === 'processing' || link.status === 'failed') {
        const failed = link.status === 'failed';
        const host = (() => {
            try { return new URL(link.url).hostname.replace(/^www\./, ''); }
            catch { return link.url; }
        })();
        return (
            <article
                className={`surface-card animate-card-enter bg-card rounded-2xl border shadow-[var(--shadow-card)] relative flex flex-col h-full overflow-hidden ${failed ? 'border-red-500/30' : 'border-white/5'
                    }`}
                aria-busy={!failed}
            >
                <div className="p-4 sm:p-5 flex flex-col h-full space-y-3">
                    <div className="flex items-center gap-2">
                        {failed ? (
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        ) : (
                            <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                        )}
                        <span className={`text-[10px] uppercase font-black tracking-widest ${failed ? 'text-red-400' : 'text-accent'}`}>
                            {failed ? 'Couldn’t analyze' : 'Saving…'}
                        </span>
                    </div>

                    <h3 dir="auto" className="font-bold text-base text-text leading-tight line-clamp-2">
                        {link.title || host}
                    </h3>

                    {failed ? (
                        <p className="text-sm text-text-secondary flex-grow">
                            Your link is safe — the AI analysis didn’t finish. Retry to try again, or open the original.
                        </p>
                    ) : (
                        <div className="space-y-2 flex-grow">
                            <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
                            <div className="h-3 w-5/6 bg-white/5 rounded animate-pulse" />
                            <div className="h-3 w-2/3 bg-white/5 rounded animate-pulse" />
                        </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 mt-auto border-t border-white/5">
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={link.url}
                            className="text-[11px] text-text-muted/70 truncate min-w-0 hover:text-accent transition-colors flex items-center gap-1"
                        >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{host}</span>
                        </a>
                        {failed && (
                            <div className="flex items-center gap-1.5 ms-auto shrink-0">
                                {onRetry && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRetry(link); }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
                                    >
                                        <RotateCcw className="w-3 h-3" /> Retry
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(link.id); }}
                                    aria-label="Delete"
                                    className="p-1.5 rounded-full text-text-muted hover:text-red-500 transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </article>
        );
    }

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
            {/* Video thumbnail header — a short banner (matches the shorter thumb in
                the open card) rather than a full 16:9 block. */}
            {link.sourceType === 'youtube' && link.metadata?.thumbnailUrl && (
                <div className="relative w-full h-28 sm:h-32 bg-black/40 overflow-hidden">
                    <img
                        src={link.metadata.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
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

                    {/* Action Buttons (Absolute Center) - Fades in on hover.
                        Pinned to dir="ltr" so the button order is IDENTICAL on
                        every card — otherwise the card's dir (rtl for Hebrew)
                        mirrors the row and the icons land in a different order
                        per language. */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none group-hover:pointer-events-auto">
                        <div dir="ltr" className="flex items-center gap-1 bg-card/90 backdrop-blur-md border border-white/10 p-1 rounded-full shadow-xl">
                            {/* Only render as a link for real http(s) URLs — never make a
                                stored javascript:/data: value clickable. */}
                            {!!link.url && /^https?:\/\//i.test(link.url) && (
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
                            )}
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
                            {onAddToCollection && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddToCollection(link);
                                    }}
                                    title="Add to collection"
                                    className="p-1.5 rounded-full text-text-muted hover:text-accent transition-all flex items-center justify-center"
                                >
                                    <Layers className="w-3 h-3" />
                                </button>
                            )}
                            {onShare && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onShare(link);
                                    }}
                                    title="Share"
                                    className="p-1.5 rounded-full text-text-muted hover:text-accent transition-all flex items-center justify-center"
                                >
                                    <Share2 className="w-3 h-3" />
                                </button>
                            )}
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

                    {/* Source Tag (End) - Fades out on hover. YouTube and X use the
                        branded byline style right here in place of the muted chip;
                        every other source keeps the muted uppercase chip. */}
                    <div className="flex items-center gap-1.5 min-w-0 z-10 ms-auto transition-opacity duration-200 group-hover:opacity-0">
                        {isYouTube && youtubeChannel && (
                            <span
                                dir="ltr"
                                className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[220px]"
                                title={youtubeChannel}
                            >
                                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span className="truncate">{youtubeChannel}</span>
                            </span>
                        )}
                        {!isYouTube && xAuthor && (
                            <span
                                dir="ltr"
                                className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[220px]"
                                title={`@${xAuthor}`}
                            >
                                <span className="shrink-0 inline-flex" style={{ color: platformColor('x') }}>
                                    {platformIcon('x', 'w-3.5 h-3.5')}
                                </span>
                                <span className="truncate">@{xAuthor}</span>
                            </span>
                        )}
                        {!isYouTube && !xAuthor && isLinkedIn && (
                            <span
                                dir="ltr"
                                className="flex items-center gap-1.5 min-w-0 text-xs font-semibold whitespace-nowrap"
                                title="LinkedIn"
                                aria-label="LinkedIn"
                            >
                                <span className="shrink-0 inline-flex" style={{ color: platformColor('linkedin') }}>
                                    {platformIcon('linkedin', 'w-4 h-4')}
                                </span>
                            </span>
                        )}
                        {!isYouTube && !xAuthor && !isLinkedIn && isFacebook && (
                            <span
                                dir="auto"
                                className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[220px]"
                                title={fbAuthor || 'Facebook'}
                                aria-label={fbAuthor || 'Facebook'}
                            >
                                <span className="shrink-0 inline-flex" style={{ color: platformColor('facebook') }}>
                                    {platformIcon('facebook', fbAuthor ? 'w-3.5 h-3.5' : 'w-4 h-4')}
                                </span>
                                {fbAuthor && <span className="truncate">{fbAuthor}</span>}
                            </span>
                        )}
                        {!isYouTube && !xAuthor && !isLinkedIn && !isFacebook && link.sourceType === 'image' && (
                            <span
                                className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-accent whitespace-nowrap"
                                title="Screenshot"
                            >
                                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>Screenshot</span>
                            </span>
                        )}
                        {!isYouTube && !xAuthor && !isLinkedIn && !isFacebook && link.sourceType !== 'image' && link.sourceName && link.sourceName !== 'Screenshot' && link.sourceName !== 'None' && (
                            <span
                                className="flex items-center gap-1 text-[9px] font-bold text-text-muted/60 bg-black/5 border border-black/10 px-2 py-1 rounded-lg dark:bg-white/5 dark:border dark:border-white/10 uppercase tracking-widest whitespace-nowrap transition-all max-w-[220px]"
                                title={link.sourceName}
                            >
                                {sourceIcon}
                                <span className="truncate">{link.sourceName}</span>
                            </span>
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
                    {/* Collection memberships — subtle chips. When viewing inside a
                        collection, that chip becomes a one-tap "remove from collection". */}
                    {cardCollections && cardCollections.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {cardCollections.map((col) => {
                                const isActive = col.id === activeCollectionId;
                                return (
                                    <span
                                        key={col.id}
                                        className="inline-flex items-center gap-1 ps-1.5 pe-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-bold border border-accent/15"
                                        title={isActive ? `Remove from ${col.name}` : `In collection: ${col.name}`}
                                    >
                                        <Layers className="w-2.5 h-2.5" />
                                        <span className="max-w-[120px] truncate">{col.name}</span>
                                        {isActive && onRemoveFromCollection && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onRemoveFromCollection(link, col.id); }}
                                                aria-label={`Remove from ${col.name}`}
                                                className="flex items-center justify-center rounded-full -me-0.5 p-0.5 hover:bg-accent/20 transition-colors"
                                            >
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        )}
                                    </span>
                                );
                            })}
                        </div>
                    )}
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
            onAddToCollection={onAddToCollection}
            onShare={onShare}
            removeFromCollection={
                activeCollectionId && onRemoveFromCollection
                    ? {
                        name: cardCollections?.find((c) => c.id === activeCollectionId)?.name ?? 'collection',
                        onRemove: () => onRemoveFromCollection(link, activeCollectionId),
                    }
                    : undefined
            }
        />
        </>
    );
}

// Memoized: with stable handler/array props from Feed, an unchanged card skips
// re-rendering during unrelated feed updates (banner ticks, search typing, etc.).
export default memo(Card);
