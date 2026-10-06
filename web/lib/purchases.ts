'use client';

/**
 * RevenueCat wrapper (Machina Pro). Native iOS only.
 *
 * The plugin (`@revenuecat/purchases-capacitor`) is loaded lazily and only
 * inside the native shell, gated by the canonical `isNativeApp()` (never
 * `Boolean(window.Capacitor)`, which is truthy on the web). On the web every
 * call resolves to the "unavailable" state so the paywall can say "subscribe
 * in the app" and nothing ever throws into the UI.
 *
 * Identity: the RevenueCat app user id is the Firebase AUTH uid, never the
 * workspace uid (which is a phone number for the legacy workspace and must not
 * leave our systems). `configurePurchases` runs after sign-in,
 * `logOutPurchases` on sign-out. The server maps the auth uid back to the
 * workspace exactly the way every /api/* endpoint does.
 *
 * Config: `NEXT_PUBLIC_REVENUECAT_IOS_KEY` (the PUBLIC SDK key, baked into
 * the TestFlight build by ios-testflight.yml). Empty → unavailable.
 */

import { isNativeApp } from './api';
import { reportError } from './errorReporter';

// Identifiers agreed with the owner (SOURCE_OF_TRUTH §4 item 26). Nothing
// else may invent different ones.
export const RC_ENTITLEMENT_ID = 'pro';
export const RC_OFFERING_ID = 'default';
export const RC_PACKAGE_ANNUAL = '$rc_annual';
export const RC_PACKAGE_MONTHLY = '$rc_monthly';

const IOS_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? '';

export type ProPeriod = 'annual' | 'monthly';

/** The two things the paywall needs from a package, plus the handle to buy it. */
export interface ProPackage {
    period: ProPeriod;
    /** App Store product id, e.g. com.morhogeg.machina.pro.annual */
    productId: string;
    /** Localized price string straight from StoreKit ("$49.99"). */
    priceString: string;
    /** Numeric price in the store currency, for the "Save N%" math. */
    price: number;
    currencyCode: string;
    /** Opaque native package; passed back to purchase(). */
    raw: unknown;
}

export type PurchasesAvailability =
    | { available: true }
    | { available: false; reason: 'web' | 'no-key' | 'plugin' };

export type PurchaseOutcome =
    | { ok: true; pro: boolean }
    | { ok: false; cancelled: true }
    | { ok: false; cancelled: false; message: string };

type PurchasesPlugin = typeof import('@revenuecat/purchases-capacitor').Purchases;

let pluginPromise: Promise<PurchasesPlugin | null> | null = null;
let configuredFor: string | null = null;

/** Why purchases can't run here, or `{available: true}`. Synchronous, cheap. */
export function purchasesAvailability(): PurchasesAvailability {
    if (!isNativeApp()) return { available: false, reason: 'web' };
    if (!IOS_KEY) return { available: false, reason: 'no-key' };
    return { available: true };
}

async function plugin(): Promise<PurchasesPlugin | null> {
    if (!purchasesAvailability().available) return null;
    if (!pluginPromise) {
        pluginPromise = import('@revenuecat/purchases-capacitor')
            .then((m) => m.Purchases)
            .catch(() => null);
    }
    return pluginPromise;
}

/**
 * Configure the SDK for the signed-in account. Idempotent per auth uid: a
 * second call for the same uid is a no-op; a different uid re-identifies via
 * logIn so a device shared between accounts never mixes receipts.
 */
export async function configurePurchases(authUid: string): Promise<void> {
    const p = await plugin();
    if (!p || !authUid) return;
    try {
        if (configuredFor === null) {
            await p.configure({ apiKey: IOS_KEY, appUserID: authUid });
            configuredFor = authUid;
            return;
        }
        if (configuredFor !== authUid) {
            await p.logIn({ appUserID: authUid });
            configuredFor = authUid;
        }
    } catch {
        // A failed configure only means the paywall reports "unavailable";
        // the entitlement itself still comes from the server.
    }
}

/** Forget the account on sign-out (RevenueCat falls back to an anonymous id). */
export async function logOutPurchases(): Promise<void> {
    const p = await plugin();
    if (!p || configuredFor === null) return;
    try {
        await p.logOut();
    } catch {
        // Already anonymous, or never configured: nothing to undo.
    } finally {
        configuredFor = null;
    }
}

function periodOf(pkg: { identifier: string; packageType?: string }): ProPeriod | null {
    if (pkg.identifier === RC_PACKAGE_ANNUAL || pkg.packageType === 'ANNUAL') return 'annual';
    if (pkg.identifier === RC_PACKAGE_MONTHLY || pkg.packageType === 'MONTHLY') return 'monthly';
    return null;
}

/**
 * The `default` offering's annual + monthly packages with their real StoreKit
 * prices. Empty when unavailable, unconfigured, or the offering has not been
 * set up yet; the paywall then shows fallback labels without prices.
 */
export async function getOfferings(): Promise<ProPackage[]> {
    const p = await plugin();
    if (!p || configuredFor === null) return [];
    try {
        const offerings = await p.getOfferings();
        const offering = offerings.all?.[RC_OFFERING_ID] ?? offerings.current;
        if (!offering) return [];
        const out: ProPackage[] = [];
        for (const pkg of offering.availablePackages) {
            const period = periodOf(pkg);
            if (!period) continue;
            out.push({
                period,
                productId: pkg.product.identifier,
                priceString: pkg.product.priceString,
                price: pkg.product.price,
                currencyCode: pkg.product.currencyCode,
                raw: pkg,
            });
        }
        // Annual first: it is the preselected, recommended option.
        return out.sort((a, b) => (a.period === 'annual' ? -1 : 1) - (b.period === 'annual' ? -1 : 1));
    } catch {
        return [];
    }
}

function isCancelled(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false;
    const err = e as { code?: unknown; userCancelled?: unknown; message?: unknown };
    // PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR is "1" across the SDKs;
    // the legacy `userCancelled` flag is kept as a belt-and-braces check.
    return err.userCancelled === true || String(err.code) === '1'
        || /cancel/i.test(typeof err.message === 'string' ? err.message : '');
}

// RevenueCat error codes (PURCHASES_ERROR_CODE) with a plain answer. The SDK's
// own messages are written for developers ("There is an issue with your
// configuration"), so they never reach the screen; an unmapped code gets the
// generic line and goes to reportError with the SDK text, so a real store
// problem is still visible to us.
const OFFLINE = 'Couldn’t reach the App Store. Check your connection and try again.';
const OTHER_ACCOUNT = 'This Apple ID’s subscription belongs to a different Machina account. Sign in with that account to use it.';
const PLAIN_ERROR: Record<string, string> = {
    '2': 'The App Store had a problem with this purchase. Please try again.',
    '3': 'This device isn’t allowed to make purchases. Check Screen Time in Settings.',
    '5': 'This plan can’t be bought right now. Please try again later.',
    '6': 'This Apple ID already has Machina Pro. Tap Restore purchases.',
    '7': OTHER_ACCOUNT,
    '10': OFFLINE,
    '13': OTHER_ACCOUNT,
    '15': 'A purchase is already in progress. Give it a moment.',
    '20': 'Your purchase is waiting for approval. Pro turns on once it’s approved.',
    '32': 'The App Store took too long to answer. Please try again.',
    '35': OFFLINE,
};

function messageOf(e: unknown, action: 'purchase' | 'restore'): string {
    const err = (e && typeof e === 'object' ? e : {}) as { code?: unknown; message?: unknown };
    const code = err.code === undefined ? '' : String(err.code);
    const plain = PLAIN_ERROR[code];
    if (plain) return plain;
    reportError(
        new Error(`${action} failed (code ${code || 'none'}): ${typeof err.message === 'string' ? err.message : String(e)}`),
        'purchases',
    );
    return action === 'restore'
        ? 'Purchases could not be restored. Please try again.'
        : 'The purchase could not be completed. Please try again.';
}

/** Buy one of the packages from getOfferings(). Never throws. */
export async function purchase(pkg: ProPackage): Promise<PurchaseOutcome> {
    const p = await plugin();
    if (!p || configuredFor === null) {
        return { ok: false, cancelled: false, message: 'Purchases are not available right now.' };
    }
    try {
        const result = await p.purchasePackage({
            aPackage: pkg.raw as Parameters<PurchasesPlugin['purchasePackage']>[0]['aPackage'],
        });
        const pro = result.customerInfo.entitlements.active[RC_ENTITLEMENT_ID]?.isActive === true;
        return { ok: true, pro };
    } catch (e) {
        if (isCancelled(e)) return { ok: false, cancelled: true };
        return { ok: false, cancelled: false, message: messageOf(e, 'purchase') };
    }
}

/** Restore purchases made with this Apple ID. Never throws. */
export async function restore(): Promise<PurchaseOutcome> {
    const p = await plugin();
    if (!p || configuredFor === null) {
        return { ok: false, cancelled: false, message: 'Purchases are not available right now.' };
    }
    try {
        const result = await p.restorePurchases();
        const pro = result.customerInfo.entitlements.active[RC_ENTITLEMENT_ID]?.isActive === true;
        return { ok: true, pro };
    } catch (e) {
        if (isCancelled(e)) return { ok: false, cancelled: true };
        return { ok: false, cancelled: false, message: messageOf(e, 'restore') };
    }
}

/**
 * "Save 48%": how much cheaper a year is than twelve months. Null unless both
 * prices are real and the annual one is actually cheaper. Computed from the
 * store's own numbers, never hardcoded.
 */
export function annualSavingsPercent(annual: ProPackage | undefined, monthly: ProPackage | undefined): number | null {
    if (!annual || !monthly || !(annual.price > 0) || !(monthly.price > 0)) return null;
    const yearOfMonthly = monthly.price * 12;
    if (annual.price >= yearOfMonthly) return null;
    return Math.round((1 - annual.price / yearOfMonthly) * 100);
}
