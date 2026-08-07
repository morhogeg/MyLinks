'use client';

import Link from 'next/link';
import { ArrowDown, Share2, Globe, ChevronRight, Quote } from 'lucide-react';
import { CitationGlyph, Wordmark } from '@/components/ui/Wordmark';
import ThemeToggle from '@/components/ThemeToggle';
import GatherScene from '@/components/landing/GatherScene';
import CaptureScene from '@/components/landing/CaptureScene';
import AskScene from '@/components/landing/AskScene';
import ConnectScene from '@/components/landing/ConnectScene';
import ShelfScene from '@/components/landing/ShelfScene';
import { useInView } from '@/components/landing/hooks';
import { LiveMark } from '@/components/landing/parts';
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
            className={`mx-auto max-w-2xl px-6 py-14 text-center sm:py-20 ${seen ? 'mx-in' : ''} ${className}`}
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
            <span className="flex items-center gap-4">
                {/* The app's own theme control. The page reads correctly in both
                    themes (every colour is a token), so let a visitor see both —
                    layout.tsx mounts ThemeProvider outside the auth gate, which
                    is why this works on the auth-free /welcome route too. */}
                <ThemeToggle />
                {onGetStarted
                    ? <button type="button" onClick={onGetStarted} className={cls}>Sign in</button>
                    : <Link href="/" className={cls}>Sign in</Link>}
            </span>
        </header>
    );
}

/* ---------------------------------------------------------------------- hero */

/**
 * The hero's three steps — save, understand, ask. The first one carries the
 * product's NAME in plain text (the drawn wordmark in the header is SVG paths;
 * Google's branding review reads text). The middle tile wears the brand glyph:
 * the card IS the product, so the product's mark sits on that step.
 */
const HERO_STEPS: { icon: React.ReactNode; title: string; body: string }[] = [
    {
        icon: <Share2 className="h-5 w-5" aria-hidden />,
        title: 'Save from anywhere',
        body: 'Send Machina a link, a screenshot, a video — from any app.',
    },
    {
        // NOT "It comes back understood" — that line is the Capture section's
        // headline, and a promise repeated verbatim two screens apart reads as
        // a page running out of things to say.
        icon: <CitationGlyph className="h-5 w-auto" />,
        title: 'Every save, understood',
        body: 'Each one becomes a card — a real summary, a category, tags, connections.',
    },
    {
        icon: <Quote className="h-5 w-5" aria-hidden />,
        title: 'Ask your library',
        body: 'Plain-language answers, with citations back to your own saves.',
    },
];

function Hero({ onGetStarted }: { onGetStarted?: () => void }) {
    return (
        /* Fully CENTERED (owner call, round 6) — mark, headline, prose and CTA
           on one axis. The left-set version read like a document; centred, it
           reads like an announcement, and the CTA no longer trails a caption
           ("Free to start · iPhone and web" was cut with it: a promise line
           should not be footnoted). */
        <section className="mx-ground relative mx-auto flex min-h-[88vh] max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
            <div className="relative flex flex-col items-center">
                {/* THE APP'S OWN LIVING MARK (owner call, round 8: the first
                    frame should be genuinely impressive). This is
                    `CitationMark` — the exact component the Ask page mounts as
                    its hero — playing its `launch` arrival once and settling
                    into the `listening` breath, with the identity glow. Not a
                    re-animation of the logo; the logo, alive, at landing scale.
                    A visitor who signs in meets this same mark waiting in Ask. */}
                <span className="relative inline-flex" aria-hidden>
                    <span
                        className="mx-halo absolute -inset-[85%] rounded-full"
                        style={{
                            background:
                                'radial-gradient(closest-side, var(--accent-ring), transparent 72%)',
                        }}
                    />
                    <LiveMark state="listening" size={84} entry="launch" glow />
                </span>

                {/* `mx-in` is set unconditionally here — the hero is above the
                    fold, so waiting for an intersection callback would show a
                    blank frame first. */}
                <div className="mx-in mt-10 flex flex-col items-center">
                    {/* THE TAGLINE OWNS ITS LINE BREAK (round 9): text-balance
                        was splitting mid-phrase ("Everything you / save,
                        finally useful.") — the line is a promise in two halves,
                        so it breaks exactly at its comma, each half arriving as
                        one clip-reveal phrase. The connecting sentence that
                        used to follow ("Machina is one place that holds…") was
                        cut as sloppy; the name moved into the first step below,
                        which is where the plain-text NAME the branding review
                        checks for now lives above the fold. Real text nodes
                        throughout — the h1 still reads as the full D-6 string. */}
                    <h1 className="text-[2.75rem] font-semibold leading-[1.06] tracking-tight text-text sm:text-7xl">
                        <span className="mx-clip">
                            <span className="mx-word-up" style={{ ['--i' as string]: 0 }}>
                                Everything you save,
                            </span>
                        </span>
                        <br />
                        <span className="mx-clip">
                            <span className="mx-word-up" style={{ ['--i' as string]: 3 }}>
                                finally useful.
                            </span>
                        </span>
                    </h1>

                    {/* The product, as three STEPS instead of three grey lines
                        (round 9 — the prose stack read "way too plain"). Icon
                        tiles carry the app's own visual language: the same
                        `bg-tile` squares the Surfaces cards and Settings use,
                        the middle one wearing the brand glyph itself. Quiet
                        chevrons chain them on desktop, so capture → card → ask
                        reads as one left-to-right flow; on phones they stack
                        and the chevrons disappear. Still plain prose in the
                        markup — this is the text the reviews read, and step one
                        NAMES Machina in real text. */}
                    <div className="mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-start sm:gap-3">
                        {HERO_STEPS.map((s, i) => (
                            <div key={s.title} className="contents">
                                {i > 0 && (
                                    <ChevronRight
                                        aria-hidden
                                        className="mx-rise mt-9 hidden h-4 w-4 shrink-0 justify-self-center text-text-muted/50 sm:block"
                                        style={{ ['--i' as string]: 6 + i }}
                                    />
                                )}
                                <div
                                    className="mx-rise flex flex-col items-center gap-3 px-2"
                                    style={{ ['--i' as string]: 4 + i * 2 }}
                                >
                                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-tile text-tile-ink shadow-sm">
                                        {s.icon}
                                    </span>
                                    <span className="text-[15px] font-semibold text-text">{s.title}</span>
                                    <span className="max-w-[16rem] text-[13px] leading-relaxed text-text-secondary text-pretty">
                                        {s.body}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mx-rise mt-12" style={{ ['--i' as string]: 11 }}>
                        <GetStarted onGetStarted={onGetStarted} />
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

/** Two surfaces, not three — the browser extension was dropped from this page
 *  by owner call (2026-08-06 round 5): the phone and the web app are the
 *  product's story; the extension is a convenience that can earn its mention
 *  after install, not on the home page. */
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
];

function Surfaces() {
    const [ref, seen] = useInView<HTMLElement>();
    return (
        <section
            ref={ref}
            aria-labelledby="mx-surfaces-title"
            className={`mx-auto max-w-5xl px-6 py-14 sm:py-20 ${seen ? 'mx-in' : ''}`}
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
            <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
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
            className={`mx-auto max-w-3xl px-6 pb-20 pt-4 ${seen ? 'mx-in' : ''}`}
        >
            <div className="mx-rise rounded-3xl border border-border-subtle bg-card p-10 text-center shadow-[var(--shadow-card)] sm:p-14">
                <h2 className="text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl">
                    Start with the last thing you saved.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Sign in with Apple or Google, send Machina your next find, and watch it
                    come back understood.
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
                {/* No personal name (round 5) and no self-description (round 6)
                    — by the footer the page has explained itself five times.
                    The App Store copyright FIELD keeps the legal name
                    (docs/APP_STORE.md §2); that is a form, not a page. */}
                <p className="mt-6 text-[13px] text-text-muted">© 2026 Machina</p>
            </div>
        </footer>
    );
}
