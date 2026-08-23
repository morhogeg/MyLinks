'use client';

import { Bell, BellRing, Sun, Moon, Monitor, Clock, Compass, Lock, BarChart3, Heart } from 'lucide-react';
import { policyUrl, openExternal } from '@/lib/share';
import { isNativeApp } from '@/lib/api';
import ProfileAvatar from '../ProfileAvatar';
import DataExport from './DataExport';
import type { Settings, View } from './types';
import {
    SectionHeader, Footnote, List, RowShell, RowText, Chevron,
    NavRow, ExternalRow, Toggle, Segmented,
} from './primitives';

export function MainView({
    authUid, accountEmail, displayName, photoURL, providerLabel, providerName, settings, theme, setTheme,
    togglePush, sendTestNotification, pushBusy, pushNote, aiConsentAt,
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
    sendTestNotification: () => void;
    pushBusy: boolean;
    pushNote: string | null;
    aiConsentAt: number | null;
    /** True when the private-collections PIN is set (null while loading). */
    privacyLockOn: boolean | null;
    onChangePin: () => void;
    onDisablePin: () => void;
    onReplayTour?: () => void;
    go: (v: View) => void;
}) {
    const remindersOrDigest = settings.reminders_enabled || settings.digest_enabled;
    return (
        <>
            {/* Account (web only — native has no signed-in user) */}
            {authUid && (
                <List>
                    <RowShell onClick={() => go('account')} className="py-3">
                        <ProfileAvatar email={accountEmail} name={displayName} photoURL={photoURL} size={44} />
                        <div className="flex-1 min-w-0 py-0.5">
                            <div className="text-[19px] font-semibold text-text truncate leading-tight">{displayName || accountEmail || 'Signed in'}</div>
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
                                {accountEmail
                                    ? (providerName ? `${accountEmail} · ${providerName}` : accountEmail)
                                    : providerLabel}
                            </div>
                        </div>
                        <Chevron />
                    </RowShell>
                </List>
            )}

            <SectionHeader first={!authUid}>Appearance</SectionHeader>
            <List>
                <RowShell>
                    <RowText title="Theme" />
                    <Segmented
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
            </List>

            <SectionHeader>Notifications</SectionHeader>
            <List>
                <RowShell tile={<Bell className="w-[17px] h-[17px]" />}>
                    <RowText title="Push notifications" />
                    <Toggle on={settings.push_enabled} onChange={togglePush} />
                </RowShell>
                {settings.push_enabled && isNativeApp() && (
                    <NavRow
                        tile={<BellRing className="w-[17px] h-[17px]" />}
                        title="Send a test notification"
                        value={pushBusy ? 'Sending…' : undefined}
                        onClick={sendTestNotification}
                    />
                )}
                <NavRow tile={<Clock className="w-[17px] h-[17px]" />} title="Reminders & Digest" value={remindersOrDigest ? 'On' : 'Off'} onClick={() => go('resurfacing')} />
            </List>
            {pushNote && <p className="text-[12px] text-amber-500 leading-snug px-2 pt-1.5">{pushNote}</p>}

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
            </List>
            <Footnote>
                <b className="text-text-secondary font-semibold">Powered by Google Gemini.</b> Saved content and your questions are sent to Gemini for summaries and answers — on the paid tier, where Google&apos;s terms state your content is never used to train Google&apos;s models. Private cards are never sent. The Privacy Policy lists exactly what each feature sends.
                {aiConsentAt !== null && ` You agreed on ${new Date(aiConsentAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`}
            </Footnote>

            <SectionHeader>Your data</SectionHeader>
            <DataExport />
            <Footnote>Download everything you&apos;ve saved — cards and collections — as a full JSON backup plus a readable Markdown file. Your data is yours to take anywhere.</Footnote>

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
