'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from 'react';
import {
    X,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    Plus,
    Search,
    MessageCircleQuestion,
    Layers,
    LayoutGrid,
    Settings as SettingsIcon,
} from 'lucide-react';

/**
 * First-run onboarding tour.
 *
 * A guided, "spotlight" walkthrough: each step dims the screen and highlights a
 * real element in the UI (matched by its `data-tour` attribute), then shows a
 * card of microcopy explaining that feature. The user taps Next until the tour
 * finishes. Steps whose anchor isn't on screen (e.g. a desktop-only search bar
 * on mobile) fall back to a centered card, so the copy is never lost.
 *
 * Completion is remembered in localStorage so first-time users see it once; it
 * can be replayed any time from Settings → About → "Take the tour".
 */

export const ONBOARDING_STORAGE_KEY = 'machina_onboarding_v1';

type Step = {
    /** `data-tour` value of the element to spotlight; null = centered card. */
    target: string | null;
    title: string;
    body: string;
    icon: ReactNode;
    /** Corner radius of the spotlight cut-out (round controls want a big one). */
    radius?: number;
    /** Extra breathing room around the highlighted element, in px. */
    padding?: number;
};

const STEPS: Step[] = [
    {
        target: null,
        icon: <Sparkles className="w-5 h-5" />,
        title: 'Welcome to Machina AI',
        body: "Your AI second brain. Save anything and Machina reads it, organizes it, and hands it back the moment you need it. Here's a quick 60-second tour.",
    },
    {
        target: 'add',
        icon: <Plus className="w-5 h-5" />,
        title: 'Save anything, instantly',
        body: 'Tap the + button to drop in a link, image, or screenshot. Machina reads it, writes a clean summary, and auto-tags it into the right category — no filing required.',
        radius: 999,
        padding: 10,
    },
    {
        target: 'search',
        icon: <Search className="w-5 h-5" />,
        title: 'Find it by meaning',
        body: "Search by keyword or plain-English idea. Machina understands what you meant, so “that article on focus” surfaces the right card even when those exact words aren't in it.",
    },
    {
        target: 'ask',
        icon: <MessageCircleQuestion className="w-5 h-5" />,
        title: 'Ask your brain',
        body: 'Chat with everything you’ve saved. Ask a question and Machina answers from your own library, pointing back to the exact cards it drew from.',
    },
    {
        target: 'collections',
        icon: <Layers className="w-5 h-5" />,
        title: 'Group it. Share it.',
        body: 'Bundle related cards into Collections — a reading list, a project, a trip. Publish one as a shareable page, or send a single card as a link anyone can open.',
    },
    {
        target: 'views',
        icon: <LayoutGrid className="w-5 h-5" />,
        title: 'See it your way',
        body: 'Switch between Grid and List layouts — or flip to Review to swipe through your cards one at a time and revisit what you saved.',
    },
    {
        target: 'settings',
        icon: <SettingsIcon className="w-5 h-5" />,
        title: 'Make it yours',
        body: 'Set your theme, tune reminders, and build a curated digest that resurfaces the gems you’d otherwise forget. You can replay this tour from here anytime.',
        radius: 999,
    },
    {
        target: null,
        icon: <Sparkles className="w-5 h-5" />,
        title: "You're all set",
        body: 'That’s the whole loop: Capture. Connect. Recall. Start by saving your first link with the + button.',
    },
];

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Is this element actually rendered? We can't use `offsetParent` — it's null for
 * `position: fixed` elements like the add-link FAB, which would wrongly skip
 * them. Rely on real geometry + CSS visibility instead, so a `display:none`
 * anchor (e.g. the desktop-only search bar on mobile) is passed over while its
 * visible sibling is picked.
 */
function isVisible(el: HTMLElement): boolean {
    const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
    if (typeof check === 'function' && !check.call(el, { checkVisibilityCSS: true })) {
        return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

/** The first on-screen element carrying this data-tour tag. */
function findTarget(target: string | null): HTMLElement | null {
    if (!target) return null;
    const els = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`),
    );
    return els.find(isVisible) ?? null;
}

export default function OnboardingTour({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    const step = STEPS[index];
    const isFirst = index === 0;
    const isLast = index === STEPS.length - 1;

    // Restart from the top every time the tour (re)opens. Done during render —
    // React's recommended way to reset state from a prop, no effect needed.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setIndex(0);
            setCardPos(null);
        }
    }

    // Measure the current step's anchor (and re-measure on resize/scroll).
    const measure = useCallback(() => {
        const el = findTarget(step.target);
        if (!el) {
            setRect(null);
            return;
        }
        // Nudge it into view if it's scrolled off-screen.
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
            el.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        const b = el.getBoundingClientRect();
        setRect({ top: b.top, left: b.left, width: b.width, height: b.height });
    }, [step.target]);

    useLayoutEffect(() => {
        if (!open) return;
        // Reading the anchor's live geometry and storing it is exactly what a
        // layout effect is for; the setState here is a deliberate DOM measurement.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        measure();
        // A second pass on the next frame catches late layout (fonts, images).
        const raf = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(raf);
    }, [open, index, measure]);

    useEffect(() => {
        if (!open) return;
        const onChange = () => measure();
        window.addEventListener('resize', onChange);
        window.addEventListener('scroll', onChange, true);
        return () => {
            window.removeEventListener('resize', onChange);
            window.removeEventListener('scroll', onChange, true);
        };
    }, [open, measure]);

    // Position the copy card relative to the highlighted element (below when it
    // fits, otherwise above; centered when there's no anchor).
    useLayoutEffect(() => {
        if (!open) return;
        const card = cardRef.current;
        if (!card) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 16;
        const gap = 14;
        const cw = card.offsetWidth;
        const ch = card.offsetHeight;

        if (!rect) {
            setCardPos({
                top: Math.max(margin, (vh - ch) / 2),
                left: Math.max(margin, (vw - cw) / 2),
            });
            return;
        }

        let top: number;
        if (rect.top + rect.height + gap + ch + margin <= vh) {
            top = rect.top + rect.height + gap; // below
        } else if (rect.top - gap - ch - margin >= 0) {
            top = rect.top - gap - ch; // above
        } else {
            top = Math.min(Math.max(margin, rect.top + rect.height + gap), vh - ch - margin);
        }
        const left = Math.min(
            Math.max(margin, rect.left + rect.width / 2 - cw / 2),
            vw - cw - margin,
        );
        setCardPos({ top, left });
    }, [open, index, rect]);

    const finish = useCallback(() => {
        try {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
        } catch {
            /* private mode — best effort */
        }
        onClose();
    }, [onClose]);

    const next = useCallback(() => {
        if (isLast) finish();
        else setIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, [isLast, finish]);

    const back = useCallback(() => {
        setIndex((i) => Math.max(i - 1, 0));
    }, []);

    // Keyboard navigation.
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

    if (!open) return null;

    const pad = step.padding ?? 8;
    const radius = step.radius ?? 14;

    return (
        <div className="fixed inset-0 z-[100] animate-fade-in" role="dialog" aria-modal="true" aria-label="Product tour">
            {/* Click-catcher. Transparent when we have a spotlight (the ring's
                box-shadow does the dimming); solid dim when the card is centered.
                Swallows clicks so the app underneath can't be touched mid-tour —
                exiting is deliberate, via Skip or the ✕. */}
            <div
                className={`absolute inset-0 ${rect ? '' : 'bg-black/70 backdrop-blur-[2px]'}`}
                onClick={(e) => e.stopPropagation()}
            />

            {/* Spotlight ring around the highlighted element. The huge box-shadow
                spread paints everything *except* the cut-out. */}
            {rect && (
                <div
                    className="pointer-events-none absolute transition-all duration-300 ease-out"
                    style={{
                        top: rect.top - pad,
                        left: rect.left - pad,
                        width: rect.width + pad * 2,
                        height: rect.height + pad * 2,
                        borderRadius: radius,
                        boxShadow:
                            '0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 2px var(--accent, #8b5cf6), 0 0 22px 4px color-mix(in srgb, var(--accent, #8b5cf6) 55%, transparent)',
                    }}
                />
            )}

            {/* Copy card */}
            <div
                ref={cardRef}
                className="absolute w-[min(360px,calc(100vw-32px))] rounded-2xl bg-card border border-border-subtle shadow-2xl p-5 transition-[top,left] duration-300 ease-out"
                style={{
                    top: cardPos?.top ?? -9999,
                    left: cardPos?.left ?? -9999,
                    opacity: cardPos ? 1 : 0,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header: icon + step counter + close */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                            {step.icon}
                        </div>
                        <span className="text-[11px] font-semibold tracking-wide text-text-muted tabular-nums">
                            {index + 1} / {STEPS.length}
                        </span>
                    </div>
                    <button
                        onClick={finish}
                        aria-label="Skip tour"
                        className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <h3 className="text-[17px] font-bold text-text mb-1.5 leading-snug">
                    {step.title}
                </h3>
                <p className="text-[13.5px] text-text-secondary leading-relaxed">
                    {step.body}
                </p>

                {/* Progress dots */}
                <div className="flex items-center gap-1.5 mt-4 mb-4">
                    {STEPS.map((_, i) => (
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

                {/* Controls */}
                <div className="flex items-center justify-between gap-3">
                    {isFirst ? (
                        <button
                            onClick={finish}
                            className="text-[13px] font-semibold text-text-muted hover:text-text transition-colors cursor-pointer"
                        >
                            Skip
                        </button>
                    ) : (
                        <button
                            onClick={back}
                            className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-secondary hover:text-text transition-colors cursor-pointer"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>
                    )}

                    <button
                        onClick={next}
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-accent text-white text-[13px] font-semibold shadow-sm shadow-accent/20 hover:bg-accent-hover active:scale-95 transition-all cursor-pointer"
                    >
                        {isLast ? 'Start saving' : isFirst ? 'Take the tour' : 'Next'}
                        {!isLast && <ArrowRight className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
