'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Feed from "@/components/Feed";
import AddLinkForm from "@/components/AddLinkForm";
import InstallPWA from "@/components/InstallPWA";
import SettingsModal from "@/components/SettingsModal";
import { Brain, Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Main dashboard page
 */
export default function Home() {
  const { uid, loading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleLinkAdded = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Loading state while auth resolves
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20 animate-pulse">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border-subtle h-[56px] sm:h-[64px] flex items-center">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-text">Second Brain</h1>
              <p className="text-[9px] sm:text-[10px] text-text-muted">Your knowledge, organized</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-text-muted hover:text-text"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-2 sm:py-4 pb-24 sm:pb-20">
        <Feed key={refreshKey} />
      </main>

      {/* Add Link FAB */}
      <AddLinkForm onLinkAdded={handleLinkAdded} />

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
