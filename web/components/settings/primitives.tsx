'use client';

import { useState, useEffect, useRef, Children } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { hapticSelection } from '@/lib/haptics';

/* ============================ PRIMITIVES ============================ */

const TILE_BASE = 'w-[29px] h-[29px] rounded-[7px] flex items-center justify-center text-white shrink-0';

export function LargeTitle({ children }: { children: ReactNode }) {
    return <h1 className="text-[28px] font-extrabold tracking-[-0.024em] text-text px-1 mb-2 leading-tight">{children}</h1>;
}

export function SectionHeader({ children, first }: { children: ReactNode; first?: boolean }) {
    return (
        <div className={`text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted px-1.5 pb-1.5 ${first ? 'pt-2' : 'pt-[34px]'}`}>
            {children}
        </div>
    );
}

export function Footnote({ children }: { children: ReactNode }) {
    return <p className="text-[12.5px] text-text-muted leading-snug px-2 pt-1.5">{children}</p>;
}

/** Rounded grouped container with inset hairline dividers between rows. `tight`
    insets the divider to the text (rows without a leading tile). */
export function List({ children, tight }: { children: ReactNode; tight?: boolean }) {
    const items = Children.toArray(children).filter(Boolean);
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card overflow-hidden">
            {items.map((child, i) => (
                <div key={i} className="relative">
                    {i > 0 && <div className={`absolute top-0 right-0 h-px bg-border-subtle ${tight ? 'left-[15px]' : 'left-[54px]'}`} />}
                    {child}
                </div>
            ))}
        </div>
    );
}

export function RowShell({
    tile, tileClass, onClick, children, className,
}: {
    tile?: ReactNode;
    tileClass?: string;
    onClick?: () => void;
    children: ReactNode;
    className?: string;
}) {
    const cls = `w-full flex items-center gap-3 px-[14px] min-h-[46px] text-left ${onClick ? 'hover:bg-card-hover transition-colors cursor-pointer' : ''} ${className || ''}`;
    const inner = (
        <>
            {tile && <span className={`${TILE_BASE} ${tileClass || 'bg-accent'}`}>{tile}</span>}
            {children}
        </>
    );
    return onClick ? <button onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}

export function RowText({ title, sub }: { title: string; sub?: string }) {
    return (
        <div className="flex-1 min-w-0 py-[11px]">
            <div className="text-[16px] text-text tracking-[-0.01em] leading-tight">{title}</div>
            {sub && <div className="text-[12.5px] text-text-muted mt-1 leading-snug">{sub}</div>}
        </div>
    );
}

export function Chevron() {
    return <ChevronRight className="w-[18px] h-[18px] text-text-muted/60 shrink-0" />;
}

export function NavRow({ tile, tileClass, title, value, onClick }: { tile?: ReactNode; tileClass?: string; title: string; value?: string; onClick: () => void }) {
    return (
        <RowShell tile={tile} tileClass={tileClass} onClick={onClick}>
            <RowText title={title} />
            {value && <span className="ml-auto text-[15px] text-text-muted whitespace-nowrap tabular-nums">{value}</span>}
            <Chevron />
        </RowShell>
    );
}

export function ExternalRow({ title, onClick }: { title: string; onClick: () => void }) {
    return (
        <RowShell tile={<ShieldCheck className="w-[16px] h-[16px]" />} tileClass="bg-slate-500" onClick={onClick}>
            <RowText title={title} />
            <ExternalLink className="ml-auto w-[15px] h-[15px] text-text-muted/60 shrink-0" />
        </RowShell>
    );
}

export function TopicGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/70 px-0.5">{label}</div>
            <div className="flex flex-wrap gap-2.5">{children}</div>
        </div>
    );
}

export function TopicPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card-hover border-border-subtle text-text-secondary hover:text-text hover:border-text-muted/40'}`}
        >
            {active && <Check className="w-3 h-3" strokeWidth={3} />}
            {label}
        </button>
    );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    // iOS spec: 51×31 track, 27px knob, 2px inset → 20px travel. The knob nearly
    // fills the track height so there's no visible gap on the sides.
    return (
        <button
            onClick={onChange}
            role="switch"
            aria-checked={on}
            className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${on ? 'bg-accent' : 'bg-text-muted/30'}`}
        >
            <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_2px_5px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-out ${on ? 'translate-x-[20px]' : 'translate-x-0'}`} />
        </button>
    );
}

export function Segmented<T extends string>({ value, options, onChange, iconOnly = false, widthClass }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; iconOnly?: boolean; widthClass?: string }) {
    return (
        <div className={`flex items-center gap-1 p-1 rounded-2xl bg-card-hover border border-border-subtle ml-auto ${iconOnly ? '' : (widthClass || 'w-full')}`}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        onClick={() => onChange(o.value)}
                        aria-label={iconOnly ? o.label : undefined}
                        title={iconOnly ? o.label : undefined}
                        className={`inline-flex items-center justify-center gap-1.5 h-9 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${iconOnly ? 'w-10' : 'flex-1'} ${active ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text'}`}
                    >
                        {o.icon}
                        {!iconOnly && o.label}
                    </button>
                );
            })}
        </div>
    );
}

const ITEM_H = 36;

/** iOS-style drum wheel. Scroll-snaps under the centered selection band; commits
    the settled index a beat after scrolling stops. */
export function Wheel({ items, index, onChange, className }: { items: string[]; index: number; onChange: (i: number) => void; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(index);
    // Detent the finger has last rolled onto — drives the per-tick haptic without
    // depending on `active` state (which lags a render behind the scroll event).
    const detent = useRef(index);

    // Center the initial selection once, on mount.
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = index * ITEM_H;
        setActive(index);
        detent.current = index;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let t: ReturnType<typeof setTimeout>;
        const onScroll = () => {
            const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
            if (i !== detent.current) {
                detent.current = i;
                setActive(i);
                hapticSelection();   // a crisp tick as each value rolls under the band
            }
            clearTimeout(t);
            t = setTimeout(() => { if (i !== index) onChange(i); }, 130);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => { el.removeEventListener('scroll', onScroll); clearTimeout(t); };
    }, [items.length, index, onChange]);

    return (
        <div
            ref={ref}
            className={`h-[180px] overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch] [mask-image:linear-gradient(180deg,transparent,#000_26%,#000_74%,transparent)] [-webkit-mask-image:linear-gradient(180deg,transparent,#000_26%,#000_74%,transparent)] ${className || ''}`}
        >
            <div className="h-[72px]" />
            {items.map((it, i) => (
                <div
                    key={i}
                    className={`h-[36px] snap-center flex items-center justify-center text-[22px] tabular-nums tracking-[-0.01em] transition-colors ${i === active ? 'text-text font-semibold' : 'text-text-muted'}`}
                >
                    {it}
                </div>
            ))}
            <div className="h-[72px]" />
        </div>
    );
}
