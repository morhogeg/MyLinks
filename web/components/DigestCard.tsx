'use client';

import { useState } from 'react';
import { Newspaper, ChevronDown, SlidersHorizontal, Trash2 } from 'lucide-react';
import { CuratedDigest, DigestCardRef } from '@/lib/types';
import { hapticLight } from '@/lib/haptics';
import { digestDisplayTitle, digestKindLabel } from '@/lib/digest';
import { getCategoryColorStyle } from '@/lib/colors';
import { getDirection } from '@/lib/rtl';
import SimpleMarkdown from './SimpleMarkdown';

/**
 * One curated digest in the Digest section's history — modeled on
 * SynthesisCard: a calm collapsed header, tap to expand into the card list,
 * each row tappable to open its source. Presentation only; the curation is
 * done server-side (functions/digest_service.py).
 */
export default function DigestCard({
    digest,
    defaultExpanded = false,
    alwaysOpen = false,
    onOpenCard,
    onOpenSettings,
    onDelete,
}: {
    digest: CuratedDigest;
    defaultExpanded?: boolean;
    /** Pinned open with no collapse chrome — for the desktop reading pane. */
    alwaysOpen?: boolean;
    onOpenCard: (card: DigestCardRef) => void;
    /** Jump to the digest settings in Settings. */
    onOpenSettings?: () => void;
    /** Remove this digest from the history. */
    onDelete?: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const isOpen = alwaysOpen || expanded;

    const toggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const openCard = (card: DigestCardRef) => {
        hapticLight();
        onOpenCard(card);
    };

    // The digest's identity is its DATE — the stored title is the same static
    // string on every doc, so it stays in the section chrome (nav bar), not
    // here. The kind + count make one quiet eyebrow instead of three scattered
    // labels (date, mode jargon, trailing count).
    const displayTitle = digestDisplayTitle(digest, { relative: true });
    const kindLabel = digestKindLabel(digest.frequency);
    const countLabel = `${digest.cardCount} ${digest.cardCount === 1 ? 'card' : 'cards'}`;

    return (
        // The pinned-open detail is FLAT on phones (an edge-to-edge screen, not
        // a card floating in a screen); the card chrome returns at sm+ where it
        // sits inline / in the desktop reading pane.
        <div className={alwaysOpen
            ? 'overflow-hidden sm:rounded-[20px] sm:border sm:border-border-subtle sm:bg-card'
            : 'rounded-[20px] border border-border-subtle bg-card overflow-hidden'}>
            {/* Header — an iOS-style hero in the reading pane, or the tappable
                collapsed row in a stacked history list. */}
            {alwaysOpen ? (
                // One line, mirroring the collection detail header: big date +
                // muted inline count. The kind lives in the nav bar above.
                <div className="px-4 pt-2 pb-3 max-sm:px-1 flex items-baseline gap-2 min-w-0">
                    <h1 className="min-w-0 truncate text-[22px] font-extrabold tracking-tight text-text">
                        {displayTitle}
                    </h1>
                    <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-text-muted tabular-nums">· {countLabel}</span>
                </div>
            ) : (
                <button
                    onClick={toggle}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[44px] hover:bg-card-hover transition-colors"
                    aria-expanded={expanded}
                >
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                        <Newspaper className="w-[18px] h-[18px] text-white" />
                    </div>
                    <div className="flex-grow min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">{kindLabel}</div>
                        <div className="text-[15px] font-bold text-text truncate">{displayTitle}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-text-muted mr-1">{countLabel}</span>
                        <ChevronDown
                            className={`w-5 h-5 text-text-secondary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                            style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                        />
                    </div>
                </button>
            )}

            {/* Expanded card list */}
            {isOpen && (
                <div
                    className={`px-4 pb-4 pt-3 border-t border-border ${alwaysOpen ? 'max-sm:px-1' : ''}`}
                    style={{ animation: 'slide-up 0.3s var(--ease-modal)' }}
                >
                    {/* Topics as tidy chips (facelift over the old comma string). */}
                    {digest.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {digest.topics.map((t) => (
                                <span key={t} dir="auto" className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Each card as its own bordered row — hairline dividers
                        weren't enough separation once rows carry a title, meta
                        line, AND a two-line summary (iOS inset-grouped feel on
                        the flat phone screen). */}
                    <div className="flex flex-col gap-2">
                        {digest.cards.map((card) => {
                            // Per-row direction so Hebrew titles read (and
                            // truncate) right-to-left instead of clipping into
                            // a leading "…"; the meta line stays LTR and just
                            // mirrors its alignment.
                            const isRtl = getDirection(card.title) === 'rtl';
                            const colorStyle = getCategoryColorStyle(card.category || 'General');
                            return (
                                <button
                                    key={card.id}
                                    onClick={() => openCard(card)}
                                    className="group w-full flex items-start gap-3 rounded-2xl border border-border-subtle bg-card px-3.5 py-3 text-left cursor-pointer transition-all hover:bg-card-hover hover:border-text-muted/40 active:scale-[0.99]"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div
                                            dir={isRtl ? 'rtl' : 'ltr'}
                                            className="text-sm font-semibold text-text group-hover:text-accent transition-colors truncate"
                                        >
                                            {card.title}
                                        </div>
                                        <div className={`mt-0.5 flex items-center gap-1.5 min-w-0 text-[11px] text-text-muted ${isRtl ? 'justify-end' : ''}`} dir="ltr">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorStyle.color }} aria-hidden />
                                            <span className="truncate">{[card.category, card.sourceName].filter(Boolean).join(' · ')}</span>
                                        </div>
                                        {card.summary && (
                                            <SimpleMarkdown
                                                inline
                                                content={card.summary}
                                                className="mt-1 block text-[13px] leading-relaxed text-text-secondary line-clamp-2"
                                            />
                                        )}
                                    </div>
                                    {card.thumbnailUrl && (
                                        <img
                                            src={card.thumbnailUrl}
                                            alt=""
                                            loading="lazy"
                                            className="w-14 h-14 mt-0.5 rounded-xl object-cover shrink-0 bg-fill-subtle"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Per-digest actions: jump to settings, remove this digest. */}
                    {(onOpenSettings || onDelete) && (
                        <div className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-4">
                            {onOpenSettings && (
                                <button
                                    onClick={onOpenSettings}
                                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-muted hover:text-accent transition-colors cursor-pointer"
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" /> Digest settings
                                </button>
                            )}
                            {onDelete && (
                                confirmDelete ? (
                                    <span className="ml-auto inline-flex items-center gap-3">
                                        <button
                                            onClick={() => onDelete(digest.id)}
                                            className="text-[12px] font-semibold text-red-500 hover:text-red-400 transition-colors cursor-pointer"
                                        >
                                            Delete digest
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(false)}
                                            className="text-[12px] font-semibold text-text-muted hover:text-text transition-colors cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDelete(true)}
                                        className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-muted hover:text-red-500 transition-colors cursor-pointer"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                )
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
