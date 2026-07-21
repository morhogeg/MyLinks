'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/types';
import { Sparkles, X, Plus } from 'lucide-react';
import { CollectionSuggestion } from '@/lib/collectionSuggest';
import SourceByline from '@/components/SourceByline';
import { getDirection } from '@/lib/rtl';
import { useScrollLock } from '@/lib/useScrollLock';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { hapticMedium, hapticLight } from '@/lib/haptics';

interface SuggestionPreviewSheetProps {
    suggestion: CollectionSuggestion;
    /** The suggestion's member cards, already resolved from the feed (order preserved). */
    members: Link[];
    /** Adopt the suggestion, creating a collection from the cards the user KEPT. */
    onCreate: (linkIds: string[]) => void;
    onDismiss: () => void;
    onClose: () => void;
    /** Open a card in its full detail view (peek before deciding to keep it). */
    onOpenCard: (linkId: string) => void;
    /** Hide the sheet (kept state preserved) while a peeked card is open over it —
     *  the detail modal sits at a lower z-index, so the sheet must step aside. */
    hidden?: boolean;
}

/**
 * Preview — and curate — a suggested collection before adopting it. The gallery
 * tile only says "12 cards ready to group"; this sheet answers "which 12?" and
 * lets the user drop the ones that don't belong, so Create adopts an edited set
 * rather than a blind one. Each row is the card as the feed renders it
 * (thumbnail only when the card actually has one + title + shared byline) with a
 * remove (✕); Create saves whatever's left, Dismiss buries the topic.
 *
 * Structure mirrors AddToCollectionSheet — bottom sheet on mobile (drag handle,
 * flick-to-dismiss), centered modal on desktop — so the whole app's sheets share
 * one language.
 */
export default function SuggestionPreviewSheet({
    suggestion,
    members,
    onCreate,
    onDismiss,
    onClose,
    onOpenCard,
    hidden = false,
}: SuggestionPreviewSheetProps) {
    const vp = useVisualViewport();
    useScrollLock(true);

    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });

    // Which member cards the user still wants. Starts as all of them; removing a
    // row drops it here (client-only — nothing is written until Create). Reset
    // when a different suggestion is opened into the same sheet instance.
    const [kept, setKept] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
    const [key, setKey] = useState(suggestion.key);
    if (key !== suggestion.key) {
        setKey(suggestion.key);
        setKept(new Set(members.map((m) => m.id)));
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const nameDir = getDirection(suggestion.name);
    const shown = useMemo(() => members.filter((m) => kept.has(m.id)), [members, kept]);

    const remove = (id: string) => {
        hapticLight();
        setKept((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleCreate = () => {
        if (shown.length === 0) return;
        hapticMedium();
        onCreate(shown.map((m) => m.id));
    };

    return (
        <div
            className={`fixed inset-x-0 z-[95] flex items-end sm:items-center justify-center animate-fade-in ${hidden ? 'hidden' : ''}`}
            style={{ top: vp.offsetTop || 0, height: vp.height || '100%', bottom: 'auto' }}
        >
            <div ref={scrimRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={`Preview suggested collection ${suggestion.name}`}
                className="relative w-full sm:max-w-md bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb max-h-full sm:max-h-[80vh] flex flex-col"
            >
                {/* Grab handle + header — the drag-to-dismiss zone on mobile. */}
                <div {...handleProps}>
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>

                    <div className="flex items-center gap-3 px-5 pt-2 pb-3 border-b border-border-subtle">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 shrink-0">
                            <Sparkles className="w-3.5 h-3.5 text-accent" />
                        </span>
                        <div className="flex-1 min-w-0" dir={nameDir}>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Suggested</p>
                            <p className={`text-[15px] font-bold text-text truncate ${nameDir === 'rtl' ? 'font-hebrew' : ''}`}>
                                {suggestion.name}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="p-2 -me-2 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Member cards — curate the set before adopting. Removing the last
                    card is disallowed (Create needs at least one). */}
                <div className="flex-1 overflow-y-auto py-1">
                    <p className="px-5 pt-2 pb-1 text-[11px] font-semibold text-text-muted/70">
                        {shown.length} {shown.length === 1 ? 'card' : 'cards'} · remove any that don’t fit
                    </p>
                    {shown.map((link) => {
                        const dir = getDirection(link.title, link.language);
                        const thumb = link.metadata?.thumbnailUrl;
                        return (
                            // The row opens the card so the user can read it in full
                            // before deciding to keep it; the ✕ removes it (and stops
                            // the tap from also opening it).
                            <div
                                key={link.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onOpenCard(link.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCard(link.id); } }}
                                aria-label={`Open ${link.title}`}
                                className="group flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors hover:bg-fill-subtle active:bg-fill-strong"
                            >
                                {/* Thumbnail only when the card actually has one — no
                                    generic placeholder box for text/social cards. */}
                                {thumb && (
                                    <span className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-fill-subtle">
                                        <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    </span>
                                )}
                                <div className="flex-1 min-w-0" dir={dir}>
                                    <h3 className={`line-clamp-2 text-[14px] font-semibold leading-snug text-text ${dir === 'rtl' ? 'font-hebrew' : ''}`}>
                                        {link.title}
                                    </h3>
                                    <div className="mt-0.5 flex">
                                        <SourceByline link={link} />
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); remove(link.id); }}
                                    aria-label={`Remove ${link.title} from this suggestion`}
                                    className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-text-muted hover:text-text hover:bg-card active:bg-fill-strong transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Actions — adopt the kept cards or bury the topic. */}
                <div className="border-t border-border-subtle p-3 flex items-center gap-2">
                    <button
                        onClick={onDismiss}
                        className="px-4 h-11 rounded-full text-sm font-semibold text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                    >
                        Dismiss
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={shown.length === 0}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover active:scale-[0.99] transition-all disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <Plus className="w-4 h-4" /> Create collection
                    </button>
                </div>
            </div>
        </div>
    );
}
