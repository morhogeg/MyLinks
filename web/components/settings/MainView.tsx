'use client';

import { Bell, Sun, Moon, Monitor, RefreshCw, Clock, Compass, Network, Lock, BarChart3 } from 'lucide-react';
import { policyUrl, openExternal } from '@/lib/share';
import ProfileAvatar from '../ProfileAvatar';
import DataExport from './DataExport';
import type { Settings, View } from './types';
import {
    SectionHeader, Footnote, List, RowShell, RowText, Chevron,
    NavRow, ExternalRow, Toggle, Segmented,
} from './primitives';

export function MainView({
    authUid, accountEmail, displayName, photoURL, providerLabel, settings, theme, setTheme,
    togglePush, pushNote, aiConsentAt,
    privacyLockOn, onChangePin, onDisablePin,
    rebuilding, rebuildLabel, handleRebuild, onReplayTour, go,
}: {
    authUid: string | null;
    accountEmail: string | null;
    displayName: string | null;
    photoURL: string | null;
    providerLabel: string;
    settings: Settings;
    theme: 'light' | 'dark' | 'system';
    setTheme: (t: 'light' | 'dark' | 'system') => void;
    togglePush: () => void;
    pushNote: string | null;
    aiConsentAt: number | null;
    /** True when the private-collections PIN is set (null while loading). */
    privacyLockOn: boolean | null;
    onChangePin: () => void;
    onDisablePin: () => void;
    rebuilding: boolean;
    rebuildLabel: string | null;
    handleRebuild: () => void;
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
                            <div className="text-[13px] text-text-muted truncate mt-0.5">{providerLabel}{accountEmail ? ` · ${accountEmail}` : ''}</div>
                        </div>
                        <Chevron />
                    </RowShell>
                </List>
            )}

            <SectionHeader first={!authUid}>Your library</SectionHeader>
            <List>
                <NavRow tile={<BarChart3 className="w-[17px] h-[17px]" />} tileClass="bg-violet-500" title="Insights" onClick={() => go('stats')} />
            </List>

            <SectionHeader>Notifications</SectionHeader>
            <List>
                <RowShell tile={<Bell className="w-[17px] h-[17px]" />} tileClass="bg-accent">
                    <RowText title="Push notifications" />
                    <Toggle on={settings.push_enabled} onChange={togglePush} />
                </RowShell>
                <NavRow tile={<Clock className="w-[17px] h-[17px]" />} tileClass="bg-pink-500" title="Reminders & Digest" value={remindersOrDigest ? 'On' : 'Off'} onClick={() => go('resurfacing')} />
            </List>
            {pushNote && <p className="text-[12px] text-amber-500 leading-snug px-2 pt-1.5">{pushNote}</p>}

            <SectionHeader>Appearance</SectionHeader>
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

            {/* Private collections — only once a PIN exists (it's created the
                first time a collection is marked Private, in the edit sheet). */}
            {privacyLockOn && (
                <>
                    <SectionHeader>Private collections</SectionHeader>
                    <List>
                        <NavRow tile={<Lock className="w-[16px] h-[16px]" />} tileClass="bg-slate-600" title="Change PIN" onClick={onChangePin} />
                        <NavRow tile={<Lock className="w-[16px] h-[16px]" />} tileClass="bg-red-500" title="Turn off PIN" onClick={onDisablePin} />
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
                <b className="text-text-secondary font-semibold">Powered by Google Gemini.</b> Saved content and your questions are sent to Gemini for summaries and answers.
                {aiConsentAt !== null && ` You agreed on ${new Date(aiConsentAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`}
            </Footnote>

            <SectionHeader>Your data</SectionHeader>
            <DataExport />
            <Footnote>Download everything you&apos;ve saved — cards and collections — as a full JSON backup plus a readable Markdown file. Your data is yours to take anywhere.</Footnote>

            <SectionHeader>Advanced</SectionHeader>
            <List>
                <RowShell tile={<Network className="w-[16px] h-[16px]" />} tileClass="bg-indigo-500">
                    <RowText title="Rebuild connections" />
                    <button
                        onClick={handleRebuild}
                        disabled={rebuilding}
                        className="ml-auto h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
                        {rebuilding ? 'Rebuilding…' : 'Rebuild'}
                    </button>
                </RowShell>
                {onReplayTour && (
                    <NavRow tile={<Compass className="w-[16px] h-[16px]" />} tileClass="bg-slate-500" title="Take the tour again" onClick={onReplayTour} />
                )}
            </List>
            <Footnote>{rebuildLabel ?? 'Recompute “See also” links across your whole library — useful for cards saved before connections existed.'}</Footnote>
        </>
    );
}
