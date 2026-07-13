'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { setPin, attemptUnlock, verifyPin, disablePin, tryBiometricUnlock } from '@/lib/privacyLock';
import { useScrollLock } from '@/lib/useScrollLock';

const PIN_LENGTH = 4;

type Mode = 'unlock' | 'setup' | 'change' | 'disable';
type Step = 'verify' | 'create' | 'confirm';

const FIRST_STEP: Record<Mode, Step> = {
    unlock: 'verify',
    setup: 'create',
    change: 'verify',
    disable: 'verify',
};

const STEP_TITLE: Record<Step, string> = {
    verify: 'Enter your PIN',
    create: 'Choose a PIN',
    confirm: 'Confirm your PIN',
};

/**
 * The one PIN surface for private collections: unlock the vault, set up a
 * first PIN, change it, or turn it off — driven by `mode`. A single hidden
 * numeric input (so iOS brings up the number pad) renders as 4 dots.
 *
 * Sits at z-[120] so it can open above the collection form (z-100) and the
 * settings sheet. On native, a future Face ID unlock runs first via
 * tryBiometricUnlock() and this pad is the fallback.
 */
export default function PinLockModal({
    uid,
    mode,
    isOpen,
    onClose,
    onSuccess,
}: {
    uid: string;
    mode: Mode;
    isOpen: boolean;
    onClose: () => void;
    /** Fired after the flow completes (vault unlocked / PIN saved / PIN removed). */
    onSuccess?: () => void;
}) {
    const [step, setStep] = useState<Step>(FIRST_STEP[mode]);
    const [value, setValue] = useState('');
    const [firstPin, setFirstPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset the flow whenever the modal (re)opens or the mode changes.
    const [resetKey, setResetKey] = useState({ isOpen, mode });
    if (resetKey.isOpen !== isOpen || resetKey.mode !== mode) {
        setResetKey({ isOpen, mode });
        if (isOpen) {
            setStep(FIRST_STEP[mode]);
            setValue('');
            setFirstPin('');
            setError(null);
            setBusy(false);
        }
    }

    useScrollLock(isOpen);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // Try Face ID / Touch ID first when just unlocking (no-op until the native
    // biometric plugin ships — tryBiometricUnlock resolves false on every
    // platform today, so the PIN pad simply stays up).
    useEffect(() => {
        if (!isOpen || mode !== 'unlock') return;
        let cancelled = false;
        void tryBiometricUnlock().then((ok) => {
            if (ok && !cancelled) { onSuccess?.(); onClose(); }
        });
        return () => { cancelled = true; };
    }, [isOpen, mode, onSuccess, onClose]);

    if (!isOpen) return null;

    const finish = () => { onSuccess?.(); onClose(); };

    const fail = (msg: string) => {
        setError(msg);
        setValue('');
        setBusy(false);
        inputRef.current?.focus();
    };

    const handleComplete = async (pin: string) => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            if (step === 'verify') {
                if (mode === 'unlock') {
                    if (await attemptUnlock(pin)) return finish();
                    return fail('Wrong PIN — try again.');
                }
                if (!(await verifyPin(pin))) return fail('Wrong PIN — try again.');
                if (mode === 'disable') {
                    await disablePin(uid);
                    return finish();
                }
                // mode === 'change' → move on to choosing the new PIN.
                setStep('create');
                setValue('');
                setBusy(false);
                return;
            }
            if (step === 'create') {
                setFirstPin(pin);
                setStep('confirm');
                setValue('');
                setBusy(false);
                return;
            }
            // step === 'confirm'
            if (pin !== firstPin) {
                setStep('create');
                setFirstPin('');
                return fail("PINs didn't match — choose one again.");
            }
            await setPin(uid, pin);
            finish();
        } catch {
            fail("Something went wrong. Please try again.");
        }
    };

    const handleChange = (raw: string) => {
        const digits = raw.replace(/\D/g, '').slice(0, PIN_LENGTH);
        setValue(digits);
        if (error) setError(null);
        if (digits.length === PIN_LENGTH) void handleComplete(digits);
    };

    const subtitle =
        mode === 'disable' && step === 'verify' ? 'Confirm your PIN to turn off the privacy lock.'
        : mode === 'change' && step === 'verify' ? 'Enter your current PIN first.'
        : step === 'create' ? 'This one PIN protects all your private collections.'
        : step === 'confirm' ? 'Enter the same PIN once more.'
        : 'This collection is private.';

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                role="dialog"
                aria-modal="true"
                aria-label={STEP_TITLE[step]}
                className="relative w-full max-w-xs bg-card border border-border-strong rounded-3xl shadow-2xl p-6 animate-scale-up"
                // Keep focus in the hidden input so the keyboard stays up.
                onClick={() => inputRef.current?.focus()}
            >
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute top-3 end-3 p-1.5 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col items-center text-center">
                    <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 mb-3">
                        <Lock className="w-6 h-6 text-accent" />
                    </span>
                    <h3 className="text-base font-bold text-text">{STEP_TITLE[step]}</h3>
                    <p className="mt-1 text-[13px] text-text-muted leading-snug">{subtitle}</p>

                    {/* The dots — a visual mirror of the hidden input's value. */}
                    <div className="relative mt-5 mb-1">
                        <div className="flex items-center gap-3" aria-hidden="true">
                            {Array.from({ length: PIN_LENGTH }, (_, i) => (
                                <span
                                    key={i}
                                    className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                                        i < value.length ? 'bg-accent border-accent' : 'bg-transparent border-border-strong'
                                    }`}
                                />
                            ))}
                        </div>
                        <input
                            ref={inputRef}
                            autoFocus
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            value={value}
                            disabled={busy}
                            onChange={(e) => handleChange(e.target.value)}
                            aria-label={`${STEP_TITLE[step]} — ${PIN_LENGTH} digits`}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>

                    <p className={`mt-3 text-[12px] font-medium min-h-[1rem] ${error ? 'text-red-400' : 'text-transparent'}`}>
                        {error ?? ' '}
                    </p>
                </div>
            </div>
        </div>
    );
}
