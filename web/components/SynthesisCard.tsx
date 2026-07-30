'use client';

import { useState } from 'react';
import { ChevronDown, X, Star, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { WeeklySynthesis, UserNote } from '@/lib/types';
import { synthesisWeekLabel } from '@/lib/synthesis';
import { makeNote, touchNote } from '@/lib/notes';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/**
 * The weekly "What you learned" synthesis (M12), in two modes.
 *
 *  - In the FEED it's a collapsed banner; tapping expands the recap in place,
 *    and the X dismisses this week's banner (the write-up itself survives in
 *    the Digest archive — dismiss must never destroy).
 *  - In the DIGEST it renders `alwaysOpen`: a proper article header, no
 *    chevron, no dismiss, because reaching it was already a deliberate choice.
 *
 * Layout contract (owner QA): this is long-form prose, so the body is capped at
 * a reading measure (68ch — the top of Bringhurst's comfortable range, chosen to
 * use the desktop pane without becoming a 1700px line) and CENTERED. Everything
 * else — themes, standout, question, notes — sits in that same column so the eye
 * returns to one left edge.
 *
 * The synthesis text itself is written server-side (functions/digest_service.py
 * → ai_service.synthesize_week); this component only presents it.
 */
export default function SynthesisCard({
    synthesis,
    onOpenCard,
    onDismiss,
    alwaysOpen = false,
    notes,
    onSaveNotes,
}: {
    synthesis: WeeklySynthesis;
    onOpenCard: (id: string) => void;
    /** Feed only — omit in the archive, where there is nothing to dismiss. */
    onDismiss?: () => void;
    /** Skip the collapse chrome and render the full recap (Digest reader). */
    alwaysOpen?: boolean;
    /** This week's notes, newest first. */
    notes?: UserNote[];
    /** Persist the whole list (add / edit / delete all route through here).
     *  Omit to hide the notes section entirely. */
    onSaveNotes?: (notes: UserNote[]) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const open = alwaysOpen || expanded;

    // Note composer state. `editingId` null = the "add" box; a note id = editing
    // that note in place. Both share one draft, so only one is ever open.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState('');

    const cardById = new Map(synthesis.cards.map((c) => [c.id, c]));
    const standout = synthesis.standoutCardId ? cardById.get(synthesis.standoutCardId) : undefined;
    const paragraphs = synthesis.narrative.split('\n').map((p) => p.trim()).filter(Boolean);
    const weekLabel = synthesisWeekLabel(synthesis);
    const savesLabel = `${synthesis.cardCount} ${synthesis.cardCount === 1 ? 'save' : 'saves'}`;

    const toggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        hapticMedium();
        onDismiss?.();
    };

    const openCard = (id: string) => {
        hapticLight();
        onOpenCard(id);
    };

    const noteList = notes ?? [];

    const startAdd = () => {
        hapticLight();
        setEditingId(null);
        setDraft('');
        setComposing(true);
    };
    const startEdit = (n: UserNote) => {
        hapticLight();
        setEditingId(n.id);
        setDraft(n.text);
        setComposing(true);
    };
    const cancelCompose = () => {
        setComposing(false);
        setEditingId(null);
        setDraft('');
    };
    const commitDraft = () => {
        const text = draft.trim();
        if (!text) return cancelCompose();
        hapticLight();
        onSaveNotes?.(editingId
            ? noteList.map((n) => (n.id === editingId ? touchNote(n, text) : n))
            : [makeNote(text), ...noteList]);
        cancelCompose();
    };
    const removeNote = (id: string) => {
        hapticMedium();
        onSaveNotes?.(noteList.filter((n) => n.id !== id));
        if (editingId === id) cancelCompose();
    };

    /** One card reference, wherever it appears. Deliberately NOT accent-colored:
     *  a theme with six links became a wall of blue: the arrow carries the
     *  affordance and the accent arrives on hover. */
    const CardLink = ({ id, title }: { id: string; title: string }) => (
        <button
            onClick={() => openCard(id)}
            className="group flex w-full items-start gap-2 py-1 text-start text-[14.5px] leading-relaxed text-text-secondary hover:text-accent transition-colors min-h-[30px]"
        >
            <ArrowRight className="mt-[5px] w-3.5 h-3.5 shrink-0 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
            <span dir="auto">{title}</span>
        </button>
    );

    return (
        <div className="mb-4 rounded-2xl border border-accent/25 bg-card overflow-hidden shadow-lg shadow-accent/5 animate-in fade-in slide-in-from-top-1 duration-300">
            {/* Header. In the feed it's the collapse toggle; in the archive it's
                a static masthead for the piece. */}
            {alwaysOpen ? (
                <div className="px-4 pt-5 pb-4 sm:px-6">
                    <div className="mx-auto w-full max-w-[68ch]">
                        {/* Machina's own mark, bare — a generic AI sparkle said
                            "some assistant wrote this" (owner QA), and a rounded
                            container around the glyph reads as a shrunken app
                            icon rather than the brand mark (see Wordmark.tsx). */}
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                            <CitationGlyph className="w-3 h-auto" />
                            This week in Machina
                        </div>
                        <h2 dir="auto" className="mt-2 text-[22px] sm:text-[26px] font-bold text-text leading-tight tracking-[-0.01em]">
                            {synthesis.title}
                        </h2>
                        <div className="mt-1.5 text-[13px] text-text-muted">
                            {weekLabel ? `${weekLabel} · ${savesLabel}` : savesLabel}
                        </div>
                    </div>
                </div>
            ) : (
                <button
                    onClick={toggle}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[44px] hover:bg-card-hover transition-colors"
                    aria-expanded={expanded}
                >
                    <div className="flex-grow min-w-0">
                        {/* Same mark as the archive header — the old gradient
                            tile held a generic AI sparkle, and the brand glyph
                            must not sit in a rounded container (Wordmark.tsx),
                            so the tile went with it. */}
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
                            <CitationGlyph className="w-3 h-auto" />
                            This week in Machina
                        </div>
                        <div dir="auto" className="text-[15px] font-bold text-text truncate">
                            {synthesis.title}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="hidden sm:block text-xs text-text-muted mr-1">{savesLabel}</span>
                        {onDismiss && (
                            <button
                                onClick={handleDismiss}
                                aria-label="Dismiss weekly recap"
                                title="Hide from the feed — it stays in your Digest"
                                className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <ChevronDown
                            className={`w-5 h-5 text-text-secondary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                            style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                        />
                    </div>
                </button>
            )}

            {open && (
                <div
                    className={`px-4 pb-6 sm:px-6 ${alwaysOpen ? '' : 'pt-4 border-t border-border'}`}
                    style={alwaysOpen ? undefined : { animation: 'slide-up 0.3s var(--ease-modal)' }}
                >
                    <div className="mx-auto w-full max-w-[68ch]">
                        {/* Narrative. The opening paragraph is the lead — a
                            notch larger, so the piece has a way in. */}
                        {paragraphs.map((p, i) => (
                            <p
                                key={i}
                                dir="auto"
                                className={
                                    i === 0
                                        ? 'text-[16px] leading-[1.7] text-text'
                                        : 'mt-4 text-[15px] leading-[1.75] text-text-secondary'
                                }
                            >
                                {p}
                            </p>
                        ))}

                        {synthesis.themes.map((theme, i) => (
                            <section key={i} className="mt-8 pt-6 border-t border-border-subtle first:border-t-0">
                                <h3 dir="auto" className="text-[17px] font-bold text-text leading-snug tracking-[-0.01em]">
                                    {theme.title}
                                </h3>
                                {theme.insight && (
                                    <p dir="auto" className="mt-1.5 text-[15px] leading-[1.7] text-text-secondary">
                                        {theme.insight}
                                    </p>
                                )}
                                <div className="mt-3 flex flex-col ps-0.5">
                                    {theme.cardIds.map((id) => {
                                        const c = cardById.get(id);
                                        if (!c) return null;
                                        return <CardLink key={id} id={id} title={c.title} />;
                                    })}
                                </div>
                            </section>
                        ))}

                        {standout && (
                            <button
                                onClick={() => openCard(standout.id)}
                                className="mt-8 w-full text-start rounded-2xl border border-border bg-card-hover px-5 py-4 hover:border-accent/40 transition-colors"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                                    <Star className="w-3.5 h-3.5" /> Standout
                                </div>
                                <div dir="auto" className="mt-1.5 text-[15.5px] font-bold text-text leading-snug">
                                    {standout.title}
                                </div>
                                {synthesis.standoutReason && (
                                    <div dir="auto" className="mt-1 text-[14.5px] leading-[1.7] text-text-secondary">
                                        {synthesis.standoutReason}
                                    </div>
                                )}
                            </button>
                        )}

                        {synthesis.openQuestion && (
                            <div className="mt-4 rounded-2xl bg-card-hover px-5 py-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                                    Worth sitting with
                                </div>
                                <div dir="auto" className="mt-1.5 text-[15.5px] leading-[1.7] text-text italic">
                                    {synthesis.openQuestion}
                                </div>
                            </div>
                        )}

                        {/* Your notes — the one part of this page the USER
                            writes. Last, because it's a response to everything
                            above; same column, so it reads as a margin note on
                            the week rather than a separate feature. Notes live
                            in their own Firestore doc (lib/synthesis.ts) — the
                            synthesis itself stays function-owned. */}
                        {onSaveNotes && (
                            <section className="mt-8 pt-6 border-t border-border-subtle">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                                        Your notes
                                    </h3>
                                    {!composing && (
                                        <button
                                            onClick={startAdd}
                                            className="inline-flex items-center gap-1.5 h-8 ps-2 pe-3 rounded-full border border-border-strong bg-card text-[13px] font-bold text-text hover:bg-card-hover active:scale-[0.98] transition-all cursor-pointer"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add a note
                                        </button>
                                    )}
                                </div>

                                {composing && (
                                    <div className="mt-3">
                                        <textarea
                                            dir="auto"
                                            autoFocus
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Escape') cancelCompose();
                                                // ⌘/Ctrl+Enter saves; plain Enter keeps making paragraphs.
                                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitDraft();
                                            }}
                                            rows={3}
                                            placeholder="What do you want to remember about this week?"
                                            className="w-full rounded-xl border border-border bg-card-hover px-3.5 py-2.5 text-[14.5px] leading-[1.7] text-text placeholder:text-text-muted resize-y focus:outline-none focus:border-accent/50 transition-colors"
                                        />
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                onClick={commitDraft}
                                                disabled={!draft.trim()}
                                                className="h-9 px-4 rounded-full bg-accent text-accent-ink text-[13px] font-bold hover:bg-accent-hover active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
                                            >
                                                {editingId ? 'Save' : 'Add note'}
                                            </button>
                                            <button
                                                onClick={cancelCompose}
                                                className="h-9 px-4 rounded-full border border-border-strong bg-card text-[13px] font-bold text-text hover:bg-card-hover active:scale-[0.98] transition-all cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {noteList.length > 0 ? (
                                    <div className="mt-3 flex flex-col gap-2">
                                        {noteList.map((n) => (
                                            <div
                                                key={n.id}
                                                className="group rounded-xl border border-border-subtle bg-card-hover px-4 py-3"
                                            >
                                                <p dir="auto" className="text-[14.5px] leading-[1.7] text-text whitespace-pre-wrap">
                                                    {n.text}
                                                </p>
                                                <div className="mt-1.5 flex items-center gap-1">
                                                    <span className="text-[11px] text-text-muted">
                                                        {new Date(n.updatedAt ?? n.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                        {n.updatedAt ? ' · edited' : ''}
                                                    </span>
                                                    <span className="flex-1" />
                                                    <button
                                                        onClick={() => startEdit(n)}
                                                        aria-label="Edit note"
                                                        title="Edit"
                                                        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-card transition-colors cursor-pointer"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => removeNote(n.id)}
                                                        aria-label="Delete note"
                                                        title="Delete"
                                                        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-text-muted hover:text-danger hover:bg-card transition-colors cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : !composing && (
                                    <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
                                        Nothing yet — jot down what you want to carry forward from this week.
                                    </p>
                                )}
                            </section>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
