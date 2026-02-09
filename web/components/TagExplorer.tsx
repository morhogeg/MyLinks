'use client';

import { useState, useMemo } from 'react';
import { TagNode, buildTagTree } from '@/lib/tags';
import { ChevronRight, ChevronDown, Tag, Hash, Folder, X, Search, Filter, ChevronLeft } from 'lucide-react';

interface TagExplorerProps {
    tags: string[];
    tagCounts: Record<string, number>;
    selectedTags: Set<string>;
    onToggleTag: (tag: string) => void;
    onClearFilters: () => void;
    onCollapse?: () => void;
    className?: string;
}

export default function TagExplorer({
    tags,
    tagCounts,
    selectedTags,
    onToggleTag,
    onClearFilters,
    onCollapse,
    className = ""
}: TagExplorerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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

        return buildTagTree(filteredTags, tagCounts);
    }, [tags, tagCounts, searchQuery]);

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

    const renderNode = (node: TagNode) => {
        const isSelected = selectedTags.has(node.fullName);
        const isExpanded = expandedNodes.has(node.fullName) || searchQuery.trim() !== '';
        const hasChildren = node.children.length > 0;

        return (
            <div key={node.fullName} className="flex flex-col">
                <div
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white/5 ${isSelected ? 'bg-accent/10 text-accent font-bold' : 'text-text-muted hover:text-text-secondary'
                        }`}
                    onClick={() => onToggleTag(node.fullName)}
                >
                    <div className="flex items-center justify-center w-4 h-4">
                        {hasChildren ? (
                            <button
                                onClick={(e) => toggleExpand(node.fullName, e)}
                                className="p-0.5 hover:bg-white/10 rounded transition-colors"
                            >
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                        ) : (
                            <Hash className="w-3 h-3 opacity-30" />
                        )}
                    </div>

                    <span className="text-[13px] flex-grow truncate">{node.name}</span>

                    <span className={`text-[10px] tabular-nums font-medium px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-accent/20 text-accent' : 'bg-white/5 text-text-muted opacity-60'
                        }`}>
                        {node.count}
                    </span>
                </div>

                {hasChildren && isExpanded && (
                    <div className="ml-4 pl-2 border-l border-white/5 mt-0.5 flex flex-col gap-0.5">
                        {node.children.map(child => renderNode(child))}
                    </div>
                )}
            </div>
        );
    };

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
                            className="p-1 hover:bg-white/5 rounded-md text-text-muted hover:text-text transition-all"
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
                    className="w-full bg-white/5 border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
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
