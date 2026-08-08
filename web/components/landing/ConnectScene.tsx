'use client';

import LandingGraph from './LandingGraph';
import { useInView } from './hooks';

/**
 * The connections beat. The panel is the app's own knowledge graph running the
 * real model builder and the real force simulation over the demo library — see
 * `LandingGraph.tsx` for what is genuinely shared and what is deliberately not.
 * An earlier pass drew a hand-placed SVG constellation here; the owner rejected
 * it ("graph should be our own exact graph, not a mockup"), and the rejection
 * was right: this is the one feature `docs/BRANDING.md` D-2 calls uncopyable,
 * so it is the one place a lookalike actively undermines the claim.
 *
 * The graph assembles when the panel scrolls into view — connections being
 * FOUND, live, which no static image can say.
 */
export default function ConnectScene() {
    const [ref, seen] = useInView<HTMLElement>();

    return (
        <section
            ref={ref}
            aria-labelledby="mx-connect-title"
            className={`mx-auto max-w-5xl px-6 py-14 sm:py-20 ${seen ? 'mx-in' : ''}`}
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
                        lands, so a screenshot of the Pantheon’s section ends up beside the article
                        that explains what it shows, and a half-written note about a deck finds
                        the two saves that answer it.
                    </p>
                    <p
                        className="mx-rise mt-4 text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base"
                        style={{ ['--i' as string]: 3 }}
                    >
                        You never have to build the structure. It is the part nobody keeps up
                        with, and it is the part that makes a save worth having months later.
                        This is the same graph the app draws, assembling itself from the saves
                        on this page.
                    </p>
                </div>

                {/* The panel's ground (round 14): a quiet observatory rather
                    than a flat card — a soft radial lift where the constellation
                    hangs, over a fine dot lattice. Both layers are BUILT FROM
                    TOKENS (`--text` via color-mix for the bloom, `--border-strong`
                    for the dots), so they invert correctly with the theme and
                    can never outshout the 11px labels — the dots sit at hairline
                    contrast by construction. */}
                <div
                    className="mx-rise overflow-hidden rounded-3xl border border-border-subtle bg-card p-2 shadow-[var(--shadow-card)]"
                    style={{ ['--i' as string]: 2 }}
                >
                    <div
                        className="overflow-hidden rounded-2xl"
                        style={{
                            backgroundImage:
                                'radial-gradient(85% 65% at 50% 32%, color-mix(in oklab, var(--text) 6%, transparent), transparent 72%), '
                                + 'radial-gradient(circle at 1px 1px, var(--border-strong) 1px, transparent 1.4px)',
                            backgroundSize: 'auto, 24px 24px',
                        }}
                    >
                        <LandingGraph className="aspect-square w-full md:aspect-[5/4]" />
                    </div>
                </div>
            </div>
        </section>
    );
}
