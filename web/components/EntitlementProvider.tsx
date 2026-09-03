'use client';

import {
    createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
    Entitlement, PaywallReason, PAYWALL_EVENT, fetchEntitlement, daysUntil,
} from '@/lib/entitlement';
import { configurePurchases, logOutPurchases } from '@/lib/purchases';
import { track } from '@/lib/analytics';
import Paywall from '@/components/Paywall';

/**
 * Machina Pro state for the whole app, plus the single mounted paywall.
 *
 * Loads GET /api/entitlement once the workspace resolves (AuthProvider owns
 * uid resolution; this sits just inside it), refreshes on foreground and after
 * a purchase/restore, and configures the RevenueCat SDK with the Firebase
 * AUTH uid on sign-in / logs it out on sign-out. Every consumer reads through
 * `useEntitlement()`; every "open the paywall" goes through `openPaywall()`
 * or, from non-React code, `requestPaywall()` in lib/entitlement.ts.
 *
 * Until the endpoint has answered, `loaded` is false and the plan reads as
 * free with unmetered quotas: no Pro chrome flashes, no gate is shown, and the
 * server keeps enforcing the real limits regardless.
 */

interface EntitlementContextType {
    plan: Entitlement['plan'];
    isPro: boolean;
    source: Entitlement['source'];
    proUntil: number | null;
    trialEndsAt: number | null;
    /** Whole days left on the current grant (trial / founder / subscription), or null. */
    daysLeft: number | null;
    /** True while a reverse trial is what makes the plan Pro. */
    isTrial: boolean;
    /**
     * True once the trial's 14 days are actually running. A brand-new workspace
     * is on the trial from day one, but the clock only starts at the tenth card,
     * so an unstarted trial has no end date and no days left to show.
     */
    trialStarted: boolean;
    /** How many cards start that clock (the server owns the number). */
    trialAnchorCards: number;
    quotas: Entitlement['quotas'];
    /** False until the first successful fetch; consumers hide meters until then. */
    loaded: boolean;
    refresh: () => Promise<void>;
    openPaywall: (reason?: PaywallReason) => void;
}

const UNMETERED: Entitlement['quotas'] = {
    saves: { used: 0, limit: 0 },
    asks: { used: 0, limit: 0 },
    imports: { used: 0, limit: 0 },
};

const EntitlementContext = createContext<EntitlementContextType>({
    plan: 'free',
    isPro: false,
    source: null,
    proUntil: null,
    trialEndsAt: null,
    daysLeft: null,
    isTrial: false,
    trialStarted: false,
    trialAnchorCards: 10,
    quotas: UNMETERED,
    loaded: false,
    refresh: async () => {},
    openPaywall: () => {},
});

export function useEntitlement() {
    return useContext(EntitlementContext);
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
    const { uid, authUid } = useAuth();
    // The entitlement is stored WITH the uid it was fetched for, so a
    // workspace switch never shows the previous account's plan for a frame.
    const [ent, setEnt] = useState<{ uid: string; data: Entitlement } | null>(null);
    const [paywall, setPaywall] = useState<{ open: boolean; reason: PaywallReason }>({
        open: false, reason: 'manual',
    });

    const refresh = useCallback(async () => {
        if (!uid) return;
        const next = await fetchEntitlement();
        if (next) setEnt({ uid, data: next });
    }, [uid]);

    // Load when the workspace resolves. A stale entry for a previous uid is
    // simply ignored by the `ent.uid === uid` check below, so nothing needs
    // clearing on sign-out. (Inline rather than `refresh()` so the state
    // write is visibly inside the fetch callback, never synchronous.)
    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        fetchEntitlement().then((next) => {
            if (!cancelled && next) setEnt({ uid, data: next });
        });
        return () => { cancelled = true; };
    }, [uid]);

    // Foreground refresh: a subscription can change outside the app (App
    // Store cancellation, the webhook), and a trial can end while it was
    // backgrounded.
    useEffect(() => {
        if (!uid) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [uid, refresh]);

    // RevenueCat identity follows the AUTH uid (never the workspace uid).
    useEffect(() => {
        if (authUid) {
            void configurePurchases(authUid);
        } else {
            void logOutPurchases();
        }
    }, [authUid]);

    // Non-React callers (a save helper catching a quota 429) open the paywall
    // through a DOM event; see lib/entitlement.ts requestPaywall.
    const openPaywall = useCallback((reason: PaywallReason = 'manual') => {
        setPaywall({ open: true, reason });
        track('paywall_shown', { source: reason });
    }, []);

    useEffect(() => {
        const onRequest = (e: Event) => {
            const reason = (e as CustomEvent<PaywallReason>).detail || 'manual';
            openPaywall(reason);
        };
        window.addEventListener(PAYWALL_EVENT, onRequest);
        return () => window.removeEventListener(PAYWALL_EVENT, onRequest);
    }, [openPaywall]);

    const closePaywall = useCallback(() => setPaywall((p) => ({ ...p, open: false })), []);

    const value = useMemo<EntitlementContextType>(() => {
        const live = ent && ent.uid === uid ? ent.data : null;
        const plan = live?.plan ?? 'free';
        const isPro = plan === 'pro';
        const source = live?.source ?? null;
        const isTrial = isPro && source === 'trial';
        // An unstarted trial holds Pro until a far-off ceiling. Reporting THAT
        // as "days left" would advertise a 60-day trial, so a trial with no
        // anchor has no countdown at all until the tenth card starts it.
        const trialStarted = !isTrial || live?.trialAnchorAt != null;
        const until = !isPro ? null
            : isTrial ? (trialStarted ? live?.trialEndsAt ?? null : null)
                : live?.proUntil ?? null;
        return {
            plan,
            isPro,
            source,
            proUntil: live?.proUntil ?? null,
            trialEndsAt: live?.trialEndsAt ?? null,
            daysLeft: daysUntil(until),
            isTrial,
            trialStarted,
            trialAnchorCards: live?.trialAnchorCards ?? 10,
            quotas: live?.quotas ?? UNMETERED,
            loaded: live !== null,
            refresh,
            openPaywall,
        };
    }, [ent, uid, refresh, openPaywall]);

    return (
        <EntitlementContext.Provider value={value}>
            {children}
            <Paywall
                isOpen={paywall.open}
                reason={paywall.reason}
                onClose={closePaywall}
                onPurchased={refresh}
            />
        </EntitlementContext.Provider>
    );
}
