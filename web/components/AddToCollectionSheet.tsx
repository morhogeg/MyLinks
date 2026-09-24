'use client';

import { useEffect, useMemo, useState } from 'react';
import { Collection, Link } from '@/lib/types';
import { Check, X, Layers, FolderPlus, Lock } from 'lucide-react';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { getColorStyleByKey } from '@/lib/colors';
import {
    addLinkToCollection,
    removeLinkFromCollection,
    addLinksToCollection,
    removeLinksFromCollection,
    createCollection,
} from '@/lib/collections';
import { rankCollectionsForLink } from '@/lib/collectionSuggest';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { getDirection } from '@/lib/rtl';
import { hapticSelection } from '@/lib/haptics';

interface AddToCollectionSheetProps {
    uid: string | null;
    link: Link;
    /** Bulk mode (the selection toolbar): act on ALL these cards. A collection
     *  reads as a member only when every card is in it; toggling adds the
     *  missing ones, or removes all when every card is already in. `link` is
     *  then only the ranking anchor for "Suggested". */
    bulk?: Link[];
    collections: Collection[];
    /** The full feed — used to rank collections by topical affinity with the card. */
    links?: Link[];
    /** Ids of private collections: rows get a lock glyph, and adding to one
     *  warns that the card itself becomes private. */
    privateCollectionIds?: Set<string>;
    /** Private collections whose vault is currently locked. Toggling one goes
     *  through `onRequestUnlock` first so the PIN pad appears before any write. */
    lockedIds?: Set<string>;
    /** Parent-owned PIN gate: show the pad, then run `then` once unlocked. */
    onRequestUnlock?: (then: () => void) => void;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Bottom sheet (desktop: centered card) for adding/removing a card to/from
 * collections. Toggle rows mirror CardActionSheet styling; collections that
 * topically match the card (shared tags/concepts with existing members) float
 * to the top under a "Suggested" heading; an inline field creates a new
 * collection and immediately adds the card to it.
 *
 * Writes go straight to Firestore; the feed's collections + links onSnapshot
 * listeners reflect changes optimistically, so this component holds no membership
 * state of its own beyond the in-flight "creating" flag.
 */
export default function AddToCollectionSheet({
    uid,
    link,
    bulk,
    collections,
    links = [],
    privateCollectionIds,
    lockedIds,
    onRequestUnlock,
    isOpen,
    onClose,
}: AddToCollectionSheetProps) {
    const toast = useToast();
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    // Ride above the keyboard so the autofocused new-collection input (pinned to
    // the bottom of the sheet) isn't hidden behind the keys while typing. No-op
    // on desktop, where visualViewport spans the full window.
    const vp = useVisualViewport();

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    // Bottom sheet on mobile, centered modal on desktop — drag only on mobile.
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });

    // Reset transient state whenever the sheet reopens.
    useEffect(() => {
        if (isOpen) {
            setCreating(false);
            setNewName('');
        }
    }, [isOpen]);

    const memberIds = useMemo(() => {
        if (!bulk || bulk.length === 0) return new Set(link.collectionIds ?? []);
        const [first, ...rest] = bulk;
        return new Set((first.collectionIds ?? []).filter((id) => rest.every((l) => (l.collectionIds ?? []).includes(id))));
    }, [bulk, link.collectionIds]);
    const bulkIds = useMemo(() => (bulk ?? []).map((l) => l.id), [bulk]);
    const isBulk = bulkIds.length > 0;
    const cardWord = isBulk ? `${bulkIds.length} card${bulkIds.length === 1 ? '' : 's'}` : 'this card';

    // Best-matching non-member collections for this card, shown first.
    const suggested = useMemo(
        () => (isOpen ? rankCollectionsForLink(link, collections, links) : []),
        [isOpen, link, collections, links]
    );

    const sorted = useMemo(() => {
        const suggestedIds = new Set(suggested.map((c) => c.id));
        return [...collections]
            .filter((c) => !suggestedIds.has(c.id))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [collections, suggested]);

    if (!isOpen) return null;

    const toggle = async (c: Collection) => {
        if (!uid) return;
        hapticSelection();
        try {
            if (memberIds.has(c.id)) {
                if (isBulk) await removeLinksFromCollection(uid, bulkIds, c.id);
                else await removeLinkFromCollection(uid, link.id, c.id);
                if (isBulk) toast.success(`Removed ${cardWord} from ${c.name}`);
            } else {
                if (isBulk) await addLinksToCollection(uid, bulkIds, c.id);
                else await addLinkToCollection(uid, link.id, c.id);
                // Joining a private collection makes the card private everywhere
                // (library, search, suggestions), so say so at the moment it happens.
                const added = isBulk ? `Added ${cardWord} to ${c.name}` : `Added to ${c.name}`;
                toast.success(privateCollectionIds?.has(c.id)
                    ? `${added}. ${isBulk ? 'They are' : 'This card is'} now private.`
                    : added);
            }
        } catch {
            toast.error("Couldn't update the collection. Please try again.");
        }
    };

    // A locked vault must be opened before its membership changes; the parent
    // shows the PIN pad and calls back into the real toggle on success.
    const requestToggle = (c: Collection) => {
        if (lockedIds?.has(c.id) && onRequestUnlock) {
            onRequestUnlock(() => { void toggle(c); });
            return;
        }
        void toggle(c);
    };

    const handleCreate = async () => {
        const name = newName.trim();
        if (!uid || !name || busy) return;
        setBusy(true);
        try {
            const id = await createCollection(uid, { name });
            if (isBulk) await addLinksToCollection(uid, bulkIds, id);
            else await addLinkToCollection(uid, link.id, id);
            toast.success(`Created “${name}” and added ${cardWord}`);
            setNewName('');
            setCreating(false);
        } catch {
            toast.error("Couldn't create the collection. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-x-0 z-[95] flex items-end sm:items-center justify-center animate-fade-in"
            style={{ top: vp.offsetTop || 0, height: vp.height || '100%', bottom: 'auto' }}
        >
            <div ref={scrimRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Add to collection"
                /* Height is capped BELOW the status bar (inset + a 1.5rem breather)
                   rather than at max-h-full: with a dozen collections the sheet grew
                   to the full viewport and its grab handle sat under the notch, so it
                   read as a screen that had slid too far up instead of a sheet. Same
                   cap as SuggestionPreviewSheet — keep them in step. */
                className="relative w-full sm:max-w-sm bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb max-h-[calc(100%-env(safe-area-inset-top)-1.5rem)] sm:max-h-[80vh] flex flex-col"
            >
                {/* Grab handle + header: the drag-to-dismiss zone on mobile. */}
                <div {...handleProps}>
                    {/* Grab handle (mobile) */}
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 pt-2 pb-3 border-b border-border-subtle">
                        <Layers className="w-4 h-4 text-accent shrink-0" />
                        <p className="flex-1 text-sm font-semibold text-text truncate">{isBulk ? `Add ${cardWord} to collection` : 'Add to collection'}</p>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="p-2 -me-2 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Collection rows */}
                <div className="py-1 overflow-y-auto">
                    {sorted.length === 0 && suggested.length === 0 && !creating && (
                        <p className="px-5 py-6 text-center text-sm text-text-muted">
                            No collections yet. Create your first one below.
                        </p>
                    )}
                    {/* Topical matches for this card, ranked by affinity. */}
                    {suggested.length > 0 && (
                        <>
                            <p className="flex items-center gap-1.5 px-5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-accent">
                                <CitationGlyph className="w-3 h-3" /> Suggested
                            </p>
                            {suggested.map((c) => (
                                <CollectionRow key={c.id} collection={c} isMember={memberIds.has(c.id)} isPrivate={privateCollectionIds?.has(c.id) ?? false} onToggle={requestToggle} />
                            ))}
                            {/* Own header for the A–Z remainder so it never reads as
                                part of "Suggested" — same 11px uppercase style, muted
                                and icon-less to sit below the accented Suggested header. */}
                            {sorted.length > 0 && (
                                <p className="px-5 pt-3 pb-1 mt-1 border-t border-border-subtle text-[11px] font-bold uppercase tracking-wider text-text-muted">
                                    All collections
                                </p>
                            )}
                        </>
                    )}
                    {sorted.map((c) => (
                        <CollectionRow key={c.id} collection={c} isMember={memberIds.has(c.id)} isPrivate={privateCollectionIds?.has(c.id) ?? false} onToggle={requestToggle} />
                    ))}
                </div>

                {/* Create new */}
                <div className="border-t border-border-subtle p-3">
                    {creating ? (
                        <div className="flex items-center gap-2">
                            <input
                                autoFocus
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') setCreating(false);
                                }}
                                placeholder="Collection name"
                                className="flex-1 px-3 py-2 bg-background rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                            />
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || busy}
                                className="px-4 h-9 rounded-xl bg-accent text-accent-ink text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
                            >
                                Create
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setCreating(true)}
                            className="w-full flex items-center gap-2 px-2 py-2.5 rounded-xl text-[15px] font-semibold text-accent hover:bg-accent/10 transition-colors"
                        >
                            <FolderPlus className="w-5 h-5" />
                            New collection
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/** One toggleable membership row — shared by the Suggested and A–Z sections. */
function CollectionRow({
    collection,
    isMember,
    isPrivate,
    onToggle,
}: {
    collection: Collection;
    isMember: boolean;
    isPrivate: boolean;
    onToggle: (c: Collection) => void;
}) {
    const dot = getColorStyleByKey(collection.color || collection.name);
    const nameDir = getDirection(collection.name);
    return (
        <button
            role="menuitemcheckbox"
            aria-checked={isMember}
            onClick={() => onToggle(collection)}
            className="w-full flex items-center gap-3 px-5 py-3 min-h-[52px] text-[15px] font-medium text-text transition-colors active:bg-fill-strong hover:bg-fill-subtle"
        >
            <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: dot.color }}
            />
            <span dir={nameDir} className={`flex-1 text-start truncate ${nameDir === 'rtl' ? 'font-hebrew' : ''}`}>{collection.name}</span>
            {isPrivate && <Lock aria-label="Private" className="w-3.5 h-3.5 shrink-0 text-text-muted" />}
            <span
                className={`flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
                    isMember
                        ? 'bg-accent border-accent text-accent-ink'
                        : 'border-border-strong text-transparent'
                }`}
            >
                <Check className="w-3.5 h-3.5" />
            </span>
        </button>
    );
}
