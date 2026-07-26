'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Feed from "@/components/Feed";
import AddLinkForm from "@/components/AddLinkForm";
import AnalyzingBanner, { AnalyzingState } from "@/components/AnalyzingBanner";
import SettingsModal from "@/components/SettingsModal";
import ScrollToTop from "@/components/ScrollToTop";
import OnboardingTour, { ONBOARDING_STORAGE_KEY } from "@/components/OnboardingTour";
import { Settings, Search, Globe, SlidersHorizontal } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { CitationGlyph, Wordmark } from "@/components/ui/Wordmark";
import { IconButton } from "@/components/ui/Button";
import { useHeaderFade } from "@/lib/useHeaderFade";
import { useSharedCaptureBanner } from "@/lib/useSharedCaptureBanner";
import type { LibraryFacetRequest } from "@/lib/stats";

/** Pick the banner to show: prefer an active source in priority order, else the
 *  first non-null (for the graceful "Saved" finish frame). */
function pickBanner(...states: (AnalyzingState | null)[]): AnalyzingState | null {
  for (const s of states) if (s?.active) return s;
  for (const s of states) if (s) return s;
  return null;
}

/**
 * The boot frame while auth resolves — and its success exit.
 *
 * A launch screen is a shipped asset, not a themed surface: fixed to the Lumen
 * graphite ground whichever theme the app is in (identity §04), matching the
 * native splash so splash → boot is one continuous dark frame in BOTH themes.
 * That fixed ground is also what lets the mark sit BARE on the page.
 *
 * No orb, no canvas: everything on the ENTRY frame is CSS/static markup, alive
 * on the first painted frame (an orb was tried and removed — the iOS build is
 * a static export, so a canvas can't paint until React hydrates). The EXIT is
 * allowed to be richer: by the time auth resolves, hydration is done, so the
 * `exiting` overlay plays the success beat — the mark steps forward while the
 * frame dissolves into the app (CSS keyframes, reduced-motion collapses it).
 * Sizes follow the prototype's phone mock: mark ~43% width, wordmark 4.5%.
 */
function BootScreen({ exiting = false }: { exiting?: boolean }) {
  return (
    <div
      className={`min-h-screen flex items-center justify-center ${exiting ? 'animate-boot-exit' : ''}`}
      style={{ background: 'radial-gradient(120% 90% at 50% 42%, #1B1B23, #08080C 72%)' }}
    >
      <div
        className="flex flex-col items-center"
        style={{ filter: 'drop-shadow(0 0 16px rgba(174,184,206,0.34))' }}
      >
        <span
          className={`w-[min(43vw,166px)] text-white ${exiting ? 'animate-boot-exit-mark' : 'animate-pulse'}`}
          aria-hidden
        >
          <CitationGlyph className="w-full h-auto" />
        </span>
        {/* The launch wordmark stays the letterspaced setting (settled):
            mono, tracking .46em, with a matching text-indent so the run of
            letterspace after the final A doesn't off-centre it. */}
        <span
          aria-hidden
          className="mt-[min(10.7vw,42px)] font-mono uppercase tracking-[0.46em] indent-[0.46em] text-[min(4.5vw,17px)] font-medium"
          style={{ color: '#E6E6F0' }}
        >
          Machina
        </span>
        {!exiting && <span className="sr-only" role="status">Starting Machina…</span>}
      </div>
    </div>
  );
}

/**
 * Main dashboard page
 */
export default function Home() {
  const { uid, loading } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // When set, the Settings sheet opens straight to that sub-screen (e.g. the
  // digest settings deep-linked from the empty Digest page, or Insights from
  // the feed's "Back to Insights" chip).
  const [settingsSection, setSettingsSection] = useState<'digest' | 'stats' | null>(null);
  // A tapped Insights row (category/tag/source): Settings closes and Feed
  // applies this as its active filter, then clears it via the callback.
  const [libraryFacet, setLibraryFacet] = useState<LibraryFacetRequest | null>(null);
  // Mobile v4 chrome: the header's bare glyphs (search / sources / display)
  // command the Feed via a nonce channel; the bottom bar's + bumps
  // captureSignal to pop AddLinkForm open. `feedTab` mirrors Feed's active
  // bottom tab so the glyphs only show on Home, where they apply.
  const [headerCommand, setHeaderCommand] = useState<{ action: 'search' | 'sources' | 'display'; nonce: number } | null>(null);
  const [captureSignal, setCaptureSignal] = useState(0);
  const [feedTab, setFeedTab] = useState<'home' | 'collections' | 'ask' | 'digest'>('home');
  const sendHeaderCommand = (action: 'search' | 'sources' | 'display') =>
    setHeaderCommand((prev) => ({ action, nonce: (prev?.nonce ?? 0) + 1 }));
  const [isAskMode, setIsAskMode] = useState(false);
  // Full-bleed modes (Ask + Review) drop main's bottom padding so the
  // self-sized content sits flush to the bottom (no dead scroll band).
  const [isFullBleed, setIsFullBleed] = useState(false);
  const [hideAddButton, setHideAddButton] = useState(false);
  // In-flight capture analysis for the one "Analyzing… N%" banner. Two sources:
  // `analyzing` = the in-app add flow (real progress); `processing` = captures
  // shared from other apps (server-side, ramped). Prefer the in-app
  // one when it's active (it has true milestones); otherwise show the share one.
  const [analyzing, setAnalyzing] = useState<AnalyzingState | null>(null);
  const [processing, setProcessing] = useState<AnalyzingState | null>(null);
  // While the "+" dialog owns a plain-link capture (its stepper is on screen),
  // its card id is published here so the feed's processing banner excludes it —
  // the same capture is never shown by both surfaces at once (no restart flash).
  const [dialogCardId, setDialogCardId] = useState<string | null>(null);
  // Whether the live library has produced its first Firestore snapshot. Gates
  // the optimistic share bridge below: once the feed is authoritative, a capture
  // with no `processing` card has already resolved to a ready card, so the bridge
  // must stop rather than keep ramping its fake %.
  const [feedLoaded, setFeedLoaded] = useState(false);
  // Optimistic banner for a capture shared from the iOS Share Extension via its
  // "Open Machina" button — shows instantly on open, then hands off to the real
  // Firestore-driven `processing` banner once the card streams in. Retires the
  // moment the feed is authoritative and shows no in-flight processing.
  const sharedSignal = useSharedCaptureBanner(!!processing?.active, feedLoaded);
  const bannerState = pickBanner(analyzing, processing, sharedSignal);
  const [isTourOpen, setIsTourOpen] = useState(false);
  // Gate the first-run tour to a non-empty library: it spotlights real cards,
  // so over an empty feed it must wait (the welcome screen + example seed run
  // first; the tour fires after the first card — seeded or real — arrives).
  const [hasCards, setHasCards] = useState(false);
  // Scroll-scrubbed top bar: opacity rides the scroll itself (down = away,
  // up = back), settling to shown/hidden when the finger rests.
  const headerRef = useHeaderFade<HTMLElement>();
  // Boot success exit: when auth resolves, the boot frame stays on top for one
  // short beat and dissolves into the app (the X-style release). 'done' from
  // the start when there was no boot frame to exit (e.g. auth already known).
  const [bootPhase, setBootPhase] = useState<'boot' | 'exit' | 'done'>(loading ? 'boot' : 'done');
  useEffect(() => {
    if (!loading && bootPhase === 'boot') {
      // rAF, not a direct set: the static overlay gets one painted frame
      // before the exit classes land, so the animation always runs from its
      // visible start.
      const raf = requestAnimationFrame(() => setBootPhase('exit'));
      return () => cancelAnimationFrame(raf);
    }
    if (bootPhase === 'exit') {
      const t = setTimeout(() => setBootPhase('done'), 560);
      return () => clearTimeout(t);
    }
  }, [loading, bootPhase]);

  // First-run onboarding: once auth resolves and the feed is on screen, show the
  // guided tour if this browser hasn't seen it yet. A short delay lets the
  // toolbar anchors (Ask, Collections, view switcher…) mount so they can be
  // spotlighted. Ask/Collections views hide those anchors, so wait for the grid.
  useEffect(() => {
    if (loading || !uid || isAskMode || hideAddButton || !hasCards) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(ONBOARDING_STORAGE_KEY);
    } catch {
      seen = true; // private mode — don't nag
    }
    if (seen) return;
    const timer = setTimeout(() => setIsTourOpen(true), 600);
    return () => clearTimeout(timer);
  }, [loading, uid, isAskMode, hideAddButton, hasCards]);

  const replayTour = () => {
    setIsSettingsOpen(false);
    // Let the settings sheet finish closing before the spotlight appears.
    setTimeout(() => setIsTourOpen(true), 250);
  };

  // Loading state while auth resolves
  if (loading) {
    return <BootScreen />;
  }

  return (
    <div className="min-h-screen bg-background text-text transition-colors duration-200">
      {/* Header — the sticky bar owns the top safe-area inset so it always sits
          below the status bar/notch, even once it sticks on scroll. content-box
          keeps the h-[60px] bar height while the inset padding stacks on top, and
          the translucent bg fills the notch area so content scrolls under it. */}
      {/* Status-bar scrim — stays while the header fades, so content never
          scrolls naked under the iPhone clock/notch. Matches the header's
          material exactly, so when the bar is visible the two are seamless. */}
      <div
        className="fixed inset-x-0 top-0 z-40 bg-background/70 backdrop-blur-xl pointer-events-none"
        style={{ height: 'env(safe-area-inset-top)' }}
        aria-hidden
      />
      <header
        /* Scroll-scrubbed fade (useHeaderFade): the hook drives opacity +
           drift inline, frame-by-frame with the scroll — no toggle, no pop.
           The bar stays sticky and keeps its height, so content never
           reflows; it just glides under. */
        ref={headerRef}
        className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border-subtle h-[52px] sm:h-[68px] flex items-center"
        style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}
      >
        <div className="w-full max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex items-center justify-between">
          {/* Brand — the BARE Citation glyph + the drawn wordmark, centred on
              one axis. No tile behind the mark (a rounded container here reads
              as a shrunken app icon rather than as the brand mark), no tagline. */}
          <h1 className="flex items-center gap-2 sm:gap-2.5 text-text">
            {/* Sized to the previous lockup's footprint (text-lg/text-xl type),
                keeping the mock's glyph:wordmark ratio (32:168). */}
            <CitationGlyph className="w-5 sm:w-6 h-auto shrink-0" />
            <Wordmark className="w-[104px] sm:w-[122px] h-auto" />
          </h1>

          {/* Controls — one cohesive cluster */}
          <div className="flex items-center gap-2">
            {/* Mobile v4: the library's controls are BARE GLYPHS in this one
                header line (Apple nav-bar grammar) — search, sources, and the
                ⋯ display menu (view/sort/filter/select). Home tab only; the
                other tabs bring their own subheaders. Desktop keeps its
                toolbar, so these stay sm:hidden. */}
            {feedTab === 'home' && (
              <div className="flex sm:hidden items-center">
                <button
                  data-tour="search"
                  onClick={() => sendHeaderCommand('search')}
                  aria-label="Search"
                  className="h-10 w-10 flex items-center justify-center text-text-secondary hover:text-text active:text-text transition-colors"
                >
                  <Search className="w-[19px] h-[19px]" />
                </button>
                <button
                  onClick={() => sendHeaderCommand('sources')}
                  aria-label="Sources"
                  className="h-10 w-10 flex items-center justify-center text-text-secondary hover:text-text active:text-text transition-colors"
                >
                  <Globe className="w-[19px] h-[19px]" />
                </button>
                <button
                  data-tour="views"
                  onClick={() => sendHeaderCommand('display')}
                  aria-label="View, sort, and filter options"
                  className="h-10 w-10 flex items-center justify-center text-text-secondary hover:text-text active:text-text transition-colors"
                >
                  <SlidersHorizontal className="w-[19px] h-[19px]" />
                </button>
              </div>
            )}
            {/* Theme toggle is desktop-only — on mobile/iOS it lives in Settings,
                so the top bar stays clean. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <IconButton
              data-tour="settings"
              onClick={() => { setSettingsSection(null); setIsSettingsOpen(true); }}
              variant="secondary"
              radius="full"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-[18px] h-[18px]" />
            </IconButton>
          </div>
        </div>
      </header>

      {/* Main Content — Ask mode fills to the viewport bottom, so it drops the
          tall bottom padding the grid uses for the FAB. */}
      <main className={`max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-2 sm:py-4 ${isAskMode || isFullBleed ? 'pb-0 sm:pb-0' : 'pb-24 sm:pb-20'}`}>
        {/* The feed is already live via onSnapshot, so a new save streams in on
            its own — no remount needed. (Previously keyed on refreshKey, which
            tore down listeners and wiped view/filter/search on every add.) */}
        <Feed onAskModeChange={setIsAskMode} onHideAddButton={setHideAddButton} onProcessingChange={setProcessing} onFeedLoadedChange={setFeedLoaded} onOpenDigestSettings={() => { setSettingsSection('digest'); setIsSettingsOpen(true); }} onHasCardsChange={setHasCards} libraryFacet={libraryFacet} onLibraryFacetApplied={() => setLibraryFacet(null)} onBackToInsights={() => { setSettingsSection('stats'); setIsSettingsOpen(true); }} headerCommand={headerCommand} onCapture={() => setCaptureSignal((n) => n + 1)} onTabChange={setFeedTab} onFullBleedChange={setIsFullBleed} suppressProcessingId={dialogCardId} />
      </main>

      {/* Add Link FAB — hidden in Ask & Collections (neither view captures links). */}
      {/* onLinkAdded is a no-op: the form resets itself and the feed is live via
          onSnapshot, so nothing extra is needed here on a successful save. */}
      <AddLinkForm onLinkAdded={() => {}} hidden={hideAddButton} onAnalyzingChange={setAnalyzing} onDialogCardChange={setDialogCardId} openSignal={captureSignal} />
      <AnalyzingBanner state={bannerState} />
      {/* Back-to-top only on the Home feed (the window-scrolling view) — on
          mobile it stands in for the scrolled-away Home tab. */}
      <ScrollToTop enabled={feedTab === 'home'} />

      {/* Settings Modal */}
      {uid && (
        <SettingsModal
          uid={uid}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onReplayTour={replayTour}
          initialSection={settingsSection ?? undefined}
          onOpenLibraryFacet={(req) => { setIsSettingsOpen(false); setLibraryFacet(req); }}
        />
      )}

      {/* First-run guided tour */}
      <OnboardingTour open={isTourOpen} onClose={() => setIsTourOpen(false)} />

      {/* Boot success exit — the boot frame dissolving into the app. Rendered
          from the first post-auth frame (bootPhase 'boot') so there is no
          one-frame flash of the app before the exit starts; the animation
          begins when the effect advances the phase to 'exit'. Inert
          (pointer-events-none) so nothing is blocked during the beat. */}
      {bootPhase !== 'done' && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <BootScreen exiting={bootPhase === 'exit'} />
        </div>
      )}
    </div>
  );
}
