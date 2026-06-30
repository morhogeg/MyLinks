'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Feed from "@/components/Feed";
import AddLinkForm from "@/components/AddLinkForm";
import InstallPWA from "@/components/InstallPWA";
import SettingsModal from "@/components/SettingsModal";
import { Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

/** The Machina mark — a luminous "M" drawn as a connecting line that converges
 *  on a central node (a monochrome form of the app icon). Tints via currentColor. */
function MachinaMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="15 17 70 70" className={className} fill="none" aria-hidden="true">
      <path d="M24 74 L24 30 L50 54 L76 30 L76 74" stroke="currentColor"
        strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="54" r="6" fill="currentColor" />
    </svg>
  );
}

/**
 * Main dashboard page
 */
export default function Home() {
  const { uid, loading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAskMode, setIsAskMode] = useState(false);

  const handleLinkAdded = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Loading state while auth resolves
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/20 animate-pulse">
            <MachinaMark className="w-7 h-7 text-white" />
          </div>
          <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border-subtle h-[60px] sm:h-[68px] flex items-center">
        {/* hairline accent glow under the bar */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
        <div className="w-full max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/15">
              <MachinaMark className="w-[19px] h-[19px] sm:w-[22px] sm:h-[22px] text-white" />
              <span className="absolute -inset-1 rounded-2xl bg-[image:var(--accent-gradient)] opacity-20 blur-md -z-10" />
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
            <ThemeToggle />
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="h-9 w-9 rounded-full bg-card border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content — Ask mode fills to the viewport bottom, so it drops the
          tall bottom padding the grid uses for the FAB. */}
      <main className={`max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-2 sm:py-4 ${isAskMode ? 'pb-0 sm:pb-0' : 'pb-24 sm:pb-20'}`}>
        <Feed key={refreshKey} onAskModeChange={setIsAskMode} />
      </main>

      {/* Add Link FAB — hidden in Ask mode (the composer is the primary action there) */}
      <AddLinkForm onLinkAdded={handleLinkAdded} hidden={isAskMode} />

      {/* Settings Modal */}
      {uid && (
        <SettingsModal
          uid={uid}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* iOS Install Banner */}
      <InstallPWA />
    </div>
  );
}
