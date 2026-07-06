'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Feed from "@/components/Feed";
import AddLinkForm from "@/components/AddLinkForm";
import AnalyzingBanner, { AnalyzingState } from "@/components/AnalyzingBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineBanner from "@/components/OfflineBanner";
import SettingsModal from "@/components/SettingsModal";
import OnboardingTour, { ONBOARDING_STORAGE_KEY } from "@/components/OnboardingTour";
import { Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { IconButton } from "@/components/ui/Button";
import { useHeaderFade } from "@/lib/useHeaderFade";
import { useSharedCaptureBanner } from "@/lib/useSharedCaptureBanner";

/** Pick the banner to show: prefer an active source in priority order, else the
 *  first non-null (for the graceful "Saved" finish frame). */
function pickBanner(...states: (AnalyzingState | null)[]): AnalyzingState | null {
  for (const s of states) if (s?.active) return s;
  for (const s of states) if (s) return s;
  return null;
}

/**
 * Main dashboard page
 */
export default function Home() {
  const { uid, loading } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAskMode, setIsAskMode] = useState(false);
  const [hideAddButton, setHideAddButton] = useState(false);
  // In-flight capture analysis for the one "Analyzing… N%" banner. Two sources:
  // `analyzing` = the in-app add flow (real progress); `processing` = captures
  // shared from other apps / WhatsApp (server-side, ramped). Prefer the in-app
  // one when it's active (it has true milestones); otherwise show the share one.
  const [analyzing, setAnalyzing] = useState<AnalyzingState | null>(null);
  const [processing, setProcessing] = useState<AnalyzingState | null>(null);
  // Optimistic banner for a capture shared from the iOS Share Extension via its
  // "Open Machina" button — shows instantly on open, then hands off to the real
  // Firestore-driven `processing` banner once the card streams in.
  const sharedSignal = useSharedCaptureBanner(!!processing?.active);
  const bannerState = pickBanner(analyzing, processing, sharedSignal);
  const [isTourOpen, setIsTourOpen] = useState(false);
  // Scroll-scrubbed top bar: opacity rides the scroll itself (down = away,
  // up = back), settling to shown/hidden when the finger rests.
  const headerRef = useHeaderFade<HTMLElement>();

  // The Feed subscribes to Firestore in real time, so a newly-saved card
  // streams in on its own — no manual refresh/remount needed. Kept as a hook
  // point for post-save side effects (currently none).
  const handleLinkAdded = () => {};

  // First-run onboarding: once auth resolves and the feed is on screen, show the
  // guided tour if this browser hasn't seen it yet. A short delay lets the
  // toolbar anchors (Ask, Collections, view switcher…) mount so they can be
  // spotlighted. Ask/Collections views hide those anchors, so wait for the grid.
  useEffect(() => {
    if (loading || !uid || isAskMode || hideAddButton) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(ONBOARDING_STORAGE_KEY);
    } catch {
      seen = true; // private mode — don't nag
    }
    if (seen) return;
    const timer = setTimeout(() => setIsTourOpen(true), 600);
    return () => clearTimeout(timer);
  }, [loading, uid, isAskMode, hideAddButton]);

  const replayTour = () => {
    setIsSettingsOpen(false);
    // Let the settings sheet finish closing before the spotlight appears.
    setTimeout(() => setIsTourOpen(true), 250);
  };

  // Loading state while auth resolves
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/20 animate-pulse ring-1 ring-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="Machina" className="w-full h-full object-cover" />
          </div>
          <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </div>
    );
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
        className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border-subtle h-[60px] sm:h-[68px] flex items-center"
        style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}
      >
        {/* hairline accent glow under the bar */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
        <div className="w-full max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-2xl overflow-hidden shadow-lg shadow-black/10 ring-1 ring-black/5 dark:ring-white/10">
              {/* The exact app icon, so the in-app mark matches the home-screen icon. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-icon.png" alt="Machina" className="w-full h-full object-cover" />
            </div>
            <div className="leading-none">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-[image:var(--accent-gradient)] bg-clip-text text-transparent">
                Machina AI
              </h1>
              <p className="mt-1 text-[10px] sm:text-[11px] font-medium text-text-muted tracking-wide">
                Capture. Connect. Recall.
              </p>
            </div>
          </div>

          {/* Controls — one cohesive cluster */}
          <div className="flex items-center gap-2">
            {/* Theme toggle is desktop-only — on mobile/iOS it lives in Settings,
                so the top bar stays clean. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <IconButton
              data-tour="settings"
              onClick={() => setIsSettingsOpen(true)}
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
      <main className={`max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-2 sm:py-4 ${isAskMode ? 'pb-0 sm:pb-0' : 'pb-24 sm:pb-20'}`}>
        <ErrorBoundary label="Feed">
          <Feed onAskModeChange={setIsAskMode} onHideAddButton={setHideAddButton} onProcessingChange={setProcessing} />
        </ErrorBoundary>
      </main>

      {/* Add Link FAB — hidden in Ask & Collections (neither view captures links). */}
      <AddLinkForm onLinkAdded={handleLinkAdded} hidden={hideAddButton} onAnalyzingChange={setAnalyzing} />
      <AnalyzingBanner state={bannerState} />

      {/* Settings Modal */}
      {uid && (
        <SettingsModal
          uid={uid}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onReplayTour={replayTour}
        />
      )}

      {/* First-run guided tour */}
      <OnboardingTour open={isTourOpen} onClose={() => setIsTourOpen(false)} />

      {/* Connectivity signal — optimistic writes look successful offline. */}
      <OfflineBanner />
    </div>
  );
}
