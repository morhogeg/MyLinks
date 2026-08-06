'use client';

import Link from 'next/link';
import { ArrowDown, Share2, Globe, Puzzle } from 'lucide-react';
import { CitationGlyph, Wordmark } from '@/components/ui/Wordmark';
import GatherScene from '@/components/landing/GatherScene';
import CaptureScene from '@/components/landing/CaptureScene';
import AskScene from '@/components/landing/AskScene';
import ConnectScene from '@/components/landing/ConnectScene';
import ShelfScene from '@/components/landing/ShelfScene';
import { useInView } from '@/components/landing/hooks';
import '@/components/landing/landing.css';

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
 * THE ONE RULE THAT SHAPES EVERYTHING HERE: **reviewers read text.** Every
 * scene on this page is a demonstration wrapped around a paragraph, never
 * instead of one. Turn off JavaScript, turn on reduce-motion, or read the
 * prerendered HTML of `/welcome`, and the full argument is still there in
 * prose — what the product is, who it is by, what it does with your data, and
 * where the policy lives. The choreography is the reason someone keeps
 * scrolling; the prose is the reason the page passes.
 *
 * THE ARC, and why it is in this order:
 *   Hero      the promise + the plain sentence a reviewer needs in 20 seconds
 *   Gather    the problem, scroll-driven — five silos collapsing into one mark
 *   Capture   what happens to a save, run live on the REAL pipeline steps
 *   Ask       the payoff, interactive — a cited answer from your own saves
 *   Connect   the moat: edges drawing in, connections being found
 *   Shelf     proof of the D-7 hero: one row, every platform, all of it here
 *   Surfaces / Privacy / Close / Footer
 * That is the launch film's own running order, and it is D-7's ordering too:
 * gathering is the promise, recall is the payoff.
 *
 * COPY IS NOT FREELY EDITABLE. It is the positioning of record:
 *  - the `<h1>` is the D-6 tagline VERBATIM (`docs/BRANDING.md`) — that exact
 *    string is tracked across six surfaces, this being the sixth;
 *  - the hero is D-7's consolidated capture ("one place that holds everything
 *    you save"), NOT recall-first;
 *  - "You never remember where you saved it" is the launch film's act one and
 *    the founder letter's problem: fragmentation, NOT clutter;
 *  - D-3 IS ABSOLUTE HERE: the words "second brain" and "ai" appear nowhere on
 *    this page or in any demo string it renders, and this is the most visible
 *    surface in the product. The App Store description's "AI summaries,
 *    categories, and tags" bullet must be PARAPHRASED, never pasted.
 *  - D-1: the name is "Machina", never "Machina AI".
 *
 * Rendered from two mount points, deliberately:
 *  - `/welcome` — a genuinely static public route (no AuthProvider at all, see
 *    `lib/publicRoutes.tsx`), so the prose is in the prerendered HTML for a
 *    crawler or a JS-less fetch, and there is one URL that is provably
 *    auth-free. `onGetStarted` is omitted there, so the CTA links to `/`.
 *  - `/` — via `AuthProvider`'s signed-out branch, WEB ONLY and lazily loaded,
 *    so none of this rides in the iOS bundle. Native never reaches it.
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
                <GatherScene />
                <CaptureScene />
                <AskScene />
                <ConnectScene />
                <ShelfScene />
                <Surfaces />
                <Privacy />
                <Close onGetStarted={onGetStarted} />
            </main>
            <Footer />
        </div>
    );
}

/* ---------------------------------------------------------------- primitives */

/** The one primary action on the page. A button where sign-in is reachable from
 *  this mount point, a link to the root where it isn't — same pixels either way,
 *  so the two mount points cannot drift apart visually. */
function GetStarted({ onGetStarted, label = 'Get started', className = '' }: {
    onGetStarted?: () => void;
    label?: string;
    className?: string;
}) {
    const cls =
        'inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm '
        + 'font-semibold text-accent-ink shadow-sm shadow-accent/20 transition-colors '
        + `hover:bg-accent-hover ${className}`;
    return onGetStarted
        ? <button type="button" onClick={onGetStarted} className={cls}>{label}</button>
        : <Link href="/" className={cls}>{label}</Link>;
}

/** A prose section that arrives as one gesture when it scrolls into view. */
function Section({ kicker, title, children, className = '' }: {
    kicker?: string;
    title: string;
    children: React.ReactNode;
    className?: string;
}) {
    const [ref, seen] = useInView<HTMLElement>();
    return (
        <section
            ref={ref}
            className={`mx-auto max-w-2xl px-6 py-20 text-center sm:py-28 ${seen ? 'mx-in' : ''} ${className}`}
        >
            {kicker && (
                <p className="mx-rise text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {kicker}
                </p>
            )}
            <h2
                className="mx-rise mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                style={{ ['--i' as string]: 1 }}
            >
                {title}
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                {children}
            </div>
        </section>
    );
}

/* -------------------------------------------------------------------- header */

function Header({ onGetStarted }: { onGetStarted?: () => void }) {
    const cls = 'text-sm font-medium text-text-secondary transition-colors hover:text-text';
    return (
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
            {/* The header lockup the app itself uses: the BARE citation mark (a
                rounded container here reads as a shrunken app icon, not as the
                brand mark) beside the drawn wordmark. */}
            <span className="flex items-center gap-2 text-text">
                <CitationGlyph className="h-5 w-auto" />
                <Wordmark className="h-[11px] w-auto" />
            </span>
            {onGetStarted
                ? <button type="button" onClick={onGetStarted} className={cls}>Sign in</button>
                : <Link href="/" className={cls}>Sign in</Link>}
        </header>
    );
}

/* ---------------------------------------------------------------------- hero */

function Hero({ onGetStarted }: { onGetStarted?: () => void }) {
    return (
        <section className="mx-ground relative mx-auto flex min-h-[88vh] max-w-3xl flex-col justify-center px-6 py-20">
            <div className="relative">
                {/* The mark assembling: the identity's stated sequence — the
                    brackets close, then the point lands, then the glow blooms.
                    Plays on load, not on scroll: it is the first thing on the
                    page and it is the app's own boot gesture, so arriving on
                    mymachina.app feels like opening Machina. */}
                <span className="relative inline-flex" aria-hidden>
                    <span
                        className="mx-halo absolute -inset-[55%] rounded-full"
                        style={{
                            background:
                                'radial-gradient(closest-side, var(--accent-ring), transparent 72%)',
                        }}
                    />
                    <svg
                        viewBox="288 292 448 416"
                        className="mx-glow-in relative h-14 w-auto text-text"
                        fill="currentColor"
                    >
                        <path className="mx-bracket-l" d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z" />
                        <path className="mx-bracket-r" d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z" />
                        <circle className="mx-point" cx="512" cy="500" r="52" />
                    </svg>
                </span>

                {/* `mx-in` is set unconditionally here — the hero is above the
                    fold, so waiting for an intersection callback would show a
                    blank frame first. */}
                <div className="mx-in mt-10">
                    <h1
                        className="mx-rise text-4xl font-semibold tracking-tight text-text text-balance sm:text-6xl"
                        style={{ ['--i' as string]: 2 }}
                    >
                        Everything you save, finally useful.
                    </h1>

                    {/* The D-7 hero in one sentence, with the product NAMED in
                        plain text — Google's third rejection reason was that the
                        app name on the consent screen didn't match the home
                        page, and the drawn wordmark above is SVG path data, not
                        readable text. */}
                    <p
                        className="mx-rise mt-6 text-lg leading-relaxed text-text text-pretty sm:text-2xl"
                        style={{ ['--i' as string]: 3 }}
                    >
                        <span className="font-semibold">Machina</span> is one place that holds
                        everything you save — from every app you save it in.
                    </p>

                    <p
                        className="mx-rise mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base"
                        style={{ ['--i' as string]: 4 }}
                    >
                        Send a link, a screenshot or a video to Machina from anywhere. It reads the
                        page, watches the video, looks at the screenshot — and turns each save into
                        a clean card with a real summary, a category, tags, and connections to
                        things you saved before. Then you can ask your own saves a question and get
                        an answer in plain language, with citations back to your own sources.
                    </p>

                    <div
                        className="mx-rise mt-10 flex flex-wrap items-center gap-4"
                        style={{ ['--i' as string]: 5 }}
                    >
                        <GetStarted onGetStarted={onGetStarted} />
                        <span className="text-[13px] text-text-muted">
                            Free to start · iPhone and web
                        </span>
                    </div>
                </div>
            </div>

            <span
                aria-hidden
                className="mx-cue absolute inset-x-0 bottom-8 mx-auto flex w-fit items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-muted"
            >
                <ArrowDown className="h-3.5 w-3.5" /> Scroll
            </span>
        </section>
    );
}

/* ------------------------------------------------------------------ surfaces */

const SURFACES = [
    {
        icon: Share2,
        title: 'From your phone',
        body: 'The iOS share sheet, from any app — Safari, YouTube, X, Instagram, Photos. '
            + 'Two taps and it is saved, whether or not Machina is open.',
    },
    {
        icon: Globe,
        title: 'From your computer',
        body: 'The web app holds the same library — save from your phone in the morning, '
            + 'find it on your laptop that afternoon. Nothing to sync by hand.',
    },
    {
        icon: Puzzle,
        title: 'From the page you are on',
        body: 'The browser extension saves what you are reading without leaving it, so the '
            + 'tab you were about to keep open for a month can just be closed.',
    },
];

function Surfaces() {
    const [ref, seen] = useInView<HTMLElement>();
    return (
        <section
            ref={ref}
            aria-labelledby="mx-surfaces-title"
            className={`mx-auto max-w-5xl px-6 py-20 sm:py-28 ${seen ? 'mx-in' : ''}`}
        >
            <div className="mx-auto max-w-2xl text-center">
                <p className="mx-rise text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Where it runs
                </p>
                <h2
                    id="mx-surfaces-title"
                    className="mx-rise mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                    style={{ ['--i' as string]: 1 }}
                >
                    Wherever you were when you found it.
                </h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
                {SURFACES.map((s, i) => (
                    <div
                        key={s.title}
                        className="mx-rise rounded-2xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-card)]"
                        style={{ ['--i' as string]: 2 + i }}
                    >
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile text-tile-ink">
                            <s.icon className="h-5 w-5" aria-hidden />
                        </span>
                        <h3 className="mt-4 text-base font-semibold text-text">{s.title}</h3>
                        <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{s.body}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ------------------------------------------------------------------- privacy */

function Privacy() {
    return (
        <Section kicker="Your data" title="Private by design.">
            <p>
                No ads, no tracking, no data sold to anyone. What you save is yours: it is
                never used to train anyone&rsquo;s models. Sign in with Apple or Google, and
                delete your account — and everything in it — from Settings, any time.
            </p>
            <p>
                The details are in the{' '}
                <Link href="/privacy" className="text-text underline underline-offset-4 transition-colors hover:text-accent">
                    privacy policy
                </Link>{' '}
                and the{' '}
                <Link href="/terms" className="text-text underline underline-offset-4 transition-colors hover:text-accent">
                    terms of service
                </Link>.
            </p>
        </Section>
    );
}

/* --------------------------------------------------------------------- close */

function Close({ onGetStarted }: { onGetStarted?: () => void }) {
    const [ref, seen] = useInView<HTMLElement>();
    return (
        <section
            ref={ref}
            className={`mx-auto max-w-3xl px-6 pb-24 pt-6 ${seen ? 'mx-in' : ''}`}
        >
            <div className="mx-rise rounded-3xl border border-border-subtle bg-card p-10 text-center shadow-[var(--shadow-card)] sm:p-14">
                <h2 className="text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl">
                    Start with the last thing you saved.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Sign in with Apple or Google. Your library is empty for about a minute.
                </p>
                <GetStarted onGetStarted={onGetStarted} className="mt-8" />
            </div>
        </section>
    );
}

/* -------------------------------------------------------------------- footer */

function Footer() {
    return (
        <footer className="border-t border-border-subtle">
            <div className="mx-auto max-w-6xl px-6 py-12">
                <span className="flex items-center gap-2 text-text">
                    <CitationGlyph className="h-4 w-auto" />
                    <Wordmark className="h-[9px] w-auto" />
                </span>
                {/* The D-6 tagline, verbatim. Sixth tracked surface. */}
                <p className="mt-3 text-sm text-text-secondary">
                    Everything you save, finally useful.
                </p>
                <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
                    <Link href="/privacy" className="transition-colors hover:text-text">Privacy</Link>
                    <Link href="/terms" className="transition-colors hover:text-text">Terms</Link>
                    <a href="mailto:support@mymachina.app" className="transition-colors hover:text-text">
                        support@mymachina.app
                    </a>
                </nav>
                <p className="mt-6 text-[13px] text-text-muted">
                    © 2026 Mor Hogeg. Machina is a personal knowledge base for the things you save.
                </p>
            </div>
        </footer>
    );
}
