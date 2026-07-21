'use client';

import { useEffect } from 'react';
import { Link } from '@/lib/types';
import { Image as ImageIcon, Sparkles, X, Plus } from 'lucide-react';
import { CollectionSuggestion } from '@/lib/collectionSuggest';
import SourceByline from '@/components/SourceByline';
import { getDirection } from '@/lib/rtl';
import { useScrollLock } from '@/lib/useScrollLock';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { hapticMedium } from '@/lib/haptics';

interface SuggestionPreviewSheetProps {
    suggestion: CollectionSuggestion;
    /** The suggestion's member cards, already resolved from the feed (order preserved). */
    members: Link[];
    onCreate: () => void;
    onDismiss: () => void;
    onClose: () => void;
}

/**
 * Preview a suggested collection before adopting it. The gallery tile only says
 * "12 cards ready to group" — this sheet answers "which 12?", so accepting or
 * permanently dismissing a suggestion is an informed choice rather than a blind
 * one. Read-only: it lists the member cards (thumbnail + title + shared byline)
 * exactly as the feed renders them, then offers Create (adopt) or Dismiss.
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
}: SuggestionPreviewSheetProps) {
    const vp = useVisualViewport();
    useScrollLock(true);

    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const nameDir = getDirection(suggestion.name);

    const handleCreate = () => {
        hapticMedium();
        onCreate();
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

                {/* Member cards — exactly what adopting this suggestion would group. */}
                <div className="flex-1 overflow-y-auto py-1">
                    <p className="px-5 pt-2 pb-1 text-[11px] font-semibold text-text-muted/70">
                        {members.length} {members.length === 1 ? 'card' : 'cards'} in this suggestion
                    </p>
                    {members.map((link) => {
                        const dir = getDirection(link.title, link.language);
                        const thumb = link.metadata?.thumbnailUrl;
                        return (
                            <div key={link.id} className="flex items-center gap-3 px-5 py-2.5">
                                <span className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-fill-subtle flex items-center justify-center">
                                    {thumb ? (
                                        <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    ) : (
                                        <ImageIcon className="w-5 h-5 text-text-muted/50" />
                                    )}
                                </span>
                                <div className="flex-1 min-w-0" dir={dir}>
                                    <h3 className={`line-clamp-2 text-[14px] font-semibold leading-snug text-text ${dir === 'rtl' ? 'font-hebrew' : ''}`}>
                                        {link.title}
                                    </h3>
                                    <div className="mt-0.5 flex">
                                        <SourceByline link={link} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Actions — adopt or dismiss the whole suggestion. */}
                <div className="border-t border-border-subtle p-3 flex items-center gap-2">
                    <button
                        onClick={onDismiss}
                        className="px-4 h-11 rounded-full text-sm font-semibold text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                    >
                        Dismiss
                    </button>
                    <button
                        onClick={handleCreate}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover active:scale-[0.99] transition-all"
                    >
                        <Plus className="w-4 h-4" /> Create collection
                    </button>
                </div>
            </div>
        </div>
    );
}
