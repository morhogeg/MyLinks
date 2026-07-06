'use client';

/**
 * Native iOS push notifications (FCM via @capacitor-firebase/messaging).
 *
 * NATIVE-ONLY: every entry point gates on isNativeApp() and the plugin is
 * imported dynamically (mirroring lib/auth.ts's authentication-plugin import),
 * so none of this ever loads — or runs — in a normal browser. Web push is
 * deliberately out of scope: the WKWebView origin (capacitor://localhost)
 * can't run the FCM service-worker flow, and the PWA is retired.
 *
 * Device tokens are registered through the authenticated backend endpoints
 * (/api/register-device-token, /api/unregister-device-token) — the client
 * NEVER writes users/{uid}.fcmTokens directly (see firestore.rules).
 *
 * Deep-linking: a tapped notification carries string data — {view: 'digest'}
 * opens the Digest section, {linkId} opens that card. The intent is stashed in
 * sessionStorage AND broadcast as a window event, so it works both when the
 * app is already running (event) and on a cold start where the tap arrives
 * before the Feed mounts (storage, consumed on mount).
 */

import { apiUrl, fetchWithTimeout, isNativeApp } from './api';
import { authHeaders } from './auth';
import { appCheckHeaders } from './firebase';

/** Deep-link intent parsed from a tapped notification's data payload. */
export interface PushIntent {
    view?: 'digest';
    linkId?: string;
}

/** Window event fired when a notification tap carries a deep-link intent. */
export const PUSH_INTENT_EVENT = 'machina:push-intent';
/** Window event fired when a push arrives with the app foregrounded. */
export const PUSH_FOREGROUND_EVENT = 'machina:push-foreground';

const PENDING_INTENT_KEY = 'machina-pending-push-intent';

/**
 * First-run nudge record (dual-persistence, mirroring the AI-consent pattern):
 * localStorage under this key (ms timestamp) + `pushPromptedAt` on the user
 * doc, reconciled by AuthProvider so a reinstall doesn't re-nudge.
 */
export const PUSH_PROMPT_KEY = 'push-prompt-v1';

export function readLocalPushPrompt(): number | null {
    try {
        const raw = localStorage.getItem(PUSH_PROMPT_KEY);
        const ts = Number(raw);
        return raw && Number.isFinite(ts) && ts > 0 ? ts : null;
    } catch {
        return null;
    }
}

export function writeLocalPushPrompt(ts: number): void {
    try {
        localStorage.setItem(PUSH_PROMPT_KEY, String(ts));
    } catch {
        // Private mode — the user-doc mirror still records it.
    }
}

function stashIntent(intent: PushIntent): void {
    try {
        sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
    } catch {
        // Best effort — the live event below still covers the running app.
    }
    window.dispatchEvent(new CustomEvent<PushIntent>(PUSH_INTENT_EVENT, { detail: intent }));
}

/** Pop (and clear) a deep-link intent stashed before the Feed mounted. */
export function consumePendingPushIntent(): PushIntent | null {
    try {
        const raw = sessionStorage.getItem(PENDING_INTENT_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(PENDING_INTENT_KEY);
        return JSON.parse(raw) as PushIntent;
    } catch {
        return null;
    }
}

function parseIntent(data: unknown): PushIntent | null {
    const d = (data ?? {}) as Record<string, unknown>;
    if (d.view === 'digest') return { view: 'digest' };
    if (typeof d.linkId === 'string' && d.linkId) return { linkId: d.linkId };
    return null;
}

async function postToken(path: string, token: string): Promise<boolean> {
    try {
        const res = await fetchWithTimeout(apiUrl(path), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await authHeaders()),
                ...(await appCheckHeaders()),
            },
            body: JSON.stringify({ token }),
        });
        return res.ok;
    } catch (e) {
        console.warn(`Device token call ${path} failed:`, e);
        return false;
    }
}

// The last token we successfully registered — needed to unregister on
// sign-out (the plugin's getToken may be unavailable once signed out).
const LAST_TOKEN_KEY = 'machina-last-push-token';

function rememberToken(token: string): void {
    try { localStorage.setItem(LAST_TOKEN_KEY, token); } catch { /* best effort */ }
}

function recallToken(): string | null {
    try { return localStorage.getItem(LAST_TOKEN_KEY); } catch { return null; }
}

let listenersAttached = false;

/**
 * Attach the messaging listeners once per app run (native only). Safe to call
 * on every launch: token rotations re-register automatically, foreground
 * pushes surface as an in-app event (Feed shows a toast), and notification
 * taps broadcast their deep-link intent.
 */
export async function initPushListeners(): Promise<void> {
    if (!isNativeApp() || listenersAttached) return;
    listenersAttached = true;
    try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

        // FCM rotates tokens occasionally — keep the backend registration fresh.
        await FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
            if (!token) return;
            rememberToken(token);
            void postToken('/api/register-device-token', token);
        });

        // Foreground pushes get no OS banner — surface an in-app toast instead.
        await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
            const message = [notification?.title, notification?.body].filter(Boolean).join(' — ');
            if (message) {
                window.dispatchEvent(new CustomEvent(PUSH_FOREGROUND_EVENT, { detail: { message } }));
            }
        });

        // Notification tapped (background/lock screen) → deep-link.
        await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
            const intent = parseIntent(notification?.data);
            if (intent) stashIntent(intent);
        });
    } catch (e) {
        console.warn('Push listeners unavailable:', e);
    }
}

/**
 * If the user already granted notification permission (e.g. a previous run),
 * silently refresh + re-register the device token. Never prompts.
 */
export async function refreshPushRegistration(): Promise<void> {
    if (!isNativeApp()) return;
    try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        const { receive } = await FirebaseMessaging.checkPermissions();
        if (receive !== 'granted') return;
        const { token } = await FirebaseMessaging.getToken();
        if (token) {
            rememberToken(token);
            await postToken('/api/register-device-token', token);
        }
    } catch (e) {
        console.warn('Push registration refresh failed:', e);
    }
}

/**
 * Request notification permission (MUST be called from a user gesture — iOS
 * shows the OS prompt at most once) and, on grant, register this device's FCM
 * token with the backend. Returns true when push is active.
 */
export async function registerPush(): Promise<boolean> {
    if (!isNativeApp()) return false;
    try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        const { receive } = await FirebaseMessaging.requestPermissions();
        if (receive !== 'granted') return false;
        const { token } = await FirebaseMessaging.getToken();
        if (!token) return false;
        rememberToken(token);
        return await postToken('/api/register-device-token', token);
    } catch (e) {
        console.warn('Push registration failed:', e);
        return false;
    }
}

/**
 * Remove this device's token from the workspace (sign-out / toggle off).
 * Must run while still signed in — the endpoint verifies the bearer token.
 */
export async function unregisterPush(): Promise<void> {
    if (!isNativeApp()) return;
    let token: string | null = null;
    try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        token = (await FirebaseMessaging.getToken()).token || null;
    } catch {
        token = null;
    }
    token = token || recallToken();
    if (!token) return;
    await postToken('/api/unregister-device-token', token);
    try { localStorage.removeItem(LAST_TOKEN_KEY); } catch { /* best effort */ }
}
