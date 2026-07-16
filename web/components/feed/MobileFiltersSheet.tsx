'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { X, Tag as TagIcon, Shapes } from 'lucide-react';
import Dropdown, { type DropdownOption } from '../Dropdown';
import SourceFacetList from '../SourceFacetList';
import TagExplorer from '../TagExplorer';
import { getCategoryColorStyle } from '@/lib/colors';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import type { SourceFacet } from '@/lib/source';
import type { FilterType } from '@/lib/useFeedFilters';

/**
 * Filters Sheet — the single "Filter" affordance behind the home toolbar. Holds
 * everything that narrows the library: status (Show), categories, tags, and
 * sources, so the toolbar shows ONE well-labelled control instead of a scatter
 * of filter buttons. Responsive: a drag-to-dismiss bottom sheet on phones, a
 * centered modal on desktop. The Tags section hides at `lg` where the desktop
 * Tag Explorer sidebar already covers it. Renders nothing when closed.
 */
export default function MobileFiltersSheet({
    isOpen,
    onClose,
    filter,
    setFilter,
    statusTriggerIcon,
    statusOptions,
    sourceFacets,
    selectedSources,
    setSelectedSources,
    onToggleSource,
    onToggleSourceKeys,
    activeMobileFilters,
    setSelectedTags,
    categories,
    selectedCategory,
    setSelectedCategory,
    categoryCounts,
    allTags,
    tagCounts,
    selectedTags,
    onToggleTag,
}: {
    isOpen: boolean;
    onClose: () => void;
    filter: FilterType;
    /** Routed through Feed's handleFilterSelect so 'private' stays PIN-gated. */
    setFilter: (filter: FilterType) => void;
    statusTriggerIcon: ReactNode;
    statusOptions: DropdownOption[];
    sourceFacets: SourceFacet[];
    selectedSources: Set<string>;
    setSelectedSources: Dispatch<SetStateAction<Set<string>>>;
    onToggleSource: (key: string) => void;
    onToggleSourceKeys: (keys: string[]) => void;
    activeMobileFilters: number;
    setSelectedTags: Dispatch<SetStateAction<Set<string>>>;
    categories: string[];
    selectedCategory: Set<string>;
    setSelectedCategory: Dispatch<SetStateAction<Set<string>>>;
    categoryCounts: Record<string, number>;
    allTags: string[];
    tagCounts: Record<string, number>;
    selectedTags: Set<string>;
    onToggleTag: (tag: string) => void;
}) {
    // Bottom sheet on phones (drag-to-dismiss), centered modal on desktop (no drag).
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4 isolate">
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div
                ref={sheetRef}
                className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 sm:rounded-3xl sm:border sm:max-w-lg sm:w-full sm:max-h-[80vh] sm:pb-6"
            >
                <div {...handleProps}>
                <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
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
                    {/* Show (status) — the primary lens (unread/favorites/archived/…),
                        so it leads the drawer. Sort has its own sheet (sort chip). */}
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

                    {/* Categories — chips breathe directly on the sheet. */}
                    {categories.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                                    <Shapes className="w-3.5 h-3.5 text-accent/70" /> Categories
                                </span>
                                {selectedCategory.size > 0 && (
                                    <button
                                        onClick={() => setSelectedCategory(new Set())}
                                        className="text-[11px] font-semibold text-text-muted hover:text-accent transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedCategory(new Set())}
                                    className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${selectedCategory.size === 0
                                        ? 'bg-accent text-white border-accent shadow-sm'
                                        : 'bg-card border-border-subtle text-text-secondary hover:border-text-muted/40 hover:text-text'
                                        }`}
                                >
                                    All
                                </button>
                                {categories.map((cat) => {
                                    const isSelected = selectedCategory.has(cat);
                                    const colorStyle = getCategoryColorStyle(cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => {
                                                const next = new Set(selectedCategory);
                                                if (isSelected) next.delete(cat); else next.add(cat);
                                                setSelectedCategory(next);
                                            }}
                                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${isSelected
                                                ? 'shadow-sm'
                                                : 'bg-card border-border-subtle text-text-secondary hover:border-text-muted/40 hover:text-text'
                                                }`}
                                            style={isSelected ? {
                                                backgroundColor: colorStyle.backgroundColor,
                                                color: colorStyle.color,
                                                borderColor: colorStyle.backgroundColor,
                                            } : undefined}
                                        >
                                            {cat}
                                            <span className="opacity-50 font-medium tabular-nums">{categoryCounts[cat]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tags — the same explorer used on desktop, flowing freely. Hidden
                        at lg, where the desktop Tag Explorer sidebar already owns tags. */}
                    {allTags.length > 0 && (
                        <div className="lg:hidden">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                                    <TagIcon className="w-3.5 h-3.5 text-accent/70" /> Tags
                                    {selectedTags.size > 0 && (
                                        <span className="text-accent normal-case tracking-normal font-semibold">· {selectedTags.size} selected</span>
                                    )}
                                </span>
                                {selectedTags.size > 0 && (
                                    <button
                                        onClick={() => setSelectedTags(new Set())}
                                        className="text-[11px] font-semibold text-text-muted hover:text-accent transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="max-h-[38vh] overflow-y-auto overscroll-contain -mx-1">
                                <TagExplorer
                                    tags={allTags}
                                    tagCounts={tagCounts}
                                    selectedTags={selectedTags}
                                    onToggleTag={onToggleTag}
                                    onClearFilters={() => setSelectedTags(new Set())}
                                    variant="embedded"
                                    className="px-1"
                                />
                            </div>
                        </div>
                    )}

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
                                onClick={() => { setFilter('all'); setSelectedSources(new Set()); setSelectedTags(new Set()); setSelectedCategory(new Set()); }}
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
