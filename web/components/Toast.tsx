'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastContextValue {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
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

    const push = useCallback((message: string, variant: ToastVariant) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, variant }]);
    }, []);

    // Stable reference so consumers can safely list `toast` in effect deps.
    const value = useMemo<ToastContextValue>(() => ({
        success: (m) => push(m, 'success'),
        error: (m) => push(m, 'error'),
        info: (m) => push(m, 'info'),
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
    error: { icon: AlertCircle, accent: 'text-red-400' },
    info: { icon: Info, accent: 'text-accent' },
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
    // Errors linger a bit longer since they may need action; everything else is
    // brief — a confirmation shouldn't hang around after it's been read.
    const duration = item.variant === 'error' ? 4500 : 2400;

    useEffect(() => {
        const timer = setTimeout(onDismiss, duration);
        return () => clearTimeout(timer);
    }, [duration, onDismiss]);

    const { icon: Icon, accent, strokeWidth } = VARIANTS[item.variant];

    return (
        <div className="pointer-events-auto w-full flex items-start gap-3 bg-card border border-border-strong rounded-xl px-4 py-3 shadow-2xl backdrop-blur-lg animate-slide-up">
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${accent}`} strokeWidth={strokeWidth} />
            <p className="flex-1 text-sm text-text leading-snug">{item.message}</p>
            <button
                type="button"
                onClick={onDismiss}
                className="p-1 -m-1 rounded-full text-text-muted hover:text-text transition-colors"
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
