'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalyzingState } from '@/components/AnalyzingBanner';
import { consumePendingShare } from './shareConfig';
import { progressFor, elapsedForProgress } from './shareProgress';
import { beginShareCapture, finishShareCapture, isShareCaptureFinished } from './captureLifecycle';

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
 *
 * WHAT "SAVED" IS ALLOWED TO MEAN. The finish frame is the one thing this
 * bridge must never guess: it says the save is DONE. It is therefore driven by
 * EVIDENCE — a ready (non-processing) card in the live feed stamped at or after
 * this capture's start clock (`readyCaptureAt`) — never by a timer. The old
 * rule ("feed loaded + nothing processing for 4s → done") declared victory
 * during the gap between the upload finishing and the backend writing its
 * placeholder, so on a slow connection the bar flashed "Saved" and the card
 * then appeared, still working, a few seconds later (owner-reported 2026-08-01).
 * The timer survives only as a give-up for the case where no card is EVER
 * coming, and it is now patient enough to outlast a slow placeholder write.
 */
const MAX_MS = 30_000; // give up (or never start) the optimistic banner past this age
// How long we keep waiting for ANY sign of the capture — a `processing` card, or
// a ready card stamped at/after its start — before concluding nothing is coming
// (a deduped re-share is a server no-op: no card is ever written). This is a
// give-up, NOT the normal path to "Saved"; the normal path is the evidence check
// in the ticker below. Measured from when we actually began waiting (the later
// of arming and the feed going authoritative), never from capture start — the
// user watches the extension HUD for several seconds and only THEN opens the
// app, so a window anchored at capture start is already spent on arrival.
const NO_EVIDENCE_GIVE_UP_MS = 15_000;
// Tolerance when matching a ready card's server-stamped clock against the
// extension's device clock. Small on purpose: it only absorbs NTP-level skew,
// never enough to let a card from an EARLIER capture pass as this one's.
const CLOCK_SKEW_MS = 2_000;

export function useSharedCaptureBanner(
    processingActive: boolean,
    feedLoaded = false,
    /** Newest READY (non-processing) card's capture clock in the live feed, ms.
     *  0 when the feed holds none. This is the evidence a capture landed. */
    readyCaptureAt = 0,
): AnalyzingState | null {
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
    // Latest feedLoaded, same reason — read inside the ticker without rebinding it.
    const feedRef = useRef(feedLoaded);
    // Latest readyCaptureAt, same reason.
    const readyRef = useRef(readyCaptureAt);
    useEffect(() => {
        readyRef.current = readyCaptureAt;
    }, [readyCaptureAt]);
    // When the feed FIRST became authoritative (epoch ms, 0 = not yet). The settle
    // window runs from here, so it measures how long we've actually been waiting
    // for a placeholder rather than how long ago the user tapped Share.
    const feedReadyAt = useRef(0);
    // When this bridge armed (epoch ms, 0 = not yet). The settle window starts at
    // whichever came LATER — arming or the feed going authoritative — because both
    // must be true before "feed shows nothing processing" means anything.
    const armedAt = useRef(0);
    useEffect(() => {
        feedRef.current = feedLoaded;
        if (feedLoaded && feedReadyAt.current === 0) feedReadyAt.current = Date.now();
    }, [feedLoaded]);

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
            // LATCH — one lifecycle per capture: if this capture already played
            // its finish frame (a foreground re-check, or a re-armed flag for a
            // capture we've already narrated), stay silent.
            if (isShareCaptureFinished(startMs)) return;
            beginShareCapture(startMs);
            setNow(nowMs);
            if (armedAt.current === 0) armedAt.current = nowMs;
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
            // THE HONEST FINISH: the feed is authoritative and now holds a READY
            // card belonging to this capture (stamped at/after its start clock).
            // The save is genuinely done, so "Saved" is true — and because this
            // waits for the card rather than for a clock, it can no longer fire
            // during the gap before the backend writes its placeholder.
            const landed =
                feedRef.current &&
                readyRef.current > 0 &&
                readyRef.current >= signal.startMs - CLOCK_SKEW_MS;
            // GIVE UP: no processing card, no ready card, and we have been
            // waiting a long time — nothing is coming (a deduped re-share writes
            // nothing at all). Finish rather than ramp forever.
            const waitingSince = Math.max(feedReadyAt.current, armedAt.current);
            const givenUp =
                feedRef.current && waitingSince > 0 && t - waitingSince > NO_EVIDENCE_GIVE_UP_MS;
            if (landed || givenUp) {
                // This capture has now shown its one finish frame — latch it so a
                // late-arriving `processing` card can't reopen the banner and
                // replay the phases (see captureLifecycle).
                finishShareCapture(signal.startMs);
                setTerminal({ active: false, progress: 100, kind: signal.kind });
                setSignal(null);
                return;
            }
            // Give-up on the shared start clock: no real card ever arrived and the
            // ramp has run its course — hand the banner one terminal frame instead
            // of ticking forever.
            if (t - signal.startMs > MAX_MS) {
                finishShareCapture(signal.startMs);
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
