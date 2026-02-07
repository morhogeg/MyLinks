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
export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLinkAdded = () => {
    // Force refresh of the feed
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Second Brain</h1>
              <p className="text-xs text-text-muted">Your knowledge, organized</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
        <Feed key={refreshKey} />
      </main>

      {/* Add Link FAB */}
      <AddLinkForm onLinkAdded={handleLinkAdded} />

      {/* iOS Install Banner */}
      <InstallPWA />
    </div>
  );
}
