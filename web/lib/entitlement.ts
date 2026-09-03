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
export type EntitlementSource = 'trial' | 'founder' | 'revenuecat' | null;

export interface QuotaMeter {
    used: number;
    /** 0 means unmetered (the server disabled the check). */
    limit: number;
}

export interface Entitlement {
    plan: Plan;
    source: EntitlementSource;
    proUntil: number | null;
    /** When the trial ends. Null on a trial whose clock has not started yet. */
    trialEndsAt: number | null;
    /**
     * When the library reached `trialAnchorCards` cards and the 14 days began.
     * Null means the trial is granted but not yet running: the user is Pro, and
     * the countdown has not started.
     */
    trialAnchorAt: number | null;
    /** How many cards start the trial clock (the server owns the number). */
    trialAnchorCards: number;
    quotas: { saves: QuotaMeter; asks: QuotaMeter; imports: QuotaMeter };
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
    trialAnchorCards: 10,
    quotas: {
        saves: { used: 0, limit: 0 },
        asks: { used: 0, limit: 0 },
        imports: { used: 0, limit: 0 },
    },
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
        source: source === 'trial' || source === 'founder' || source === 'revenuecat' ? source : null,
        proUntil: numOrNull(r.proUntil),
        trialEndsAt: numOrNull(r.trialEndsAt),
        trialAnchorAt: numOrNull(r.trialAnchorAt),
        // A server that predates the anchor rule sends no number; the copy that
        // reads it says "10 things", so that is the fallback.
        trialAnchorCards: numOrNull(r.trialAnchorCards) ?? FREE_ENTITLEMENT.trialAnchorCards,
        quotas: { saves: meter('saves'), asks: meter('asks'), imports: meter('imports') },
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

/** True when a parsed error body is a free-plan quota wall. */
export function isUpgradeHint(data: unknown): data is UpgradeHint {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return d.upgrade === true
        && (d.kind === 'saves' || d.kind === 'asks' || d.kind === 'imports');
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

export type PaywallReason = QuotaKind | 'synthesis' | 'digest' | 'youtube' | 'settings' | 'manual';

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
