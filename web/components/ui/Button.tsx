'use client';

import React from 'react';

/**
 * Shared button primitives — the single source of truth for the app's button
 * language. Modeled on the well-tuned controls in the Reader toolbar and the
 * Feed toolbar's `ctrlBase`/`ctrlIdle` look: rounded-xl surfaces, card+border
 * for idle controls, an accent fill for primary actions, consistent 36px+ touch
 * targets, and an accent focus ring. All variants are RTL-safe (no hard-coded
 * left/right; callers use ps/pe, ms/me as needed).
 *
 * Use `Button` for labelled actions and `IconButton` for square, icon-only
 * controls (back chevrons, toolbar icons, etc.).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';
export type ButtonRadius = 'xl' | 'full';

const SIZE: Record<ButtonSize, string> = {
    // Heights keep every control on a shared 36px (h-9) / 32px (h-8) baseline.
    sm: 'h-8 px-2.5 text-[13px] gap-1.5',
    md: 'h-9 px-3 text-sm gap-1.5',
};

const ICON_SIZE: Record<ButtonSize, string> = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
};

const RADIUS: Record<ButtonRadius, string> = {
    xl: 'rounded-xl',
    full: 'rounded-full',
};

// Variant looks. `secondary`/`ghost` fold in the exact Feed `ctrlIdle` treatment
// so nothing regresses where those constants were used.
const VARIANT: Record<ButtonVariant, string> = {
    primary:
        'bg-accent text-white shadow-sm shadow-accent/20 hover:bg-accent-hover',
    secondary:
        'bg-card border border-border-subtle text-text-secondary hover:bg-card-hover hover:text-text hover:border-text-muted/40',
    ghost:
        'text-text-secondary hover:text-text hover:bg-card-hover',
    danger:
        'bg-card border border-border-subtle text-red-400 hover:bg-red-500/10 hover:border-red-500/40',
};

const BASE =
    'inline-flex items-center justify-center font-semibold select-none cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    radius?: ButtonRadius;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'md', radius = 'xl', className = '', type, children, ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type ?? 'button'}
            className={`${BASE} ${SIZE[size]} ${RADIUS[radius]} ${VARIANT[variant]} ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    radius?: ButtonRadius;
    /** Icon-only buttons must carry an accessible label. */
    'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    { variant = 'secondary', size = 'md', radius = 'xl', className = '', type, children, ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type ?? 'button'}
            className={`${BASE} ${ICON_SIZE[size]} ${RADIUS[radius]} ${VARIANT[variant]} ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
});

export default Button;
