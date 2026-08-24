'use client';

import { CheckCircle2 } from 'lucide-react';
import CitationMark, { OrbState } from '@/components/ui/CitationMark';
import { imageScanLabel, imageScanOrb } from '@/lib/scanPhases';

interface ImageScanProgressProps {
    /** Data URL of the image being analyzed. */
    imageSrc: string;
    /** 0–100. Drives the bar and the phase label. */
    progress: number;
}

/** The mark's motion for a phase — same verb→motion table the link scan rides
 *  (lib/scanPhases.ts IMAGE_SCAN_ORBS), so a photo save looks like every other
 *  save: reading is a sweep, understanding is a ratchet, filing is a hold. */
function orbFor(progress: number): OrbState {
    return imageScanOrb(progress);
}

// Phase label from the shared source (IMAGE_SCAN_STEPS) — the same beats the
// AnalyzingBanner and the iOS share sheet narrate, so the three can't drift.
function phaseFor(progress: number): string {
    const label = imageScanLabel(progress);
    return label === 'Done!' ? label : label + '…';
}

/**
 * "Reading your image" indicator: an OCR-style scan line sweeps over the
 * uploaded preview while an indeterminate bar and a rotating phase label convey
 * calm forward motion — no fake percentage, since the backend gives us no real
 * progress to report (M6).
 */
export default function ImageScanProgress({ imageSrc, progress }: ImageScanProgressProps) {
    const clamped = Math.min(100, Math.max(0, progress));
    const done = clamped >= 100;
    const label = phaseFor(clamped);

    return (
        <div className="space-y-3">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border-strong">
                <img src={imageSrc} alt="Analyzing" className="w-full h-full object-cover" />

                {/* Dim + subtle blur so the scan line reads clearly */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />

                {/* Sweeping scan line (hidden once complete) */}
                {!done && (
                    <div className="absolute inset-x-0 top-0 h-1/5 animate-scan-sweep pointer-events-none">
                        <div className="w-full h-full bg-gradient-to-b from-transparent via-accent/70 to-transparent" />
                        <div className="w-full h-px bg-accent shadow-[0_0_12px_2px_var(--accent)]" />
                    </div>
                )}

                {/* Center status — icon, advancing percentage, phase label. The % is
                    simulated but anchored to real milestones in AddLinkForm. */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-4">
                    {done ? (
                        <CheckCircle2 className="w-10 h-10 text-green-400 animate-fade-in" />
                    ) : (
                        <>
                            {/* OUR mark, not a generic scan glyph — every save
                                surface carries the Citation mark while it works
                                (LinkScanProgress, the Share Extension HUD), and
                                a photo save was the one that didn't. */}
                            <CitationMark state={orbFor(clamped)} size={30} className="text-white" />
                            <span className="text-2xl font-bold text-white tabular-nums" aria-hidden>
                                {Math.round(clamped)}%
                            </span>
                        </>
                    )}
                    <p className="text-sm font-medium text-white/90" aria-live="polite">
                        {label}
                    </p>
                </div>
            </div>

            {/* Indeterminate progress bar — motion, not a lying number. */}
            <div
                className="h-1.5 w-full rounded-full bg-fill-strong overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(clamped)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Image analysis progress"
                aria-busy={!done}
            >
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${done ? 'bg-green-400' : 'bg-accent'}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>

            {/* The request keeps running after this dialog closes — AddLinkForm
                stays mounted and publishes progress to the persistent
                AnalyzingBanner. Only quitting/backgrounding the whole app
                suspends the WebView and loses the save, so invite closing the
                dialog (not the app). */}
            {!done && (
                <p className="text-xs text-text-muted text-center">
                    You can close this window. Machina keeps working in the background.
                </p>
            )}
        </div>
    );
}
