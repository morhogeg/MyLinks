'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QUESTIONS } from './demoData';
import { KindMark, LiveMark } from './parts';
import { useInView, prefersReducedMotion } from './hooks';

/**
 * Ask, played out: pick a question, watch it typed, watch the answer arrive,
 * watch the citations land.
 *
 * This is the beat the launch film gives five bars to, and the one thing on the
 * page that is genuinely hard to convey in a sentence — "answers from your own
 * saves, with sources" sounds like every other assistant until you watch three
 * citation chips from three different apps appear underneath the answer.
 *
 * Every answer here is assemblable from the saves it cites, and every save it
 * cites appears on the shelf further down the page (`demoData.ts`). That is not
 * pedantry: an answer citing sources it could not have come from would be the
 * product lying in its own voice, on its own home page.
 *
 * ACCESSIBILITY, and the reason it is shaped this way: the animated exchange is
 * `aria-hidden`, and the complete question + answer + sources sit beside it in a
 * visually-hidden paragraph. Otherwise a screen reader gets the whole thing
 * twice — once as it streams in, once as the static copy — and the streaming
 * version arrives a word at a time, which is unusable. The hidden copy is also
 * what a crawler and a JavaScript-off reviewer get, so the argument survives
 * with none of the choreography.
 */
export default function AskScene() {
    const [ref, inView] = useInView<HTMLElement>();
    const [qIndex, setQIndex] = useState(0);
    const [runId, setRunId] = useState(0);
    // True once the reader has picked a question themselves. Until then the
    // scene demos itself, advancing to the next question after each answer —
    // the same "alive until touched" rule the capture scene follows. The first
    // click hands the wheel over for good.
    const [interacted, setInteracted] = useState(false);

    const q = QUESTIONS[qIndex];
    const words = useMemo(() => q.a.split(' '), [q.a]);

    // Three counters drive the scene. Cheap: the question is one text node, and
    // the answer re-renders at most once per 46ms for one paragraph's length.
    const [typed, setTyped] = useState(0);
    const [thinking, setThinking] = useState(false);
    const [shown, setShown] = useState(0);

    // Cancel functions rather than raw ids — `setInterval` and `setTimeout`
    // have different return types once @types/node is in the project, and
    // storing closures sidesteps the cast entirely.
    const cancels = useRef<(() => void)[]>([]);

    useEffect(() => {
        if (!inView) return;

        const clearAll = () => { cancels.current.forEach((c) => c()); cancels.current = []; };
        clearAll();

        // Motion reduced: the answer is simply there. Nobody needs to watch a
        // caret to understand what a cited answer is.
        if (prefersReducedMotion()) {
            setTyped(q.q.length);
            setThinking(false);
            setShown(words.length);
            return;
        }

        setTyped(0);
        setThinking(false);
        setShown(0);

        let i = 0;
        const typeId = setInterval(() => {
            i += 1;
            setTyped(i);
            if (i < q.q.length) return;
            clearInterval(typeId);
            setThinking(true);
            const waitId = setTimeout(() => {
                setThinking(false);
                let w = 0;
                const streamId = setInterval(() => {
                    w += 1;
                    setShown(w);
                    if (w >= words.length) clearInterval(streamId);
                }, 46);
                cancels.current.push(() => clearInterval(streamId));
            }, 760);
            cancels.current.push(() => clearTimeout(waitId));
        }, 26);
        cancels.current.push(() => clearInterval(typeId));

        return clearAll;
        // `runId` is a dependency so Replay re-runs the identical sequence.
    }, [inView, qIndex, runId, q.q, words.length]);

    const complete = shown >= words.length;

    // Self-demo: advance to the next question a beat after the citations land.
    // Stops the moment the reader takes over, off-screen, or with motion off.
    useEffect(() => {
        if (!complete || interacted || !inView || prefersReducedMotion()) return;
        const id = setTimeout(() => {
            setQIndex((i) => (i + 1) % QUESTIONS.length);
            setRunId((n) => n + 1);
        }, 5600);
        return () => clearTimeout(id);
    }, [complete, interacted, inView]);

    return (
        <section ref={ref} aria-labelledby="mx-ask-title" className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Recall
                </p>
                <h2
                    id="mx-ask-title"
                    className="mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                >
                    Ask your own saves. Get sources.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Ask in plain language. Machina answers from what you saved — not the open
                    web — with citations that jump straight back to the source. Try one:
                </p>
            </div>

            {/* The question picker. A horizontal rail on phones, so three whole
                questions stay readable instead of wrapping into six lines. */}
            <div className="-mx-6 mt-8 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex justify-start gap-2 sm:justify-center">
                    {QUESTIONS.map((item, i) => (
                        <button
                            key={item.q}
                            type="button"
                            onClick={() => { setInteracted(true); setQIndex(i); setRunId((n) => n + 1); }}
                            aria-pressed={i === qIndex}
                            className={
                                'shrink-0 rounded-full border px-4 py-2 text-[13px] transition-colors duration-200 '
                                + (i === qIndex
                                    ? 'border-transparent bg-accent text-accent-ink'
                                    : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text')
                            }
                        >
                            {item.q}
                        </button>
                    ))}
                </div>
            </div>

            {/* THE CARD'S HEIGHT NEVER CHANGES (round 12 — the rotation was
                reflowing the whole page under the reader). The trick is a
                grid-stack SIZER: every question's FINISHED exchange — full
                bubble, full answer, full citation rows — is rendered invisibly
                into the same grid cell as the live performance, so the card is
                always exactly as tall as its tallest possible state, at every
                viewport, with nothing hardcoded. Rotation animates INSIDE a
                box that never moves. */}
            <div className="mt-8 rounded-3xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
                <div className="grid">
                    {QUESTIONS.map((item) => (
                        <div
                            key={item.q}
                            aria-hidden
                            className="pointer-events-none invisible col-start-1 row-start-1"
                        >
                            <div className="flex justify-end">
                                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-left text-[14px] font-medium text-accent-ink">
                                    {item.q}
                                </p>
                            </div>
                            <div className="mt-6">
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 h-6 w-6 shrink-0" />
                                    <p className="min-w-0 flex-1 text-[15px] leading-relaxed sm:text-base">
                                        {item.a}
                                    </p>
                                </div>
                                <div className="mt-5 border-t border-transparent pt-4">
                                    <p className="text-[11px] uppercase tracking-wider">From your saves</p>
                                    <div className="mt-2.5 flex flex-wrap gap-2">
                                        {item.citations.map((c, i) => (
                                            <span
                                                key={`${c.label}-${i}`}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[12px]"
                                            >
                                                <span className="h-3 w-3" />
                                                {c.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* The performance. Hidden from assistive tech — the real
                        copy is the paragraph after it. */}
                    <div aria-hidden className="col-start-1 row-start-1">
                        <div className="flex justify-end">
                            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-left text-[14px] font-medium text-accent-ink">
                                {q.q.slice(0, typed)}
                                {typed < q.q.length && <span className="mx-caret">|</span>}
                            </p>
                        </div>

                        {/* THE MARK IS THE APP'S OWN `CitationMark` (round 8):
                            the same component Ask mounts, with the app's verb
                            per phase — `searching` while it reads the saves,
                            `shaping` while the answer streams, `listening` at
                            rest. */}
                        <div className="mt-6">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 shrink-0">
                                <LiveMark
                                    state={thinking ? 'searching' : shown > 0 && !complete ? 'shaping' : 'listening'}
                                    size={24}
                                    aria-label={thinking ? 'Machina is reading your saves' : 'Machina'}
                                />
                            </span>
                            <div className="min-w-0 flex-1">
                                {thinking && (
                                    <p className="pt-1 text-[13px] text-text-muted">
                                        Reading your saves…
                                    </p>
                                )}

                                {shown > 0 && (
                                    <p className="text-[15px] leading-relaxed text-text sm:text-base">
                                        {words.slice(0, shown).map((w, i) => (
                                            <span key={i} className="mx-word">{w}{' '}</span>
                                        ))}
                                    </p>
                                )}
                            </div>
                        </div>

                        {complete && (
                            <div key={`${qIndex}-${runId}`} className="mx-in mt-5 border-t border-border-subtle pt-4">
                                <p className="text-[11px] uppercase tracking-wider text-text-muted">
                                    From your saves
                                </p>
                                <div className="mt-2.5 flex flex-wrap gap-2">
                                    {q.citations.map((c, i) => (
                                        <span
                                            key={`${c.label}-${i}`}
                                            className="mx-pop inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-fill-subtle px-3 py-1.5 text-[12px] text-text"
                                            style={{ ['--i' as string]: i }}
                                        >
                                            <KindMark kind={c.kind} className="h-3 w-3" />
                                            {c.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                </div>

                <p className="sr-only">
                    Question: {q.q} Answer: {q.a} Sources:{' '}
                    {q.citations.map((c) => c.label).join('; ')}.
                </p>
            </div>
        </section>
    );
}
