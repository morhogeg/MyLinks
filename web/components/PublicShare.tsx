'use client';

import { SharedCard } from '@/lib/types';
import { ExternalLink } from 'lucide-react';
import { getCategoryColorStyle } from '@/lib/colors';

/** The Machina "M" mark (monochrome app icon), tints via currentColor. */
export function MachinaMark({ className = '' }: { className?: string }) {
    return (
        <svg viewBox="15 17 70 70" className={className} fill="none" aria-hidden="true">
            <path d="M24 74 L24 30 L50 54 L76 30 L76 74" stroke="currentColor"
                strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="54" r="6" fill="currentColor" />
        </svg>
    );
}

/**
 * Branded chrome for a public share page: a Machina header with a "Try it" CTA,
 * the title/subtitle slot, the children (card grid or single card), and a footer.
 * Standalone — used by the logged-out /c and /s routes.
 */
export function PublicShell({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-text">
            <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border-subtle">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between">
                    <a href="/" className="flex items-center gap-2.5">
                        <span className="relative w-9 h-9 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/15">
                            <MachinaMark className="w-[19px] h-[19px] text-white" />
                        </span>
                        <span className="text-lg font-extrabold tracking-tight bg-[image:var(--accent-gradient)] bg-clip-text text-transparent">
                            Machina AI
                        </span>
                    </a>
                    <a
                        href="/"
                        className="px-3.5 h-9 inline-flex items-center rounded-full bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover transition-colors"
                    >
                        Try Machina
                    </a>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-20">
                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-text">{title}</h1>
                    {subtitle && <p className="mt-2 text-text-secondary">{subtitle}</p>}
                </div>
                {children}
                <footer className="mt-12 pt-6 border-t border-border-subtle text-center text-sm text-text-muted">
                    Saved and summarized with{' '}
                    <a href="/" className="text-accent font-semibold hover:underline">Machina AI</a>
                    {' '}— capture, connect, recall.
                </footer>
            </main>
        </div>
    );
}

/** Read-only rendering of a single frozen SharedCard. */
export function SharedCardTile({ card }: { card: SharedCard }) {
    const colorStyle = card.category ? getCategoryColorStyle(card.category) : null;
    const hasLink = !!card.url && /^https?:\/\//.test(card.url);
    return (
        <article className="surface-card bg-card rounded-2xl border border-white/5 shadow-[var(--shadow-card)] overflow-hidden flex flex-col h-full">
            {card.thumbnailUrl && (
                <div className="relative w-full aspect-video bg-black/40 overflow-hidden">
                    <img src={card.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                </div>
            )}
            <div className="p-4 sm:p-5 flex flex-col gap-3 h-full">
                <div className="flex items-center justify-between gap-2">
                    {card.category && colorStyle && (
                        <span
                            className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-lg"
                            style={{ backgroundColor: colorStyle.backgroundColor, color: colorStyle.color }}
                        >
                            {card.category}
                        </span>
                    )}
                    {card.sourceName && (
                        <span className="text-[9px] font-bold text-text-muted/60 uppercase tracking-widest truncate max-w-[160px]">
                            {card.sourceName}
                        </span>
                    )}
                </div>

                <h3 className="font-bold text-base sm:text-lg text-text leading-tight" dir="auto">{card.title}</h3>

                {card.summary && (
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line flex-grow" dir="auto">
                        {card.summary}
                    </p>
                )}

                {(card.tags?.length || hasLink) && (
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                            {(card.tags ?? []).slice(0, 4).map((tag) => (
                                <span key={tag} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/5 text-text-muted/60">
                                    {tag.split('/').pop()}
                                </span>
                            ))}
                        </div>
                        {hasLink && (
                            <a
                                href={card.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open source"
                                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                            >
                                Source <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}

/** Centered status (loading / not found) for the public pages. */
export function PublicStatus({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-text flex flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="w-12 h-12 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/20">
                <MachinaMark className="w-7 h-7 text-white" />
            </span>
            <div className="text-text-secondary">{children}</div>
            <a href="/" className="mt-2 px-4 h-10 inline-flex items-center rounded-full bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors">
                Go to Machina
            </a>
        </div>
    );
}
