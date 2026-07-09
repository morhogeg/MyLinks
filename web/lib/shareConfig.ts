'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiUrl } from './api';

/**
 * Tiny native bridge implemented in ios/App/App/ShareConfigPlugin.swift.
 * It writes the share-ingest endpoint + token into the App Group's shared
 * UserDefaults so the Share Extension (a separate process that can't read the
 * WebView's Firebase session) can authenticate its uploads.
 */
interface ShareConfigPlugin {
    save(options: { endpoint: string; token: string }): Promise<void>;
    consumePendingShare(): Promise<{ pending: boolean; kind?: string; ageMs?: number; progress?: number }>;
}

const ShareConfigNative = registerPlugin<ShareConfigPlugin>('ShareConfig');

/** Kind hint for the optimistic share banner, normalized to AnalyzingState. */
export type PendingShareKind = 'link' | 'image' | 'video';

export interface PendingShare {
    pending: boolean;
    kind: PendingShareKind;
    /** How long ago the share was handed over, in ms. */
    ageMs: number;
    /** The % (0–100) the Share Extension HUD showed at hand-off, if known — lets
        the in-app banner resume from the same value. Undefined on older builds. */
    progress?: number;
}

/**
 * Read (and clear) the "a capture was just shared" hint the iOS Share Extension
 * leaves in the App Group when the user taps "Open Machina" on the share
 * progress HUD. Native iOS only — resolves `{ pending: false }` everywhere else.
 * Fires exactly once per share (the native side clears the flag on read).
 */
export async function consumePendingShare(): Promise<PendingShare> {
    if (!isNativeIos()) return { pending: false, kind: 'link', ageMs: 0 };
    try {
        const res = await ShareConfigNative.consumePendingShare();
        if (!res?.pending) return { pending: false, kind: 'link', ageMs: 0 };
        const kind: PendingShareKind =
            res.kind === 'image' ? 'image' : res.kind === 'video' ? 'video' : 'link';
        const progress = typeof res.progress === 'number' && res.progress > 0 ? res.progress : undefined;
        return { pending: true, kind, ageMs: Math.max(0, res.ageMs ?? 0), progress };
    } catch {
        // Older builds without the native method, or no App Group — treat as none.
        return { pending: false, kind: 'link', ageMs: 0 };
    }
}

export type ShareBridgeState = 'ok' | 'error' | 'pending' | 'n/a';
export interface ShareBridgeStatus {
    state: ShareBridgeState;
    /** Human-readable failure detail (present when state === 'error'). */
    detail?: string;
    /** ms timestamp of the last attempt. */
    at?: number;
}

const STATUS_KEY = 'share-bridge-status-v1';

let lastSuccessUid: string | null = null;
let lastArgs: { uid: string; docToken?: string } | null = null;
let inFlight = false;
const listeners = new Set<(s: ShareBridgeStatus) => void>();

function isNativeIos(): boolean {
    return !!Capacitor?.isNativePlatform?.() && Capacitor.getPlatform() === 'ios';
}

function recordStatus(s: ShareBridgeStatus) {
    try {
        localStorage.setItem(STATUS_KEY, JSON.stringify(s));
    } catch {
        // private mode — in-memory only
    }
    listeners.forEach((fn) => fn(s));
}

/** Last known bridge status (for the Settings diagnostics row). */
export function getShareBridgeStatus(): ShareBridgeStatus {
    if (!isNativeIos()) return { state: 'n/a' };
    try {
        const raw = localStorage.getItem(STATUS_KEY);
        if (raw) return JSON.parse(raw) as ShareBridgeStatus;
    } catch {
        // fall through
    }
    return { state: 'pending' };
}

/** Subscribe to bridge status changes (Settings row live-updates). */
export function onShareBridgeStatus(fn: (s: ShareBridgeStatus) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch this workspace's share-ingest endpoint + personal ingest token from the
 * `get_share_config` callable — the single server-side source of truth, which
 * mints a token on first use. Used both by the native bridge's token-less
 * fallback below and by the web Settings "Browser extension" screen (so the
 * extension / iOS Shortcut can be configured). No new backend endpoint.
 * Throws if the callable fails or returns nothing usable.
 */
export async function fetchShareConfig(uid: string): Promise<{ endpoint: string; token: string }> {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('./firebase');
    const getShareConfig = httpsCallable<
        { uid: string },
        { endpoint: string; token: string }
    >(functions, 'get_share_config');
    const res = await getShareConfig({ uid });
    const endpoint = res.data?.endpoint;
    const token = res.data?.token;
    if (!endpoint || !token) throw new Error('No ingest token available');
    return { endpoint, token };
}

async function attemptOnce(uid: string, docToken?: string): Promise<void> {
    let endpoint: string;
    let token: string;

    // Preferred source: the ingest token straight off the already-loaded user
    // doc, with the endpoint built from the app's own API base. No callable,
    // no extra network dependency — the bridge can't be broken by backend
    // auth/App Check config or callable failures anymore.
    if (docToken) {
        token = docToken;
        endpoint = apiUrl('/api/share');
    } else {
        // Fallback (first-ever launch before a token exists on the doc): the
        // get_share_config callable mints one server-side.
        ({ endpoint, token } = await fetchShareConfig(uid));
    }

    await ShareConfigNative.save({ endpoint, token });
}

/**
 * Push the user's share endpoint + ingest token into the App Group container so
 * the iOS Share Extension can post shared links/images on the user's behalf.
 *
 * `docToken` is the `ingestToken` field from the user doc the caller already
 * holds — when present the sync is fully local-data-driven (one native write).
 *
 * Resilient by design (this bridge has silently failed three separate times):
 * 3 attempts with backoff, re-attempts when the app returns to the foreground
 * after a failure, and every outcome is recorded for the Settings diagnostics
 * row. No-op everywhere except the native iOS app; never blocks startup.
 */
export async function syncShareConfigToNative(uid: string, docToken?: string): Promise<void> {
    if (!uid || !isNativeIos()) return;
    lastArgs = { uid, docToken };
    if (lastSuccessUid === uid) return; // already synced this session
    if (inFlight) return;
    inFlight = true;

    try {
        const delays = [0, 2000, 5000];
        let lastErr: unknown;
        for (const d of delays) {
            if (d) await sleep(d);
            try {
                await attemptOnce(uid, docToken);
                lastSuccessUid = uid;
                recordStatus({ state: 'ok', at: Date.now() });
                return;
            } catch (e) {
                lastErr = e;
            }
        }
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        console.warn('Share config sync to native failed:', msg);
        recordStatus({ state: 'error', detail: msg, at: Date.now() });
    } finally {
        inFlight = false;
    }
}

/** Manual retry (Settings "Fix now" button). Clears the success latch. */
export async function resyncShareConfig(): Promise<ShareBridgeStatus> {
    if (!lastArgs) return getShareBridgeStatus();
    lastSuccessUid = null;
    await syncShareConfigToNative(lastArgs.uid, lastArgs.docToken);
    return getShareBridgeStatus();
}

// After a failed sync, quietly try again whenever the app comes back to the
// foreground (network conditions change; WKWebView suspensions abort fetches).
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (!isNativeIos() || !lastArgs) return;
        if (lastSuccessUid === lastArgs.uid) return;
        void syncShareConfigToNative(lastArgs.uid, lastArgs.docToken);
    });
}
