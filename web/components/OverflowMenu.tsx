'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface OverflowMenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
}

/**
 * A trigger (⋯) plus a portal dropdown anchored to that trigger's screen rect —
 * the same clipping-proof pattern the Collections gallery uses for its per-tile
 * menu, extracted so secondary/destructive actions can be tucked away out of the
 * primary chrome (Apple's overflow idiom) without any ancestor `overflow` or
 * stacking context cutting the menu off.
 */
export default function OverflowMenu({
    items,
    ariaLabel = 'More actions',
    className = '',
}: {
    items: OverflowMenuItem[];
    ariaLabel?: string;
    className?: string;
}) {
    const [rect, setRect] = useState<DOMRect | null>(null);

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRect((cur) => (cur ? null : (e.currentTarget as HTMLElement).getBoundingClientRect()));
    };

    return (
        <>
            <button
                type="button"
                onClick={toggle}
                aria-label={ariaLabel}
                aria-haspopup="menu"
                aria-expanded={!!rect}
                className={`inline-flex items-center justify-center w-9 h-9 rounded-full border border-border-subtle text-text-secondary bg-card hover:text-text hover:bg-card-hover transition-colors ${className}`}
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>
            {rect && <Menu anchor={rect} items={items} onClose={() => setRect(null)} ariaLabel={ariaLabel} />}
        </>
    );
}

function Menu({
    anchor, items, onClose, ariaLabel,
}: {
    anchor: DOMRect;
    items: OverflowMenuItem[];
    onClose: () => void;
    ariaLabel: string;
}) {
    const WIDTH = 184;
    const estH = items.length * 46 + 8;

    // Right-align to the trigger; flip above when there isn't room below.
    const left = Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8));
    const flipUp = anchor.bottom + 6 + estH > window.innerHeight - 8 && anchor.top > estH;
    const vertical = flipUp
        ? { bottom: window.innerHeight - anchor.top + 6 }
        : { top: anchor.bottom + 6 };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onScroll = () => onClose();
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [onClose]);

    return createPortal(
        <>
            <div className="fixed inset-0 z-[90]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
            <div
                role="menu"
                aria-label={ariaLabel}
                style={{ position: 'fixed', left, width: WIDTH, ...vertical }}
                className="z-[91] rounded-xl bg-card border border-border-strong shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {items.map((item) => (
                    <button
                        key={item.label}
                        role="menuitem"
                        onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-3 min-h-[44px] text-sm font-medium transition-colors ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text hover:bg-fill-subtle'}`}
                    >
                        <span className="shrink-0">{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </div>
        </>,
        document.body,
    );
}
