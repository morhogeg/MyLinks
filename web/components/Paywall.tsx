'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Check, Plus, MessagesSquare, Newspaper, Youtube, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CitationGlyph } from '@/components/ui/Wordmark';
import ProBadge from '@/components/ui/ProBadge';
import { useEntitlement } from '@/components/EntitlementProvider';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { policyUrl, openExternal } from '@/lib/share';
import { isNativeApp } from '@/lib/api';
import { hapticLight, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/errorReporter';
import { syncEntitlement, planDate, endsPhrase, daysLeftLabel, calendarDaysUntil, type PaywallReason } from '@/lib/entitlement';
import {
    ProPackage, ProPeriod, getOfferings, purchase, restore, purchasesAvailability, annualSavingsPercent, annualPerMonth,
} from '@/lib/purchases';

/**
 * The Machina Pro paywall: a bottom sheet (centered card on desktop) with the
 * six-row feature list, the two real App Store packages (annual preselected,
 * with a "Save N%" chip computed from the store's own prices), one primary
 * button, a Restore link, and the Terms + Privacy links Apple requires on any
 * subscription screen alongside price and duration.
 *
 * Prices are never hardcoded: they come from RevenueCat's `default` offering,
 * already localized by StoreKit. When the offering fails to load the rows say
 * the price is unavailable and Continue stays disabled: nothing can be bought
 * without the store's own price on screen, and a fixed US price would be wrong
 * in every other storefront.
 *
 * On the web there is nothing to buy (purchases are native-only); the sheet
 * says so and keeps the legal links. Nothing here throws: every purchase call
 * resolves to an outcome, and a failed server sync after a successful purchase
 * still refreshes the plan and closes.
 */

const PERIOD_LABEL: Record<ProPeriod, { name: string; per: string }> = {
    annual: { name: 'Yearly', per: 'per year' },
    monthly: { name: 'Monthly', per: 'per month' },
};

const HEADLINE: Record<PaywallReason, string> = {
    saves: 'You’ve used this month’s free saves',
    asks: 'You’ve used this month’s free questions',
    imports: 'You’ve imported everything the free plan includes',
    synthesis: 'Read the whole weekly synthesis',
    digest: 'Curated digests come with Pro',
    youtube: 'YouTube key moments come with Pro',
    settings: 'Machina Pro',
    manual: 'Machina Pro',
};

// Free vs Pro, one row per difference, read as a table: the free column says
// exactly what you keep, the Pro column what you get. Icons are the app's own
// for each feature (+ the add button, MessagesSquare the Ask tab, the citation
// glyph the weekly synthesis card, Newspaper the digest card, Youtube the video
// scan, Layers the Collections tab). The last row is what both plans share,
// so free never reads as a trap.
type Cell = string | boolean;
// The free numbers come from the server (functions/quota.py), never from here.
const comparison = (free: { saves: number; asks: number }): { icon: React.ReactNode; label: string; free: Cell; pro: Cell }[] => [
    { icon: <Plus className="w-4 h-4" />, label: 'Saves', free: `${free.saves}/month`, pro: 'Unlimited' },
    { icon: <MessagesSquare className="w-4 h-4" />, label: 'Ask Machina', free: `${free.asks}/month`, pro: 'Unlimited' },
    { icon: <CitationGlyph className="w-3.5 h-auto" />, label: 'Weekly synthesis', free: 'Preview', pro: 'Full' },
    { icon: <Newspaper className="w-4 h-4" />, label: 'Curated digests', free: false, pro: true },
    { icon: <Youtube className="w-4 h-4" />, label: 'YouTube key moments', free: false, pro: true },
    { icon: <Layers className="w-4 h-4" />, label: 'Search & collections', free: true, pro: true },
];

function CellValue({ value, pro }: { value: Cell; pro: boolean }) {
    if (value === true) return <Check className={`w-4 h-4 ${pro ? 'text-text' : 'text-text-muted'}`} strokeWidth={2.5} aria-label="Included" />;
    if (value === false) return <span className="text-text-muted" aria-label="Not included">–</span>;
    return <span className={pro ? 'font-semibold text-text' : 'text-text-muted'}>{value}</span>;
}

export default function Paywall({
    isOpen,
    reason,
    onClose,
    onPurchased,
}: {
    isOpen: boolean;
    reason: PaywallReason;
    onClose: () => void;
    /** Re-fetch the entitlement after a purchase or restore. */
    onPurchased: () => Promise<void>;
}) {
    const {
        isTrial, isPro, source, waiting, endsAt, period: subPeriod, willRenew, billingIssue, freeLimits,
    } = useEntitlement();
    const availability = purchasesAvailability();
    const [packages, setPackages] = useState<ProPackage[] | null>(null);
    const [period, setPeriod] = useState<ProPeriod>('annual');
    const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
    const [note, setNote] = useState<string | null>(null);
    // Bumped by "Try again" when the offering failed to load.
    const [offeringsAttempt, setOfferingsAttempt] = useState(0);

    useScrollLock(isOpen);
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile && busy === null });

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && busy === null) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose, busy]);

    // Offerings load on every open: prices can change, and a first open right
    // after sign-in may race the SDK configure (an empty result then offers
    // Try again, which re-runs this).
    useEffect(() => {
        if (!isOpen) return;
        setNote(null);
        setPeriod('annual');
        let cancelled = false;
        if (!availability.available) { setPackages([]); return; }
        setPackages(null);
        getOfferings().then((pkgs) => { if (!cancelled) setPackages(pkgs); });
        return () => { cancelled = true; };
        // availability is derived from constants; re-running on it would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, offeringsAttempt]);

    const annual = packages?.find((p) => p.period === 'annual');
    const monthly = packages?.find((p) => p.period === 'monthly');
    const savings = annualSavingsPercent(annual, monthly);
    const selected = period === 'annual' ? annual : monthly;
    const offeringsFailed = packages !== null && packages.length === 0 && availability.available;

    const priceOf = (p: ProPeriod) => (p === 'annual' ? annual : monthly)?.priceString ?? null;

    const finish = useCallback(async (kind: 'purchase' | 'restore', pro: boolean) => {
        // The server is the source of truth: re-read the subscription from
        // RevenueCat and rewrite the entitlement. A sync failure (the secret
        // not configured yet, a blip) must not swallow a paid purchase: refresh
        // anyway and tell the user in plain words. The server's own text
        // ("REVENUECAT_SECRET_KEY missing", "HTTP 503") is for us, not them;
        // the RevenueCat webhook still lands the entitlement on its own.
        let synced = true;
        try {
            await syncEntitlement();
        } catch (e) {
            synced = false;
            reportError(e, `paywall.${kind}.sync`);
        }
        await onPurchased();
        track(kind === 'purchase' ? 'paywall_purchase' : 'paywall_restore', { ok: pro, kind: period });
        if (pro && synced) {
            hapticSuccess();
            onClose();
        } else if (pro) {
            hapticSuccess();
            setNote(kind === 'restore'
                ? 'Your purchase was found. Pro turns on in a moment.'
                : 'Your purchase went through. Pro turns on in a moment.');
        } else if (kind === 'restore') {
            setNote('No Machina Pro purchase was found for this Apple ID.');
        } else {
            setNote('Purchase received. It can take a moment to activate.');
        }
    }, [onPurchased, onClose, period]);

    const buy = async () => {
        if (!selected || busy) return;
        hapticLight();
        setBusy('purchase');
        setNote(null);
        try {
            const r = await purchase(selected);
            if (r.ok) await finish('purchase', r.pro);
            else if (!r.cancelled) { hapticWarning(); setNote(r.message); }
        } finally {
            setBusy(null);
        }
    };

    const doRestore = async () => {
        if (busy) return;
        hapticLight();
        setBusy('restore');
        setNote(null);
        try {
            const r = await restore();
            if (r.ok) await finish('restore', r.pro);
            else if (!r.cancelled) { hapticWarning(); setNote(r.message); }
        } finally {
            setBusy(null);
        }
    };

    if (!isOpen) return null;

    const canBuy = availability.available && !!selected && busy === null;
    // At the save wall nothing was refused: the save was kept as `waiting`
    // (functions/deferred_capture.py). Say so, with the backlog, so the sheet
    // reads as an offer and not as a lost save.
    const waitingLine = reason === 'saves' || waiting > 0
        ? (waiting > 0
            ? `${waiting} ${waiting === 1 ? 'save is' : 'saves are'} waiting to be read. Machina reads them next month, or right away with Pro.`
            : 'Your saves are kept. Machina reads them next month, or right away with Pro.')
        : null;
    // Already Pro for good (a subscription, or the owner's own account): there
    // is nothing to buy, so the plan picker gives way to a status card.
    const proActive = isPro && !isTrial;
    const perMonth = annualPerMonth(annual);
    const rows = comparison(freeLimits);
    // The trial counts down from sign-up: days left, a bar that empties, and
    // the date it ends, so nobody is surprised on day 15.
    const trialLeft = isTrial && endsAt !== null ? calendarDaysUntil(endsAt) : null;
    const trialFraction = trialLeft !== null ? Math.max(0.04, Math.min(1, trialLeft / 14)) : 0;
    const endsOn = planDate(endsAt);
    // Someone who already has Pro sees where they stand first ("Yearly plan ·
    // Renews Oct 13, 2027", or that it never ends), then what's included. A
    // Free-vs-Pro comparison is for deciding, not for owning.
    const statusLine = !proActive ? null
        : source === 'owner' ? 'On for this account, with no end date. Nothing to renew.'
            : billingIssue ? 'Apple couldn’t charge your payment method. Update it to keep Pro.'
                : [
                    subPeriod ? `${PERIOD_LABEL[subPeriod].name} plan` : null,
                    willRenew === false
                        ? `Renewal is off. Pro stays on until ${endsOn ?? 'the end of this period'}.`
                        : endsOn ? `Renews ${endsOn}.` : null,
                ].filter(Boolean).join(' · ');

    // Apple bills the moment someone subscribes, trial or not (the 14 days are
    // Machina's, not the App Store's), so a trial user is told so up front.
    // Cancelling happens in the App Store, never in the app, so that is where
    // the sheet says to go.
    const price = priceOf(period);
    const legalLine = [
        price ? `${isTrial ? 'Billing starts today: ' : ''}${price} ${PERIOD_LABEL[period].per}.` : null,
        'Renews automatically. Cancel anytime in your App Store subscriptions.',
    ].filter(Boolean).join(' ');
    const manageSubscription = () => openExternal(isNativeApp()
        ? 'itms-apps://apps.apple.com/account/subscriptions'
        : 'https://apps.apple.com/account/subscriptions');

    return (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center animate-fade-in">
            <div ref={scrimRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />

            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Machina Pro"
                className="relative w-full sm:max-w-md bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb max-h-[calc(100%-env(safe-area-inset-top)-1.5rem)] sm:max-h-[88vh] flex flex-col"
            >
                <div {...handleProps}>
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>
                    <div className="flex items-start gap-3 px-6 pt-3 pb-1">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[26px] font-bold text-text leading-tight tracking-[-0.02em]">
                                {HEADLINE[reason]}
                            </h2>
                            {waitingLine && (
                                <p className="mt-1.5 text-[14px] text-text-secondary leading-snug">{waitingLine}</p>
                            )}
                            {statusLine && (
                                <p className={`mt-1.5 text-[14px] leading-snug ${billingIssue && source === 'revenuecat' ? 'text-warning' : 'text-text-secondary'}`}>{statusLine}</p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            disabled={busy !== null}
                            aria-label="Close"
                            className="w-11 h-11 -me-3 -mt-1.5 shrink-0 flex items-center justify-center rounded-full text-text-muted [@media(hover:hover)]:hover:text-text [@media(hover:hover)]:hover:bg-fill-subtle active:opacity-60 transition-colors disabled:opacity-40"
                        >
                            <span className="w-7 h-7 rounded-full bg-fill-subtle flex items-center justify-center">
                                <X className="w-4 h-4" strokeWidth={2.5} />
                            </span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]">
                    {trialLeft !== null && (
                        <div className="mb-4 rounded-2xl bg-card-hover px-4 py-3.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-[15px] font-semibold text-text">Pro trial</span>
                                <span className="text-[15px] font-semibold text-text tabular-nums">
                                    {daysLeftLabel(endsAt as number)}
                                </span>
                            </div>
                            <div className="mt-2.5 h-1.5 rounded-full bg-fill-strong overflow-hidden" aria-hidden>
                                <div className="h-full rounded-full bg-accent" style={{ width: `${trialFraction * 100}%` }} />
                            </div>
                            <p className="mt-2.5 text-[12.5px] text-text-muted leading-snug">
                                Ends {endsPhrase(endsAt as number)}. Then you keep the free plan and everything you saved. Nothing to cancel.
                            </p>
                        </div>
                    )}
                    <table className="w-full text-[14px] leading-tight border-collapse">
                        {proActive ? (
                            <caption className="pb-2 text-start text-[12px] font-semibold text-text-muted">Included in your plan</caption>
                        ) : (
                            <thead>
                                <tr className="text-[12px] font-semibold">
                                    <th scope="col" className="sr-only">Feature</th>
                                    <th scope="col" className="w-[72px] pb-2 text-center font-semibold text-text-muted">Free</th>
                                    <th scope="col" className="w-[76px] pb-2 text-center">
                                        <span className="inline-flex items-center"><ProBadge /></span>
                                    </th>
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.label} className="border-t border-border-subtle">
                                    <th scope="row" className="py-3 pe-2 text-start font-medium text-text">
                                        <span className="flex items-center gap-2.5">
                                            <span className="w-5 shrink-0 flex justify-center text-text-secondary">{row.icon}</span>
                                            {row.label}
                                        </span>
                                    </th>
                                    {!proActive && (
                                        <td className="py-3 text-center text-[13px]"><span className="inline-flex justify-center"><CellValue value={row.free} pro={false} /></span></td>
                                    )}
                                    <td className={`py-3 text-[13px] ${proActive ? 'text-end' : 'text-center'}`}><span className={`inline-flex ${proActive ? 'justify-end' : 'justify-center'}`}><CellValue value={row.pro} pro /></span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="shrink-0 px-6 pt-3">
                    {proActive && source === 'revenuecat' ? (
                        <>
                            <Button
                                variant={billingIssue ? 'primary' : 'secondary'}
                                radius="full"
                                onClick={manageSubscription}
                                className="w-full h-12 text-[16px] font-semibold"
                            >
                                Manage in the App Store
                            </Button>
                            <p className="mt-2.5 text-center text-[12px] text-text-muted leading-snug">
                                Change your plan or cancel there. Pro stays on until the end of the period you paid for.
                            </p>
                        </>
                    ) : proActive ? null : availability.available ? (
                        <>
                            <div className="grid grid-cols-2 gap-2.5">
                                <PlanTile
                                    period="annual"
                                    price={priceOf('annual')}
                                    detail={perMonth ? `${perMonth}/month` : null}
                                    selected={period === 'annual'}
                                    chip={savings ? `Save ${savings}%` : null}
                                    loading={packages === null}
                                    onSelect={() => { hapticLight(); setPeriod('annual'); }}
                                />
                                <PlanTile
                                    period="monthly"
                                    price={priceOf('monthly')}
                                    detail={null}
                                    selected={period === 'monthly'}
                                    chip={null}
                                    loading={packages === null}
                                    onSelect={() => { hapticLight(); setPeriod('monthly'); }}
                                />
                            </div>

                            {offeringsFailed && (
                                <div className="mt-1 flex items-center justify-center gap-1">
                                    <p role="status" className="text-[12.5px] text-text-muted leading-snug">
                                        Couldn’t load prices.
                                    </p>
                                    <button
                                        onClick={() => { hapticLight(); setOfferingsAttempt((n) => n + 1); }}
                                        className="min-h-[44px] px-1.5 text-[12.5px] font-semibold text-accent active:opacity-60 cursor-pointer"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            <Button
                                variant="primary"
                                radius="full"
                                onClick={buy}
                                disabled={!canBuy}
                                className={`${offeringsFailed ? 'mt-1' : 'mt-4'} w-full h-[52px] text-[17px] font-semibold`}
                            >
                                {busy === 'purchase' ? 'Opening the App Store…' : isTrial ? 'Keep Pro' : 'Subscribe'}
                            </Button>
                            <p className="mt-2.5 text-center text-[12px] text-text-muted leading-snug">{legalLine}</p>
                        </>
                    ) : availability.reason === 'web' ? (
                        <div className="rounded-2xl bg-card-hover px-4 py-4 text-center">
                            <p className="text-[15px] font-semibold text-text">Subscribe in the Machina app on iPhone</p>
                            <p className="mt-1 text-[13px] text-text-muted leading-snug">
                                Your plan applies everywhere you sign in with this account, including here.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-2xl bg-card-hover px-4 py-4 text-center">
                            <p className="text-[14px] text-text-secondary leading-snug">
                                Subscriptions aren’t available in this build yet.
                            </p>
                        </div>
                    )}

                    {note && (
                        <p role="status" className="mt-2 text-center text-[13px] text-warning leading-snug">{note}</p>
                    )}

                    <div className="mt-0.5 mb-1 flex items-center justify-center text-[12px] text-text-muted">
                        {availability.available && !proActive && (
                            <>
                                <button
                                    onClick={doRestore}
                                    disabled={busy !== null}
                                    className="min-h-[44px] px-2 [@media(hover:hover)]:hover:text-text active:opacity-60 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                    {busy === 'restore' ? 'Restoring…' : 'Restore Purchases'}
                                </button>
                                <span aria-hidden className="text-border-strong">·</span>
                            </>
                        )}
                        <button onClick={() => openExternal(policyUrl('/terms'))} className="min-h-[44px] px-2 [@media(hover:hover)]:hover:text-text active:opacity-60 transition-colors cursor-pointer">
                            Terms
                        </button>
                        <span aria-hidden className="text-border-strong">·</span>
                        <button onClick={() => openExternal(policyUrl('/privacy'))} className="min-h-[44px] px-2 [@media(hover:hover)]:hover:text-text active:opacity-60 transition-colors cursor-pointer">
                            Privacy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PlanTile({
    period, price, detail, selected, chip, loading, onSelect,
}: {
    period: ProPeriod;
    price: string | null;
    /** Added after the billing period under the price (the annual plan's per-month cost), or null. */
    detail: string | null;
    selected: boolean;
    chip: string | null;
    loading: boolean;
    onSelect: () => void;
}) {
    const label = PERIOD_LABEL[period];
    return (
        <button
            onClick={onSelect}
            aria-pressed={selected}
            className={`relative min-h-[96px] flex flex-col items-start justify-center rounded-2xl px-4 py-3 text-start transition-[colors,transform,box-shadow] duration-150 active:scale-[0.98] cursor-pointer ${selected ? 'bg-accent/8 ring-2 ring-accent' : 'bg-card ring-1 ring-border-strong [@media(hover:hover)]:hover:bg-card-hover'}`}
        >
            {chip && (
                <span className="absolute -top-2.5 start-3 rounded-full bg-accent text-accent-ink text-[10.5px] font-bold px-2 py-0.5">
                    {chip}
                </span>
            )}
            <span className="text-[13px] font-semibold text-text-secondary">{label.name}</span>
            {loading ? (
                <>
                    <span className="mt-1.5 block h-5 w-20 rounded bg-fill-strong animate-pulse" />
                    <span className="mt-1.5 block h-3 w-14 rounded bg-fill-subtle animate-pulse" />
                </>
            ) : price ? (
                <>
                    <span className="mt-0.5 text-[20px] font-bold text-text tabular-nums leading-tight">{price}</span>
                    <span className="mt-0.5 text-[12px] text-text-muted tabular-nums">{detail ? `${label.per} · ${detail}` : label.per}</span>
                </>
            ) : (
                <span className="mt-1 text-[13px] text-text-muted">Price unavailable</span>
            )}
            {selected && (
                <span className="absolute top-3 end-3 w-5 h-5 rounded-full bg-accent text-accent-ink flex items-center justify-center">
                    <Check className="w-3 h-3" strokeWidth={3} />
                </span>
            )}
        </button>
    );
}
