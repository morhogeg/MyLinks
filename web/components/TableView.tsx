'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { ExternalLink, Tag, Trash2, Archive, Star, Inbox, X, Plus, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';
import SimpleMarkdown from './SimpleMarkdown';

interface TableViewProps {
    links: Link[];
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onDelete: (id: string) => void;
    isSelectionMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
}

/**
 * High-density table view for rapid link scanning
 */
export default function TableView({ links, onOpenDetails, onStatusChange, onUpdateTags, onDelete }: TableViewProps) {
    const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
    const [activeTagPicker, setActiveTagPicker] = useState<string | null>(null);
    const [tagSearch, setTagSearch] = useState('');
    const [now, setNow] = useState<number>(0);

    // Get all unique tags from all links
    const allUniqueTags = Array.from(new Set(links.flatMap(l => l.tags))).sort();

    // Filter tags based on search
    const filteredAllTags = tagSearch.trim() === ''
        ? allUniqueTags
        : allUniqueTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));

    const isExistingTag = allUniqueTags.some(t => t.toLowerCase() === tagSearch.toLowerCase().trim());

    useEffect(() => {
        const timer = setTimeout(() => setNow(Date.now()), 0);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="w-full overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
            <table className="w-full text-left border-collapse table-fixed">
                <thead>
                    <tr className="border-b border-border-subtle bg-white/[0.01] dark:bg-white/[0.02]">
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] w-[28%]">Source</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] w-[30%]">Insight</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-center w-[10%]">Category</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] w-[20%]">Tags</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-right w-[12%]">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {links.map((link) => (
                        <tr
                            key={link.id}
                            className="group hover:bg-white/[0.03] transition-all duration-200 cursor-pointer"
                            onClick={() => onOpenDetails(link)}
                        >
                            <td className="px-6 py-10 align-top">
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="text-[14px] font-bold text-text group-hover:text-accent transition-colors whitespace-normal leading-relaxed">
                                        {link.title}
                                    </div>
                                    <div
                                        className="flex items-center gap-1.5 text-[10px] text-text-muted/50 hover:text-white transition-colors cursor-pointer w-fit mt-1 group/link"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(link.url, '_blank');
                                        }}
                                    >
                                        <span className="truncate italic max-w-[200px]">
                                            {new URL(link.url).hostname.replace('www.', '')}
                                        </span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover/link:opacity-100" />
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-10 align-top">
                                <SimpleMarkdown
                                    content={link.summary}
                                    isCompact={true}
                                />
                            </td>
                            <td className="px-6 py-10 text-center align-top">
                                {(() => {
                                    const colorStyle = getCategoryColorStyle(link.category);
                                    return (
                                        <span
                                            className="text-[9px] uppercase font-black tracking-tighter px-2.5 py-1 rounded-full inline-block border border-transparent"
                                            style={{
                                                backgroundColor: colorStyle.backgroundColor,
                                                color: colorStyle.color,
                                                borderColor: colorStyle.borderColor,
                                            }}
                                        >
                                            {link.category}
                                        </span>
                                    );
                                })()}
                            </td>
                            <td className="px-6 py-10 relative align-top">
                                <div
                                    className="flex flex-wrap gap-1 min-h-[24px]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTagPicker(activeTagPicker === link.id ? null : link.id);
                                    }}
                                >
                                    {link.tags.length > 0 ? (
                                        link.tags.map(tag => {
                                            const parts = tag.split('/');
                                            const leaf = parts[parts.length - 1];
                                            return (
                                                <span
                                                    key={tag}
                                                    className="text-[9px] font-bold text-text-muted/60 bg-white/5 border border-white/5 px-2.5 py-0.5 rounded-full flex items-center gap-1 group/tag transition-all hover:bg-white/10 hover:border-white/10"
                                                >
                                                    {leaf}
                                                    <X
                                                        className="w-2 h-2 ml-0.5 opacity-0 group-hover/tag:opacity-100 hover:text-red-400 transition-all cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onUpdateTags(link.id, link.tags.filter(t => t !== tag));
                                                        }}
                                                    />
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <button className="text-[10px] text-text-muted/30 hover:text-accent transition-colors flex items-center gap-1 italic">
                                            <Plus className="w-2.5 h-2.5" />
                                            Add tags
                                        </button>
                                    )}
                                </div>

                                {/* Multi-select Popover */}
                                {activeTagPicker === link.id && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveTagPicker(null);
                                            }}
                                        />
                                        <div
                                            className="absolute top-10 right-0 w-64 bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-20 flex flex-col p-2 animate-in fade-in zoom-in-95 duration-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Tags</span>
                                                <X
                                                    className="w-3 h-3 text-text-muted hover:text-white cursor-pointer"
                                                    onClick={() => {
                                                        setActiveTagPicker(null);
                                                        setTagSearch('');
                                                    }}
                                                />
                                            </div>

                                            {/* Search Input */}
                                            <div className="p-1 mb-1">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="Search or create..."
                                                    className="w-full bg-white/5 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 transition-all"
                                                    value={tagSearch}
                                                    onChange={(e) => setTagSearch(e.target.value)}
                                                />
                                            </div>

                                            <div className="max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                                {filteredAllTags.map(tag => {
                                                    const isSelected = link.tags.includes(tag);
                                                    return (
                                                        <button
                                                            key={tag}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newTags = isSelected
                                                                    ? link.tags.filter(t => t !== tag)
                                                                    : [...link.tags, tag];
                                                                onUpdateTags(link.id, newTags);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-white/5 mb-0.5 ${isSelected ? 'text-accent font-bold bg-accent/5' : 'text-text-secondary'}`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Tag className={`w-3 h-3 ${isSelected ? 'text-accent' : 'text-text-muted'}`} />
                                                                {tag}
                                                            </div>
                                                            {isSelected && <Check className="w-3 h-3" />}
                                                        </button>
                                                    );
                                                })}

                                                {/* Create New Tag Button */}
                                                {tagSearch.trim() !== '' && !isExistingTag && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onUpdateTags(link.id, [...link.tags, tagSearch.trim()]);
                                                            setTagSearch('');
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-accent hover:bg-accent/5 transition-all text-left mt-1 border border-dashed border-accent/20"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        <span>Create &quot;{tagSearch}&quot;</span>
                                                    </button>
                                                )}

                                                {filteredAllTags.length === 0 && tagSearch.trim() === '' && (
                                                    <div className="py-4 text-center text-text-muted/40 italic text-[10px]">
                                                        No tags yet. Type to create one.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </td>

                            <td className="px-3 py-10 text-right align-top" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center gap-1 transition-all duration-200">
                                    <button
                                        onClick={() => onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite')}
                                        className={`p-2 rounded-lg transition-all ${link.status === 'favorite' ? 'text-yellow-500 bg-yellow-500/10' : 'text-text-muted hover:bg-white/5 hover:text-text'}`}
                                        title="Favorite"
                                    >
                                        <Star className={`w-3.5 h-3.5 ${link.status === 'favorite' ? 'fill-yellow-500' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived')}
                                        className={`p-2 rounded-lg transition-all ${link.status === 'archived' ? 'text-accent bg-accent/10' : 'text-text-muted hover:bg-white/5 hover:text-text'}`}
                                        title={link.status === 'archived' ? 'Unarchive' : 'Archive'}
                                    >
                                        {link.status === 'archived' ? <Inbox className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        onClick={() => setDeleteLinkId(link.id)}
                                        className="p-2 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <ConfirmDialog
                isOpen={!!deleteLinkId}
                onClose={() => setDeleteLinkId(null)}
                onConfirm={() => deleteLinkId && onDelete(deleteLinkId)}
                title="Delete Link?"
                message="This will permanently remove this insight from your second brain. This action cannot be undone."
                confirmLabel="Delete Forever"
            />
        </div>
    );
}
