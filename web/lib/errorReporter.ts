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
import { isNativeApp, apiUrl, fetchWithTimeout, REQUIRE_AUTH } from './api';
import { authHeaders } from './auth';
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
// Set once the workspace is known to be unresolvable: from then on reports go
// to /api/client-error instead of Firestore (which would deny the write).
let httpFallback = false;
let httpReason = '';
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
            // Once we know the workspace will never resolve, buffering is just
            // a slower way of losing the report — send it over HTTP instead.
            if (httpFallback) postReport(error, source);
            else if (buffered.length < MAX_BUFFERED_REPORTS) buffered.push({ error, source });
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

/**
 * Give up on the Firestore path and send everything over HTTP instead.
 *
 * Called by AuthProvider the moment it concludes a workspace can't be resolved
 * (the `restricted` state). Until now that conclusion was terminal for
 * reporting: no uid means no `users/{uid}/client_errors` write — the locked
 * rules deny it — so the buffer above waited for a flush that would never come.
 * A dead build therefore reported NOTHING, which is why ungated builds
 * 1266/1267 were invisible until a human noticed the app was blank.
 *
 * `/api/client-error` takes reports with or without a signed-in identity, so
 * "I could not get a workspace" finally reaches us. `reason` records what led
 * here. Idempotent: the first call drains the buffer, later ones are no-ops.
 */
export function reportViaHttp(reason: string): void {
    if (httpFallback) return;
    httpFallback = true;
    httpReason = reason;
    const pending = buffered.splice(0, buffered.length);
    for (const r of pending) postReport(r.error, r.source);
}

/**
 * Build the common record, applying the session cap and de-duplication.
 * Returns null when this report should be dropped — so BOTH sinks (Firestore
 * and HTTP) share one budget and a fallback can't re-spend the caps.
 */
function buildRecord(error: unknown, source: string): Record<string, unknown> | null {
    if (reportCount >= MAX_REPORTS_PER_SESSION) return null;

    const err = error as { message?: unknown; stack?: unknown } | undefined;
    const rawMessage =
        (typeof err?.message === 'string' && err.message) ||
        (typeof error === 'string' ? error : '') ||
        'Unknown error';
    const message = truncate(rawMessage, MAX_MESSAGE_LEN);

    // De-dupe identical messages within the session (a render loop throws
    // the same error repeatedly).
    const dedupeKey = `${source}:${message}`;
    if (seenMessages.has(dedupeKey)) return null;
    seenMessages.add(dedupeKey);
    reportCount += 1;

    const stack = typeof err?.stack === 'string' ? truncate(err.stack, MAX_STACK_LEN) : null;
    // Path + search only — no hash, which can carry app state. On native the
    // origin is capacitor://localhost, which is fine to record.
    const url = typeof window !== 'undefined'
        ? truncate(window.location.pathname + window.location.search, 300)
        : '';

    return { message, stack, url, source, platform: platform(), ts: Date.now() };
}

/**
 * Send one report to `/api/client-error` — the sink for clients that have no
 * workspace to write to. Carries a Bearer token when one exists (signed in but
 * unresolvable workspace, the common case) and goes anonymous when it doesn't.
 * Swallows every failure, including its own.
 */
function postReport(error: unknown, source: string): void {
    try {
        const record = buildRecord(error, source);
        if (!record) return;

        void (async () => {
            let headers: Record<string, string> = { 'Content-Type': 'application/json' };
            try {
                headers = { ...headers, ...(await authHeaders()) };
            } catch {
                // No token available — an anonymous report is still worth having.
            }
            await fetchWithTimeout(apiUrl('/api/client-error'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    ...record,
                    // Which bundle is this? The whole point of the fallback is
                    // diagnosing builds that can't talk to the database.
                    buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER || '',
                    commit: process.env.NEXT_PUBLIC_COMMIT_SHA || '',
                    requireAuth: REQUIRE_AUTH,
                    reason: httpReason,
                }),
            }, 10_000);
        })().catch(() => { /* never re-report our own report */ });
    } catch {
        // Reporting must never throw.
    }
}

/** Actually write one record for a known uid. Swallows every failure. */
function writeReport(uid: string, error: unknown, source: string): void {
    try {
        const record = buildRecord(error, source);
        if (!record) return;

        void addDoc(collection(db, 'users', uid, 'client_errors'), {
            ...record,
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
