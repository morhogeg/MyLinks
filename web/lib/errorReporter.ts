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
 *   - Signed out (no uid ⇒ nothing to key the write to): the report is buffered
 *     in memory (capped) and flushed once a workspace uid resolves.
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

const MAX_REPORTS_PER_SESSION = 20;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 2000;
// Reports that arrive while signed out (no uid) are held here and flushed once
// a workspace resolves (AuthProvider calls flushBufferedReports). Capped so a
// pre-auth render loop can't grow this without bound.
const MAX_BUFFERED_REPORTS = 20;

let reportCount = 0;
let installed = false;
const seenMessages = new Set<string>();
const buffered: { error: unknown; source: string }[] = [];

function platform(): 'web' | 'ios' {
    return isNativeApp() ? 'ios' : 'web';
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) : s;
}

/**
 * Persist one error record. Swallows everything — including a denied/failed
 * write — so it can never itself surface an error or start a loop.
 *
 * `source` is a short context label. The global handlers use the fixed
 * 'window.onerror' / 'unhandledrejection' / 'react' tags; explicit call sites
 * (previously-silent `.catch`es) pass their own free-form context string.
 *
 * When signed out (no uid to key the write to) the report is buffered in memory
 * and flushed by flushBufferedReports() once a workspace resolves — the exact
 * window (sign-in) where launch failures otherwise vanish.
 */
export function reportError(error: unknown, source: string): void {
    try {
        const uid = getAnalyticsUid();
        if (!uid) {
            if (buffered.length < MAX_BUFFERED_REPORTS) buffered.push({ error, source });
            return;
        }
        writeReport(uid, error, source);
    } catch {
        // Reporting must never throw.
    }
}

/**
 * Flush any reports that were buffered while signed out. Called by AuthProvider
 * the moment a workspace uid resolves. No-op when still signed out or empty.
 */
export function flushBufferedReports(): void {
    if (!getAnalyticsUid() || buffered.length === 0) return;
    const pending = buffered.splice(0, buffered.length);
    for (const r of pending) reportError(r.error, r.source);
}

/** Actually write one record for a known uid. Swallows every failure. */
function writeReport(uid: string, error: unknown, source: string): void {
    try {
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
