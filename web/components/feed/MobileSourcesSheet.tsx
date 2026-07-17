'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { X, Search, Globe } from 'lucide-react';
import SourceFacetList from '../SourceFacetList';
import { sourceMatchesQuery, type SourceFacet } from '@/lib/source';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';

/**
 * Sources Sheet — the dedicated home for browsing by publisher / channel /
 * account, promoted out of the Filters panel to its own toolbar affordance.
 * Built for libraries with MANY sources: a search field up top narrows the
 * platform-grouped list (same alias matching search-by-source uses), and the
 * list itself is the existing SourceFacetList over `selectedSources`.
 * Responsive like the Filters sheet: drag-dismiss bottom sheet on phones,
 * centered modal on desktop.
 */
export default function MobileSourcesSheet({
    isOpen,
    onClose,
    sourceFacets,
    selectedSources,
    setSelectedSources,
    onToggleSource,
    onToggleSourceKeys,
}: {
    isOpen: boolean;
    onClose: () => void;
    sourceFacets: SourceFacet[];
    selectedSources: Set<string>;
    setSelectedSources: Dispatch<SetStateAction<Set<string>>>;
    onToggleSource: (key: string) => void;
    onToggleSourceKeys: (keys: string[]) => void;
}) {
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });
    const [query, setQuery] = useState('');
    if (!isOpen) return null;

    const visible = query.trim()
        ? sourceFacets.filter((f) => sourceMatchesQuery(f, query))
        : sourceFacets;

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4 isolate">
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div
                ref={sheetRef}
                className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300 sm:rounded-3xl sm:border sm:max-w-md sm:w-full sm:max-h-[70vh] sm:pb-6"
            >
                <div {...handleProps}>
                    <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="flex items-center gap-2 text-base font-bold text-text">
                            <Globe className="w-4 h-4 text-text-muted" />
                            Sources
                        </h3>
                        <div className="flex items-center gap-2">
                            {selectedSources.size > 0 && (
                                <button
                                    onClick={() => setSelectedSources(new Set())}
                                    className="text-[12px] font-semibold text-text-muted hover:text-accent transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                aria-label="Close sources"
                                className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="relative mb-3">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                        type="text"
                        dir="auto"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Find a source…"
                        className="w-full h-9 ps-9 pe-3 bg-card border border-border-subtle rounded-xl text-[14px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent"
                    />
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-soft -mx-1 px-1">
                    {visible.length > 0 ? (
                        <SourceFacetList
                            facets={visible}
                            selected={selectedSources}
                            onToggleKey={onToggleSource}
                            onToggleKeys={onToggleSourceKeys}
                        />
                    ) : (
                        <p className="text-[13px] text-text-muted px-2 py-6 text-center">No sources match &ldquo;{query}&rdquo;.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
