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
    // Wall-clock snapshot render derives `elapsed` from — seeded when the signal
    // lands and advanced by the ticker effect, so render never calls Date.now().
    // Monotonicity needs no extra guard here: `startMs` is fixed for a signal's
    // lifetime and `now` only moves forward, so progressFor(elapsed) only rises
    // (AnalyzingBanner additionally clamps the displayed % across hand-offs).
    const [now, setNow] = useState(0);
    // The single "give-up" finish frame, emitted when no real card ever arrived
    // and the ramp ran its course — lets the banner flash "Saved" and slide away.
    const [terminal, setTerminal] = useState<AnalyzingState | null>(null);
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
            setNow(nowMs);
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
    // Render yields immediately (see below); the ticker retires the signal.

    // Advance the ramp while active. Ticks once a second; progress is a pure
    // function of elapsed time so the value is exact at any given moment and the
    // banner's CSS width transition smooths each step.
    useEffect(() => {
        if (!signal) return;
        const read = () => {
            // The real Firestore-driven banner took over — retire the bridge.
            if (procRef.current) {
                setSignal(null);
                return;
            }
            const t = Date.now();
            // Give-up on the shared start clock: no real card ever arrived and the
            // ramp has run its course — hand the banner one terminal frame instead
            // of ticking forever.
            if (t - signal.startMs > MAX_MS) {
                setTerminal({ active: false, progress: 100, kind: signal.kind });
                setSignal(null);
                return;
            }
            setNow(t);
        };
        read();
        const iv = setInterval(read, 1000);
        return () => clearInterval(iv);
    }, [signal]);

    // The terminal frame shows for one beat (the banner owns its own "Saved"
    // flash-and-hide), then this hook goes quiet.
    useEffect(() => {
        if (!terminal) return;
        const t = setTimeout(() => setTerminal(null), 600);
        return () => clearTimeout(t);
    }, [terminal]);

    if (terminal) return terminal;
    // The real processing banner owns the surface the moment it's active — the
    // bridge goes silent instantly (the ticker retires `signal` right after).
    if (!signal || processingActive) return null;

    const elapsed = Math.max(0, now - signal.startMs);
    return { active: true, progress: progressFor(elapsed), kind: signal.kind };
}
