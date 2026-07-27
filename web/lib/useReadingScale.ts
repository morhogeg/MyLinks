'use client';

import { useEffect } from 'react';

/**
 * Honour the reader's SYSTEM text-size preference for Machina's reading prose.
 *
 * WHY A PROBE, AND NOT `html { font-size: … }`
 * -------------------------------------------
 * The obvious implementation — scale the root font size from a setting — is
 * wrong for this codebase. Roughly half the type is hardcoded pixels
 * (`text-[11px]` ×54, `text-[13px]` ×50, `text-[15px]` ×27 …, 243 in total)
 * and the other half is Tailwind's rem scale (223). Moving the root size grows
 * the rem half and freezes the px half, so a summary would swell while its own
 * byline, chips and metadata stayed put. That breaks hierarchy rather than
 * enlarging text, which is worse than doing nothing.
 *
 * So the scale is scoped to the READING prose (see `.reading-prose` in
 * globals.css) — the card's summary and detailed summary, the text people
 * actually read at length. Chrome keeps its designed sizes.
 *
 * HOW THE PREFERENCE IS READ
 * --------------------------
 * On Apple platforms, `font: -apple-system-body` resolves to the user's
 * Dynamic Type body size — the one they set in Settings → Display & Brightness
 * → Text Size (or the larger Accessibility sizes). A WKWebView does NOT apply
 * that to ordinary CSS, so we measure it: render an off-screen probe with that
 * font shorthand, read its computed pixel size, and divide by the 17px that
 * shorthand resolves to at the default setting.
 *
 * Everywhere else the probe simply resolves to something near 16-17px and the
 * ratio lands at ~1, which is correct: desktop browsers already honour their
 * own zoom and default-font-size settings without help.
 */

/** `font: -apple-system-body` at the DEFAULT Dynamic Type setting, in px. */
const APPLE_BODY_BASELINE = 17;

/**
 * Clamp range. Dynamic Type's accessibility sizes go far past 2×, which would
 * turn a card summary into a few words per line and push its footer off-screen.
 * 1.35 is roughly the largest step that still leaves the detail card readable
 * in both EN and Hebrew; below 1 we never shrink, because a reader who chose a
 * smaller system size is not asking Machina to become unreadable.
 */
const MIN_SCALE = 1;
const MAX_SCALE = 1.35;

function measure(): number {
    if (typeof document === 'undefined') return 1;
    const probe = document.createElement('div');
    // `font` shorthand — the whole point. Setting only font-size would not pick
    // up Dynamic Type.
    probe.style.font = '-apple-system-body';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    if (!isFinite(px) || px <= 0) return 1;
    const raw = px / APPLE_BODY_BASELINE;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

/**
 * Publish the measured scale as `--reading-scale` on the document element.
 * Re-measures on foreground: Dynamic Type can be changed in iOS Settings while
 * Machina is backgrounded, and the app is not reloaded on return.
 */
export function useReadingScale(): void {
    useEffect(() => {
        const apply = () => {
            const scale = measure();
            document.documentElement.style.setProperty('--reading-scale', String(scale));
        };
        apply();
        const onVisible = () => {
            if (document.visibilityState === 'visible') apply();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', apply);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', apply);
        };
    }, []);
}
