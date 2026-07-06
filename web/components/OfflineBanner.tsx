'use client';

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

/**
 * A small fixed banner shown while the browser is offline. Machina's writes are
 * optimistic — offline, an edit looks saved until Firestore's queued write
 * eventually fails — so this makes the "not syncing yet" state visible instead
 * of silent.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full border border-border-subtle bg-card px-4 py-2 text-sm text-text shadow-card"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <WifiOff className="w-4 h-4 text-text-secondary" />
      <span>You&rsquo;re offline — changes will sync when you reconnect.</span>
    </div>
  );
}
