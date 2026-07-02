'use client';

import { useMemo, useState } from 'react';
import { WeeklySynthesis } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { hapticLight } from '@/lib/haptics';
import { Sparkles, X, ChevronDown, ArrowRight, Star, HelpCircle } from 'lucide-react';

/**
 * M12 — Weekly "What you learned" synthesis, surfaced in-app as a special card.
 *
 * The narrative recap itself is written server-side (functions/digest_service.py
 * via ai_service.synthesize_week) and stored on the user doc under
 * `latestSynthesis`; the feed subscribes to it and hands it here. This is meant
 * to read like a thoughtful recap — a throughline, a few themes, one standout,
 * and an open question — with every part linking back to the source cards.
 *
 * Collapsed, it's a single calm card with the throughline; tapping expands the
 * full recap (the screenshot-and-forward moment). Dismissible per recap so a
 * new week's synthesis surfaces again.
 */

const DISMISS_KEY = 'machina.synthesis.dismissed';

function loadDismissedAt(): number {
    if (typeof window === 'undefined') return 0;
    try {
        return Number(window.localStorage.getItem(DISMISS_KEY) || 0) || 0;
    } catch {
        return 0;
    }
}

interface WeeklySynthesisCardProps {
    synthesis: WeeklySynthesis;
    onOpenLink: (id: string) => void;
}

export default function WeeklySynthesisCard({ synthesis, onOpenLink }: WeeklySynthesisCardProps) {
    const [dismissedAt, setDismissedAt] = useState<number>(loadDismissedAt);
    const [expanded, setExpanded] = useState(false);

    const titleById = useMemo(() => {
        const map = new Map<string, { title: string; category: string }>();
        for (const c of synthesis.cards ?? []) {
            map.set(c.id, { title: c.title, category: c.category });
        }
        return map;
    }, [synthesis.cards]);

    // Hide a recap the user has already dismissed (compare by generation time).
    if (!synthesis.narrative && (synthesis.themes?.length ?? 0) === 0) return null;
    if (synthesis.generatedAt && synthesis.generatedAt <= dismissedAt) return null;

    const handleToggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        hapticLight();
        const at = synthesis.generatedAt || Date.now();
        setDismissedAt(at);
        try {
            window.localStorage.setItem(DISMISS_KEY, String(at));
        } catch {
            /* best-effort */
        }
    };

    const handleOpen = (id: string) => {
        hapticLight();
        onOpenLink(id);
    };

    // A tappable reference to a source card. Kept as a render helper (not a
    // nested component) so its state isn't reset on every parent render.
    const renderCardLink = (id: string) => {
        const ref = titleById.get(id);
        if (!ref) return null;
        const color = getCategoryColorStyle(ref.category);
        return (
            <button
                key={id}
                type="button"
                onClick={() => handleOpen(id)}
                className="group flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-accent/20 transition-all cursor-pointer"
            >
                <span
                    className="shrink-0 w-1.5 self-stretch rounded-full"
                    style={{ backgroundColor: color.backgroundColor }}
                    aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-text-secondary group-hover:text-text transition-colors truncate">
                    {ref.title}
                </span>
                <ArrowRight className="shrink-0 w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
        );
    };

    const standout = synthesis.standoutCardId ? titleById.get(synthesis.standoutCardId) : null;

    return (
        <div className="mb-4 rounded-2xl border border-accent/25 bg-[linear-gradient(135deg,rgba(167,139,250,0.12),rgba(236,72,153,0.07))] surface-card shadow-[var(--shadow-card)] overflow-hidden animate-fade-in">
            {/* Header — the throughline; the whole row toggles the recap. */}
            <button
                type="button"
                onClick={handleToggle}
                aria-expanded={expanded}
                className="w-full flex items-start gap-3 px-4 py-4 text-left cursor-pointer"
            >
                <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[image:var(--accent-gradient)] shadow-lg shadow-accent/20">
                    <Sparkles className="w-[18px] h-[18px] text-white" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-accent/80">
                        This week
                    </span>
                    <span className="block text-[15px] font-semibold text-text leading-snug">
                        What you learned this week
                    </span>
                    {synthesis.narrative && (
                        <span className={`block text-[13px] text-text-secondary leading-relaxed mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
                            {synthesis.narrative}
                        </span>
                    )}
                </span>
                <ChevronDown
                    className={`shrink-0 w-5 h-5 text-text-muted transition-transform duration-300 [transition-timing-function:var(--ease-modal)] ${expanded ? 'rotate-180' : ''}`}
                />
                <span
                    role="button"
                    tabIndex={0}
                    aria-label="Dismiss this recap"
                    onClick={handleDismiss}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDismiss(e as unknown as React.MouseEvent); }}
                    className="shrink-0 flex items-center justify-center w-8 h-8 -mr-1 rounded-full text-text-muted hover:text-text hover:bg-white/10 transition-colors cursor-pointer"
                >
                    <X className="w-4 h-4" />
                </span>
            </button>

            {/* Full recap. Uses the shared --ease-modal curve (via .animate-slide-up)
                so the reveal matches the app's modal motion language (M-P2). */}
            {expanded && (
                <div className="px-4 pb-4 pt-0 animate-slide-up space-y-5">
                    {/* Themes */}
                    {(synthesis.themes ?? []).map((theme, i) => (
                        <div key={i} className="border-t border-white/5 pt-4 first:border-t-0 first:pt-0">
                            <h4 className="text-sm font-bold text-text mb-1">{theme.title}</h4>
                            {theme.insight && (
                                <p className="text-[13px] text-text-secondary leading-relaxed mb-2.5">{theme.insight}</p>
                            )}
                            <div className="flex flex-col gap-1.5">
                                {theme.cardIds.map((id) => renderCardLink(id))}
                            </div>
                        </div>
                    ))}

                    {/* Standout */}
                    {standout && synthesis.standoutCardId && (
                        <div className="rounded-xl bg-white/[0.04] border border-white/5 p-3.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-yellow-400/90 mb-2">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                Standout of the week
                            </div>
                            {renderCardLink(synthesis.standoutCardId)}
                            {synthesis.standoutWhy && (
                                <p className="text-[13px] text-text-secondary leading-relaxed mt-2">{synthesis.standoutWhy}</p>
                            )}
                        </div>
                    )}

                    {/* Open question */}
                    {synthesis.openQuestion && (
                        <div className="border-t border-white/5 pt-4">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
                                <HelpCircle className="w-3.5 h-3.5" />
                                To explore next
                            </div>
                            <p className="text-sm text-text italic leading-relaxed">{synthesis.openQuestion}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
