'use client';

import { GRAPH_EDGES, GRAPH_NODES } from './demoData';
import { useInView } from './hooks';

const NODE = new Map(GRAPH_NODES.map((n) => [n.id, n]));

/**
 * The connections beat: edges DRAW IN, staggered, rather than a finished
 * diagram fading up.
 *
 * That distinction is the whole point and it is worth the extra code — a
 * diagram that appears is a picture of a graph, while edges that arrive one
 * after another read as connections being *found*, which is what actually
 * happens: the graph is recomputed on every save, unprompted, and surfaces on
 * the card as "see also". `docs/BRANDING.md` D-2 calls this the one beat a
 * competitor cannot copy, which is why it gets a scene rather than a bullet.
 *
 * GEOMETRY NOTE, because this is the easy thing to get subtly wrong: the SVG
 * and the labels share ONE layer, the SVG fills it with a 0–100 viewBox, and
 * the labels are positioned at the same 0–100 numbers as percentages — so a
 * node's `x` lands in the identical place in both coordinate systems and every
 * edge meets its label exactly. Two things keep that true:
 *   - `preserveAspectRatio="none"`, so the viewBox maps to the box linearly on
 *     each axis independently. Without it, a non-square panel letterboxes the
 *     SVG and every edge misses its node by the letterbox margin. Straight
 *     lines stay straight under an axis-independent scale, and
 *     `vector-effect: non-scaling-stroke` keeps the hairline even.
 *   - the labels live on THIS layer, not on the padded card around it.
 *     Otherwise every edge misses by the padding.
 *
 * Line lengths are plain arithmetic rather than `getTotalLength()`: the space
 * is fixed, so a straight line's length is known without a layout read per edge
 * on mount.
 */
export default function ConnectScene() {
    const [ref, seen] = useInView<HTMLElement>();

    return (
        <section
            ref={ref}
            aria-labelledby="mx-connect-title"
            className={`mx-auto max-w-5xl px-6 py-20 sm:py-28 ${seen ? 'mx-in' : ''}`}
        >
            <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
                <div>
                    <p className="mx-rise text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Connect
                    </p>
                    <h2
                        id="mx-connect-title"
                        className="mx-rise mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                        style={{ ['--i' as string]: 1 }}
                    >
                        It notices what belongs together.
                    </h2>
                    <p
                        className="mx-rise mt-5 text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base"
                        style={{ ['--i' as string]: 2 }}
                    >
                        Every save is compared against everything you already saved, the moment it
                        lands — so the flat and the note about its commute end up linked without
                        you filing either one, and the trip guide knows about the bakery two
                        streets below the viewpoint.
                    </p>
                    <p
                        className="mx-rise mt-4 text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base"
                        style={{ ['--i' as string]: 3 }}
                    >
                        You never have to build the structure. It is the part nobody keeps up
                        with, and it is the part that makes a save worth having months later.
                    </p>
                </div>

                {/* Decorative: the paragraphs beside it say the same thing, and a
                    screen reader has no use for seven positioned labels and six
                    line segments. */}
                <div
                    aria-hidden
                    className="rounded-3xl border border-border-subtle bg-card p-5 shadow-[var(--shadow-card)]"
                >
                    {/* `text-text-secondary`, not `-muted`: the edges are 1px
                        hairlines and muted grey on the graphite ground rendered
                        as almost nothing. The connections are the point of the
                        panel — they have to be the thing you see first. */}
                    <div className="relative aspect-[5/4] w-full text-text-secondary">
                        <svg
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            className="absolute inset-0 h-full w-full"
                        >
                            {GRAPH_EDGES.map(([a, b], i) => {
                                const from = NODE.get(a);
                                const to = NODE.get(b);
                                if (!from || !to) return null;
                                const len = Math.hypot(to.x - from.x, to.y - from.y);
                                return (
                                    <line
                                        key={`${a}-${b}`}
                                        className="mx-edge"
                                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                                        stroke="currentColor"
                                        strokeWidth={1.25}
                                        vectorEffect="non-scaling-stroke"
                                        /* Dashed by its own full length and offset
                                           by the same, so the line starts invisible
                                           and `mx-draw` walks the offset to zero. */
                                        strokeDasharray={len}
                                        strokeDashoffset={len}
                                        style={{ ['--i' as string]: i }}
                                    />
                                );
                            })}
                        </svg>

                        {/* Labels live above the SVG in normal DOM so they are
                            real text at a real size, not SVG text scaled by the
                            viewBox. */}
                        {GRAPH_NODES.map((n, i) => (
                            <span
                                key={n.id}
                                className="mx-pop absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border-subtle bg-background px-2.5 py-1 text-[11px] font-medium text-text shadow-[var(--shadow-card)]"
                                style={{ left: `${n.x}%`, top: `${n.y}%`, ['--i' as string]: i }}
                            >
                                {n.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
