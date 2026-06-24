'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
    value: string;
    label: string;
    /** Optional leading icon shown in the menu (and in the trigger when selected). */
    icon?: ReactNode;
}

interface DropdownProps {
    value: string;
    options: DropdownOption[];
    onChange: (value: string) => void;
    ariaLabel: string;
    /** Optional leading icon for the trigger; falls back to the selected option's icon. */
    leadingIcon?: ReactNode;
    className?: string;
    align?: 'left' | 'right';
}

/**
 * Accent-themed select replacement. Native <select> menus render their
 * highlight in the OS blue, which clashes with the app; this popover keeps
 * everything in our own colors and stays keyboard/click-out friendly.
 */
export default function Dropdown({
    value,
    options,
    onChange,
    ariaLabel,
    leadingIcon,
    className = '',
    align = 'left',
}: DropdownProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const selected = options.find(o => o.value === value);
    const triggerIcon = leadingIcon ?? selected?.icon;

    // Close on outside click or Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className={`h-9 inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 text-[13px] font-semibold cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 bg-card border text-text-secondary hover:bg-card-hover hover:text-text ${open ? 'border-accent/50 text-text' : 'border-border-subtle hover:border-text-muted/40'} ${className}`}
            >
                {triggerIcon && <span className="inline-flex shrink-0">{triggerIcon}</span>}
                <span className="whitespace-nowrap">{selected?.label ?? ''}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label={ariaLabel}
                    className={`absolute top-[calc(100%+6px)] z-50 min-w-[11rem] p-1 rounded-xl bg-card border border-border-subtle shadow-[var(--shadow-card)] animate-in fade-in zoom-in-95 duration-150 ${align === 'right' ? 'right-0' : 'left-0'}`}
                >
                    {options.map(opt => {
                        const active = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer transition-colors ${active ? 'bg-accent/10 text-accent font-semibold' : 'text-text-secondary hover:bg-card-hover hover:text-text'}`}
                            >
                                {opt.icon && <span className="inline-flex shrink-0 w-4 justify-center">{opt.icon}</span>}
                                <span className="flex-1 text-left whitespace-nowrap">{opt.label}</span>
                                {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
