'use client';

import { useEffect, useState } from 'react';
import { Share, Link2, Image as ImageIcon, Play } from 'lucide-react';
import { LINK_SCAN_ORBS } from '@/lib/scanPhases';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { CAPTURE_SOURCES } from './demoData';
import { CardView, LiveMark } from './parts';
import { useInView, useSequence, prefersReducedMotion } from './hooks';

/** How long the finished card holds before the next shape runs. */
const HOLD_MS = 4200;

const TAB_ICONS = {
    link: <Link2 className="h-4 w-4" aria-hidden />,
    shot: <ImageIcon className="h-4 w-4" aria-hidden />,
    video: <Play className="h-4 w-4" aria-hidden />,
} as const;

/**
 * Capture: one SUBJECT, three SHAPES.
 *
 * The three kinds are back (round 11 — the single-scanner variant lost the
 * section's point), but redesigned around one idea instead of three arranged
 * options: every demo save is the SAME thread. The Roman-concrete article, the
 * annotated Pantheon screenshot, the dome documentary — one curiosity arriving
 * as a link, a screenshot, and a video. The shape changes; the thread doesn't.
 * That is the product's claim, and it makes the whole page one story: these
 * captures are the island the graph assembles two scenes later.
 *
 * The switcher is the APP'S OWN segmented control — the container, radii,
 * heights and active treatment of `settings/primitives.tsx Segmented`,
 * with icons so the three kinds read at a glance and short labels that hold
 * one line on a phone (the round-7 uppercase pill row didn't). It looks
 * tappable because it is the control the app uses for exactly this job.
 *
 * Untouched, the scene demos itself — link → screenshot → video on a loop;
 * the first tap hands the wheel over for good (the page-wide rule).
 */
export default function CaptureScene() {
    const [ref, inView] = useInView<HTMLElement>();
    const [sourceIdx, setSourceIdx] = useState(0);
    // Keys the sequence timer AND the card's landing animation, so each pass
    // replays the performance rather than swapping content in place.
    const [runId, setRunId] = useState(0);
    const [interacted, setInteracted] = useState(false);

    const source = CAPTURE_SOURCES[sourceIdx % CAPTURE_SOURCES.length];
    const step = useSequence(source.steps.length, 620, inView, runId);
    const done = step >= source.steps.length;

    useEffect(() => {
        if (!done || !inView || interacted || prefersReducedMotion()) return;
        const id = setTimeout(() => {
            setSourceIdx((i) => (i + 1) % CAPTURE_SOURCES.length);
            setRunId((n) => n + 1);
        }, HOLD_MS);
        return () => clearTimeout(id);
    }, [done, inView, interacted]);

    return (
        <section ref={ref} aria-labelledby="mx-capture-title" className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Capture
                </p>
                <h2
                    id="mx-capture-title"
                    className="mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                >
                    Share it once. It comes back understood.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Send Machina a link, a screenshot or a video from any app on your phone,
                    or dropped straight into the web app. It reads pages, looks at screenshots,
                    watches videos. Below, one thread arrives in all three shapes.
                </p>
            </div>

            {/* The app's segmented control (settings/primitives.tsx), sized for
                the section: same container, radii, heights, active treatment. */}
            <div
                role="group"
                aria-label="What you shared"
                className="mx-auto mt-8 flex w-full max-w-md items-center gap-1 rounded-2xl border border-border-subtle bg-card-hover p-1"
            >
                {CAPTURE_SOURCES.map((s, i) => {
                    const active = i === sourceIdx % CAPTURE_SOURCES.length;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                                setInteracted(true);
                                setSourceIdx(i);
                                setRunId((n) => n + 1);
                            }}
                            className={
                                'inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl '
                                + 'text-[13px] font-semibold transition-colors '
                                + (active
                                    ? 'bg-accent text-accent-ink shadow-sm'
                                    : 'text-text-secondary hover:text-text')
                            }
                        >
                            {TAB_ICONS[s.id]}
                            {s.tab}
                        </button>
                    );
                })}
            </div>

            {/* items-center: the pipeline card is fixed at five phases and the
                result card is shorter — centred, the payoff sits opposite the
                work that produced it. */}
            <div className="mt-8 grid gap-6 md:grid-cols-2 md:items-center">
                {/* The work. `min-w-0` is load-bearing: a grid item defaults to
                    `min-width: auto`, and the unbreakable handle line would
                    otherwise force page scroll at 320px. */}
                <div className="min-w-0 rounded-3xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-card)]">
                    <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill-subtle">
                            <Share className="h-4 w-4 text-text-secondary" aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[11px] uppercase tracking-wider text-text-muted">
                                Shared to Machina
                            </span>
                            <span className="block truncate text-[13px] font-medium text-text">
                                {source.handle}
                            </span>
                        </span>
                    </div>

                    <ol className="mt-4 space-y-1">
                        {source.steps.map((label, i) => {
                            const state = done || i < step ? 'done' : i === step ? 'active' : 'todo';
                            return (
                                <li
                                    key={label}
                                    className={
                                        'flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-300 '
                                        + (state === 'active' ? 'bg-fill-subtle ' : '')
                                        + (state === 'todo' ? 'opacity-40' : '')
                                    }
                                >
                                    {/* THE APP'S ORB PER PHASE (round 12 — owner:
                                        the plain circles were beneath the row).
                                        `LINK_SCAN_ORBS` is the app's own
                                        phase → verb map (working / searching /
                                        shaping / solving), and the ACTIVE phase
                                        plays it through the real CitationMark.
                                        Done and pending phases hold the static
                                        glyph — full ink behind you, faint ahead —
                                        so one animated mark rides the checklist
                                        the way it rides the app's own stepper. */}
                                    <span className="grid h-5 w-6 shrink-0 place-items-center" aria-hidden>
                                        {state === 'active' ? (
                                            <LiveMark state={LINK_SCAN_ORBS[i]} size={20} />
                                        ) : (
                                            <CitationGlyph
                                                className={`h-3.5 w-auto ${state === 'done' ? 'text-text' : 'text-text-muted/40'}`}
                                            />
                                        )}
                                    </span>
                                    <span className="text-[13px] text-text">{label}</span>
                                    {state === 'active' && (
                                        <span className="mx-sweep relative ml-auto h-px w-16 overflow-hidden rounded-full bg-fill-subtle" />
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    <p className="sr-only" role="status">
                        {done ? 'Save complete.' : `Step ${Math.max(1, step + 1)} of ${source.steps.length}: ${source.steps[Math.min(step, source.steps.length - 1)]}`}
                    </p>
                </div>

                {/* What comes back — the app's real card. */}
                <div className="min-w-0 min-h-[15rem]">
                    {done ? (
                        <div key={runId} className="mx-card-land">
                            <CardView card={source.card} />
                        </div>
                    ) : (
                        /* The card's own skeleton at the card's proportions, so
                           nothing jumps when the finished card replaces it. */
                        <div className="rounded-[20px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-card)]">
                            <div className="h-3 w-24 rounded-full bg-fill-subtle" />
                            <div className="mt-4 h-4 w-3/4 rounded-full bg-fill-subtle" />
                            <div className="mt-3 space-y-2">
                                <div className="h-2.5 w-full rounded-full bg-fill-subtle" />
                                <div className="h-2.5 w-5/6 rounded-full bg-fill-subtle" />
                            </div>
                            <div className="mt-4 flex gap-2">
                                <div className="h-4 w-16 rounded-full bg-fill-subtle" />
                                <div className="h-4 w-12 rounded-full bg-fill-subtle" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </section>
    );
}
