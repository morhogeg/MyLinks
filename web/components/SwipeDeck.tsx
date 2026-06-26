'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { getPlatform, platformIcon, platformColor, xHandle, linkedinDisplayName } from '@/lib/platform';
import SimpleMarkdown from './SimpleMarkdown';
import { hasHebrew } from '@/lib/rtl';
import { Star, Archive, Bell, RotateCcw, Youtube, Sparkles, Image as ImageIcon } from 'lucide-react';

type SwipeDir = 'left' | 'right' | 'up';

interface SwipeDeckProps {
    links: Link[];
    onFavorite: (link: Link) => void;
    onArchive: (link: Link) => void;
    onRemind: (link: Link) => void;
    onOpen: (link: Link) => void;
    /** Reverse a favorite/archive back to unread (used by Undo). */
    onResetStatus: (link: Link) => void;
}

const THRESHOLD = 110; // px past which a drag commits to a swipe

/**
 * Tinder-style review deck. Swipe right to favorite, left to archive, up to
 * set a reminder; tap to open. Non-destructive — every swipe is reversible
 * via Undo. The deck snapshots its links on mount so acting on a card doesn't
 * reshuffle the stack mid-session.
 */
export default function SwipeDeck({ links, onFavorite, onArchive, onRemind, onOpen, onResetStatus }: SwipeDeckProps) {
    const [deck] = useState(links);
    const [index, setIndex] = useState(0);
    const [drag, setDrag] = useState({ x: 0, y: 0 });
    const [phase, setPhase] = useState<'idle' | 'dragging' | 'exiting'>('idle');
    const [lastAction, setLastAction] = useState<{ index: number; dir: SwipeDir } | null>(null);

    const start = useRef({ x: 0, y: 0 });
    const moved = useRef(false);
    const exitDir = useRef<SwipeDir | null>(null);

    // Size the deck to the space between its top and the viewport bottom so the
    // whole thing (card + action buttons) fits without scrolling.
    const rootRef = useRef<HTMLDivElement>(null);
    const [maxH, setMaxH] = useState(0);
    useEffect(() => {
        const update = () => {
            if (!rootRef.current) return;
            const top = rootRef.current.getBoundingClientRect().top;
            setMaxH(Math.max(380, Math.min(window.innerHeight - top - 16, 660)));
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [index]);

    const current = deck[index];
    const remaining = deck.length - index;

    const commit = (dir: SwipeDir) => {
        const link = deck[index];
        if (!link) return;
        if (dir === 'right') onFavorite(link);
        else if (dir === 'left') onArchive(link);
        else onRemind(link);
        setLastAction({ index, dir });
        exitDir.current = null;
        setIndex((i) => i + 1);
        setPhase('idle');
        setDrag({ x: 0, y: 0 });
    };

    // Animate the top card off-screen, then apply the action.
    const fling = (dir: SwipeDir) => {
        exitDir.current = dir;
        setPhase('exiting');
        if (dir === 'right') setDrag({ x: window.innerWidth, y: 0 });
        else if (dir === 'left') setDrag({ x: -window.innerWidth, y: 0 });
        else setDrag({ x: 0, y: -window.innerHeight });
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (phase === 'exiting') return;
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
        if (!moved.current && current) {
            onOpen(current);
        }
        setPhase('idle');
        setDrag({ x: 0, y: 0 });
    };

    const undo = () => {
        if (!lastAction) return;
        const link = deck[lastAction.index];
        if (link && (lastAction.dir === 'right' || lastAction.dir === 'left')) {
            onResetStatus(link);
        }
        setIndex(lastAction.index);
        setLastAction(null);
        setPhase('idle');
        setDrag({ x: 0, y: 0 });
    };

    // Hint overlays react to the live drag.
    const rightHint = Math.max(0, Math.min(1, drag.x / THRESHOLD));
    const leftHint = Math.max(0, Math.min(1, -drag.x / THRESHOLD));
    const upHint = Math.max(0, Math.min(1, -drag.y / THRESHOLD));

    if (!current) {
        return (
            <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-lg font-bold text-text">All caught up</h3>
                <p className="text-sm text-text-muted max-w-xs">
                    You&apos;ve reviewed every card in this view.
                </p>
                {lastAction && (
                    <button
                        onClick={undo}
                        className="mt-2 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-card border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover transition-colors cursor-pointer text-sm font-semibold"
                    >
                        <RotateCcw className="w-4 h-4" /> Undo last
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            ref={rootRef}
            className="flex flex-col items-center gap-3 select-none"
            style={{ height: maxH ? maxH : undefined }}
        >
            <div className="text-xs font-semibold text-text-muted tabular-nums shrink-0">
                {index + 1} of {deck.length} · {remaining} left
            </div>

            {/* Card stack — flexes to fill the space above the buttons */}
            <div className="relative w-full max-w-[440px] flex-1 min-h-0">
                {[2, 1, 0].map((depth) => {
                    const link = deck[index + depth];
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
                            onTransitionEnd={isTop && phase === 'exiting' ? () => exitDir.current && commit(exitDir.current) : undefined}
                            className={`absolute inset-0 ${isTop ? 'cursor-grab active:cursor-grabbing z-30' : 'z-10'}`}
                            style={{
                                transform,
                                transition: phase === 'dragging' && isTop ? 'none' : 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
                                touchAction: 'none',
                                pointerEvents: isTop ? 'auto' : 'none',
                            }}
                        >
                            <CardFace link={link} />
                            {isTop && (
                                <>
                                    <HintBadge label="KEEP" color="34,197,94" icon={<Star className="w-4 h-4" />} opacity={rightHint} pos="left" />
                                    <HintBadge label="ARCHIVE" color="59,130,246" icon={<Archive className="w-4 h-4" />} opacity={leftHint} pos="right" />
                                    <HintBadge label="REMIND" color="168,85,247" icon={<Bell className="w-4 h-4" />} opacity={upHint} pos="top" />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Action buttons — swipe alternative + Undo */}
            <div className="flex items-center gap-3 shrink-0">
                <DeckButton title="Undo" onClick={undo} disabled={!lastAction} className="text-text-muted hover:text-text">
                    <RotateCcw className="w-5 h-5" />
                </DeckButton>
                <DeckButton title="Archive (swipe left)" onClick={() => fling('left')} className="text-blue-500 hover:bg-blue-500 hover:text-white border-blue-500/30">
                    <Archive className="w-6 h-6" />
                </DeckButton>
                <DeckButton title="Remind me (swipe up)" onClick={() => fling('up')} className="text-accent hover:bg-accent hover:text-white border-accent/30">
                    <Bell className="w-6 h-6" />
                </DeckButton>
                <DeckButton title="Favorite (swipe right)" onClick={() => fling('right')} className="text-green-500 hover:bg-green-500 hover:text-white border-green-500/30">
                    <Star className="w-6 h-6" />
                </DeckButton>
            </div>

            <p className="text-[11px] text-text-muted/70 text-center max-w-xs shrink-0">
                Swipe or use the buttons · tap a card to open it
            </p>
        </div>
    );
}

function DeckButton({ children, onClick, title, disabled, className = '' }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; className?: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
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

/** The visible card content (category, source, title, highlighted gist, tags). */
function CardFace({ link }: { link: Link }) {
    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary);
    const colorStyle = getCategoryColorStyle(link.category);
    const platform = getPlatform(link.url);
    const isYouTube = platform === 'youtube' || link.sourceType === 'youtube';
    const youtubeChannel = link.metadata?.youtubeChannel || link.sourceName;
    const xAuthor = platform === 'x' ? xHandle(link.url) : null;
    const linkedinName = platform === 'linkedin' ? linkedinDisplayName(link.url, link.sourceName) : null;

    return (
        <div className="h-full w-full surface-card bg-card rounded-2xl border border-border-subtle shadow-[var(--shadow-card)] p-5 sm:p-6 flex flex-col overflow-hidden">
            {/* Header: category + source byline */}
            <div className="flex items-center justify-between gap-2 mb-4">
                <span
                    className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg whitespace-nowrap"
                    style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                >
                    {link.category}
                </span>
                {isYouTube && youtubeChannel ? (
                    <span dir="ltr" className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[200px]">
                        <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="truncate">{youtubeChannel}</span>
                    </span>
                ) : xAuthor ? (
                    <span dir="ltr" className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[200px]">
                        <span className="shrink-0 inline-flex" style={{ color: platformColor('x') }}>{platformIcon('x', 'w-3.5 h-3.5')}</span>
                        <span className="truncate">@{xAuthor}</span>
                    </span>
                ) : linkedinName ? (
                    <span dir="ltr" className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-secondary whitespace-nowrap max-w-[200px]">
                        <span className="shrink-0 inline-flex" style={{ color: platformColor('linkedin') }}>{platformIcon('linkedin', 'w-3.5 h-3.5')}</span>
                        <span className="truncate">{linkedinName}</span>
                    </span>
                ) : link.sourceType === 'image' ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-accent whitespace-nowrap">
                        <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>Screenshot</span>
                    </span>
                ) : link.sourceName && link.sourceName !== 'Screenshot' && link.sourceName !== 'None' ? (
                    <span className="text-[10px] font-bold text-text-muted/60 uppercase tracking-widest truncate max-w-[160px]">{link.sourceName}</span>
                ) : null}
            </div>

            {/* Title */}
            <h3 dir="auto" className={`font-bold text-xl sm:text-2xl text-text leading-tight mb-3 ${isRtl ? 'text-right' : ''}`}>
                {link.title}
            </h3>

            {/* Highlighted gist — clamped; tap opens full details */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
                <SimpleMarkdown content={link.summary} isCompact isRtl={isRtl} />
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
            </div>

            {/* Tags */}
            {link.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                    {link.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/5 text-text-muted/60">
                            {tag.split('/').pop()}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
