'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collection, Link } from '@/lib/types';
import { MoreHorizontal, Pencil, Share2, Trash2, Globe, LayoutGrid, Sparkles, Plus, X, Layers, Lock } from 'lucide-react';
import { getColorStyleByKey } from '@/lib/colors';
import { isShareStale } from '@/lib/collections';
import { CollectionSuggestion } from '@/lib/collectionSuggest';

interface CollectionsGalleryProps {
    collections: Collection[];
    links: Link[];
    /** Auto-detected topic clusters the user can turn into collections in one tap. */
    suggestions?: CollectionSuggestion[];
    /** Private collections whose vault is currently locked — tiles are masked
     *  (no covers, description, or count) and the parent gates every action
     *  behind the PIN. Omit/empty when the vault is unlocked. */
    lockedIds?: Set<string>;
    onOpen: (collectionId: string) => void;
    onEdit: (collection: Collection) => void;
    onShare: (collection: Collection) => void;
    onDelete: (collection: Collection) => void;
    onManageCards: (collection: Collection) => void;
    onCreate?: () => void;
    onCreateSuggestion?: (s: CollectionSuggestion) => void;
    onDismissSuggestion?: (s: CollectionSuggestion) => void;
}

/**
 * The dedicated Collections view: a responsive grid of "cover" tiles.
 * Card counts and cover mosaics (up to 4 member thumbnails) are derived from
 * the already-loaded feed, so this needs no extra reads. Tapping a tile opens
 * the collection (the parent scopes the feed to it); a per-tile menu exposes
 * manage / edit / share / delete. Published tiles flag when the public page has
 * drifted from the live collection. Below the grid, suggested collections
 * (clustered client-side from tags/concepts) invite one-tap creation.
 * Creating a collection lives in the page header's "+" button, not here.
 */
export default function CollectionsGallery({
    collections,
    links,
    suggestions = [],
    lockedIds,
    onOpen,
    onEdit,
    onShare,
    onDelete,
    onManageCards,
    onCreate,
    onCreateSuggestion,
    onDismissSuggestion,
}: CollectionsGalleryProps) {
    // The open menu is rendered in a portal anchored to its trigger's screen
    // rect, so it can never be clipped by a tile's bounds or stacking context.
    const [menu, setMenu] = useState<{ collection: Collection; rect: DOMRect } | null>(null);

    const openMenu = (collection: Collection, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenu((cur) => (cur?.collection.id === collection.id ? null : { collection, rect }));
    };

    // Per-collection count, member ids (for share-staleness), and up to 4
    // member thumbnails for the mosaic cover — derived once per feed change.
    const meta = useMemo(() => {
        const counts: Record<string, number> = {};
        const covers: Record<string, string[]> = {};
        const members: Record<string, { id: string }[]> = {};
        for (const link of links) {
            for (const cid of link.collectionIds ?? []) {
                counts[cid] = (counts[cid] || 0) + 1;
                (members[cid] ||= []).push({ id: link.id });
                const thumb = link.metadata?.thumbnailUrl;
                if (thumb && (covers[cid]?.length ?? 0) < 4) {
                    (covers[cid] ||= []).push(thumb);
                }
            }
        }
        return { counts, covers, members };
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
                const locked = lockedIds?.has(c.id) ?? false;
                // Explicit cover first, then mosaic fill from member thumbnails.
                // Locked tiles show nothing of their contents — just the color.
                const explicitCover = c.coverLinkId
                    ? links.find((l) => l.id === c.coverLinkId)?.metadata?.thumbnailUrl
                    : undefined;
                const thumbs = locked ? [] : explicitCover
                    ? [explicitCover, ...(meta.covers[c.id] ?? []).filter((t) => t !== explicitCover)].slice(0, 4)
                    : meta.covers[c.id] ?? [];
                const stale = isShareStale(c, meta.members[c.id] ?? []);
                const open = menu?.collection.id === c.id;
                return (
                    <div
                        key={c.id}
                        className={`group relative min-h-[160px] rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-card)] cursor-pointer transition-shadow [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] hover:border-accent/30 ${open ? 'z-20' : ''}`}
                        onClick={() => onOpen(c.id)}
                    >
                        {/* Cover — a mosaic of member thumbnails over the collection color. */}
                        <div className="relative h-24 w-full overflow-hidden rounded-t-2xl" style={{ backgroundColor: style.backgroundColor }}>
                            {locked && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                    <Lock className="w-7 h-7 text-white/80" />
                                </span>
                            )}
                            {thumbs.length > 0 && (
                                <div className={`absolute inset-0 grid gap-px ${thumbs.length >= 4 ? 'grid-cols-2 grid-rows-2' : thumbs.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {thumbs.map((t, i) => (
                                        <img key={i} src={t} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    ))}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                            {/* Private badge — always shown on private collections so the
                                lock state is visible even when the vault is open. */}
                            {c.isPrivate && (
                                <span className="absolute top-2 start-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full backdrop-blur-sm bg-black/55 text-[9px] font-bold uppercase tracking-wide text-white">
                                    <Lock className="w-2.5 h-2.5" /> Private
                                </span>
                            )}
                            {/* Public badge — amber when the page is behind the live collection. */}
                            {c.isPublic && !c.isPrivate && (
                                <span className={`absolute top-2 start-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full backdrop-blur-sm text-[9px] font-bold uppercase tracking-wide text-white ${stale ? 'bg-amber-600/80' : 'bg-black/55'}`}>
                                    <Globe className="w-2.5 h-2.5" /> {stale ? 'Update link' : 'Shared'}
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
                            {c.description && !locked && (
                                <p className="mt-1 text-xs text-text-muted line-clamp-2">{c.description}</p>
                            )}
                            <p className="mt-2 text-[11px] font-semibold text-text-muted/70">
                                {locked ? 'Locked' : `${count} ${count === 1 ? 'card' : 'cards'}`}
                            </p>
                        </div>
                    </div>
                );
            })}

            {/* Suggested collections — topic clusters detected in the feed. Dashed
                treatment keeps them clearly "not yours yet"; Create adopts the
                cluster, the X dismisses that topic for good. */}
            {suggestions.map((s) => (
                <div
                    key={s.key}
                    className="relative min-h-[160px] rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] flex flex-col"
                >
                    <div className="relative h-24 w-full overflow-hidden rounded-t-2xl">
                        {s.thumbnails.length > 0 && (
                            <div className={`absolute inset-0 grid gap-px opacity-60 ${s.thumbnails.length >= 4 ? 'grid-cols-2 grid-rows-2' : s.thumbnails.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {s.thumbnails.map((t, i) => (
                                    <img key={i} src={t} alt="" loading="lazy" className="w-full h-full object-cover" />
                                ))}
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                        <span className="absolute top-2 start-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/85 text-[9px] font-bold uppercase tracking-wide text-white">
                            <Sparkles className="w-2.5 h-2.5" /> Suggested
                        </span>
                        {onDismissSuggestion && (
                            <button
                                onClick={() => onDismissSuggestion(s)}
                                aria-label={`Dismiss suggestion ${s.name}`}
                                className="absolute top-1 end-1 w-9 h-9 flex items-center justify-center text-white/80 hover:text-white"
                            >
                                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black/45 backdrop-blur-sm">
                                    <X className="w-3.5 h-3.5" />
                                </span>
                            </button>
                        )}
                    </div>
                    <div className="flex-1 flex flex-col p-3.5">
                        <h3 className="font-bold text-text text-[15px] leading-tight truncate" title={s.name}>{s.name}</h3>
                        <p className="mt-0.5 text-[11px] font-semibold text-text-muted/70">
                            {s.linkIds.length} cards ready to group
                        </p>
                        <button
                            onClick={() => onCreateSuggestion?.(s)}
                            className="mt-auto self-start inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Create
                        </button>
                    </div>
                </div>
            ))}

            {/* Empty state — nothing created and nothing to suggest yet. */}
            {sorted.length === 0 && suggestions.length === 0 && (
                <div className="col-span-full flex flex-col items-center text-center py-16 px-6">
                    <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-4">
                        <Layers className="w-7 h-7 text-accent" />
                    </span>
                    <h3 className="text-base font-bold text-text">Group your saves into collections</h3>
                    <p className="mt-1.5 max-w-xs text-sm text-text-muted leading-relaxed">
                        A collection is a curated set of cards — a research topic, a reading list,
                        a trip plan — that you can browse in one place and share as a beautiful public page.
                    </p>
                    {onCreate && (
                        <button
                            onClick={onCreate}
                            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold hover:bg-accent-hover transition-colors"
                        >
                            <Plus className="w-4 h-4" /> New collection
                        </button>
                    )}
                </div>
            )}

            {menu && (
                <CollectionMenu
                    anchor={menu.rect}
                    isPublic={menu.collection.isPublic}
                    isPrivate={menu.collection.isPrivate}
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
    anchor, isPublic, isPrivate, onClose, onManageCards, onShare, onEdit, onDelete,
}: {
    anchor: DOMRect;
    isPublic?: boolean;
    isPrivate?: boolean;
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
                className="z-[91] rounded-xl bg-card border border-border-strong shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <MenuRow icon={<LayoutGrid className="w-4 h-4" />} label="Manage cards" onClick={onManageCards} />
                {/* A private collection can't have a public page — no Share entry. */}
                {!isPrivate && (
                    <MenuRow icon={<Share2 className="w-4 h-4" />} label={isPublic ? 'Share / manage' : 'Share'} onClick={onShare} />
                )}
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
            className={`w-full flex items-center gap-2.5 px-3 py-3 min-h-[44px] text-sm font-medium transition-colors ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text hover:bg-fill-subtle'}`}
        >
            <span className="shrink-0">{icon}</span>
            {label}
        </button>
    );
}
