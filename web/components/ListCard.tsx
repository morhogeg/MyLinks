'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { hasHebrew } from '@/lib/rtl';
import { Star, Check } from 'lucide-react';

interface ListCardProps {
    link: Link;
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    /** Tapping the trailing tag chip filters the feed by that tag. */
    onTagClick?: (tag: string) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
    /** Position in the feed, used to stagger the entrance animation. */
    index?: number;
}

/**
 * ListCard — a compact, full-width row for the List view: a glanceable vertical
 * stack of headlines you can scroll through quickly. Each row shows just the
 * essentials — a category colour cue, the headline, and one tag — so the eye
 * can scan dozens at once. Tapping opens the link; the trailing star favourites
 * it in place.
 */
export default function ListCard({
    link,
    onOpenDetails,
    onStatusChange,
    onTagClick,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelection,
    index = 0,
}: ListCardProps) {
    const isRtl = link.language === 'he' || hasHebrew(link.title);
    const colorStyle = getCategoryColorStyle(link.category);
    const isFavorite = link.status === 'favorite';
    const firstTag = link.tags?.[0];

    // Cap the stagger so long lists still finish assembling quickly.
    const enterDelay = `${Math.min(index, 16) * 22}ms`;

    return (
        <article
            style={{ ['--enter-delay' as string]: enterDelay }}
            onClick={() => {
                if (isSelectionMode && onToggleSelection) onToggleSelection(link.id);
                else onOpenDetails(link);
            }}
            className={`group surface-card animate-card-enter bg-card rounded-xl border shadow-[var(--shadow-card)] transition-all duration-200 ease-[var(--ease-spring)] cursor-pointer relative flex items-center gap-3 ps-3.5 pe-3 py-3 overflow-hidden [@media(hover:hover)]:hover:-translate-y-px [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] ${isSelected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-white/5 hover:border-accent/30'
                } ${link.isRead ? 'opacity-60' : ''}`}
        >
            {/* Category colour cue — a slim bar on the leading edge for quick scanning. */}
            <span
                className="absolute start-0 inset-y-2 w-1 rounded-full"
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

            {/* Headline + meta */}
            <div className="flex-1 min-w-0 ps-1" dir={isRtl ? 'rtl' : 'ltr'}>
                <h3 className={`truncate font-semibold text-[15px] leading-snug text-text ${isRtl ? 'font-hebrew' : ''}`}>
                    {link.title}
                </h3>
                <div className="mt-0.5 flex items-center gap-2 min-w-0">
                    <span
                        className="shrink-0 text-[10px] uppercase font-bold tracking-wider truncate max-w-[45%]"
                        style={{ color: colorStyle.backgroundColor }}
                        title={link.category}
                    >
                        {link.category}
                    </span>
                    {link.sourceName && (
                        <span className="text-[11px] text-text-muted truncate">· {link.sourceName}</span>
                    )}
                </div>
            </div>

            {/* One tag — a glanceable chip; tap to filter by it. */}
            {firstTag && (
                <button
                    onClick={(e) => { e.stopPropagation(); onTagClick?.(firstTag); }}
                    className="inline-flex shrink-0 items-center max-w-[32vw] sm:max-w-[160px] px-2 py-0.5 rounded-full bg-card-hover border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-accent hover:border-accent/40 transition-colors"
                    title={`Filter by ${firstTag}`}
                >
                    <span className="truncate">#{firstTag.split('/').pop()}</span>
                </button>
            )}

            {/* Favourite toggle — stays put as you scan. */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(link.id, isFavorite ? 'unread' : 'favorite');
                }}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                className={`shrink-0 p-1.5 rounded-lg transition-colors ${isFavorite ? 'text-yellow-500' : 'text-text-muted/40 hover:text-accent'
                    }`}
            >
                <Star className={`w-4 h-4 ${isFavorite ? 'fill-yellow-500' : ''}`} />
            </button>
        </article>
    );
}
