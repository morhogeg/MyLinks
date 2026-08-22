'use client';

import { useState, useCallback } from 'react';
import type { User, DigestChannel, DigestMode, ReminderChannel } from '@/lib/types';
import { updateUserSettings, getUserSettings, getLinksFromFirestore } from '@/lib/storage';
import { registerPush, sendTestPush, unregisterPush } from '@/lib/push';
import { useToast } from '@/components/Toast';

// Mirrors DEFAULT_USER_SETTINGS in functions/link_service.py — keep in sync.
export const DEFAULT_SETTINGS: User['settings'] = {
    theme: 'dark',
    daily_digest: false,
    reminders_enabled: true,
    reminder_frequency: 'smart',
    push_enabled: false,
    reminders_channel: ['push'],
    // Weekly digest ON by default for NEW users (mirrors DEFAULT_USER_SETTINGS
    // in functions/link_service.py). loadSettings' read-fallback stays `?? false`
    // so an EXISTING user whose stored settings lack the key is never
    // force-enabled — only brand-new workspaces (created with this default
    // written) get it on.
    digest_enabled: true,
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
    synthesis_enabled: false,
    synthesis_day: 6, // Sunday — the natural "week wrap" default
};

// Push is ONE shared control (the "Push notifications" toggle) that governs both
// reminders and digests. `push_enabled` is authoritative; this keeps 'push'
// present/absent in a delivery-channel array to match — so the two channel lists
// never disagree with the toggle the user sees.
export function withPush<T extends ReminderChannel | DigestChannel>(channels: T[], on: boolean): T[] {
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
export function normalizeChannels<T extends string>(channels: readonly string[] | undefined, valid: readonly T[], fallback: T): T[] {
    const kept = Array.from(new Set(channels ?? [])).filter((c): c is T => (valid as readonly string[]).includes(c));
    return kept.length ? kept : [fallback];
}

// Retired digest modes → the surviving mode they now resolve to. Mirrors
// normalizeChannels: a stored value of a removed mode is mapped to 'smart' at
// load time so an existing setting keeps working (curating via the survivor),
// and the stale value is never written back on save — the Style picker only
// offers survivors, so settings.digest_mode can never become a removed value.
// MIRRORED in functions/digest_service.py REMOVED_MODE_ALIASES — retire or add
// modes in BOTH places or client and server will disagree on stored settings.
const REMOVED_DIGEST_MODES: Record<string, DigestMode> = { random: 'smart', unread: 'smart', favorites: 'smart' };
const VALID_DIGEST_MODES: readonly DigestMode[] = ['smart', 'topic', 'rediscover', 'synthesis'];
export function normalizeDigestMode(mode: string | undefined): DigestMode {
    if (!mode) return 'smart';
    if (mode in REMOVED_DIGEST_MODES) return REMOVED_DIGEST_MODES[mode];
    return (VALID_DIGEST_MODES as readonly string[]).includes(mode) ? (mode as DigestMode) : 'smart';
}

/**
 * The settings-persistence brain: owns the loaded settings, the topic options,
 * the dirty-tracking baseline, and every mutation/persistence helper.
 * Navigation, focus, and the load-on-open effect stay in SettingsModal — this
 * hook only exposes the loaders so that effect can drive them.
 */
export function useUserSettings(uid: string) {
    const toast = useToast();

    const [settings, setSettings] = useState<User['settings']>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    // True when the last settings load failed. We then show DEFAULT_SETTINGS but
    // must NOT let the user Save them over their real config — so Save is disabled
    // and an inline notice offers a retry until a load succeeds.
    const [loadError, setLoadError] = useState(false);

    // Topic options, split by origin and de-duped case-insensitively (the
    // digest matcher lowercases everything, so "Tech" and "tech" are the same).
    const [categoryTopics, setCategoryTopics] = useState<string[]>([]);
    const [tagTopics, setTagTopics] = useState<string[]>([]);
    const [topicQuery, setTopicQuery] = useState('');

    // Dirty-tracking (M7): a baseline captured when the form loads, so closing
    // with unsaved edits warns instead of silently discarding the user's work.
    // Theme is excluded — it applies live via ThemeProvider, not this form's Save.
    const [settingsBaseline, setSettingsBaseline] = useState('');

    // Auto-save: there's no explicit Save button. Preferences persist when the
    // user leaves a sub-screen (Back / Done) or closes the sheet — but only when
    // something actually changed vs the loaded baseline, and never over a failed
    // load (which would clobber the real config with defaults).
    const savePreferences = async () => {
        if (loadError || isLoading || !settingsBaseline) return;
        const unchanged = JSON.stringify(settings) === settingsBaseline;
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
                synthesis_enabled: settings.synthesis_enabled,
                synthesis_day: settings.synthesis_day,
            });
            // Advance the baseline so a subsequent leave doesn't re-write unchanged settings.
            setSettingsBaseline(JSON.stringify(settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error("Couldn't save your settings. Please try again.");
        }
    };

    const loadDigestExtras = useCallback(async () => {
        try {
            const links = await getLinksFromFirestore(uid);
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
    }, [uid]);

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        setLoadError(false);
        try {
            const userSettings = await getUserSettings(uid);
            // Legacy migration: 'synthesis' used to be a digest STYLE, which
            // silently replaced the card digest. It's now its own weekly toggle —
            // a stored synthesis mode becomes synthesis_enabled and the digest
            // style falls back to smart. Persisted on the next save; the Style
            // picker no longer offers synthesis, so the old value can't return.
            const storedMode = normalizeDigestMode(userSettings?.digest_mode);
            const legacySynthesisMode = storedMode === 'synthesis';
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
                    digest_channels: normalizeChannels<DigestChannel>(userSettings.digest_channels, ['push'], 'push'),
                    digest_mode: legacySynthesisMode ? 'smart' : storedMode,
                    digest_topics: userSettings.digest_topics?.length
                        ? userSettings.digest_topics
                        : (userSettings.digest_topic ? [userSettings.digest_topic] : []),
                    digest_topic: userSettings.digest_topic ?? null,
                    digest_count: userSettings.digest_count ?? 5,
                    digest_hour: userSettings.digest_hour ?? 9,
                    digest_minute: userSettings.digest_minute ?? 0,
                    digest_day: userSettings.digest_day ?? 0,
                    digest_skip_empty: userSettings.digest_skip_empty ?? true,
                    synthesis_enabled: userSettings.synthesis_enabled ?? legacySynthesisMode,
                    synthesis_day: userSettings.synthesis_day ?? 6,
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
    }, [uid]);

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
            const result = await registerPush();
            // Two distinct failures, two distinct fixes — naming the wrong one
            // sends the user to iOS Settings for a backend fault (or vice versa)
            // and the trail dead-ends.
            if (result === 'permission-denied') {
                setPushNote('Notifications are turned off for Machina. Allow them in iOS Settings, then flip this on again.');
                return;
            }
            if (result === 'registration-failed') {
                setPushNote('iOS allowed notifications, but registering this device with Machina failed. Check your connection and flip this on again.');
                return;
            }
            if (result === 'unavailable') return;
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

    // Diagnostic: re-register this device's token, then have the backend send a
    // real push through FCM/APNs. The note names the exact link that failed —
    // the one chain with two silent failure modes gets a loud self-test.
    const sendTestNotification = async () => {
        if (pushBusy) return;
        setPushBusy(true);
        setPushNote(null);
        try {
            const reg = await registerPush();
            if (reg === 'unavailable') return;
            if (reg === 'permission-denied') {
                setPushNote('Notifications are turned off for Machina in iOS Settings. Allow them there first.');
                return;
            }
            if (reg === 'registration-failed') {
                setPushNote('Could not register this device with Machina: the token upload failed. Check your connection and try again.');
                return;
            }
            const test = await sendTestPush();
            if (!test.ok) {
                setPushNote(`Machina could not be reached to send the test (${test.error ?? 'unknown error'}).`);
            } else if (test.skipped === 'no_tokens' || !test.tokens) {
                setPushNote('The backend has no registered device for this account: registration is not reaching the server.');
            } else if ((test.sent ?? 0) > 0) {
                setPushNote(`Test sent to ${test.tokens} device${test.tokens === 1 ? '' : 's'}. It should appear on your lock screen now. If nothing arrives, the block is between Apple and this phone (Focus mode, notification style, or the APNs setup).`);
            } else {
                // The token was registered FRESH seconds ago (registerPush above),
                // so an all-failed send is never staleness — it's FCM/APNs
                // rejecting the send. Name the error and its actual fix.
                const err = test.errors?.[0];
                if (err === 'ThirdPartyAuthError' || err === 'InvalidCredentialError') {
                    setPushNote(`Apple rejected the send (${err}): the APNs key in Firebase → Cloud Messaging doesn't match this app. That's a Firebase-console fix, not a phone setting.`);
                } else if (err === 'SenderIdMismatchError') {
                    setPushNote(`The send was refused (${err}): this build's Firebase config doesn't match the project sending the push.`);
                } else if (err === 'UnregisteredError') {
                    setPushNote(`Apple says this device's token is not valid for this app (${err}), usually a mismatch between the build and the push environment.`);
                } else {
                    setPushNote(`The send failed for the freshly registered token${err ? ` (${err})` : ''}. This is on the sending side, not this phone.`);
                }
            }
        } finally {
            setPushBusy(false);
        }
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

    return {
        settings,
        setSettings,
        loadError,
        categoryTopics,
        tagTopics,
        topicQuery,
        setTopicQuery,
        savePreferences,
        loadSettings,
        loadDigestExtras,
        togglePush,
        sendTestNotification,
        pushBusy,
        pushNote,
        toggleTopic,
    };
}
