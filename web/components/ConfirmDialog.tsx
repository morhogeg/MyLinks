'use client';

import { X, AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { hapticWarning, hapticMedium } from '@/lib/haptics';
import { useScrollLock } from '@/lib/useScrollLock';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    /** Optional content under the message (notes, secondary links). */
    extra?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'info';
    /** The confirmed action is running: keep the dialog up (showing
     *  `confirmLabel`, e.g. "Deleting…") and refuse every way out. */
    busy?: boolean;
}

/**
 * Custom branded confirmation dialog
 * Matches the Machina dark aesthetic
 */
export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    extra,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    busy = false,
}: ConfirmDialogProps) {
    const titleId = useId();
    const messageId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);
    // Focus the safe choice when the dialog opens (VoiceOver and keyboard
    // land inside it, on Cancel rather than on the destructive action).
    useEffect(() => {
        if (isOpen) cancelRef.current?.focus({ preventScroll: true });
    }, [isOpen]);
    const close = () => { if (!busy) onClose(); };
    // Busy-guard: a fast double-tap on Confirm must run the action once, not
    // twice (the dialog stays mounted for a frame after onConfirm fires). Reset
    // each time the dialog opens.
    const confirmedRef = useRef(false);
    useEffect(() => {
        if (isOpen) confirmedRef.current = false;
    }, [isOpen]);

    const handleConfirm = () => {
        if (busy || confirmedRef.current) return;
        confirmedRef.current = true;
        // A destructive confirm gets a warning buzz; an info confirm a lighter tap.
        if (variant === 'danger') hapticWarning();
        else hapticMedium();
        onConfirm();
        onClose();
    };

    // Handle Escape key to close
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose, busy]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={close}
            />

            {/* Dialog */}
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                aria-busy={busy || undefined}
                className="relative bg-card w-full max-w-md rounded-2xl border border-border-subtle shadow-2xl p-6 overflow-hidden animate-scale-up"
            >
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                    <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${variant === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-accent/10 text-accent'
                        }`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 id={titleId} className="text-xl font-bold text-text leading-tight">
                            {title}
                        </h3>
                        <p id={messageId} className="mt-2 text-text-secondary text-sm leading-relaxed">
                            {message}
                        </p>
                        {extra}
                    </div>
                    <button
                        onClick={close}
                        disabled={busy}
                        aria-label="Close"
                        className="relative p-1 hover:bg-fill-subtle rounded-full text-text-muted transition-colors disabled:opacity-40 after:absolute after:-inset-2 after:content-['']"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        ref={cancelRef}
                        onClick={close}
                        disabled={busy}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-fill-subtle text-text font-medium hover:bg-fill-strong transition-colors disabled:opacity-40"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={busy}
                        // red-600: white text at 4.8:1 (red-500 was 3.8:1).
                        className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:cursor-wait ${variant === 'danger'
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-accent text-accent-ink hover:bg-accent-hover'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
