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
}

const ShareConfigNative = registerPlugin<ShareConfigPlugin>('ShareConfig');

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

async function attemptOnce(uid: string, docToken?: string): Promise<void> {
    let endpoint: string | undefined;
    let token: string | undefined;

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
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('./firebase');
        const getShareConfig = httpsCallable<
            { uid: string },
            { endpoint: string; token: string }
        >(functions, 'get_share_config');
        const res = await getShareConfig({ uid });
        endpoint = res.data?.endpoint;
        token = res.data?.token;
    }

    if (!endpoint || !token) throw new Error('No ingest token available');
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
