'use client';

import { memo, useRef, useState } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { getDirection } from '@/lib/rtl';
import { getPlatform, platformIcon, platformColor, PLATFORM_LABELS, xHandle, prettyHost } from '@/lib/platform';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { Star, Check, Trash2, StickyNote } from 'lucide-react';

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
}: ListCardProps) {
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
        <div
            data-no-edge-swipe
            style={{ ['--enter-delay' as string]: enterDelay }}
            className={`group animate-card-enter surface-card rounded-xl border shadow-[var(--shadow-card)] overflow-hidden relative transition-[transform,box-shadow,border-color] duration-200 [@media(hover:hover)]:hover:-translate-y-px [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] ${isSelected
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
                        className={`shrink-0 self-center w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'bg-accent border-accent text-white' : 'border-text-muted/40 text-transparent'
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
                        {/* Personal-note cue — this card carries your own note. */}
                        {link.userNote && link.sourceType !== 'note' && (
                            <span className="shrink-0 inline-flex items-center text-accent/70" title="You added a note">
                                <StickyNote className="w-3 h-3" />
                            </span>
                        )}
                    </div>
                </div>

                {/* Favourite toggle — stays put as you scan. Keeps its 44px hit
                    target (M-P3) but hugs the row's top corner (negative margins
                    eat into the row padding) so 3-line titles aren't forced to
                    centre around it. */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(link.id, isFavorite ? 'unread' : 'favorite');
                    }}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    className={`shrink-0 -mt-2 -me-1.5 w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${isFavorite ? 'text-yellow-500' : 'text-text-muted/40 hover:text-accent'
                        }`}
                >
                    <Star className={`w-4 h-4 ${isFavorite ? 'fill-yellow-500' : ''}`} />
                </button>
            </article>
        </div>
    );
}

// Memoized: with stable handler props from Feed, an unchanged row skips
// re-rendering during unrelated feed updates.
export default memo(ListCard);
