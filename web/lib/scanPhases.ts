import type { OrbState } from '@/components/ui/CitationMark';

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

/**
 * The same five beats for a TEXT capture — a paragraph shared straight into
 * Machina with no URL in it.
 *
 * Text shares used to ride LINK_SCAN_STEPS, so the share sheet announced
 * "Fetching the link… / Reading the page…" over a paragraph with no link and no
 * page (owner-reported 2026-08-08). Nothing is fetched and nothing is scraped
 * here — the text is already in hand — so the copy says what is actually
 * happening: it is being read, then filed. Note the summary beat is "Writing a
 * summary", not "Writing the summary": on a text card the summary is an extra
 * the reader can ask for, not the body of the card.
 */
export const TEXT_SCAN_STEPS = [
    'Saving your text',
    'Reading your text',
    'Writing a summary',
    'Searching connections',
    'Organizing & tagging',
] as const;

/**
 * The image-save beats — a photo/screenshot capture, from upload to card.
 *
 * Three surfaces narrate this flow: the in-dialog `ImageScanProgress`, the
 * persistent `AnalyzingBanner`, and the iOS share sheet
 * (`web/ios/App/ShareExt/ShareViewController.swift`, the non-link/non-text
 * branch of `phase(for:)`). The two web surfaces read from HERE; the Swift
 * copy cannot import this file, so it is a TWIN — change one, change the
 * other. The wording below is the Swift/dialog wording (device-QA'd); the
 * banner used to carry a drifted third variant ("Scanning the image…"),
 * which is exactly the drift this constant exists to end.
 */
export const IMAGE_SCAN_STEPS = [
    'Uploading',
    'Scanning image',
    'Reading text',
    'Understanding content',
    'Organizing & tagging',
    'Finishing up',
] as const;

/**
 * The Thinking Orb that rides each phase, positionally matched to
 * `LINK_SCAN_STEPS`. One verb → one orb, app-wide:
 *
 * - `working`   — fetching, in flight
 * - `searching` — scanning, reading, looking something up
 * - `solving`   — relating, sorting, working it out
 * - `shaping`   — producing the output (the same orb Ask uses for
 *                 "Writing your answer…", so "writing" always looks the same)
 *
 * `listening` is reserved for Ask's idle hero; `composing` is unused — it reads
 * as texture rather than intent at 20px.
 *
 * Repeats are deliberate: the orb changes when the KIND of work changes, not on
 * every label tick. Two adjacent phases that are both scanning keep the same
 * orb rather than inventing a difference the pipeline doesn't have.
 */
export const LINK_SCAN_ORBS = [
    'working',    // Fetching the link
    'searching',  // Reading the page
    'shaping',    // Writing the summary
    'searching',  // Searching connections
    'solving',    // Organizing & tagging
] as const satisfies readonly OrbState[];

/** Orbs for the image beats, positionally matched to `IMAGE_SCAN_STEPS` —
 *  same verb→orb table as the link flow (uploading is in-flight work, the two
 *  scan/read beats are searching, writing the card up is shaping, filing it is
 *  solving). */
export const IMAGE_SCAN_ORBS = [
    'working',    // Uploading
    'searching',  // Scanning image
    'searching',  // Reading text
    'shaping',    // Understanding content
    'solving',    // Organizing & tagging
    'solving',    // Finishing up
] as const satisfies readonly OrbState[];

/** Active step index (0..IMAGE_SCAN_STEPS.length-1) for a 0–100 progress
 *  value. Thresholds are the TWIN of the Swift share sheet's image branch
 *  (20/45/60/80/95) — keep them identical. */
export function imageScanStepIndex(progress: number): number {
    const p = Math.min(100, Math.max(0, progress));
    if (p >= 95) return 5;
    if (p >= 80) return 4;
    if (p >= 60) return 3;
    if (p >= 45) return 2;
    if (p >= 20) return 1;
    return 0;
}

/** Image-capture phase label for a 0–100 progress value; 'Done!' once complete. */
export function imageScanLabel(progress: number): string {
    if (progress >= 100) return 'Done!';
    return IMAGE_SCAN_STEPS[imageScanStepIndex(progress)];
}

/** Orb for an image capture's 0–100 progress value. */
export function imageScanOrb(progress: number): OrbState {
    return IMAGE_SCAN_ORBS[imageScanStepIndex(progress)];
}

/** Orb for a 0–100 progress value, mirroring `linkScanLabel`. */
export function linkScanOrb(progress: number): OrbState {
    return LINK_SCAN_ORBS[linkScanStepIndex(progress)];
}

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

/** Text-capture phase label for a 0–100 progress value. Same thresholds and the
 *  same orbs as the link flow — only the words differ, because only the words
 *  were ever wrong. */
export function textScanLabel(progress: number): string {
    if (progress >= 100) return 'Done!';
    return TEXT_SCAN_STEPS[linkScanStepIndex(progress)];
}
