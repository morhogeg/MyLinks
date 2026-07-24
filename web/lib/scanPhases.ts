/**
 * Single source of truth for the link-save processing phases.
 *
 * Both the in-dialog stepper (`LinkScanProgress`) and the persistent
 * `AnalyzingBanner` — including any iOS share-sheet capture that feeds the
 * banner — derive their phase from HERE, so the two surfaces can never disagree
 * about what Machina is doing at a given progress value. Edit the labels once,
 * in this file, and both stay mirrored.
 *
 * The step timing is simulated: the backend gives us no true per-stage progress
 * (M6), so these thresholds only need to advance honestly, never precisely. The
 * copy is deliberately count-free and non-committal ("Searching connections",
 * not "Finding connections") — a save won't always have related links.
 */
export const LINK_SCAN_STEPS = [
    'Fetching the link',
    'Reading the page',
    'Writing the summary',
    'Searching connections',
    'Organizing & tagging',
] as const;

/** Active step index (0..LINK_SCAN_STEPS.length-1) for a 0–100 progress value. */
export function linkScanStepIndex(progress: number): number {
    const p = Math.min(100, Math.max(0, progress));
    if (p >= 92) return 4;
    if (p >= 72) return 3;
    if (p >= 50) return 2;
    if (p >= 25) return 1;
    return 0;
}

/**
 * Coarse per-stage progress the backend reports on a `processing` card
 * (`processingStage`, present only while status === 'processing'). Unlike the
 * simulated time ramp, these are REAL milestones — so every capture-progress
 * surface floors its displayed % to the reported stage and pins the active step
 * to it, never running the checklist ahead of the actual work.
 */
export type ProcessingStage = 'scraping' | 'analyzing' | 'connecting' | 'organizing';

/**
 * The active step + progress FLOOR for a backend `processingStage`. The floors
 * mirror `linkScanStepIndex`'s thresholds exactly, so a card flooring its % to a
 * stage lands on that stage's step either way. No stage yet → step 0, floor 0.
 */
export function stageProgress(stage: ProcessingStage | undefined): { step: number; floor: number } {
    switch (stage) {
        case 'scraping':
            return { step: 1, floor: 25 };
        case 'analyzing':
            return { step: 2, floor: 50 };
        case 'connecting':
            return { step: 3, floor: 72 };
        case 'organizing':
            return { step: 4, floor: 92 };
        default:
            return { step: 0, floor: 0 };
    }
}

/** Phase label for a 0–100 progress value; 'Done!' once complete. */
export function linkScanLabel(progress: number): string {
    if (progress >= 100) return 'Done!';
    return LINK_SCAN_STEPS[linkScanStepIndex(progress)];
}
