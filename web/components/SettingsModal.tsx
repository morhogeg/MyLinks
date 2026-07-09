'use client';

import { useState, useEffect, useMemo, useRef, Children } from 'react';
import type { ReactNode } from 'react';
import { User, DigestMode, DigestChannel, ReminderChannel } from '@/lib/types';
import { X, Bell, Sparkles, Check, Sun, Moon, Monitor, RefreshCw, BrainCircuit, Mail, Shuffle, Tag, Inbox, Star, History, ChevronLeft, ChevronRight, Compass, LogOut, Search, ShieldCheck, ExternalLink, Network, Clock, Info } from 'lucide-react';
import { updateUserSettings, getUserSettings, updateUserEmail, getUserEmail, getLinksFromFirestore } from '@/lib/storage';
import { registerPush, unregisterPush } from '@/lib/push';
import { isNativeApp } from '@/lib/api';
import { policyUrl, openExternal } from '@/lib/share';
import { readLocalAiConsent } from '@/lib/aiConsent';
import { hapticSelection } from '@/lib/haptics';
import { rebuildConnections } from '@/lib/rebuildConnections';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';
import { deleteAccount } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import ProfileAvatar from './ProfileAvatar';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { Trash2 } from 'lucide-react';

interface SettingsModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
    /** Replay the first-run product tour. */
    onReplayTour?: () => void;
    /** Deep-link the sheet straight to a sub-screen on open (e.g. the digest
        settings, reached as main → Reminders & Digest). */
    initialSection?: 'digest';
}

type Frequency = User['settings']['reminder_frequency'];

// One home for "how Machina brings your saves back": the main list plus the
// drill-in sub-screens. Navigation is a simple stack (push/pop) so Back always
// returns to wherever you came from and the edge-swipe pops one level.
type View = 'main' | 'account' | 'resurfacing' | 'cadence' | 'style' | 'schedule' | 'cards' | 'delivery';

const VIEW_TITLE: Record<View, string> = {
    main: 'Settings',
    account: 'Account',
    resurfacing: 'Reminders & Digest',
    cadence: 'Reminder cadence',
    style: 'Digest style',
    schedule: 'Schedule',
    cards: 'Cards per digest',
    delivery: 'Delivery',
};

const FREQUENCY_NOTE: Record<string, string> = {
    smart: 'Spaced repetition (1 day → 1 week → 1 month) for long-term retention.',
    daily: 'One reminder per day for items with an active reminder.',
    weekly: 'A weekly nudge to revisit what you saved.',
};

const CADENCE_LABEL: Record<string, string> = { smart: 'Smart', daily: 'Daily', weekly: 'Weekly' };

// Every mode is curated server-side; this is presentation only.
const DIGEST_MODES: { value: DigestMode; label: string; icon: ReactNode; note: string }[] = [
    { value: 'smart', label: 'Smart mix', icon: <Sparkles className="w-[18px] h-[18px]" />, note: 'A balanced blend of your backlog and older gems worth a second look.' },
    { value: 'synthesis', label: 'Weekly synthesis', icon: <BrainCircuit className="w-[18px] h-[18px]" />, note: 'A short "what you learned" recap that ties your week\'s saves together — themes, a standout, and an open question.' },
    { value: 'unread', label: 'Backlog', icon: <Inbox className="w-[18px] h-[18px]" />, note: 'Chip away at what you saved but never read (oldest first).' },
    { value: 'rediscover', label: 'Rediscover', icon: <History className="w-[18px] h-[18px]" />, note: 'Resurface older saves you haven\'t opened in a while.' },
    { value: 'random', label: 'Surprise me', icon: <Shuffle className="w-[18px] h-[18px]" />, note: 'A random handful from across your whole library.' },
    { value: 'topic', label: 'By topic', icon: <Tag className="w-[18px] h-[18px]" />, note: 'Only cards from a category or tag you choose.' },
    { value: 'favorites', label: 'Favorites', icon: <Star className="w-[18px] h-[18px]" />, note: 'Bring your starred cards back for an encore.' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COUNT_OPTIONS = [3, 5, 7, 10];

// Wheel-picker columns (Schedule). Hour index 0 = "12" (12 AM / 12 PM).
const HOURS12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? '12' : String(i)));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM = ['AM', 'PM'];

// Mirrors DEFAULT_USER_SETTINGS in functions/link_service.py — keep in sync.
const DEFAULT_SETTINGS: User['settings'] = {
    theme: 'dark',
    daily_digest: false,
    reminders_enabled: true,
    reminder_frequency: 'smart',
    push_enabled: false,
    reminders_channel: ['push'],
    digest_enabled: false,
    digest_frequency: 'weekly',
    digest_channels: ['push'],
    digest_mode: 'smart',
    digest_topics: [],
    digest_topic: null,
    digest_count: 5,
    digest_hour: 9,
    digest_minute: 0,
    digest_day: 0,
    digest_skip_empty: true,
};

// Push is ONE shared control (the "Push notifications" toggle) that governs both
// reminders and digests. `push_enabled` is authoritative; this keeps 'push'
// present/absent in a delivery-channel array to match — so the two channel lists
// never disagree with the toggle the user sees.
function withPush<T extends ReminderChannel | DigestChannel>(channels: T[], on: boolean): T[] {
    const has = channels.includes('push' as T);
    if (on && !has) return [...channels, 'push' as T];
    if (!on && has) return channels.filter((c) => c !== 'push');
    return channels;
}

// Drop retired/unknown legacy channels out of a stored array: keep only the
// values still valid for the narrowed channel type, dedupe, and fall back to
// the given default so a delivery array is never left blank or carrying a ghost
// value that would crash the narrowed types or render a dead chip. ('push' is
// then reconciled against push_enabled by withPush at the call site.)
function normalizeChannels<T extends string>(channels: readonly string[] | undefined, valid: readonly T[], fallback: T): T[] {
    const kept = Array.from(new Set(channels ?? [])).filter((c): c is T => (valid as readonly string[]).includes(c));
    return kept.length ? kept : [fallback];
}

// "4:24 PM" / "9:00 AM" — 12-hour local formatting for the digest summary.
const formatTime = (hour: number, minute: number) => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
};

export default function SettingsModal({ uid, isOpen, onClose, onReplayTour, initialSection }: SettingsModalProps) {
    const toast = useToast();
    const { theme, setTheme } = useTheme();
    const { authUid, email: accountEmail, displayName, photoURL, signOut } = useAuth();

    // Which provider the user signed in with — read from Firebase Auth's
    // providerData so the status line can say "Signed in with Apple/Google".
    const providerLabel = useMemo(() => {
        const ids = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
        if (ids.includes('apple.com')) return 'Signed in with Apple';
        if (ids.includes('google.com')) return 'Signed in with Google';
        return 'Signed in';
    }, [isOpen, authUid]);

    const [settings, setSettings] = useState<User['settings']>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    // True when the last settings load failed. We then show DEFAULT_SETTINGS but
    // must NOT let the user Save them over their real config — so Save is disabled
    // and an inline notice offers a retry until a load succeeds.
    const [loadError, setLoadError] = useState(false);

    // Navigation stack; the last entry is the visible screen.
    const [stack, setStack] = useState<View[]>(['main']);
    const view = stack[stack.length - 1];
    const go = (v: View) => setStack((s) => [...s, v]);
    const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

    const [email, setEmail] = useState('');
    // Topic options, split by origin and de-duped case-insensitively (the
    // digest matcher lowercases everything, so "Tech" and "tech" are the same).
    const [categoryTopics, setCategoryTopics] = useState<string[]>([]);
    const [tagTopics, setTagTopics] = useState<string[]>([]);
    const [topicQuery, setTopicQuery] = useState('');

    // Dirty-tracking (M7): baselines captured when the form loads, so closing
    // with unsaved edits warns instead of silently discarding the user's work.
    // Theme is excluded — it applies live via ThemeProvider, not this form's Save.
    const [settingsBaseline, setSettingsBaseline] = useState('');
    const [emailBaseline, setEmailBaseline] = useState('');

    // Auto-save: there's no explicit Save button. Preferences persist when the
    // user leaves a sub-screen (Back / Done) or closes the sheet — but only when
    // something actually changed vs the loaded baseline, and never over a failed
    // load (which would clobber the real config with defaults).
    const savePreferences = async () => {
        if (loadError || isLoading || !settingsBaseline) return;
        const unchanged = JSON.stringify(settings) === settingsBaseline && email.trim() === emailBaseline;
        if (unchanged) return;
        try {
            await updateUserSettings(uid, {
                reminders_enabled: settings.reminders_enabled,
                reminder_frequency: settings.reminder_frequency,
                push_enabled: settings.push_enabled,
                reminders_channel: settings.reminders_channel,
                digest_enabled: settings.digest_enabled,
                digest_frequency: settings.digest_frequency,
                digest_channels: settings.digest_channels,
                digest_mode: settings.digest_mode,
                digest_topics: settings.digest_topics,
                digest_count: settings.digest_count,
                digest_hour: settings.digest_hour,
                digest_minute: settings.digest_minute,
                digest_day: settings.digest_day,
                digest_skip_empty: settings.digest_skip_empty,
            });
            if (email.trim()) await updateUserEmail(uid, email.trim());
            // Advance the baseline so a subsequent leave doesn't re-write unchanged settings.
            setSettingsBaseline(JSON.stringify(settings));
            setEmailBaseline(email.trim());
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error("Couldn't save your settings. Please try again.");
        }
    };
    // Optimistic: pop/close immediately, persist in the background.
    const closeSettings = () => { void savePreferences(); onClose(); };
    const leaveSubscreen = () => { void savePreferences(); back(); };

    // Account deletion (App Store guideline 5.1.1(v)): confirm, then hard-delete
    // the user's workspace + Auth account via the delete_account function.
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const handleDeleteAccount = async () => {
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteAccount();
            // deleteAccount() signs out; the AuthProvider will render the login
            // gate. Close the modal so we don't sit over it.
            setShowDeleteConfirm(false);
            onClose();
        } catch {
            setDeleting(false);
            setDeleteError('Could not delete your account. Please try again.');
        }
    };

    // AI-consent timestamp for the "Privacy & AI" section.
    const [aiConsentAt, setAiConsentAt] = useState<number | null>(null);
    useEffect(() => {
        if (isOpen) setAiConsentAt(readLocalAiConsent());
    }, [isOpen]);

    // "Rebuild connections" — backfills the knowledge graph so older cards (saved
    // before embeddings existed) get their "See also" relations.
    const [rebuilding, setRebuilding] = useState(false);
    const [rebuildLabel, setRebuildLabel] = useState<string | null>(null);
    const handleRebuild = async () => {
        if (!uid || rebuilding) return;
        setRebuilding(true);
        setRebuildLabel('Starting…');
        try {
            const result = await rebuildConnections(uid, (p) => {
                setRebuildLabel(
                    p.phase === 'embed'
                        ? `Preparing ${p.processed} cards…`
                        : `Linking cards… ${p.updated} connected`,
                );
            });
            setRebuildLabel(`Done — ${result.updated} card${result.updated === 1 ? '' : 's'} reconnected.`);
        } catch {
            setRebuildLabel('Something went wrong — try again.');
        } finally {
            setRebuilding(false);
        }
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

    // Lock the page behind Settings while it's open.
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    // Swipe in from the left edge to leave: pop one screen, or close from the root.
    useEdgeSwipeBack(() => {
        if (stack.length > 1) leaveSubscreen();
        else closeSettings();
    }, isMobile && isOpen);

    // A11y: Escape mirrors the edge-swipe-back — pop a sub-screen (persisting via
    // Done's auto-save path), else close through closeSettings (which also
    // auto-saves). While the delete confirmation is up, its own ConfirmDialog
    // owns Escape, so we defer. No dependency array on purpose: the handler must
    // always see fresh settings/stack for the auto-save closures.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || showDeleteConfirm) return;
            e.preventDefault();
            if (stack.length > 1) leaveSubscreen();
            else closeSettings();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // A11y: move focus into the sheet on open, restore it to the trigger on close.
    const dialogRef = useRef<HTMLDivElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!isOpen) return;
        restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
        const t = setTimeout(() => dialogRef.current?.focus({ preventScroll: true }), 0);
        return () => {
            clearTimeout(t);
            restoreFocusRef.current?.focus?.({ preventScroll: true });
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && uid) {
            // Deep-link: open straight to the digest screen (main → Reminders &
            // Digest) so Back still walks out one level at a time.
            setStack(initialSection === 'digest' ? ['main', 'resurfacing'] : ['main']);
            setTopicQuery('');
            loadSettings();
            loadDigestExtras();
        }
    }, [isOpen, uid, initialSection]);

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
        setLoadError(false);
        try {
            const userSettings = await getUserSettings(uid);
            let loaded: User['settings'] = userSettings
                ? {
                    theme: userSettings.theme || 'dark',
                    daily_digest: userSettings.daily_digest || false,
                    reminders_enabled: userSettings.reminders_enabled ?? true,
                    reminder_frequency: userSettings.reminder_frequency || 'smart',
                    push_enabled: userSettings.push_enabled ?? false,
                    // Keep only valid channels; a retired legacy value is
                    // dropped and an empty array defaults to push so delivery
                    // is never left blank.
                    reminders_channel: normalizeChannels<ReminderChannel>(userSettings.reminders_channel, ['push'], 'push'),
                    digest_enabled: userSettings.digest_enabled ?? false,
                    digest_frequency: userSettings.digest_frequency || 'weekly',
                    digest_channels: normalizeChannels<DigestChannel>(userSettings.digest_channels, ['push', 'email'], 'push'),
                    digest_mode: userSettings.digest_mode || 'smart',
                    digest_topics: userSettings.digest_topics?.length
                        ? userSettings.digest_topics
                        : (userSettings.digest_topic ? [userSettings.digest_topic] : []),
                    digest_topic: userSettings.digest_topic ?? null,
                    digest_count: userSettings.digest_count ?? 5,
                    digest_hour: userSettings.digest_hour ?? 9,
                    digest_minute: userSettings.digest_minute ?? 0,
                    digest_day: userSettings.digest_day ?? 0,
                    digest_skip_empty: userSettings.digest_skip_empty ?? true,
                }
                : DEFAULT_SETTINGS;
            // Push is one shared control now — reconcile both channel arrays to the
            // single push_enabled flag so the toggle and delivery never disagree.
            loaded = {
                ...loaded,
                reminders_channel: withPush(loaded.reminders_channel, loaded.push_enabled),
                digest_channels: withPush(loaded.digest_channels, loaded.push_enabled),
            };
            setSettings(loaded);
            // Baseline for dirty-tracking (M7): the exact state we just loaded.
            setSettingsBaseline(JSON.stringify(loaded));
        } catch (error) {
            // A failed load must NOT silently present defaults that a subsequent
            // Save would then write over the user's real config.
            console.error('Failed to load settings:', error);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    };

    // Notifications toggle. Enabling MUST run inside this click handler — iOS
    // shows the OS permission dialog only from a user gesture (and only once).
    const [pushBusy, setPushBusy] = useState(false);
    const [pushNote, setPushNote] = useState<string | null>(null);

    const togglePush = async () => {
        if (pushBusy) return;
        if (settings.push_enabled) {
            void unregisterPush();
            setPushNote(null);
            setSettings((p) => ({
                ...p,
                push_enabled: false,
                reminders_channel: withPush(p.reminders_channel, false),
                digest_channels: withPush(p.digest_channels, false),
            }));
            return;
        }
        setPushBusy(true);
        setPushNote(null);
        try {
            const granted = await registerPush();
            if (!granted && isNativeApp()) {
                setPushNote('Notifications are turned off for Machina — allow them in iOS Settings, then flip this on again.');
                return;
            }
            setSettings((p) => ({
                ...p,
                push_enabled: true,
                reminders_channel: withPush(p.reminders_channel, true),
                digest_channels: withPush(p.digest_channels, true),
            }));
        } finally {
            setPushBusy(false);
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

    // ---- value-row summaries (shown on parent screens) ----
    const modeLabel = DIGEST_MODES.find((m) => m.value === settings.digest_mode)?.label ?? 'Smart mix';
    const scheduleValue = settings.digest_frequency === 'weekly'
        ? `${DAYS[settings.digest_day]} · ${formatTime(settings.digest_hour, settings.digest_minute)}`
        : `Daily · ${formatTime(settings.digest_hour, settings.digest_minute)}`;
    const deliveryValue = ['In-app', settings.push_enabled && 'Push', settings.digest_channels.includes('email') && 'Email']
        .filter(Boolean).join(' · ');

    // Derived topic-picker state (only meaningful in topic mode).
    const totalTopics = categoryTopics.length + tagTopics.length;
    const isTopicActive = (t: string) => settings.digest_topics.some((x) => x.toLowerCase() === t.toLowerCase());
    const topicQ = topicQuery.trim().toLowerCase();
    const matchesQuery = (t: string) => !topicQ || t.toLowerCase().includes(topicQ);
    const visibleCategories = categoryTopics.filter(matchesQuery);
    const visibleTags = tagTopics.filter(matchesQuery);

    if (!isOpen) return null;

    const showBack = stack.length > 1;
    const backLabel = showBack ? (VIEW_TITLE[stack[stack.length - 2]] || 'Back') : '';

    return (
        <div className="fixed inset-0 z-50">
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                className={`relative w-full h-full bg-background overflow-hidden flex flex-col focus:outline-none ${isMobile ? 'animate-ios-push' : 'animate-fade-in'}`}
            >
                {/* Header — main: big title inline with the close button; sub-screens:
                    back + close, with the large title in the scrolling body. */}
                <div
                    className="relative flex items-center gap-2.5 px-[18px] pt-4 pb-1 min-h-[44px]"
                    style={isMobile ? { paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' } : undefined}
                >
                    {showBack ? (
                        <button
                            onClick={leaveSubscreen}
                            className="inline-flex items-center gap-0.5 -ml-1.5 pr-2 py-1 rounded-2xl text-[16px] font-medium text-accent hover:opacity-80 transition-opacity cursor-pointer"
                            aria-label="Back"
                        >
                            <ChevronLeft className="w-[22px] h-[22px]" strokeWidth={2.4} />
                            <span className="truncate max-w-[9rem]">{backLabel.length > 12 ? 'Back' : backLabel}</span>
                        </button>
                    ) : (
                        <h1 className="text-[30px] font-extrabold tracking-[-0.024em] text-text leading-tight">Settings</h1>
                    )}
                    <div className="flex-1" />
                    {/* Close lives only on the root screen; sub-screens use Back / Done. */}
                    {!showBack && (
                        <button
                            onClick={closeSettings}
                            className="h-8 w-8 flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer"
                            aria-label="Close settings"
                        >
                            <X className="w-[17px] h-[17px]" strokeWidth={2.3} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    <div className="w-full max-w-2xl mx-auto px-[18px] pt-1.5 pb-8">
                        {view === 'main' && (
                            <MainView
                                authUid={authUid}
                                accountEmail={accountEmail}
                                displayName={displayName}
                                photoURL={photoURL}
                                providerLabel={providerLabel}
                                settings={settings}
                                theme={theme}
                                setTheme={setTheme}
                                togglePush={togglePush}
                                pushNote={pushNote}
                                aiConsentAt={aiConsentAt}
                                rebuilding={rebuilding}
                                rebuildLabel={rebuildLabel}
                                handleRebuild={handleRebuild}
                                onReplayTour={onReplayTour}
                                go={go}
                            />
                        )}

                        {view === 'account' && (
                            <AccountView
                                accountEmail={accountEmail}
                                displayName={displayName}
                                photoURL={photoURL}
                                providerLabel={providerLabel}
                                signOut={signOut}
                                onClose={onClose}
                                onDelete={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
                                deleteError={deleteError}
                            />
                        )}

                        {view === 'resurfacing' && (
                            <ResurfacingView
                                settings={settings}
                                setSettings={setSettings}
                                cadenceLabel={CADENCE_LABEL[settings.reminder_frequency] ?? 'Smart'}
                                modeLabel={modeLabel}
                                scheduleValue={scheduleValue}
                                deliveryValue={deliveryValue}
                                go={go}
                            />
                        )}

                        {view === 'cadence' && (
                            <PickerView
                                title="Reminder cadence"
                                options={(['smart', 'daily', 'weekly'] as Frequency[]).map((f) => ({ value: f as string, label: f === 'smart' ? 'Smart (spaced)' : CADENCE_LABEL[f] }))}
                                value={settings.reminder_frequency}
                                onSelect={(v) => setSettings((p) => ({ ...p, reminder_frequency: v as Frequency }))}
                                footnote={FREQUENCY_NOTE[settings.reminder_frequency]}
                            />
                        )}

                        {view === 'style' && (
                            <StyleView
                                settings={settings}
                                setSettings={setSettings}
                                toggleTopic={toggleTopic}
                                topicQuery={topicQuery}
                                setTopicQuery={setTopicQuery}
                                totalTopics={totalTopics}
                                visibleCategories={visibleCategories}
                                visibleTags={visibleTags}
                                isTopicActive={isTopicActive}
                            />
                        )}

                        {view === 'schedule' && (
                            <ScheduleView settings={settings} setSettings={setSettings} />
                        )}

                        {view === 'cards' && (
                            <PickerView
                                title="Cards per digest"
                                options={COUNT_OPTIONS.map((c) => ({ value: String(c), label: `${c} cards` }))}
                                value={String(settings.digest_count)}
                                onSelect={(v) => setSettings((p) => ({ ...p, digest_count: Number(v) }))}
                            />
                        )}

                        {view === 'delivery' && (
                            <DeliveryView
                                settings={settings}
                                toggleChannel={toggleChannel}
                                email={email}
                                setEmail={setEmail}
                            />
                        )}
                    </div>
                </div>

                {/* Footer — auto-save model: no Save/Cancel. Sub-screens show Done
                    (persist + return); the root screen has no footer unless a load
                    failed, in which case it offers a retry. */}
                {(showBack || loadError) && (
                    <div
                        className="px-[18px] py-2.5 border-t border-border-subtle bg-background"
                        style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' } : undefined}
                    >
                        <div className="w-full max-w-2xl mx-auto flex items-center justify-end gap-2">
                            {loadError && (
                                <button
                                    onClick={() => loadSettings()}
                                    className="mr-auto inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Couldn&apos;t load settings — retry
                                </button>
                            )}
                            {showBack && (
                                <button
                                    onClick={leaveSubscreen}
                                    className="h-10 px-6 rounded-full text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20 cursor-pointer"
                                >
                                    Done
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => { if (!deleting) setShowDeleteConfirm(false); }}
                onConfirm={handleDeleteAccount}
                title="Delete account?"
                message="This permanently deletes your account and all saved links, collections, and chats. This action cannot be undone."
                confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
                cancelLabel="Cancel"
                variant="danger"
            />
        </div>
    );
}

/* ============================ SCREENS ============================ */

type Settings = User['settings'];
type SetSettings = React.Dispatch<React.SetStateAction<Settings>>;

function MainView({
    authUid, accountEmail, displayName, photoURL, providerLabel, settings, theme, setTheme,
    togglePush, pushNote, aiConsentAt,
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

            <SectionHeader first={!authUid}>Notifications</SectionHeader>
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

            <SectionHeader>Privacy &amp; AI</SectionHeader>
            <List>
                <ExternalRow title="Privacy Policy" onClick={() => openExternal(policyUrl('/privacy'))} />
                <ExternalRow title="Terms of Service" onClick={() => openExternal(policyUrl('/terms'))} />
            </List>
            <Footnote>
                <b className="text-text-secondary font-semibold">Powered by Google Gemini.</b> Saved content and your questions are sent to Gemini for summaries and answers.
                {aiConsentAt !== null && ` You agreed on ${new Date(aiConsentAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`}
            </Footnote>

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

function AccountView({
    accountEmail, displayName, photoURL, providerLabel, signOut, onClose, onDelete, deleteError,
}: {
    accountEmail: string | null;
    displayName: string | null;
    photoURL: string | null;
    providerLabel: string;
    signOut: () => void;
    onClose: () => void;
    onDelete: () => void;
    deleteError: string | null;
}) {
    return (
        <>
            <LargeTitle>Account</LargeTitle>
            <div className="p-3.5 rounded-2xl bg-card border border-border-subtle">
                <div className="flex items-center gap-3.5">
                    <ProfileAvatar email={accountEmail} name={displayName} photoURL={photoURL} size={48} />
                    <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-text truncate">{displayName || accountEmail || 'Signed in'}</div>
                        {displayName && accountEmail && <div className="text-[12px] text-text-muted truncate">{accountEmail}</div>}
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {providerLabel}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => { onClose(); signOut(); }}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold border border-border-subtle text-text hover:bg-card-hover transition-colors cursor-pointer"
                >
                    <LogOut className="w-4 h-4" />
                    Sign out
                </button>
            </div>

            <button
                onClick={onDelete}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-3 text-[13px] font-semibold border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
                <Trash2 className="w-4 h-4" />
                Delete account
            </button>
            <Footnote>Permanently deletes your account and all saved links, collections, and chats. This can&apos;t be undone.</Footnote>
            {deleteError && <p className="mt-1.5 text-[12px] text-red-500 px-2">{deleteError}</p>}
        </>
    );
}

function ResurfacingView({
    settings, setSettings, cadenceLabel, modeLabel, scheduleValue, deliveryValue, go,
}: {
    settings: Settings;
    setSettings: SetSettings;
    cadenceLabel: string;
    modeLabel: string;
    scheduleValue: string;
    deliveryValue: string;
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
                {settings.digest_enabled && <NavRow title="Delivery" value={deliveryValue} onClick={() => go('delivery')} />}
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

function StyleView({
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

function ScheduleView({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
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

function DeliveryView({
    settings, toggleChannel, email, setEmail,
}: {
    settings: Settings;
    toggleChannel: (c: DigestChannel) => void;
    email: string;
    setEmail: (e: string) => void;
}) {
    return (
        <>
            <LargeTitle>Delivery</LargeTitle>
            <List tight>
                <RowShell tile={<Mail className="w-[16px] h-[16px]" />} tileClass="bg-indigo-500">
                    <RowText title="Email" />
                    <Toggle on={settings.digest_channels.includes('email')} onChange={() => toggleChannel('email')} />
                </RowShell>
            </List>
            {settings.digest_channels.includes('email') && (
                <div className="mt-2.5 px-1 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[12px] font-semibold text-text-secondary">Email address</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full h-10 px-3 rounded-xl bg-card border border-border-subtle text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
                    />
                </div>
            )}
            <Footnote>Every digest lands in the in-app Digest section, and as a push notification when notifications are on. These are extra channels on top of that.</Footnote>
        </>
    );
}

/** Single-select list screen (Cadence, Cards). */
function PickerView({
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

/* ============================ PRIMITIVES ============================ */

const TILE_BASE = 'w-[29px] h-[29px] rounded-[7px] flex items-center justify-center text-white shrink-0';

function LargeTitle({ children }: { children: ReactNode }) {
    return <h1 className="text-[28px] font-extrabold tracking-[-0.024em] text-text px-1 mb-2 leading-tight">{children}</h1>;
}

function SectionHeader({ children, first }: { children: ReactNode; first?: boolean }) {
    return (
        <div className={`text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted px-1.5 pb-1.5 ${first ? 'pt-2' : 'pt-[34px]'}`}>
            {children}
        </div>
    );
}

function Footnote({ children }: { children: ReactNode }) {
    return <p className="text-[12.5px] text-text-muted leading-snug px-2 pt-1.5">{children}</p>;
}

/** Rounded grouped container with inset hairline dividers between rows. `tight`
    insets the divider to the text (rows without a leading tile). */
function List({ children, tight }: { children: ReactNode; tight?: boolean }) {
    const items = Children.toArray(children).filter(Boolean);
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card overflow-hidden">
            {items.map((child, i) => (
                <div key={i} className="relative">
                    {i > 0 && <div className={`absolute top-0 right-0 h-px bg-border-subtle ${tight ? 'left-[15px]' : 'left-[54px]'}`} />}
                    {child}
                </div>
            ))}
        </div>
    );
}

function RowShell({
    tile, tileClass, onClick, children, className,
}: {
    tile?: ReactNode;
    tileClass?: string;
    onClick?: () => void;
    children: ReactNode;
    className?: string;
}) {
    const cls = `w-full flex items-center gap-3 px-[14px] min-h-[46px] text-left ${onClick ? 'hover:bg-card-hover transition-colors cursor-pointer' : ''} ${className || ''}`;
    const inner = (
        <>
            {tile && <span className={`${TILE_BASE} ${tileClass || 'bg-accent'}`}>{tile}</span>}
            {children}
        </>
    );
    return onClick ? <button onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}

function RowText({ title, sub }: { title: string; sub?: string }) {
    return (
        <div className="flex-1 min-w-0 py-[11px]">
            <div className="text-[16px] text-text tracking-[-0.01em] leading-tight">{title}</div>
            {sub && <div className="text-[12.5px] text-text-muted mt-1 leading-snug">{sub}</div>}
        </div>
    );
}

function Chevron() {
    return <ChevronRight className="w-[18px] h-[18px] text-text-muted/60 shrink-0" />;
}

function NavRow({ tile, tileClass, title, value, onClick }: { tile?: ReactNode; tileClass?: string; title: string; value?: string; onClick: () => void }) {
    return (
        <RowShell tile={tile} tileClass={tileClass} onClick={onClick}>
            <RowText title={title} />
            {value && <span className="ml-auto text-[15px] text-text-muted whitespace-nowrap tabular-nums">{value}</span>}
            <Chevron />
        </RowShell>
    );
}

function ExternalRow({ title, onClick }: { title: string; onClick: () => void }) {
    return (
        <RowShell tile={<ShieldCheck className="w-[16px] h-[16px]" />} tileClass="bg-slate-500" onClick={onClick}>
            <RowText title={title} />
            <ExternalLink className="ml-auto w-[15px] h-[15px] text-text-muted/60 shrink-0" />
        </RowShell>
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
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card-hover border-border-subtle text-text-secondary hover:text-text hover:border-text-muted/40'}`}
        >
            {active && <Check className="w-3 h-3" strokeWidth={3} />}
            {label}
        </button>
    );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    // iOS spec: 51×31 track, 27px knob, 2px inset → 20px travel. The knob nearly
    // fills the track height so there's no visible gap on the sides.
    return (
        <button
            onClick={onChange}
            role="switch"
            aria-checked={on}
            className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${on ? 'bg-accent' : 'bg-text-muted/30'}`}
        >
            <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_2px_5px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-out ${on ? 'translate-x-[20px]' : 'translate-x-0'}`} />
        </button>
    );
}

function Segmented<T extends string>({ value, options, onChange, iconOnly = false, widthClass }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; iconOnly?: boolean; widthClass?: string }) {
    return (
        <div className={`flex items-center gap-1 p-1 rounded-2xl bg-card-hover border border-border-subtle ml-auto ${iconOnly ? '' : (widthClass || 'w-full')}`}>
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

const ITEM_H = 36;

/** iOS-style drum wheel. Scroll-snaps under the centered selection band; commits
    the settled index a beat after scrolling stops. */
function Wheel({ items, index, onChange, className }: { items: string[]; index: number; onChange: (i: number) => void; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(index);
    // Detent the finger has last rolled onto — drives the per-tick haptic without
    // depending on `active` state (which lags a render behind the scroll event).
    const detent = useRef(index);

    // Center the initial selection once, on mount.
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = index * ITEM_H;
        setActive(index);
        detent.current = index;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let t: ReturnType<typeof setTimeout>;
        const onScroll = () => {
            const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
            if (i !== detent.current) {
                detent.current = i;
                setActive(i);
                hapticSelection();   // a crisp tick as each value rolls under the band
            }
            clearTimeout(t);
            t = setTimeout(() => { if (i !== index) onChange(i); }, 130);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => { el.removeEventListener('scroll', onScroll); clearTimeout(t); };
    }, [items.length, index, onChange]);

    return (
        <div
            ref={ref}
            className={`h-[180px] overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch] [mask-image:linear-gradient(180deg,transparent,#000_26%,#000_74%,transparent)] [-webkit-mask-image:linear-gradient(180deg,transparent,#000_26%,#000_74%,transparent)] ${className || ''}`}
        >
            <div className="h-[72px]" />
            {items.map((it, i) => (
                <div
                    key={i}
                    className={`h-[36px] snap-center flex items-center justify-center text-[22px] tabular-nums tracking-[-0.01em] transition-colors ${i === active ? 'text-text font-semibold' : 'text-text-muted'}`}
                >
                    {it}
                </div>
            ))}
            <div className="h-[72px]" />
        </div>
    );
}
