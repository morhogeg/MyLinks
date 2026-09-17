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
    /** Epoch ms until which wrong-PIN backoff refuses guesses (0 = none). */
    lockedUntil: number;
}

let config: PrivacyLockConfig | null = null;
let loadedForUid: string | null = null;
let snapshot: PrivacyLockState = { hasPin: null, unlocked: false, lockedUntil: 0 };
const SERVER_SNAPSHOT: PrivacyLockState = { hasPin: null, unlocked: false, lockedUntil: 0 };
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

// ── Attempt backoff ──────────────────────────────────────────────────────────
// A 4-digit PIN has 10 000 values; with no throttle the pad accepted a guess
// every hash (~100 ms), i.e. the whole space in minutes for someone holding
// the unlocked phone. Five free tries, then a growing wait, capped at an
// hour, remembered per device (localStorage; sign-out purges it, which is
// the right reset: the account itself is the real boundary). This is
// cosmetic by design, like the lock: a modified client bypasses it and the
// data is already readable by the signed-in account. It never touches
// sign-out, Close, or the setup flow.

const BACKOFF_KEY = 'privacy-lock-backoff-v1';
const FREE_ATTEMPTS = 5;
const BACKOFF_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000];
/** Ceiling on the stored iteration count: a self-corrupted config with
 *  `iterations: 1e9` would otherwise hang the pad on every keystroke. */
const MAX_ITERATIONS = 600_000;

let backoff: { attempts: number; lockedUntil: number } = { attempts: 0, lockedUntil: 0 };
let backoffLoaded = false;

function loadBackoff(): void {
    if (backoffLoaded) return;
    backoffLoaded = true;
    try {
        const raw = localStorage.getItem(BACKOFF_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { a?: unknown; u?: unknown };
            backoff = {
                attempts: typeof parsed.a === 'number' && parsed.a >= 0 ? Math.floor(parsed.a) : 0,
                lockedUntil: typeof parsed.u === 'number' && parsed.u > 0 ? parsed.u : 0,
            };
        }
    } catch {
        // Private mode or blocked storage: in-memory only for this session.
    }
}

function saveBackoff(): void {
    try {
        if (backoff.attempts === 0 && backoff.lockedUntil === 0) localStorage.removeItem(BACKOFF_KEY);
        else localStorage.setItem(BACKOFF_KEY, JSON.stringify({ a: backoff.attempts, u: backoff.lockedUntil }));
    } catch {
        // ignore
    }
}

/** Milliseconds until the pad accepts another guess (0 = now). */
export function getLockoutRemainingMs(): number {
    loadBackoff();
    return Math.max(0, backoff.lockedUntil - Date.now());
}

/** Free guesses left before the first wait kicks in (0 once waiting). */
export function getAttemptsLeft(): number {
    loadBackoff();
    return Math.max(0, FREE_ATTEMPTS - backoff.attempts);
}

function recordAttempt(ok: boolean): void {
    loadBackoff();
    if (ok) {
        backoff = { attempts: 0, lockedUntil: 0 };
    } else {
        const attempts = backoff.attempts + 1;
        const over = attempts - FREE_ATTEMPTS;
        const wait = over > 0 ? BACKOFF_MS[Math.min(over - 1, BACKOFF_MS.length - 1)] : 0;
        backoff = { attempts, lockedUntil: wait ? Date.now() + wait : 0 };
    }
    saveBackoff();
    emit({ lockedUntil: backoff.lockedUntil });
}

/** Pure helper for the modal's copy: the wait a given failure count earns. */
export function backoffForAttempts(attempts: number): number {
    const over = attempts - FREE_ATTEMPTS;
    return over > 0 ? BACKOFF_MS[Math.min(over - 1, BACKOFF_MS.length - 1)] : 0;
}

async function matches(pin: string): Promise<boolean> {
    if (!config) return false;
    if (getLockoutRemainingMs() > 0) return false;
    const iterations = Math.min(Math.max(1, config.iterations || 0), MAX_ITERATIONS);
    const ok = (await hashPin(pin, config.salt, iterations)) === config.pinHash;
    recordAttempt(ok);
    return ok;
}

/** Check a PIN against the stored hash; unlocks the vault on success. */
export async function attemptUnlock(pin: string): Promise<boolean> {
    if (!(await matches(pin))) return false;
    emit({ unlocked: true });
    return true;
}

/** Verify without unlocking (used by change/disable flows). */
export async function verifyPin(pin: string): Promise<boolean> {
    return matches(pin);
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
        lockedUntil: state.lockedUntil,
        // hasPin === null (still loading) counts as locked so private cards
        // never flash before the config arrives.
        locked: state.hasPin !== false && !state.unlocked,
    };
}
