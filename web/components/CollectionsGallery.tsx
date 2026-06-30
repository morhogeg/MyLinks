'use client';

import { useMemo, useState } from 'react';
import { Collection, Link } from '@/lib/types';
import { Plus, MoreHorizontal, Pencil, Share2, Trash2, Globe, LayoutGrid } from 'lucide-react';
import { getColorStyleByKey } from '@/lib/colors';

interface CollectionsGalleryProps {
    collections: Collection[];
    links: Link[];
    onOpen: (collectionId: string) => void;
    onNew: () => void;
    onEdit: (collection: Collection) => void;
    onShare: (collection: Collection) => void;
    onDelete: (collection: Collection) => void;
    onManageCards: (collection: Collection) => void;
}

/**
 * The dedicated Collections view: a responsive grid of "cover" tiles.
 * Card counts and cover thumbnails are derived from the already-loaded feed,
 * so this needs no extra reads. Tapping a tile opens the collection (the parent
 * scopes the feed to it); a per-tile menu exposes edit / share / delete.
 */
export default function CollectionsGallery({
    collections,
    links,
    onOpen,
    onNew,
    onEdit,
    onShare,
    onDelete,
    onManageCards,
}: CollectionsGalleryProps) {
    const [menuFor, setMenuFor] = useState<string | null>(null);

    // Per-collection count + first available cover thumbnail, derived once.
    const meta = useMemo(() => {
        const counts: Record<string, number> = {};
        const covers: Record<string, string> = {};
        for (const link of links) {
            for (const cid of link.collectionIds ?? []) {
                counts[cid] = (counts[cid] || 0) + 1;
                if (!covers[cid] && link.metadata?.thumbnailUrl) {
                    covers[cid] = link.metadata.thumbnailUrl;
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
            {/* New collection tile */}
            <button
                onClick={onNew}
                className="group flex flex-col items-center justify-center gap-2 min-h-[160px] rounded-2xl border-2 border-dashed border-border-subtle text-text-muted hover:text-accent hover:border-accent/40 transition-colors"
            >
                <span className="w-12 h-12 rounded-2xl bg-card border border-border-subtle flex items-center justify-center group-hover:border-accent/40 transition-colors">
                    <Plus className="w-6 h-6" />
                </span>
                <span className="text-sm font-semibold">New collection</span>
            </button>

            {sorted.map((c) => {
                const style = getColorStyleByKey(c.color || c.name);
                const count = meta.counts[c.id] || 0;
                const cover = c.coverLinkId
                    ? links.find((l) => l.id === c.coverLinkId)?.metadata?.thumbnailUrl
                    : meta.covers[c.id];
                const open = menuFor === c.id;
                return (
                    <div
                        key={c.id}
                        className={`group relative min-h-[160px] rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-card)] cursor-pointer transition-shadow [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] hover:border-accent/30 ${open ? 'z-30' : ''}`}
                        onClick={() => onOpen(c.id)}
                    >
                        {/* Cover / colored header — only this clips, so the menu can overflow the tile. */}
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

                        {/* Actions trigger — sits on the tile (not the clipped cover). */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setMenuFor(open ? null : c.id); }}
                            aria-label="Collection actions"
                            className="absolute top-2 end-2 p-1.5 rounded-full bg-black/45 backdrop-blur-sm text-white/90 hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {open && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} />
                                <div
                                    className="absolute top-11 end-2 z-50 w-44 rounded-xl bg-card border border-white/10 shadow-2xl overflow-hidden py-1"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MenuRow icon={<LayoutGrid className="w-4 h-4" />} label="Manage cards" onClick={() => { setMenuFor(null); onManageCards(c); }} />
                                    <MenuRow icon={<Share2 className="w-4 h-4" />} label={c.isPublic ? 'Share / manage' : 'Share'} onClick={() => { setMenuFor(null); onShare(c); }} />
                                    <MenuRow icon={<Pencil className="w-4 h-4" />} label="Edit" onClick={() => { setMenuFor(null); onEdit(c); }} />
                                    <MenuRow icon={<Trash2 className="w-4 h-4" />} label="Delete" danger onClick={() => { setMenuFor(null); onDelete(c); }} />
                                </div>
                            </>
                        )}

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
        </div>
    );
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text hover:bg-white/5'}`}
        >
            <span className="shrink-0">{icon}</span>
            {label}
        </button>
    );
}
