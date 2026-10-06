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

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                role="status"
                aria-live="polite"
            >
                {toasts.map((t) => (
                    <Toast key={t.id} item={t} onDismiss={() => remove(t.id)} />
                ))}
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

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
    // A confirmation is brief: it shouldn't hang around after it's been read.
    // Errors linger longer. A toast carrying an action ("Undo", "Open") stays
    // 8 s: it is asking to be tapped, and 4.5 s was too short to reach it
    // (WCAG 2.2.1). Hovering or focusing a toast pauses it.
    const duration = item.action ? 8000 : item.variant === 'error' ? 6000 : 2400;
    const [paused, setPaused] = useState(false);
    // Time left, carried across pauses and across re-renders (the provider
    // hands a fresh onDismiss each render, which re-runs the effect).
    const remaining = useRef(duration);

    useEffect(() => {
        if (paused) return;
        const started = Date.now();
        const timer = setTimeout(onDismiss, Math.max(0, remaining.current));
        return () => {
            clearTimeout(timer);
            remaining.current -= Date.now() - started;
        };
    }, [paused, onDismiss]);

    const { icon: Icon, accent, strokeWidth } = VARIANTS[item.variant];

    return (
        <div
            // An error interrupts (assertive); everything else waits its turn
            // in the polite region around the stack.
            role={item.variant === 'error' ? 'alert' : undefined}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false); }}
            className="pointer-events-auto w-full flex items-start gap-3 bg-card border border-border-strong rounded-xl px-4 py-3 shadow-2xl backdrop-blur-lg animate-slide-up"
        >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${accent}`} strokeWidth={strokeWidth} aria-hidden="true" />
            <p className="flex-1 text-sm text-text leading-snug">{item.message}</p>
            {item.action && (
                <button
                    type="button"
                    onClick={() => { item.action?.onClick(); onDismiss(); }}
                    className="shrink-0 -my-0.5 px-2.5 py-1 rounded-lg text-sm font-bold text-accent hover:bg-accent/10 transition-colors"
                >
                    {item.action.label}
                </button>
            )}
            <button
                type="button"
                onClick={onDismiss}
                className="relative p-1 -m-1 rounded-full text-text-muted hover:text-text transition-colors after:absolute after:-inset-2.5 after:content-['']"
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
