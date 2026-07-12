'use client';

import { useEffect, useMemo, useState } from 'react';
import { Collection, Link } from '@/lib/types';
import {
    X, Globe, Share2, Copy, Check, ExternalLink, RefreshCw, Layers, Lock,
} from 'lucide-react';
import { getColorStyleByKey } from '@/lib/colors';
import { publishCollection, unpublishCollection, isShareStale } from '@/lib/collections';
import { shareLink, shareUrlFor, openExternal } from '@/lib/share';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { track } from '@/lib/analytics';
import { useScrollLock } from '@/lib/useScrollLock';

interface ShareCollectionSheetProps {
    uid: string | null;
    /** The live collection doc (from the feed's onSnapshot). */
    collection: Collection;
    /** The collection's current member cards — what a (re)publish would snapshot. */
    memberLinks: Link[];
    isOpen: boolean;
    onClose: () => void;
}

/**
 * The sharing home for a collection. Replaces the old blind flow (tap Share →
 * instant publish → OS sheet) with a sheet that shows exactly what goes public
 * before it does: a preview of the page, an explicit Publish step, copy/open/
 * share actions once live, an "Update the public page" prompt when the
 * collection has drifted from its published snapshot, and Stop sharing.
 *
 * Publishing writes a frozen snapshot (no live link back to the account), so
 * the sheet also carries the one privacy sentence users need to trust it.
 */
export default function ShareCollectionSheet({
    uid,
    collection,
    memberLinks,
    isOpen,
    onClose,
}: ShareCollectionSheetProps) {
    const toast = useToast();
    const [busy, setBusy] = useState<'publish' | 'unpublish' | null>(null);
    const [copied, setCopied] = useState(false);
    // Keep the sheet inside the visible viewport (keyboard never opens here,
    // but the shared modal pattern keeps behavior consistent app-wide).
    const vp = useVisualViewport();

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    const isPublic = !!collection.isPublic && !!collection.shareId;
    const stale = useMemo(() => isShareStale(collection, memberLinks), [collection, memberLinks]);
    const url = collection.shareId ? shareUrlFor(`/c?id=${collection.shareId}`) : null;
    const style = getColorStyleByKey(collection.color || collection.name);
    const thumbs = useMemo(
        () => memberLinks.map((l) => l.metadata?.thumbnailUrl).filter((t): t is string => !!t).slice(0, 4),
        [memberLinks]
    );

    if (!isOpen) return null;

    const count = memberLinks.length;

    const doPublish = async () => {
        if (!uid || busy) return;
        setBusy('publish');
        try {
            await publishCollection(uid, collection, memberLinks);
            track(isPublic ? 'collection_share_updated' : 'collection_shared', { cards: count });
            toast.success(isPublic ? 'Public page updated' : 'Collection is now live');
        } catch {
            toast.error("Couldn't publish the collection. Please try again.");
        } finally {
            setBusy(null);
        }
    };

    const doUnpublish = async () => {
        if (!uid || busy) return;
        setBusy('unpublish');
        try {
            await unpublishCollection(uid, collection);
            toast.success('Sharing turned off — the public page is gone');
        } catch {
            toast.error("Couldn't stop sharing. Please try again.");
        } finally {
            setBusy(null);
        }
    };

    const doCopy = async () => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Couldn't copy the link.");
        }
    };

    const doShare = async () => {
        if (!url) return;
        const outcome = await shareLink(url, collection.name, `${collection.name} — a collection on Machina`);
        if (outcome === 'copied') toast.success('Share link copied to clipboard');
        else if (outcome === 'failed') toast.error("Couldn't open the share sheet.");
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
                aria-label={`Share ${collection.name}`}
                className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up sm:animate-scale-up safe-pb"
            >
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                    <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-3 pb-4 border-b border-border-subtle">
                    <Share2 className="w-5 h-5 text-accent shrink-0" />
                    <h3 className="flex-1 text-lg font-bold text-text truncate">Share collection</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Preview of what the public page leads with. */}
                    <div className="rounded-2xl border border-border-subtle overflow-hidden">
                        <div className="relative h-24" style={{ backgroundColor: style.backgroundColor }}>
                            {thumbs.length > 0 && (
                                <div className={`absolute inset-0 grid gap-px ${thumbs.length >= 4 ? 'grid-cols-2 grid-rows-2' : thumbs.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {thumbs.map((t, i) => (
                                        <img key={i} src={t} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    ))}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute bottom-2 start-3 end-3 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                                <span className="text-sm font-bold text-white truncate drop-shadow">{collection.name}</span>
                            </div>
                        </div>
                        <div className="px-3.5 py-2.5 flex items-center gap-2 text-xs text-text-muted">
                            <Layers className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1 truncate">
                                {count} {count === 1 ? 'card' : 'cards'}
                                {collection.description ? ` · ${collection.description}` : ''}
                            </span>
                        </div>
                    </div>

                    {!isPublic ? (
                        <>
                            <p className="text-sm text-text-muted leading-relaxed">
                                Publishing creates a public page with a snapshot of these {count === 1 ? 'card' : `${count} cards`} —
                                titles, summaries, and sources. Anyone with the link can view it; nothing
                                identifies you, and your library stays private.
                            </p>
                            <button
                                onClick={doPublish}
                                disabled={!uid || busy !== null || count === 0}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
                            >
                                <Globe className="w-4 h-4" />
                                {busy === 'publish' ? 'Publishing…' : 'Publish public page'}
                            </button>
                            {count === 0 && (
                                <p className="text-xs text-text-muted text-center">Add a card first — an empty collection has nothing to show.</p>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Live status + the link itself. */}
                            <div className="rounded-xl bg-fill-subtle px-3.5 py-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-xs font-semibold">
                                    <span className="flex items-center gap-1.5 text-green-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        Public
                                    </span>
                                    {collection.publishedAt && (
                                        <span className="text-text-muted font-medium">
                                            · updated {new Date(collection.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="flex-1 text-[13px] text-text truncate font-mono" dir="ltr">{url}</span>
                                    <button
                                        onClick={doCopy}
                                        aria-label="Copy link"
                                        className="flex items-center justify-center w-9 h-9 rounded-lg bg-card border border-border-subtle text-text-muted hover:text-accent hover:border-accent/40 transition-colors shrink-0"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Drift between the live collection and the frozen snapshot. */}
                            {stale && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
                                    <RefreshCw className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="flex-1 text-[13px] text-text leading-snug">
                                        This collection changed since you published. The public page still shows the old version.
                                    </div>
                                    <button
                                        onClick={doPublish}
                                        disabled={busy !== null}
                                        className="shrink-0 px-3 h-8 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-40"
                                    >
                                        {busy === 'publish' ? 'Updating…' : 'Update'}
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={doShare}
                                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent-hover transition-colors"
                                >
                                    <Share2 className="w-4 h-4" />
                                    Share link
                                </button>
                                <button
                                    onClick={() => url && openExternal(url)}
                                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-fill-subtle text-text font-semibold hover:bg-fill-strong transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    View page
                                </button>
                            </div>

                            <button
                                onClick={doUnpublish}
                                disabled={busy !== null}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            >
                                <Lock className="w-4 h-4" />
                                {busy === 'unpublish' ? 'Stopping…' : 'Stop sharing'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
