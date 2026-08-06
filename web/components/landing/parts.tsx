'use client';

import { Globe, Image as ImageIcon, StickyNote, MessageCircle, Compass } from 'lucide-react';
import { platformIcon, platformColor, type PlatformKey } from '@/lib/platform';
import type { DemoCard, DemoKind } from './demoData';

/**
 * Shared visual primitives for the landing scenes.
 *
 * The platform marks are the APP'S marks — `platformIcon` / `platformColor`
 * from `lib/platform.tsx`, the same functions the feed and the source byline
 * call — rather than redrawn lookalikes. That is deliberate: this page shows a
 * mock of the product, and the fastest way for a mock to start lying is for its
 * iconography to drift from the real thing. Only the three kinds the app has no
 * platform for (a plain page, a screenshot, a note to yourself) are drawn here,
 * with lucide marks matching the app's own choices for those cases.
 *
 * The brand colours on third-party marks are the platforms' own identities and
 * are not a violation of Lumen's "no hue accent" rule — Machina's accent stays
 * neutral porcelain/graphite everywhere on this page. The app makes the same
 * distinction.
 */

const PLATFORM_KINDS = new Set<DemoKind>(['instagram', 'x', 'youtube']);

/** The mark for a save's origin, tinted with that platform's own colour. */
export function KindMark({ kind, className = 'w-3.5 h-3.5' }: {
    kind: DemoKind | 'whatsapp' | 'safari';
    className?: string;
}) {
    if (PLATFORM_KINDS.has(kind as DemoKind)) {
        const key = kind as PlatformKey;
        return (
            <span style={{ color: platformColor(key) }} className="inline-flex">
                {platformIcon(key, className)}
            </span>
        );
    }
    // The kinds with no platform. These stay in `--text-muted` rather than
    // inventing a brand colour for "a note you wrote yourself".
    const Icon =
        kind === 'shot' ? ImageIcon
            : kind === 'note' ? StickyNote
                : kind === 'whatsapp' ? MessageCircle
                    : kind === 'safari' ? Compass
                        : Globe;
    return <Icon className={`${className} text-text-muted`} aria-hidden />;
}

/** A category / tag pill. `solid` marks the category, which outranks its tags. */
export function Chip({ children, solid = false }: {
    children: React.ReactNode;
    solid?: boolean;
}) {
    return (
        <span
            className={
                solid
                    ? 'inline-flex items-center rounded-full bg-fill-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text'
                    : 'inline-flex items-center rounded-full bg-fill-subtle px-2 py-0.5 text-[11px] text-text-secondary'
            }
        >
            {children}
        </span>
    );
}

/**
 * A saved card, as the feed renders one: source byline, title, summary, then
 * the category and tags the pipeline produced. `compact` is the shelf variant.
 */
export function CardView({ card, compact = false, className = '' }: {
    card: DemoCard;
    compact?: boolean;
    className?: string;
}) {
    return (
        <article
            className={
                'rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-card)] '
                + (compact ? 'p-4 ' : 'p-5 ') + className
            }
        >
            <div className="flex items-center gap-1.5">
                <KindMark kind={card.kind} className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate text-[11px] text-text-muted">{card.source}</span>
            </div>
            <h4 className={`mt-2 font-semibold text-text ${compact ? 'text-sm' : 'text-base'}`}>
                {card.title}
            </h4>
            <p className={`mt-1.5 leading-relaxed text-text-secondary ${compact ? 'text-xs' : 'text-[13px]'}`}>
                {card.summary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Chip solid>{card.category}</Chip>
                {card.tags.slice(0, compact ? 2 : 3).map((t) => (
                    <Chip key={t}>{t}</Chip>
                ))}
            </div>
        </article>
    );
}

/**
 * The segmented control the capture scene switches sources with.
 *
 * A real control, not a decorative one: it is a `radiogroup`, arrow keys move
 * between options, and the selected option is announced. The landing page is
 * the one surface guaranteed to be opened by people using a keyboard and a
 * screen reader to evaluate the product.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: {
    options: { id: T; label: string }[];
    value: T;
    onChange: (id: T) => void;
    label: string;
}) {
    const move = (dir: 1 | -1) => {
        const i = options.findIndex((o) => o.id === value);
        onChange(options[(i + dir + options.length) % options.length].id);
    };
    return (
        <div
            role="radiogroup"
            aria-label={label}
            className="inline-flex rounded-full border border-border-subtle bg-fill-subtle p-1"
            onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            }}
        >
            {options.map((o) => {
                const on = o.id === value;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onChange(o.id)}
                        className={
                            'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-200 '
                            + (on
                                ? 'bg-accent text-accent-ink shadow-sm'
                                : 'text-text-secondary hover:text-text')
                        }
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
