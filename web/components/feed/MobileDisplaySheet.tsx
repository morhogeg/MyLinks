'use client';

import { X, Check, Filter, CheckSquare, SlidersHorizontal } from 'lucide-react';
import { useSheetDrag } from '@/lib/useSheetDrag';
import type { SortType } from '@/lib/useFeedFilters';

/**
 * Display Sheet (Mobile) — the header's sliders affordance, Files-app style:
 * sort as a radio section, then the low-frequency actions (the full Filter
 * panel, multi-select) as plain rows. The View section moved to its own
 * header glyph + MobileViewSheet (2026-08-07): switching layouts is the
 * higher-frequency act and earned the header slot Sources held.
 */
export default function MobileDisplaySheet({
    isOpen,
    onClose,
    sortOptions,
    sortBy,
    setSortBy,
    onOpenFilters,
    onSelectCards,
}: {
    isOpen: boolean;
    onClose: () => void;
    sortOptions: { value: string; label: string }[];
    sortBy: SortType;
    setSortBy: (v: SortType) => void;
    /** Open the full Filters sheet (status / categories / tags / sources). */
    onOpenFilters: () => void;
    onSelectCards: () => void;
}) {
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose });
    if (!isOpen) return null;

    const sectionLabel = 'block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5';
    const row = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] text-start transition-colors cursor-pointer';

    return (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end isolate">
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div
                ref={sheetRef}
                className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 animate-in slide-in-from-bottom duration-300"
            >
                <div {...handleProps}>
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="flex items-center gap-2 text-base font-bold text-text">
                            <SlidersHorizontal className="w-4 h-4 text-text-muted" />
                            Display
                        </h3>
                        <button
                            onClick={onClose}
                            aria-label="Close display options"
                            className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <label className={sectionLabel}>Sort</label>
                <div role="radiogroup" aria-label="Sort order" className="space-y-0.5 mb-4">
                    {sortOptions.map((o) => {
                        const active = sortBy === o.value;
                        return (
                            <button
                                key={o.value}
                                role="radio"
                                aria-checked={active}
                                onClick={() => { setSortBy(o.value as SortType); onClose(); }}
                                className={`${row} ${active ? 'bg-accent/10 text-text' : 'text-text-secondary hover:bg-card-hover'}`}
                            >
                                <span className="flex-1 font-medium">{o.label}</span>
                                {active && <Check className="w-[18px] h-[18px] text-accent" strokeWidth={2.6} />}
                            </button>
                        );
                    })}
                </div>

                <div className="h-px bg-border-subtle mb-2" />
                <button onClick={() => { onClose(); onOpenFilters(); }} className={`${row} text-text-secondary hover:bg-card-hover`}>
                    <Filter className="w-[18px] h-[18px] text-text-muted" />
                    <span className="flex-1 font-medium">Filter…</span>
                </button>
                <button onClick={() => { onClose(); onSelectCards(); }} className={`${row} text-text-secondary hover:bg-card-hover`}>
                    <CheckSquare className="w-[18px] h-[18px] text-text-muted" />
                    <span className="flex-1 font-medium">Select cards</span>
                </button>
            </div>
        </div>
    );
}
