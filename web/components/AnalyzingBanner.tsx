'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { OrbState } from '@/components/ui/CitationMark';
import OrbStatus from '@/components/ui/OrbStatus';
import { imageScanLabel, imageScanOrb, linkScanLabel, linkScanOrb, textScanLabel, LINK_SCAN_STEPS, TEXT_SCAN_STEPS, LINK_SCAN_ORBS } from '@/lib/scanPhases';

export interface AnalyzingState {
    active: boolean;
    /** 0–100. */
    progress: number;
    /** What's being analyzed, for the label. 'text' is a shared paragraph with
        no URL — it must never be narrated as a link being fetched. */
    kind: 'link' | 'image' | 'video' | 'text';
    /** For a LINK capture, the backend `processingStage`'s step (0..4) when
        present — pins the label to the real milestone instead of deriving it from
        the % (which the time-ramp can push ahead). Absent → derive from progress. */
    stageStep?: number;
}

/**
 * Phase label that advances with progress, mirroring the in-panel scan views
 * (LinkScanProgress / ImageScanProgress / VideoScanProgress) so the banner reads
 * as genuinely working through stages, not a static "Analyzing".
 */
/** Ellipsize a phase label — except the terminal 'Done!' beat, which must never
    render as "Done!…" on a still-ACTIVE banner (owner-reported, build 1294). An
    active banner at the ramp ceiling is still working, so say so; the real
    finish is the `done` frame's "Saved to Machina". */
function working(label: string): string {
    return (label === 'Done!' ? 'Wrapping up' : label) + '…';
}

function phaseStatus(
    kind: AnalyzingState['kind'],
    pct: number,
    stageStep?: number,
): { label: string; orb: OrbState } {
    // Image capture: shared source (IMAGE_SCAN_STEPS) — the same beats the
    // in-dialog ImageScanProgress and the iOS share sheet narrate, so the
    // banner can never drift into a third wording again.
    if (kind === 'image') {
        return { label: working(imageScanLabel(pct)), orb: imageScanOrb(pct) };
    }
    if (kind === 'video') {
        if (pct >= 92) return { label: 'Organizing & tagging…', orb: 'solving' };
        if (pct >= 72) return { label: 'Writing the summary…', orb: 'shaping' };
        if (pct >= 40) return { label: 'Understanding the video…', orb: 'solving' };
        return { label: 'Watching the video…', orb: 'searching' };
    }
    // Shared text: the same beats and the same orbs as a link, with copy that
    // doesn't claim to be fetching anything (shared source: TEXT_SCAN_STEPS).
    if (kind === 'text') {
        if (stageStep != null && TEXT_SCAN_STEPS[stageStep]) {
            return { label: working(TEXT_SCAN_STEPS[stageStep]), orb: LINK_SCAN_ORBS[stageStep] };
        }
        return { label: working(textScanLabel(pct)), orb: linkScanOrb(pct) };
    }
    // link / web article — mirror the in-dialog stepper exactly (shared source).
    // Pin to the backend stage when reported; else derive the phase from the %.
    if (stageStep != null && LINK_SCAN_STEPS[stageStep]) {
        return { label: working(LINK_SCAN_STEPS[stageStep]), orb: LINK_SCAN_ORBS[stageStep] };
    }
    return { label: working(linkScanLabel(pct)), orb: linkScanOrb(pct) };
}

/**
 * A small, app-level "Analyzing… N%" banner that lives ABOVE the add form —
 * so it persists through the form being collapsed or closed, and stays until
 * the analysis lands (then flashes a brief "Saved" before sliding away). This
 * is the reassurance that a capture is still being worked on after the user
 * moves on; it's decoupled from AddLinkForm's open/closed lifecycle on purpose
 * (that coupling is why the old in-form indicator kept vanishing).
 *
 * Pinned bottom-center, above the FAB and safe-area inset. Non-blocking.
 */
export default function AnalyzingBanner({ state }: { state: AnalyzingState | null }) {
    // Keep the banner mounted briefly after `active` flips false so the finish
    // (100% → "Saved ✓") is visible instead of a hard pop-out.
    const [visible, setVisible] = useState(false);
    const [done, setDone] = useState(false);
    const [shown, setShown] = useState<AnalyzingState | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Monotonic guard on the DISPLAYED %: whichever source is feeding the banner
    // (optimistic bridge → real processing card), the number must never step
    // backwards mid-capture. Reset when the banner leaves the screen.
    const maxPct = useRef(0);

    useEffect(() => {
        if (state?.active) {
            if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
            setDone(false);
            setShown(state);
            setVisible(true);
            return;
        }
        // active just went false — if we were showing, finish gracefully.
        if (visible && !done) {
            setDone(true);
            setShown((s) => (s ? { ...s, progress: 100 } : s));
            hideTimer.current = setTimeout(() => {
                setVisible(false);
                setDone(false);
                setShown(null);
            }, 1100);
        }
        return () => {
            if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state?.active, state?.progress, state?.kind]);

    if (!visible || !shown) {
        maxPct.current = 0;
        return null;
    }

    // Non-decreasing: clamp up to the highest % shown so far this capture, so a
    // hand-off between banner sources can't flash a lower number. The finish
    // frame (done) always completes to 100%.
    let pct = Math.round(Math.min(100, Math.max(0, done ? 100 : shown.progress)));
    // eslint-disable-next-line react-hooks/refs
    pct = done ? 100 : Math.max(pct, maxPct.current);
    // eslint-disable-next-line react-hooks/refs
    maxPct.current = pct;

    const phase = phaseStatus(shown.kind, pct, shown.stageStep);

    return (
        <div
            className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
            aria-live="polite"
        >
            <div className="animate-slide-up pointer-events-auto w-full max-w-xs rounded-2xl bg-card/95 backdrop-blur-xl border border-border-subtle shadow-[var(--shadow-card)] px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                    {done ? (
                        <>
                            <CheckCircle2 className="w-4 h-4 text-accent shrink-0 animate-fade-in" />
                            <span className="flex-1 text-[13px] font-medium text-text truncate">
                                Saved to Machina
                            </span>
                        </>
                    ) : (
                        // The orb and the phase label change together as one dip;
                        // the % keeps ticking outside it so the number stays steady.
                        <OrbStatus
                            orb={phase.orb}
                            label={phase.label}
                            stageKey={phase.label}
                            className="flex items-center gap-2.5 flex-1 min-w-0"
                            labelClassName="flex-1 text-[13px] font-medium text-text truncate"
                        />
                    )}
                    <span className="text-[13px] font-bold tabular-nums text-text-secondary">
                        {pct}%
                    </span>
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-fill-strong overflow-hidden">
                    <div
                        className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
