'use client';

import { Clock, ExternalLink, Trash2 } from 'lucide-react';
import type { Link } from '@/lib/types';
import { isHttpUrl } from '@/lib/url';
import { useEntitlement } from '@/components/EntitlementProvider';

/**
 * A save kept past the plan's monthly allowance (`status: 'waiting'`).
 *
 * The capture succeeded; only the AI read waits (functions/deferred_capture.py):
 * Machina reads it on the 1st, or right away once the workspace is Pro. So this
 * is a calm, saved-looking card, not an error: no red, no warning glyph, and no
 * Retry (a retry could only hit the same allowance). The one action besides
 * Delete is the way to have it read now, which opens the paywall. On Pro (whose
 * cap is an abuse ceiling) there is nothing to upgrade to, so the line just
 * says when.
 */
export default function WaitingCard({ link, onDelete }: { link: Link; onDelete: (id: string) => void }) {
    const { isPro, openPaywall } = useEntitlement();
    const host = (() => {
        try { return new URL(link.url).hostname.replace(/^www\./, ''); }
        catch { return link.url; }
    })();
    const isImage = link.sourceType === 'image';
    const image = isImage && isHttpUrl(link.url) ? link.url : null;
    const title = link.title || (isImage ? 'Screenshot' : host);

    return (
        <article
            data-status="waiting"
            className="surface-card animate-card-enter bg-card rounded-[20px] border border-border-subtle shadow-[var(--shadow-card)] relative flex flex-col h-full overflow-hidden"
        >
            {image && (
                <div className="relative w-full h-28 sm:h-32 bg-fill-subtle overflow-hidden">
                    <img src={image} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
                </div>
            )}
            <div className="p-4 sm:p-5 flex flex-col h-full space-y-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                    <span className="text-[10px] uppercase font-black tracking-widest text-text-muted">
                        Waiting to be read
                    </span>
                </div>

                <h3 dir="auto" className="font-bold text-base text-text leading-tight line-clamp-2">
                    {title}
                </h3>

                <p className="flex-grow text-sm text-text-secondary leading-snug">
                    {isPro ? (
                        'Saved. Machina will read it on the 1st.'
                    ) : (
                        <>
                            Saved. Machina will read it on the 1st, or{' '}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openPaywall('saves'); }}
                                className="font-semibold text-accent hover:underline underline-offset-2"
                            >
                                now with Pro
                            </button>
                            .
                        </>
                    )}
                </p>

                <div className="flex items-center gap-2 pt-2 mt-auto border-t border-border-subtle">
                    {!isImage && link.url ? (
                        isHttpUrl(link.url) ? (
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={link.url}
                                className="text-[11px] text-text-muted/70 truncate min-w-0 hover:text-accent transition-colors flex items-center gap-1"
                            >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{host}</span>
                            </a>
                        ) : (
                            <span className="text-[11px] text-text-muted/70 truncate min-w-0 flex items-center gap-1">
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{host}</span>
                            </span>
                        )
                    ) : null}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(link.id); }}
                        aria-label="Delete"
                        className="ms-auto p-1.5 rounded-full text-text-muted hover:text-red-500 transition-all shrink-0"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </article>
    );
}
