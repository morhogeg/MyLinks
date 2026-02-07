'use client';

import { useState } from 'react';
import Feed from "@/components/Feed";
import AddLinkForm from "@/components/AddLinkForm";
import InstallPWA from "@/components/InstallPWA";
import { Brain } from "lucide-react";

/**
 * Main dashboard page
 * TODO: Add authentication check and redirect to /login if not authenticated
 * Example with Firebase:
 *   const { user, loading } = useAuth();
 *   if (loading) return <LoadingScreen />;
 *   if (!user) redirect('/login');
 */
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLinkAdded = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background text-text transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-text">Second Brain</h1>
              <p className="text-[10px] sm:text-xs text-text-muted">Your knowledge, organized</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-28 sm:pb-24">
        <Feed key={refreshKey} />
      </main>

      {/* Add Link FAB */}
      <AddLinkForm onLinkAdded={handleLinkAdded} />

      {/* iOS Install Banner */}
      <InstallPWA />
    </div>
  );
}
