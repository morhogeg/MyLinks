'use client';

import { useEffect, useMemo, useState } from 'react';
import { Collection, Link } from '@/lib/types';
import { Check, Plus, X, Layers, FolderPlus } from 'lucide-react';
import { getColorStyleByKey } from '@/lib/colors';
import {
    addLinkToCollection,
    removeLinkFromCollection,
    createCollection,
} from '@/lib/collections';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';

interface AddToCollectionSheetProps {
    uid: string | null;
    link: Link;
    collections: Collection[];
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Bottom sheet (desktop: centered card) for adding/removing a card to/from
 * collections. Toggle rows mirror CardActionSheet styling; an inline field
 * creates a new collection and immediately adds the card to it.
 *
 * Writes go straight to Firestore; the feed's collections + links onSnapshot
 * listeners reflect changes optimistically, so this component holds no membership
 * state of its own beyond the in-flight "creating" flag.
 */
export default function AddToCollectionSheet({
    uid,
    link,
    collections,
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
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Reset transient state whenever the sheet reopens.
    useEffect(() => {
        if (isOpen) {
            setCreating(false);
            setNewName('');
        }
    }, [isOpen]);

    const memberIds = useMemo(() => new Set(link.collectionIds ?? []), [link.collectionIds]);

    const sorted = useMemo(
        () => [...collections].sort((a, b) => a.name.localeCompare(b.name)),
        [collections]
    );

    if (!isOpen) return null;

    const toggle = async (c: Collection) => {
        if (!uid) return;
        try {
            if (memberIds.has(c.id)) {
                await removeLinkFromCollection(uid, link.id, c.id);
            } else {
                await addLinkToCollection(uid, link.id, c.id);
                toast.success(`Added to ${c.name}`);
            }
        } catch {
            toast.error("Couldn't update the collection. Please try again.");
        }
    };

    const handleCreate = async () => {
        const name = newName.trim();
        if (!uid || !name || busy) return;
        setBusy(true);
        try {
            const id = await createCollection(uid, { name });
            await addLinkToCollection(uid, link.id, id);
            toast.success(`Created “${name}” and added this card`);
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Add to collection"
                className="relative w-full sm:max-w-sm bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb max-h-full sm:max-h-[80vh] flex flex-col"
            >
                {/* Grab handle (mobile) */}
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                    <div className="h-1.5 w-10 rounded-full bg-white/15" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-2 pb-3 border-b border-white/5">
                    <Layers className="w-4 h-4 text-accent shrink-0" />
                    <p className="flex-1 text-sm font-semibold text-text truncate">Add to collection</p>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-2 -me-2 rounded-full text-text-muted hover:text-text hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Collection rows */}
                <div className="py-1 overflow-y-auto">
                    {sorted.length === 0 && !creating && (
                        <p className="px-5 py-6 text-center text-sm text-text-muted">
                            No collections yet. Create your first one below.
                        </p>
                    )}
                    {sorted.map((c) => {
                        const isMember = memberIds.has(c.id);
                        const dot = getColorStyleByKey(c.color || c.name);
                        return (
                            <button
                                key={c.id}
                                role="menuitemcheckbox"
                                aria-checked={isMember}
                                onClick={() => toggle(c)}
                                className="w-full flex items-center gap-3 px-5 py-3 min-h-[52px] text-[15px] font-medium text-text transition-colors active:bg-white/10 hover:bg-white/5"
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: dot.color }}
                                />
                                <span className="flex-1 text-start truncate">{c.name}</span>
                                <span
                                    className={`flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
                                        isMember
                                            ? 'bg-accent border-accent text-white'
                                            : 'border-white/15 text-transparent'
                                    }`}
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Create new */}
                <div className="border-t border-white/5 p-3">
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
                                className="px-4 h-9 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
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
