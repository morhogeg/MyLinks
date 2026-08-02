'use client';

import { memo, useRef, useState } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { getDirection } from '@/lib/rtl';
import { getPlatform, platformIcon, platformColor, PLATFORM_LABELS, xHandle, prettyHost } from '@/lib/platform';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { Star, Check, Trash2, StickyNote, Lock, MoreHorizontal } from 'lucide-react';
import { getNotes } from '@/lib/notes';
import CardActionSheet from './CardActionSheet';

interface ListCardProps {
    link: Link;
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    /** Remove the link (routed through the parent's branded confirm dialog). */
    onDelete?: (id: string) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
    /** Position in the feed, used to stagger the entrance animation. */
    index?: number;
    // ── Actions menu (⋯) ─────────────────────────────────────────────────────
    // The same handler set the grid Card takes, so the shared CardActionSheet
    // offers an identical menu in both views. All optional: without them the
    // row still renders, just without the ⋯.
    onReadStatusChange?: (id: string, isRead: boolean) => void;
    onUpdateReminder?: (link: Link) => void;
    onAddToCollection?: (link: Link) => void;
    onShare?: (link: Link) => void;
    onTogglePrivate?: (link: Link) => void;
    onToggleThumbnail?: (link: Link) => void;
    /** ⋯ → See in graph: open the Graph focused on this card. */
    onOpenInGraph?: (link: Link) => void;
    /** Collections this card belongs to — names the "remove from" row. */
    cardCollections?: { id: string; name: string }[];
    /** Set when the feed is scoped to one collection (enables that row). */
    activeCollectionId?: string;
    onRemoveFromCollection?: (link: Link, collectionId: string) => void;
}

// Swipe thresholds (px): MAX caps the travel, TRIGGER is the release point that
// fires the action. Kept generous so a lazy scroll never trips an action.
const MAX = 96;
const TRIGGER = 64;

/**
 * ListCard — a compact, full-width row for the List view: a glanceable vertical
 * stack of headlines. The headline (up to three lines) gets the full row width;
 * the metadata line below carries the source's brand icon, source label and a
 * compact category chip (the 6px colour bar on the row edge stays the primary
 * category cue, M-P3). On touch, swipe right to favourite or left to delete
 * (one swipe grammar app-wide — right is always the positive, non-destructive
 * action, matching the review deck); tapping opens the link.
 */
function ListCard({
    link,
    onOpenDetails,
    onStatusChange,
    onDelete,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection,
    index = 0,
    onReadStatusChange,
    onUpdateReminder,
    onAddToCollection,
    onShare,
    onTogglePrivate,
    onToggleThumbnail,
    onOpenInGraph,
    cardCollections,
    activeCollectionId,
    onRemoveFromCollection,
}: ListCardProps) {
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    // The sheet needs a place to send read/remind/delete. Without those three the
    // menu would be mostly empty rows, so the ⋯ only appears once the parent has
    // wired them (Feed always does; other call sites can opt out by omitting).
    const hasActions = Boolean(onReadStatusChange && onUpdateReminder && onDelete);
    const isRtl = getDirection(link.title, link.language) === 'rtl';
    const colorStyle = getCategoryColorStyle(link.category);
    const isFavorite = link.status === 'favorite';

    // Source shown as its home-screen brand icon; text falls back to the
    // publisher/handle so non-platform links still read clearly.
    const platform = getPlatform(link.url);
    const handle = platform === 'x' ? xHandle(link.url) : null;
    const cleanSource = link.sourceName && !['none', 'screenshot'].includes(link.sourceName.toLowerCase())
        ? link.sourceName
        : null;
    const sourceLabel = handle ? `@${handle}` : (cleanSource ?? (platform ? PLATFORM_LABELS[platform] : prettyHost(link.url)));

    // Cap the stagger so long lists still finish assembling quickly (M-P4: tighter
    // per-card delay for a snappier entrance).
    const enterDelay = `${Math.min(index, 12) * 14}ms`;

    // ── Swipe-to-action (touch) ──────────────────────────────────────────────
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const axis = useRef<'h' | 'v' | null>(null);
    const offsetRef = useRef(0);
    const movedRef = useRef(false);

    const setOff = (v: number) => { offsetRef.current = v; setOffset(v); };

    const onTouchStart = (e: React.TouchEvent) => {
        if (isSelectionMode) return;
        const t = e.touches[0];
        startX.current = t.clientX;
        startY.current = t.clientY;
        axis.current = null;
        movedRef.current = false;
        setDragging(true);
    };
    const onTouchMove = (e: React.TouchEvent) => {
        if (isSelectionMode) return;
        const t = e.touches[0];
        const dx = t.clientX - startX.current;
        const dy = t.clientY - startY.current;
        if (axis.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
            axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        if (axis.current === 'h') {
            movedRef.current = true;
            setOff(Math.max(-MAX, Math.min(MAX, dx)));
        }
    };
    const onTouchEnd = () => {
        if (isSelectionMode) return;
        setDragging(false);
        const o = offsetRef.current;
        if (axis.current === 'h' && Math.abs(o) >= TRIGGER) {
            if (o > 0) {
                hapticLight(); // swipe-right-to-favorite: positive, non-destructive — a crisp light tap
                onStatusChange(link.id, isFavorite ? 'unread' : 'favorite');
            } else {
                hapticMedium(); // swipe-left-to-delete: a firmer tap acknowledges the destructive intent (parent confirms)
                onDelete?.(link.id);
            }
        }
        setOff(0);
    };

    const handleClick = () => {
        // A swipe just happened — swallow the click so it doesn't also open.
        if (movedRef.current) { movedRef.current = false; return; }
        if (isSelectionMode && onToggleSelection) onToggleSelection(link.id);
        else onOpenDetails(link);
    };

    const armed = Math.abs(offset) >= TRIGGER;

    return (
        <>
        <div
            data-no-edge-swipe
            style={{ ['--enter-delay' as string]: enterDelay }}
            className={`group animate-card-enter surface-card rounded-2xl border shadow-[var(--shadow-card)] overflow-hidden relative transition-[transform,box-shadow,border-color] duration-200 [@media(hover:hover)]:hover:-translate-y-px [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] ${isSelected
                ? 'border-accent ring-1 ring-accent'
                : 'border-border-subtle hover:border-accent/30'
                } ${link.isRead ? 'opacity-60' : ''}`}
        >
            {/* Swipe action revealed behind the row: favourite (right) / delete (left).
                Right is the positive, non-destructive action everywhere (M-swipe). */}
            {offset > 0 && (
                <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-start ps-5 bg-yellow-500 text-white">
                    <Star className={`w-5 h-5 fill-current transition-transform ${armed ? 'scale-125' : 'scale-100'}`} />
                </div>
            )}
            {offset < 0 && (
                <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-end pe-5 bg-red-500 text-white">
                    <Trash2 className={`w-5 h-5 transition-transform ${armed ? 'scale-125' : 'scale-100'}`} />
                </div>
            )}

            <article
                /* Mirror the whole row per card language: the colour bar
                   (start-0), metadata line, and star all use logical
                   properties/flex order, so dir alone flips them to the
                   correct side for Hebrew cards. The swipe overlays live on
                   the LTR wrapper, so gesture direction stays physical. */
                dir={isRtl ? 'rtl' : 'ltr'}
                onClick={handleClick}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{
                    transform: `translateX(${offset}px)`,
                    transitionProperty: 'transform',
                    transitionDuration: dragging ? '0ms' : '220ms',
                    transitionTimingFunction: 'var(--ease-spring)',
                    touchAction: 'pan-y',
                }}
                className={`relative z-10 flex items-start gap-3 ps-3.5 pe-3 py-3 cursor-pointer ${isSelected ? 'bg-accent/5' : 'bg-card'}`}
            >
                {/* Category colour cue on the leading edge for quick scanning —
                    widened to 6px so the category reads at a glance (M-P3). */}
                <span
                    className="absolute start-0 inset-y-2 w-1.5 rounded-full"
                    style={{ backgroundColor: colorStyle.backgroundColor }}
                    aria-hidden
                />

                {isSelectionMode && (
                    <span
                        className={`shrink-0 self-center w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'bg-accent border-accent text-accent-ink' : 'border-text-muted/40 text-transparent'
                            }`}
                    >
                        <Check className="w-3 h-3" />
                    </span>
                )}

                {/* Headline + metadata. The title owns the full content width —
                    only the star (and the checkbox in selection mode) sit beside it. */}
                <div className="flex-1 min-w-0 ps-1">
                    <h3 className={`line-clamp-3 font-semibold text-[15px] leading-snug text-text ${isRtl ? 'font-hebrew' : ''}`}>
                        {link.title}
                    </h3>
                    {/* Metadata stays LTR internally (brand icon + latin
                        handle/host + category name) but hugs the title's edge
                        on RTL cards. Order: icon · source · chip. */}
                    <div className={`mt-1 flex items-center gap-1.5 min-w-0 text-[11px] text-text-muted ${isRtl ? 'justify-end' : ''}`} dir="ltr">
                        {/* Private marker — icon only, matching the grid cards. */}
                        {link.isPrivate && (
                            <span className="shrink-0 inline-flex items-center" title="Private" aria-label="Private">
                                <Lock className="w-3 h-3" />
                            </span>
                        )}
                        {platform && (
                            <span className="shrink-0 inline-flex items-center" style={{ color: platformColor(platform) }} title={PLATFORM_LABELS[platform]}>
                                {platformIcon(platform, 'w-3.5 h-3.5')}
                            </span>
                        )}
                        {sourceLabel && <span className="truncate">{sourceLabel}</span>}
                        {/* Category chip — secondary labeling next to the source;
                            the colour bar on the row edge is the primary cue (M-P3). */}
                        <span
                            className="shrink-0 max-w-[120px] px-1.5 py-px rounded-full text-[9px] leading-4 font-bold uppercase tracking-wider truncate"
                            style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                            title={link.category}
                        >
                            {link.category}
                        </span>
                    </div>
                    {/* Your own note(s) in YOUR voice — the StickyNote glyph leads
                        the snippet inline (no vertical accent bar), muted + italic
                        so it's distinct from the machine byline above. Newest note
                        first, "+N" for the rest; truncated to keep the row compact;
                        dir="auto" keeps it RTL-safe (icon mirrors to the start). */}
                    {link.sourceType !== 'note' && (() => {
                        const notes = getNotes(link);
                        if (notes.length === 0) return null;
                        const [first, ...rest] = notes;
                        return (
                            <p
                                dir="auto"
                                title={first.text}
                                className="mt-1 flex items-center gap-1 min-w-0 text-[11px] italic text-text-muted/90"
                            >
                                <StickyNote className="w-3 h-3 shrink-0 opacity-60" />
                                <span className="truncate">{first.text}</span>
                                {rest.length > 0 && (
                                    <span className="shrink-0 not-italic text-[10px] font-bold text-text-muted/60">
                                        +{rest.length}
                                    </span>
                                )}
                            </p>
                        );
                    })()}
                </div>

                {/* Row CHROME: favourite + actions, always in the row's TOP-RIGHT
                    corner — never mirrored. The article flips per card language so
                    the title and byline read correctly, which used to carry the
                    star along with them: in a mixed EN/HE feed the control hopped
                    sides row to row. `order` pins the cluster to the physical right
                    in both directions (last child in LTR, first in RTL), matching
                    the grid Card, whose chrome row is likewise dir-pinned. Its own
                    dir="ltr" keeps star-then-⋯ in a stable reading order and makes
                    the physical margins below unambiguous.
                    Negative margins eat into the row padding so the cluster hugs
                    the corner and 3-line titles aren't forced to centre around it. */}
                <div
                    dir="ltr"
                    style={{ order: isRtl ? -1 : 1 }}
                    className="shrink-0 -mt-1.5 -mr-1 flex items-start"
                >
                    {/* Favourite: shown only when the card IS one. An empty star on
                        every row spent 36px of title width to advertise an action
                        that already lives in ⋯ (and in swipe-right on touch); most
                        rows aren't favourites, so most rows got nothing for it —
                        titles were wrapping to three lines beside a blank outline.
                        Kept for favourites because the filled star is the ONLY
                        at-a-glance "you starred this" cue in the list, and losing it
                        would make the scanning view unable to show the thing it is
                        for. It still un-stars on tap. ⋯ is the last child either way,
                        so the menu never moves — only the star comes and goes. */}
                    {isFavorite && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange(link.id, 'unread');
                            }}
                            aria-label="Remove from favorites"
                            className="shrink-0 w-9 h-11 flex items-center justify-center rounded-lg text-yellow-500 transition-colors"
                        >
                            <Star className="w-4 h-4 fill-yellow-500" />
                        </button>
                    )}

                    {/* Actions — the same sheet the grid card opens. Unlike the
                        grid, this is NOT gated to coarse pointers: a list row has
                        no hover-reveal action set, so without a visible trigger
                        these actions would be unreachable on desktop. */}
                    {hasActions && !isSelectionMode && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsSheetOpen(true);
                            }}
                            aria-label="Actions"
                            className="shrink-0 w-9 h-11 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-text active:bg-fill-strong transition-colors"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </article>
        </div>

        {hasActions && (
            <CardActionSheet
                link={link}
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                onStatusChange={onStatusChange}
                onReadStatusChange={onReadStatusChange!}
                onUpdateReminder={onUpdateReminder!}
                onDelete={onDelete!}
                onAddToCollection={onAddToCollection}
                onShare={onShare}
                onTogglePrivate={onTogglePrivate}
                onToggleThumbnail={onToggleThumbnail}
                onOpenInGraph={onOpenInGraph}
                removeFromCollection={
                    activeCollectionId && onRemoveFromCollection
                        ? {
                            name: cardCollections?.find((c) => c.id === activeCollectionId)?.name ?? 'collection',
                            onRemove: () => onRemoveFromCollection(link, activeCollectionId),
                        }
                        : undefined
                }
            />
        )}
        </>
    );
}

// Memoized: with stable handler props from Feed, an unchanged row skips
// re-rendering during unrelated feed updates.
export default memo(ListCard);
