'use client';

/**
 * Machina Pro entitlement: the client's view of the plan.
 *
 * The server owns the truth (functions/entitlement.py, served by
 * GET /api/entitlement); this module fetches it, types it, and gives non-React
 * code (storage.ts, AddLinkForm's save path) a way to open the paywall when a
 * quota 429 says `upgrade: true`. The React side lives in
 * components/EntitlementProvider.tsx.
 *
 * Nothing here throws into the UI: a failed fetch resolves to `null` and the
 * app keeps treating the user as it did before (no Pro chrome, no gates
 * beyond the server's own). Gating is always enforced server-side; the client
 * only decides what to SHOW.
 */

import { apiUrl, fetchWithTimeout } from './api';
import { authHeaders } from './auth';

export type Plan = 'free' | 'pro';
export type EntitlementSource = 'trial' | 'owner' | 'revenuecat' | null;

export interface QuotaMeter {
    used: number;
    /** 0 means unmetered (the server disabled the check). */
    limit: number;
}

export interface Entitlement {
    plan: Plan;
    source: EntitlementSource;
    proUntil: number | null;
    /** When the trial ends: 14 days from sign-up (since 2026-10-13). */
    trialEndsAt: number | null;
    /** When the trial's 14 days began. Null only on an old doc not read since. */
    trialAnchorAt: number | null;
    /** App Store product of a subscription (…pro.annual / …pro.monthly), or null. */
    productId: string | null;
    /**
     * Whether Apple will charge again at `proUntil`. False once the user
     * cancelled (Pro still runs to the end of the paid period); null when
     * unknown or not a subscription.
     */
    willRenew: boolean | null;
    /** Apple could not charge the payment method (grace period / retry). */
    billingIssue: boolean;
    /** The free plan's numbers, from the server, so no screen hardcodes them. */
    freeLimits: { saves: number; asks: number; imports: number };
    quotas: { saves: QuotaMeter; asks: QuotaMeter; imports: QuotaMeter };
    /**
     * Saves kept past the monthly allowance and not read yet (`status:
     * 'waiting'` cards). The server reads them next month, or right away on an
     * upgrade. 0 from a server that predates the field.
     */
    waiting: number;
}

/** Every metered kind. `imports` is a lifetime allowance, the others monthly. */
export type QuotaKind = 'saves' | 'asks' | 'imports';

/** The shape a quota 429 carries (functions/main.py _quota_blocked). */
export interface UpgradeHint {
    upgrade: true;
    kind: QuotaKind;
    used: number;
    limit: number;
    error?: string;
}

const FREE_ENTITLEMENT: Entitlement = {
    plan: 'free',
    source: null,
    proUntil: null,
    trialEndsAt: null,
    trialAnchorAt: null,
    productId: null,
    willRenew: null,
    billingIssue: false,
    // Fallbacks for a server that predates the field (functions/quota.py).
    freeLimits: { saves: 50, asks: 20, imports: 500 },
    quotas: {
        saves: { used: 0, limit: 0 },
        asks: { used: 0, limit: 0 },
        imports: { used: 0, limit: 0 },
    },
    waiting: 0,
};

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function numOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Coerce whatever the server sent into a well-typed Entitlement. */
export function parseEntitlement(raw: unknown): Entitlement {
    if (!raw || typeof raw !== 'object') return FREE_ENTITLEMENT;
    const r = raw as Record<string, unknown>;
    const quotas = (r.quotas && typeof r.quotas === 'object' ? r.quotas : {}) as Record<string, unknown>;
    const meter = (k: string): QuotaMeter => {
        const m = (quotas[k] && typeof quotas[k] === 'object' ? quotas[k] : {}) as Record<string, unknown>;
        return { used: num(m.used), limit: num(m.limit) };
    };
    const source = r.source;
    return {
        plan: r.plan === 'pro' ? 'pro' : 'free',
        source: source === 'trial' || source === 'owner' || source === 'revenuecat' ? source : null,
        proUntil: numOrNull(r.proUntil),
        trialEndsAt: numOrNull(r.trialEndsAt),
        trialAnchorAt: numOrNull(r.trialAnchorAt),
        productId: typeof r.productId === 'string' && r.productId ? r.productId : null,
        willRenew: typeof r.willRenew === 'boolean' ? r.willRenew : null,
        billingIssue: r.billingIssue === true,
        freeLimits: (() => {
            const f = (r.freeLimits && typeof r.freeLimits === 'object' ? r.freeLimits : {}) as Record<string, unknown>;
            const d = FREE_ENTITLEMENT.freeLimits;
            return { saves: numOrNull(f.saves) ?? d.saves, asks: numOrNull(f.asks) ?? d.asks, imports: numOrNull(f.imports) ?? d.imports };
        })(),
        quotas: { saves: meter('saves'), asks: meter('asks'), imports: meter('imports') },
        waiting: num(r.waiting),
    };
}

/**
 * GET /api/entitlement for the signed-in user. Resolves to null (never
 * throws) when signed out, offline, or the endpoint isn't deployed yet.
 */
export async function fetchEntitlement(): Promise<Entitlement | null> {
    try {
        const headers = await authHeaders();
        if (!headers.Authorization) return null;
        const res = await fetchWithTimeout(apiUrl('/api/entitlement'), { headers }, 15_000);
        if (!res.ok) return null;
        return parseEntitlement(await res.json());
    } catch {
        return null;
    }
}

/**
 * POST /api/entitlement/sync after a purchase or restore: the server re-reads
 * the subscription from RevenueCat and returns the fresh entitlement. Throws
 * with the server's message on a non-2xx so the paywall can show it.
 */
export async function syncEntitlement(): Promise<Entitlement> {
    const res = await fetchWithTimeout(apiUrl('/api/entitlement/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: '{}',
    }, 30_000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(
            typeof data?.error === 'string' ? data.error : `Could not confirm your subscription (HTTP ${res.status}).`,
        );
    }
    return parseEntitlement(data);
}

/**
 * Wake the sync function while Apple's purchase sheet is up. Nothing calls it
 * until someone buys, so it is nearly always cold, and the cold start used to
 * land after the purchase. A bare GET is a CORS simple request (no preflight)
 * and the function answers 405 before any auth or RevenueCat call.
 * Fire-and-forget: never throws, the answer is ignored.
 */
export function warmEntitlementSync(): void {
    try {
        fetch(apiUrl('/api/entitlement/sync'), { method: 'GET', mode: 'no-cors' }).catch(() => {});
    } catch { /* no fetch: nothing to warm */ }
}

/** True when a parsed error body is a free-plan quota wall. */
export function isUpgradeHint(data: unknown): data is UpgradeHint {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return d.upgrade === true
        && (d.kind === 'saves' || d.kind === 'asks' || d.kind === 'imports');
}

/**
 * The 200 a capture endpoint answers for a save kept past the monthly
 * allowance (functions/main.py `_waiting_response`): the card is saved as
 * `waiting` and only the AI read waits. Not an error: never a failed card,
 * never a Retry, never an error toast.
 */
export interface WaitingSave {
    waiting: true;
    /** True on the free plan (Pro's cap is an abuse ceiling: nothing to buy). */
    upgrade?: boolean;
    message?: string;
}

export function isWaitingSave(data: unknown): data is WaitingSave {
    return !!data && typeof data === 'object' && (data as Record<string, unknown>).waiting === true;
}

/**
 * A 429 that is the monthly SAVE wall (a server from before saves were kept,
 * or a path that still refuses), as opposed to the rate limiter. The client
 * then keeps the card as `waiting` itself, so the user sees the same thing
 * either way. Returns the equivalent WaitingSave, or null.
 */
export function saveWallAsWaiting(status: number, data: unknown): WaitingSave | null {
    if (status !== 429 || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    if (d.kind !== 'saves') return null;
    return { waiting: true, upgrade: d.upgrade === true, message: waitingSaveMessage(d.upgrade === true) };
}

/** The line a waiting save shows, mirroring deferred_capture.waiting_message. */
export function waitingSaveMessage(upgrade: boolean): string {
    return upgrade
        ? 'Saved. Machina will read it next month, or now with Pro.'
        : 'Saved. Machina will read it next month.';
}

/**
 * Tell the user a save was kept for later: on the free plan the paywall opens
 * (it names the backlog, so it IS the confirmation) and this returns null; on
 * Pro it returns the one calm line the caller should show. Either way the
 * capture flow shows nothing else.
 */
export function announceWaitingSave(data: WaitingSave): string | null {
    if (data.upgrade) {
        requestPaywall('saves');
        return null;
    }
    return typeof data.message === 'string' && data.message ? data.message : waitingSaveMessage(false);
}

/**
 * A plan date the way Apple writes them: "Oct 27", with the year only when it
 * isn't this year ("Oct 13, 2027"). Null when there is no date.
 */
export function planDate(ts: number | null, now = Date.now()): string | null {
    if (ts === null) return null;
    const d = new Date(ts);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString(undefined, sameYear
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * When something ends, as a person would say it: "today", "tomorrow", or
 * "on Oct 27". Calendar days in the viewer's time zone, not 24-hour blocks,
 * so a trial ending at 9am tomorrow never reads as "today".
 */
export function endsPhrase(ts: number, now = Date.now()): string {
    const diff = calendarDaysUntil(ts, now);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'tomorrow';
    return `on ${planDate(ts, now)}`;
}

/** Calendar days from today to `ts` in the viewer's time zone (0 = today). */
export function calendarDaysUntil(ts: number, now = Date.now()): number {
    const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    return Math.max(0, Math.round((day(ts) - day(now)) / 86_400_000));
}

/** "Last day", "1 day left", "9 days left": a countdown that agrees with endsPhrase. */
export function daysLeftLabel(ts: number, now = Date.now()): string {
    const n = calendarDaysUntil(ts, now);
    return n === 0 ? 'Last day' : `${n} ${n === 1 ? 'day' : 'days'} left`;
}

/** Whole days until `ts`, floored at 0; null when there is no date. */
export function daysUntil(ts: number | null, now = Date.now()): number | null {
    if (ts === null) return null;
    return Math.max(0, Math.ceil((ts - now) / 86_400_000));
}

/** "18 of 20 questions left this month", or null when unmetered. */
export function meterLabel(kind: QuotaKind, m: QuotaMeter): string | null {
    if (!m.limit) return null;
    const left = Math.max(0, m.limit - m.used);
    if (kind === 'imports') return `${left} of ${m.limit} imported links left`;
    const noun = kind === 'asks' ? 'questions' : 'saves';
    return `${left} of ${m.limit} ${noun} left this month`;
}

// ── Paywall request bus ──────────────────────────────────────────────────────
//
// The paywall is mounted once, by EntitlementProvider. Code that has no React
// context (a save helper catching a 429) asks for it through a DOM event; the
// provider listens and opens the sheet. Same mechanism as a store subscribe,
// without a store.

export const PAYWALL_EVENT = 'machina:paywall';

const PAYWALL_REASONS = ['saves', 'asks', 'imports', 'synthesis', 'digest', 'youtube', 'settings', 'manual'] as const;

export type PaywallReason = QuotaKind | (typeof PAYWALL_REASONS)[number];

/** True for a known reason; guards the `?paywall=` deep link against junk. */
export function isPaywallReason(v: unknown): v is PaywallReason {
    return typeof v === 'string' && (PAYWALL_REASONS as readonly string[]).includes(v);
}

const PENDING_PAYWALL_KEY = 'machina.pendingPaywall';

/**
 * Open the paywall even if the app is still booting (a push tapped from a cold
 * start fires before EntitlementProvider mounts). Stashes the reason for the
 * provider to pick up after sign-in, and fires the live event for a warm app;
 * whichever handles it first clears the stash.
 */
export function requestPaywallWhenReady(reason: PaywallReason): void {
    try { sessionStorage.setItem(PENDING_PAYWALL_KEY, reason); } catch { /* private mode */ }
    requestPaywall(reason);
}

/** Pop (and clear) a paywall request stashed by requestPaywallWhenReady. */
export function consumePendingPaywall(): PaywallReason | null {
    try {
        const raw = sessionStorage.getItem(PENDING_PAYWALL_KEY);
        if (raw === null) return null;
        sessionStorage.removeItem(PENDING_PAYWALL_KEY);
        return isPaywallReason(raw) ? raw : 'manual';
    } catch {
        return null;
    }
}

/** Ask the mounted paywall to open. Safe to call anywhere, including SSR (no-op). */
export function requestPaywall(reason: PaywallReason = 'manual'): void {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent<PaywallReason>(PAYWALL_EVENT, { detail: reason }));
    } catch {
        // CustomEvent unavailable (very old WebView) — nothing to open.
    }
}

/**
 * If `data` is a quota wall with an upgrade hint, open the paywall and return
 * true. Callers that surface a plain error toast otherwise use this first so
 * a free user sees the offer rather than "limit reached".
 */
export function offerUpgradeFor(data: unknown): boolean {
    if (!isUpgradeHint(data)) return false;
    requestPaywall(data.kind);
    return true;
}
