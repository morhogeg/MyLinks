'use client';

import { useEffect, useMemo, useState } from 'react';
import { Collection, Link } from '@/lib/types';
import { Check, X, Search, LayoutGrid } from 'lucide-react';
import { getCategoryColorStyle } from '@/lib/colors';
import { addLinkToCollection, removeLinkFromCollection } from '@/lib/collections';
import { useToast } from '@/components/Toast';

interface ManageCollectionCardsSheetProps {
    uid: string | null;
    collection: Collection;
    links: Link[];
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Add or remove cards from a collection in one place. Lists every card with a
 * checkbox reflecting membership (live from the feed's onSnapshot); toggling
 * writes immediately. A search box filters the (potentially long) list. Members
 * float to the top so what's already in the collection is easy to review/remove.
 */
export default function ManageCollectionCardsSheet({
    uid,
    collection,
    links,
    isOpen,
    onClose,
}: ManageCollectionCardsSheetProps) {
    const toast = useToast();
    const [q, setQ] = useState('');

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
            setQ('');
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    const rows = useMemo(() => {
        const query = q.trim().toLowerCase();
        const inCol = (l: Link) => (l.collectionIds ?? []).includes(collection.id);
        return links
            .filter((l) => !query
                || l.title.toLowerCase().includes(query)
                || l.summary?.toLowerCase().includes(query)
                || l.category?.toLowerCase().includes(query))
            // Members first, then newest.
            .sort((a, b) => (Number(inCol(b)) - Number(inCol(a))));
    }, [links, q, collection.id]);

    if (!isOpen) return null;

    const memberCount = links.filter((l) => (l.collectionIds ?? []).includes(collection.id)).length;

    const toggle = async (l: Link) => {
        if (!uid) return;
        const isMember = (l.collectionIds ?? []).includes(collection.id);
        try {
            if (isMember) await removeLinkFromCollection(uid, l.id, collection.id);
            else await addLinkToCollection(uid, l.id, collection.id);
        } catch {
            toast.error("Couldn't update the collection. Please try again.");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Manage cards in ${collection.name}`}
                className="relative w-full sm:max-w-lg bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb flex flex-col h-[85vh] sm:h-[70vh]"
            >
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                    <div className="h-1.5 w-10 rounded-full bg-white/15" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-3 pb-3 border-b border-white/5">
                    <LayoutGrid className="w-5 h-5 text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-text truncate">Manage cards</h3>
                        <p className="text-xs text-text-muted truncate">{collection.name} · {memberCount} in collection</p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Done"
                        className="px-4 h-9 rounded-full bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
                    >
                        Done
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 py-3 border-b border-white/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search your cards…"
                            className="w-full pl-9 pr-3 py-2 bg-background rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                    </div>
                </div>

                {/* Card list */}
                <div className="flex-1 overflow-y-auto py-1">
                    {rows.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-text-muted">No cards match “{q}”.</p>
                    ) : rows.map((l) => {
                        const isMember = (l.collectionIds ?? []).includes(collection.id);
                        const colorStyle = getCategoryColorStyle(l.category || '');
                        const thumb = l.metadata?.thumbnailUrl;
                        return (
                            <button
                                key={l.id}
                                role="menuitemcheckbox"
                                aria-checked={isMember}
                                onClick={() => toggle(l)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-white/5 active:bg-white/10"
                            >
                                <span className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: colorStyle.backgroundColor }}>
                                    {thumb
                                        ? <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                                        : <span className="text-[9px] font-black uppercase" style={{ color: colorStyle.color }}>{(l.category || '?').slice(0, 2)}</span>}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-text truncate" dir="auto">{l.title}</span>
                                    {l.category && <span className="block text-[11px] text-text-muted truncate">{l.category}</span>}
                                </span>
                                <span
                                    className={`flex items-center justify-center w-6 h-6 rounded-full border shrink-0 transition-colors ${
                                        isMember ? 'bg-accent border-accent text-white' : 'border-white/15 text-transparent'
                                    }`}
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
