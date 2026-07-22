'use client';

import { useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LINK_SCAN_STEPS, linkScanStepIndex } from '@/lib/scanPhases';
import WorkingRing from '@/components/ui/WorkingRing';

interface LinkScanProgressProps {
    /** The URL being analyzed (used to show the host + favicon). */
    url: string;
    /** 0–100. Drives which phase is active. */
    progress: number;
}

function hostOf(url: string): string {
    try {
        return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/**
 * "Reading your link" — a compact, honest stepper. One spinning ring (the shared
 * `WorkingRing`) rides the active phase; finished phases collapse to an airy
 * accent checkmark (no circle); upcoming phases show a hollow dot. The phases
 * come from the shared `scanPhases` source, so this and the persistent
 * `AnalyzingBanner` never disagree — including on a share-sheet capture.
 *
 * The step timing is simulated (the backend reports no true progress — M6); the
 * parent owns the `progress` value.
 */
export default function LinkScanProgress({ url, progress }: LinkScanProgressProps) {
    const clamped = Math.min(100, Math.max(0, progress));
    const done = clamped >= 100;
    // When complete, every step reads as done (active index past the last step).
    const active = done ? LINK_SCAN_STEPS.length : linkScanStepIndex(clamped);
    const host = hostOf(url);
    const [faviconOk, setFaviconOk] = useState(true);

    return (
        <div className="space-y-4">
            {/* What's being read */}
            <div className="flex items-center gap-2.5 pb-3 border-b border-border-subtle">
                {faviconOk ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
                        alt=""
                        className="w-6 h-6 rounded"
                        onError={() => setFaviconOk(false)}
                    />
                ) : (
                    <Globe className="w-6 h-6 text-text-muted" />
                )}
                <span className="text-sm font-medium text-text-secondary truncate">{host}</span>
            </div>

            {/* The phases, as an advancing checklist */}
            <ol className="flex flex-col" aria-label="Link analysis progress" aria-busy={!done}>
                {LINK_SCAN_STEPS.map((label, i) => {
                    const state = i < active ? 'done' : i === active ? 'active' : 'pending';
                    return (
                        <li key={label} className="flex items-center gap-3 py-1.5">
                            <span className="relative w-5 h-5 shrink-0 grid place-items-center">
                                {state === 'active' ? (
                                    <WorkingRing size={20} />
                                ) : state === 'done' ? (
                                    <Check className="w-[15px] h-[15px] text-accent animate-fade-in" strokeWidth={3} />
                                ) : (
                                    <span className="w-[15px] h-[15px] rounded-full border-[1.5px] border-border-strong" />
                                )}
                            </span>
                            <span
                                className={`text-sm ${
                                    state === 'active'
                                        ? 'text-text font-semibold'
                                        : state === 'done'
                                          ? 'text-text-secondary'
                                          : 'text-text-muted'
                                }`}
                            >
                                {label}
                            </span>
                        </li>
                    );
                })}
            </ol>

            {/* The request keeps running after this dialog closes — AddLinkForm
                stays mounted and publishes progress to the persistent
                AnalyzingBanner. Only quitting/backgrounding the whole app
                suspends the WebView and loses the save, so invite closing the
                dialog (not the app). */}
            {!done && (
                <p className="text-xs text-text-muted text-center">
                    You can close this window — Machina keeps working in the background.
                </p>
            )}
        </div>
    );
}
