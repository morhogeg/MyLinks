'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import SourceByline from './SourceByline';
import SimpleMarkdown from './SimpleMarkdown';
import { hasHebrew } from '@/lib/rtl';
import { hapticLight } from '@/lib/haptics';
import { Check, Archive, Bell, RotateCcw, Sparkles, Info, X, Star } from 'lucide-react';
import { REVIEW_SESSION_SIZE, isOpen, reviewSessionQueue } from '@/lib/reviewQueue';

type SwipeDir = 'left' | 'right' | 'up';
type Phase = 'idle' | 'dragging' | 'exiting' | 'waiting';
type ActionKind = 'keep' | 'archive' | 'remind';

interface SwipeDeckProps {
    links: Link[];
    /** Keep the card exactly where it is — stamp (`true`) or clear (`false`,
     *  used by Undo) the "reviewed" marker. No status change, no favorite. */
    onKeep: (link: Link, keep: boolean) => void;
    onArchive: (link: Link) => void;
    /** Open the reminder modal for `link` (resolves back via `remindSignal`). */
    onRemind: (link: Link) => void;
    onOpen: (link: Link) => void;
    /** Reverse an archive back to unread (used by Undo). */
    onResetStatus: (link: Link) => void;
    /** Clear a reminder that was just set (used by Undo of an up-swipe). */
    onCancelRemind: (link: Link) => void;
    /** Star/unstar the card in place, without advancing the deck — the card face's
     *  own button. Must be referentially stable: CardFace is memoized. */
    onToggleFavorite: (link: Link) => void;
    /** Outcome of the last reminder modal opened via `onRemind`: `saved` true if
     *  the user set a reminder, false if they cancelled/dismissed. `seq` bumps on
     *  every resolution so the same outcome twice still fires. */
    remindSignal?: { id: string; saved: boolean; seq: number } | null;
    /** Leave review and return to the previous card layout. Review is a focused
     *  mode (the bottom tab bar hides while it's open), so it owns its own exit. */
    onExit?: () => void;
}

const THRESHOLD = 110; // px past which a drag commits to a swipe

/** What each deck action actually does, in a few words. ONE source of truth for
 *  both surfaces: the desktop hover tooltip and the mobile ⓘ panel. Phrased as
 *  outcomes ("where does this card end up"), not as gesture names — the labels
 *  under the buttons already carry the arrows. */
const ACTION_HINTS = {
    undo: 'Take back the last card',
    archive: 'File it away, out of your feed',
    remind: 'Bring this card back later',
    keep: 'Leave it exactly where it is',
} as const;

/**
 * The interactive twin of the digest: a short, curated resurfacing session.
 * Swipe right to keep, left to archive, up to set a reminder; tap to open.
 *
 * "Keep" means exactly what it says: the card stays where it is, unchanged —
 * it is NOT favorited (right-swipe used to write `status: 'favorite'`, which
 * made a green star mean two things at once). Keep only stamps `reviewedAt`,
 * which rests the card from future sessions; favoriting lives in the card
 * detail view now.
 *
 * The session is dealt from ONE smart order (see lib/reviewQueue: forgotten
 * cards first, then newest unread, then the rest — no user-facing queue
 * selection), narrowed by the active feed filters. Card ORDER is snapshotted
 * per session (no mid-session reshuffle) but every card face reads LIVE data
 * from the `links` prop, and cards deleted or already acted on drop out.
 * Every action is reversible via Undo — including an up-swipe reminder (F-29).
 */
export default function SwipeDeck({
    links,
    onKeep,
    onArchive,
    onRemind,
    onOpen,
    onResetStatus,
    onCancelRemind,
    onToggleFavorite,
    remindSignal,
    onExit,
}: SwipeDeckProps) {
    // Ordered card ids for the current session window. Snapshotted so acting on a
    // card never reshuffles the stack mid-session (F-32 keeps order stable).
    const [sessionIds, setSessionIds] = useState<string[]>(
        () => reviewSessionQueue(links).slice(0, REVIEW_SESSION_SIZE).map((l) => l.id),
    );
    const [pos, setPos] = useState(0);
    const [drag, setDrag] = useState({ x: 0, y: 0 });
    const [phase, setPhase] = useState<Phase>('idle');
    const [lastAction, setLastAction] = useState<{ index: number; kind: ActionKind; link: Link } | null>(null);
    // Mobile-only ⓘ panel explaining the four actions (desktop gets hover tooltips).
    const [helpOpen, setHelpOpen] = useState(false);
    // Session tallies for the summary screen.
    const [kept, setKept] = useState(0);
    const [archived, setArchived] = useState(0);
    const [reminders, setReminders] = useState(0);

    const start = useRef({ x: 0, y: 0 });
    const moved = useRef(false);
    const exitDir = useRef<SwipeDir | null>(null);
    const pendingRemind = useRef<Link | null>(null);
    // Cards the user has undone this session. Undo optimistically reverses the
    // action, but the live `links` snapshot may lag a beat — without this
    // exception the just-undone card would be skipped as "acted on" for a frame.
    const undoneIds = useRef(new Set<string>());
    // Cards starred from the card face THIS session. Favoriting writes
    // `status: 'favorite'`, which reviewQueue.isOpen excludes — so without this
    // exception the card the user just starred would stop being dealable and
    // vanish from under their finger before they could swipe it. Starring is an
    // annotation, not a verdict: the card stays until they act on it.
    const favoritedIds = useRef(new Set<string>());

    // Live map so card faces render fresh data and deleted cards resolve to null.
    const byId = useMemo(() => {
        const m = new Map<string, Link>();
        for (const l of links) m.set(l.id, l);
        return m;
    }, [links]);

    // Session slots aligned to sessionIds (null = deleted since deal).
    const slots = useMemo(() => sessionIds.map((id) => byId.get(id) ?? null), [sessionIds, byId]);

    // A slot ahead of the pointer is dealable while its card is still open —
    // cards acted on OUTSIDE the deck's gestures mid-session (deleted, archived
    // elsewhere, reminder set from the detail modal) are skipped, not re-dealt.
    const isDealable = (l: Link | null): l is Link =>
        !!l && (isOpen(l) || undoneIds.current.has(l.id) || favoritedIds.current.has(l.id));

    // First dealable card at/after the pointer.
    let currentIndex = pos;
    while (currentIndex < slots.length && !isDealable(slots[currentIndex])) currentIndex++;
    const current = slots[currentIndex] ?? null;

    // The visible stack: up to three dealable cards from the current position on.
    const visible: Link[] = [];
    for (let i = currentIndex; i < slots.length && visible.length < 3; i++) {
        const l = slots[i];
        if (isDealable(l)) visible.push(l);
    }

    const passed = slots.slice(0, currentIndex).filter(Boolean).length;
    const remaining = slots.slice(currentIndex).filter(isDealable).length;

    // The full candidate pool drives the "review more" offer.
    const poolCount = useMemo(() => reviewSessionQueue(links).length, [links]);

    // Deal a fresh session window from the current live pool.
    const deal = () => {
        setSessionIds(reviewSessionQueue(links).slice(0, REVIEW_SESSION_SIZE).map((l) => l.id));
        setPos(0);
        setLastAction(null);
        setKept(0);
        setArchived(0);
        setReminders(0);
        setPhase('idle');
        setDrag({ x: 0, y: 0 });
        exitDir.current = null;
        pendingRemind.current = null;
        undoneIds.current = new Set();
        favoritedIds.current = new Set();
    };

    // Self-heal an empty, untouched session: the deck mounted before links
    // streamed in, or the feed filter changed under it and every dealt id
    // dropped out. Guarded to zero-activity states so a finished session's
    // summary (tallies or an undoable action present) is never skipped past.
    const acted = kept + archived + reminders;
    useEffect(() => {
        if (current || acted > 0 || lastAction || phase === 'waiting' || poolCount === 0) return;
        deal();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current, acted, lastAction, phase, poolCount]);

    // Size the deck to the space between its top and the viewport bottom so the
    // WHOLE deck (tabs + card + action buttons) fits on one screen with no page
    // scroll — a swipe deck that scrolls isn't a deck. Use visualViewport where
    // available (WKWebView/iOS: innerHeight can overstate the usable height),
    // and never force a floor taller than the space that actually exists.
    const rootRef = useRef<HTMLDivElement>(null);
    const [maxH, setMaxH] = useState(0);
    useEffect(() => {
        const update = () => {
            if (!rootRef.current) return;
            const top = rootRef.current.getBoundingClientRect().top;
            const vh = window.visualViewport?.height ?? window.innerHeight;
            // Fill the space from the deck's top to the bottom of the viewport
            // (a small gap only). The old 640 cap left a big dead band on tall
            // phones now that Review hides the tab bar; 900 keeps desktop sane
            // while letting phones fill. Bottom clearance for the home indicator
            // is a paddingBottom on the root, so it isn't double-counted here.
            setMaxH(Math.min(Math.max(320, vh - top - 8), 900));
        };
        update();
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        return () => {
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
        // Keyed on the current card too, not just the advance pointer: the deck
        // can mount on an empty pool (whose empty-state render has no rootRef)
        // and be dealt by the self-heal effect with pos unchanged — keyed only
        // on pos, the measure never re-ran and the stack rendered collapsed at
        // height 0 (the build-1067 first-tap bug).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pos, current?.id]);

    const settle = () => {
        setPhase('idle');
        setDrag({ x: 0, y: 0 });
        exitDir.current = null;
    };

    // Apply a left/right swipe: fire the action, advance past the card, remember
    // it for Undo. (Up-swipes go through startRemind instead.)
    const commit = (dir: 'left' | 'right') => {
        const link = current;
        if (!link) return settle();
        const idx = currentIndex;
        if (dir === 'right') {
            onKeep(link, true);
            setKept((k) => k + 1);
            setLastAction({ index: idx, kind: 'keep', link });
        } else {
            onArchive(link);
            setArchived((a) => a + 1);
            setLastAction({ index: idx, kind: 'archive', link });
        }
        setPos(idx + 1);
        settle();
    };

    // Up-swipe: the card flew off, now open the reminder modal and hold here until
    // it resolves (via remindSignal) so a cancel returns the card to the deck.
    const startRemind = () => {
        const link = current;
        if (!link) return settle();
        pendingRemind.current = link;
        onRemind(link);
        setPhase('waiting'); // card stays off-screen (drag left at its fling position)
        exitDir.current = null;
    };

    // Resolve a pending reminder once the modal reports its outcome.
    useEffect(() => {
        if (!remindSignal) return;
        const link = pendingRemind.current;
        if (!link || link.id !== remindSignal.id) return;
        pendingRemind.current = null;
        if (remindSignal.saved) {
            const idx = sessionIds.indexOf(link.id);
            const at = idx >= 0 ? idx : pos;
            setReminders((r) => r + 1);
            setLastAction({ index: at, kind: 'remind', link });
            setPos(at + 1);
        }
        // Saved: advance (above) and reset — the reminded card unmounts. Cancelled:
        // pos unchanged, so resetting drag animates the same card back into place.
        settle();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remindSignal]);

    // Complete a fling exactly once — called by transitionend AND by a fallback
    // timer (WKWebView can drop transitionend, e.g. on backgrounding, which
    // would otherwise leave the deck stuck in 'exiting' and ignoring all input).
    // exitDir is nulled first so whichever fires second is a no-op.
    const finishExit = () => {
        const d = exitDir.current;
        if (!d) return;
        exitDir.current = null;
        if (d === 'up') startRemind();
        else commit(d);
    };
    const finishExitRef = useRef(finishExit);
    finishExitRef.current = finishExit;
    const flingSeq = useRef(0);

    // Animate the top card off-screen; the action fires on transitionend (or
    // the 420ms fallback — the transform transition runs 300ms). The seq token
    // keeps a stale timer from finishing a LATER fling early.
    const fling = (dir: SwipeDir) => {
        hapticLight(); // crisp tap at the moment the card commits to its action
        setHelpOpen(false); // the user is acting; the explainer has done its job
        exitDir.current = dir;
        const seq = ++flingSeq.current;
        window.setTimeout(() => {
            if (flingSeq.current === seq) finishExitRef.current();
        }, 420);
        setPhase('exiting');
        if (dir === 'right') setDrag({ x: window.innerWidth, y: 0 });
        else if (dir === 'left') setDrag({ x: -window.innerWidth, y: 0 });
        else setDrag({ x: 0, y: -window.innerHeight });
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (phase === 'exiting' || phase === 'waiting') return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = false;
        setPhase('dragging');
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (phase !== 'dragging') return;
        const x = e.clientX - start.current.x;
        const y = e.clientY - start.current.y;
        if (Math.abs(x) > 6 || Math.abs(y) > 6) moved.current = true;
        setDrag({ x, y });
    };

    const onPointerUp = () => {
        if (phase !== 'dragging') return;
        const { x, y } = drag;
        if (x > THRESHOLD) return fling('right');
        if (x < -THRESHOLD) return fling('left');
        if (y < -THRESHOLD) return fling('up');
        if (!moved.current && current) onOpen(current);
        setPhase('idle');
        setDrag({ x: 0, y: 0 });
    };

    // Star from the card face. Doesn't advance the deck and isn't undoable via the
    // Undo button (which owns the last *swipe*) — it's a toggle, so tapping again
    // is the undo. Stable identity keeps CardFace's memo intact across drag frames.
    const toggleFavorite = useCallback((link: Link) => {
        hapticLight();
        favoritedIds.current.add(link.id); // see favoritedIds: keeps the card dealable
        onToggleFavorite(link);
    }, [onToggleFavorite]);

    const undo = () => {
        if (!lastAction) return;
        const { link, kind, index } = lastAction;
        // Keep the card dealable while the optimistic reversal propagates into
        // the live `links` snapshot (see undoneIds).
        undoneIds.current.add(link.id);
        if (kind === 'remind') {
            onCancelRemind(link);
            setReminders((r) => Math.max(0, r - 1));
        } else if (kind === 'keep') {
            onKeep(link, false); // clear the reviewed stamp; nothing else moved
            setKept((k) => Math.max(0, k - 1));
        } else {
            onResetStatus(link);
            setArchived((a) => Math.max(0, a - 1));
        }
        setPos(index);
        setLastAction(null);
        settle();
    };

    // Desktop niceties: arrow keys drive the deck while Review mode is active.
    // No interference when a modal/input owns focus (waiting = reminder modal open).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (phase === 'exiting' || phase === 'waiting') return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            // Never drive the deck while a modal/sheet (card detail, reminder, etc.)
            // is open over it.
            if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
            if (e.key === 'Escape' && helpOpen) { e.preventDefault(); setHelpOpen(false); return; }
            if (e.key === 'Backspace') {
                if (lastAction) { e.preventDefault(); undo(); }
                return;
            }
            if (!current) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); fling('left'); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); fling('right'); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); fling('up'); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, current?.id, lastAction, pos, helpOpen]);

    // Hint overlays react to the live drag.
    const rightHint = Math.max(0, Math.min(1, drag.x / THRESHOLD));
    const leftHint = Math.max(0, Math.min(1, -drag.x / THRESHOLD));
    const upHint = Math.max(0, Math.min(1, -drag.y / THRESHOLD));

    if (!current) {
        const acted = kept + archived + reminders;
        const moreAvailable = poolCount > 0;
        return (
            <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-accent" strokeWidth={1.75} />
                </div>
                <h3 className="text-lg font-bold text-text">{acted > 0 ? 'Session complete' : 'All caught up'}</h3>
                {acted > 0 ? (
                    <p className="text-sm text-text-muted max-w-xs">
                        {[
                            kept > 0 ? `${kept} kept` : null,
                            archived > 0 ? `${archived} archived` : null,
                            reminders > 0 ? `${reminders} reminder${reminders === 1 ? '' : 's'} set` : null,
                        ]
                            .filter(Boolean)
                            .join(' · ') || 'All caught up.'}
                    </p>
                ) : (
                    <p className="text-sm text-text-muted max-w-xs">
                        Nothing to review right now. New saves show up here.
                    </p>
                )}
                <div className="flex items-center gap-3 mt-1">
                    {lastAction && (
                        <button
                            onClick={undo}
                            className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-card border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover transition-colors cursor-pointer text-sm font-semibold"
                        >
                            <RotateCcw className="w-4 h-4" /> Undo last
                        </button>
                    )}
                    {moreAvailable ? (
                        <button
                            onClick={deal}
                            className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-white transition-opacity hover:opacity-90 cursor-pointer text-sm font-semibold"
                            style={{ backgroundImage: 'var(--accent-gradient)' }}
                        >
                            Review {Math.min(REVIEW_SESSION_SIZE, poolCount)} more
                        </button>
                    ) : onExit && (
                        <button
                            onClick={onExit}
                            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-accent text-accent-ink transition-opacity hover:opacity-90 cursor-pointer text-sm font-semibold"
                        >
                            Done
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div ref={rootRef} className="flex flex-col items-center gap-3 select-none" style={{ height: maxH ? maxH : undefined, paddingBottom: 'max(calc(env(safe-area-inset-bottom) - 18px), 8px)' }}>
            <div className="w-full max-w-[440px] flex items-center justify-center shrink-0 relative">
                {/* Touch has no hover, so the tooltips need a tap target of their
                    own. Hidden on hover-capable pointers, where the buttons
                    explain themselves on hover instead. */}
                <button
                    onClick={() => { hapticLight(); setHelpOpen((o) => !o); }}
                    aria-label="What do these buttons do?"
                    aria-expanded={helpOpen}
                    className={`absolute start-0 h-7 w-7 -ms-1 rounded-full flex items-center justify-center transition-colors cursor-pointer [@media(hover:hover)]:hidden ${helpOpen ? 'text-accent bg-accent/10' : 'text-text-muted'}`}
                >
                    <Info className="w-[18px] h-[18px]" />
                </button>
                <span className="text-xs font-semibold text-text-muted tabular-nums">
                    {passed + 1} of {passed + remaining} · {remaining} left
                </span>
                {onExit && (
                    <button
                        onClick={onExit}
                        className="absolute end-0 text-[13px] font-semibold text-accent hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        Done
                    </button>
                )}
            </div>

            {/* Card stack — flexes to fill the space above the buttons */}
            <div className="relative w-full max-w-[440px] flex-1 min-h-0">
                {[2, 1, 0].map((depth) => {
                    const link = visible[depth];
                    if (!link) return null;
                    const isTop = depth === 0;

                    const transform = isTop
                        ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04}deg)`
                        : `translateY(${depth * 12}px) scale(${1 - depth * 0.04})`;

                    return (
                        <div
                            key={link.id}
                            onPointerDown={isTop ? onPointerDown : undefined}
                            onPointerMove={isTop ? onPointerMove : undefined}
                            onPointerUp={isTop ? onPointerUp : undefined}
                            onTransitionEnd={isTop && phase === 'exiting' ? finishExit : undefined}
                            className={`absolute inset-0 ${isTop ? 'cursor-grab active:cursor-grabbing z-30' : 'z-10'}`}
                            style={{
                                transform,
                                transition: phase === 'dragging' && isTop ? 'none' : 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
                                touchAction: 'none',
                                pointerEvents: isTop ? 'auto' : 'none',
                            }}
                        >
                            <CardFace link={link} onToggleFavorite={toggleFavorite} />
                            {isTop && (
                                <>
                                    <HintBadge label="KEEP" color="34,197,94" icon={<Check className="w-4 h-4" />} opacity={rightHint} pos="left" />
                                    <HintBadge label="ARCHIVE" color="59,130,246" icon={<Archive className="w-4 h-4" />} opacity={leftHint} pos="right" />
                                    <HintBadge label="REMIND" color="107,114,128" icon={<Bell className="w-4 h-4" />} opacity={upHint} pos="top" />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Action buttons — each labelled with the swipe direction it mirrors,
                so it's obvious what left/right/up do without having to try, and
                each carrying a hover tooltip (desktop) / ⓘ panel row (touch)
                spelling out where the card actually ends up. */}
            <div className="relative w-full max-w-[440px] flex items-end justify-center gap-3 shrink-0">
                {helpOpen && <ActionHelp onClose={() => setHelpOpen(false)} />}
                <DeckAction label="Undo" hint={ACTION_HINTS.undo} onClick={undo} disabled={!lastAction} buttonClassName="text-text-muted hover:text-text">
                    <RotateCcw className="w-5 h-5" />
                </DeckAction>
                <DeckAction label="← Archive" hint={ACTION_HINTS.archive} onClick={() => fling('left')} buttonClassName="text-blue-500 hover:bg-blue-500 hover:text-white border-blue-500/30">
                    <Archive className="w-6 h-6" />
                </DeckAction>
                <DeckAction label="↑ Remind" hint={ACTION_HINTS.remind} onClick={() => fling('up')} buttonClassName="text-accent hover:bg-accent hover:text-accent-ink border-accent/30">
                    <Bell className="w-6 h-6" />
                </DeckAction>
                <DeckAction label="Keep →" hint={ACTION_HINTS.keep} onClick={() => fling('right')} buttonClassName="text-green-500 hover:bg-green-500 hover:text-white border-green-500/30">
                    <Check className="w-6 h-6" />
                </DeckAction>
            </div>

        </div>
    );
}

/** A deck action: the round button, a small label spelling out the swipe
 *  direction it mirrors, and — on hover-capable pointers — a tooltip saying what
 *  the action actually does to the card. */
function DeckAction({ children, onClick, label, hint, disabled, buttonClassName = '' }: { children: React.ReactNode; onClick: () => void; label: string; hint: string; disabled?: boolean; buttonClassName?: string }) {
    return (
        <div className="group relative flex flex-col items-center gap-1.5">
            {/* Pure CSS (no hover state in React): the deck re-renders on every
                drag frame, and the media query keeps this off touch, where a tap
                would otherwise leave a tooltip stuck open. z-40 clears the card
                stack's z-30 — they share a stacking context. */}
            <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full mb-2 z-40 hidden [@media(hover:hover)]:block opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap rounded-lg bg-card border border-border-subtle shadow-[var(--shadow-card)] px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary"
            >
                {hint}
            </span>
            <DeckButton title={`${label}: ${hint}`} onClick={onClick} disabled={disabled} className={buttonClassName}>
                {children}
            </DeckButton>
            <span className={`text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${disabled ? 'text-text-muted/40' : 'text-text-muted'}`}>
                {label}
            </span>
        </div>
    );
}

/** The touch counterpart of the hover tooltips: one tap on the header's ⓘ
 *  explains all four actions at once, right above the buttons they describe. */
function ActionHelp({ onClose }: { onClose: () => void }) {
    const rows: { icon: React.ReactNode; label: string; hint: string }[] = [
        { icon: <Check className="w-4 h-4 text-green-500" />, label: 'Keep', hint: ACTION_HINTS.keep },
        { icon: <Archive className="w-4 h-4 text-blue-500" />, label: 'Archive', hint: ACTION_HINTS.archive },
        { icon: <Bell className="w-4 h-4 text-accent" />, label: 'Remind', hint: ACTION_HINTS.remind },
        { icon: <RotateCcw className="w-4 h-4 text-text-muted" />, label: 'Undo', hint: ACTION_HINTS.undo },
    ];
    return (
        // Deliberately NOT role="dialog": the deck's key handler treats any open
        // dialog as "a modal owns the screen" and stops driving the arrow keys.
        <div
            aria-label="What the review buttons do"
            className="absolute bottom-full inset-x-0 mb-3 z-40 rounded-2xl bg-card border border-border-subtle shadow-[var(--shadow-card)] p-3 pe-9"
            style={{ animation: 'slide-up 0.2s var(--ease-modal)' }}
        >
            <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-2 end-2 h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer"
            >
                <X className="w-4 h-4" />
            </button>
            <ul className="flex flex-col gap-2">
                {rows.map((r) => (
                    <li key={r.label} className="flex items-center gap-2.5">
                        <span className="w-6 h-6 shrink-0 rounded-lg bg-fill-subtle flex items-center justify-center">{r.icon}</span>
                        <span className="text-[13px] font-bold text-text">{r.label}</span>
                        <span className="text-[13px] text-text-muted">{r.hint}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DeckButton({ children, onClick, title, disabled, className = '' }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; className?: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            aria-label={title}
            className={`h-14 w-14 rounded-full bg-card border border-border-subtle flex items-center justify-center transition-all cursor-pointer shadow-sm disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
        >
            {children}
        </button>
    );
}

function HintBadge({ label, color, icon, opacity, pos }: { label: string; color: string; icon: React.ReactNode; opacity: number; pos: 'left' | 'right' | 'top' }) {
    const place =
        pos === 'left' ? 'top-6 left-6 -rotate-12' : pos === 'right' ? 'top-6 right-6 rotate-12' : 'top-6 left-1/2 -translate-x-1/2';
    return (
        <div
            className={`absolute ${place} flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black tracking-widest text-sm pointer-events-none`}
            style={{
                opacity,
                color: `rgb(${color})`,
                border: `2px solid rgb(${color})`,
                backgroundColor: `rgba(${color}, 0.12)`,
            }}
        >
            {icon}
            {label}
        </div>
    );
}

/** The visible card content (category, source, title, gist, tags).
 *  Memoized: the deck re-renders on every drag pointermove frame, and without
 *  the memo all three stacked faces would re-run SimpleMarkdown parsing at
 *  pointer-event rate — only the wrapper's transform changes per frame. */
const CardFace = memo(function CardFace({ link, onToggleFavorite }: { link: Link; onToggleFavorite: (link: Link) => void }) {
    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary);
    const colorStyle = getCategoryColorStyle(link.category);
    const isFavorite = link.status === 'favorite';

    return (
        <div className="h-full w-full surface-card bg-card rounded-2xl border border-border-subtle shadow-[var(--shadow-card)] p-5 sm:p-6 flex flex-col overflow-hidden">
            {/* Cover image (X/Instagram post, YouTube thumb): same fixed banner size
                as the feed card, full-bleed to the card edges. Top-anchored crop so
                the headline/subject stays visible. */}
            {!link.hideThumbnail && link.metadata?.thumbnailUrl && (
                <div className="-mx-5 -mt-5 sm:-mx-6 sm:-mt-6 mb-4 h-28 sm:h-32 shrink-0 relative bg-black/40 overflow-hidden">
                    <img
                        src={link.metadata.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/40 to-transparent" />
                </div>
            )}

            {/* Header: category + source byline + star */}
            <div className="flex items-center justify-between gap-2 mb-4">
                <span
                    className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg whitespace-nowrap"
                    style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                >
                    {link.category}
                </span>
                <div className="flex items-center gap-1 min-w-0">
                    <SourceByline link={link} />
                    {/* Favorite, on the card face rather than as a fifth deck button —
                        it's an annotation you make BEFORE deciding where the card goes,
                        not a fourth destination. Same styling as the open card's top-bar
                        star (LinkDetailModal) so one glyph means one thing app-wide.
                        stopPropagation on pointerdown is load-bearing: without it the tap
                        starts a drag (and the deck's onPointerUp opens the card). */}
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(link);
                        }}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={isFavorite}
                        /* -my-2 keeps the 40px tap target from growing the header row. */
                        className={`shrink-0 -my-2 -me-1.5 h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${isFavorite
                            ? 'bg-yellow-500/10 text-yellow-500'
                            : 'text-text-muted hover:text-yellow-500 hover:bg-card-hover'
                            }`}
                    >
                        <Star className={`w-[18px] h-[18px] ${isFavorite ? 'fill-current' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Title */}
            <h3 dir="auto" className={`font-bold text-xl sm:text-2xl text-text leading-tight mb-3 line-clamp-2 ${isRtl ? 'text-right' : ''}`}>
                {link.title}
            </h3>

            {/* Highlighted gist — clamped; tap opens full details */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
                <SimpleMarkdown content={link.summary} isCompact isRtl={isRtl} />
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
            </div>

            {/* Tags */}
            {link.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-subtle">
                    {link.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-fill-subtle text-text-muted/60">
                            {tag.split('/').pop()}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
});
