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
    CalendarCheck,
    Circle,
    Clock,
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
 * them, you can ask it anything, and it brings the right thing back (the
 * Revisit tab, named as such so the tour teaches the app's own words). That is
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

/** The three first-class save types, as a quiet chip row under either capture mock. */
function SaveTypeChips() {
    return (
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
    );
}

/** Web: a miniature of the REAL + capture form (AddLinkForm.tsx): the
    Link / Image / Note tab strip, the link field with a pasted URL, the Save
    button. Desktop web used to show the iOS share sheet here, a phone gesture
    the web user cannot perform (left open on 2026-08-23, closed now). */
function WebCaptureMock() {
    return (
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl p-4" aria-hidden>
            <div className="flex gap-1 p-1 rounded-xl bg-fill-subtle">
                {[
                    { icon: <Link2 className="w-3 h-3" />, label: 'Link', on: true },
                    { icon: <ImageIcon className="w-3 h-3" />, label: 'Image', on: false },
                    { icon: <StickyNote className="w-3 h-3" />, label: 'Note', on: false },
                ].map((t) => (
                    <span
                        key={t.label}
                        className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium ${
                            t.on ? 'bg-card text-text shadow-sm' : 'text-text-muted'
                        }`}
                    >
                        {t.icon}
                        {t.label}
                    </span>
                ))}
            </div>
            <div className="mt-3 flex items-center gap-2 h-10 px-3 rounded-xl bg-background border border-border-subtle">
                <Link2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <span className="flex-1 text-[12px] text-text truncate">nature.com/articles/focus</span>
                <span className="w-[2px] h-4 bg-accent rounded-full" />
            </div>
            <div className="mt-3 h-10 rounded-full bg-accent text-accent-ink text-[13px] font-bold flex items-center justify-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Save
            </div>
            <SaveTypeChips />
        </div>
    );
}

/** iOS share sheet with Machina highlighted (native only; web gets WebCaptureMock). */
function CaptureMock({ native }: { native: boolean }) {
    if (!native) return <WebCaptureMock />;
    return (
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl p-4" aria-hidden>
            {/* Content being shared */}
            <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-border-subtle">
                <div className="w-9 h-9 rounded-lg bg-fill-subtle flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-text-muted" />
                </div>
                <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-text truncate">The science of deep focus</p>
                    <p className="text-[10px] text-text-muted truncate">Sharing from Safari</p>
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
            <SaveTypeChips />
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
    // The chip wears the category's app-wide colour, as on every real card
    // (Card.tsx uses the same getCategoryColorStyle hash), not the accent.
    const chip = getCategoryColorStyle('Productivity');
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
                    <span
                        className="text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-lg"
                        style={{ backgroundColor: chip.backgroundColor, color: chip.color }}
                    >
                        Productivity
                    </span>
                    {/* A plain publisher is just its name, no icon (SourceByline.tsx). */}
                    <span className="text-[10px] text-text-muted truncate">nature.com</span>
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
            {/* Connections — the card detail's own "Related cards" section, by its real name. */}
            <div className="px-3.5 pb-3.5 pt-2.5 border-t border-border-subtle">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted/70 mb-1.5">
                    Related cards
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

/** A miniature of the REAL Revisit tab (DigestView.tsx): its three sections in
    their own vocabulary. "Due now" holds a ResurfacedCardRow with the reminder
    bell, "Do this" holds a TakeawayRow (the blank circle, the task, the card
    under it), and "Weekly synthesis" holds the SynthesisCard masthead. The old
    mock here was an invented digest ("3 threads came together") that matched
    no screen in the app. */
function RevisitMock() {
    const chip = getCategoryColorStyle('Productivity');
    const section = (label: string) => (
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-text-muted">{label}</p>
    );
    return (
        <div className="w-full rounded-2xl bg-card border border-border-subtle shadow-xl p-3.5 flex flex-col gap-3" aria-hidden>
            <div className="flex items-center gap-2">
                <CalendarCheck className="w-3.5 h-3.5 text-accent" />
                <p className="text-[12px] font-bold text-text">Revisit</p>
            </div>
            <div className="flex flex-col gap-1.5">
                {section('Due now')}
                <div className="flex items-center gap-2 rounded-xl bg-fill-subtle px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-text truncate">The science of deep focus</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-text-muted">
                            <span>nature.com</span>
                            <span
                                className="px-1.5 rounded-full text-[8px] leading-4 font-bold uppercase tracking-wider"
                                style={{ backgroundColor: chip.backgroundColor, color: chip.color }}
                            >
                                Productivity
                            </span>
                        </div>
                    </div>
                    <span className="text-[9.5px] font-semibold text-text-muted tabular-nums">4:30 PM</span>
                    <Bell className="w-3.5 h-3.5 text-text-muted shrink-0" />
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                {section('Do this')}
                <div className="flex items-start gap-2 rounded-xl bg-fill-subtle px-2.5 py-2">
                    <Circle className="w-3.5 h-3.5 mt-px text-text-muted opacity-50 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium text-text leading-snug">Block two 90-minute focus sessions this week</p>
                        <p className="mt-0.5 text-[9.5px] text-text-muted truncate">The science of deep focus</p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                {section('Weekly synthesis')}
                <div className="rounded-xl bg-fill-subtle px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                        <CitationGlyph className="w-2 h-auto" />
                        This week in Machina
                    </div>
                    <p className="mt-1 text-[11.5px] font-bold text-text leading-tight">You keep circling one idea</p>
                </div>
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
                : 'Capture here with +: paste a link, add a screenshot, jot a thought. On your phone, share to Machina from any app; in your browser, the extension clips any page in one click.',
            visual: <CaptureMock native={native} />,
        },
        {
            icon: <Waypoints className="w-4 h-4" />,
            eyebrow: 'Understand',
            title: 'Understood, and connected',
            body: 'Machina reads every article, video, screenshot and note in full, then files a clean card: title, summary, tags, category. Each one is matched against everything you already kept, so related saves find each other.',
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
            icon: <CalendarCheck className="w-4 h-4" />,
            eyebrow: 'Revisit',
            title: 'It comes back to you',
            body: 'Reminders come due, the to-dos inside your saves gather in one list, and each week Machina writes up what you kept. All of it waits for you in Revisit.',
            visual: <RevisitMock />,
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
                                    Start saving
                                    <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
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
