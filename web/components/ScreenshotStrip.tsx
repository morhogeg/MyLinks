'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { hapticLight, hapticSelection } from '@/lib/haptics';

export interface PickedImage {
    id: string;
    file: File;
    preview: string;
}

/** Wrap picked files as strip items (object-URL previews; the owner revokes). */
export function toPickedImages(files: File[]): PickedImage[] {
    return files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
    }));
}

/**
 * The ORDERED screenshot strip: one row of equal tiles in the order the card
 * will read them, with number badges, a remove button per tile, drag to
 * reorder, and a "+" tile while there is room. Shared by the + button's Image
 * tab (screenshots that become a new card) and the "Add screenshots" tray on a
 * partial card (screenshots that complete it), so both read and feel the same.
 *
 * Drag-to-reorder is pointer-based so it works identically for touch and
 * mouse. The grid is a single row of COLUMNS equal columns, so the target slot
 * is pure x-position math; the array reorders LIVE under the finger (tiles are
 * keyed by id, so React moves the nodes and pointer capture keeps the events
 * flowing to the grabbed tile).
 */
const COLUMNS = 5;

export default function ScreenshotStrip({
    images,
    setImages,
    max,
    addInputId,
    disabled = false,
    isRtl = false,
}: {
    images: PickedImage[];
    setImages: (update: (prev: PickedImage[]) => PickedImage[]) => void;
    /** How many tiles fit; the "+" tile shows while there is room. */
    max: number;
    /** The hidden file input the "+" tile opens (a <label htmlFor>). */
    addInputId: string;
    disabled?: boolean;
    isRtl?: boolean;
}) {
    const stripRef = useRef<HTMLDivElement>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    // Latest images for the pointer handlers (synced after render, read only
    // in events).
    const imagesRef = useRef(images);
    useEffect(() => { imagesRef.current = images; }, [images]);

    const removeImage = (id: string) => {
        setImages((prev) => {
            const gone = prev.find((im) => im.id === id);
            if (gone) URL.revokeObjectURL(gone.preview);
            return prev.filter((im) => im.id !== id);
        });
    };

    const slotFromX = (clientX: number) => {
        const el = stripRef.current;
        if (!el) return -1;
        const rect = el.getBoundingClientRect();
        // The grid lays out in reading direction; mirror the math under RTL.
        const x = isRtl ? rect.right - clientX : clientX - rect.left;
        const slot = Math.floor((x / rect.width) * COLUMNS);
        return Math.max(0, Math.min(imagesRef.current.length - 1, slot));
    };

    const onTilePointerDown = (e: React.PointerEvent, id: string) => {
        if (disabled || images.length < 2) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        // Pickup buzz: the tile is "lifted" (it also rings + scales) so the user
        // knows the drag has started before they move a millimeter.
        hapticLight();
        setDragId(id);
    };

    const onTilePointerMove = (e: React.PointerEvent) => {
        if (!dragId) return;
        const to = slotFromX(e.clientX);
        if (to < 0) return;
        const from = imagesRef.current.findIndex((im) => im.id === dragId);
        if (from === -1 || from === to) return;
        // The reorder is otherwise easy to miss (tiles swap under the finger),
        // so every crossed slot ticks — the same detent feel as an iOS picker.
        hapticSelection();
        setImages((prev) => {
            const prevFrom = prev.findIndex((im) => im.id === dragId);
            if (prevFrom === -1 || prevFrom === to) return prev;
            const next = [...prev];
            const [moved] = next.splice(prevFrom, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const endImageDrag = () => {
        // Drop buzz: confirms the new order is committed.
        if (dragId) hapticLight();
        setDragId(null);
    };

    return (
        <div ref={stripRef} className="grid grid-cols-5 gap-2" dir={isRtl ? 'rtl' : 'ltr'}>
            {images.map((im, i) => (
                <div
                    key={im.id}
                    onPointerDown={(e) => onTilePointerDown(e, im.id)}
                    onPointerMove={onTilePointerMove}
                    onPointerUp={endImageDrag}
                    onPointerCancel={endImageDrag}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden border select-none touch-none transition-all duration-200 ${dragId === im.id
                        ? 'border-transparent ring-2 ring-accent scale-105 shadow-xl z-10'
                        : 'border-border-subtle'
                        } ${images.length > 1 && !disabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                    <img
                        src={im.preview}
                        alt={`Image ${i + 1}`}
                        draggable={false}
                        className="w-full h-full object-cover pointer-events-none"
                    />
                    {images.length > 1 && (
                        <span className="absolute bottom-1 start-1 min-w-4 h-4 px-1 rounded-full bg-black/65 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
                            {i + 1}
                        </span>
                    )}
                    {!disabled && (
                        <button
                            type="button"
                            aria-label={`Remove image ${i + 1}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => removeImage(im.id)}
                            className="absolute top-1 end-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85 active:scale-90 transition-all"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            ))}
            {images.length < max && !disabled && (
                <label
                    htmlFor={addInputId}
                    aria-label="Add another image"
                    className="aspect-[3/4] rounded-xl border-2 border-dashed border-border-strong flex items-center justify-center cursor-pointer text-text-muted transition-all hover:border-accent/50 hover:text-accent hover:bg-fill-subtle"
                >
                    <Plus className="w-4 h-4" />
                </label>
            )}
        </div>
    );
}
