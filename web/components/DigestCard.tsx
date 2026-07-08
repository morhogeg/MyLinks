'use client';

import { useState } from 'react';
import { Newspaper, ChevronDown, ArrowRight } from 'lucide-react';
import { CuratedDigest, DigestCardRef } from '@/lib/types';
import { hapticLight } from '@/lib/haptics';
import SimpleMarkdown from './SimpleMarkdown';

const MODE_LABEL: Record<string, string> = {
    smart: 'Smart mix',
    unread: 'Backlog',
    rediscover: 'Rediscover',
    random: 'Surprise me',
    topic: 'By topic',
    favorites: 'Favorites',
};

function formatDate(ms: number): string {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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
}: {
    digest: CuratedDigest;
    defaultExpanded?: boolean;
    /** Pinned open with no collapse chrome — for the desktop reading pane. */
    alwaysOpen?: boolean;
    onOpenCard: (card: DigestCardRef) => void;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const isOpen = alwaysOpen || expanded;

    const toggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const openCard = (card: DigestCardRef) => {
        hapticLight();
        onOpenCard(card);
    };

    const modeLabel = digest.topics.length
        ? digest.topics.join(', ')
        : (MODE_LABEL[digest.mode] ?? 'Smart mix');

    const headerInner = (
        <>
            <div className="w-9 h-9 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                <Newspaper className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="flex-grow min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                    {formatDate(digest.createdAt)} · {modeLabel}
                </div>
                <div className="text-[15px] font-bold text-text truncate">
                    {digest.title}
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-text-muted mr-1">
                    {digest.cardCount} {digest.cardCount === 1 ? 'card' : 'cards'}
                </span>
                {!alwaysOpen && (
                    <ChevronDown
                        className={`w-5 h-5 text-text-secondary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                        style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                    />
                )}
            </div>
        </>
    );

    return (
        <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden">
            {/* Header — toggles the list, or a static header in the reading pane */}
            {alwaysOpen ? (
                <div className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[44px]">{headerInner}</div>
            ) : (
                <button
                    onClick={toggle}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[44px] hover:bg-card-hover transition-colors"
                    aria-expanded={expanded}
                >
                    {headerInner}
                </button>
            )}

            {/* Expanded card list */}
            {isOpen && (
                <div
                    className="px-4 pb-4 pt-1 border-t border-border"
                    style={{ animation: 'slide-up 0.3s var(--ease-modal)' }}
                >
                    <div className="flex flex-col divide-y divide-border-subtle">
                        {digest.cards.map((card) => (
                            <button
                                key={card.id}
                                onClick={() => openCard(card)}
                                className="group flex items-start gap-2.5 py-3 text-left"
                            >
                                <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-1 text-accent opacity-70 group-hover:translate-x-0.5 transition-transform" />
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-text group-hover:text-accent transition-colors truncate">
                                        {card.title}
                                    </div>
                                    <div className="text-[11px] text-text-muted">
                                        {[card.category, card.sourceName].filter(Boolean).join(' · ')}
                                    </div>
                                    {card.summary && (
                                        <SimpleMarkdown
                                            inline
                                            content={card.summary}
                                            className="mt-0.5 text-[13px] leading-relaxed text-text-secondary line-clamp-2"
                                        />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
