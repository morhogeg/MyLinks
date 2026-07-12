'use client';

import { X, AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { hapticWarning, hapticMedium } from '@/lib/haptics';
import { useScrollLock } from '@/lib/useScrollLock';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'info';
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
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
}: ConfirmDialogProps) {
    // Busy-guard: a fast double-tap on Confirm must run the action once, not
    // twice (the dialog stays mounted for a frame after onConfirm fires). Reset
    // each time the dialog opens.
    const confirmedRef = useRef(false);
    useEffect(() => {
        if (isOpen) confirmedRef.current = false;
    }, [isOpen]);

    const handleConfirm = () => {
        if (confirmedRef.current) return;
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
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Ref-counted so closing this overlay never unlocks a still-open parent (F-16).
    useScrollLock(isOpen);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div
                role="alertdialog"
                aria-modal="true"
                className="relative bg-card w-full max-w-md rounded-2xl border border-border-subtle shadow-2xl p-6 overflow-hidden animate-scale-up"
            >
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                    <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${variant === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-purple-500/10 text-purple-400'
                        }`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-text leading-tight">
                            {title}
                        </h3>
                        <p className="mt-2 text-text-secondary text-sm leading-relaxed">
                            {message}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1 hover:bg-fill-subtle rounded-full text-text-muted transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-fill-subtle text-text font-medium hover:bg-fill-strong transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors ${variant === 'danger'
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-accent text-white hover:bg-accent-hover'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
