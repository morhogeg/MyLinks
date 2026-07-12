'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from './types';
import type { AnalyzingState } from '@/components/AnalyzingBanner';
import { progressFor } from './shareProgress';

/**
 * Drives the app-level "Analyzing…" banner for captures shared from OTHER apps
 * (the iOS Share Extension). Those are analyzed server-side, so there's no real
 * progress to read — but `process_link_background` writes a
 * `status: 'processing'` card to the feed the instant a capture is queued and
 * flips it to a normal status when analysis lands. We watch those cards and
 * synthesize a forward-moving percentage so the user gets the same reassurance
 * the in-app add flow shows.
 *
 * CONTINUITY: progress is ramped from the card's own `processingStartedAt`
 * (fallback `createdAt`) — the SAME epoch-ms wall clock the Share Extension
 * anchored its HUD to — using the shared {@link progressFor} curve. So when the
 * user switches to the app mid-capture, this banner shows the point on the ramp
 * the extension had already reached, never a restart from 0. Only if a card
 * carries no usable timestamp do we fall back to when WE first saw it. When the
 * last processing card resolves we return an inactive state once, so the banner
 * can flash "Saved" and slide away.
 */

/** Coerce a Firestore timestamp field (ms number, or legacy ISO string) to ms. */
function toMs(v: number | string | undefined): number | null {
    if (typeof v === 'number' && isFinite(v) && v > 0) return v;
    if (typeof v === 'string') {
        const t = Date.parse(v);
        if (!isNaN(t)) return t;
    }
    return null;
}

export function useProcessingBanner(links: Link[]): AnalyzingState | null {
    const firstSeen = useRef<Map<string, number>>(new Map());
    // `now` advances once a second while a capture is in flight (down from a
    // 200 ms tick), so the banner ramp re-renders the feed ≤1×/s instead of
    // 5×/s. The clock is read inside effects, never during render, keeping the
    // render pure (no react-hooks/purity violation).
    const [now, setNow] = useState(0);
    const wasActive = useRef(false);
    // Monotonic guard: the displayed % must never step backwards across the
    // hand-off from the optimistic banner or between successive `now` ticks.
    const lastPct = useRef(0);

    const processing = links.filter((l) => l.status === 'processing');
    const active = processing.length > 0;

    // A stable key for "the set of processing cards" so the bookkeeping effect
    // only re-runs when that set actually changes.
    const liveKey = processing.map((l) => l.id).sort().join(',');

    // Prune first-seen entries for cards that are no longer processing, and
    // stamp newly-seen ones (only used as a last-resort clock when a card has no
    // usable timestamp). Done in an effect (not during render) so render stays
    // pure. Uses Date.now (a wall clock) so it shares the same time base as the
    // cards' `processingStartedAt`, keeping the ramp continuous either way.
    useEffect(() => {
        const t = Date.now();
        const liveIds = new Set(processing.map((l) => l.id));
        for (const id of firstSeen.current.keys()) {
            if (!liveIds.has(id)) firstSeen.current.delete(id);
        }
        for (const l of processing) {
            if (!firstSeen.current.has(l.id)) firstSeen.current.set(l.id, t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveKey]);

    // While anything is processing, snap `now` to the wall clock once a second so
    // the ramp moves forward. The banner's own CSS width transition smooths the
    // step. Date.now (not performance.now) so it matches the cards' timestamps.
    useEffect(() => {
        if (!active) return;
        const read = () => setNow(Date.now());
        read();
        const iv = setInterval(read, 1000);
        return () => clearInterval(iv);
    }, [active]);

    if (!active) {
        // Emit one inactive frame right after the last card resolves so the
        // banner finishes gracefully; then nothing. Reset the monotonic guard so
        // the next capture starts a fresh ramp.
        lastPct.current = 0;
        if (wasActive.current) {
            wasActive.current = false;
            return { active: false, progress: 100, kind: 'link' };
        }
        return null;
    }
    wasActive.current = true;

    // Drive the banner from the MOST RECENTLY shared card still processing —
    // the one the user most likely just added.
    const newest = processing.reduce((a, b) =>
        ((toMs(a.createdAt) ?? 0) >= (toMs(b.createdAt) ?? 0) ? a : b),
    );
    const clock = now || Date.now();
    // Prefer the shared start clock stamped on the card (processingStartedAt, then
    // createdAt); only fall back to first-seen when a card carries neither.
    const startMs =
        toMs(newest.processingStartedAt) ??
        toMs(newest.createdAt) ??
        firstSeen.current.get(newest.id) ??
        clock;
    const elapsed = Math.max(0, clock - startMs);
    // Non-decreasing: clamp to the highest % shown so far this capture.
    const progress = Math.max(progressFor(elapsed), lastPct.current);
    lastPct.current = progress;

    const kind: AnalyzingState['kind'] =
        newest.sourceType === 'image' ? 'image' : newest.sourceType === 'youtube' ? 'video' : 'link';

    return { active: true, progress, kind };
}
