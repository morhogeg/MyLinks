'use client';
// Refreshed colors


import { Link, LinkStatus } from '@/lib/types';
import { Archive, Star, Clock, Trash2, Bell, Pencil, Circle, Check, MoreHorizontal, ExternalLink, Layers, Share2, Loader2, RotateCcw, AlertTriangle, StickyNote, Lock } from 'lucide-react';
import { useState, memo } from 'react';
import SourceByline from './SourceByline';
import { useNow } from '@/lib/useNow';
import SimpleMarkdown from './SimpleMarkdown';
import { getCategoryColorStyle } from '@/lib/colors';
import CategoryInput from './CategoryInput';
import CardActionSheet from './CardActionSheet';
import { hasHebrew } from '@/lib/rtl';
import { getNotes } from '@/lib/notes';

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
    /** Toggle the card's Private flag (parent owns PIN setup — lib/privacyLock). */
    onTogglePrivate?: (link: Link) => void;
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
    onTogglePrivate,
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

    // The source byline (branded platforms, screenshot/note, or plain publisher)
    // is one shared component now — see SourceByline. Do NOT reintroduce a
    // per-card copy here; that's what caused the design to drift across views.

    // Format relative time (e.g., "2h ago")
    const getTimeAgo = (timestamp: number | string, now: number): string => {
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
        // Client-side staleness fallback: the backend janitor flips a stuck
        // `processing` card to `failed`, but if enqueue succeeded and the backend
        // then never resolves (e.g. the reviewer is on a flaky network), the
        // skeleton would otherwise persist until that sweep runs. Past a generous
        // multiple of the 300s background budget we surface the same retry
        // affordance the `failed` branch renders, so a capture is never a
        // permanent "Saving…". Retry re-stamps processingStartedAt and re-runs.
        const STALE_PROCESSING_MS = 8 * 60 * 1000;
        const startedMs =
            typeof link.processingStartedAt === 'number'
                ? link.processingStartedAt
                : typeof link.createdAt === 'number'
                    ? link.createdAt
                    : Date.parse(String(link.createdAt));
        const staleProcessing =
            link.status === 'processing' &&
            now > 0 &&
            startedMs > 0 &&
            now - startedMs > STALE_PROCESSING_MS;
        const failed = link.status === 'failed' || staleProcessing;
        const host = (() => {
            try { return new URL(link.url).hostname.replace(/^www\./, ''); }
            catch { return link.url; }
        })();
        return (
            <article
                className={`surface-card animate-card-enter bg-card rounded-[20px] border shadow-[var(--shadow-card)] relative flex flex-col h-full overflow-hidden ${failed ? 'border-red-500/30' : 'border-border-subtle'
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
                            <div className="h-3 w-full bg-fill-subtle rounded animate-pulse" />
                            <div className="h-3 w-5/6 bg-fill-subtle rounded animate-pulse" />
                            <div className="h-3 w-2/3 bg-fill-subtle rounded animate-pulse" />
                        </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 mt-auto border-t border-border-subtle">
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
            className={`group surface-card animate-card-enter bg-card rounded-[20px] border shadow-[var(--shadow-card)] transition-all duration-300 ease-[var(--ease-spring)] cursor-pointer relative flex flex-col items-stretch h-full [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] ${isSelected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-border-subtle hover:border-accent/30'
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
            {/* Social-post cover (X / Instagram): the same image we read for the
                summary, shown as a short banner. Non-video cards only. */}
            {link.sourceType !== 'youtube' && link.metadata?.thumbnailUrl && (
                <div className="relative w-full h-28 sm:h-32 bg-black/40 overflow-hidden">
                    <img
                        src={link.metadata.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
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
                                                className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-1 -ms-1 hover:bg-fill-subtle rounded-md flex-shrink-0"
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
                        <div dir="ltr" className="flex items-center gap-1 bg-card/90 backdrop-blur-md border border-border-strong p-1 rounded-full shadow-xl">
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
                                className={`p-1.5 rounded-full transition-all flex items-center justify-center ${link.isRead ? 'text-text bg-fill-strong' : 'text-text-muted/40 hover:text-text'
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
                                    ? link.reminderProfile === 'smart'
                                        ? 'Reminder active (Smart review)'
                                        : link.reminderProfile?.startsWith('spaced')
                                            ? 'Reminder active (Spaced review)'
                                            : 'Reminder active'
                                    : 'Remind me'}
                                className={`p-1.5 rounded-full transition-all flex items-center justify-center relative ${link.reminderStatus === 'pending' ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-accent'
                                    }`}
                            >
                                <Bell className={`w-3 h-3 ${link.reminderStatus === 'pending' ? 'fill-current' : ''}`} />
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
                        {/* Private marker — icon only, matching the collection tiles. */}
                        {link.isPrivate && (
                            <span
                                aria-label="Private"
                                title="Private"
                                className="flex items-center justify-center w-6 h-6 rounded-full bg-fill-subtle border border-border-strong text-text-muted shrink-0"
                            >
                                <Lock className="w-3 h-3" />
                            </span>
                        )}
                        <SourceByline link={link} />
                    </div>

                    {/* Touch-only actions trigger: hover actions are unreachable on a
                        phone, so coarse-pointer devices get a persistent menu button. */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsSheetOpen(true);
                        }}
                        aria-label="Actions"
                        className="hidden [@media(hover:none)]:flex items-center justify-center p-1.5 -me-1 ms-1 rounded-full text-text-muted hover:text-text active:bg-fill-strong z-20 flex-shrink-0"
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
                <div className="pt-3 sm:pt-4 border-t border-border-subtle flex flex-col space-y-2 sm:space-y-3">
                    {/* Collection memberships — quiet accent labels (identity only).
                        Removing a card from a collection is a deliberate, staged
                        action in the Manage cards sheet, never an accidental tap
                        on the card face. */}
                    {cardCollections && cardCollections.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {cardCollections.map((col) => (
                                <span
                                    key={col.id}
                                    className="inline-flex items-center gap-1 ps-1.5 pe-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-bold border border-accent/15"
                                    title={`In collection: ${col.name}`}
                                >
                                    <Layers className="w-2.5 h-2.5" />
                                    <span className="max-w-[120px] truncate">{col.name}</span>
                                </span>
                            ))}
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
                                    className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-fill-subtle text-text-muted/60 group-hover:text-accent group-hover:bg-accent/10 hover:!bg-accent/20 hover:!text-accent active:scale-95 transition-all border border-transparent group-hover:border-accent/10 cursor-pointer"
                                >
                                    {parents && <span className="opacity-40 font-normal mr-0.5">{parents}/</span>}
                                    {leaf}
                                </button>
                            );
                        })}
                    </div>

                    {/* Your own note(s) — the StickyNote glyph leads the snippet
                        inline (no vertical accent bar), muted + italic so it reads
                        as YOUR voice, distinct from the machine summary above.
                        Newest note first; a "+N" tallies the rest. Clamped to 2
                        lines with dir="auto" so it stays RTL-safe (icon mirrors to
                        the start) and never bloats the card. Note-cards ARE the
                        note, so skip them. */}
                    {link.sourceType !== 'note' && (() => {
                        const notes = getNotes(link);
                        if (notes.length === 0) return null;
                        const [first, ...rest] = notes;
                        return (
                            <div
                                dir="auto"
                                title={first.text}
                                className="flex items-start gap-1.5 text-[12px] leading-snug text-text-muted/90 italic"
                            >
                                <StickyNote className="w-3 h-3 shrink-0 mt-[3px] opacity-60" />
                                <span className="line-clamp-2">{first.text}</span>
                                {rest.length > 0 && (
                                    <span className="shrink-0 mt-[2px] not-italic text-[10px] font-bold text-text-muted/60">
                                        +{rest.length}
                                    </span>
                                )}
                            </div>
                        );
                    })()}

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
            onTogglePrivate={onTogglePrivate}
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
