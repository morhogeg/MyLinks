'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

/** An optional one-tap follow-through on a confirmation ("Saved as a card" →
    "Open"). Tapping it dismisses the toast and runs `onClick`. */
export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastItem {
    id: number;
    message: string;
    variant: ToastVariant;
    action?: ToastAction;
}

interface ToastContextValue {
    success: (message: string, action?: ToastAction) => void;
    error: (message: string, action?: ToastAction) => void;
    info: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Lightweight toast notifications. No external dependency — reuses the
 * existing animate-slide-up/fade-in keyframes and lucide icons.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const remove = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const push = useCallback((message: string, variant: ToastVariant, action?: ToastAction) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, variant, action }]);
    }, []);

    // Stable reference so consumers can safely list `toast` in effect deps.
    const value = useMemo<ToastContextValue>(() => ({
        success: (m, action) => push(m, 'success', action),
        error: (m, action) => push(m, 'error', action),
        info: (m, action) => push(m, 'info', action),
    }), [push]);

    // Errors interrupt (an assertive alert region); confirmations wait their
    // turn (a polite status region). Both regions stay mounted while empty, so
    // a screen reader is already listening when a toast lands in one.
    const errors = toasts.filter((t) => t.variant === 'error');
    const others = toasts.filter((t) => t.variant !== 'error');
    const region = 'w-full flex flex-col items-center gap-2';

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center w-[calc(100%-2rem)] max-w-sm pointer-events-none"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div role="alert" aria-live="assertive" className={region}>
                    {errors.map((t) => (
                        <Toast key={t.id} item={t} onDismiss={remove} />
                    ))}
                </div>
                <div role="status" aria-live="polite" className={`${region} ${errors.length && others.length ? 'mt-2' : ''}`}>
                    {others.map((t) => (
                        <Toast key={t.id} item={t} onDismiss={remove} />
                    ))}
                </div>
            </div>
        </ToastContext.Provider>
    );
}

// Success uses the SAME mark as the app's completed states — a bare accent
// check (no circle), matching the save-step checkmarks — for one design language.
const VARIANTS: Record<ToastVariant, { icon: typeof Info; accent: string; strokeWidth?: number }> = {
    success: { icon: Check, accent: 'text-accent', strokeWidth: 3 },
    error: { icon: AlertCircle, accent: 'text-danger' },
    info: { icon: Info, accent: 'text-accent' },
};

/** After a pause, a toast always gets at least this long to be read again. */
const RESUME_MIN_MS = 1500;

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
    // Errors linger a bit longer since they may need action; everything else is
    // brief — a confirmation shouldn't hang around after it's been read. A toast
    // carrying an action (Undo, Open) gets the longest beat: it is asking to be
    // tapped, and 4.5s was too short to read it and reach it.
    const duration = item.action ? 8000 : item.variant === 'error' ? 6000 : 2400;
    // Held open while the pointer is on it or focus is in it, so reaching for
    // Undo (or reading slowly, or tabbing to it) never races the timer.
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const paused = hovered || focused;
    const remainingRef = useRef(duration);

    useEffect(() => {
        if (paused) return;
        const started = Date.now();
        const timer = setTimeout(() => onDismiss(item.id), remainingRef.current);
        return () => {
            clearTimeout(timer);
            remainingRef.current = Math.max(RESUME_MIN_MS, remainingRef.current - (Date.now() - started));
        };
    }, [paused, item.id, onDismiss]);

    const { icon: Icon, accent, strokeWidth } = VARIANTS[item.variant];

    return (
        <div
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
            className="pointer-events-auto w-full flex items-start gap-3 bg-card border border-border-strong rounded-xl px-4 py-3 shadow-2xl backdrop-blur-lg animate-slide-up"
        >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${accent}`} strokeWidth={strokeWidth} aria-hidden="true" />
            <p className="flex-1 text-sm text-text leading-snug">{item.message}</p>
            {item.action && (
                <button
                    type="button"
                    onClick={() => { item.action?.onClick(); onDismiss(item.id); }}
                    className="shrink-0 -my-0.5 px-2.5 py-1 rounded-lg text-sm font-bold text-accent hover:bg-accent/10 transition-colors"
                >
                    {item.action.label}
                </button>
            )}
            {/* 24px glyph, 44pt target: the ::after reaches the toast's edge and
                stops short of the action button. */}
            <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="relative p-1 -m-1 rounded-full text-text-muted hover:text-text transition-colors after:absolute after:-inset-y-2.5 after:-start-2 after:-end-3"
                aria-label="Dismiss notification"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return ctx;
}
