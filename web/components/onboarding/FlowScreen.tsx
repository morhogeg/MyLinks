'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useVisualViewport } from '@/lib/useVisualViewport';

/**
 * The one layout every first-run screen uses.
 *
 * Sign-in used to hand off to three unrelated screens: a consent notice, a
 * welcome, and an eight-step tour, each with its own chrome. This is the single
 * frame all of them now share, so the sequence reads as one flow rather than
 * three interruptions:
 *
 *     [ icon ]  1 / 3                             Skip
 *
 *              (a framed visual, when the step has one)
 *
 *                       EYEBROW
 *                   One clear headline
 *              One supporting line beneath it.
 *
 *              (the step's own content: rows, choices)
 *
 *              (dots)   [ one primary action ]
 *
 * The geometry is the tour's, because that was already the best of the three:
 * a capped measure, the viewport's real height (so the iOS keyboard and the
 * home indicator are both respected), a body that scrolls on a short screen
 * while the header and footer stay put, and safe-area padding on every side.
 *
 * Theme tokens only, and logical properties throughout, so it is correct in
 * dark mode and under `dir="rtl"` without a second code path.
 */
export function FlowScreen({
    overlay = false,
    icon,
    counter,
    onSkip,
    skipLabel = 'Skip',
    label,
    visual,
    eyebrow,
    title,
    body,
    children,
    footer,
    /** Replays the body's enter animation when it changes (a step index). */
    animationKey,
    ...rest
}: {
    /** True for a screen that sits ON TOP of the app (the replayable tour). */
    overlay?: boolean;
    icon: ReactNode;
    counter?: string;
    onSkip?: () => void;
    skipLabel?: string;
    /** Accessible name for the screen. */
    label: string;
    visual?: ReactNode;
    eyebrow: string;
    title: string;
    body?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    animationKey?: string | number;
    onTouchStart?: (e: React.TouchEvent) => void;
    onTouchEnd?: (e: React.TouchEvent) => void;
}) {
    const vp = useVisualViewport();
    return (
        <div
            className={overlay
                ? 'fixed inset-0 z-[100] bg-background text-text animate-fade-in'
                : 'min-h-screen bg-background text-text'}
            {...(overlay ? { role: 'dialog', 'aria-modal': true, 'aria-label': label } : {})}
        >
            <div
                className="flex flex-col mx-auto w-full max-w-md"
                style={{
                    height: vp.height ? vp.height : '100dvh',
                    paddingTop: 'max(env(safe-area-inset-top), 12px)',
                    paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
                    paddingInline: '20px',
                }}
                {...rest}
            >
                {/* Top bar: where you are, and the way out when there is one. */}
                <div className="flex items-center justify-between shrink-0 pt-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                            {icon}
                        </div>
                        {counter && (
                            <span className="text-[11px] font-semibold tracking-wide text-text-muted tabular-nums">
                                {counter}
                            </span>
                        )}
                    </div>
                    {onSkip && (
                        <button
                            onClick={onSkip}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12.5px] font-semibold text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                            aria-label={skipLabel}
                        >
                            {skipLabel}
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Body: visual, copy, then whatever this step asks of the user. */}
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-y-auto py-4">
                    <div key={animationKey} className="w-full flex flex-col items-center animate-slide-up">
                        {visual && (
                            <div className="w-full max-w-[340px] flex items-center justify-center">
                                {visual}
                            </div>
                        )}
                        <p className={`${visual ? 'mt-7' : ''} text-[11px] font-bold uppercase tracking-[0.14em] text-accent`}>
                            {eyebrow}
                        </p>
                        <h2 className="mt-2 text-[22px] font-extrabold tracking-tight text-text text-center leading-tight">
                            {title}
                        </h2>
                        {body && (
                            <p className="mt-2.5 text-[14px] text-text-secondary text-center leading-relaxed max-w-[320px]">
                                {body}
                            </p>
                        )}
                        {children && <div className="w-full mt-6">{children}</div>}
                    </div>
                </div>

                {footer && <div className="shrink-0">{footer}</div>}
            </div>
        </div>
    );
}

/**
 * The framed row every first-run list is built from: an accent tile, a title, a
 * line of explanation. The same anatomy as the tour's mock cards, so a list of
 * facts (the consent screen) and a list of choices (the welcome screen) sit in
 * one visual family. `badge` carries an optional note; `n` numbers a step.
 */
export function FlowRow({
    icon, title, body, badge, n, onClick, active, trailing,
}: {
    icon: ReactNode;
    title: string;
    body: string;
    badge?: string;
    /** Step number, for an ordered how-to. */
    n?: number;
    onClick?: () => void;
    active?: boolean;
    trailing?: ReactNode;
}) {
    const shell = `w-full flex items-start gap-3.5 rounded-2xl border p-4 text-start ${
        onClick
            ? `cursor-pointer transition-colors ${active
                ? 'border-accent/60 bg-accent/8'
                : 'border-border-subtle bg-card hover:bg-card-hover'}`
            : 'border-border-subtle bg-card'
    }`;
    const inner = (
        <>
            <div className="relative shrink-0 w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                {icon}
                {n !== undefined && (
                    <span className="absolute -top-1.5 -start-1.5 w-4 h-4 rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center ring-2 ring-background tabular-nums">
                        {n}
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text leading-snug flex items-center gap-2">
                    {title}
                    {badge && (
                        <span className="shrink-0 rounded-full bg-accent/12 text-accent text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 ring-1 ring-accent/20">
                            {badge}
                        </span>
                    )}
                </h3>
                <p className="mt-0.5 text-[13px] text-text-secondary leading-relaxed">{body}</p>
            </div>
            {trailing}
        </>
    );
    return onClick
        ? <button onClick={onClick} className={shell}>{inner}</button>
        : <div className={shell}>{inner}</div>;
}
