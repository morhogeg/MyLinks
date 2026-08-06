'use client';

import { SHELF } from './demoData';
import { CardView } from './parts';
import { useInView } from './hooks';

/** One row of the shelf. The track holds the cards twice and translates by
 *  exactly -50%, so the seam falls on an identical frame and the loop has no
 *  visible restart. */
function Row({ cards, seconds, reverse = false }: {
    cards: typeof SHELF;
    seconds: number;
    reverse?: boolean;
}) {
    const track = (
        <div className="flex shrink-0 gap-4 pr-4">
            {cards.map((c) => (
                <div key={c.title} className="w-[17rem] shrink-0">
                    <CardView card={c} compact />
                </div>
            ))}
        </div>
    );
    return (
        <div className="mx-shelf mx-shelf-mask overflow-hidden">
            <div
                className={`mx-shelf-track flex w-max ${reverse ? 'mx-shelf-reverse' : ''}`}
                style={{ ['--mx-shelf-dur' as string]: `${seconds}s` }}
            >
                {track}
                {/* The second copy is scenery, not content — hidden from
                    assistive tech so the same twelve titles aren't announced
                    twice. */}
                <div aria-hidden>{track}</div>
            </div>
        </div>
    );
}

/**
 * The library as a shelf: one continuous row of saves that visibly mixes
 * Instagram, X, YouTube, plain pages, screenshots and notes to yourself.
 *
 * The mixing is the entire argument, and it is why this is a moving shelf
 * rather than a static grid of six. A grid reads as "here are some features";
 * a row that keeps going, with a different platform every card, reads as "this
 * is where all of it ended up" — which is the D-7 hero, shown instead of
 * claimed. Same reason the film's feed scene mixes platforms rather than
 * captioning that it does.
 *
 * Two rows at different speeds and opposite directions, so they never sync into
 * a visible beat. Hover or keyboard focus pauses both — a moving target you
 * cannot finish reading is a tease, not a feature.
 */
export default function ShelfScene() {
    const [ref, seen] = useInView<HTMLElement>();
    const half = Math.ceil(SHELF.length / 2);

    return (
        <section
            ref={ref}
            aria-labelledby="mx-shelf-title"
            className={`py-14 sm:py-20 ${seen ? 'mx-in' : ''}`}
        >
            <div className="mx-auto max-w-3xl px-6 text-center">
                <p className="mx-rise text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Your library
                </p>
                <h2
                    id="mx-shelf-title"
                    className="mx-rise mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                    style={{ ['--i' as string]: 1 }}
                >
                    A dome, a typeface, an idea, a thread.
                </h2>
                <p
                    className="mx-rise mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base"
                    style={{ ['--i' as string]: 2 }}
                >
                    One month of saving produces things this different, and no single app holds
                    them. Everything below came from a different place — and it all landed here,
                    summarized, categorized, and searchable by what you meant — not just the
                    words you happen to remember.
                </p>
            </div>

            <div className="mt-10 space-y-4">
                <Row cards={SHELF.slice(0, half)} seconds={68} />
                <Row cards={SHELF.slice(half)} seconds={82} reverse />
            </div>
        </section>
    );
}
