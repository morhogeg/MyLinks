'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Globe, Image as ImageIcon, StickyNote, MessageCircle, Compass, Clock } from 'lucide-react';
import SourceByline from '@/components/SourceByline';
import CitationMark from '@/components/ui/CitationMark';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { getCategoryColorStyle } from '@/lib/colors';
import { platformIcon, platformColor, type PlatformKey } from '@/lib/platform';
import type { DemoCard, DemoKind } from './demoData';

/**
 * `CitationMark`, safe to prerender. The app's component mints its SVG ids
 * from a module-level counter, which is fine everywhere the app uses it (all
 * client-side, behind auth) — but `/welcome` is SSG, and the server's counter
 * doesn't match the client's, which React reports as a hydration mismatch on
 * every id. Until mounted this renders the STATIC glyph (the locked mark — the
 * exact shape CitationMark rests in), sized to the same slot, so the
 * prerendered frame is visually identical and the living mark takes over one
 * frame after hydration with no jump.
 */
export function LiveMark({ size = 24, className = '', ...rest }: ComponentProps<typeof CitationMark>) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) {
        return (
            <span
                className={`inline-flex text-text ${className}`}
                style={{ width: size, height: (size as number) * (416 / 448) }}
                aria-hidden
            >
                <CitationGlyph className="h-full w-full" />
            </span>
        );
    }
    return <CitationMark size={size} className={className} {...rest} />;
}

/**
 * Shared visual primitives for the landing scenes.
 *
 * THE CARD IS THE APP'S CARD (owner call, round 8: "cards should look like our
 * own cards — wherever we show something from the app, use the actual app").
 * `CardView` reproduces `components/Card.tsx`'s exact anatomy with the app's
 * own building blocks:
 *   - `SourceByline` — the REAL component, not a lookalike, so a YouTube card
 *     carries its channel, an X card its @handle, a screenshot its icon,
 *     pixel-identical to the feed;
 *   - `getCategoryColorStyle` — the app's category → colour hash, so TRAVEL is
 *     the same tinted chip here as in the app;
 *   - the shell, header row, title, tag chips and Clock footer carry the card's
 *     own classes (`surface-card`, `rounded-[20px]`, the `text-[10px]
 *     font-black tracking-widest` chip, the `text-[9px]` tag pills).
 * What is deliberately NOT reproduced: the hover action pill, selection mode,
 * category editing, the action sheet — interactive chrome that would be dead
 * weight on a marketing page. This is the card at rest, exactly as it looks.
 */

const PLATFORM_KINDS = new Set<DemoKind>(['instagram', 'x', 'youtube']);

/** The mark for a save's origin, tinted with that platform's own colour. Used
 *  by the citation chips and the silo cards, not by CardView (SourceByline
 *  draws its own marks there). */
export function KindMark({ kind, className = 'w-3.5 h-3.5' }: {
    kind: DemoKind | 'whatsapp' | 'safari';
    className?: string;
}) {
    if (PLATFORM_KINDS.has(kind as DemoKind)) {
        const key = kind as PlatformKey;
        return (
            <span style={{ color: platformColor(key) }} className="inline-flex">
                {platformIcon(key, className)}
            </span>
        );
    }
    const Icon =
        kind === 'shot' ? ImageIcon
            : kind === 'note' ? StickyNote
                : kind === 'whatsapp' ? MessageCircle
                    : kind === 'safari' ? Compass
                        : Globe;
    return <Icon className={`${className} text-text-muted`} aria-hidden />;
}

/**
 * A saved card, exactly as the feed renders one at rest.
 *
 * `dense` (round 13, the shelf) is the card at overview scale — the owner's
 * "zoom out much more": every element of the anatomy survives (colored
 * category chip, real byline, title, summary, tags, clock row), each a step
 * smaller, so a shelf row fits twice the library and each card still reads.
 */
export function CardView({ card, compact = false, dense = false, className = '' }: {
    card: DemoCard;
    compact?: boolean;
    dense?: boolean;
    className?: string;
}) {
    const colorStyle = getCategoryColorStyle(card.category);
    if (dense) {
        return (
            <article
                className={
                    'group surface-card bg-card rounded-2xl border border-border-subtle '
                    + 'shadow-[var(--shadow-card)] overflow-hidden relative flex flex-col items-stretch h-full '
                    + className
                }
            >
                <div className="flex h-full flex-col space-y-2 p-3">
                    <div dir="ltr" className="mb-0.5 flex h-5 w-full items-center justify-between gap-2">
                        <span
                            className="inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest"
                            style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                        >
                            {card.category}
                        </span>
                        {/* Glyph only for sources that have one: this card is
                            168px wide and the category chip takes half of it, so
                            a handle truncated to "@…" said nothing. A plain
                            publisher (MIT News) has no glyph and keeps its name,
                            which is the whole byline. */}
                        <span className="min-w-0 origin-right scale-90">
                            <SourceByline
                                hideLabel
                                link={{
                                    url: card.url,
                                    sourceName: card.sourceName,
                                    sourceType: card.sourceType,
                                    metadata: { youtubeChannel: card.youtubeChannel },
                                }}
                            />
                        </span>
                    </div>
                    <h3 className="text-[13px] font-bold leading-snug text-text">{card.title}</h3>
                    <p className="line-clamp-2 flex-grow text-[11px] leading-relaxed text-text-secondary">
                        {card.summary}
                    </p>
                    {/* Tags get their OWN line, exactly as they do on the full
                        card. Side by side with the clock they had ~70px to share
                        in a 168px card, so every chip clipped mid-word
                        ("materials" → "MATERI", and even "dome" lost its last
                        letter) — a fragment reads as a rendering bug, not as a
                        tag. Stacked, both chips fit whole with room to spare.
                        `shrink-0` is the guarantee: chips size to their text and
                        the row can never squeeze them again. */}
                    <div className="space-y-1.5 border-t border-border-subtle pt-2">
                        <div className="flex gap-1 overflow-hidden">
                            {card.tags.slice(0, 2).map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-fill-subtle px-1 py-0.5 text-[7px] font-black uppercase tracking-wider text-text-muted/60"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <span className="flex items-center gap-1 text-[9px] font-medium text-text-muted/60">
                            <Clock className="h-2.5 w-2.5" />
                            {card.minutes}m · {card.ago}
                        </span>
                    </div>
                </div>
            </article>
        );
    }
    return (
        <article
            className={
                'group surface-card bg-card rounded-[20px] border border-border-subtle '
                + 'shadow-[var(--shadow-card)] overflow-hidden relative flex flex-col items-stretch h-full '
                + className
            }
        >
            <div className={`${compact ? 'p-4' : 'p-4 sm:p-5'} flex flex-col h-full space-y-3`}>
                {/* Header row: category chip start, source byline end — pinned
                    LTR, exactly as the app pins its chrome row. */}
                <div dir="ltr" className="flex items-center justify-between w-full h-7 mb-1">
                    <span
                        className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg inline-block whitespace-nowrap"
                        style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                    >
                        {card.category}
                    </span>
                    <SourceByline
                        link={{
                            url: card.url,
                            sourceName: card.sourceName,
                            sourceType: card.sourceType,
                            metadata: { youtubeChannel: card.youtubeChannel },
                        }}
                    />
                </div>

                <h3 className={`font-bold text-text leading-tight ${compact ? 'text-base' : 'text-base sm:text-lg'}`}>
                    {card.title}
                </h3>

                <p className={`flex-grow leading-relaxed text-text-secondary ${compact ? 'text-[13px]' : 'text-sm'}`}>
                    {card.summary}
                </p>

                <div className="pt-3 border-t border-border-subtle flex flex-col space-y-2">
                    <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                        {card.tags.slice(0, compact ? 3 : 4).map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-fill-subtle text-text-muted/60 border border-transparent"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-3 text-text-muted/60 text-[11px] font-medium">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {card.minutes}m
                            </span>
                            <span>{card.ago}</span>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}
