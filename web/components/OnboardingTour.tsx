'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
    ArrowRight,
    ArrowLeft,
    ArrowUp,
    Plus,
    Share,
    Link2,
    MessageCircleQuestion,
    Bell,
    CalendarClock,
    Clock,
    ExternalLink,
    FileText,
    Mail,
    MessageCircle,
    Bookmark,
    MoreHorizontal,
    Waypoints,
    Image as ImageIcon,
    StickyNote,
} from 'lucide-react';
import { CitationGlyph } from './ui/Wordmark';
import { FlowScreen } from './onboarding/FlowScreen';
import { getCategoryColorStyle } from '@/lib/colors';
import { isNativeApp } from '@/lib/api';
import { hapticSelection, hapticLight } from '@/lib/haptics';

/**
 * "How Machina works" — page three of the first run, and the only page that is
 * a story rather than a decision.
 *
 * Four steps, one idea each: it catches things, it understands and connects
 * them, you can ask it anything, and it brings the right thing back. That is
 * the whole product. The eight-step version this replaces spent five of its
 * steps on features (search, collections, a graph, a send-off) that the four
 * below already imply, and it was gated on a non-empty library, so a brand-new
 * account never saw it at all.
 *
 * Every visual is a miniature of the REAL surface, built from theme-token UI
 * primitives rather than bitmaps, so it renders correctly in both themes and
 * cannot go stale as the app evolves. They are decorative (aria-hidden); screen
 * readers get the headline and body.
 *
 * It shows once (localStorage), animates fast, supports swipe and keyboard, and
 * ticks a light haptic per step on native. It can be replayed any time from
 * Settings -> "Take the tour again", and it reads identically either way, so
 * nothing here needs to know which of the two it is.
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

/** iOS share-sheet row (native) / in-app capture (web) — Machina highlighted. */
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
                        <CitationGlyph className="w-5 h-5 text-accent-ink" />
                        <span className="absolute -top-1 -end-1 w-3.5 h-3.5 rounded-full bg-accent ring-2 ring-card" />
                    </div>
                    <span className="text-[9px] font-bold text-accent truncate w-full text-center">Machina</span>
                </div>
                <ShareTile icon={<MessageCircle className="w-5 h-5" />} label="Messages" />
                <ShareTile icon={<Mail className="w-5 h-5" />} label="Mail" />
                <ShareTile icon={<Bookmark className="w-5 h-5" />} label="Saved" />
                <ShareTile icon={<MoreHorizontal className="w-5 h-5" />} label="More" />
            </div>
            {/* What Machina captures — the three first-class save types. */}
            <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-border-subtle">
                {[
                    { icon: <Link2 className="w-3 h-3" />, label: 'Links' },
                    { icon: <ImageIcon className="w-3 h-3" />, label: 'Images' },
                    { icon: <StickyNote className="w-3 h-3" />, label: 'Notes' },
                ].map((t) => (
                    <span key={t.label} className="inline-flex items-center gap-1 rounded-full bg-fill-subtle text-text-secondary text-[10px] font-medium px-2 py-1">
                        <span className="text-accent">{t.icon}</span>
                        {t.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** A miniature of the REAL feed card — same anatomy as Card.tsx (category chip
    + source byline chrome row, bold title, summary, uppercase tag chips, read
    time), so the tour shows the product, not a generic mock-up. The connections
    strip below it is the other half of the same step: a card is understood AND
    placed among everything else, so both belong in one frame. Related cards
    wear their category's app-wide identity color (the same
    `getCategoryColorStyle` hash the graph, the cards and the filters use). */
function StructuredCardMock() {
    const related = [
        { title: 'Morning routines that stick', category: 'Health' },
        { title: 'Attention is a trainable skill', category: 'Science' },
    ];
    return (
        <div className="w-full rounded-[20px] bg-card border border-border-subtle shadow-xl overflow-hidden" aria-hidden>
            {/* Thumbnail band — like a real card's image, with its bottom scrim */}
            <div className="relative h-14 bg-[image:var(--accent-gradient)] opacity-90">
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
            <div className="p-3.5 space-y-2">
                {/* Chrome row: category (start) + source (end), as on every card */}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-lg bg-accent/12 text-accent">
                        Productivity
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted/70 min-w-0">
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">nature.com</span>
                    </span>
                </div>
                <p className="text-[13px] font-bold text-text leading-tight">The science of deep focus</p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                    Sustained attention is a trainable skill. Short, undistracted blocks beat long fractured ones.
                </p>
                {/* Auto tags — the card's real chip style */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {['focus', 'productivity', 'neuroscience'].map((t) => (
                        <span key={t} className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-fill-subtle text-text-muted/60">
                            {t}
                        </span>
                    ))}
                </div>
                {/* Footer — the REAL card's metadata row: read time + age,
                    quiet and start-aligned, exactly as Card.tsx renders it. */}
                <div className="flex items-center gap-3 pt-1 text-[10px] font-medium text-text-muted/60">
                    <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 4m
                    </span>
                    <span>2d ago</span>
                </div>
            </div>
            {/* Connections — the card's own "related" strip. */}
            <div className="px-3.5 pb-3.5 pt-2.5 border-t border-border-subtle">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted/70 mb-1.5">
                    Connected to
                </p>
                <div className="flex flex-col gap-1.5">
                    {related.map((r) => (
                        <div key={r.title} className="flex items-center gap-2 rounded-lg bg-fill-subtle px-2 py-1.5">
                            <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: getCategoryColorStyle(r.category).color }}
                            />
                            <span className="text-[10.5px] text-text-secondary truncate">{r.title}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** A miniature of the REAL Ask screen — the exact vocabulary of AskBrain.tsx:
    accent question pill (rounded-br-md), the answer as plain text on the page
    (no bubble — like the real one), the bracket-glyph source chip, and the
    composer pill. */
function AskMock() {
    return (
        // Same framed card every other step's mock uses. Without it the parts
        // floated straight on the page background and the step didn't read as
        // "here is a piece of the app" like its neighbours did (owner, iOS QA
        // 2026-08-24). Inner surfaces drop to fill/background tones so they
        // still separate from the frame instead of sitting card-on-card.
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl p-3.5 flex flex-col gap-3" aria-hidden>
            {/* Question — the real user pill */}
            <div className="self-end max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-md bg-accent text-accent-ink">
                <p className="text-[12px] leading-relaxed">What have I saved about staying focused?</p>
            </div>
            {/* Answer — plain text on the page, exactly like the real Ask */}
            <p className="px-0.5 text-[12.5px] text-text leading-relaxed">
                Your saves point to one habit: protect short, single-task blocks and remove ambient distractions.
            </p>
            {/* Citation — the real source chip: bracket-glyph tile, source, title */}
            <div className="self-start flex items-center gap-2.5 max-w-full ps-2.5 pe-3.5 py-2 rounded-xl bg-fill-subtle">
                <span className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <CitationGlyph className="w-3.5 h-auto" />
                </span>
                <span className="min-w-0 flex flex-col">
                    <span className="text-[9px] font-semibold tracking-wide text-text-muted">nature.com</span>
                    <span className="text-[11.5px] font-medium text-text leading-snug truncate">The science of deep focus</span>
                </span>
            </div>
            {/* Composer — grounds the scene as the real Ask screen */}
            <div className="flex items-center gap-2 p-2 mt-1 rounded-2xl bg-background border border-border-subtle">
                <span className="flex-1 px-2 text-[11.5px] text-text-muted truncate">Ask about anything you’ve saved…</span>
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent text-accent-ink flex items-center justify-center">
                    <ArrowUp className="w-3.5 h-3.5" />
                </span>
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
                    { icon: <CitationGlyph className="w-3.5 h-auto" />, title: 'A new connection surfaced', sub: 'Deep work ↔ sleep quality' },
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

function buildSteps(native: boolean): Step[] {
    return [
        {
            icon: <Share className="w-4 h-4" />,
            eyebrow: 'Capture',
            title: 'Save anything, from anywhere',
            body: native
                ? 'Links, screenshots, images, or a quick note. Share them to Machina from any app, or capture right here. No copy-paste, no switching apps.'
                : 'Share to Machina from any app on your phone, or capture right here with +: paste a link, add a screenshot, jot a thought. Every save lands as a card.',
            visual: <CaptureMock native={native} />,
        },
        {
            icon: <Waypoints className="w-4 h-4" />,
            eyebrow: 'Understand',
            title: 'Understood, and connected',
            body: 'Machina reads every article, video, screenshot and note in full, then files a clean card: summary, key points, tags, category. Each one is matched against everything you already kept, so related saves find each other.',
            visual: <StructuredCardMock />,
        },
        {
            icon: <MessageCircleQuestion className="w-4 h-4" />,
            eyebrow: 'Recall',
            title: 'Ask, and find',
            body: 'Ask in plain words and get a real answer drawn only from what you saved, with citations. Search the same way: “that video about waking up early” finds it, in English or Hebrew.',
            visual: <AskMock />,
        },
        {
            icon: <Bell className="w-4 h-4" />,
            eyebrow: 'Resurface',
            title: 'It comes back to you',
            body: 'A daily digest, a weekly synthesis, and gentle reminders bring the right save back at exactly the right moment.',
            visual: <ResurfaceMock />,
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
        <FlowScreen
            overlay
            label="How Machina works"
            icon={step.icon}
            counter={`${index + 1} / ${total}`}
            onSkip={finish}
            animationKey={index}
            visual={step.visual}
            eyebrow={step.eyebrow}
            title={step.title}
            body={step.body}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            footer={
                <>
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
                            className="flex-1 inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-accent text-accent-ink text-[15px] font-bold shadow-lg shadow-accent/25 hover:bg-accent-hover active:scale-[0.98] transition-all cursor-pointer"
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
                </>
            }
        />
    );
}
