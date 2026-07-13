'use client';

/**
 * Tiny, self-hosted client error reporter — the crash-visibility counterpart to
 * lib/analytics.ts. Instead of a third-party SDK (Sentry/Crashlytics) it writes
 * a compact record of each uncaught error to `users/{uid}/client_errors`, so we
 * can see what's breaking in the field for signed-in users.
 *
 * Sources covered:
 *   - window.onerror                (uncaught synchronous errors)
 *   - unhandledrejection            (uncaught promise rejections)
 *   - the app-root React error boundaries (app/error.tsx, app/global-error.tsx)
 *     which call reportError() directly.
 *
 * Design constraints, mirroring the analytics module:
 *   - Fire-and-forget: reporting never throws and never blocks.
 *   - No-op when signed out (no uid ⇒ nothing to key the write to).
 *   - Rate-limited: at most MAX_REPORTS_PER_SESSION writes per page session,
 *     and identical messages are de-duplicated, so a render loop can't spam
 *     Firestore.
 *   - We never report a failure of our OWN Firestore write (the write's
 *     rejection is caught), so there is no feedback loop.
 *
 * NATIVE NOTE: this covers the web/WKWebView JS layer only. True native iOS
 * crash reporting (Crashlytics) needs the native SDK wired in Xcode by the
 * owner — see the task report's owner follow-ups. We deliberately add no native
 * SDK here.
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { isNativeApp } from './api';
import { getAnalyticsUid } from './analytics';

const MAX_REPORTS_PER_SESSION = 8;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 2000;

let reportCount = 0;
let installed = false;
const seenMessages = new Set<string>();

function platform(): 'web' | 'ios' {
    return isNativeApp() ? 'ios' : 'web';
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) : s;
}

/**
 * Persist one error record. Swallows everything — including a denied/failed
 * write — so it can never itself surface an error or start a loop.
 */
export function reportError(
    error: unknown,
    source: 'window.onerror' | 'unhandledrejection' | 'react',
): void {
    try {
        const uid = getAnalyticsUid();
        if (!uid) return;
        if (reportCount >= MAX_REPORTS_PER_SESSION) return;

        const err = error as { message?: unknown; stack?: unknown } | undefined;
        const rawMessage =
            (typeof err?.message === 'string' && err.message) ||
            (typeof error === 'string' ? error : '') ||
            'Unknown error';
        const message = truncate(rawMessage, MAX_MESSAGE_LEN);

        // De-dupe identical messages within the session (a render loop throws
        // the same error repeatedly).
        const dedupeKey = `${source}:${message}`;
        if (seenMessages.has(dedupeKey)) return;
        seenMessages.add(dedupeKey);
        reportCount += 1;

        const stack = typeof err?.stack === 'string' ? truncate(err.stack, MAX_STACK_LEN) : null;
        // Path + search only — no hash, which can carry app state. On native the
        // origin is capacitor://localhost, which is fine to record.
        const url = typeof window !== 'undefined'
            ? truncate(window.location.pathname + window.location.search, 300)
            : '';

        void addDoc(collection(db, 'users', uid, 'client_errors'), {
            message,
            stack,
            url,
            source,
            platform: platform(),
            ts: Date.now(),
            createdAt: serverTimestamp(),
        }).catch(() => { /* fire-and-forget — never re-report our own write */ });
    } catch {
        // Reporting must never throw.
    }
}

/**
 * Install the global handlers once. Idempotent and safe to call on every mount
 * (AuthProvider does). No-op during SSR.
 */
export function installErrorReporter(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', (event: ErrorEvent) => {
        // event.error is the thrown value when available; fall back to message.
        reportError(event.error ?? { message: event.message }, 'window.onerror');
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        reportError(event.reason, 'unhandledrejection');
    });
}
