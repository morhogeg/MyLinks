'use client';

import { useEffect, useState } from 'react';
import { Collection } from '@/lib/types';
import { X, Check, Layers, Shuffle } from 'lucide-react';
import { COLOR_KEYS, getColorStyleByKey } from '@/lib/colors';
import { createCollection, updateCollection } from '@/lib/collections';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';

/** Pick a random palette key — used so users never have to choose a color. */
function randomColorKey(): string {
    return COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
}

interface CollectionFormModalProps {
    uid: string | null;
    /** Pass an existing collection to edit; omit to create a new one. */
    collection?: Collection | null;
    isOpen: boolean;
    onClose: () => void;
    /** Fired with the (new or existing) collection id after a successful save. */
    onSaved?: (id: string) => void;
}

/**
 * Create / edit a collection's name, description, and color.
 * Reuses the named palette in lib/colors.ts so collection accents match the
 * category color language used across cards.
 */
export default function CollectionFormModal({
    uid,
    collection,
    isOpen,
    onClose,
    onSaved,
}: CollectionFormModalProps) {
    const toast = useToast();
    const isEdit = !!collection;
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<string>(COLOR_KEYS[0]);
    const [busy, setBusy] = useState(false);
    // Track the visible viewport so the bottom sheet rides *above* the keyboard
    // instead of being hidden behind it while typing the name. No-op on desktop
    // (visualViewport == full window there).
    const vp = useVisualViewport();

    useEffect(() => {
        if (isOpen) {
            setName(collection?.name ?? '');
            setDescription(collection?.description ?? '');
            // New collections get a random color so picking one is optional.
            setColor(collection?.color ?? randomColorKey());
            setBusy(false);
        }
    }, [isOpen, collection]);

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

    if (!isOpen) return null;

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!uid || !trimmed || busy) return;
        setBusy(true);
        try {
            if (isEdit && collection) {
                await updateCollection(uid, collection.id, {
                    name: trimmed,
                    description: description.trim() || undefined,
                    color,
                });
                toast.success('Collection updated');
                onSaved?.(collection.id);
            } else {
                const id = await createCollection(uid, {
                    name: trimmed,
                    description: description.trim() || undefined,
                    color,
                });
                toast.success(`Created “${trimmed}”`);
                onSaved?.(id);
            }
            onClose();
        } catch {
            toast.error("Couldn't save the collection. Please try again.");
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-x-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
            style={{ top: vp.offsetTop || 0, height: vp.height || '100%', bottom: 'auto' }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                role="dialog"
                aria-modal="true"
                aria-label={isEdit ? 'Edit collection' : 'New collection'}
                className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up sm:animate-scale-up safe-pb"
            >
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                    <div className="h-1.5 w-10 rounded-full bg-white/15" />
                </div>

                <div className="flex items-center gap-3 px-5 pt-3 pb-4 border-b border-white/5">
                    <Layers className="w-5 h-5 text-accent" />
                    <h3 className="flex-1 text-lg font-bold text-text">
                        {isEdit ? 'Edit collection' : 'New collection'}
                    </h3>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                            Name
                        </label>
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                            placeholder="e.g. Russian literature"
                            className="w-full px-3 py-2.5 bg-background rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                            Description <span className="font-medium normal-case text-text-muted/60">(optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What's this collection about?"
                            rows={2}
                            className="w-full px-3 py-2.5 bg-background rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                                Color <span className="font-medium normal-case text-text-muted/60">(optional)</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setColor(randomColorKey())}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
                            >
                                <Shuffle className="w-3.5 h-3.5" />
                                Surprise me
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {COLOR_KEYS.map((key) => {
                                const style = getColorStyleByKey(key);
                                const active = color === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        aria-label={key}
                                        aria-pressed={active}
                                        onClick={() => setColor(key)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${active ? 'scale-110 ring-2 ring-offset-2 ring-offset-card' : 'hover:scale-105'}`}
                                        style={{ backgroundColor: style.color, boxShadow: active ? `0 0 0 2px ${style.color}` : undefined }}
                                    >
                                        {active && <Check className="w-4 h-4 text-white" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-text font-medium hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim() || busy}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
                    >
                        {isEdit ? 'Save' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}
