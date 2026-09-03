'use client';

import { useState, useEffect, useRef } from 'react';
import { User } from '@/lib/types';
import { X, RefreshCw, ChevronLeft } from 'lucide-react';
import { readLocalAiConsent } from '@/lib/aiConsent';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';
import { deleteAccount } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import ConfirmDialog from './ConfirmDialog';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { useUserSettings } from '@/lib/useUserSettings';
import type { View } from './settings/types';
import { MainView } from './settings/MainView';
import { AccountView } from './settings/AccountSection';
import { StatsView } from './settings/StatsView';
import { StoryView } from './settings/StoryView';
import { ExtensionView } from './settings/ExtensionView';
import {
    DIGEST_MODES, DAYS, DAY_NAMES, COUNT_OPTIONS, formatTime,
    ResurfacingView, StyleView, ScheduleView, PickerView,
} from './settings/DigestSettings';
import { useScrollLock } from '@/lib/useScrollLock';
import { usePrivacyLock } from '@/lib/privacyLock';
import PinLockModal from './PinLockModal';

interface SettingsModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
    /** Replay the first-run product tour. */
    onReplayTour?: () => void;
    /** Deep-link the sheet straight to a sub-screen on open: the digest
        settings (main → Reminders & Digest) or Insights (main → Insights,
        used by the feed's "Back to Insights" chip). */
    initialSection?: 'digest' | 'stats';
    /** Insights row tapped: open the library filtered to this facet. The
        HANDLER owns closing the sheet (page.tsx closes it, then hands the
        request to Feed). */
    onOpenLibraryFacet?: (req: import('@/lib/stats').LibraryFacetRequest) => void;
}

type Frequency = User['settings']['reminder_frequency'];

const VIEW_TITLE: Record<View, string> = {
    main: 'Settings',
    account: 'Account',
    stats: 'Insights',
    resurfacing: 'Reminders & Digest',
    cadence: 'Reminder pacing',
    style: 'Digest style',
    schedule: 'Schedule',
    cards: 'Cards per digest',
    synthesisDay: 'Delivery day',
    story: 'Our story',
    extension: 'Browser extension',
};

const FREQUENCY_NOTE: Record<string, string> = {
    smart: 'Spaced repetition (1 day → 1 week → 1 month) for long-term retention.',
    daily: 'One reminder per day for items with an active reminder.',
    weekly: 'A weekly nudge to revisit what you saved.',
};

const CADENCE_LABEL: Record<string, string> = { smart: 'Smart', daily: 'Daily', weekly: 'Weekly' };

export default function SettingsModal({ uid, isOpen, onClose, onReplayTour, initialSection, onOpenLibraryFacet }: SettingsModalProps) {
    const { theme, setTheme } = useTheme();
    const { authUid, email: accountEmail, displayName, photoURL, signOut } = useAuth();

    // Which provider the user signed in with THIS session.
    //
    // This used to read `providerData` and return Apple if 'apple.com' appeared
    // at all — but providerData lists every provider LINKED to the account, and
    // linking both is the norm here (AUTH_SPEC: Google/Apple both attach to one
    // workspace via authUids[]). So an owner who signed in with Google was told
    // "Signed in with Apple" purely because Apple was tested first.
    //
    // The ID token knows which one actually authenticated this session
    // (`signInProvider`), so ask it. It's async, hence state + effect rather than
    // a render-time computation. While it resolves — and if the token can't be
    // read — fall back to providerData, but only name a provider when exactly one
    // is linked; with several linked, guessing is what caused the bug.
    // Only the async result is state; the fallback is derived during render, so
    // nothing calls setState synchronously inside the effect.
    const [tokenProvider, setTokenProvider] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        auth.currentUser?.getIdTokenResult()
            .then((res) => {
                if (!cancelled) setTokenProvider(res.signInProvider ?? null);
            })
            .catch(() => { /* keep the fallback — a label is never worth an error */ });
        return () => { cancelled = true; };
    }, [isOpen, authUid]);

    // The BARE provider name ("Google" / "Apple" / "email"), or null when it
    // can't be named confidently. `providerLabel` is the sentence form derived
    // from it, so the two can never disagree: the Settings row shows the bare
    // name after the email (see MainView), the Account screen keeps the sentence.
    const providerName = (() => {
        const NAMES: Record<string, string> = {
            'google.com': 'Google',
            'apple.com': 'Apple',
            'password': 'email',
        };
        // The token is authoritative about THIS session.
        const fromToken = NAMES[tokenProvider ?? ''];
        if (fromToken) return fromToken;
        // Until it resolves: name a provider only when exactly one is linked.
        // With several linked, picking one is precisely what caused the bug.
        const linked = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
        return (linked.length === 1 ? NAMES[linked[0]] : undefined) ?? null;
    })();
    const providerLabel = providerName ? `Signed in with ${providerName}` : 'Signed in';

    // The settings-persistence brain: loaded settings, topic options, the
    // dirty-tracking baseline, and every mutation/persistence helper.
    const {
        settings, setSettings, loadError,
        categoryTopics, tagTopics, topicQuery, setTopicQuery,
        savePreferences, loadSettings, loadDigestExtras,
        togglePush, sendTestNotification, pushBusy, pushNote, toggleTopic,
    } = useUserSettings(uid);

    // Navigation stack; the last entry is the visible screen.
    const [stack, setStack] = useState<View[]>(['main']);
    const view = stack[stack.length - 1];

    // Per-screen scroll memory. Every view shares ONE scroll container, and
    // pushing a screen used to inherit whatever offset the previous one was at:
    // "The story behind Machina" lives at the very bottom of the main list, so
    // opening it dropped you into the middle of the letter and you had to scroll
    // UP to reach the first line (owner, 2026-07-27). Resetting to 0 on every
    // change would fix that but lose your place in the long main list on Back, so
    // each view's offset is remembered and restored instead — new screens open at
    // the top, Back lands where you left.
    const bodyRef = useRef<HTMLDivElement>(null);
    const scrollByView = useRef<Map<string, number>>(new Map());

    const rememberScroll = () => {
        scrollByView.current.set(view, bodyRef.current?.scrollTop ?? 0);
    };
    const go = (v: View) => { rememberScroll(); setStack((s) => [...s, v]); };
    const back = () => {
        rememberScroll();
        setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    };

    // Apply the remembered offset (0 for a screen not visited yet). Runs after
    // the new screen has mounted, matching how StatsView restores its own
    // position — that one lands later still, once its async stats arrive, so it
    // keeps winning for the "Back to Insights" case.
    useEffect(() => {
        const el = bodyRef.current;
        if (el) el.scrollTop = scrollByView.current.get(view) ?? 0;
    }, [view]);

    // Auto-save: there's no explicit Save button. Preferences persist when the
    // user leaves a sub-screen (Back / Done) or closes the sheet.
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

    // Private-collections PIN management (change / turn off). The PIN is first
    // created from the collection edit sheet; here it can only be maintained.
    const { hasPin } = usePrivacyLock(uid);
    const [pinModal, setPinModal] = useState<null | 'change' | 'disable'>(null);
    useEffect(() => {
        if (isOpen) setAiConsentAt(readLocalAiConsent());
    }, [isOpen]);

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
    useScrollLock(isOpen);

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
            setStack(initialSection === 'digest' ? ['main', 'resurfacing'] : initialSection === 'stats' ? ['main', 'stats'] : ['main']);
            // Forget last session's offsets — a fresh open of Settings should
            // always start at the top, not where a previous visit left off.
            scrollByView.current.clear();
            setTopicQuery('');
            loadSettings();
            loadDigestExtras();
        }
    }, [isOpen, uid, initialSection, loadSettings, loadDigestExtras, setTopicQuery]);

    // ---- value-row summaries (shown on parent screens) ----
    const modeLabel = DIGEST_MODES.find((m) => m.value === settings.digest_mode)?.label ?? 'Smart mix';
    const scheduleValue = settings.digest_frequency === 'weekly'
        ? `${DAYS[settings.digest_day]} · ${formatTime(settings.digest_hour, settings.digest_minute)}`
        : `Daily · ${formatTime(settings.digest_hour, settings.digest_minute)}`;

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
                <div ref={bodyRef} className="flex-1 overflow-y-auto">
                    <div className="w-full max-w-2xl mx-auto px-[18px] pt-1.5 pb-8">
                        {view === 'main' && (
                            <MainView
                                authUid={authUid}
                                accountEmail={accountEmail}
                                displayName={displayName}
                                photoURL={photoURL}
                                providerLabel={providerLabel}
                                providerName={providerName}
                                settings={settings}
                                theme={theme}
                                setTheme={setTheme}
                                togglePush={togglePush}
                                sendTestNotification={sendTestNotification}
                                pushBusy={pushBusy}
                                pushNote={pushNote}
                                aiConsentAt={aiConsentAt}
                                privacyLockOn={hasPin}
                                onChangePin={() => setPinModal('change')}
                                onDisablePin={() => setPinModal('disable')}
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

                        {view === 'stats' && <StatsView uid={uid} onOpenFacet={onOpenLibraryFacet} restoreScroll={initialSection === 'stats'} />}

                        {view === 'story' && <StoryView />}

                        {view === 'extension' && <ExtensionView uid={uid || null} />}

                        {view === 'resurfacing' && (
                            <ResurfacingView
                                settings={settings}
                                setSettings={setSettings}
                                cadenceLabel={CADENCE_LABEL[settings.reminder_frequency] ?? 'Smart'}
                                modeLabel={modeLabel}
                                scheduleValue={scheduleValue}
                                go={go}
                            />
                        )}

                        {view === 'cadence' && (
                            <PickerView
                                title="Reminder pacing"
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

                        {view === 'synthesisDay' && (
                            <PickerView
                                title="Delivery day"
                                options={DAY_NAMES.map((d, i) => ({ value: String(i), label: d }))}
                                value={String(settings.synthesis_day)}
                                onSelect={(v) => setSettings((p) => ({ ...p, synthesis_day: Number(v) }))}
                                footnote={`Your weekly synthesis is written and delivered every ${DAY_NAMES[settings.synthesis_day]}, at your digest time (${formatTime(settings.digest_hour, settings.digest_minute)}).`}
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
                        /* Bottom inset MINUS 18px, matching BottomTabBar — not the
                           inset PLUS 8px this used to add. env(safe-area-inset-bottom)
                           is ~34px on a home-indicator iPhone, but the indicator only
                           occupies a sliver of it, so padding the full inset (let alone
                           inset + 8) floats the bar well clear of the bottom edge: this
                           footer sat ~26px higher than the app's own tab bar, which is
                           what read as "way too high" (owner, 2026-07-27). The 4px floor
                           keeps a non-notched device from collapsing to zero. */
                        style={isMobile ? { paddingBottom: 'max(calc(env(safe-area-inset-bottom) - 18px), 4px)' } : undefined}
                    >
                        <div className="w-full max-w-2xl mx-auto flex items-center justify-end gap-2">
                            {loadError && (
                                <button
                                    onClick={() => loadSettings()}
                                    className="mr-auto inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Couldn&apos;t load settings. Retry
                                </button>
                            )}
                            {showBack && (
                                <button
                                    onClick={leaveSubscreen}
                                    className="h-10 px-6 rounded-full text-sm font-semibold bg-accent text-accent-ink hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20 cursor-pointer"
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

            {/* Change / turn off the private-collections PIN (verifies first). */}
            {pinModal && (
                <PinLockModal
                    uid={uid}
                    mode={pinModal}
                    isOpen
                    onClose={() => setPinModal(null)}
                />
            )}
        </div>
    );
}
