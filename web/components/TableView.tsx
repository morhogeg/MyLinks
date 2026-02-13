'use client';

import { Link, LinkStatus } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { ExternalLink, Tag, Trash2, Archive, Star, Inbox, X, Plus, Check, Pencil, CheckCircle2, Bell, Circle } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';
import SimpleMarkdown from './SimpleMarkdown';
import CategoryInput from './CategoryInput';
import { hasHebrew } from '@/lib/rtl';

interface TableViewProps {
    links: Link[];
    onOpenDetails: (link: Link) => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onUpdateCategory: (id: string, category: string) => void;
    allCategories: string[];
    onDelete: (id: string) => void;
    onUpdateReminder: (link: Link) => void;
    isSelectionMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
}

/**
 * High-density table view for rapid link scanning
 */
export default function TableView({ links, onOpenDetails, onStatusChange, onReadStatusChange, onUpdateTags, onUpdateCategory, allCategories, onDelete, onUpdateReminder }: TableViewProps) {
    const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
    const [activeTagPicker, setActiveTagPicker] = useState<string | null>(null);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editedCategory, setEditedCategory] = useState('');
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
        <div className={`w-full rounded-2xl border border-border-subtle bg-card shadow-sm overflow-x-auto table-view-container ${editingCategoryId ? 'lg:overflow-visible' : 'lg:overflow-hidden'}`}>
            <table className="w-full text-left border-collapse table-fixed min-w-[1000px] lg:min-w-0">
                <thead>
                    <tr className="border-b border-border-subtle bg-white/[0.01] dark:bg-white/[0.02]">
                        <th style={{ position: 'static' }} className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] w-[70px] text-center bg-transparent border-b border-border-subtle lg:w-[50px]">Read</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] w-[25%] text-left lg:w-[25%]">Headline</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] w-[30%] text-left lg:w-[35%]">Summary</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-center w-[20%] lg:w-[20%]">Category & Tags</th>
                        <th style={{ position: 'static' }} className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-right w-[100px] bg-transparent border-b border-border-subtle lg:w-[15%]">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {links.map((link) => (
                        <tr
                            key={link.id}
                            className={`group hover:bg-white/[0.03] transition-all duration-200 cursor-pointer ${link.isRead ? 'opacity-50 grayscale-[0.2]' : ''}`}
                            onClick={() => onOpenDetails(link)}
                        >
                            <td style={{ position: 'static' }} className="px-6 py-10 align-top text-center bg-transparent" onClick={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => onReadStatusChange(link.id, !link.isRead)}
                                    className={`p-2 rounded-lg transition-all ${link.isRead ? 'text-text items-center opacity-100 bg-white/10' : 'text-text-muted/40 hover:bg-white/5 hover:text-text'}`}
                                    title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                                >
                                    {link.isRead ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        <Circle className="w-4 h-4 opacity-40" />
                                    )}
                                </button>
                            </td>
                            <td className="px-6 py-10 align-top">
                                {(() => {
                                    const isRtl = hasHebrew(link.title);
                                    return (
                                        <div className={`flex flex-col gap-1 min-w-0 ${isRtl ? 'text-right' : 'text-left'}`} dir="auto">
                                            <div className="flex items-center gap-2">
                                                <div className="text-[14px] font-bold text-text group-hover:text-accent transition-colors whitespace-normal leading-relaxed">
                                                    {link.title}
                                                </div>
                                            </div>
                                            <div
                                                className={`flex items-center gap-1.5 text-[10px] text-text-muted/50 hover:text-accent transition-colors cursor-pointer w-fit mt-1 group/link ${isRtl ? 'ms-auto' : ''}`}
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
                                    );
                                })()}
                            </td>
                            <td className="px-6 py-10 align-top">
                                <SimpleMarkdown
                                    content={link.summary?.split('\n\n')[0] || link.summary}
                                    isCompact={true}
                                    isRtl={hasHebrew(link.summary || '')}
                                />
                            </td>
                            <td className="px-6 py-10 text-center align-top">
                                <div className="flex flex-col items-center gap-3">
                                    {/* Category */}
                                    {(() => {
                                        const colorStyle = getCategoryColorStyle(link.category);
                                        const isEditing = editingCategoryId === link.id;
                                        return (
                                            <div className="flex justify-center items-center gap-1 group/cat">
                                                {isEditing ? (
                                                    <CategoryInput
                                                        currentCategory={link.category}
                                                        allCategories={allCategories}
                                                        onUpdate={(newCategory) => {
                                                            setEditingCategoryId(null);
                                                            if (newCategory !== link.category) {
                                                                onUpdateCategory(link.id, newCategory);
                                                            }
                                                        }}
                                                        onCancel={() => setEditingCategoryId(null)}
                                                        className="w-24 text-[9px] px-2.5 py-1 text-center"
                                                    />
                                                ) : (
                                                    <>
                                                        <span
                                                            className="text-[9px] uppercase font-black tracking-tighter px-2.5 py-1 rounded-full inline-flex items-center border border-transparent cursor-pointer hover:brightness-110 transition-all"
                                                            style={{
                                                                backgroundColor: colorStyle.backgroundColor,
                                                                color: colorStyle.color,
                                                                borderColor: colorStyle.borderColor,
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingCategoryId(link.id);
                                                                setEditedCategory(link.category);
                                                            }}
                                                        >
                                                            {link.category}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingCategoryId(link.id);
                                                                setEditedCategory(link.category);
                                                            }}
                                                            className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-1 -ms-1 hover:bg-white/5 rounded-md"
                                                        >
                                                            <Pencil className="w-2.5 h-2.5 text-text-muted/40 hover:text-text-muted" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Tags */}
                                    <div className="relative">
                                        <div
                                            className="flex flex-wrap justify-center gap-1 min-h-[24px]"
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
                                                            className="text-[9px] font-bold text-text-muted/60 bg-white/5 border border-white/5 px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 group/tag transition-all hover:bg-white/10 hover:border-white/10 whitespace-nowrap"
                                                        >
                                                            {leaf}
                                                            <X
                                                                className="w-2 h-2 ml-0.5 hidden group-hover/tag:block hover:text-red-400 transition-all cursor-pointer"
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
                                                    className="fixed inset-0 z-10 cursor-default"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveTagPicker(null);
                                                    }}
                                                />
                                                <div
                                                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-20 flex flex-col p-2 animate-in fade-in zoom-in-95 duration-200 text-left"
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
                                    </div>
                                </div>
                            </td>

                            <td style={{ position: 'static' }} className="px-3 py-10 text-right align-top bg-transparent" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center justify-end gap-1 transition-all duration-200 w-full">
                                    <button
                                        onClick={() => onUpdateReminder(link)}
                                        className={`p-2 rounded-lg transition-all relative ${link.reminderStatus === 'pending' ? 'text-accent bg-accent/10' : 'text-text-muted hover:bg-white/5 hover:text-accent'}`}
                                        title={link.reminderStatus === 'pending'
                                            ? `Reminder active${link.reminderProfile && link.reminderProfile.startsWith('spaced')
                                                ? ` (Spaced Repetition ${link.reminderProfile.split('-')[1] || ''}d)`
                                                : ''}`
                                            : 'Remind me'}
                                    >
                                        <Bell className={`w-3.5 h-3.5 ${link.reminderStatus === 'pending' ? 'fill-current' : ''}`} />
                                        {link.reminderStatus === 'pending' && link.reminderProfile && link.reminderProfile.startsWith('spaced') && (
                                            <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent"></span>
                                            </span>
                                        )}
                                    </button>
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
