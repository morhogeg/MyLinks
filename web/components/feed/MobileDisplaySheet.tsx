'use client';

import type { ReactNode } from 'react';
import { X, Check, Filter, CheckSquare, SlidersHorizontal } from 'lucide-react';
import { useSheetDrag } from '@/lib/useSheetDrag';
import type { SortType } from '@/lib/useFeedFilters';

/**
 * Display Sheet (Mobile) — the header's ⋯ affordance, Files-app style: view
 * mode and sort as radio sections, then the low-frequency actions (the full
 * Filter panel, multi-select) as plain rows. Consolidating these here is what
 * lets the home screen run on a single line of chrome.
 */
export default function MobileDisplaySheet({
    isOpen,
    onClose,
    viewModes,
    viewMode,
    setViewMode,
    sortOptions,
    sortBy,
    setSortBy,
    onOpenFilters,
    onSelectCards,
}: {
    isOpen: boolean;
    onClose: () => void;
    viewModes: { key: string; label: string; icon: ReactNode; hint: string }[];
    viewMode: string;
    setViewMode: (v: string) => void;
    sortOptions: { value: string; label: string }[];
    sortBy: SortType;
    setSortBy: (v: SortType) => void;
    /** Open the full Filters sheet (status / categories / tags). */
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

                <label className={sectionLabel}>View</label>
                <div role="radiogroup" aria-label="View mode" className="space-y-0.5 mb-4">
                    {viewModes.map((vm) => {
                        const active = viewMode === vm.key;
                        return (
                            <button
                                key={vm.key}
                                role="radio"
                                aria-checked={active}
                                onClick={() => { setViewMode(vm.key); onClose(); }}
                                className={`${row} ${active ? 'bg-accent/10 text-text' : 'text-text-secondary hover:bg-card-hover'}`}
                            >
                                <span className={active ? 'text-accent' : 'text-text-muted'}>{vm.icon}</span>
                                <span className="flex-1 font-medium">{vm.hint}</span>
                                {active && <Check className="w-[18px] h-[18px] text-accent" strokeWidth={2.6} />}
                            </button>
                        );
                    })}
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
