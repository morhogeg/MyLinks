'use client';

import { useRef, useState } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { hasHebrew } from '@/lib/rtl';
import { getPlatform, platformIcon, platformColor, PLATFORM_LABELS, xHandle, prettyHost } from '@/lib/platform';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { Star, Check, Trash2 } from 'lucide-react';

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
 * stack of headlines. Shows the headline (up to two lines), the source's brand
 * icon (matching the card grid), and the category as a colour chip. On touch,
 * swipe right to delete or left to favourite; tapping opens the link.
 */
export default function ListCard({
    link,
    onOpenDetails,
    onStatusChange,
    onDelete,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection,
    index = 0,
}: ListCardProps) {
    const isRtl = link.language === 'he' || hasHebrew(link.title);
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
                hapticMedium(); // swipe-to-delete: a firmer tap acknowledges the destructive intent
                onDelete?.(link.id);
            } else {
                hapticLight(); // swipe-to-favorite: a crisp light tap
                onStatusChange(link.id, isFavorite ? 'unread' : 'favorite');
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
                : 'border-white/5 hover:border-accent/30'
                } ${link.isRead ? 'opacity-60' : ''}`}
        >
            {/* Swipe action revealed behind the row: delete (right) / favourite (left). */}
            {offset > 0 && (
                <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-start ps-5 bg-red-500 text-white">
                    <Trash2 className={`w-5 h-5 transition-transform ${armed ? 'scale-125' : 'scale-100'}`} />
                </div>
            )}
            {offset < 0 && (
                <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-end pe-5 bg-yellow-500 text-white">
                    <Star className={`w-5 h-5 fill-current transition-transform ${armed ? 'scale-125' : 'scale-100'}`} />
                </div>
            )}

            <article
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
                className={`relative z-10 flex items-center gap-3 ps-3.5 pe-3 py-3 cursor-pointer ${isSelected ? 'bg-accent/5' : 'bg-card'}`}
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
                        className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'bg-accent border-accent text-white' : 'border-text-muted/40 text-transparent'
                            }`}
                    >
                        <Check className="w-3 h-3" />
                    </span>
                )}

                {/* Headline + source */}
                <div className="flex-1 min-w-0 ps-1" dir={isRtl ? 'rtl' : 'ltr'}>
                    <h3 className={`line-clamp-2 font-semibold text-[15px] leading-snug text-text ${isRtl ? 'font-hebrew' : ''}`}>
                        {link.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11px] text-text-muted" dir="ltr">
                        {platform && (
                            <span className="shrink-0 inline-flex items-center" style={{ color: platformColor(platform) }} title={PLATFORM_LABELS[platform]}>
                                {platformIcon(platform, 'w-3.5 h-3.5')}
                            </span>
                        )}
                        {sourceLabel && <span className="truncate">{sourceLabel}</span>}
                    </div>
                </div>

                {/* Category — a colour chip (replaces the old tag). */}
                <span
                    className="shrink-0 max-w-[30vw] sm:max-w-[150px] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider truncate"
                    style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                    title={link.category}
                >
                    {link.category}
                </span>

                {/* Favourite toggle — stays put as you scan. */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(link.id, isFavorite ? 'unread' : 'favorite');
                    }}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    className={`shrink-0 -me-1.5 w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${isFavorite ? 'text-yellow-500' : 'text-text-muted/40 hover:text-accent'
                        }`}
                >
                    <Star className={`w-4 h-4 ${isFavorite ? 'fill-yellow-500' : ''}`} />
                </button>
            </article>
        </div>
    );
}
