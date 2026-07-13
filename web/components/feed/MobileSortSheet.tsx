'use client';

import { X, Check, ArrowUpDown } from 'lucide-react';
import { useSheetDrag } from '@/lib/useSheetDrag';
import type { SortType } from '@/lib/useFeedFilters';

/**
 * Sort Sheet (Mobile) — the designated home for the library's sort order,
 * opened from the sort chip in the home toolbar. A single-choice radio list;
 * picking an option applies it and closes the sheet. Same bottom-sheet
 * grammar as the rest of the app: grab handle, drag-to-dismiss, X.
 */
export default function MobileSortSheet({
    isOpen,
    onClose,
    sortBy,
    setSortBy,
    sortOptions,
}: {
    isOpen: boolean;
    onClose: () => void;
    sortBy: SortType;
    setSortBy: (v: SortType) => void;
    sortOptions: { value: string; label: string }[];
}) {
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose });
    if (!isOpen) return null;
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
                            <ArrowUpDown className="w-4 h-4 text-text-muted" />
                            Sort by
                        </h3>
                        <button
                            onClick={onClose}
                            aria-label="Close sort"
                            className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div role="radiogroup" aria-label="Sort order" className="space-y-1">
                    {sortOptions.map((o) => {
                        const active = sortBy === o.value;
                        return (
                            <button
                                key={o.value}
                                role="radio"
                                aria-checked={active}
                                onClick={() => { setSortBy(o.value as SortType); onClose(); }}
                                className={`w-full flex items-center justify-between gap-2 px-4 h-11 rounded-2xl text-[15px] font-semibold transition-colors cursor-pointer ${active
                                    ? 'text-accent bg-accent/10'
                                    : 'text-text-secondary hover:text-text hover:bg-card-hover'
                                    }`}
                            >
                                <span>{o.label}</span>
                                {active && <Check className="w-4 h-4" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
