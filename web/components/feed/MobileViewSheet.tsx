'use client';

import type { ReactNode } from 'react';
import { X, Check, LayoutGrid, StickyNote } from 'lucide-react';
import { useSheetDrag } from '@/lib/useSheetDrag';

/**
 * View Sheet (Mobile) — the header's view glyph opens this compact picker:
 * just the layouts (Card / List / Review / Graph) plus My Notes, one tap each.
 *
 * Split out of MobileDisplaySheet (2026-08-07 owner call): switching how you
 * look at the library is a first-class, high-frequency act — it earns the
 * header slot the Sources globe held, while Sources rejoined the Filters
 * sheet as the filter dimension it is. Display keeps sort + the utility rows.
 */
export default function MobileViewSheet({
    isOpen,
    onClose,
    viewModes,
    viewMode,
    setViewMode,
    onOpenNotes,
}: {
    isOpen: boolean;
    onClose: () => void;
    viewModes: { key: string; label: string; icon: ReactNode; hint: string }[];
    viewMode: string;
    setViewMode: (v: string) => void;
    /** Open the central My Notes view (routes through Feed so the full-library fetch fires). */
    onOpenNotes: () => void;
}) {
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose });
    if (!isOpen) return null;

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
                            <LayoutGrid className="w-4 h-4 text-text-muted" />
                            View
                        </h3>
                        <button
                            onClick={onClose}
                            aria-label="Close view options"
                            className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div role="radiogroup" aria-label="View mode" className="space-y-0.5">
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
                    <button
                        role="radio"
                        aria-checked={viewMode === 'notes'}
                        onClick={() => { onClose(); onOpenNotes(); }}
                        className={`${row} ${viewMode === 'notes' ? 'bg-accent/10 text-text' : 'text-text-secondary hover:bg-card-hover'}`}
                    >
                        <span className={viewMode === 'notes' ? 'text-accent' : 'text-text-muted'}><StickyNote className="w-4 h-4" /></span>
                        <span className="flex-1 font-medium">My notes</span>
                        {viewMode === 'notes' && <Check className="w-[18px] h-[18px] text-accent" strokeWidth={2.6} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
