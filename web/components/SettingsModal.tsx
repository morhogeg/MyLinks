'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { User, DigestMode, DigestChannel } from '@/lib/types';
import { X, Bell, Sparkles, Share2, Copy, Check, Sun, Moon, Monitor, MessageCircle, RefreshCw, Palette, BrainCircuit, ShieldCheck, Mail, Send, Shuffle, Tag, Inbox, Star, History, Newspaper, ChevronLeft, ChevronRight } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { updateUserSettings, getUserSettings, updateUserEmail, getUserEmail, getLinksFromFirestore } from '@/lib/storage';
import { useTheme } from './ThemeProvider';
import Dropdown from './Dropdown';

interface SettingsModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
}

type Frequency = User['settings']['reminder_frequency'];

const FREQUENCY_NOTE: Record<string, string> = {
    smart: 'Spaced repetition (1 day → 1 week → 1 month) for long-term retention.',
    daily: 'One reminder per day for items with an active reminder.',
    weekly: 'A weekly nudge to revisit what you saved.',
};

const DIGEST_MODES: { value: DigestMode; label: string; icon: ReactNode; note: string }[] = [
    { value: 'smart', label: 'Smart mix', icon: <Sparkles className="w-4 h-4" />, note: 'A balanced blend of your backlog and older gems worth a second look.' },
    { value: 'random', label: 'Surprise me', icon: <Shuffle className="w-4 h-4" />, note: 'A random handful from across your whole library.' },
    { value: 'topic', label: 'By topic', icon: <Tag className="w-4 h-4" />, note: 'Only cards from a category or tag you choose.' },
    { value: 'unread', label: 'Backlog', icon: <Inbox className="w-4 h-4" />, note: 'Chip away at what you saved but never read (oldest first).' },
    { value: 'favorites', label: 'Favorites', icon: <Star className="w-4 h-4" />, note: 'Bring your starred cards back for an encore.' },
    { value: 'rediscover', label: 'Rediscover', icon: <History className="w-4 h-4" />, note: 'Resurface older saves you haven\'t opened in a while.' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
    value: String(h),
    label: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
}));
const COUNT_OPTIONS = ['3', '5', '7', '10'].map((c) => ({ value: c, label: `${c} cards` }));

export default function SettingsModal({ uid, isOpen, onClose }: SettingsModalProps) {
    const { theme, setTheme } = useTheme();

    const [settings, setSettings] = useState<User['settings']>({
        theme: 'dark',
        daily_digest: false,
        reminders_enabled: true,
        reminder_frequency: 'smart',
        digest_enabled: false,
        digest_frequency: 'weekly',
        digest_channels: ['whatsapp'],
        digest_mode: 'smart',
        digest_topics: [],
        digest_topic: null,
        digest_count: 5,
        digest_hour: 9,
        digest_day: 0,
        digest_skip_empty: true,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    // 'main' = the settings list; 'digest' = the curation sub-screen.
    const [view, setView] = useState<'main' | 'digest'>('main');

    const [email, setEmail] = useState('');
    const [topics, setTopics] = useState<string[]>([]);
    const [sendingNow, setSendingNow] = useState(false);
    const [sendResult, setSendResult] = useState<string | null>(null);

    const [shareConfig, setShareConfig] = useState<{ endpoint: string; token: string } | null>(null);
    const [shareLoading, setShareLoading] = useState(false);
    const [copied, setCopied] = useState<'endpoint' | 'token' | null>(null);

    useEffect(() => {
        if (isOpen && uid) {
            setView('main');
            loadSettings();
            loadShareConfig();
            loadDigestExtras();
        }
    }, [isOpen, uid]);

    const loadDigestExtras = async () => {
        try {
            const [storedEmail, links] = await Promise.all([
                getUserEmail(uid),
                getLinksFromFirestore(uid),
            ]);
            if (storedEmail) setEmail(storedEmail);
            // Distinct categories + tags → topic options.
            const set = new Set<string>();
            links.forEach((l) => {
                if (l.category) set.add(l.category);
                (l.tags || []).forEach((t) => t && set.add(t));
            });
            setTopics(Array.from(set).sort((a, b) => a.localeCompare(b)));
        } catch (error) {
            console.error('Failed to load digest extras:', error);
        }
    };

    const loadShareConfig = async () => {
        setShareLoading(true);
        try {
            const fn = httpsCallable(functions, 'get_share_config');
            const result = await fn({ uid });
            setShareConfig(result.data as { endpoint: string; token: string });
        } catch (error) {
            console.error('Failed to load share config:', error);
        } finally {
            setShareLoading(false);
        }
    };

    const handleCopy = async (value: string, which: 'endpoint' | 'token') => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(which);
            setTimeout(() => setCopied(null), 1500);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    };

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const userSettings = await getUserSettings(uid);
            if (userSettings) {
                setSettings({
                    theme: userSettings.theme || 'dark',
                    daily_digest: userSettings.daily_digest || false,
                    reminders_enabled: userSettings.reminders_enabled ?? true,
                    reminder_frequency: userSettings.reminder_frequency || 'smart',
                    digest_enabled: userSettings.digest_enabled ?? false,
                    digest_frequency: userSettings.digest_frequency || 'weekly',
                    digest_channels: userSettings.digest_channels?.length ? userSettings.digest_channels : ['whatsapp'],
                    digest_mode: userSettings.digest_mode || 'smart',
                    digest_topics: userSettings.digest_topics?.length
                        ? userSettings.digest_topics
                        : (userSettings.digest_topic ? [userSettings.digest_topic] : []),
                    digest_topic: userSettings.digest_topic ?? null,
                    digest_count: userSettings.digest_count ?? 5,
                    digest_hour: userSettings.digest_hour ?? 9,
                    digest_day: userSettings.digest_day ?? 0,
                    digest_skip_empty: userSettings.digest_skip_empty ?? true,
                });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateUserSettings(uid, {
                reminders_enabled: settings.reminders_enabled,
                reminder_frequency: settings.reminder_frequency,
                digest_enabled: settings.digest_enabled,
                digest_frequency: settings.digest_frequency,
                digest_channels: settings.digest_channels,
                digest_mode: settings.digest_mode,
                digest_topics: settings.digest_topics,
                digest_count: settings.digest_count,
                digest_hour: settings.digest_hour,
                digest_day: settings.digest_day,
                digest_skip_empty: settings.digest_skip_empty,
            });
            if (email.trim()) {
                await updateUserEmail(uid, email.trim());
            }
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleChannel = (channel: DigestChannel) => {
        setSettings((p) => {
            const has = p.digest_channels.includes(channel);
            const next = has
                ? p.digest_channels.filter((c) => c !== channel)
                : [...p.digest_channels, channel];
            return { ...p, digest_channels: next };
        });
    };

    const toggleTopic = (topic: string) => {
        setSettings((p) => {
            const has = p.digest_topics.includes(topic);
            const next = has
                ? p.digest_topics.filter((t) => t !== topic)
                : [...p.digest_topics, topic];
            return { ...p, digest_topics: next };
        });
    };

    // One-line summary of the current digest config (shown on the main screen).
    const digestSummary = (() => {
        const mode = DIGEST_MODES.find((m) => m.value === settings.digest_mode)?.label ?? 'Smart mix';
        const when = settings.digest_frequency === 'weekly'
            ? `${DAYS[settings.digest_day]} ${HOUR_OPTIONS[settings.digest_hour].label}`
            : `Daily ${HOUR_OPTIONS[settings.digest_hour].label}`;
        const where = settings.digest_channels
            .map((c) => (c === 'whatsapp' ? 'WhatsApp' : 'Email'))
            .join(' & ') || 'no channel';
        return `${mode} · ${settings.digest_count} cards · ${when} · ${where}`;
    })();

    const handleSendNow = async () => {
        setSendingNow(true);
        setSendResult(null);
        try {
            // Persist first so the preview reflects exactly what's configured.
            await updateUserSettings(uid, {
                digest_mode: settings.digest_mode,
                digest_topics: settings.digest_topics,
                digest_count: settings.digest_count,
                digest_channels: settings.digest_channels,
                digest_frequency: settings.digest_frequency,
            });
            if (email.trim()) await updateUserEmail(uid, email.trim());

            const fn = httpsCallable(functions, 'send_digest_now');
            const result = await fn({ uid });
            const data = result.data as { sent: boolean; channels: string[]; card_count: number; skipped?: string };
            if (data.sent) {
                setSendResult(`✅ Sent ${data.card_count} cards via ${data.channels.join(' & ')}.`);
            } else if (data.skipped === 'no_cards') {
                setSendResult('📭 Nothing to curate yet — save a few links first.');
            } else {
                setSendResult('⚠️ Couldn\'t deliver — check your channel settings.');
            }
        } catch (error) {
            console.error('Send digest now failed:', error);
            setSendResult('⚠️ Something went wrong sending the digest.');
        } finally {
            setSendingNow(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                className="relative w-full max-w-lg max-h-[88vh] rounded-3xl bg-card border border-border-subtle shadow-[var(--shadow-card-hover)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 safe-pt"
            >
                {/* Header */}
                <div className="relative flex items-center justify-between px-6 py-5 border-b border-border-subtle">
                    <div className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
                    <div className="flex items-center gap-3">
                        {view === 'digest' ? (
                            <button
                                onClick={() => setView('main')}
                                className="w-9 h-9 rounded-2xl bg-card-hover border border-border-subtle flex items-center justify-center text-text-secondary hover:text-text transition-colors cursor-pointer"
                                aria-label="Back to settings"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        ) : (
                            <div className="w-9 h-9 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/15">
                                <BrainCircuit className="w-5 h-5 text-white" />
                            </div>
                        )}
                        <div className="leading-tight">
                            <h2 className="text-lg font-bold text-text">{view === 'digest' ? 'Curated digest' : 'Settings'}</h2>
                            <p className="text-[11px] text-text-muted">{view === 'digest' ? 'Choose what, when & where' : 'Tune your Second Brain'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-9 w-9 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                        aria-label="Close settings"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
                  {view === 'main' && (
                    <>
                    {/* Appearance */}
                    <Section icon={<Palette className="w-4 h-4" />} title="Appearance">
                        <Row title="Theme" subtitle="Applies instantly across the app">
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
                        </Row>
                    </Section>

                    {/* Reminders */}
                    <Section icon={<Bell className="w-4 h-4" />} title="Reminders">
                        <Row
                            title="WhatsApp reminders"
                            subtitle="Resurface saved items so you actually revisit them"
                        >
                            <Toggle
                                on={settings.reminders_enabled}
                                onChange={() => setSettings((p) => ({ ...p, reminders_enabled: !p.reminders_enabled }))}
                            />
                        </Row>

                        {settings.reminders_enabled && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                <Segmented
                                    value={settings.reminder_frequency || 'smart'}
                                    onChange={(v) => setSettings((p) => ({ ...p, reminder_frequency: v as Frequency }))}
                                    options={[
                                        { value: 'smart', label: 'Smart' },
                                        { value: 'daily', label: 'Daily' },
                                        { value: 'weekly', label: 'Weekly' },
                                    ]}
                                />
                                <div className="flex gap-2 p-3 rounded-xl bg-accent/5 border border-accent/10">
                                    <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                    <p className="text-[12px] text-text-secondary leading-relaxed">
                                        {FREQUENCY_NOTE[settings.reminder_frequency || 'smart']}
                                    </p>
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* Curated Digest */}
                    <Section icon={<Newspaper className="w-4 h-4" />} title="Curated digest">
                        <Row
                            title="Send me a curated set of cards"
                            subtitle="A hand-picked batch of your saves, delivered on a schedule"
                        >
                            <Toggle
                                on={settings.digest_enabled}
                                onChange={() => setSettings((p) => ({ ...p, digest_enabled: !p.digest_enabled }))}
                            />
                        </Row>

                        {settings.digest_enabled && (
                            <button
                                onClick={() => setView('digest')}
                                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-card-hover border border-border-subtle hover:border-accent/40 transition-colors cursor-pointer text-left animate-in fade-in slide-in-from-top-1 duration-200"
                            >
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-text">Customize digest</div>
                                    <div className="text-[12px] text-text-muted truncate mt-0.5">{digestSummary}</div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
                            </button>
                        )}
                    </Section>

                    {/* Capture */}
                    <Section icon={<Share2 className="w-4 h-4" />} title="Capture links">
                        <Row
                            icon={<MessageCircle className="w-5 h-5 text-green-500" />}
                            title="WhatsApp"
                            subtitle="Send any link to the bot — it's saved, summarized, and tagged automatically."
                        />

                        <div className="h-px bg-border-subtle" />

                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 shrink-0 text-accent"><Share2 className="w-5 h-5" /></div>
                                <p className="text-[12px] text-text-secondary leading-relaxed">
                                    <span className="font-semibold text-text">iOS Shortcut</span> — save from any app
                                    (Safari, Maps, Instagram…). Paste these into the Shortcut once; see{' '}
                                    <span className="font-medium text-text">SHORTCUT_SETUP.md</span>.
                                </p>
                            </div>

                            {shareLoading && <div className="text-xs text-text-muted pl-8">Loading your endpoint…</div>}

                            {shareConfig && (
                                <div className="space-y-2.5 pl-8">
                                    {[
                                        { label: 'Endpoint URL', value: shareConfig.endpoint, key: 'endpoint' as const },
                                        { label: 'Ingest Token', value: shareConfig.token, key: 'token' as const },
                                    ].map(({ label, value, key }) => (
                                        <div key={key}>
                                            <label className="text-[11px] font-medium text-text-muted block mb-1">{label}</label>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-xl bg-card-hover border border-border-subtle text-xs text-text-secondary font-mono">
                                                    {value}
                                                </code>
                                                <button
                                                    onClick={() => handleCopy(value, key)}
                                                    className="shrink-0 h-9 w-9 rounded-xl bg-card-hover border border-border-subtle text-text-muted hover:text-text hover:border-accent/40 transition-all flex items-center justify-center cursor-pointer"
                                                    aria-label={`Copy ${label}`}
                                                >
                                                    {copied === key ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                        Keep your token private — anyone with it can save to your brain.
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* About */}
                    <Section icon={<RefreshCw className="w-4 h-4" />} title="About">
                        <Row title="Second Brain" subtitle="Your knowledge, organized">
                            <button
                                onClick={() => typeof window !== 'undefined' && window.location.reload()}
                                className="h-9 px-3.5 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reload
                            </button>
                        </Row>
                    </Section>
                    </>
                  )}

                  {view === 'digest' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
                        {/* What to send */}
                        <div className="space-y-2">
                            <div className="text-[12px] font-semibold text-text-secondary">What to send</div>
                            <div className="grid grid-cols-2 gap-2">
                                {DIGEST_MODES.map((m) => {
                                    const active = settings.digest_mode === m.value;
                                    return (
                                        <button
                                            key={m.value}
                                            onClick={() => setSettings((p) => ({ ...p, digest_mode: m.value }))}
                                            className={`flex items-center gap-2 px-3 h-11 rounded-xl border text-[13px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card-hover border-border-subtle text-text-secondary hover:text-text hover:border-text-muted/40'}`}
                                        >
                                            {m.icon}
                                            {m.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex gap-2 p-3 rounded-xl bg-accent/5 border border-accent/10">
                                <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                <p className="text-[12px] text-text-secondary leading-relaxed">
                                    {DIGEST_MODES.find((m) => m.value === settings.digest_mode)?.note}
                                </p>
                            </div>
                        </div>

                        {/* Topic picker — multi-select */}
                        {settings.digest_mode === 'topic' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-[12px] font-semibold text-text-secondary">Topics</div>
                                    {settings.digest_topics.length > 0 && (
                                        <button
                                            onClick={() => setSettings((p) => ({ ...p, digest_topics: [] }))}
                                            className="text-[11px] font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                {topics.length === 0 ? (
                                    <p className="text-[12px] text-text-muted">Save some links first to build topics.</p>
                                ) : (
                                    <>
                                        <p className="text-[12px] text-text-muted">Pick one or more categories/tags to focus on.</p>
                                        <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto p-0.5">
                                            {topics.map((t) => {
                                                const active = settings.digest_topics.includes(t);
                                                return (
                                                    <button
                                                        key={t}
                                                        onClick={() => toggleTopic(t)}
                                                        className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card-hover border-border-subtle text-text-secondary hover:text-text hover:border-text-muted/40'}`}
                                                    >
                                                        {active && <Check className="w-3 h-3" />}
                                                        {t}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* How many */}
                        <Row title="How many" subtitle="Cards per digest">
                            <Dropdown
                                ariaLabel="Cards per digest"
                                align="right"
                                value={String(settings.digest_count)}
                                onChange={(v) => setSettings((p) => ({ ...p, digest_count: Number(v) }))}
                                options={COUNT_OPTIONS}
                            />
                        </Row>

                        {/* Frequency */}
                        <div className="space-y-2">
                            <div className="text-[12px] font-semibold text-text-secondary">How often</div>
                            <Segmented
                                value={settings.digest_frequency}
                                onChange={(v) => setSettings((p) => ({ ...p, digest_frequency: v as 'daily' | 'weekly' }))}
                                options={[
                                    { value: 'daily', label: 'Daily' },
                                    { value: 'weekly', label: 'Weekly' },
                                ]}
                            />
                        </div>

                        {/* When */}
                        <Row title="Delivery time" subtitle={settings.digest_frequency === 'weekly' ? 'Day & hour (your local time)' : 'Hour (your local time)'}>
                            <div className="flex items-center gap-2">
                                {settings.digest_frequency === 'weekly' && (
                                    <Dropdown
                                        ariaLabel="Digest day"
                                        align="right"
                                        value={String(settings.digest_day)}
                                        onChange={(v) => setSettings((p) => ({ ...p, digest_day: Number(v) }))}
                                        options={DAYS.map((d, i) => ({ value: String(i), label: d }))}
                                    />
                                )}
                                <Dropdown
                                    ariaLabel="Digest hour"
                                    align="right"
                                    value={String(settings.digest_hour)}
                                    onChange={(v) => setSettings((p) => ({ ...p, digest_hour: Number(v) }))}
                                    options={HOUR_OPTIONS}
                                />
                            </div>
                        </Row>

                        {/* Channels */}
                        <div className="space-y-2">
                            <div className="text-[12px] font-semibold text-text-secondary">Where to send it</div>
                            <div className="flex gap-2">
                                <ChannelChip
                                    active={settings.digest_channels.includes('whatsapp')}
                                    onClick={() => toggleChannel('whatsapp')}
                                    icon={<MessageCircle className="w-4 h-4" />}
                                    label="WhatsApp"
                                />
                                <ChannelChip
                                    active={settings.digest_channels.includes('email')}
                                    onClick={() => toggleChannel('email')}
                                    icon={<Mail className="w-4 h-4" />}
                                    label="Email"
                                />
                            </div>
                        </div>

                        {/* Email address */}
                        {settings.digest_channels.includes('email') && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="text-[12px] font-semibold text-text-secondary">Email address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full h-10 px-3 rounded-xl bg-card-hover border border-border-subtle text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
                                />
                            </div>
                        )}

                        {/* Skip empty */}
                        <Row title="Skip when empty" subtitle="Don't send if there's nothing fresh to show">
                            <Toggle
                                on={settings.digest_skip_empty}
                                onChange={() => setSettings((p) => ({ ...p, digest_skip_empty: !p.digest_skip_empty }))}
                            />
                        </Row>

                        {/* Send one now */}
                        <div className="space-y-2">
                            <button
                                onClick={handleSendNow}
                                disabled={sendingNow || settings.digest_channels.length === 0}
                                className="w-full h-11 rounded-xl bg-card-hover border border-accent/30 text-[13px] font-semibold text-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-4 h-4" />
                                {sendingNow ? 'Sending…' : 'Send one now'}
                            </button>
                            {sendResult && (
                                <p className="text-[12px] text-text-secondary text-center animate-in fade-in duration-200">{sendResult}</p>
                            )}
                        </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2 bg-card">
                    <button
                        onClick={onClose}
                        className="h-10 px-4 rounded-full text-sm font-semibold text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="h-10 px-5 rounded-full text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 shadow-lg shadow-accent/20 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------- small building blocks ---------- */

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2 text-text-muted">
                {icon}
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em]">{title}</h3>
            </div>
            <div className="rounded-2xl border border-border-subtle p-4 space-y-4">{children}</div>
        </section>
    );
}

function Row({ icon, title, subtitle, children }: { icon?: ReactNode; title: string; subtitle?: string; children?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
                {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-text">{title}</div>
                    {subtitle && <div className="text-[12px] text-text-muted leading-relaxed mt-0.5">{subtitle}</div>}
                </div>
            </div>
            {children && <div className="shrink-0">{children}</div>}
        </div>
    );
}

function ChannelChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            role="switch"
            aria-checked={active}
            className={`flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border text-[13px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card-hover border-border-subtle text-text-secondary hover:text-text hover:border-text-muted/40'}`}
        >
            {icon}
            {label}
            {active && <Check className="w-3.5 h-3.5" />}
        </button>
    );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (
        <button
            onClick={onChange}
            role="switch"
            aria-checked={on}
            className={`relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${on ? 'bg-accent' : 'bg-text-muted/25'}`}
        >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}

function Segmented<T extends string>({ value, options, onChange, iconOnly = false }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; iconOnly?: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 p-1 rounded-2xl bg-card-hover border border-border-subtle ${iconOnly ? '' : 'w-full'}`}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        onClick={() => onChange(o.value)}
                        aria-label={iconOnly ? o.label : undefined}
                        title={iconOnly ? o.label : undefined}
                        className={`inline-flex items-center justify-center gap-1.5 h-9 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${iconOnly ? 'w-10' : 'flex-1'} ${active ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text'}`}
                    >
                        {o.icon}
                        {!iconOnly && o.label}
                    </button>
                );
            })}
        </div>
    );
}
