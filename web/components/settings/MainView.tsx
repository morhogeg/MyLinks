'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Bell, Sun, Moon, Monitor, Clock, Compass, Lock, BarChart3, Heart, Crown, Puzzle, Upload } from 'lucide-react';
import { policyUrl, openExternal } from '@/lib/share';
import { isNativeApp } from '@/lib/api';
import { browserKind, chromeWebStoreUrl, extensionInAStore, macAppStoreUrl } from '@/lib/extension';
import ProfileAvatar from '../ProfileAvatar';
import DataExport from './DataExport';
import { accountTitle, isPrivateRelay } from './AccountSection';
import StopCardLinks from './StopCardLinks';
import ImportSheet from '@/components/ImportSheet';
import { useEntitlement } from '@/components/EntitlementProvider';
import { useToast } from '@/components/Toast';
import { planDate, endsPhrase, daysLeftLabel, syncEntitlement } from '@/lib/entitlement';
import { restore, purchasesAvailability } from '@/lib/purchases';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { reportError } from '@/lib/errorReporter';
import type { Settings, View } from './types';
import {
    SectionHeader, Footnote, List, RowShell, RowText, Chevron,
    NavRow, ExternalRow, Toggle, Segmented,
} from './primitives';

export function MainView({
    authUid, accountEmail, displayName, photoURL, providerLabel, providerName, settings, theme, setTheme,
    togglePush, pushNote, pushOnHere, aiConsentAt,
    privacyLockOn, onChangePin, onDisablePin,
    onReplayTour, go,
}: {
    authUid: string | null;
    accountEmail: string | null;
    displayName: string | null;
    photoURL: string | null;
    providerLabel: string;
    /** Bare provider name ("Google"), or null when it can't be named. */
    providerName: string | null;
    settings: Settings;
    theme: 'light' | 'dark' | 'system';
    setTheme: (t: 'light' | 'dark' | 'system') => void;
    togglePush: () => void;
    pushNote: string | null;
    /** Push is on for the account AND this iPhone can receive it. */
    pushOnHere: boolean;
    aiConsentAt: number | null;
    /** True when the private-collections PIN is set (null while loading). */
    privacyLockOn: boolean | null;
    onChangePin: () => void;
    onDisablePin: () => void;
    onReplayTour?: () => void;
    go: (v: View) => void;
}) {
    const remindersOrDigest = settings.reminders_enabled || settings.digest_enabled;
    // Plan section: one row that says exactly where the account stands (and
    // opens the plan sheet), the Apple-side actions next to it, and one
    // footnote with the date or the numbers that matter for this state.
    const ent = useEntitlement();
    const toast = useToast();
    const subscribed = ent.isPro && ent.source === 'revenuecat';
    const lastingPro = ent.isPro && !ent.isTrial;
    const endsOn = planDate(ent.endsAt);
    const proTitle = !ent.loaded ? 'Machina Pro'
        : ent.isTrial ? 'Pro trial'
            : ent.isPro ? 'Machina Pro' : 'Upgrade to Pro';
    const proValue = !ent.loaded ? undefined
        : ent.isTrial
            ? (ent.endsAt !== null ? daysLeftLabel(ent.endsAt) : undefined)
            : subscribed && ent.billingIssue ? 'Payment issue'
                : subscribed && ent.willRenew === false && endsOn ? `Ends ${endsOn}`
                    : subscribed && endsOn ? `Renews ${endsOn}`
                        : ent.isPro ? 'Active' : 'Free';
    const planNote = !ent.loaded ? null
        : ent.isTrial && ent.endsAt !== null
            ? `Your trial ends ${endsPhrase(ent.endsAt)}. After that you keep the free plan and everything you saved. Nothing to cancel.`
            : subscribed && ent.billingIssue
                ? 'Apple couldn’t charge your payment method. Update it in Manage subscription to keep Pro.'
                : subscribed && ent.willRenew === false
                    ? `Renewal is off, so Pro stays on until ${endsOn ?? 'the end of this period'} and then stops. Turn it back on in Manage subscription.`
                    : ent.isPro && ent.source === 'owner'
                        ? 'Pro is on for this account, with no end date.'
                    : subscribed
                        ? 'Billed by Apple. Change your plan or cancel anytime in Manage subscription; Pro stays on until the end of the period you paid for.'
                        : !ent.isPro && ent.quotas.saves.limit > 0
                            ? `This month: ${ent.quotas.saves.used} of ${ent.quotas.saves.limit} saves and ${ent.quotas.asks.used} of ${ent.quotas.asks.limit} questions. Resets on the 1st.`
                            : null;
    const manageSubscription = () => openExternal(isNativeApp()
        ? 'itms-apps://apps.apple.com/account/subscriptions'
        : 'https://apps.apple.com/account/subscriptions');
    // Restore lives here as well as on the plan sheet: someone who reinstalled
    // or changed phones looks for it in Settings first.
    const [restoring, setRestoring] = useState(false);
    const canRestore = purchasesAvailability().available && !lastingPro;
    const doRestore = async () => {
        if (restoring) return;
        hapticLight();
        setRestoring(true);
        try {
            const r = await restore();
            if (r.ok) {
                try { await syncEntitlement(); } catch (e) { reportError(e, 'settings.restore.sync'); }
                await ent.refresh();
                if (r.pro) { hapticSuccess(); toast.success('Machina Pro restored.'); }
                else toast.info('No Machina Pro purchase was found for this Apple ID.');
            } else if (!r.cancelled) {
                toast.error(r.message);
            }
        } finally {
            setRestoring(false);
        }
    };
    // The same sheet the first run opens, reachable for good from Settings.
    const [importing, setImporting] = useState(false);
    return (
        <>
            <ImportSheet isOpen={importing} onClose={() => setImporting(false)} />
            {/* Account (web only — native has no signed-in user) */}
            {authUid && (
                <List>
                    <RowShell onClick={() => go('account')} className="py-3">
                        <ProfileAvatar email={accountEmail} name={displayName} photoURL={photoURL} size={44} />
                        <div className="flex-1 min-w-0 py-0.5">
                            <div className="text-[19px] font-semibold text-text truncate leading-tight">{accountTitle(displayName, accountEmail)}</div>
                            {/* Email FIRST, provider after. The old order was
                                "Signed in with Google · morhogeg@g…" — a
                                fixed-length, low-value prefix that pushed the one
                                identifying string off the end on a phone, so the
                                part you actually read was the part that got cut.
                                Reversed, truncation eats the provider instead, and
                                dropping the "Signed in with" preamble buys back the
                                width it was spending. `providerName` keeps the full
                                sentence for the a11y label and the Account screen. */}
                            <div className="text-[13px] text-text-muted truncate mt-0.5">
                                {accountEmail && !isPrivateRelay(accountEmail)
                                    ? (providerName ? `${accountEmail} · ${providerName}` : accountEmail)
                                    : providerLabel}
                            </div>
                        </div>
                        <Chevron />
                    </RowShell>
                </List>
            )}

            {authUid && (
                <>
                    <SectionHeader>Plan</SectionHeader>
                    <List>
                        <NavRow
                            tile={<Crown className="w-[16px] h-[16px]" />}
                            title={proTitle}
                            value={proValue}
                            onClick={() => ent.openPaywall('settings')}
                        />
                        {subscribed && (
                            <ExternalRow title="Manage subscription" onClick={manageSubscription} />
                        )}
                        {canRestore && (
                            <RowShell tile={<RotateCcw className="w-[16px] h-[16px]" />} onClick={restoring ? undefined : doRestore}>
                                <RowText title={restoring ? 'Restoring…' : 'Restore Purchases'} />
                            </RowShell>
                        )}
                    </List>
                    {planNote && <Footnote>{planNote}</Footnote>}
                </>
            )}

            <SectionHeader first={!authUid}>Appearance</SectionHeader>
            <List>
                <RowShell>
                    <RowText title="Theme" />
                    <Segmented
                        label="Theme"
                        value={theme}
                        onChange={(v) => setTheme(v as typeof theme)}
                        iconOnly
                        options={[
                            { value: 'light', label: 'Light', icon: <Sun className="w-[18px] h-[18px]" /> },
                            { value: 'system', label: 'Auto', icon: <Monitor className="w-[18px] h-[18px]" /> },
                            { value: 'dark', label: 'Dark', icon: <Moon className="w-[18px] h-[18px]" /> },
                        ]}
                    />
                </RowShell>
            </List>

            <SectionHeader>Your library</SectionHeader>
            <List>
                <NavRow tile={<BarChart3 className="w-[17px] h-[17px]" />} title="Insights" onClick={() => go('stats')} />
                {/* Desktop capture. The iOS app shows no extension at all until
                    one is in a store (owner, 2026-10-19: iOS launches first, the
                    extension follows): a row pointing at a "Coming soon" screen
                    reads as an unfinished feature to App Review. Once a store
                    link is set (lib/extension.ts) the row comes back on native
                    with a sub-line saying it's a computer thing. On the web the
                    row always shows; it is honest about the store and also holds
                    the token and Reset. */}
                {(!isNativeApp() || extensionInAStore()) && (
                    <NavRow
                        tile={<Puzzle className="w-[16px] h-[16px]" />}
                        title="Browser extension"
                        sub={isNativeApp() ? 'For Chrome or Safari on your computer'
                            : browserKind() === 'safari' ? (macAppStoreUrl() ? 'Safari on your Mac' : 'Coming soon to Safari')
                                : chromeWebStoreUrl() ? 'Chrome, Edge, and Brave' : 'Coming soon to Chrome'}
                        onClick={() => go('extension')}
                    />
                )}
            </List>

            <SectionHeader>Notifications</SectionHeader>
            <List>
                {isNativeApp() ? (
                    <RowShell tile={<Bell className="w-[17px] h-[17px]" />}>
                        <RowText
                            title="Push notifications"
                            sub={settings.push_enabled && !pushOnHere ? 'Off on this iPhone. Turn on to get reminders here.' : undefined}
                        />
                        <Toggle on={pushOnHere} onChange={togglePush} />
                    </RowShell>
                ) : (
                    // The web can't register a device, and switching it off here
                    // turned push off for the account, iPhone included, with no
                    // way back from the web. Show the state; the iPhone owns it.
                    <RowShell tile={<Bell className="w-[17px] h-[17px]" />}>
                        <RowText title="Push notifications" sub="Managed in the Machina app on iPhone" />
                        <span className="text-[15px] text-text-muted pe-1">{settings.push_enabled ? 'On' : 'Off'}</span>
                    </RowShell>
                )}
                <NavRow tile={<Clock className="w-[17px] h-[17px]" />} title="Reminders & Digest" value={remindersOrDigest ? 'On' : 'Off'} onClick={() => go('resurfacing')} />
            </List>
            {pushNote && <p className="text-[12px] text-warning leading-snug px-2 pt-1.5">{pushNote}</p>}

            {/* Private collections — only once a PIN exists (it's created the
                first time a collection is marked Private, in the edit sheet). */}
            {privacyLockOn && (
                <>
                    <SectionHeader>Private collections</SectionHeader>
                    <List>
                        <NavRow tile={<Lock className="w-[16px] h-[16px]" />} title="Change PIN" onClick={onChangePin} />
                        <NavRow tile={<Lock className="w-[16px] h-[16px]" />} tileClass="bg-red-500 text-white" title="Turn off PIN" onClick={onDisablePin} />
                    </List>
                    <Footnote>One PIN protects every private collection. Turning it off leaves collections marked Private visible to anyone using this device.</Footnote>
                </>
            )}

            <SectionHeader>Privacy &amp; AI</SectionHeader>
            <List>
                <ExternalRow title="Privacy Policy" onClick={() => openExternal(policyUrl('/privacy'))} />
                <ExternalRow title="Terms of Service" onClick={() => openExternal(policyUrl('/terms'))} />
                <StopCardLinks />
            </List>
            <Footnote>
                <b className="text-text-secondary font-semibold">Powered by Google Gemini.</b> Saved content and your questions are sent to Gemini for summaries and answers, on the paid tier, where Google&apos;s terms state your content is never used to train Google&apos;s models. Private cards are kept out of Ask, search, and digests. The Privacy Policy lists exactly what each feature sends.
                {aiConsentAt !== null && ` You agreed on ${new Date(aiConsentAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`}
            </Footnote>

            <SectionHeader>Your data</SectionHeader>
            <List>
                <NavRow
                    tile={<Upload className="w-[16px] h-[16px]" />}
                    title="Import bookmarks or a Pocket export"
                    onClick={() => setImporting(true)}
                />
            </List>
            <Footnote>Bring links over from your browser&apos;s bookmarks, a Pocket export, or a list you paste. Imports don&apos;t use your monthly saves.</Footnote>
            <div id="settings-data-export" className="pt-3.5">
                <DataExport />
            </div>
            <Footnote>Everything you&apos;ve saved (cards with your notes, collections, and Ask chats) as a full JSON backup plus a readable Markdown file. Your data is yours to take anywhere.</Footnote>

            <SectionHeader>Advanced</SectionHeader>
            <List>
                {onReplayTour && (
                    <NavRow tile={<Compass className="w-[16px] h-[16px]" />} title="Take the tour again" onClick={onReplayTour} />
                )}
            </List>

            <SectionHeader>About</SectionHeader>
            <List>
                <NavRow tile={<Heart className="w-[16px] h-[16px]" />} title="The story behind Machina" onClick={() => go('story')} />
            </List>
        </>
    );
}
