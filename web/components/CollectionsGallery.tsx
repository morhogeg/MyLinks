'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collection, Link } from '@/lib/types';
import { MoreHorizontal, Pencil, Share2, Trash2, Globe, LayoutGrid } from 'lucide-react';
import { getColorStyleByKey } from '@/lib/colors';
import { httpsImageSrc } from '@/lib/safeUrl';

interface CollectionsGalleryProps {
    collections: Collection[];
    links: Link[];
    onOpen: (collectionId: string) => void;
    onEdit: (collection: Collection) => void;
    onShare: (collection: Collection) => void;
    onDelete: (collection: Collection) => void;
    onManageCards: (collection: Collection) => void;
}

/**
 * The dedicated Collections view: a responsive grid of "cover" tiles.
 * Card counts and cover thumbnails are derived from the already-loaded feed,
 * so this needs no extra reads. Tapping a tile opens the collection (the parent
 * scopes the feed to it); a per-tile menu exposes manage / edit / share / delete.
 * Creating a collection lives in the page header's "+" button, not here.
 */
export default function CollectionsGallery({
    collections,
    links,
    onOpen,
    onEdit,
    onShare,
    onDelete,
    onManageCards,
}: CollectionsGalleryProps) {
    // The open menu is rendered in a portal anchored to its trigger's screen
    // rect, so it can never be clipped by a tile's bounds or stacking context.
    const [menu, setMenu] = useState<{ collection: Collection; rect: DOMRect } | null>(null);

    const openMenu = (collection: Collection, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenu((cur) => (cur?.collection.id === collection.id ? null : { collection, rect }));
    };

    // Per-collection count + first available cover thumbnail, derived once.
    const meta = useMemo(() => {
        const counts: Record<string, number> = {};
        const covers: Record<string, string> = {};
        for (const link of links) {
            for (const cid of link.collectionIds ?? []) {
                counts[cid] = (counts[cid] || 0) + 1;
                const thumb = httpsImageSrc(link.metadata?.thumbnailUrl);
                if (!covers[cid] && thumb) {
                    covers[cid] = thumb;
                }
            }
        }
        return { counts, covers };
    }, [links]);

    const sorted = useMemo(
        () => [...collections].sort((a, b) => b.updatedAt - a.updatedAt),
        [collections]
    );

    return (
        <div className="grid gap-4 sm:gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
            {sorted.map((c) => {
                const style = getColorStyleByKey(c.color || c.name);
                const count = meta.counts[c.id] || 0;
                const cover = c.coverLinkId
                    ? httpsImageSrc(links.find((l) => l.id === c.coverLinkId)?.metadata?.thumbnailUrl)
                    : meta.covers[c.id];
                const open = menu?.collection.id === c.id;
                return (
                    <div
                        key={c.id}
                        className={`group relative min-h-[160px] rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-card)] cursor-pointer transition-shadow [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] hover:border-accent/30 ${open ? 'z-20' : ''}`}
                        onClick={() => onOpen(c.id)}
                    >
                        {/* Cover / colored header. */}
                        <div className="relative h-24 w-full overflow-hidden rounded-t-2xl" style={{ backgroundColor: style.backgroundColor }}>
                            {cover && (
                                <img src={cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                            {/* Public badge */}
                            {c.isPublic && (
                                <span className="absolute top-2 start-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wide text-white">
                                    <Globe className="w-2.5 h-2.5" /> Shared
                                </span>
                            )}
                        </div>

                        {/* Actions trigger — sits on the tile (not the clipped cover).
                            A full 44px hit target (M-P3) with a compact 32px visible
                            circle nested inside, so the touch area meets iOS's minimum
                            without a heavy-looking chip. */}
                        <button
                            onClick={(e) => openMenu(c, e)}
                            aria-label="Collection actions"
                            aria-haspopup="menu"
                            aria-expanded={open}
                            className="group/menu absolute top-1 end-1 w-11 h-11 flex items-center justify-center text-white/90 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                        >
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/45 backdrop-blur-sm group-hover/menu:bg-black/70 transition-colors">
                                <MoreHorizontal className="w-4 h-4" />
                            </span>
                        </button>

                        {/* Title + count */}
                        <div className="p-3.5">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                                <h3 className="flex-1 font-bold text-text text-[15px] leading-tight truncate" title={c.name}>{c.name}</h3>
                            </div>
                            {c.description && (
                                <p className="mt-1 text-xs text-text-muted line-clamp-2">{c.description}</p>
                            )}
                            <p className="mt-2 text-[11px] font-semibold text-text-muted/70">
                                {count} {count === 1 ? 'card' : 'cards'}
                            </p>
                        </div>
                    </div>
                );
            })}

            {menu && (
                <CollectionMenu
                    anchor={menu.rect}
                    isPublic={menu.collection.isPublic}
                    onClose={() => setMenu(null)}
                    onManageCards={() => { onManageCards(menu.collection); setMenu(null); }}
                    onShare={() => { onShare(menu.collection); setMenu(null); }}
                    onEdit={() => { onEdit(menu.collection); setMenu(null); }}
                    onDelete={() => { onDelete(menu.collection); setMenu(null); }}
                />
            )}
        </div>
    );
}

/** A portal dropdown anchored to a trigger's screen rect. Rendered at the document
 *  root with fixed positioning so no ancestor `overflow`/stacking can clip it. */
function CollectionMenu({
    anchor, isPublic, onClose, onManageCards, onShare, onEdit, onDelete,
}: {
    anchor: DOMRect;
    isPublic?: boolean;
    onClose: () => void;
    onManageCards: () => void;
    onShare: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const WIDTH = 184;
    const EST_H = 196; // ~4 rows — only used to decide whether to flip upward.

    // Position is derived from the trigger's rect alone (computed once on the
    // client — this component never renders during SSR). Clamp horizontally; when
    // there isn't room below, anchor the menu's *bottom* just above the trigger
    // via CSS `bottom`, so it sits flush regardless of its real height.
    const left = Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8));
    const flipUp = anchor.bottom + 6 + EST_H > window.innerHeight - 8 && anchor.top > EST_H;
    const vertical = flipUp
        ? { bottom: window.innerHeight - anchor.top + 6 }
        : { top: anchor.bottom + 6 };

    // Close on Escape or any scroll/resize (the anchor rect would go stale).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onScroll = () => onClose();
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [onClose]);

    return createPortal(
        <>
            <div className="fixed inset-0 z-[90]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
            <div
                role="menu"
                style={{ position: 'fixed', left, width: WIDTH, ...vertical }}
                className="z-[91] rounded-xl bg-card border border-white/10 shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <MenuRow icon={<LayoutGrid className="w-4 h-4" />} label="Manage cards" onClick={onManageCards} />
                <MenuRow icon={<Share2 className="w-4 h-4" />} label={isPublic ? 'Share / manage' : 'Share'} onClick={onShare} />
                <MenuRow icon={<Pencil className="w-4 h-4" />} label="Edit" onClick={onEdit} />
                <MenuRow icon={<Trash2 className="w-4 h-4" />} label="Delete" danger onClick={onDelete} />
            </div>
        </>,
        document.body,
    );
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            role="menuitem"
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-3 min-h-[44px] text-sm font-medium transition-colors ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text hover:bg-white/5'}`}
        >
            <span className="shrink-0">{icon}</span>
            {label}
        </button>
    );
}
