'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CitationGlyph, Wordmark } from '@/components/ui/Wordmark';

/**
 * The public landing page — what a SIGNED-OUT visitor to mymachina.app sees.
 *
 * WHY THIS EXISTS (do not quietly delete it): the root used to be the sign-in
 * screen, and two separate reviews were blocked on that one gap. Google's OAuth
 * branding verification rejected the domain on 2026-08-06 for three reasons that
 * are all this page — "your home page is behind a login page", "does not explain
 * the purpose of your app", and "the app name Machina does not match the app
 * name on your home page" — and App Review expects a Support/Marketing URL a
 * signed-out reviewer can read (`docs/APP_STORE.md` §2).
 *
 * That review requirement is a CONTENT requirement, and it constrains the
 * design: reviewers read TEXT. The film is decoration on top of an argument
 * that has to survive with video disabled, blocked, or never hosted. Every
 * claim a reviewer needs — what the product is, who it is by, what it does with
 * your data, where the policy lives — is in prose, above the fold or one scroll
 * below it, and the product name appears as plain text (not only as the drawn
 * wordmark, which is SVG path data a name-matching check can't read).
 *
 * COPY IS NOT FREELY EDITABLE. It is the positioning of record:
 *  - the h1 is the D-6 tagline VERBATIM (`docs/BRANDING.md`) — that exact string
 *    is tracked across six surfaces now, this being the sixth;
 *  - the hero is D-7's consolidated capture ("one place that holds everything
 *    you save"), NOT recall-first — recall is the payoff, further down;
 *  - "You never remember where you saved it" is the launch film's act one and
 *    the founder letter's problem: fragmentation, NOT clutter.
 *  - D-3 IS ABSOLUTE HERE: the words "second brain" and "ai" appear nowhere on
 *    this page, and this is the most visible surface in the product. The App
 *    Store description's "AI summaries, categories, and tags" bullet must be
 *    PARAPHRASED, never pasted.
 *  - D-1: the name is "Machina", never "Machina AI".
 *
 * Rendered from two mount points, deliberately:
 *  - `/welcome` — a genuinely static public route (no AuthProvider at all, see
 *    `lib/publicRoutes.tsx`), so the prose is in the prerendered HTML for a
 *    crawler or a JS-less fetch, and there is one URL that is provably
 *    auth-free. `onGetStarted` is omitted there, so the CTA is a link to `/`.
 *  - `/` — via `AuthProvider`'s signed-out branch, WEB ONLY. Native never
 *    reaches it (see the comment at that call site), so the iOS shell still
 *    opens into the app.
 */
export default function LandingPage({
    /** Web root only: reveal the real sign-in screen. Omitted on `/welcome`,
        which has no auth context — the CTA links to `/` instead. */
    onGetStarted,
}: {
    onGetStarted?: () => void;
}) {
    return (
        <div className="min-h-screen bg-background text-text">
            <Header onGetStarted={onGetStarted} />
            <main>
                <Hero onGetStarted={onGetStarted} />
                <Problem />
                <Film />
                <What />
                <Surfaces />
                <Privacy />
                <Close onGetStarted={onGetStarted} />
            </main>
            <Footer />
        </div>
    );
}

/* ---------------------------------------------------------------- primitives */

/** The one primary action on the page. A button when sign-in is reachable from
 *  this mount point, a link to the root when it isn't — same pixels either way,
 *  so the two mount points can't drift apart visually. */
function GetStarted({
    onGetStarted,
    label = 'Get started',
    className = '',
}: {
    onGetStarted?: () => void;
    label?: string;
    className?: string;
}) {
    const cls =
        'inline-flex items-center justify-center rounded-full bg-accent text-accent-ink ' +
        'px-6 py-3 text-sm font-semibold shadow-sm shadow-accent/20 ' +
        `hover:bg-accent-hover transition-colors ${className}`;
    if (onGetStarted) {
        return (
            <button type="button" onClick={onGetStarted} className={cls}>
                {label}
            </button>
        );
    }
    return (
        <Link href="/" className={cls}>
            {label}
        </Link>
    );
}

/** A titled block of prose. `kicker` is the letterspaced label the film uses
 *  above its own act beats — the page borrows that rhythm so the two assets
 *  read as one piece. */
function Section({
    kicker,
    title,
    children,
    id,
}: {
    kicker?: string;
    title: string;
    children: React.ReactNode;
    id?: string;
}) {
    return (
        <section id={id} className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
            {kicker && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {kicker}
                </p>
            )}
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-text text-balance">
                {title}
            </h2>
            <div className="mt-5 space-y-4 text-[15px] sm:text-base leading-relaxed text-text-secondary">
                {children}
            </div>
        </section>
    );
}

/* -------------------------------------------------------------------- header */

function Header({ onGetStarted }: { onGetStarted?: () => void }) {
    return (
        <header className="mx-auto max-w-3xl px-6 pt-8 flex items-center justify-between">
            {/* The header lockup the app itself uses: the BARE citation mark
                (a rounded container here reads as a shrunken app icon, not as
                the brand mark) beside the drawn wordmark. */}
            <span className="flex items-center gap-2 text-text">
                <CitationGlyph className="h-5 w-auto" />
                <Wordmark className="h-[11px] w-auto" />
            </span>
            {onGetStarted ? (
                <button
                    type="button"
                    onClick={onGetStarted}
                    className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
                >
                    Sign in
                </button>
            ) : (
                <Link
                    href="/"
                    className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
                >
                    Sign in
                </Link>
            )}
        </header>
    );
}

/* ---------------------------------------------------------------------- hero */

function Hero({ onGetStarted }: { onGetStarted?: () => void }) {
    return (
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-10 sm:pt-24 sm:pb-14">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-text text-balance">
                Everything you save, finally useful.
            </h1>

            {/* The D-7 hero, in one sentence, with the product NAMED in plain
                text — Google's third rejection reason was that the app name on
                the consent screen didn't match the home page, and the drawn
                wordmark above is SVG paths, not readable text. */}
            <p className="mt-6 text-lg sm:text-xl leading-relaxed text-text text-pretty">
                <span className="font-semibold">Machina</span> is one place that holds
                everything you save — from every app you save it in.
            </p>

            <p className="mt-5 text-[15px] sm:text-base leading-relaxed text-text-secondary text-pretty">
                Send a link, a screenshot or a video to Machina from anywhere. It reads
                the page, watches the video, looks at the screenshot — and turns each
                save into a clean card with a real summary, a category, tags, and
                connections to things you saved before. Then you can ask your own saves
                a question and get an answer in plain language, with citations back to
                your own sources.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
                <GetStarted onGetStarted={onGetStarted} />
                <span className="text-[13px] text-text-muted">
                    Free to start · iPhone and web
                </span>
            </div>
        </section>
    );
}

/* ------------------------------------------------------------------- problem */

function Problem() {
    return (
        <Section kicker="The problem" title="You never remember where you saved it.">
            <p>
                A recipe goes into Instagram saves. A thread gets bookmarked on X. A
                video lands in Watch Later, an article in a message to yourself, and one
                more tab stays open on your phone for a month.
            </p>

            {/* Act one of the launch film, as a still (frame 300 of the clean
                cut, `marketing/launch-clip/`) — five silos with five counts, the
                page's own argument drawn rather than described. A STILL, not the
                film: it is 71KB, it is committed and same-origin, so it needs no
                CDN, no CSP change and no owner step, and it is on the page from
                the first ship. It carries the section on its own if the film is
                never hosted. Bordered and inset rather than full-bleed because
                the film is graded LIGHT and the app's default theme is dark — an
                edge-to-edge white block reads as a blown-out hole in the page,
                a framed one reads as a screenshot. */}
            <figure className="!mt-8 overflow-hidden rounded-2xl border border-border-subtle bg-card p-2 shadow-[var(--shadow-card)]">
                <img
                    src="/film-still-fragmentation.jpg"
                    alt="Five separate apps, each holding its own pile of saved things: Instagram 24, X 32, YouTube 15, WhatsApp 59, Safari 48."
                    width={1600}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="w-full rounded-xl"
                />
            </figure>

            <p>
                Nothing is lost, exactly. But nothing is findable either, because
                finding it means remembering which of five apps swallowed it. Saving was
                never the hard part.
            </p>
        </Section>
    );
}

/* ---------------------------------------------------------------------- what */

/** One capability, stated as a plain claim with a plain explanation. Three of
 *  these carry the whole product — the order is the film's: capture, then what
 *  comes back, then the payoff. */
function Capability({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-card)]">
            <h3 className="text-base font-semibold text-text">{title}</h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-text-secondary">
                {children}
            </p>
        </div>
    );
}

function What() {
    return (
        <section className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                What Machina does
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-text text-balance">
                One place to save it. One place to find it again.
            </h2>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <Capability title="Capture from anywhere">
                    Share into Machina from the iOS share sheet — Safari, YouTube, X,
                    Instagram, anywhere — or add it from the web app or the browser
                    extension on your computer. Links, screenshots, videos and notes all
                    land in the same place.
                </Capability>
                <Capability title="Everything comes back understood">
                    Each save returns as a card with a summary written in the language
                    you read it in, a category, tags, and &ldquo;see also&rdquo; links to
                    related saves. Search matches what you meant, not just the words you
                    typed.
                </Capability>
                <Capability title="Ask, and get sources">
                    Ask a question of your own saves — <em>what did I save about
                    mortgage rates?</em> — and get an answer in plain language, with
                    citations that jump back to the saves it came from.
                </Capability>
            </div>

            <p className="mt-8 text-[15px] sm:text-base leading-relaxed text-text-secondary text-pretty">
                There is also a weekly write-up of the themes running through what you
                saved, reminders that resurface something worth a second look, and
                collections you can keep private or publish as a shareable page.
            </p>
        </section>
    );
}

/* ------------------------------------------------------------------ surfaces */

function Surfaces() {
    return (
        <Section kicker="Where it runs" title="On your phone, and on your computer.">
            <p>
                Machina is an iPhone app and a web app that share one library — save
                from your phone, find it on your laptop. A browser extension saves the
                page you are reading without leaving it, and an iOS share sheet
                extension saves from any app on your phone in two taps.
            </p>
        </Section>
    );
}

/* ------------------------------------------------------------------- privacy */

function Privacy() {
    return (
        <Section kicker="Your data" title="Private by design.">
            <p>
                No ads, no tracking, no data sold to anyone. What you save is yours: it
                is never used to train anyone&rsquo;s models. Sign in with Apple or
                Google, and delete your account — and everything in it — from Settings,
                any time.
            </p>
            <p className="text-[15px]">
                The details are in the{' '}
                <Link href="/privacy" className="text-text underline underline-offset-4 hover:text-accent transition-colors">
                    privacy policy
                </Link>{' '}
                and the{' '}
                <Link href="/terms" className="text-text underline underline-offset-4 hover:text-accent transition-colors">
                    terms of service
                </Link>
                .
            </p>
        </Section>
    );
}

/* --------------------------------------------------------------------- close */

function Close({ onGetStarted }: { onGetStarted?: () => void }) {
    return (
        <section className="mx-auto max-w-3xl px-6 pb-20 pt-6">
            <div className="rounded-3xl border border-border-subtle bg-card p-8 sm:p-10 text-center shadow-[var(--shadow-card)]">
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text text-balance">
                    Start with the last thing you saved.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-text-secondary text-pretty">
                    Sign in with Apple or Google. Your library is empty for about a
                    minute.
                </p>
                <GetStarted onGetStarted={onGetStarted} className="mt-7" />
            </div>
        </section>
    );
}

/* -------------------------------------------------------------------- footer */

function Footer() {
    return (
        <footer className="border-t border-border-subtle">
            <div className="mx-auto max-w-3xl px-6 py-10">
                <span className="flex items-center gap-2 text-text">
                    <CitationGlyph className="h-4 w-auto" />
                    <Wordmark className="h-[9px] w-auto" />
                </span>
                {/* The D-6 tagline, verbatim. Sixth tracked surface. */}
                <p className="mt-3 text-sm text-text-secondary">
                    Everything you save, finally useful.
                </p>
                <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
                    <Link href="/privacy" className="hover:text-text transition-colors">
                        Privacy
                    </Link>
                    <Link href="/terms" className="hover:text-text transition-colors">
                        Terms
                    </Link>
                    <a
                        href="mailto:support@mymachina.app"
                        className="hover:text-text transition-colors"
                    >
                        support@mymachina.app
                    </a>
                </nav>
                <p className="mt-6 text-[13px] text-text-muted">
                    © 2026 Mor Hogeg. Machina is a personal knowledge base for the things
                    you save.
                </p>
            </div>
        </footer>
    );
}

/* ---------------------------------------------------------------------- film */

/**
 * The launch film (`marketing/launch-clip/`), hosted OFF this origin.
 *
 * Hosting: the renders are 1080p MP4s and `out/` is gitignored — they are NOT
 * committed and must not be served off Vercel. They live on Cloudflare R2
 * (egress-free) behind `cdn.mymachina.app`, which is the ONE extra host in the
 * `media-src` directive added to `web/vercel.json`. A YouTube/Vimeo embed was
 * rejected: `frame-src` allows only google.com and *.firebaseapp.com, so an
 * embed is blocked outright, and widening `frame-src` to a video platform to
 * decorate a page is a bad trade against a CSP this tight.
 *
 * `NEXT_PUBLIC_FILM_BASE` is the switch. UNSET → this section renders NOTHING,
 * which is the whole point: the page's argument is prose, and it shipped and
 * unblocked both reviews before the film was ever uploaded. Set it (no trailing
 * slash) once the three files are on the bucket:
 *   machina-launch-clean.mp4           1920×1080, no score, no captions
 *   machina-launch-clean-vertical.mp4  1080×1920, same
 *   machina-launch.mp4                 the scored, captioned deliverable
 *
 * ⚠️ DO NOT SET IT WITHOUT READING THIS. The film's middle acts put the literal
 * string "AI" on screen, large: the Ask scene's question is "What have I been
 * saving about AI?" and the feed's top card is titled "The jobs AI actually
 * changes" with an `AI` category chip (verified by rendering frames 1400 and 960
 * of `MachinaLaunchClean`). It comes from the demo library's deliberate
 * AI/what-stays-human trio (`src/data/library.ts`), where it is a saved *topic*
 * rather than Machina describing itself — defensible inside the film, and a
 * different thing entirely on the product's most visible page, which
 * `docs/BRANDING.md` D-3 governs. That is an owner call, not a code change:
 * either accept it here, or re-render with a different demo topic. Until it is
 * called, this section stays dark and the act-one STILL above carries the film's
 * argument instead — that frame is clean.
 */
const FILM_BASE = process.env.NEXT_PUBLIC_FILM_BASE ?? '';

function Film() {
    const videoRef = useRef<HTMLVideoElement>(null);
    // Which cut is loaded. 'loop' = the clean cut, muted, autoplaying; 'full' =
    // the scored, captioned deliverable with controls, after a click.
    const [mode, setMode] = useState<'loop' | 'full'>('loop');
    // Vertical for narrow viewports — resolved on mount rather than with a
    // `<source media>` (unreliable across browsers) or two mounted <video>
    // elements (both would fetch). null until measured, so nothing is fetched
    // during the prerender or the first paint.
    const [vertical, setVertical] = useState<boolean | null>(null);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const apply = () => setVertical(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    if (!FILM_BASE) return null;

    const src =
        mode === 'full'
            ? `${FILM_BASE}/machina-launch.mp4`
            : vertical
              ? `${FILM_BASE}/machina-launch-clean-vertical.mp4`
              : `${FILM_BASE}/machina-launch-clean.mp4`;

    const playFull = () => {
        setMode('full');
        // The src swap is a React re-render; play once the new cut is loaded.
        requestAnimationFrame(() => {
            const v = videoRef.current;
            if (!v) return;
            v.muted = false;
            v.currentTime = 0;
            void v.play();
        });
    };

    return (
        <section className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
            <div className="overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-[var(--shadow-card)]">
                {vertical !== null && (
                    <video
                        ref={videoRef}
                        key={src}
                        src={src}
                        poster="/film-still-fragmentation.jpg"
                        className={`w-full ${vertical && mode === 'loop' ? 'aspect-[9/16]' : 'aspect-video'} object-cover`}
                        // The loop cut is decoration: muted (the only way an
                        // autoplay survives any browser's policy), inline so iOS
                        // doesn't hijack it fullscreen, and chromeless. The full
                        // cut is a deliberate play, so it gets controls.
                        autoPlay={mode === 'loop'}
                        loop={mode === 'loop'}
                        muted={mode === 'loop'}
                        playsInline
                        controls={mode === 'full'}
                        preload="metadata"
                    />
                )}
            </div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[13px] text-text-muted">
                    Machina, in about a minute.
                </p>
                {mode === 'loop' && (
                    <button
                        type="button"
                        onClick={playFull}
                        className="text-sm font-medium text-text underline underline-offset-4 hover:text-accent transition-colors"
                    >
                        Watch with sound
                    </button>
                )}
            </div>
        </section>
    );
}
