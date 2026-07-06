'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, X, Star, ArrowRight } from 'lucide-react';
import { WeeklySynthesis } from '@/lib/types';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/**
 * The weekly "What you learned" synthesis, surfaced in-app as a special feed
 * card (M12). Collapsed it's a single calm banner; tapping expands into the
 * narrative recap — themes, a standout, an open question — each linking back to
 * the source cards. Dismissible; the expand uses the shared --ease-modal curve
 * (M-P2) and fires a light haptic (M11) so it feels native.
 *
 * The synthesis text itself is written server-side (functions/digest_service.py
 * → ai_service.synthesize_week); this component only presents it.
 */
export default function SynthesisCard({
    synthesis,
    onOpenCard,
    onDismiss,
}: {
    synthesis: WeeklySynthesis;
    onOpenCard: (id: string) => void;
    onDismiss: () => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const cardById = new Map(synthesis.cards.map((c) => [c.id, c]));
    const standout = synthesis.standoutCardId ? cardById.get(synthesis.standoutCardId) : undefined;
    const paragraphs = synthesis.narrative.split('\n').map((p) => p.trim()).filter(Boolean);

    const toggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        hapticMedium();
        onDismiss();
    };

    const openCard = (id: string) => {
        hapticLight();
        onOpenCard(id);
    };

    return (
        <div className="mb-4 rounded-2xl border border-accent/25 bg-card overflow-hidden shadow-lg shadow-accent/5 animate-in fade-in slide-in-from-top-1 duration-300">
            {/* Header — always visible, toggles the recap */}
            <button
                onClick={toggle}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[44px] hover:bg-card-hover transition-colors"
                aria-expanded={expanded}
            >
                <div className="w-9 h-9 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                    <Sparkles className="w-[18px] h-[18px] text-white-fixed" />
                </div>
                <div className="flex-grow min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                        This week in Machina
                    </div>
                    <div className="text-[15px] font-bold text-text truncate">
                        {synthesis.title}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <span className="hidden sm:block text-xs text-text-muted mr-1">
                        {synthesis.cardCount} {synthesis.cardCount === 1 ? 'save' : 'saves'}
                    </span>
                    <button
                        onClick={handleDismiss}
                        aria-label="Dismiss weekly recap"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <ChevronDown
                        className={`w-5 h-5 text-text-secondary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                        style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                    />
                </div>
            </button>

            {/* Expanded recap */}
            {expanded && (
                <div
                    className="px-4 pb-4 pt-1 border-t border-border"
                    style={{ animation: 'slide-up 0.3s var(--ease-modal)' }}
                >
                    {paragraphs.map((p, i) => (
                        <p key={i} className="text-sm leading-relaxed text-text-secondary mb-3">
                            {p}
                        </p>
                    ))}

                    {synthesis.themes.map((theme, i) => (
                        <div key={i} className="mt-4">
                            <div className="text-sm font-bold text-text">{theme.title}</div>
                            {theme.insight && (
                                <div className="mt-1 text-sm leading-relaxed text-text-secondary">
                                    {theme.insight}
                                </div>
                            )}
                            <div className="mt-2 flex flex-col gap-1">
                                {theme.cardIds.map((id) => {
                                    const c = cardById.get(id);
                                    if (!c) return null;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => openCard(id)}
                                            className="group flex items-center gap-1.5 text-left text-sm text-accent hover:underline min-h-[28px]"
                                        >
                                            <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                                            <span className="truncate">{c.title}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {standout && (
                        <button
                            onClick={() => openCard(standout.id)}
                            className="mt-4 w-full text-left rounded-xl border border-border bg-card-hover px-4 py-3 hover:border-accent/40 transition-colors"
                        >
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                                <Star className="w-3.5 h-3.5" /> Standout
                            </div>
                            <div className="mt-1 text-sm font-bold text-text truncate">{standout.title}</div>
                            {synthesis.standoutReason && (
                                <div className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                                    {synthesis.standoutReason}
                                </div>
                            )}
                        </button>
                    )}

                    {synthesis.openQuestion && (
                        <div className="mt-4 rounded-xl bg-card-hover px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                                Worth sitting with
                            </div>
                            <div className="mt-1 text-sm leading-relaxed text-text italic">
                                {synthesis.openQuestion}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
