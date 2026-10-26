'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { CitationGlyph, Wordmark } from '@/components/ui/Wordmark';
import ThemeToggle from '@/components/ThemeToggle';
import { CINEMATIC_LANDING } from '@/components/landing/motion';
import { platformIcon, platformColor, PLATFORM_LABELS, type PlatformKey } from '@/lib/platform';
import { isNativeApp } from '@/lib/api';
import { openExternal } from '@/lib/share';

/**
 * The public website's header and footer, shared by the landing page
 * (`components/LandingPage.tsx`), the blog and the FAQ so every public page
 * wears the same chrome. Moved here verbatim from LandingPage.tsx; the header
 * relies on `landing.css` (`mx-nav`) and a `mx-cine` ancestor for its glass
 * bar, which `components/site/SitePage.tsx` provides.
 */

/* -------------------------------------------------------------------- header */

export function Header({ onGetStarted, homeHref }: {
    onGetStarted?: () => void;
    /** Pages other than the landing page link the lockup home. */
    homeHref?: string;
}) {
    const cls = 'text-sm font-medium text-text-secondary transition-colors hover:text-text';
    const navRef = useHideOnScroll<HTMLDivElement>();
    return (
        /* `mx-nav` is inert in the classic page; the cinematic layer turns it
           into the sticky glass bar (landing.css) without moving any markup. */
        <div ref={navRef} className="mx-nav">
            {/* The top safe-area inset is padded HERE, not on the body —
                globals.css deliberately leaves the top inset to whoever owns
                the top of the screen (see the note there). env() is 0 in any
                desktop browser, so this is inert on the web. */}
            <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-[calc(2rem+env(safe-area-inset-top))]">
            {/* The header lockup the app itself uses: the BARE citation mark (a
                rounded container here reads as a shrunken app icon, not as the
                brand mark) beside the drawn wordmark. */}
            {homeHref ? (
                <Link href={homeHref} aria-label="Machina home" className="flex items-center gap-2 text-text">
                    <CitationGlyph className="h-5 w-auto" />
                    <Wordmark className="h-[11px] w-auto" />
                </Link>
            ) : (
                <span className="flex items-center gap-2 text-text">
                    <CitationGlyph className="h-5 w-auto" />
                    <Wordmark className="h-[11px] w-auto" />
                </span>
            )}
            <span className="flex items-center gap-3 sm:gap-4">
                <Socials compact className="max-[359px]:hidden" />
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
        </div>
    );
}

/**
 * The glass bar retires while you read (cinematic mode) — scroll down and it
 * slides away, scroll up at all and it returns, the same manner as the app's
 * own mobile chrome. Direction is what matters, not position, so a long page
 * never strands the visitor without Sign in: any upward nudge brings it back.
 * The first ~120px are exempt so it never flickers at the top. Classic mode
 * never attaches the listener — there the header isn't sticky to begin with.
 */
function useHideOnScroll<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    useEffect(() => {
        if (!CINEMATIC_LANDING) return;
        const el = ref.current;
        if (!el) return;
        let lastY = window.scrollY;
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const y = window.scrollY;
                const goingDown = y > lastY;
                lastY = y;
                el.classList.toggle('mx-nav-hidden', goingDown && y > 120);
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);
    return ref;
}

/* -------------------------------------------------------------------- footer */

/** Machina's own accounts, in the owner's order. The marks are the app's
    source marks (`platformIcon`), so a mark changed there changes here. */
const SOCIALS: { key: PlatformKey; href: string }[] = [
    { key: 'x', href: 'https://x.com/machinaapp' },
    { key: 'instagram', href: 'https://www.instagram.com/machinaapp' },
    { key: 'tiktok', href: 'https://www.tiktok.com/@machinaapp' },
    { key: 'youtube', href: 'https://www.youtube.com/@MachinaApp' },
];

/** `compact` is the header's size: it shares a phone-width row with the
    lockup, the theme toggle and Sign in, so the marks and their hit areas
    are a step smaller than the footer's 44pt targets. Below 360px (iPhone SE
    1st gen) that row can't fit them at all, so the header drops them there;
    the footer still has them. */
function Socials({ className = '', compact = false }: { className?: string; compact?: boolean }) {
    const box = compact ? 'h-8 w-6 sm:w-8' : 'h-11 w-11';
    const mark = compact ? 'h-4 w-4' : 'h-5 w-5';
    return (
        <ul className={`flex items-center ${compact ? '' : 'gap-1'} ${className}`}>
            {SOCIALS.map(({ key, href }) => (
                <li key={key}>
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Machina on ${PLATFORM_LABELS[key]}`}
                        onClick={(e) => {
                            // Native shell: open in Safari (or the platform's
                            // app) instead of navigating the WKWebView away.
                            if (isNativeApp()) {
                                e.preventDefault();
                                openExternal(href);
                            }
                        }}
                        // Muted at rest like the links beside it; the mark
                        // takes its brand color (the app's source-filter
                        // color, theme-aware for X and TikTok) on hover.
                        style={{ '--brand': platformColor(key) } as CSSProperties}
                        className={`flex ${box} items-center justify-center rounded-full text-text-secondary transition-colors hover:text-(--brand)`}
                    >
                        {platformIcon(key, mark)}
                    </a>
                </li>
            ))}
        </ul>
    );
}

export function Footer() {
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
                    {/* Web only, like the film: the iPhone's signed-out landing
                        mounts this footer too, and the articles are for people
                        deciding whether to get the app, not for people in it.
                        Native renders client-only, so this can't mismatch. */}
                    {!isNativeApp() && (
                        <>
                            <Link href="/blog" className="transition-colors hover:text-text">Blog</Link>
                            <Link href="/faq" className="transition-colors hover:text-text">FAQ</Link>
                        </>
                    )}
                    <Link href="/privacy" className="transition-colors hover:text-text">Privacy</Link>
                    <Link href="/terms" className="transition-colors hover:text-text">Terms</Link>
                    <a href="mailto:support@mymachina.app" className="transition-colors hover:text-text">
                        support@mymachina.app
                    </a>
                </nav>
                <Socials className="mt-5 -ml-2.5" />
                {/* No personal name (round 5) and no self-description (round 6)
                    — by the footer the page has explained itself five times.
                    The App Store copyright FIELD keeps the legal name
                    (docs/APP_STORE.md §2); that is a form, not a page. */}
                <p className="mt-6 text-[13px] text-text-muted">© 2026 Machina</p>
            </div>
        </footer>
    );
}
