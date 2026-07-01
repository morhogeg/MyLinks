'use client';

import { CheckCircle2, ScanText } from 'lucide-react';

interface ImageScanProgressProps {
    /** Data URL of the image being analyzed. */
    imageSrc: string;
    /** 0–100. Drives the bar and the phase label. */
    progress: number;
}

// Phase label derived purely from progress, so this component stays stateless.
function phaseFor(progress: number): string {
    if (progress >= 100) return 'Done!';
    if (progress >= 95) return 'Finishing up…';
    if (progress >= 80) return 'Organizing & tagging…';
    if (progress >= 60) return 'Understanding content…';
    if (progress >= 45) return 'Reading text…';
    if (progress >= 20) return 'Scanning image…';
    return 'Uploading…';
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
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
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

                {/* Center status — icon + honest phase label, no fake % (M6). */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                    {done ? (
                        <CheckCircle2 className="w-10 h-10 text-green-400 animate-fade-in" />
                    ) : (
                        <ScanText className="w-8 h-8 text-accent" />
                    )}
                    <p className="text-sm font-medium text-white/90" aria-live="polite">
                        {label}
                    </p>
                </div>
            </div>

            {/* Indeterminate progress bar — motion, not a lying number. */}
            <div
                className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-label="Image analysis progress"
                aria-busy={!done}
            >
                {done ? (
                    <div className="h-full w-full rounded-full bg-green-400" />
                ) : (
                    <div className="h-full w-2/5 rounded-full bg-accent animate-progress-indeterminate" />
                )}
            </div>

            {/* Analysis is a single foreground request (see AddLinkForm.handleSubmit)
                — not a background job. Closing/backgrounding the app suspends the
                WebView and the save is lost, so be honest and ask them to wait. */}
            {!done && (
                <p className="text-xs text-text-muted text-center">
                    Keep Machina open — this only takes a few seconds.
                </p>
            )}
        </div>
    );
}
