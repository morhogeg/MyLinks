'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
    X,
    ArrowRight,
    ArrowLeft,
    Plus,
    Share,
    Puzzle,
    Sparkles,
    Wand2,
    Link2,
    MessageCircleQuestion,
    Quote,
    Bell,
    CalendarClock,
    FileText,
    Mail,
    MessageCircle,
    Bookmark,
    MoreHorizontal,
} from 'lucide-react';
import { isNativeApp } from '@/lib/api';
import { hapticSelection, hapticLight } from '@/lib/haptics';
import { useVisualViewport } from '@/lib/useVisualViewport';

/**
 * First-run onboarding tour.
 *
 * A short, full-screen story that showcases what makes Machina different — one
 * crisp headline, one supporting line, and one self-contained illustrative
 * visual per step. The visuals are built entirely from theme-token UI primitives
 * (mock share-sheet row, mock structured card, mock cited answer, mock digest),
 * NOT bitmap assets, so they render correctly in both light and dark themes and
 * never go stale as the real UI evolves.
 *
 * Design goals: showcase the real differentiators (capture anywhere → AI reads
 * everything → ask your knowledge → it comes back to you), stay to ~5 steps,
 * keep a persistent Skip and a progress indicator on every step, and finish on
 * an actionable CTA. It is never an obstacle: it shows once, animates fast
 * (`--ease-modal`), supports swipe + keyboard, and ticks a light haptic on each
 * step (native only).
 *
 * Completion is remembered in localStorage so first-time users see it once; it
 * can be replayed any time from Settings → "Take the tour again".
 */

export const ONBOARDING_STORAGE_KEY = 'machina_onboarding_v1';

type Step = {
    /** Small pill icon shown beside the step counter. */
    icon: ReactNode;
    /** Eyebrow label above the headline. */
    eyebrow: string;
    title: string;
    body: string;
    /** The self-contained mock illustration for this step. */
    visual: ReactNode;
};

/* ------------------------------------------------------------------ *
 * Mock illustrations — miniature, theme-token-only mock-ups of the
 * product's key surfaces. Kept purely decorative (aria-hidden) so screen
 * readers get the headline + body copy, not the mock chrome.
 * ------------------------------------------------------------------ */

/** A neutral, non-interactive "app tile" for the mock share sheet. */
function ShareTile({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <div className="flex flex-col items-center gap-1.5 w-14 shrink-0">
            <div className="w-11 h-11 rounded-[14px] bg-fill-subtle text-text-muted flex items-center justify-center">
                {icon}
            </div>
            <span className="text-[9px] text-text-muted truncate w-full text-center">{label}</span>
        </div>
    );
}

/** iOS share-sheet row (native) / browser-clipper (web) — Machina highlighted. */
function CaptureMock({ native }: { native: boolean }) {
    return (
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl p-4" aria-hidden>
            {/* Content being shared */}
            <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-border-subtle">
                <div className="w-9 h-9 rounded-lg bg-fill-subtle flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-text-muted" />
                </div>
                <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-text truncate">The science of deep focus</p>
                    <p className="text-[10px] text-text-muted truncate">
                        {native ? 'Sharing from Safari' : 'nature.com/articles/focus'}
                    </p>
                </div>
            </div>
            {/* App / target row */}
            <div className="flex items-end gap-1.5 overflow-hidden">
                {/* Machina — the highlighted, "chosen" target. */}
                <div className="flex flex-col items-center gap-1.5 w-14 shrink-0">
                    <div className="relative w-11 h-11 rounded-[14px] bg-[image:var(--accent-gradient)] flex items-center justify-center ring-2 ring-accent shadow-lg shadow-accent/25">
                        <Sparkles className="w-5 h-5 text-white" />
                        <span className="absolute -top-1 -end-1 w-3.5 h-3.5 rounded-full bg-accent ring-2 ring-card" />
                    </div>
                    <span className="text-[9px] font-bold text-accent truncate w-full text-center">Machina</span>
                </div>
                <ShareTile icon={<MessageCircle className="w-5 h-5" />} label="Messages" />
                <ShareTile icon={<Mail className="w-5 h-5" />} label="Mail" />
                <ShareTile icon={<Bookmark className="w-5 h-5" />} label="Saved" />
                <ShareTile icon={<MoreHorizontal className="w-5 h-5" />} label="More" />
            </div>
        </div>
    );
}

/** A structured card: thumbnail, AI summary, auto tags, and connections. */
function StructuredCardMock() {
    return (
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl overflow-hidden" aria-hidden>
            {/* Thumbnail band */}
            <div className="h-16 bg-[image:var(--accent-gradient)] opacity-90 flex items-center justify-center">
                <FileText className="w-6 h-6 text-white/90" />
            </div>
            <div className="p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 text-accent text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 ring-1 ring-accent/20">
                        <Wand2 className="w-2.5 h-2.5" /> AI summary
                    </span>
                </div>
                <p className="text-[12.5px] font-bold text-text leading-snug">The science of deep focus</p>
                <p className="mt-1 text-[11px] text-text-secondary leading-relaxed">
                    Sustained attention is a trainable skill — short, undistracted blocks beat long fractured ones.
                </p>
                {/* Auto tags */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {['focus', 'productivity', 'neuroscience'].map((t) => (
                        <span key={t} className="rounded-full bg-fill-subtle text-text-secondary text-[10px] font-medium px-2 py-0.5">
                            #{t}
                        </span>
                    ))}
                </div>
                {/* Connections */}
                <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border-subtle text-text-muted">
                    <Link2 className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[10.5px] font-medium">Linked to 3 related saves</span>
                </div>
            </div>
        </div>
    );
}

/** A mini "Ask your knowledge" exchange with a cited answer. */
function AskMock() {
    return (
        <div className="w-full flex flex-col gap-2.5" aria-hidden>
            {/* Question */}
            <div className="self-end max-w-[80%] rounded-2xl rounded-ee-md bg-accent text-white px-3.5 py-2 shadow-sm shadow-accent/20">
                <p className="text-[12px] font-medium leading-snug">What have I saved about staying focused?</p>
            </div>
            {/* Answer */}
            <div className="self-start max-w-[92%] rounded-2xl rounded-ss-md bg-card border border-border-subtle px-3.5 py-2.5 shadow-md">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-5 h-5 rounded-lg bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                        <Sparkles className="w-3 h-3" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide">Answer</span>
                </div>
                <p className="text-[11.5px] text-text-secondary leading-relaxed">
                    Your saves point to one habit: protect short, single-task blocks and remove ambient distractions.
                </p>
                {/* Citation */}
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-fill-subtle px-2 py-1">
                    <Quote className="w-3 h-3 text-accent shrink-0" />
                    <span className="text-[10px] font-semibold text-text-secondary truncate">
                        The science of deep focus
                    </span>
                </div>
            </div>
        </div>
    );
}

/** A "comes back to you" digest with a resurfaced item and a reminder. */
function ResurfaceMock() {
    return (
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl p-3.5" aria-hidden>
            <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-bold text-text">Your weekly synthesis</p>
                <span className="text-[9px] font-medium text-text-muted">Sun · 9:00</span>
            </div>
            <div className="flex flex-col gap-2">
                {[
                    { icon: <CalendarClock className="w-3.5 h-3.5" />, title: '3 threads came together', sub: 'Focus · habits · attention' },
                    { icon: <Sparkles className="w-3.5 h-3.5" />, title: 'A new connection surfaced', sub: 'Deep work ↔ sleep quality' },
                ].map((r) => (
                    <div key={r.title} className="flex items-center gap-2.5 rounded-xl bg-fill-subtle px-2.5 py-2">
                        <div className="w-7 h-7 rounded-lg bg-accent/12 text-accent flex items-center justify-center shrink-0 ring-1 ring-accent/20">
                            {r.icon}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-text truncate">{r.title}</p>
                            <p className="text-[9.5px] text-text-muted truncate">{r.sub}</p>
                        </div>
                    </div>
                ))}
            </div>
            {/* Reminder chip */}
            <div className="mt-2.5 flex items-center gap-1.5 text-accent">
                <Bell className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold">Reminder: revisit “The science of deep focus”</span>
            </div>
        </div>
    );
}

/** Celebratory send-off mark. */
function ReadyMock() {
    return (
        <div className="relative flex items-center justify-center py-2" aria-hidden>
            <div className="absolute w-24 h-24 rounded-full bg-[image:var(--accent-gradient)] opacity-20 blur-2xl" />
            <div className="relative w-20 h-20 rounded-3xl overflow-hidden shadow-xl shadow-accent/25 ring-1 ring-white/15">
                <img src="/app-icon.png" alt="" className="w-full h-full object-cover" />
            </div>
            <Sparkles className="absolute -top-1 -end-1 w-6 h-6 text-accent drop-shadow" />
        </div>
    );
}

function buildSteps(native: boolean): Step[] {
    return [
        {
            icon: native ? <Share className="w-4 h-4" /> : <Puzzle className="w-4 h-4" />,
            eyebrow: 'Capture',
            title: 'Save from anywhere',
            body: native
                ? 'Share any link, screenshot, or post to Machina straight from the iOS share sheet — no copy-paste, no switching apps.'
                : 'Clip any page with the Machina button in your browser toolbar — no copy-paste, no switching tabs.',
            visual: <CaptureMock native={native} />,
        },
        {
            icon: <Wand2 className="w-4 h-4" />,
            eyebrow: 'Understand',
            title: 'Every save gets understood',
            body: 'Machina reads the whole thing and turns it into a clean card — a summary, smart tags, and links to everything it connects to.',
            visual: <StructuredCardMock />,
        },
        {
            icon: <MessageCircleQuestion className="w-4 h-4" />,
            eyebrow: 'Recall',
            title: 'Ask your own knowledge',
            body: 'Ask a question in plain words and get a real answer — drawn only from what you’ve saved, with citations back to the source.',
            visual: <AskMock />,
        },
        {
            icon: <Bell className="w-4 h-4" />,
            eyebrow: 'Resurface',
            title: 'It comes back to you',
            body: 'A daily digest, a weekly synthesis, and gentle reminders bring the right save back at exactly the right moment.',
            visual: <ResurfaceMock />,
        },
        {
            icon: <Sparkles className="w-4 h-4" />,
            eyebrow: 'You’re set',
            title: 'Your second brain is ready',
            body: native
                ? 'Save your first thing and watch Machina go to work. Tip: add Machina to your share sheet so you can capture from any app.'
                : 'Save your first thing and watch Machina go to work. The + button is always one tap away.',
            visual: <ReadyMock />,
        },
    ];
}

export default function OnboardingTour({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const native = isNativeApp();
    const [steps] = useState<Step[]>(() => buildSteps(native));
    const [index, setIndex] = useState(0);
    const vp = useVisualViewport();

    const step = steps[index];
    const total = steps.length;
    const isFirst = index === 0;
    const isLast = index === total - 1;

    // Restart from the top every time the tour (re)opens. Done during render —
    // React's recommended way to reset state from a prop, no effect needed.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setIndex(0);
    }

    const finish = useCallback(() => {
        try {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
        } catch {
            /* private mode — best effort */
        }
        hapticLight();
        onClose();
    }, [onClose]);

    const next = useCallback(() => {
        if (isLast) {
            finish();
        } else {
            hapticSelection();
            setIndex((i) => Math.min(i + 1, total - 1));
        }
    }, [isLast, finish, total]);

    const back = useCallback(() => {
        if (isFirst) return;
        hapticSelection();
        setIndex((i) => Math.max(i - 1, 0));
    }, [isFirst]);

    // Keyboard navigation (Esc skips; arrows/Enter advance).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish();
            } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault();
                next();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                back();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, next, back, finish]);

    // Horizontal swipe → advance / go back. RTL-aware: a "forward" swipe is
    // leading→trailing, which flips direction under `dir="rtl"`.
    const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        setTouchStart({ x: t.clientX, y: t.clientY });
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        setTouchStart(null);
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
        const forward = rtl ? dx > 0 : dx < 0;
        if (forward) next();
        else back();
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] bg-background text-text animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label="Product tour"
        >
            <div
                className="flex flex-col mx-auto w-full max-w-md"
                style={{
                    height: vp.height ? vp.height : '100dvh',
                    paddingTop: 'max(env(safe-area-inset-top), 12px)',
                    paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
                    paddingInline: '20px',
                }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                {/* Top bar: step counter + persistent Skip */}
                <div className="flex items-center justify-between shrink-0 pt-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                            {step.icon}
                        </div>
                        <span className="text-[11px] font-semibold tracking-wide text-text-muted tabular-nums">
                            {index + 1} / {total}
                        </span>
                    </div>
                    <button
                        onClick={finish}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] font-semibold text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                        aria-label="Skip tour"
                    >
                        Skip
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Body: visual + copy. Keyed on index so each step replays its
                    enter animation. Scrolls internally on very short screens. */}
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-y-auto py-4">
                    <div key={index} className="w-full flex flex-col items-center animate-slide-up">
                        <div className="w-full max-w-[340px] flex items-center justify-center">
                            {step.visual}
                        </div>
                        <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                            {step.eyebrow}
                        </p>
                        <h2 className="mt-2 text-[22px] font-extrabold tracking-tight text-text text-center leading-tight">
                            {step.title}
                        </h2>
                        <p className="mt-2.5 text-[14px] text-text-secondary text-center leading-relaxed max-w-[320px]">
                            {step.body}
                        </p>
                    </div>
                </div>

                {/* Footer: progress dots + controls */}
                <div className="shrink-0">
                    <div className="flex items-center justify-center gap-1.5 mb-4">
                        {steps.map((_, i) => (
                            <span
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    i === index
                                        ? 'w-5 bg-accent'
                                        : i < index
                                          ? 'w-1.5 bg-accent/40'
                                          : 'w-1.5 bg-border-subtle'
                                }`}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        {!isFirst && (
                            <button
                                onClick={back}
                                className="inline-flex items-center justify-center gap-1 h-12 px-4 rounded-full text-[14px] font-semibold text-text-secondary hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
                                Back
                            </button>
                        )}
                        <button
                            onClick={next}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-accent text-white text-[15px] font-bold shadow-lg shadow-accent/25 hover:bg-accent-hover active:scale-[0.98] transition-all cursor-pointer"
                        >
                            {isLast ? (
                                <>
                                    <Plus className="w-4 h-4" />
                                    {native ? 'Save your first link' : 'Start saving'}
                                </>
                            ) : (
                                <>
                                    Next
                                    <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
