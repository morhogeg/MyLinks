'use client';

import { X, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

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
 * Matches the Second Brain dark aesthetic
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
    // Handle Escape key to close
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative bg-card w-full max-w-md rounded-2xl border border-white/5 shadow-2xl p-6 overflow-hidden animate-scale-up">
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                    <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${variant === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-purple-500/10 text-purple-400'
                        }`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-white leading-tight">
                            {title}
                        </h3>
                        <p className="mt-2 text-text-secondary text-sm leading-relaxed">
                            {message}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/5 rounded-full text-text-muted transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-text font-medium hover:bg-white/10 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors ${variant === 'danger'
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-white text-black hover:bg-gray-200'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
