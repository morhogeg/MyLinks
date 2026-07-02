'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { User, DigestMode, DigestChannel } from '@/lib/types';
import { X, Bell, Sparkles, Share2, Check, Sun, Moon, Monitor, MessageCircle, RefreshCw, Palette, BrainCircuit, Mail, Send, Shuffle, Tag, Inbox, Star, History, Newspaper, ChevronLeft, ChevronRight, Compass, LogOut, UserCircle, CalendarClock, Search } from 'lucide-react';
import { updateUserSettings, getUserSettings, updateUserEmail, getUserEmail, getLinksFromFirestore } from '@/lib/storage';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';
import ProfileAvatar from './ProfileAvatar';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import Dropdown from './Dropdown';
import ConfirmDialog from './ConfirmDialog';

interface SettingsModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
    /** Replay the first-run product tour. */
    onReplayTour?: () => void;
}

type Frequency = User['settings']['reminder_frequency'];

const FREQUENCY_NOTE: Record<string, string> = {
    smart: 'Spaced repetition (1 day → 1 week → 1 month) for long-term retention.',
    daily: 'One reminder per day for items with an active reminder.',
    weekly: 'A weekly nudge to revisit what you saved.',
};

// The three primary modes cover the common cases; the rest live behind an
// "Advanced" disclosure so the picker isn't six equal-weight choices (M14).
// The backend still curates every mode — this is presentation only.
const DIGEST_MODES: { value: DigestMode; label: string; icon: ReactNode; note: string; advanced?: boolean }[] = [
    { value: 'smart', label: 'Smart mix', icon: <Sparkles className="w-[18px] h-[18px]" />, note: 'A balanced blend of your backlog and older gems worth a second look.' },
    { value: 'synthesis', label: 'Weekly synthesis', icon: <BrainCircuit className="w-[18px] h-[18px]" />, note: 'A short "what you learned" recap that ties your week\'s saves together — themes, a standout, and an open question.' },
    { value: 'unread', label: 'Backlog', icon: <Inbox className="w-[18px] h-[18px]" />, note: 'Chip away at what you saved but never read (oldest first).' },
    { value: 'rediscover', label: 'Rediscover', icon: <History className="w-[18px] h-[18px]" />, note: 'Resurface older saves you haven\'t opened in a while.' },
    { value: 'random', label: 'Surprise me', icon: <Shuffle className="w-[18px] h-[18px]" />, note: 'A random handful from across your whole library.', advanced: true },
    { value: 'topic', label: 'By topic', icon: <Tag className="w-[18px] h-[18px]" />, note: 'Only cards from a category or tag you choose.', advanced: true },
    { value: 'favorites', label: 'Favorites', icon: <Star className="w-[18px] h-[18px]" />, note: 'Bring your starred cards back for an encore.', advanced: true },
];

const PRIMARY_DIGEST_MODES = DIGEST_MODES.filter((m) => !m.advanced);
const ADVANCED_DIGEST_MODES = DIGEST_MODES.filter((m) => m.advanced);
const ADVANCED_MODE_VALUES = new Set<DigestMode>(ADVANCED_DIGEST_MODES.map((m) => m.value));

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
    value: String(h),
    label: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
}));
const COUNT_OPTIONS = ['3', '5', '7', '10'].map((c) => ({ value: c, label: `${c} cards` }));

const DEFAULT_SETTINGS: User['settings'] = {
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
};

export default function SettingsModal({ uid, isOpen, onClose, onReplayTour }: SettingsModalProps) {
    const { theme, setTheme } = useTheme();
    const { authUid, email: accountEmail, displayName, photoURL, signOut } = useAuth();

    const [settings, setSettings] = useState<User['settings']>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    // 'main' = the settings list; 'digest' = the curation sub-screen.
    const [view, setView] = useState<'main' | 'digest'>('main');

    const [email, setEmail] = useState('');
    // Topic options, split by origin and de-duped case-insensitively (the
    // digest matcher lowercases everything, so "Tech" and "tech" are the same).
    const [categoryTopics, setCategoryTopics] = useState<string[]>([]);
    const [tagTopics, setTagTopics] = useState<string[]>([]);
    const [topicQuery, setTopicQuery] = useState('');
    // Advanced digest modes (Surprise me / By topic / Favorites) stay tucked
    // behind a disclosure until the user asks for them — or is already using one.
    const [showAdvancedModes, setShowAdvancedModes] = useState(false);

    // Dirty-tracking (M7): baselines captured when the form loads, so closing
    // with unsaved edits warns instead of silently discarding the user's work.
    // Theme is excluded — it applies live via ThemeProvider, not this form's Save.
    const [settingsBaseline, setSettingsBaseline] = useState('');
    const [emailBaseline, setEmailBaseline] = useState('');
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

    const isDirty = () => {
        if (isLoading || !settingsBaseline) return false;
        return JSON.stringify(settings) !== settingsBaseline || email.trim() !== emailBaseline;
    };

    // Guarded close: prompt before throwing away unsaved edits; close freely if clean.
    const handleClose = () => {
        if (isDirty()) setShowDiscardConfirm(true);
        else onClose();
    };

    // On phones Settings is a real full-screen page (slides in, fills the screen,
    // clears the notch); on desktop it stays a centered modal.
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    // Lock the page behind Settings while it's open. Settings is a fixed
    // full-screen overlay, so without this the underlying feed keeps its own
    // scrollbar — you'd see two scrollbars and the page could scroll behind.
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    // Swipe in from the left edge to leave Settings — the digest sub-screen pops
    // back to the main list first, then the page closes.
    useEdgeSwipeBack(() => {
        if (view === 'digest') setView('main');
        else handleClose();
    }, isMobile && isOpen);

    useEffect(() => {
        if (isOpen && uid) {
            setView('main');
            setTopicQuery('');
            loadSettings();
            loadDigestExtras();
        }
    }, [isOpen, uid]);

    // Keep the advanced disclosure open whenever an advanced mode is selected,
    // so the current choice is never hidden behind a collapsed section.
    useEffect(() => {
        if (ADVANCED_MODE_VALUES.has(settings.digest_mode)) setShowAdvancedModes(true);
    }, [settings.digest_mode]);

    const loadDigestExtras = async () => {
        try {
            const [storedEmail, links] = await Promise.all([
                getUserEmail(uid),
                getLinksFromFirestore(uid),
            ]);
            if (storedEmail) setEmail(storedEmail);
            setEmailBaseline((storedEmail || '').trim());
            // Categories and tags → topic options, keyed by lowercase so case
            // variants collapse to one chip. Keep the nicer-cased label.
            const startsUpper = (s: string) => s.length > 0 && s[0] === s[0].toUpperCase() && s[0] !== s[0].toLowerCase();
            const prefer = (existing: string | undefined, next: string) =>
                !existing ? next : (startsUpper(next) && !startsUpper(existing) ? next : existing);
            const catMap = new Map<string, string>();
            const tagMap = new Map<string, string>();
            links.forEach((l) => {
                const cat = (l.category || '').trim();
                if (cat) catMap.set(cat.toLowerCase(), prefer(catMap.get(cat.toLowerCase()), cat));
                (l.tags || []).forEach((raw) => {
                    const t = (raw || '').trim();
                    if (t) tagMap.set(t.toLowerCase(), prefer(tagMap.get(t.toLowerCase()), t));
                });
            });
            // A tag that's also a category shouldn't appear twice.
            catMap.forEach((_, key) => tagMap.delete(key));
            const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
            setCategoryTopics(Array.from(catMap.values()).sort(byLabel));
            setTagTopics(Array.from(tagMap.values()).sort(byLabel));
        } catch (error) {
            console.error('Failed to load digest extras:', error);
        }
    };

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const userSettings = await getUserSettings(uid);
            const loaded: User['settings'] = userSettings
                ? {
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
                }
                : DEFAULT_SETTINGS;
            setSettings(loaded);
            // Baseline for dirty-tracking (M7): the exact state we just loaded.
            setSettingsBaseline(JSON.stringify(loaded));
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
            const key = topic.toLowerCase();
            const has = p.digest_topics.some((t) => t.toLowerCase() === key);
            const next = has
                ? p.digest_topics.filter((t) => t.toLowerCase() !== key)
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

    // Derived topic-picker state (only meaningful in topic mode).
    const totalTopics = categoryTopics.length + tagTopics.length;
    const isTopicActive = (t: string) => settings.digest_topics.some((x) => x.toLowerCase() === t.toLowerCase());
    const topicQ = topicQuery.trim().toLowerCase();
    const matchesQuery = (t: string) => !topicQ || t.toLowerCase().includes(topicQ);
    const visibleCategories = categoryTopics.filter(matchesQuery);
    const visibleTags = tagTopics.filter(matchesQuery);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50">
            {/* Full-screen settings page — fills the viewport on every device; the
                content sits in a centered, readable column (max-w-2xl). */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                className={`relative w-full h-full bg-background overflow-hidden flex flex-col ${isMobile ? 'animate-ios-push' : 'animate-fade-in'}`}
            >
                {/* Header */}
                <div
                    className="relative px-6 py-5 border-b border-border-subtle"
                    style={isMobile ? { paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' } : undefined}
                >
                    <div className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
                    <div className="w-full max-w-2xl mx-auto flex items-center justify-between">
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
                            <p className="text-[11px] text-text-muted">{view === 'digest' ? 'Choose what, when & where' : 'Tune your Machina'}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="h-9 w-9 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                        aria-label="Close settings"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                  <div className="w-full max-w-2xl mx-auto px-6 py-6 space-y-7">
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

                    {/* Account — only on the web, where Google Sign-In is live
                        (native has no signed-in user). Gated on being signed in,
                        not on email, so it shows even if the token has no email. */}
                    {authUid && (
                    <Section icon={<UserCircle className="w-4 h-4" />} title="Account">
                        <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-card-hover border border-border-subtle">
                            <ProfileAvatar email={accountEmail} name={displayName} photoURL={photoURL} size={48} />
                            <div className="min-w-0 flex-1">
                                <div className="text-[14px] font-semibold text-text truncate">
                                    {displayName || accountEmail || 'Signed in'}
                                </div>
                                {displayName && accountEmail && (
                                    <div className="text-[12px] text-text-muted truncate">{accountEmail}</div>
                                )}
                                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Signed in with Google
                                </div>
                            </div>
                            <button
                                onClick={() => { onClose(); signOut(); }}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold border border-border-subtle text-text hover:bg-surface transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign out
                            </button>
                        </div>
                    </Section>
                    )}

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

                        {settings.reminders_enabled && (() => {
                            // Two front-and-center choices (M14): "Smart (spaced)" is
                            // the recommended default; "Custom" reveals the fixed
                            // Daily / Weekly cadences — still reachable, not up front.
                            const isCustom = settings.reminder_frequency === 'daily' || settings.reminder_frequency === 'weekly';
                            return (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                <Segmented
                                    value={isCustom ? 'custom' : 'smart'}
                                    onChange={(v) => setSettings((p) => ({
                                        ...p,
                                        // Entering Custom keeps an existing fixed cadence, else defaults to weekly.
                                        reminder_frequency: v === 'smart'
                                            ? 'smart'
                                            : (p.reminder_frequency === 'daily' || p.reminder_frequency === 'weekly' ? p.reminder_frequency : 'weekly'),
                                    }))}
                                    options={[
                                        { value: 'smart', label: 'Smart (spaced)' },
                                        { value: 'custom', label: 'Custom' },
                                    ]}
                                />
                                {isCustom && (
                                    <Segmented
                                        value={settings.reminder_frequency as Frequency}
                                        onChange={(v) => setSettings((p) => ({ ...p, reminder_frequency: v as Frequency }))}
                                        options={[
                                            { value: 'daily', label: 'Daily' },
                                            { value: 'weekly', label: 'Weekly' },
                                        ]}
                                    />
                                )}
                                <div className="flex gap-2 p-3 rounded-xl bg-accent/5 border border-accent/10">
                                    <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                    <p className="text-[12px] text-text-secondary leading-relaxed">
                                        {FREQUENCY_NOTE[settings.reminder_frequency || 'smart']}
                                    </p>
                                </div>
                            </div>
                            );
                        })()}
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
                    </Section>

                    {/* About */}
                    <Section icon={<RefreshCw className="w-4 h-4" />} title="About">
                        {onReplayTour && (
                            <Row title="Take the tour" subtitle="Replay the guided intro to Machina's features.">
                                <button
                                    onClick={onReplayTour}
                                    className="h-9 px-3.5 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Compass className="w-4 h-4" />
                                    Start
                                </button>
                            </Row>
                        )}
                        <Row title="Machina AI" subtitle="Capture. Connect. Recall.">
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
                    <div className="space-y-7 animate-in fade-in slide-in-from-right-2 duration-200">
                        {/* Live preview — what the next digest will look like */}
                        <div className="relative overflow-hidden rounded-2xl border border-border-subtle p-4">
                            <div className="absolute inset-0 bg-[image:var(--accent-gradient)] opacity-[0.08]" />
                            <div className="absolute inset-x-0 top-0 h-px bg-[image:var(--accent-gradient)] opacity-40" />
                            <div className="relative flex items-start gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/15 shrink-0">
                                    <Newspaper className="w-[22px] h-[22px] text-white" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent">Your digest</div>
                                    <div className="text-[13px] font-semibold text-text leading-relaxed mt-1">{digestSummary}</div>
                                </div>
                            </div>
                        </div>

                        {/* What to send — three primary modes up front, the rest
                            behind an Advanced disclosure (M14). */}
                        <div className="space-y-3">
                            <GroupLabel icon={<Sparkles className="w-4 h-4" />} title="What to send" />
                            <div className="grid grid-cols-2 gap-2.5">
                                {PRIMARY_DIGEST_MODES.map((m) => (
                                    <DigestModeButton
                                        key={m.value}
                                        mode={m}
                                        active={settings.digest_mode === m.value}
                                        onClick={() => setSettings((p) => ({ ...p, digest_mode: m.value }))}
                                    />
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowAdvancedModes((v) => !v)}
                                aria-expanded={showAdvancedModes}
                                className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-text-muted hover:text-text transition-colors cursor-pointer py-1"
                            >
                                {showAdvancedModes ? 'Hide advanced modes' : 'More ways to curate'}
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAdvancedModes ? 'rotate-90' : ''}`} />
                            </button>

                            {showAdvancedModes && (
                                <div className="grid grid-cols-2 gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {ADVANCED_DIGEST_MODES.map((m) => (
                                        <DigestModeButton
                                            key={m.value}
                                            mode={m}
                                            active={settings.digest_mode === m.value}
                                            onClick={() => setSettings((p) => ({ ...p, digest_mode: m.value }))}
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2.5 items-start p-3 rounded-xl bg-accent/5 border border-accent/10">
                                <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                <p className="text-[12px] text-text-secondary leading-relaxed">
                                    {DIGEST_MODES.find((m) => m.value === settings.digest_mode)?.note}
                                </p>
                            </div>
                        </div>

                        {/* Topic picker — searchable, grouped by categories & tags */}
                        {settings.digest_mode === 'topic' && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                <GroupLabel
                                    icon={<Tag className="w-4 h-4" />}
                                    title="Topics"
                                    action={
                                        settings.digest_topics.length > 0 ? (
                                            <button
                                                onClick={() => setSettings((p) => ({ ...p, digest_topics: [] }))}
                                                className="text-[11px] font-semibold text-text-muted hover:text-text transition-colors cursor-pointer"
                                            >
                                                Clear{' '}<span className="text-accent">{settings.digest_topics.length}</span>
                                            </button>
                                        ) : undefined
                                    }
                                />
                                {totalTopics === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-border-subtle p-4 text-center">
                                        <p className="text-[12px] text-text-muted">Save some links first to build topics.</p>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-border-subtle bg-card-hover/40 p-4 space-y-4">
                                        {/* Selected — always visible, removable */}
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

                                        {/* Search — appears once the list is long enough to warrant it */}
                                        {totalTopics > 8 && (
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={topicQuery}
                                                    onChange={(e) => setTopicQuery(e.target.value)}
                                                    placeholder="Search topics…"
                                                    className="w-full h-9 pl-9 pr-8 rounded-xl bg-card border border-border-subtle text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
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

                                        {/* Available — grouped, filtered, scrollable */}
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
                            </div>
                        )}

                        {/* Schedule — how many, how often, when */}
                        <div className="space-y-3">
                            <GroupLabel icon={<CalendarClock className="w-4 h-4" />} title="Schedule" />
                            <div className="rounded-2xl border border-border-subtle divide-y divide-border-subtle">
                                <div className="p-4">
                                    <Row title="How many" subtitle="Cards per digest">
                                        <Dropdown
                                            ariaLabel="Cards per digest"
                                            align="right"
                                            value={String(settings.digest_count)}
                                            onChange={(v) => setSettings((p) => ({ ...p, digest_count: Number(v) }))}
                                            options={COUNT_OPTIONS}
                                        />
                                    </Row>
                                </div>
                                <div className="p-4 space-y-2.5">
                                    <div className="text-sm font-semibold text-text">How often</div>
                                    <Segmented
                                        value={settings.digest_frequency}
                                        onChange={(v) => setSettings((p) => ({ ...p, digest_frequency: v as 'daily' | 'weekly' }))}
                                        options={[
                                            { value: 'daily', label: 'Daily' },
                                            { value: 'weekly', label: 'Weekly' },
                                        ]}
                                    />
                                </div>
                                <div className="p-4">
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
                                </div>
                            </div>
                        </div>

                        {/* Delivery — where, email, skip empty */}
                        <div className="space-y-3">
                            <GroupLabel icon={<Send className="w-4 h-4" />} title="Delivery" />
                            <div className="rounded-2xl border border-border-subtle divide-y divide-border-subtle">
                                <div className="p-4 space-y-2.5">
                                    <div className="text-sm font-semibold text-text">Where to send it</div>
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
                                    {settings.digest_channels.includes('email') && (
                                        <div className="space-y-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
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
                                </div>
                                <div className="p-4">
                                    <Row title="Skip when empty" subtitle="Don't send if there's nothing fresh to show">
                                        <Toggle
                                            on={settings.digest_skip_empty}
                                            onChange={() => setSettings((p) => ({ ...p, digest_skip_empty: !p.digest_skip_empty }))}
                                        />
                                    </Row>
                                </div>
                            </div>
                        </div>
                    </div>
                  )}
                  </div>
                </div>

                {/* Footer */}
                <div
                    className="px-6 py-4 border-t border-border-subtle bg-background"
                    style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' } : undefined}
                >
                  <div className="w-full max-w-2xl mx-auto flex items-center justify-end gap-2">
                    <button
                        onClick={handleClose}
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

            {/* Guard unsaved edits — closing while dirty prompts instead of
                silently discarding the user's work (M7). */}
            <ConfirmDialog
                isOpen={showDiscardConfirm}
                onClose={() => setShowDiscardConfirm(false)}
                onConfirm={() => { setShowDiscardConfirm(false); onClose(); }}
                title="Discard changes?"
                message="You've made changes that haven't been saved. Close settings and discard them?"
                confirmLabel="Discard"
                cancelLabel="Keep editing"
                variant="danger"
            />
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

function GroupLabel({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
    return (
        <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2 text-text-muted">
                {icon}
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em]">{title}</h3>
            </div>
            {action}
        </div>
    );
}

function DigestModeButton({ mode, active, onClick }: { mode: { value: DigestMode; label: string; icon: ReactNode }; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`relative flex flex-col items-center justify-center gap-2 py-3.5 rounded-2xl border transition-all duration-150 cursor-pointer ${active ? 'bg-accent/10 border-accent/50 shadow-[0_0_0_1px_var(--accent-ring)]' : 'bg-card-hover border-border-subtle hover:border-text-muted/40 hover:-translate-y-px'}`}
        >
            {active && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                </span>
            )}
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${active ? 'bg-[image:var(--accent-gradient)] text-white shadow-md shadow-purple-500/25 ring-1 ring-white/15' : 'bg-card border border-border-subtle text-text-secondary'}`}>
                {mode.icon}
            </span>
            <span className={`text-[12.5px] font-semibold ${active ? 'text-accent' : 'text-text-secondary'}`}>{mode.label}</span>
        </button>
    );
}

function TopicGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/70 px-0.5">{label}</div>
            <div className="flex flex-wrap gap-2.5">{children}</div>
        </div>
    );
}

function TopicPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card border-border-subtle text-text-secondary hover:text-text hover:border-text-muted/40'}`}
        >
            {active && <Check className="w-3 h-3" strokeWidth={3} />}
            {label}
        </button>
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
