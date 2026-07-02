'use client';

import { useState } from 'react';
import { CheckCircle2, Link as LinkIcon, Globe } from 'lucide-react';

interface LinkScanProgressProps {
    /** The URL being analyzed (used to show the host + favicon). */
    url: string;
    /** 0–100. Drives the bar and the phase label. */
    progress: number;
}

// Phase label derived purely from progress, mirroring how the backend scrapes
// the page and then runs Gemini over it. Stateless — the parent owns progress.
function phaseFor(progress: number): string {
    if (progress >= 100) return 'Done!';
    if (progress >= 92) return 'Organizing & tagging…';
    if (progress >= 72) return 'Writing the summary…';
    if (progress >= 50) return 'Understanding the content…';
    if (progress >= 25) return 'Reading the page…';
    return 'Fetching the link…';
}

function hostOf(url: string): string {
    try {
        return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/**
 * "Reading your link" indicator: a scan line sweeps over a faux page preview
 * (favicon + host + skeleton lines) while an indeterminate bar and rotating
 * phase label convey calm forward motion — no fake percentage, since the
 * backend gives us no real progress to report (M6).
 */
export default function LinkScanProgress({ url, progress }: LinkScanProgressProps) {
    const clamped = Math.min(100, Math.max(0, progress));
    const done = clamped >= 100;
    const label = phaseFor(clamped);
    const host = hostOf(url);
    const [faviconOk, setFaviconOk] = useState(true);

    return (
        <div className="space-y-3">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-card">
                {/* Faux page being read */}
                <div className="absolute inset-0 p-4 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                        {faviconOk ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
                                alt=""
                                className="w-5 h-5 rounded"
                                onError={() => setFaviconOk(false)}
                            />
                        ) : (
                            <Globe className="w-5 h-5 text-text-muted" />
                        )}
                        <span className="text-xs font-medium text-text-secondary truncate max-w-[70%]">{host}</span>
                    </div>
                    {/* Skeleton title + body lines */}
                    <div className="h-3 w-3/4 rounded bg-white/10" />
                    <div className="h-2 w-full rounded bg-white/5" />
                    <div className="h-2 w-11/12 rounded bg-white/5" />
                    <div className="h-2 w-5/6 rounded bg-white/5" />
                    <div className="h-2 w-2/3 rounded bg-white/5" />
                </div>

                {/* Dim + subtle blur so the scan line and status read clearly */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

                {/* Sweeping scan line (hidden once complete) */}
                {!done && (
                    <div className="absolute inset-x-0 top-0 h-1/5 animate-scan-sweep pointer-events-none">
                        <div className="w-full h-full bg-gradient-to-b from-transparent via-accent/70 to-transparent" />
                        <div className="w-full h-px bg-accent shadow-[0_0_12px_2px_var(--accent)]" />
                    </div>
                )}

                {/* Center status — an icon + honest phase label. No fake %: we
                    can't read real progress from the backend, so we never claim a
                    number we can't back (M6). */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                    {done ? (
                        <CheckCircle2 className="w-10 h-10 text-green-400 animate-fade-in" />
                    ) : (
                        <LinkIcon className="w-8 h-8 text-accent" />
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
                aria-label="Link analysis progress"
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
