'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { X, ArrowUpDown } from 'lucide-react';
import Dropdown, { type DropdownOption } from '../Dropdown';
import SourceFacetList from '../SourceFacetList';
import { useSheetDrag } from '@/lib/useSheetDrag';
import type { SourceFacet } from '@/lib/source';
import type { FilterType, SortType } from '@/lib/useFeedFilters';

/**
 * Filters Sheet (Mobile) — consolidates the grid controls (status, sort, sources)
 * behind one tap, keeping the mobile toolbar to a single tidy row. Desktop is
 * untouched. Extracted verbatim from Feed (R-3). Renders nothing when closed.
 */
export default function MobileFiltersSheet({
    isOpen,
    onClose,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    statusTriggerIcon,
    statusOptions,
    sortOptions,
    sourceFacets,
    selectedSources,
    setSelectedSources,
    onToggleSource,
    onToggleSourceKeys,
    activeMobileFilters,
    setSelectedTags,
}: {
    isOpen: boolean;
    onClose: () => void;
    filter: FilterType;
    setFilter: Dispatch<SetStateAction<FilterType>>;
    sortBy: SortType;
    setSortBy: Dispatch<SetStateAction<SortType>>;
    statusTriggerIcon: ReactNode;
    statusOptions: DropdownOption[];
    sortOptions: DropdownOption[];
    sourceFacets: SourceFacet[];
    selectedSources: Set<string>;
    setSelectedSources: Dispatch<SetStateAction<Set<string>>>;
    onToggleSource: (key: string) => void;
    onToggleSourceKeys: (keys: string[]) => void;
    activeMobileFilters: number;
    setSelectedTags: Dispatch<SetStateAction<Set<string>>>;
}) {
    // Bottom sheet at every width it renders (mobile only), so drag is always on.
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
                className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            >
                <div {...handleProps}>
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-bold text-text">Filters</h3>
                        <button
                            onClick={onClose}
                            aria-label="Close filters"
                            className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="space-y-5">
                    {/* Status + Sort */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Show</label>
                            <Dropdown
                                ariaLabel="Filter by status"
                                value={filter}
                                onChange={(v) => setFilter(v as FilterType)}
                                leadingIcon={statusTriggerIcon}
                                options={statusOptions}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Sort</label>
                            <Dropdown
                                ariaLabel="Sort order"
                                value={sortBy}
                                onChange={(v) => setSortBy(v as SortType)}
                                leadingIcon={<ArrowUpDown className="w-4 h-4 text-text-secondary" />}
                                options={sortOptions}
                            />
                        </div>
                    </div>

                    {/* Sources — the grouped source list (platform → account).
                        Replaces the old redundant row of platform icons; the
                        Screenshots bucket is included in the list. */}
                    {sourceFacets.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Sources</label>
                                {selectedSources.size > 0 && (
                                    <button
                                        onClick={() => setSelectedSources(new Set())}
                                        className="text-[11px] font-semibold text-text-muted hover:text-accent transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="max-h-[38vh] overflow-y-auto overscroll-contain -mx-1 px-1">
                                <SourceFacetList
                                    facets={sourceFacets}
                                    selected={selectedSources}
                                    onToggleKey={onToggleSource}
                                    onToggleKeys={onToggleSourceKeys}
                                />
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center gap-3 pt-1">
                        {activeMobileFilters > 0 && (
                            <button
                                onClick={() => { setFilter('all'); setSelectedSources(new Set()); setSelectedTags(new Set()); }}
                                className="text-sm font-semibold text-text-muted hover:text-accent transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="ms-auto px-6 h-10 rounded-full bg-accent text-white font-semibold text-sm shadow-sm hover:bg-accent-hover transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
