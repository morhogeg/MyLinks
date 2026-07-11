'use client';

import { useSyncExternalStore } from 'react';

/**
 * A single, app-wide minute clock. Instead of every Card mounting its own 60s
 * setInterval (dozens of timers, dozens of independent re-renders), one
 * module-level interval ticks once a minute and notifies all subscribers at
 * once. Relative-time strings ("2h ago") therefore refresh at most once per
 * minute, app-wide, and only while at least one component is listening.
 *
 * useSyncExternalStore keeps SSR/hydration correct: the server snapshot is 0
 * (so time-dependent output renders as absent on the server, matching the old
 * `now === 0` guard), then the store swaps to the real clock right after
 * hydration.
 */
let currentNow = typeof Date !== 'undefined' ? Date.now() : 0;
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function start() {
    if (interval !== null) return;
    interval = setInterval(() => {
        currentNow = Date.now();
        listeners.forEach((l) => l());
    }, 60_000);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // Snap to the current time the moment the first listener arrives, so a
    // freshly-mounted card doesn't wait up to a minute for its first real value.
    currentNow = Date.now();
    start();
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && interval !== null) {
            clearInterval(interval);
            interval = null;
        }
    };
}

function getSnapshot(): number {
    return currentNow;
}

// Server render (and the hydration pass) get 0 so time-relative UI is absent,
// exactly matching the previous per-card `useState(0)` initial value.
function getServerSnapshot(): number {
    return 0;
}

/** Subscribe to the shared minute clock. Returns epoch ms, or 0 during SSR. */
export function useNow(): number {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
