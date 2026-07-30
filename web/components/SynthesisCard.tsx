'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, X, Star, ArrowRight } from 'lucide-react';
import { WeeklySynthesis } from '@/lib/types';
import { synthesisWeekLabel } from '@/lib/synthesis';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/**
 * The weekly "What you learned" synthesis (M12), in two modes.
 *
 *  - In the FEED it's a collapsed banner; tapping expands the recap in place,
 *    and the X dismisses this week's banner (the write-up itself survives in
 *    the Digest archive — dismiss must never destroy).
 *  - In the DIGEST it renders `alwaysOpen`: a proper article header, no
 *    chevron, no dismiss, because reaching it was already a deliberate choice.
 *
 * Layout contract (owner QA): this is long-form prose, so the body is capped at
 * a reading measure (~62ch) and CENTERED rather than filling a 1700px desktop
 * pane. Everything else — themes, standout, question — sits in that same column
 * so the eye returns to one left edge.
 *
 * The synthesis text itself is written server-side (functions/digest_service.py
 * → ai_service.synthesize_week); this component only presents it.
 */
export default function SynthesisCard({
    synthesis,
    onOpenCard,
    onDismiss,
    alwaysOpen = false,
}: {
    synthesis: WeeklySynthesis;
    onOpenCard: (id: string) => void;
    /** Feed only — omit in the archive, where there is nothing to dismiss. */
    onDismiss?: () => void;
    /** Skip the collapse chrome and render the full recap (Digest reader). */
    alwaysOpen?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const open = alwaysOpen || expanded;

    const cardById = new Map(synthesis.cards.map((c) => [c.id, c]));
    const standout = synthesis.standoutCardId ? cardById.get(synthesis.standoutCardId) : undefined;
    const paragraphs = synthesis.narrative.split('\n').map((p) => p.trim()).filter(Boolean);
    const weekLabel = synthesisWeekLabel(synthesis);
    const savesLabel = `${synthesis.cardCount} ${synthesis.cardCount === 1 ? 'save' : 'saves'}`;

    const toggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        hapticMedium();
        onDismiss?.();
    };

    const openCard = (id: string) => {
        hapticLight();
        onOpenCard(id);
    };

    /** One card reference, wherever it appears. Deliberately NOT accent-colored:
     *  a theme with six links became a wall of blue: the arrow carries the
     *  affordance and the accent arrives on hover. */
    const CardLink = ({ id, title }: { id: string; title: string }) => (
        <button
            onClick={() => openCard(id)}
            className="group flex w-full items-start gap-2 py-1 text-start text-[14.5px] leading-relaxed text-text-secondary hover:text-accent transition-colors min-h-[30px]"
        >
            <ArrowRight className="mt-[5px] w-3.5 h-3.5 shrink-0 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
            <span dir="auto">{title}</span>
        </button>
    );

    return (
        <div className="mb-4 rounded-2xl border border-accent/25 bg-card overflow-hidden shadow-lg shadow-accent/5 animate-in fade-in slide-in-from-top-1 duration-300">
            {/* Header. In the feed it's the collapse toggle; in the archive it's
                a static masthead for the piece. */}
            {alwaysOpen ? (
                <div className="px-4 pt-5 pb-4 sm:px-6">
                    <div className="mx-auto w-full max-w-[62ch]">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                            <Sparkles className="w-3.5 h-3.5" />
                            This week in Machina
                        </div>
                        <h2 dir="auto" className="mt-2 text-[22px] sm:text-[26px] font-bold text-text leading-tight tracking-[-0.01em]">
                            {synthesis.title}
                        </h2>
                        <div className="mt-1.5 text-[13px] text-text-muted">
                            {weekLabel ? `${weekLabel} · ${savesLabel}` : savesLabel}
                        </div>
                    </div>
                </div>
            ) : (
                <button
                    onClick={toggle}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[44px] hover:bg-card-hover transition-colors"
                    aria-expanded={expanded}
                >
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                        <Sparkles className="w-[18px] h-[18px] text-accent-ink" />
                    </div>
                    <div className="flex-grow min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                            This week in Machina
                        </div>
                        <div dir="auto" className="text-[15px] font-bold text-text truncate">
                            {synthesis.title}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="hidden sm:block text-xs text-text-muted mr-1">{savesLabel}</span>
                        {onDismiss && (
                            <button
                                onClick={handleDismiss}
                                aria-label="Dismiss weekly recap"
                                title="Hide from the feed — it stays in your Digest"
                                className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <ChevronDown
                            className={`w-5 h-5 text-text-secondary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                            style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                        />
                    </div>
                </button>
            )}

            {open && (
                <div
                    className={`px-4 pb-6 sm:px-6 ${alwaysOpen ? '' : 'pt-4 border-t border-border'}`}
                    style={alwaysOpen ? undefined : { animation: 'slide-up 0.3s var(--ease-modal)' }}
                >
                    <div className="mx-auto w-full max-w-[62ch]">
                        {/* Narrative. The opening paragraph is the lead — a
                            notch larger, so the piece has a way in. */}
                        {paragraphs.map((p, i) => (
                            <p
                                key={i}
                                dir="auto"
                                className={
                                    i === 0
                                        ? 'text-[16px] leading-[1.7] text-text'
                                        : 'mt-4 text-[15px] leading-[1.75] text-text-secondary'
                                }
                            >
                                {p}
                            </p>
                        ))}

                        {synthesis.themes.map((theme, i) => (
                            <section key={i} className="mt-8 pt-6 border-t border-border-subtle first:border-t-0">
                                <h3 dir="auto" className="text-[17px] font-bold text-text leading-snug tracking-[-0.01em]">
                                    {theme.title}
                                </h3>
                                {theme.insight && (
                                    <p dir="auto" className="mt-1.5 text-[15px] leading-[1.7] text-text-secondary">
                                        {theme.insight}
                                    </p>
                                )}
                                <div className="mt-3 flex flex-col ps-0.5">
                                    {theme.cardIds.map((id) => {
                                        const c = cardById.get(id);
                                        if (!c) return null;
                                        return <CardLink key={id} id={id} title={c.title} />;
                                    })}
                                </div>
                            </section>
                        ))}

                        {standout && (
                            <button
                                onClick={() => openCard(standout.id)}
                                className="mt-8 w-full text-start rounded-2xl border border-border bg-card-hover px-5 py-4 hover:border-accent/40 transition-colors"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                                    <Star className="w-3.5 h-3.5" /> Standout
                                </div>
                                <div dir="auto" className="mt-1.5 text-[15.5px] font-bold text-text leading-snug">
                                    {standout.title}
                                </div>
                                {synthesis.standoutReason && (
                                    <div dir="auto" className="mt-1 text-[14.5px] leading-[1.7] text-text-secondary">
                                        {synthesis.standoutReason}
                                    </div>
                                )}
                            </button>
                        )}

                        {synthesis.openQuestion && (
                            <div className="mt-4 rounded-2xl bg-card-hover px-5 py-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                                    Worth sitting with
                                </div>
                                <div dir="auto" className="mt-1.5 text-[15.5px] leading-[1.7] text-text italic">
                                    {synthesis.openQuestion}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
