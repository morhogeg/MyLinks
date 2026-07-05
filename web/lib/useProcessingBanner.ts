'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from './types';
import type { AnalyzingState } from '@/components/AnalyzingBanner';

/**
 * Drives the app-level "Analyzing…" banner for captures shared from OTHER apps
 * (iOS Share Extension, WhatsApp). Those are analyzed server-side, so there's
 * no real progress to read — but `process_link_background` writes a
 * `status: 'processing'` card to the feed the instant a capture is queued and
 * flips it to a normal status when analysis lands. We watch those cards and
 * synthesize a forward-moving percentage so the user gets the same reassurance
 * the in-app add flow shows.
 *
 * Progress is time-based, eased toward a 95% ceiling from when WE first saw the
 * card (not its createdAt — a card already mid-flight when the app opens starts
 * advanced but not stuck). When the last processing card resolves we return an
 * inactive state once, so the banner can flash "Saved" and slide away.
 */
const EXPECTED_MS = 18_000; // typical server analysis time; tunes the ramp
const CEILING = 95;

export function useProcessingBanner(links: Link[]): AnalyzingState | null {
    const firstSeen = useRef<Map<string, number>>(new Map());
    const [, tick] = useState(0);
    const wasActive = useRef(false);

    const processing = links.filter((l) => l.status === 'processing');
    const active = processing.length > 0;

    // Prune first-seen entries for cards that are no longer processing, and
    // stamp newly-seen ones. Uses performance.now for a monotonic clock that
    // doesn't depend on the disallowed Date.now in some contexts.
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const liveIds = new Set(processing.map((l) => l.id));
    for (const id of firstSeen.current.keys()) {
        if (!liveIds.has(id)) firstSeen.current.delete(id);
    }
    for (const l of processing) {
        if (!firstSeen.current.has(l.id)) firstSeen.current.set(l.id, now);
    }

    // While anything is processing, re-render on an interval so the ramp moves.
    useEffect(() => {
        if (!active) return;
        const iv = setInterval(() => tick((n) => n + 1), 200);
        return () => clearInterval(iv);
    }, [active]);

    if (!active) {
        // Emit one inactive frame right after the last card resolves so the
        // banner finishes gracefully; then nothing.
        if (wasActive.current) {
            wasActive.current = false;
            return { active: false, progress: 100, kind: 'link' };
        }
        return null;
    }
    wasActive.current = true;

    // Drive the banner from the MOST RECENTLY shared card still processing —
    // the one the user most likely just added.
    const newest = processing.reduce((a, b) => ((a.createdAt ?? 0) >= (b.createdAt ?? 0) ? a : b));
    const seen = firstSeen.current.get(newest.id) ?? now;
    const elapsed = Math.max(0, now - seen);
    // Ease-out toward the ceiling: fast at first, slowing as it approaches 95%.
    const frac = 1 - Math.exp(-elapsed / (EXPECTED_MS * 0.6));
    const progress = Math.min(CEILING, 6 + frac * (CEILING - 6));

    const kind: AnalyzingState['kind'] =
        newest.sourceType === 'image' ? 'image' : newest.sourceType === 'youtube' ? 'video' : 'link';

    return { active: true, progress, kind };
}
