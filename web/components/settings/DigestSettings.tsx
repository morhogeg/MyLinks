'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { DigestMode } from '@/lib/types';
import { Sparkles, Check, BrainCircuit, Tag, History, Search, Info } from 'lucide-react';
import { X } from 'lucide-react';
import type { Settings, SetSettings, View } from './types';
import {
    LargeTitle, SectionHeader, Footnote, List, RowShell, RowText,
    NavRow, Toggle, Segmented, TopicGroup, TopicPill, Wheel,
} from './primitives';

// Every mode is curated server-side; this is presentation only.
export const DIGEST_MODES: { value: DigestMode; label: string; icon: ReactNode; note: string }[] = [
    { value: 'smart', label: 'Smart mix', icon: <Sparkles className="w-[18px] h-[18px]" />, note: 'A balanced blend of your backlog and older gems worth a second look.' },
    { value: 'synthesis', label: 'Weekly synthesis', icon: <BrainCircuit className="w-[18px] h-[18px]" />, note: 'A short "what you learned" recap that ties your week\'s saves together — themes, a standout, and an open question.' },
    { value: 'rediscover', label: 'Rediscover', icon: <History className="w-[18px] h-[18px]" />, note: 'Resurface older saves you haven\'t opened in a while.' },
    { value: 'topic', label: 'By topic', icon: <Tag className="w-[18px] h-[18px]" />, note: 'Only cards from a category or tag you choose.' },
];

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const COUNT_OPTIONS = [3, 5, 7, 10];

// Wheel-picker columns (Schedule). Hour index 0 = "12" (12 AM / 12 PM).
export const HOURS12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? '12' : String(i)));
export const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
export const AMPM = ['AM', 'PM'];

// "4:24 PM" / "9:00 AM" — 12-hour local formatting for the digest summary.
export const formatTime = (hour: number, minute: number) => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
};

export function ResurfacingView({
    settings, setSettings, cadenceLabel, modeLabel, scheduleValue, go,
}: {
    settings: Settings;
    setSettings: SetSettings;
    cadenceLabel: string;
    modeLabel: string;
    scheduleValue: string;
    go: (v: View) => void;
}) {
    return (
        <>
            <LargeTitle>Reminders &amp; Digest</LargeTitle>

            <SectionHeader first>Reminders</SectionHeader>
            <List tight>
                <RowShell>
                    <RowText title="Reminders" sub="Nudge me to revisit an individual saved card" />
                    <Toggle on={settings.reminders_enabled} onChange={() => setSettings((p) => ({ ...p, reminders_enabled: !p.reminders_enabled }))} />
                </RowShell>
                {settings.reminders_enabled && (
                    <NavRow title="Cadence" value={cadenceLabel} onClick={() => go('cadence')} />
                )}
            </List>
            <Footnote>Smart spacing surfaces each card when you&apos;re most likely to want it — not on a fixed clock.</Footnote>

            <SectionHeader>Curated digest</SectionHeader>
            <List tight>
                <RowShell>
                    <RowText title="Curated digest" sub="An automated batch of picks, delivered together" />
                    <Toggle on={settings.digest_enabled} onChange={() => setSettings((p) => ({ ...p, digest_enabled: !p.digest_enabled }))} />
                </RowShell>
                {settings.digest_enabled && <NavRow title="Style" value={modeLabel} onClick={() => go('style')} />}
                {settings.digest_enabled && <NavRow title="Schedule" value={scheduleValue} onClick={() => go('schedule')} />}
                {settings.digest_enabled && <NavRow title="Cards per digest" value={String(settings.digest_count)} onClick={() => go('cards')} />}
                {settings.digest_enabled && (
                    <RowShell>
                        <div className="flex-1 min-w-0 py-[11px]">
                            <SkipEmptyLabel />
                        </div>
                        <Toggle on={settings.digest_skip_empty} onChange={() => setSettings((p) => ({ ...p, digest_skip_empty: !p.digest_skip_empty }))} />
                    </RowShell>
                )}
            </List>
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
                    When there&apos;s nothing new worth surfacing, no digest is sent — so you never get an empty notification.
                </p>
            )}
        </>
    );
}

export function StyleView({
    settings, setSettings, toggleTopic, topicQuery, setTopicQuery,
    totalTopics, visibleCategories, visibleTags, isTopicActive,
}: {
    settings: Settings;
    setSettings: SetSettings;
    toggleTopic: (t: string) => void;
    topicQuery: string;
    setTopicQuery: (q: string) => void;
    totalTopics: number;
    visibleCategories: string[];
    visibleTags: string[];
    isTopicActive: (t: string) => boolean;
}) {
    const note = DIGEST_MODES.find((m) => m.value === settings.digest_mode)?.note;
    return (
        <>
            <LargeTitle>Digest style</LargeTitle>
            <List tight>
                {DIGEST_MODES.map((m) => (
                    <RowShell
                        key={m.value}
                        onClick={() => setSettings((p) => ({ ...p, digest_mode: m.value }))}
                    >
                        <span className="text-text-secondary shrink-0">{m.icon}</span>
                        <RowText title={m.label} />
                        {settings.digest_mode === m.value && <Check className="ml-auto w-[18px] h-[18px] text-accent shrink-0" strokeWidth={2.6} />}
                    </RowShell>
                ))}
            </List>
            {note && <Footnote>{note}</Footnote>}

            {/* Topic picker — searchable, grouped by categories & tags */}
            {settings.digest_mode === 'topic' && (
                <>
                    <div className="flex items-center justify-between px-1.5 pt-6 pb-2">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted">Topics</span>
                        {settings.digest_topics.length > 0 && (
                            <button
                                onClick={() => setSettings((p) => ({ ...p, digest_topics: [] }))}
                                className="text-[11px] font-semibold text-text-muted hover:text-text transition-colors cursor-pointer"
                            >
                                Clear <span className="text-accent">{settings.digest_topics.length}</span>
                            </button>
                        )}
                    </div>
                    {totalTopics === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border-subtle p-4 text-center">
                            <p className="text-[12px] text-text-muted">Save some links first to build topics.</p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-border-subtle bg-card p-4 space-y-4">
                            {settings.digest_topics.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {settings.digest_topics.map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => toggleTopic(t)}
                                            className="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-7 rounded-full bg-accent/15 border border-accent/40 text-[12px] font-semibold text-accent hover:bg-accent/25 transition-colors cursor-pointer"
                                            aria-label={`Remove ${t}`}
                                        >
                                            {t}
                                            <X className="w-3 h-3" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            {totalTopics > 8 && (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                                    <input
                                        type="text"
                                        value={topicQuery}
                                        onChange={(e) => setTopicQuery(e.target.value)}
                                        placeholder="Search topics…"
                                        className="w-full h-9 pl-9 pr-8 rounded-xl bg-card-hover border border-border-subtle text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
                                    />
                                    {topicQuery && (
                                        <button
                                            onClick={() => setTopicQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors cursor-pointer"
                                            aria-label="Clear search"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                            {visibleCategories.length === 0 && visibleTags.length === 0 ? (
                                <p className="text-[12px] text-text-muted text-center py-3">No topics match “{topicQuery}”.</p>
                            ) : (
                                <div className="max-h-[22rem] overflow-y-auto scrollbar-subtle pr-1 space-y-4">
                                    {visibleCategories.length > 0 && (
                                        <TopicGroup label="Categories">
                                            {visibleCategories.map((t) => (
                                                <TopicPill key={t} label={t} active={isTopicActive(t)} onClick={() => toggleTopic(t)} />
                                            ))}
                                        </TopicGroup>
                                    )}
                                    {visibleTags.length > 0 && (
                                        <TopicGroup label="Tags">
                                            {visibleTags.map((t) => (
                                                <TopicPill key={t} label={t} active={isTopicActive(t)} onClick={() => toggleTopic(t)} />
                                            ))}
                                        </TopicGroup>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
}

export function ScheduleView({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
    const weekly = settings.digest_frequency === 'weekly';
    const hourIdx = settings.digest_hour % 12;         // 0 => "12"
    const ampmIdx = settings.digest_hour < 12 ? 0 : 1;
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
                    <Wheel items={HOURS12} index={hourIdx} onChange={(i) => commitTime(i, settings.digest_minute, ampmIdx)} className="flex-1" />
                    <Wheel items={MINUTES} index={settings.digest_minute} onChange={(i) => commitTime(hourIdx, i, ampmIdx)} className="flex-1" />
                    <Wheel items={AMPM} index={ampmIdx} onChange={(i) => commitTime(hourIdx, settings.digest_minute, i)} className="flex-1" />
                </div>
            </div>
            <Footnote>Your digest arrives around this time. Delivery may vary by a few minutes.</Footnote>
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
