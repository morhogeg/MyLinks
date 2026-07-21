'use client';

import { useEffect, useMemo, useState } from 'react';
import { Collection, Link } from '@/lib/types';
import { Check, Search, LayoutGrid } from 'lucide-react';
import { addLinkToCollection, removeLinkFromCollection } from '@/lib/collections';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { hapticSelection } from '@/lib/haptics';

interface ManageCollectionCardsSheetProps {
    uid: string | null;
    collection: Collection;
    links: Link[];
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Add or remove cards from a collection in one place. Lists every card with a
 * checkbox reflecting membership; toggles are STAGED locally (nothing is written
 * per tap) and applied in one batch when the sheet closes — so unchecking a card
 * doesn't make it vanish out from under you; you review, then save. A search box
 * filters the (potentially long) list. Members float to the top so what's
 * already in the collection is easy to review/remove.
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
    // Keep the sheet within the visible viewport so opening the keyboard to search
    // doesn't push the card list under the keys. No-op on desktop.
    const vp = useVisualViewport();

    // Staged membership — the set of card ids that WILL be in the collection when
    // the sheet closes. Seeded from the live membership; toggles mutate this only.
    // `original` remembers the starting membership so we can commit just the diff
    // (adds + removes) on close. Seeded via the useState INITIALIZER so it's
    // correct on mount — this sheet is conditionally rendered already-open, so a
    // closed→open effect would never fire (and Save would wipe the collection).
    const seedMembers = () => new Set(
        links.filter((l) => (l.collectionIds ?? []).includes(collection.id)).map((l) => l.id),
    );
    const [pending, setPending] = useState<Set<string>>(seedMembers);
    const [original, setOriginal] = useState<Set<string>>(seedMembers);

    // Re-seed + clear search if the SAME mounted instance is reopened (rare — it's
    // usually remounted per open, where the initializer above already seeded).
    const [prevOpen, setPrevOpen] = useState(isOpen);
    if (prevOpen !== isOpen) {
        setPrevOpen(isOpen);
        if (isOpen) {
            setQ('');
            const members = seedMembers();
            setPending(members);
            setOriginal(members);
        }
    }

    // Apply the staged diff (fire-and-forget; the feed's onSnapshot reflects it)
    // then close. Every dismissal path routes through here so edits are never lost.
    const commitAndClose = () => {
        if (uid) {
            const toAdd = [...pending].filter((id) => !original.has(id));
            const toRemove = [...original].filter((id) => !pending.has(id));
            if (toAdd.length || toRemove.length) {
                Promise.all([
                    ...toAdd.map((id) => addLinkToCollection(uid, id, collection.id)),
                    ...toRemove.map((id) => removeLinkFromCollection(uid, id, collection.id)),
                ]).catch(() => toast.error("Couldn't update the collection. Please try again."));
            }
        }
        onClose();
    };

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') commitAndClose(); };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
        // commitAndClose closes over pending/original, which are captured fresh each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, pending, original]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    // Bottom sheet on mobile, centered modal on desktop — drag only on mobile.
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose: commitAndClose, enabled: isMobile });

    const rows = useMemo(() => {
        const query = q.trim().toLowerCase();
        return links
            .filter((l) => !query
                || l.title.toLowerCase().includes(query)
                || l.summary?.toLowerCase().includes(query)
                || l.category?.toLowerCase().includes(query))
            // Members first (by staged state), then newest.
            .sort((a, b) => (Number(pending.has(b.id)) - Number(pending.has(a.id))));
    }, [links, q, pending]);

    if (!isOpen) return null;

    const dirty = pending.size !== original.size || [...pending].some((id) => !original.has(id));

    const toggle = (l: Link) => {
        hapticSelection();
        setPending((prev) => {
            const next = new Set(prev);
            if (next.has(l.id)) next.delete(l.id);
            else next.add(l.id);
            return next;
        });
    };

    return (
        <div
            className="fixed inset-x-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
            style={{ top: vp.offsetTop || 0, height: vp.height || '100%', bottom: 'auto' }}
        >
            <div ref={scrimRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={commitAndClose} />

            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={`Manage cards in ${collection.name}`}
                className="relative w-full sm:max-w-lg bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb flex flex-col h-[85vh] sm:h-[70vh] max-h-full"
            >
                {/* Grab handle + header: the drag-to-dismiss zone on mobile. */}
                <div {...handleProps} className="shrink-0">
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 pt-3 pb-3 border-b border-border-subtle">
                        <LayoutGrid className="w-5 h-5 text-accent shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-text truncate">Manage cards</h3>
                            <p className="text-xs text-text-muted truncate">{collection.name} · {pending.size} in collection</p>
                        </div>
                        <button
                            onClick={commitAndClose}
                            aria-label={dirty ? 'Save changes' : 'Done'}
                            className="px-4 h-9 rounded-full bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
                        >
                            {dirty ? 'Save' : 'Done'}
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 py-3 border-b border-border-subtle">
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
                        const isMember = pending.has(l.id);
                        const thumb = l.metadata?.thumbnailUrl;
                        return (
                            <button
                                key={l.id}
                                role="menuitemcheckbox"
                                aria-checked={isMember}
                                onClick={() => toggle(l)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-fill-subtle active:bg-fill-strong"
                            >
                                {/* Thumbnail only when the card actually has one — no
                                    generic category-initial placeholder box. */}
                                {thumb && (
                                    <span className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-fill-subtle">
                                        <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    </span>
                                )}
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-text truncate" dir="auto">{l.title}</span>
                                    {l.category && <span className="block text-[11px] text-text-muted truncate" dir="auto">{l.category}</span>}
                                </span>
                                <span
                                    className={`flex items-center justify-center w-6 h-6 rounded-full border shrink-0 transition-colors ${
                                        isMember ? 'bg-accent border-accent text-white' : 'border-border-strong text-transparent'
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
