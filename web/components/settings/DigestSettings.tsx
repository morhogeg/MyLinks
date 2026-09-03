'use client';

import { useState } from 'react';
import { Check, Info } from 'lucide-react';
import type { Settings, SetSettings, View } from './types';
import ProBadge from '@/components/ui/ProBadge';
import { useEntitlement } from '@/components/EntitlementProvider';
import {
    LargeTitle, SectionHeader, Footnote, List, RowShell, RowText,
    NavRow, Toggle, Segmented, Wheel,
} from './primitives';

// There is ONE curation, chosen server-side (digest_service.curate): a balanced
// mix of the backlog and older saves worth a second look. The picker that used
// to offer smart / rediscover / by-topic is gone — resurfacing has one surface
// (the Today tab) and one behaviour, so there is nothing left to configure but
// when it arrives. Stored modes on existing workspaces still load; they resolve
// to that one curation (see digest_service.normalize_mode).

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const COUNT_OPTIONS = [3, 5, 7, 10];

// Wheel-picker columns (Schedule). Hour index 0 = "12" (12 AM / 12 PM).
export const HOURS12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? '12' : String(i)));
// 5-minute increments, matching the send_digests cron grid (*/5). Offering
// minute precision the scheduler cannot honour is what made a 16:10 digest
// arrive at 16:21 and read as broken. Every value here is a real tick.
export const MINUTE_STEP = 5;
export const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'));
export const AMPM = ['AM', 'PM'];

// "4:24 PM" / "9:00 AM" — 12-hour local formatting for the digest summary.
export const formatTime = (hour: number, minute: number) => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
};

export function ResurfacingView({
    settings, setSettings, cadenceLabel, scheduleValue, go,
}: {
    settings: Settings;
    setSettings: SetSettings;
    cadenceLabel: string;
    scheduleValue: string;
    go: (v: View) => void;
}) {
    // Curated digests are Pro-only: the rows stay visible (with the badge) and
    // a free user's tap opens the paywall instead of the setting. The server
    // skips delivery for free workspaces regardless of the stored toggle.
    const { isPro, loaded, openPaywall } = useEntitlement();
    const gated = loaded && !isPro;
    return (
        <>
            <LargeTitle>Reminders &amp; Digest</LargeTitle>

            <SectionHeader first>Card reminders</SectionHeader>
            <List tight>
                <RowShell>
                    <RowText title="Card reminders" sub="Bring back cards you bell-marked to revisit" />
                    <Toggle on={settings.reminders_enabled} onChange={() => setSettings((p) => ({ ...p, reminders_enabled: !p.reminders_enabled }))} />
                </RowShell>
                {settings.reminders_enabled && (
                    <NavRow title="Pacing" value={cadenceLabel} onClick={() => go('cadence')} />
                )}
            </List>
            <Footnote>Tap the bell on any card and Machina brings it back: tomorrow, then after a week, then a month. Pacing controls how densely those nudges arrive.</Footnote>

            <SectionHeader>Curated digest</SectionHeader>
            <List tight>
                <RowShell onClick={gated ? () => openPaywall('digest') : undefined}>
                    <div className="flex-1 min-w-0 py-[11px]">
                        <div className="flex items-center gap-2 text-[16px] text-text tracking-[-0.01em] leading-tight">
                            Curated digest
                            {gated && <ProBadge />}
                        </div>
                        <div className="text-[12.5px] text-text-muted mt-1 leading-snug">A hand-picked batch of your saved cards</div>
                    </div>
                    <Toggle on={settings.digest_enabled && !gated} onChange={gated ? () => openPaywall('digest') : () => setSettings((p) => ({ ...p, digest_enabled: !p.digest_enabled }))} />
                </RowShell>
                {settings.digest_enabled && !gated && <NavRow title="Schedule" value={scheduleValue} onClick={() => go('schedule')} />}
                {settings.digest_enabled && !gated && <NavRow title="Cards per digest" value={String(settings.digest_count)} onClick={() => go('cards')} />}
                {settings.digest_enabled && !gated && (
                    <RowShell>
                        <div className="flex-1 min-w-0 py-[11px]">
                            <SkipEmptyLabel />
                        </div>
                        <Toggle on={settings.digest_skip_empty} onChange={() => setSettings((p) => ({ ...p, digest_skip_empty: !p.digest_skip_empty }))} />
                    </RowShell>
                )}
            </List>
            <Footnote>{gated ? 'Part of Machina Pro. Tap the row to see what Pro includes.' : 'Machina picks a balanced mix of your backlog and older saves worth a second look. You choose when it arrives.'}</Footnote>

            <SectionHeader>Weekly synthesis</SectionHeader>
            <List tight>
                <RowShell>
                    <RowText title="Weekly synthesis" sub={'An AI recap of what you learned this week'} />
                    <Toggle on={settings.synthesis_enabled} onChange={() => setSettings((p) => ({ ...p, synthesis_enabled: !p.synthesis_enabled }))} />
                </RowShell>
                {settings.synthesis_enabled && (
                    <NavRow title="Delivery day" value={DAY_NAMES[settings.synthesis_day] ?? 'Sunday'} onClick={() => go('synthesisDay')} />
                )}
            </List>
            <Footnote>Ties the week&apos;s saves into a short story: themes, a standout, and an open question. Lands in your feed and Today tab{settings.synthesis_enabled ? ` every ${DAY_NAMES[settings.synthesis_day] ?? 'Sunday'}` : ''}.</Footnote>

            <Footnote>In-app and push delivery are always on. Push is toggled on the main screen.</Footnote>
        </>
    );
}

/** "Skip when empty" label with an inline info disclosure. */
function SkipEmptyLabel() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <div className="flex items-center gap-1.5">
                <span className="text-[16px] text-text tracking-[-0.01em]">Skip when empty</span>
                <button onClick={() => setOpen((v) => !v)} aria-label="What does this do?" className="text-text-muted/70 hover:text-accent transition-colors cursor-pointer">
                    <Info className="w-4 h-4" />
                </button>
            </div>
            {open && (
                <p className="text-[12.5px] text-text-muted mt-1.5 leading-snug max-w-[30ch] animate-in fade-in slide-in-from-top-1 duration-200">
                    When there&apos;s nothing new worth surfacing, no digest is sent, so you never get an empty notification.
                </p>
            )}
        </>
    );
}

export function ScheduleView({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
    const weekly = settings.digest_frequency === 'weekly';
    const hourIdx = settings.digest_hour % 12;         // 0 => "12"
    const ampmIdx = settings.digest_hour < 12 ? 0 : 1;
    const minuteIdx = Math.min(60 / MINUTE_STEP - 1, Math.round(settings.digest_minute / MINUTE_STEP));
    const commitTime = (h12: number, minute: number, pm: number) => {
        const hour = (h12 % 12) + (pm === 1 ? 12 : 0);
        setSettings((p) => ({ ...p, digest_hour: hour, digest_minute: minute }));
    };
    return (
        <>
            <LargeTitle>Schedule</LargeTitle>
            <List tight>
                <RowShell>
                    <RowText title="Frequency" />
                    <Segmented
                        value={settings.digest_frequency}
                        onChange={(v) => setSettings((p) => ({ ...p, digest_frequency: v as 'daily' | 'weekly' }))}
                        options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
                        widthClass="w-[154px]"
                    />
                </RowShell>
            </List>

            <div className="relative mt-3 rounded-[14px] border border-border-subtle bg-card overflow-hidden">
                <div className="pointer-events-none absolute left-2.5 right-2.5 top-[calc(50%-18px)] h-9 rounded-[10px] bg-card-hover" />
                <div className="relative flex px-1.5">
                    {weekly && (
                        <Wheel
                            items={DAYS}
                            index={settings.digest_day}
                            onChange={(i) => setSettings((p) => ({ ...p, digest_day: i }))}
                            className="flex-[1.7]"
                        />
                    )}
                    <Wheel items={HOURS12} index={hourIdx} onChange={(i) => commitTime(i, minuteIdx * MINUTE_STEP, ampmIdx)} className="flex-1" />
                    <Wheel items={MINUTES} index={minuteIdx} onChange={(i) => commitTime(hourIdx, i * MINUTE_STEP, ampmIdx)} className="flex-1" />
                    <Wheel items={AMPM} index={ampmIdx} onChange={(i) => commitTime(hourIdx, minuteIdx * MINUTE_STEP, i)} className="flex-1" />
                </div>
            </div>
            <Footnote>Your digest arrives at this time.</Footnote>
        </>
    );
}

/** Single-select list screen (Cadence, Cards). */
export function PickerView({
    title, options, value, onSelect, footnote,
}: {
    title: string;
    options: { value: string; label: string }[];
    value: string;
    onSelect: (v: string) => void;
    footnote?: string;
}) {
    return (
        <>
            <LargeTitle>{title}</LargeTitle>
            <List tight>
                {options.map((o) => (
                    <RowShell key={o.value} onClick={() => onSelect(o.value)}>
                        <RowText title={o.label} />
                        {o.value === value && <Check className="ml-auto w-[18px] h-[18px] text-accent shrink-0" strokeWidth={2.6} />}
                    </RowShell>
                ))}
            </List>
            {footnote && <Footnote>{footnote}</Footnote>}
        </>
    );
}
