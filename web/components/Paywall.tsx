'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Check, Infinity as InfinityIcon, MessageCircle, BookOpen, Newspaper, Youtube, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CitationGlyph } from '@/components/ui/Wordmark';
import ProBadge from '@/components/ui/ProBadge';
import { useEntitlement } from '@/components/EntitlementProvider';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { policyUrl, openExternal } from '@/lib/share';
import { hapticLight, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { syncEntitlement, type PaywallReason } from '@/lib/entitlement';
import {
    ProPackage, ProPeriod, getOfferings, purchase, restore, purchasesAvailability, annualSavingsPercent,
} from '@/lib/purchases';

/**
 * The Machina Pro paywall: a bottom sheet (centered card on desktop) with the
 * six-row feature list, the two real App Store packages (annual preselected,
 * with a "Save N%" chip computed from the store's own prices), one primary
 * button, a Restore link, and the Terms + Privacy links Apple requires on any
 * subscription screen alongside price and duration.
 *
 * Prices are never hardcoded: they come from RevenueCat's `default` offering.
 * The literal fallback labels below appear ONLY when the offering fails to
 * load, so the screen still names the price and period it is about to bill.
 *
 * On the web there is nothing to buy (purchases are native-only); the sheet
 * says so and keeps the legal links. Nothing here throws: every purchase call
 * resolves to an outcome, and a failed server sync after a successful purchase
 * still refreshes the plan and closes.
 */

const FALLBACK_PRICE: Record<ProPeriod, string> = { annual: '$49.99', monthly: '$7.99' };
const PERIOD_LABEL: Record<ProPeriod, { name: string; per: string }> = {
    annual: { name: 'Yearly', per: 'per year' },
    monthly: { name: 'Monthly', per: 'per month' },
};

const HEADLINE: Record<PaywallReason, string> = {
    saves: 'You’ve used this month’s free saves',
    asks: 'You’ve used this month’s free questions',
    synthesis: 'Read the whole synthesis',
    digest: 'Curated digests come with Pro',
    youtube: 'Video transcripts come with Pro',
    settings: 'Machina Pro',
    manual: 'Machina Pro',
};

const FEATURES: { icon: React.ReactNode; title: string; free: string }[] = [
    { icon: <InfinityIcon className="w-4 h-4" />, title: 'Unlimited saves, each one read and filed', free: 'Free: 100 a month' },
    { icon: <MessageCircle className="w-4 h-4" />, title: 'Unlimited questions in Ask Machina', free: 'Free: 20 a month' },
    { icon: <BookOpen className="w-4 h-4" />, title: 'The full weekly synthesis', free: 'Free: title and first line' },
    { icon: <Newspaper className="w-4 h-4" />, title: 'Curated digests on your schedule', free: 'Pro only' },
    { icon: <Youtube className="w-4 h-4" />, title: 'YouTube videos watched for you, with key moments', free: 'Pro only' },
    { icon: <Layers className="w-4 h-4" />, title: 'Meaning search, collections, share pages, reminders', free: 'Included in both' },
];

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
    const { isTrial, daysLeft, isPro, source } = useEntitlement();
    const availability = purchasesAvailability();
    const [packages, setPackages] = useState<ProPackage[] | null>(null);
    const [period, setPeriod] = useState<ProPeriod>('annual');
    const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
    const [note, setNote] = useState<string | null>(null);

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
    // after sign-in may race the SDK configure (an empty result then shows the
    // fallback labels, which the next open corrects).
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
    }, [isOpen]);

    const annual = packages?.find((p) => p.period === 'annual');
    const monthly = packages?.find((p) => p.period === 'monthly');
    const savings = annualSavingsPercent(annual, monthly);
    const selected = period === 'annual' ? annual : monthly;
    const offeringsFailed = packages !== null && packages.length === 0 && availability.available;

    const priceOf = (p: ProPeriod) => (p === 'annual' ? annual : monthly)?.priceString
        ?? (offeringsFailed || !availability.available ? FALLBACK_PRICE[p] : null);

    const finish = useCallback(async (kind: 'purchase' | 'restore', pro: boolean) => {
        // The server is the source of truth: re-read the subscription from
        // RevenueCat and rewrite the entitlement. A sync failure (the secret
        // not configured yet, a blip) must not swallow a paid purchase: refresh
        // anyway and tell the user what happened.
        let synced = true;
        try {
            await syncEntitlement();
        } catch (e) {
            synced = false;
            setNote(e instanceof Error ? e.message : 'Could not confirm your subscription yet.');
        }
        await onPurchased();
        track(kind === 'purchase' ? 'paywall_purchase' : 'paywall_restore', { ok: pro, kind: period });
        if (pro && synced) {
            hapticSuccess();
            onClose();
        } else if (pro) {
            hapticSuccess();
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
    const trialLine = isTrial && daysLeft !== null
        ? (daysLeft === 0 ? 'Your free trial ends today.' : `Your free trial has ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left.`)
        : isPro && source === 'founder'
            ? 'You have Pro as a founding member. Subscribing keeps it after that ends.'
            : isPro && source === 'revenuecat'
                ? 'Machina Pro is active on this account.'
                : null;

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
                    <div className="flex items-start gap-3 px-5 pt-3 pb-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                                <CitationGlyph className="w-3 h-auto" />
                                Machina Pro
                            </div>
                            <h2 className="mt-1.5 text-[21px] font-bold text-text leading-tight tracking-[-0.01em]">
                                {HEADLINE[reason]}
                            </h2>
                            {trialLine && (
                                <p className="mt-1 text-[13px] text-text-secondary leading-snug">{trialLine}</p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            disabled={busy !== null}
                            aria-label="Close"
                            className="p-2 -me-2 -mt-1 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors disabled:opacity-40"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto px-5 pb-4">
                    {/* Feature list: what Pro adds, with the free tier's number
                        on each row so nothing is implied. */}
                    <ul className="flex flex-col gap-2">
                        {FEATURES.map((f) => (
                            <li key={f.title} className="flex items-start gap-3 rounded-xl bg-card-hover px-3.5 py-2.5">
                                <span className="mt-0.5 w-7 h-7 shrink-0 rounded-lg bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                                    {f.icon}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[14px] font-semibold text-text leading-snug">{f.title}</span>
                                    <span className="block text-[12px] text-text-muted mt-0.5">{f.free}</span>
                                </span>
                            </li>
                        ))}
                    </ul>

                    {availability.available ? (
                        <>
                            <div className="mt-4 flex flex-col gap-2">
                                <PlanRow
                                    period="annual"
                                    price={priceOf('annual')}
                                    selected={period === 'annual'}
                                    chip={savings ? `Save ${savings}%` : null}
                                    loading={packages === null}
                                    onSelect={() => { hapticLight(); setPeriod('annual'); }}
                                />
                                <PlanRow
                                    period="monthly"
                                    price={priceOf('monthly')}
                                    selected={period === 'monthly'}
                                    chip={null}
                                    loading={packages === null}
                                    onSelect={() => { hapticLight(); setPeriod('monthly'); }}
                                />
                            </div>

                            {offeringsFailed && (
                                <p className="mt-2 text-[12px] text-text-muted leading-snug">
                                    Prices could not be loaded from the App Store. Pull down to close and try again.
                                </p>
                            )}

                            <Button
                                variant="primary"
                                radius="full"
                                onClick={buy}
                                disabled={!canBuy}
                                className="mt-4 w-full h-11 text-[15px]"
                            >
                                {busy === 'purchase' ? 'Opening the App Store…' : 'Continue'}
                            </Button>
                            <p className="mt-2 text-center text-[12px] text-text-muted leading-snug">
                                {priceOf(period) ? `${priceOf(period)} ${PERIOD_LABEL[period].per}, ` : ''}
                                billed to your Apple ID. Renews automatically until cancelled in Settings.
                            </p>
                        </>
                    ) : availability.reason === 'web' ? (
                        <div className="mt-4 rounded-xl border border-border-subtle bg-card-hover px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2 text-[14px] font-semibold text-text">
                                <ProBadge /> Subscribe in the Machina app on iPhone
                            </div>
                            <p className="mt-1 text-[12.5px] text-text-muted leading-snug">
                                Your plan applies everywhere you sign in, including here.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-xl border border-border-subtle bg-card-hover px-4 py-3.5 text-center">
                            <p className="text-[13.5px] text-text-secondary leading-snug">
                                Subscriptions aren’t available in this build yet.
                            </p>
                        </div>
                    )}

                    {note && (
                        <p role="status" className="mt-3 text-center text-[13px] text-amber-500 leading-snug">{note}</p>
                    )}

                    <div className="mt-4 flex items-center justify-center gap-4 text-[12.5px] text-text-muted">
                        {availability.available && (
                            <button
                                onClick={doRestore}
                                disabled={busy !== null}
                                className="underline underline-offset-2 hover:text-text transition-colors disabled:opacity-50 cursor-pointer"
                            >
                                {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
                            </button>
                        )}
                        <button onClick={() => openExternal(policyUrl('/terms'))} className="underline underline-offset-2 hover:text-text transition-colors cursor-pointer">
                            Terms
                        </button>
                        <button onClick={() => openExternal(policyUrl('/privacy'))} className="underline underline-offset-2 hover:text-text transition-colors cursor-pointer">
                            Privacy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlanRow({
    period, price, selected, chip, loading, onSelect,
}: {
    period: ProPeriod;
    price: string | null;
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
            className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-start transition-colors cursor-pointer ${selected ? 'border-accent/60 bg-accent/8' : 'border-border-subtle bg-card hover:bg-card-hover'}`}
        >
            <span className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${selected ? 'border-accent bg-accent text-accent-ink' : 'border-border-strong'}`}>
                {selected && <Check className="w-3 h-3" strokeWidth={3} />}
            </span>
            <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-text">{label.name}</span>
                    {chip && (
                        <span className="rounded-full bg-accent/12 text-accent text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 ring-1 ring-accent/20">
                            {chip}
                        </span>
                    )}
                </span>
                <span className="block text-[12px] text-text-muted mt-0.5">
                    {period === 'annual' ? 'Best value. One payment a year.' : 'Flexible. Cancel any month.'}
                </span>
            </span>
            <span className="text-end shrink-0">
                {loading ? (
                    <span className="block h-4 w-14 rounded bg-fill-strong animate-pulse" />
                ) : (
                    <>
                        <span className="block text-[15px] font-bold text-text tabular-nums">{price ?? '...'}</span>
                        <span className="block text-[11px] text-text-muted">{label.per}</span>
                    </>
                )}
            </span>
        </button>
    );
}
