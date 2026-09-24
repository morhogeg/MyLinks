'use client';

import { useState, useMemo } from 'react';
import { TagNode, buildTagTree, tagKey } from '@/lib/tags';
import { ChevronRight, ChevronDown, Tag, Hash, X, Search, ChevronLeft, MoreHorizontal } from 'lucide-react';

interface TagExplorerProps {
    tags: string[];
    tagCounts: Record<string, number>;
    selectedTags: Set<string>;
    onToggleTag: (tag: string) => void;
    onClearFilters: () => void;
    onCollapse?: () => void;
    className?: string;
    /**
     * "sidebar" (default) renders the full explorer with its own header + search,
     * for the desktop card and the mobile drawer. "embedded" drops the header
     * (the host supplies its own "Tags" label) and renders the tree flush so it
     * can breathe inside a borderless bottom sheet.
     */
    variant?: 'sidebar' | 'embedded';
    /**
     * When true, tags are ranked by count (desc) then name instead of A–Z —
     * set when a category filter is active so the matching tags surface at the
     * top and 0-count ones sink out of the way.
     */
    rankByCount?: boolean;
    /** Library-wide tag management. When given, each tag row gets a ⋯ button
     *  that opens Rename (renaming onto an existing tag merges the two) and
     *  Delete. Both resolve once every card is rewritten. */
    onRenameTag?: (from: string, to: string) => Promise<void>;
    onDeleteTag?: (tag: string) => Promise<void>;
}

export default function TagExplorer({
    tags,
    tagCounts,
    selectedTags,
    onToggleTag,
    onClearFilters,
    onCollapse,
    className = "",
    variant = 'sidebar',
    rankByCount = false,
    onRenameTag,
    onDeleteTag,
}: TagExplorerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    // The tag whose manage row is open, its draft name, and a pending delete
    // confirmation (a second tap), plus the in-flight guard.
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [working, setWorking] = useState(false);
    const canManage = !!(onRenameTag || onDeleteTag);

    const openManage = (fullName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditing(editing === fullName ? null : fullName);
        setDraft(fullName);
        setConfirmDelete(false);
    };
    const closeManage = () => { setEditing(null); setConfirmDelete(false); };
    const runManage = async (fn: () => Promise<void>) => {
        if (working) return;
        setWorking(true);
        try {
            await fn();
            closeManage();
        } finally {
            setWorking(false);
        }
    };

    const tagTree = useMemo(() => {
        // Only include tags that match the search query (and their parents)
        let filteredTags = tags;
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const matchingTags = tags.filter(t => t.toLowerCase().includes(query));

            // Collect all parent paths for matching tags
            const allNeededTags = new Set<string>();
            matchingTags.forEach(tag => {
                const parts = tag.split('/');
                let path = '';
                parts.forEach((part, i) => {
                    path = i === 0 ? part : `${path}/${part}`;
                    allNeededTags.add(path);
                });
            });
            filteredTags = Array.from(allNeededTags);
        }

        return buildTagTree(filteredTags, tagCounts, rankByCount);
    }, [tags, tagCounts, searchQuery, rankByCount]);

    const toggleExpand = (fullName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(fullName)) {
            newExpanded.delete(fullName);
        } else {
            newExpanded.add(fullName);
        }
        setExpandedNodes(newExpanded);
    };

    // Inline manage panel under a tag row: rename (→ merge when the new name
    // is an existing tag) or delete from every card.
    const renderManage = (node: TagNode) => {
        const next = draft.trim();
        const target = next ? tags.find((t) => tagKey(t) === tagKey(next) && tagKey(t) !== tagKey(node.fullName)) : undefined;
        const unchanged = next === node.fullName;
        const cards = `${node.count} card${node.count === 1 ? '' : 's'}`;
        return (
            <div className="mx-1 mt-1 mb-1.5 p-2.5 rounded-xl bg-fill-subtle border border-border-subtle flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                {onRenameTag && (
                    <>
                        <input
                            type="text"
                            value={draft}
                            autoFocus
                            dir="auto"
                            onChange={(e) => { setDraft(e.target.value); setConfirmDelete(false); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') closeManage();
                                if (e.key === 'Enter' && next && !unchanged) void runManage(() => onRenameTag(node.fullName, target ?? next));
                            }}
                            aria-label="New tag name"
                            className="w-full bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-accent/30"
                        />
                        {target && (
                            <p className="text-[11px] text-text-muted leading-snug">Merges into the existing tag “{target}”.</p>
                        )}
                    </>
                )}
                <div className="flex items-center gap-1.5">
                    {onRenameTag && (
                        <button
                            disabled={working || !next || unchanged}
                            onClick={() => void runManage(() => onRenameTag(node.fullName, target ?? next))}
                            className="px-2.5 py-1 rounded-lg bg-accent text-accent-ink text-[12px] font-semibold disabled:opacity-40"
                        >
                            {target ? 'Merge' : 'Rename'}
                        </button>
                    )}
                    {onDeleteTag && (
                        <button
                            disabled={working}
                            onClick={() => confirmDelete ? void runManage(() => onDeleteTag(node.fullName)) : setConfirmDelete(true)}
                            className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                        >
                            {confirmDelete ? `Remove from ${cards}?` : 'Delete'}
                        </button>
                    )}
                    <button
                        onClick={closeManage}
                        className="ms-auto px-2 py-1 rounded-lg text-[12px] text-text-muted hover:text-text"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    };

    const renderNode = (node: TagNode) => {
        const isSelected = selectedTags.has(node.fullName);
        const isExpanded = expandedNodes.has(node.fullName) || searchQuery.trim() !== '';
        const hasChildren = node.children.length > 0;

        return (
            <div key={node.fullName} className="flex flex-col">
                <div
                    className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${isSelected
                        ? 'bg-accent/10 text-accent font-semibold'
                        : 'text-text-secondary hover:bg-card-hover hover:text-text'
                        }`}
                    onClick={() => onToggleTag(node.fullName)}
                >
                    <div className="flex items-center justify-center w-4 h-4 shrink-0">
                        {hasChildren ? (
                            <button
                                onClick={(e) => toggleExpand(node.fullName, e)}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                className="p-0.5 -m-0.5 rounded-md text-text-muted hover:text-text hover:bg-fill-strong transition-colors"
                            >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />}
                            </button>
                        ) : (
                            <Hash className={`w-3 h-3 ${isSelected ? 'opacity-70' : 'opacity-30'}`} />
                        )}
                    </div>

                    <span className="text-[13px] flex-grow truncate">{node.name}</span>

                    <span className={`text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full transition-colors ${isSelected
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-muted/70 group-hover:text-text-muted'
                        }`}>
                        {node.count}
                    </span>
                    {canManage && (
                        <button
                            onClick={(e) => openManage(node.fullName, e)}
                            aria-label={`Manage tag ${node.fullName}`}
                            title="Rename, merge or delete"
                            className={`shrink-0 p-1 -me-1 rounded-md text-text-muted hover:text-text hover:bg-fill-strong transition-opacity ${variant === 'embedded' || editing === node.fullName ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                        >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {editing === node.fullName && renderManage(node)}

                {hasChildren && isExpanded && (
                    <div className="ms-3.5 ps-2.5 border-s border-border-subtle/70 mt-0.5 flex flex-col gap-0.5">
                        {node.children.map(child => renderNode(child))}
                    </div>
                )}
            </div>
        );
    };

    // Embedded variant — no header (the host sheet supplies its own "Tags"
    // label), just a light search field and the tree flowing flush. Designed to
    // live in a borderless bottom sheet, so it carries no card chrome of its own.
    if (variant === 'embedded') {
        return (
            <div className={`flex flex-col gap-3 ${className}`}>
                <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter tags…"
                        className="w-full bg-card border border-border-subtle rounded-full ps-9 pe-3 py-2 text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent transition-all"
                    />
                </div>

                <div className="flex flex-col gap-0.5">
                    {tagTree.length === 0 ? (
                        <div className="py-8 text-center text-text-muted opacity-50 italic text-xs">
                            {searchQuery ? 'No matching tags' : 'No tags found'}
                        </div>
                    ) : (
                        tagTree.map(node => renderNode(node))
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-4 h-full ${className}`}>
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" />
                    Tag Explorer
                </h3>
                <div className="flex items-center gap-2">
                    {selectedTags.size > 0 && (
                        <button
                            onClick={onClearFilters}
                            className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                    {onCollapse && (
                        <button
                            onClick={onCollapse}
                            className="p-1 hover:bg-fill-subtle rounded-md text-text-muted hover:text-text transition-all"
                            title="Collapse Sidebar"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tag Search */}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter tags..."
                    className="w-full bg-fill-subtle border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
                />
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain pr-2 scrollbar-subtle">
                {tagTree.length === 0 ? (
                    <div className="py-8 text-center text-text-muted opacity-40 italic text-xs">
                        {searchQuery ? 'No matching tags' : 'No tags found'}
                    </div>
                ) : (
                    tagTree.map(node => renderNode(node))
                )}
            </div>
        </div>
    );
}
