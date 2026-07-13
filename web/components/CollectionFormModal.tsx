'use client';

import { useEffect, useState } from 'react';
import { Collection } from '@/lib/types';
import { X, Check, Layers, Shuffle, Lock } from 'lucide-react';
import { COLOR_KEYS, getColorStyleByKey } from '@/lib/colors';
import { createCollection, updateCollection, unpublishCollection } from '@/lib/collections';
import { usePrivacyLock } from '@/lib/privacyLock';
import PinLockModal from './PinLockModal';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';

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
    const [isPrivate, setIsPrivate] = useState(false);
    // Turning Private on for the first time requires setting up the vault PIN.
    const [pinSetupOpen, setPinSetupOpen] = useState(false);
    const { hasPin } = usePrivacyLock(uid);
    const [busy, setBusy] = useState(false);
    // Track the visible viewport so the bottom sheet rides *above* the keyboard
    // instead of being hidden behind it while typing the name. No-op on desktop
    // (visualViewport == full window there).
    const vp = useVisualViewport();

    // Reset the form fields when the sheet opens (or the target collection
    // changes while open). Done as a render-time state adjustment rather than in
    // an effect — React re-renders synchronously without committing the stale
    // pass, matching the previous [isOpen, collection] effect exactly while
    // avoiding a set-state-in-effect cascade.
    const [resetKey, setResetKey] = useState<{ isOpen: boolean; collection: Collection | null | undefined }>({ isOpen, collection });
    if (resetKey.isOpen !== isOpen || resetKey.collection !== collection) {
        setResetKey({ isOpen, collection });
        if (isOpen) {
            setName(collection?.name ?? '');
            setDescription(collection?.description ?? '');
            // New collections get a random color so picking one is optional.
            setColor(collection?.color ?? randomColorKey());
            setIsPrivate(collection?.isPrivate ?? false);
            setPinSetupOpen(false);
            setBusy(false);
        }
    }

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

    if (!isOpen) return null;

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!uid || !trimmed || busy) return;
        setBusy(true);
        try {
            if (isEdit && collection) {
                // A collection can't be private AND have a public page — going
                // private tears the share down first.
                if (isPrivate && !collection.isPrivate && collection.isPublic) {
                    await unpublishCollection(uid, collection);
                }
                await updateCollection(uid, collection.id, {
                    name: trimmed,
                    description: description.trim() || undefined,
                    color,
                    isPrivate,
                });
                toast.success('Collection updated');
                onSaved?.(collection.id);
            } else {
                const id = await createCollection(uid, {
                    name: trimmed,
                    description: description.trim() || undefined,
                    color,
                    isPrivate,
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
            <div ref={scrimRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={isEdit ? 'Edit collection' : 'New collection'}
                className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up sm:animate-scale-up safe-pb"
            >
                {/* Grab handle + header: the drag-to-dismiss zone on mobile. */}
                <div {...handleProps}>
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>

                    <div className="flex items-center gap-3 px-5 pt-3 pb-4 border-b border-border-subtle">
                        <Layers className="w-5 h-5 text-accent" />
                        <h3 className="flex-1 text-lg font-bold text-text">
                            {isEdit ? 'Edit collection' : 'New collection'}
                        </h3>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
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

                    {/* Private — behind the app-level privacy PIN (lib/privacyLock). */}
                    <div className="rounded-xl bg-background p-3.5">
                        <div className="flex items-center gap-3">
                            <Lock className={`w-4 h-4 shrink-0 ${isPrivate ? 'text-accent' : 'text-text-muted'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-text">Private</div>
                                <p className="mt-0.5 text-[11px] text-text-muted leading-snug">
                                    Requires your PIN to open. Its cards become private too —
                                    hidden from your library, search, and suggestions; they
                                    live only in here and under Show → Private.
                                    {collection?.isPublic && isPrivate && !collection?.isPrivate
                                        ? ' Saving will also stop sharing its public page.'
                                        : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isPrivate}
                                aria-label="Private collection"
                                onClick={() => {
                                    if (isPrivate) { setIsPrivate(false); return; }
                                    // First private collection ever → set up the vault PIN.
                                    if (hasPin) setIsPrivate(true);
                                    else setPinSetupOpen(true);
                                }}
                                className={`relative w-11 h-[26px] rounded-full transition-colors shrink-0 ${isPrivate ? 'bg-accent' : 'bg-fill-strong'}`}
                            >
                                <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${isPrivate ? 'start-[21px]' : 'start-[3px]'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-fill-subtle text-text font-medium hover:bg-fill-strong transition-colors"
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

            {/* First-time PIN setup — opens above this sheet (z-120 > z-100). */}
            {uid && (
                <PinLockModal
                    uid={uid}
                    mode="setup"
                    isOpen={pinSetupOpen}
                    onClose={() => setPinSetupOpen(false)}
                    onSuccess={() => setIsPrivate(true)}
                />
            )}
        </div>
    );
}
