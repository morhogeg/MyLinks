'use client';

import { useEffect, useState } from 'react';
import {
    X, Globe, Share2, Copy, Check, ExternalLink, Lock, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import { ChatSource, Link } from '@/lib/types';
import { newShareId } from '@/lib/collections';
import { publishAnswer, unpublishAnswer, resolveShareableSources, PublicAnswerSource } from '@/lib/answerShare';
import { shareLink, shareUrlFor, openExternal } from '@/lib/share';
import { useToast } from '@/components/Toast';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { track } from '@/lib/analytics';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { getDominantDirection } from '@/lib/rtl';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { reportError } from '@/lib/errorReporter';

interface ShareAnswerSheetProps {
    uid: string | null;
    /** The question, as asked. */
    question: string;
    /** The answer markdown, exactly as the chat rendered it. */
    answer: string;
    /** The cards the answer cited (empty for an ungrounded answer). */
    sources: ChatSource[];
    /** True when Machina could not tie the answer to any save. */
    ungrounded?: boolean;
    /** The live feed, for resolving citations without a read. */
    links: Link[];
    /** Ids of the PIN-locked private collections — never published. */
    privateCollectionIds: Set<string>;
    /** The public page's id while one exists. */
    shareId?: string;
    /** Publish/unpublish result, so the chat message can remember it. */
    onShareIdChange: (shareId: string | null) => void;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * The sharing home for one Ask answer, modelled on ShareCollectionSheet: it
 * shows exactly what goes public BEFORE it does, then keeps the link, the
 * native share sheet, and Stop sharing in one place.
 *
 * The one thing it does that no other share surface does is refuse. Every cited
 * card is checked against the privacy vault first (lib/answerShare); a card in
 * a PIN-locked collection is dropped from the snapshot, and an answer built
 * only from those cards cannot be shared at all. That check runs on open, so
 * the refusal is visible before the user reaches for the button.
 */
export default function ShareAnswerSheet({
    uid,
    question,
    answer,
    sources,
    ungrounded,
    links,
    privateCollectionIds,
    shareId,
    onShareIdChange,
    isOpen,
    onClose,
}: ShareAnswerSheetProps) {
    const toast = useToast();
    const [busy, setBusy] = useState<'publish' | 'unpublish' | null>(null);
    const [copied, setCopied] = useState(false);
    // What the public page may carry. Null while the vault check is running.
    const [allowed, setAllowed] = useState<{
        shareable: PublicAnswerSource[];
        withheldPrivate: number;
        withheldMissing: number;
    } | null>(null);
    const vp = useVisualViewport();

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    // Resolve the citations against the privacy vault every time the sheet
    // opens — the vault can be locked or unlocked, and a card can be moved into
    // a private collection, between one share and the next.
    useEffect(() => {
        if (!isOpen || !uid) return;
        let cancelled = false;
        setAllowed(null);
        resolveShareableSources(uid, sources, links, privateCollectionIds)
            .then((result) => { if (!cancelled) setAllowed(result); })
            .catch((e) => {
                reportError(e, 'answer-share-resolve-sources');
                // Fail closed: with no verdict we publish nothing.
                if (!cancelled) setAllowed({ shareable: [], withheldPrivate: 0, withheldMissing: sources.length });
            });
        return () => { cancelled = true; };
    }, [isOpen, uid, sources, links, privateCollectionIds]);

    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile });

    if (!isOpen) return null;

    const isPublic = !!shareId;
    const url = shareId ? shareUrlFor(`/a?id=${shareId}`) : null;
    const qDir = getDominantDirection(question, 'ltr');
    const aDir = getDominantDirection(answer, qDir);

    // Every citation held back means there is nothing honest left to publish.
    // An UNGROUNDED answer cites nothing to begin with, so it is shareable as
    // what it is: an answer the page itself says is untied to any save.
    const checking = allowed === null;
    const blocked = !!allowed && sources.length > 0 && allowed.shareable.length === 0;
    const blockedCopy = allowed && allowed.withheldMissing === 0
        ? "This answer is built only from private cards, so it can't be shared."
        : "The cards this answer cited are private or no longer in your library, so it can't be shared.";

    const doPublish = async () => {
        if (!uid || busy || !allowed || blocked) return;
        setBusy('publish');
        const id = shareId || newShareId();
        try {
            await publishAnswer(uid, {
                shareId: id,
                question,
                answer,
                sources: allowed.shareable,
                ungrounded,
            });
            onShareIdChange(id);
            track('answer_shared', { sources: allowed.shareable.length });
            toast.success('Your answer is live');
        } catch {
            toast.error("Couldn't publish this answer. Please try again.");
        } finally {
            setBusy(null);
        }
    };

    const doUnpublish = async () => {
        if (!uid || busy || !shareId) return;
        setBusy('unpublish');
        try {
            await unpublishAnswer(uid, shareId);
            onShareIdChange(null);
            toast.success('Sharing turned off. The public page is gone');
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
        const outcome = await shareLink(url, question, 'Answered by Machina');
        if (outcome === 'copied') toast.success('Share link copied to clipboard');
        else if (outcome === 'failed') toast.error("Couldn't open the share sheet.");
    };

    const shownSources = allowed?.shareable ?? [];
    const withheldPrivate = allowed?.withheldPrivate ?? 0;

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
                aria-label="Share answer"
                className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up sm:animate-scale-up safe-pb"
            >
                {/* Grab handle + header: the drag-to-dismiss zone on mobile. */}
                <div {...handleProps}>
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>

                    <div className="flex items-center gap-3 px-5 pt-3 pb-4 border-b border-border-subtle">
                        <Share2 className="w-5 h-5 text-accent shrink-0" />
                        <h3 className="flex-1 text-lg font-bold text-text truncate">Share answer</h3>
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
                    {/* What the page leads with: the question, then the answer's
                        opening. Both take their own direction from their own text,
                        so a Hebrew answer to an English question reads correctly. */}
                    <div className="rounded-2xl border border-border-subtle overflow-hidden">
                        <div className="px-4 pt-3.5 pb-3">
                            <div className="flex items-center gap-1.5 mb-2 text-text-muted">
                                <CitationGlyph className="h-3 w-auto shrink-0 text-accent" />
                                <span className="text-[11px] font-bold uppercase tracking-wider">Machina answer</span>
                            </div>
                            <p dir={qDir} className="text-sm font-bold text-text leading-snug line-clamp-2 text-start">
                                {question}
                            </p>
                            <p dir={aDir} className="mt-1.5 text-[13px] text-text-muted leading-snug line-clamp-3 text-start">
                                {answer}
                            </p>
                        </div>
                        {shownSources.length > 0 && (
                            <div className="border-t border-border-subtle px-4 py-2.5 space-y-1">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                                    Sources on the page
                                </p>
                                {shownSources.slice(0, 4).map((s, i) => (
                                    <p key={i} dir="auto" className="text-xs text-text-secondary truncate text-start">
                                        {s.title}
                                    </p>
                                ))}
                                {shownSources.length > 4 && (
                                    <p className="text-xs text-text-muted">
                                        and {shownSources.length - 4} more
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {checking ? (
                        <p className="text-sm text-text-muted text-center py-2">Checking the sources…</p>
                    ) : blocked ? (
                        <div className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-fill-subtle px-3.5 py-3">
                            <Lock className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                            <p className="flex-1 text-[13px] text-text leading-snug">{blockedCopy}</p>
                        </div>
                    ) : !isPublic ? (
                        <>
                            <p className="text-sm text-text-muted leading-relaxed">
                                Sharing creates a page with the question, this answer, and the sources it
                                cites. Anyone with the link can view it. Nothing identifies you, and the
                                page links to the original sources, never to your cards.
                            </p>
                            {withheldPrivate > 0 && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-fill-subtle px-3.5 py-3">
                                    <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                    <p className="flex-1 text-[13px] text-text leading-snug">
                                        {withheldPrivate === 1
                                            ? '1 private card is left out of the public page.'
                                            : `${withheldPrivate} private cards are left out of the public page.`}
                                    </p>
                                </div>
                            )}
                            {ungrounded && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-fill-subtle px-3.5 py-3">
                                    <TriangleAlert className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                                    <p className="flex-1 text-[13px] text-text leading-snug">
                                        This answer is not tied to any of your saves. The page says so too.
                                    </p>
                                </div>
                            )}
                            <button
                                onClick={doPublish}
                                disabled={!uid || busy !== null}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-ink font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
                            >
                                <Globe className="w-4 h-4" />
                                {busy === 'publish' ? 'Creating…' : 'Create share link'}
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="rounded-xl bg-fill-subtle px-3.5 py-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-xs font-semibold">
                                    <span className="flex items-center gap-1.5 text-green-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        Public
                                    </span>
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

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={doShare}
                                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-ink font-semibold hover:bg-accent-hover transition-colors"
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
