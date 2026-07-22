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
import {
    DIGEST_MODES, DAYS, COUNT_OPTIONS, formatTime,
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
    cadence: 'Reminder cadence',
    style: 'Digest style',
    schedule: 'Schedule',
    cards: 'Cards per digest',
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

    // Which provider the user signed in with — read from Firebase Auth's
    // providerData so the status line can say "Signed in with Apple/Google".
    // Computed each render (not memoized): SettingsModal only mounts once uid is
    // set (app/page.tsx), so auth.currentUser is always populated, and reading it
    // live keeps the label correct without the non-reactive-dep lint warning.
    const providerLabel = (() => {
        const ids = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
        if (ids.includes('apple.com')) return 'Signed in with Apple';
        if (ids.includes('google.com')) return 'Signed in with Google';
        return 'Signed in';
    })();

    // The settings-persistence brain: loaded settings, topic options, the
    // dirty-tracking baseline, and every mutation/persistence helper.
    const {
        settings, setSettings, loadError,
        categoryTopics, tagTopics, topicQuery, setTopicQuery,
        savePreferences, loadSettings, loadDigestExtras,
        togglePush, pushNote, toggleTopic,
    } = useUserSettings(uid);

    // Navigation stack; the last entry is the visible screen.
    const [stack, setStack] = useState<View[]>(['main']);
    const view = stack[stack.length - 1];
    const go = (v: View) => setStack((s) => [...s, v]);
    const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

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
