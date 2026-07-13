/**
 * The ONE progress curve shared by every capture-progress surface so a shared
 * item reads as a single, continuous loader no matter which screen is showing
 * it: the iOS Share Extension HUD, the optimistic in-app banner
 * (useSharedCaptureBanner), and the Firestore-driven processing banner
 * (useProcessingBanner).
 *
 * Progress is a *pure, deterministic function of elapsed wall-clock time* since
 * the capture started. Every surface anchors to the SAME start timestamp
 * (epoch-ms wall clock) — the Share Extension writes its scan-start time into
 * the App Group, and the backend stamps `processingStartedAt`/`createdAt` on the
 * placeholder card — so any surface computes the identical percentage at the
 * same moment. Switch apps mid-capture and the loader keeps moving; it never
 * restarts at 0 or jumps back.
 *
 * The curve eases toward CEILING (never 100 on its own — honest progress, M6):
 *
 *     progress(t) = CEILING − (CEILING − START) · e^(−t / TAU)
 *
 * TWIN: these constants and this formula are mirrored in Swift in
 * web/ios/App/ShareExt/ShareViewController.swift (enum `ShareProgressCurve`).
 * If you change the curve here, change it there too, or the two screens drift.
 */

/** Where the ramp starts at t=0 (a small non-zero value, never a dead 0%). */
export const START_PCT = 6;
/** The asymptote the ramp eases toward while work is still in flight. */
export const CEILING = 92;
/** Time constant (ms): larger = slower ramp. ~10s reaches ~60% by 10s, ~88% by 30s. */
export const TAU_MS = 10_000;

/**
 * Deterministic progress (percent, START_PCT…CEILING) for a given elapsed time
 * in milliseconds since the capture started. Monotonically non-decreasing in
 * `elapsedMs`, so any two surfaces reading the same clock agree exactly.
 */
export function progressFor(elapsedMs: number): number {
    const t = Math.max(0, elapsedMs);
    const p = CEILING - (CEILING - START_PCT) * Math.exp(-t / TAU_MS);
    return Math.min(CEILING, Math.max(START_PCT, p));
}

/**
 * Inverse of {@link progressFor}: the elapsed time (ms) that yields a given
 * percentage. Used to reconstruct a start timestamp from a percentage handed
 * over by an older Share Extension build that reported only its `%`, not a
 * start time — so even then the in-app ramp resumes from the same point.
 */
export function elapsedForProgress(pct: number): number {
    const clamped = Math.min(CEILING - 0.01, Math.max(START_PCT, pct));
    return -TAU_MS * Math.log((CEILING - clamped) / (CEILING - START_PCT));
}
