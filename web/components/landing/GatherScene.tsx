'use client';

import { useRef } from 'react';
import { SILOS } from './demoData';
import { KindMark } from './parts';
import { useSceneProgress } from './hooks';

/**
 * The scene the whole page is built around: five silos drift apart, then rush
 * back and collapse into one point that the brackets close around.
 *
 * This is the launch film's act one and its turn, rebuilt in the DOM. Rebuilt
 * rather than embedded for three reasons, in order of how much they mattered:
 * the film renders the literal string "AI" on screen in its later scenes, which
 * `docs/BRANDING.md` D-3 forbids here; a 1080p MP4 needs a CDN, a `media-src`
 * widening and an owner upload before anything renders at all; and a video
 * cannot be scrubbed by the reader's own scroll, which is the one thing that
 * makes this beat land — the gathering happens because THEY gathered it.
 *
 * How it works: the outer section is three viewports tall and does nothing but
 * provide scroll distance. The stage inside is `sticky` and pinned for that
 * whole distance, and `useSceneProgress` writes four numbers onto it as custom
 * properties. Everything else is `calc()` in `landing.css`. No child re-renders
 * while you scroll — there is no React state in this component at all.
 *
 * WITH MOTION OFF, or with no JavaScript, the stage sits at its resolved end
 * state: silos gathered, mark closed, closing line shown. The argument survives;
 * only the gesture is lost. Both headings and both paragraphs are real text in
 * the markup either way, which is what the review requirement actually needs.
 */
export default function GatherScene() {
    const sectionRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    useSceneProgress(sectionRef, stageRef);

    return (
        <section
            ref={sectionRef}
            aria-labelledby="mx-problem-title"
            /* Three viewports of scroll for roughly six seconds of scene at a
               normal scroll speed. Shorter and the collapse happens faster than
               it reads; longer and it starts to feel like the page is stuck. */
            className="relative h-[300vh]"
        >
            <div
                ref={stageRef}
                className="mx-stage sticky top-0 h-screen overflow-hidden"
            >
                {/*
                  * THE STAGE IS TWO ZONES, and that split is what makes the
                  * scene readable. The silo field and the mark share an origin
                  * at 38% of the viewport height; the copy sits in the lower
                  * third. The first pass centred both on the middle of the
                  * screen and the piles landed on top of the headline — the
                  * text won on z-index and the whole frame read as a mistake.
                  * Everything the silos do now happens above the words.
                  */}
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                    <div className="absolute left-1/2 top-[38%]">
                        {SILOS.map((s) => (
                            <div
                                key={s.label}
                                className="mx-silo absolute -translate-x-1/2 -translate-y-1/2"
                                style={{ ['--sx' as string]: s.x, ['--sy' as string]: s.y }}
                            >
                                <SiloCard kind={s.kind} label={s.label} count={s.count} />
                            </div>
                        ))}

                        {/* What they collapse into — on the EXACT origin the
                            silos travel to, so the arrival lands rather than
                            approximately coinciding. */}
                        <div className="mx-stage-mark absolute -translate-x-1/2 -translate-y-1/2">
                            <span
                                className="absolute -inset-[70%] rounded-full"
                                style={{
                                    background:
                                        'radial-gradient(closest-side, var(--accent-ring), transparent 72%)',
                                    opacity: 'var(--mark)',
                                }}
                            />
                            <svg
                                viewBox="288 292 448 416"
                                className="relative w-[min(26vw,160px)] text-text"
                                fill="currentColor"
                                style={{ filter: 'drop-shadow(0 0 26px var(--accent-ring))' }}
                            >
                                <path
                                    className="mx-stage-bracket-l"
                                    d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z"
                                />
                                <path
                                    className="mx-stage-bracket-r"
                                    d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z"
                                />
                                <circle className="mx-stage-point" cx="512" cy="500" r="52" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* The copy. Both states are in the DOM at all times and neither
                    is ever `display:none`, so the text is there for a crawler
                    and a reviewer regardless of where the scroll happens to be —
                    which is the whole reason this scene is allowed to exist on a
                    page two reviews depend on. */}
                <div className="absolute inset-x-0 bottom-[9vh] mx-auto grid max-w-2xl place-items-center px-6 text-center">
                    <div className="mx-copy-problem col-start-1 row-start-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            The problem
                        </p>
                        <h2
                            id="mx-problem-title"
                            className="mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-5xl"
                        >
                            You never remember where you saved it.
                        </h2>
                        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                            A recipe goes into Instagram saves. A thread gets bookmarked on X. A
                            video lands in Watch Later, an article in a message to yourself, and
                            one more tab stays open on your phone for a month.
                        </p>
                    </div>

                    <div className="mx-copy-resolve col-start-1 row-start-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            Machina
                        </p>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-5xl">
                            One place. Everything you save.
                        </h2>
                        {/* The founder letter's line, landed (round 11) and
                            re-worked (round 13): "swallowed" cut, "the half"
                            cut, and the ORGANIZATION value named outright —
                            gathering alone would just be a sixth pile; the
                            summarize/categorize/tag/connect clause is what
                            makes the one place useful. */}
                        {/* Round 17: the two lead sentences exist for Google's
                            OAuth branding review, which rejected the page for
                            not explaining the app's purpose. Everything else
                            here is narrative; nothing on the page said the
                            plain "Machina is a ___ that ___". Kept in the
                            page's voice, and D-3 clean (the category noun is
                            "personal knowledge base", never "second brain"). */}
                        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                            Machina is a personal knowledge base: send it a link, a screenshot
                            or a video from any app, and it saves, summarizes and organizes it
                            for you. Months later, the thing you half remember is one question
                            away, answered from your own saves with the sources it came from.
                            You never lost any of it. It was scattered across five apps,
                            impossible to find when it mattered. Gathered here, every save is summarized,
                            categorized, tagged, and connected to the rest of what you know.
                            Saving was never the hard part. Everything after it is what Machina
                            is for.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

/** One platform's pile: its mark, its name, and how much of your life is in it. */
function SiloCard({ kind, label, count }: {
    kind: (typeof SILOS)[number]['kind'];
    label: string;
    count: number;
}) {
    return (
        <div className="w-[min(38vw,190px)] rounded-xl border border-border-subtle bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    <KindMark kind={kind} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-[11px] font-medium text-text">{label}</span>
                </span>
                <span className="shrink-0 rounded-full bg-fill-subtle px-1.5 text-[10px] tabular-nums text-text-secondary">
                    {count}
                </span>
            </div>
            {/* The pile itself: rows of saved things with the detail sanded off,
                each fainter than the last. The pile going unreadable IS the
                point, so the rows are drawn as fading bars rather than as text
                nobody is meant to read. */}
            <div className="mt-2.5 space-y-1.5">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-1.5" style={{ opacity: 1 - i * 0.22 }}>
                        <span className="h-4 w-4 shrink-0 rounded bg-fill-subtle" />
                        <span className="h-1.5 flex-1 rounded-full bg-fill-subtle" />
                    </div>
                ))}
            </div>
        </div>
    );
}
