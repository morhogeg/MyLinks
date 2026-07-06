'use client';

import { useEffect, useState } from 'react';

/**
 * Track browser connectivity. Returns `true` when online, `false` when the
 * browser reports it is offline.
 *
 * Machina's writes are optimistic (Firestore latency-compensation reflects them
 * immediately, then reverts on failure), which offline looks exactly like a
 * successful save until the write eventually fails. Surfacing a clear offline
 * signal lets the UI tell the user their changes aren't syncing yet.
 *
 * SSR-safe: starts optimistic (`true`) so server render and first client render
 * match, then syncs to the real value on mount.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}
