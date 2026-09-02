'use client';

/**
 * The one "Pro" pill. Marks a surface that belongs to Machina Pro (a locked
 * synthesis, a digest settings row, the YouTube note, the Settings plan row).
 * Tokens only: the wordmark's own `--accent-gradient` with `text-accent-ink`
 * on it, exactly like the capture button in BottomTabBar. Small enough to sit inside a row title without changing its
 * height; `aria-label` spells it out for screen readers.
 */
export default function ProBadge({ className = '' }: { className?: string }) {
    return (
        <span
            aria-label="Machina Pro"
            className={`inline-flex items-center shrink-0 h-[18px] px-1.5 rounded-full bg-[image:var(--accent-gradient)] text-accent-ink text-[10px] font-extrabold uppercase tracking-[0.08em] leading-none shadow-sm shadow-accent/20 ${className}`}
        >
            Pro
        </span>
    );
}
