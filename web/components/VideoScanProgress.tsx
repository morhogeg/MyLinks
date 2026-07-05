'use client';

import { CheckCircle2, Youtube } from 'lucide-react';

interface VideoScanProgressProps {
    /** YouTube thumbnail URL, or null to show a generic placeholder. */
    thumbnailSrc: string | null;
    /** 0–100. Drives the bar and the phase label. */
    progress: number;
}

// Phase label derived purely from progress, evoking how Gemini "watches" the
// video end to end. Kept stateless so the parent owns the simulated progress.
function phaseFor(progress: number): string {
    if (progress >= 100) return 'Done!';
    if (progress >= 92) return 'Organizing & tagging…';
    if (progress >= 72) return 'Writing the summary…';
    if (progress >= 52) return 'Finding key moments…';
    if (progress >= 30) return 'Watching the video…';
    return 'Fetching the video…';
}

/**
 * "Watching your video" indicator: a scan line sweeps over the video thumbnail
 * while an indeterminate bar and rotating phase label convey that Gemini is
 * working through the whole video — no fake percentage, since we can't read
 * real progress from the analysis (M6).
 */
export default function VideoScanProgress({ thumbnailSrc, progress }: VideoScanProgressProps) {
    const clamped = Math.min(100, Math.max(0, progress));
    const done = clamped >= 100;
    const label = phaseFor(clamped);

    return (
        <div className="space-y-3">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
                {thumbnailSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailSrc} alt="Analyzing video" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-[image:var(--accent-gradient)] opacity-30" />
                )}

                {/* Dim + subtle blur so the scan line and status read clearly */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

                {/* Sweeping scan line (hidden once complete) */}
                {!done && (
                    <div className="absolute inset-x-0 top-0 h-1/5 animate-scan-sweep pointer-events-none">
                        <div className="w-full h-full bg-gradient-to-b from-transparent via-accent/70 to-transparent" />
                        <div className="w-full h-px bg-accent shadow-[0_0_12px_2px_var(--accent)]" />
                    </div>
                )}

                {/* Center status — icon, advancing percentage, phase label. The %
                    is simulated but anchored to real milestones in AddLinkForm. */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-4">
                    {done ? (
                        <CheckCircle2 className="w-10 h-10 text-green-400 animate-fade-in" />
                    ) : (
                        <>
                            <Youtube className="w-7 h-7 text-red-500/90" />
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

            {/* Determinate progress bar, driven by the same value as the %. */}
            <div
                className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-label="Video analysis progress"
                aria-valuenow={Math.round(clamped)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-busy={!done}
            >
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${done ? 'bg-green-400' : 'bg-accent'}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>

            {/* Video analysis is slow (~a minute) and runs in the foreground (see
                AddLinkForm.handleSubmit), so the app must stay open — be honest
                rather than implying they can leave. */}
            {!done && (
                <p className="text-xs text-text-muted text-center">
                    Watching the full video takes a minute — keep Machina open while it runs.
                </p>
            )}
        </div>
    );
}
