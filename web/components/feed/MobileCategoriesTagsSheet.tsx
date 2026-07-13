import type { Dispatch, SetStateAction } from 'react';
import { X, Tag as TagIcon, Shapes } from 'lucide-react';
import { getCategoryColorStyle } from '@/lib/colors';
import TagExplorer from '../TagExplorer';

/**
 * Categories & Tags Sheet (Mobile) — categories and the full tag tree live
 * together here, one tap from the home toolbar, so tags aren't buried inside the
 * Filters sheet. Extracted verbatim from Feed (R-3). Renders nothing when closed.
 */
export default function MobileCategoriesTagsSheet({
    isOpen,
    onClose,
    categories,
    selectedCategory,
    setSelectedCategory,
    categoryCounts,
    allTags,
    tagCounts,
    selectedTags,
    setSelectedTags,
    onToggleTag,
}: {
    isOpen: boolean;
    onClose: () => void;
    categories: string[];
    selectedCategory: Set<string>;
    setSelectedCategory: Dispatch<SetStateAction<Set<string>>>;
    categoryCounts: Record<string, number>;
    allTags: string[];
    tagCounts: Record<string, number>;
    selectedTags: Set<string>;
    setSelectedTags: Dispatch<SetStateAction<Set<string>>>;
    onToggleTag: (tag: string) => void;
}) {
    if (!isOpen) return null;
    return (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end isolate">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div className="relative bg-background rounded-t-3xl border-t border-border-subtle shadow-2xl px-5 pt-3 pb-8 max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30" />
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-text">Categories &amp; Tags</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Categories — chips breathe directly on the sheet. */}
                <div className="flex items-center justify-between mb-3">
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
                    {categories.map(cat => {
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

                {/* Tags — the same explorer used on desktop, flowing freely in
                    the sheet (no boxed container) so the tree can breathe.
                    A hairline divider separates it from Categories. */}
                {allTags.length > 0 && (
                    <div className="mt-6 pt-5 border-t border-border-subtle/60">
                        <div className="flex items-center justify-between mb-3">
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
                        <div className="max-h-[44vh] overflow-y-auto overscroll-contain -mx-1">
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

                <div className="flex items-center gap-3 pt-5">
                    {(selectedCategory.size + selectedTags.size) > 0 && (
                        <button
                            onClick={() => { setSelectedCategory(new Set()); setSelectedTags(new Set()); }}
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
    );
}
