'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The privacy vault: ONE app-level PIN protects every collection marked
 * Private (the iOS-Notes model — a single lock, not a PIN per collection).
 *
 * The PIN itself is never stored: a PBKDF2-SHA256 hash + per-user random salt
 * live in a top-level `privacyLock` field on users/{uid} (NOT inside
 * `settings`, so it never rides the settings auto-save/normalize machinery).
 *
 * This is a PRIVACY screen, not a security boundary — the data is the user's
 * own and still readable through their authenticated Firestore access; the
 * lock keeps private collections away from shoulder-surfers and borrowed
 * phones, exactly like a notes-app lock.
 *
 * Unlocking is app-wide and session-scoped: it survives navigation but
 * re-locks the moment the app is backgrounded/hidden (visibilitychange),
 * matching what iOS users expect from Face-ID-style locks.
 *
 * Face ID (future): a Capacitor biometric plugin (e.g. capacitor-native-
 * biometric) can be wired into `tryBiometricUnlock` below once the native SPM
 * dependency ships in a TestFlight build — the UI already calls it first and
 * falls back to the PIN pad.
 */

export interface PrivacyLockConfig {
    pinHash: string;    // hex PBKDF2-SHA256 output
    salt: string;       // hex, 16 random bytes
    iterations: number; // PBKDF2 rounds used when the hash was written
    updatedAt: number;  // Unix ms
}

const PBKDF2_ITERATIONS = 100_000;

// ── Hashing (WebCrypto — available in every target: modern browsers + WKWebView) ──

function toHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSaltHex(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes.buffer);
}

function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

async function hashPin(pin: string, saltHex: string, iterations: number): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex) as BufferSource, iterations },
        key,
        256
    );
    return toHex(bits);
}

// ── Store (module singleton + useSyncExternalStore) ─────────────────────────

export interface PrivacyLockState {
    /** null while the config hasn't been loaded from Firestore yet. */
    hasPin: boolean | null;
    /** True after a successful PIN entry this session (until relock). */
    unlocked: boolean;
}

let config: PrivacyLockConfig | null = null;
let loadedForUid: string | null = null;
let snapshot: PrivacyLockState = { hasPin: null, unlocked: false };
const SERVER_SNAPSHOT: PrivacyLockState = { hasPin: null, unlocked: false };
const listeners = new Set<() => void>();

function emit(next: Partial<PrivacyLockState>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** Read users/{uid}.privacyLock once per uid; safe to call repeatedly. */
export async function loadPrivacyLock(uid: string): Promise<void> {
    if (loadedForUid === uid && snapshot.hasPin !== null) return;
    loadedForUid = uid;
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        const data = snap.exists() ? (snap.data().privacyLock as PrivacyLockConfig | undefined) : undefined;
        config = data && data.pinHash && data.salt ? data : null;
        emit({ hasPin: config !== null, unlocked: false });
    } catch {
        // Leave hasPin null (treated as locked) rather than mis-reporting "no
        // PIN" on a transient read failure — private cards must not flash open.
    }
}

/** Create or replace the PIN. Leaves the vault unlocked (the user just proved it). */
export async function setPin(uid: string, pin: string): Promise<void> {
    const salt = randomSaltHex();
    const next: PrivacyLockConfig = {
        pinHash: await hashPin(pin, salt, PBKDF2_ITERATIONS),
        salt,
        iterations: PBKDF2_ITERATIONS,
        updatedAt: Date.now(),
    };
    await updateDoc(doc(db, 'users', uid), { privacyLock: next });
    config = next;
    emit({ hasPin: true, unlocked: true });
}

/** Remove the PIN entirely — private collections stay flagged but unprotected. */
export async function disablePin(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { privacyLock: deleteField() });
    config = null;
    emit({ hasPin: false, unlocked: false });
}

/** Check a PIN against the stored hash; unlocks the vault on success. */
export async function attemptUnlock(pin: string): Promise<boolean> {
    if (!config) return false;
    const candidate = await hashPin(pin, config.salt, config.iterations);
    if (candidate !== config.pinHash) return false;
    emit({ unlocked: true });
    return true;
}

/** Verify without unlocking (used by change/disable flows). */
export async function verifyPin(pin: string): Promise<boolean> {
    if (!config) return false;
    return (await hashPin(pin, config.salt, config.iterations)) === config.pinHash;
}

/** Re-lock the vault (called automatically when the app is hidden). */
export function relock(): void {
    if (snapshot.unlocked) emit({ unlocked: false });
}

/**
 * Biometric unlock — Face ID / Touch ID. Stubbed until the Capacitor
 * biometric plugin lands in the native build; returns false so callers fall
 * through to the PIN pad. When wired, it should resolve true only after the
 * OS authenticates the user, then call the same emit({ unlocked: true }).
 */
export async function tryBiometricUnlock(): Promise<boolean> {
    return false;
}

/**
 * Live privacy-lock state + auto-relock-on-background. `locked` is the one
 * flag consumers gate on: true whenever a PIN exists (or is still loading)
 * and the vault hasn't been unlocked this session.
 */
export function usePrivacyLock(uid: string | null) {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        if (uid) void loadPrivacyLock(uid);
    }, [uid]);

    // Re-lock when the app is backgrounded (native) or the tab is hidden (web).
    useEffect(() => {
        const onVisibility = () => { if (document.visibilityState === 'hidden') relock(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    return {
        hasPin: state.hasPin,
        unlocked: state.unlocked,
        // hasPin === null (still loading) counts as locked so private cards
        // never flash before the config arrives.
        locked: state.hasPin !== false && !state.unlocked,
    };
}
