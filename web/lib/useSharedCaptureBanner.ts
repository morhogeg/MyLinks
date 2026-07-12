'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalyzingState } from '@/components/AnalyzingBanner';
import { consumePendingShare } from './shareConfig';
import { progressFor, elapsedForProgress } from './shareProgress';

/**
 * Optimistic "Analyzing… N%" banner for a capture the user just handed over from
 * the iOS Share Extension.
 *
 * The extension stamps a short-lived flag in the App Group as it scans; this
 * hook reads that flag (on mount and whenever the app foregrounds) and shows the
 * SAME banner the in-app add flow shows — so the moment the app opens, the user
 * sees the save advancing, with no blank gap while the server-side `processing`
 * card is still being written.
 *
 * CONTINUITY: it ramps from the SAME shared start timestamp the extension wrote
 * (`startedAt`, an epoch-ms wall clock) using the SAME {@link progressFor} curve,
 * so the banner resumes at the exact point on the ramp the extension HUD had
 * reached — never a restart at 0. It's a bridge, not the source of truth: the
 * real Firestore-driven `useProcessingBanner` (which ramps from the placeholder
 * card's `processingStartedAt`, the same clock) takes over the instant the
 * `processing` card streams in. If no card ever appears (e.g. a deduped re-share
 * is a server no-op), the optimistic banner eases to its ceiling and then
 * finishes gracefully on its own.
 */
const MAX_MS = 30_000; // give up (or never start) the optimistic banner past this age

export function useSharedCaptureBanner(processingActive: boolean): AnalyzingState | null {
    // `startMs` is the shared capture-start wall clock (epoch ms) — progress is a
    // pure function of `Date.now() - startMs`, identical to what the extension
    // and the real processing banner compute.
    const [signal, setSignal] = useState<{ startMs: number; kind: AnalyzingState['kind'] } | null>(null);
    const [, tick] = useState(0);
    const finishedOnce = useRef(false);
    // Monotonic guard so a hand-off can never step the % backwards.
    const lastPct = useRef(0);
    // Latest processingActive, readable inside the async check without re-binding.
    const procRef = useRef(processingActive);
    useEffect(() => {
        procRef.current = processingActive;
    }, [processingActive]);

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
            // Recover the shared capture-start wall clock. Prefer the absolute
            // `startedAt` the extension wrote; older builds reported only a % or
            // an age, so reconstruct an equivalent start from those.
            const nowMs = Date.now();
            let startMs: number;
            if (res.startedAt && res.startedAt > 0) {
                startMs = res.startedAt;
            } else if (res.progress !== undefined) {
                startMs = nowMs - elapsedForProgress(res.progress);
            } else {
                startMs = nowMs - Math.max(0, res.ageMs);
            }
            // Req 3 — no flash when it's already done: if the capture started long
            // enough ago that any processing card would already be present (and
            // would be driving the banner) or the work has finished, don't open an
            // optimistic loader at all. The ready card just appears.
            if (nowMs - startMs > MAX_MS) return;
            setSignal((cur) => cur ?? { startMs, kind: res.kind });
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
    }, []);

    // Real processing card appeared → hand off (it owns the finish frame). It
    // ramps from the same shared clock, so the % carries across seamlessly.
    useEffect(() => {
        if (processingActive && signal) setSignal(null);
    }, [processingActive, signal]);

    // Advance the ramp while active. Ticks once a second; progress is a pure
    // function of elapsed time so the value is exact at any given moment and the
    // banner's CSS width transition smooths each step.
    useEffect(() => {
        if (!signal) return;
        const iv = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(iv);
    }, [signal]);

    if (!signal) {
        lastPct.current = 0;
        return null;
    }

    const elapsed = Math.max(0, Date.now() - signal.startMs);

    // Give-up timer on the shared start clock: if no real card ever arrived and
    // the ramp has run its course, emit exactly one inactive frame so the banner
    // flashes "Saved" and slides away, then clear.
    if (elapsed > MAX_MS) {
        // finishedOnce is a deliberate once-latch (not render-affecting state): it
        // gates the single terminal frame emitted during the render→setSignal(null)
        // hand-off, so reading it here is intentional rather than a stale-ref hazard.
        // eslint-disable-next-line react-hooks/refs
        if (!finishedOnce.current) {
            finishedOnce.current = true;
            Promise.resolve().then(() => setSignal(null));
            return { active: false, progress: 100, kind: signal.kind };
        }
        return null;
    }

    // Non-decreasing across ticks / hand-offs.
    const progress = Math.max(progressFor(elapsed), lastPct.current);
    lastPct.current = progress;
    return { active: true, progress, kind: signal.kind };
}
