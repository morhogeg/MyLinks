'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalyzingState } from '@/components/AnalyzingBanner';
import { consumePendingShare } from './shareConfig';

/**
 * Optimistic "Analyzing… N%" banner for a capture the user just handed over from
 * the iOS Share Extension by tapping **Open Machina** on the share progress HUD.
 *
 * The extension stamps a short-lived flag in the App Group and opens the app;
 * this hook reads that flag (on mount and whenever the app foregrounds) and
 * shows the SAME banner the in-app add flow shows when its dialog is closed —
 * so the moment the app opens, the user sees the save advancing, with no blank
 * gap while the server-side `processing` card is still being written.
 *
 * It's a bridge, not the source of truth: the real, Firestore-driven
 * `useProcessingBanner` takes over the instant the `processing` card streams in
 * (`processingActive` → we stand down and let it own the finish). If no card
 * ever appears (e.g. a deduped re-share is a server no-op), the optimistic
 * banner eases to its ceiling and then finishes gracefully on its own.
 */
const EXPECTED_MS = 16_000; // typical server analysis time; tunes the ramp
const CEILING = 90;
const MAX_MS = 28_000; // give up the optimistic banner if no real card lands

export function useSharedCaptureBanner(processingActive: boolean): AnalyzingState | null {
    // `startedAt` anchors the progress RAMP (may sit in the past so the ramp
    // resumes at the hand-off %); `openedAt` is the real wall-clock the app
    // foregrounded, used only for the give-up timer.
    const [signal, setSignal] = useState<{ startedAt: number; openedAt: number; kind: AnalyzingState['kind'] } | null>(null);
    const [, tick] = useState(0);
    const finishedOnce = useRef(false);
    // Latest processingActive, readable inside the async check without re-binding.
    const procRef = useRef(processingActive);
    useEffect(() => {
        procRef.current = processingActive;
    }, [processingActive]);

    const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

    // Poll the native App Group flag on mount and on every foreground. WKWebView
    // fires visibilitychange/focus when the app returns from the Share sheet, so
    // both a cold launch and a warm foreground seed the banner.
    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            const res = await consumePendingShare();
            if (cancelled || !res.pending) return;
            // The real card already covers this save — consume the flag but don't
            // show a second banner on top of it.
            if (procRef.current) return;
            // Resume from the EXACT % the share sheet was showing at hand-off, so
            // the two screens read as one continuous progress. Invert the ease-out
            // to find the ramp origin that yields that %, then let it keep rising.
            // Older extension builds don't report a %, so fall back to the elapsed-
            // time offset (keeps the ramp from restarting at zero).
            const t = now();
            let startedAt: number;
            if (res.progress !== undefined) {
                const frac = Math.min(0.999, Math.max(0, (res.progress - 6) / (CEILING - 6)));
                startedAt = t + EXPECTED_MS * 0.6 * Math.log(1 - frac); // log(...) ≤ 0 → origin in the past
            } else {
                const age = Math.max(0, Math.min(res.ageMs, EXPECTED_MS * 0.6));
                startedAt = t - age;
            }
            setSignal((cur) => cur ?? { startedAt, openedAt: t, kind: res.kind });
        };
        void check();
        const onVis = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') void check();
        };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', check);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('focus', check);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Real processing card appeared → hand off (it owns the finish frame).
    useEffect(() => {
        if (processingActive && signal) setSignal(null);
    }, [processingActive, signal]);

    // Advance the ramp while active. Ticks once a second (down from 200 ms) so
    // the optimistic banner re-renders ≤1×/s; the banner's CSS width transition
    // smooths each step, and progress is a pure function of elapsed time so the
    // ramp still lands at the same value at any given moment.
    useEffect(() => {
        if (!signal) return;
        const iv = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(iv);
    }, [signal]);

    if (!signal) return null;

    // Give-up timer runs on the real clock since the app opened — not the ramp
    // anchor, which can start well in the past when the hand-off % was high.
    const elapsedReal = Math.max(0, now() - signal.openedAt);
    if (elapsedReal > MAX_MS) {
        // No real card ever arrived. Emit exactly one inactive frame so the banner
        // flashes "Saved" and slides away, then clear.
        if (!finishedOnce.current) {
            finishedOnce.current = true;
            Promise.resolve().then(() => setSignal(null));
            return { active: false, progress: 100, kind: signal.kind };
        }
        return null;
    }

    // Ease-out toward the ceiling: fast at first, slowing as it approaches.
    const elapsed = Math.max(0, now() - signal.startedAt);
    const frac = 1 - Math.exp(-elapsed / (EXPECTED_MS * 0.6));
    const progress = Math.min(CEILING, 6 + frac * (CEILING - 6));
    return { active: true, progress, kind: signal.kind };
}
