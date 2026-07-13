'use client';

/**
 * Privacy-respecting, self-hosted product analytics.
 *
 * Writes minimal event documents to a per-user Firestore subcollection
 * (`users/{uid}/analytics_events`) so we can measure adoption and D1/D7
 * retention WITHOUT any third-party SDK. Every write is fire-and-forget: it
 * never blocks a user action and never throws into the UI (errors are
 * swallowed), and it is a no-op when there is no resolved workspace uid.
 *
 * WHAT WE RECORD (and only this):
 *   - event name (a short, fixed identifier — never free text from the user)
 *   - client timestamp (ms) + a server timestamp for reliable ordering
 *   - platform: 'web' | 'ios' (via the canonical isNativeApp())
 *   - appVersion, when cheaply available at build time
 *   - a SMALL, ALLOWLISTED set of scalar props (see ALLOWED_PROP_KEYS)
 *
 * WHAT WE NEVER RECORD: card content, titles, URLs, search queries, question
 * text, emails, tags, or any other user data. sanitizeProps() drops every key
 * not on the allowlist and every non-scalar / over-long value, so a careless
 * caller physically cannot leak content through this pipe.
 *
 * The uid used here is the DATA-doc id (the workspace key — a phone number
 * today), NOT the Firebase Auth uid. AuthProvider is the single writer of it
 * via setAnalyticsUid() whenever the workspace resolves or clears.
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { isNativeApp } from './api';

// ── Current workspace uid (set by AuthProvider) ──────────────────────────────

let currentUid: string | null = null;

/** Point analytics + error reporting at the resolved workspace, or clear it. */
export function setAnalyticsUid(uid: string | null): void {
    currentUid = uid;
}

/** The current workspace uid (shared with the error reporter). */
export function getAnalyticsUid(): string | null {
    return currentUid;
}

// ── Environment helpers ──────────────────────────────────────────────────────

function platform(): 'web' | 'ios' {
    return isNativeApp() ? 'ios' : 'web';
}

/** Build-time app version, if the env var was provided. Omitted otherwise. */
function appVersion(): string | undefined {
    const v = process.env.NEXT_PUBLIC_APP_VERSION;
    return v && v.length > 0 ? v : undefined;
}

// ── Prop sanitization ────────────────────────────────────────────────────────

// The ONLY prop keys that are ever persisted. Everything else is dropped. Keep
// this list tiny and content-free — these describe an event, they never carry
// user data.
const ALLOWED_PROP_KEYS = new Set([
    'source',   // where an action originated (e.g. 'fab', 'share', 'extension')
    'method',   // 'google' | 'apple' for sign-in
    'format',   // 'json' | 'md' for export
    'count',    // a small integer count
    'ok',       // boolean outcome
    'reason',   // a short, fixed failure category (never a raw error message)
    'mode',     // a fixed mode label
    'kind',     // a fixed kind label
]);

const MAX_STRING_LEN = 40;

/**
 * Keep only allowlisted keys with scalar, bounded values. Strings longer than
 * MAX_STRING_LEN are dropped (a long string is a red flag for leaked content);
 * objects, arrays, null, and NaN are dropped too.
 */
function sanitizeProps(props?: Record<string, unknown>): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    if (!props) return out;
    for (const [k, v] of Object.entries(props)) {
        if (!ALLOWED_PROP_KEYS.has(k)) continue;
        if (typeof v === 'boolean') out[k] = v;
        else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        else if (typeof v === 'string' && v.length > 0 && v.length <= MAX_STRING_LEN) out[k] = v;
        // anything else is intentionally dropped
    }
    return out;
}

// ── Core: track ──────────────────────────────────────────────────────────────

/**
 * Record a product event. Fire-and-forget — returns immediately, never throws,
 * and does nothing when signed out. Safe to call from any UX path.
 */
export function track(event: string, props?: Record<string, unknown>): void {
    const uid = currentUid;
    if (!uid) return;
    try {
        void addDoc(collection(db, 'users', uid, 'analytics_events'), {
            event,
            platform: platform(),
            ...(appVersion() ? { appVersion: appVersion() } : {}),
            props: sanitizeProps(props),
            ts: Date.now(),
            createdAt: serverTimestamp(),
        }).catch(() => { /* fire-and-forget */ });
    } catch {
        // Never let telemetry break the app.
    }
}

// ── First-time flags (fire an event at most once per device) ─────────────────

const FLAG_PREFIX = 'machina_analytics_flag:';

/**
 * Fire `event` only the first time this flag is seen on this device. Uses a
 * localStorage guard; in private mode (where storage throws) it degrades to
 * best-effort and may fire more than once, which is acceptable for these
 * milestone events.
 */
export function trackOnce(flag: string, event: string, props?: Record<string, unknown>): void {
    const key = `${FLAG_PREFIX}${flag}`;
    try {
        if (localStorage.getItem(key) === '1') return;
        localStorage.setItem(key, '1');
    } catch {
        // Private mode — proceed best-effort.
    }
    track(event, props);
}

// ── Daily heartbeat (D1/D7 retention) ────────────────────────────────────────

const APP_OPEN_DAY_KEY = 'machina_app_open_day';

function localDayStamp(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Emit an `app_open` event at most once per calendar day per device — the
 * lightweight daily-active signal that powers D1/D7 retention. Called by
 * AuthProvider whenever a workspace is active.
 */
export function trackAppOpen(): void {
    const today = localDayStamp();
    try {
        if (localStorage.getItem(APP_OPEN_DAY_KEY) === today) return;
        localStorage.setItem(APP_OPEN_DAY_KEY, today);
    } catch {
        // Private mode — fall through and record it (best-effort, may repeat).
    }
    track('app_open');
}

// ── Sign-in (deliberate sign-in vs. silent session restore) ──────────────────

// track() needs the DATA uid, which isn't known at the moment the auth call
// succeeds (the workspace resolves a beat later). So a deliberate sign-in sets
// this marker; AuthProvider consumes it via flushSignIn() once the uid lands.
// This is what distinguishes a real sign-in from a session restore on reload
// (a restore never sets the marker).
let pendingSignInMethod: 'google' | 'apple' | null = null;

/** Mark that a deliberate sign-in just succeeded (called from lib/auth.ts). */
export function markSignIn(method: 'google' | 'apple'): void {
    pendingSignInMethod = method;
}

/** Emit the pending `sign_in` event, if any (called once the uid resolves). */
export function flushSignIn(): void {
    if (!pendingSignInMethod) return;
    const method = pendingSignInMethod;
    pendingSignInMethod = null;
    track('sign_in', { method });
}

// ── Named helpers ─────────────────────────────────────────────────────────────
//
// Events that live in files owned by OTHER agents this wave (AskBrain,
// ReminderModal, AddLinkForm) get a named one-line helper here so those files
// can wire a single call with zero analytics knowledge. See the task report for
// the exact call sites.

/** First successful "ask your brain" query (fires once per device). */
export function trackFirstAsk(): void {
    trackOnce('first_ask', 'first_ask');
}

/** An ask returned an answer with no source citations (retrieval gap signal). */
export function trackAskNoCitations(): void {
    track('ask_no_citations');
}

/** A suggested prompt chip was tapped. `kind` is a fixed engine label
 *  ('latest' | 'week' | 'concept' | 'category' | 'rediscover' | 'recap' |
 *  'fresh'), never chip text. */
export function trackAskSuggestionUsed(kind: string): void {
    track('ask_suggestion_used', { kind });
}

/** A one-tap follow-up chip under an answer was tapped. */
export function trackAskFollowupUsed(): void {
    track('ask_followup_used');
}

/** The user stopped an in-flight answer (engagement/latency signal). */
export function trackAskStopped(): void {
    track('ask_stopped');
}

/** A reminder was set on a card. */
export function trackReminderSet(): void {
    track('reminder_set');
}

/** A card was saved successfully. */
export function trackSaveSucceeded(source?: string): void {
    track('save_succeeded', source ? { source } : undefined);
}

/** First successful save ever on this device (fires once). */
export function trackFirstSave(): void {
    trackOnce('first_save', 'first_save');
}

/** A save failed. `reason` must be a short fixed category, never a raw error. */
export function trackSaveFailed(reason?: string): void {
    track('save_failed', reason ? { reason } : undefined);
}
