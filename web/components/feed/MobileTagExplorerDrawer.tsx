import { X, Tag as TagIcon } from 'lucide-react';
import TagExplorer from '../TagExplorer';

/**
 * Mobile Tag Explorer drawer (tablet ≥sm, <lg). Extracted verbatim from Feed
 * (R-3). Renders nothing when closed.
 */
export default function MobileTagExplorerDrawer({
    isOpen,
    onClose,
    tags,
    tagCounts,
    selectedTags,
    onToggleTag,
    onClearFilters,
}: {
    isOpen: boolean;
    onClose: () => void;
    tags: string[];
    tagCounts: Record<string, number>;
    selectedTags: Set<string>;
    onToggleTag: (tag: string) => void;
    onClearFilters: () => void;
}) {
    if (!isOpen) return null;
    return (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end isolate">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative w-full sm:w-80 h-[100dvh] bg-card border-l border-border-strong flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
                <div className="flex-none p-4 border-b border-border-strong flex justify-between items-center bg-card/50 backdrop-blur-xl z-10 safe-pt">
                    <h2 className="text-base font-bold flex items-center gap-2">
                        <TagIcon className="w-4 h-4 text-accent" />
                        Filter Tags
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-fill-subtle rounded-full touch-manipulation"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 min-h-0 safe-pb">
                    <TagExplorer
                        tags={tags}
                        tagCounts={tagCounts}
                        selectedTags={selectedTags}
                        onToggleTag={onToggleTag}
                        onClearFilters={onClearFilters}
                        className="p-4"
                    />
                </div>
            </div>
        </div>
    );
}
