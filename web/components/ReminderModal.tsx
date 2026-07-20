'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/lib/types';
import { X, Sparkles, Calendar, CalendarClock, Clock, Bell, BellOff, Loader2, ChevronDown } from 'lucide-react';
import { updateLinkReminder } from '@/lib/storage';
import { isNativeApp } from '@/lib/api';
import { trackReminderSet } from '@/lib/analytics';
import { useToast } from '@/components/Toast';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';

interface ReminderModalProps {
    uid: string;
    link: Link;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

// Which action is mid-save. Presets commit on tap (no select-then-Save step),
// so the in-flight key drives the row's own spinner while every control locks.
type SavingKey = 'smart' | 'tomorrow' | 'next-week' | 'custom' | 'off' | null;

// Format a Date to a `YYYY-MM-DD` string in LOCAL time. Using toISOString() here
// would emit the UTC date, which shifts by a day for users west of UTC.
function formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Parse a `YYYY-MM-DD` string as LOCAL midnight. `new Date('YYYY-MM-DD')` parses
// as UTC midnight, so combining it with local setHours() rolls the day over.
function parseLocalDate(str: string): Date {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

const fmtDay = (d: Date) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDayTime = (d: Date) => `${fmtDay(d)} · ${fmtTime(d)}`;

// Preset fire times, derived fresh per render so an open modal never drifts
// across midnight. Tomorrow / Next week land at 9:00 AM; Smart starts +24h
// (matching the backend's smart profile, which then recurs at 1w and 1mo).
function presetTimes(now: Date) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return {
        smart: now.getTime() + 24 * 60 * 60 * 1000,
        tomorrow: tomorrow.getTime(),
        nextWeek: nextWeek.getTime(),
    };
}

// Human label for a stored profile — shown on the active-reminder summary.
function profileLabel(link: Link): string {
    const nth = Math.min((link.reminderCount ?? 0) + 1, 3);
    if (link.reminderProfile === 'smart') return `Smart review · ${nth} of 3`;
    if (link.reminderProfile?.startsWith('spaced')) return `Spaced review · ${nth} of 3`;
    return 'One-time';
}

/**
 * Set / edit a card's reminder. Bottom sheet on mobile (drag-to-dismiss),
 * centered card on desktop — the same overlay grammar as CardActionSheet /
 * AddToCollectionSheet so the whole app shares one modal personality.
 *
 * Product model (client-only; storage semantics unchanged):
 * - Smart review  → profile 'smart'  (recurs: +1d, +1w, +1mo — max 3 fires)
 * - Tomorrow / Next week / Pick date & time → profile 'once' (true one-shots)
 * Presets commit on a single tap; only the custom picker has a confirm button
 * (it needs one — the inputs are the commitment). Every row states the real
 * fire time up front, so "when will this actually remind me" is never a guess.
 */
export default function ReminderModal({ uid, link, isOpen, onClose, onUpdate }: ReminderModalProps) {
    const toast = useToast();
    const [saving, setSaving] = useState<SavingKey>(null);
    const [customOpen, setCustomOpen] = useState(false);
    const [customDate, setCustomDate] = useState('');
    const [customTime, setCustomTime] = useState('09:00');

    const isSaving = saving !== null;
    const isReminderActive = link.reminderStatus === 'pending';

    // On open: reset, and for an editable one-shot ('once' + legacy values)
    // pre-open the custom picker on the stored fire time so "edit" means edit.
    useEffect(() => {
        if (!isOpen) return;
        setSaving(null);
        const profile = link.reminderProfile;
        const isOneShot = !!profile && profile !== 'smart' && !profile.startsWith('spaced');
        if (link.reminderStatus === 'pending' && isOneShot && link.nextReminderAt) {
            const d = new Date(link.nextReminderAt);
            setCustomDate(formatLocalDate(d));
            setCustomTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
            setCustomOpen(true);
        } else {
            setCustomDate('');
            setCustomTime('09:00');
            setCustomOpen(false);
        }
    }, [isOpen, link]);

    // Default the custom date the moment the picker opens on a blank state.
    // Late at night, start on tomorrow so the default 9:00 AM isn't in the past.
    useEffect(() => {
        if (!isOpen || !customOpen || customDate) return;
        const base = new Date();
        if (base.getHours() >= 21) base.setDate(base.getDate() + 1);
        setCustomDate(formatLocalDate(base));
    }, [isOpen, customOpen, customDate]);

    // Bottom sheet on mobile with drag-to-dismiss; centered modal on desktop.
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile && !isSaving });

    // A11y: move focus into the dialog on open, restore it to the trigger on
    // close. The sheet node itself (sheetRef, tabIndex -1) receives focus.
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!isOpen) return;
        restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
        const t = setTimeout(() => sheetRef.current?.focus({ preventScroll: true }), 0);
        return () => {
            clearTimeout(t);
            restoreFocusRef.current?.focus?.({ preventScroll: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // A11y: Escape dismisses via the same onClose the X / scrim / drag use,
    // but respects the in-flight save guard.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || isSaving) return;
            e.preventDefault();
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, isSaving, onClose]);

    // Recomputed per render (cheap) so previews and past-guards never go stale
    // while the sheet sits open.
    const now = new Date();
    const presets = presetTimes(now);
    const todayStr = formatLocalDate(now);
    const maxDate = useMemo(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 5);
        return formatLocalDate(d);
    }, []);

    // Custom fire time + validity, driving the live preview and confirm button.
    let customTs: number | null = null;
    if (customDate) {
        const picked = parseLocalDate(customDate);
        const [h, m] = customTime.split(':').map(Number);
        picked.setHours(h || 0, m || 0, 0, 0);
        customTs = picked.getTime();
    }
    const customInPast = customTs !== null && customTs <= now.getTime();

    if (!isOpen || typeof document === 'undefined') return null;

    const commit = async (key: Exclude<SavingKey, null>, fireAt?: number) => {
        if (isSaving) return;
        setSaving(key);
        try {
            if (key === 'off') {
                await updateLinkReminder(uid, link.id, false);
                hapticSuccess();
                toast.success('Reminder turned off');
            } else {
                // Hard invariant: a reminder can NEVER be created in the past.
                // Re-derived here so it holds even if the sheet sat open across
                // midnight or the picked minute has since elapsed.
                if (!fireAt || fireAt <= Date.now()) {
                    hapticWarning();
                    toast.error('Please pick a time in the future — that moment has already passed.');
                    setSaving(null);
                    return;
                }
                // Profile drives recurrence on the backend: 'smart' recurs
                // (+1d, +1w, +1mo); everything else here is a true one-shot and
                // MUST be stored as 'once' so it fires exactly once.
                const profile = key === 'smart' ? 'smart' : 'once';
                await updateLinkReminder(uid, link.id, true, fireAt, profile);
                trackReminderSet();
                hapticSuccess();
                toast.success(`Reminder set for ${fmtDayTime(new Date(fireAt))}`);
            }
            // onUpdate (saved) before onClose (dismissed) so callers that treat
            // a bare onClose as "cancelled" see the save first.
            if (onUpdate) onUpdate();
            onClose();
        } catch (error) {
            toast.error(`Couldn't update the reminder: ${error instanceof Error ? error.message : 'please try again.'}`);
            setSaving(null);
        }
    };

    // One-tap preset row. The icon tile flips to a spinner while its own save
    // is in flight; every control locks so a double-tap can't double-commit.
    const PresetRow = ({ savingKey, icon, title, subtitle, hero = false, onCommit }: {
        savingKey: Exclude<SavingKey, null>;
        icon: React.ReactNode;
        title: string;
        subtitle: string;
        hero?: boolean;
        onCommit: () => void;
    }) => (
        <button
            onClick={onCommit}
            disabled={isSaving}
            className={`w-full flex items-center gap-3.5 px-3.5 py-3 min-h-[60px] rounded-2xl border text-left transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60
                ${hero
                    ? 'bg-accent/5 border-accent/25 hover:bg-accent/10'
                    : 'bg-fill-subtle border-border-subtle hover:bg-fill-strong'
                }`}
        >
            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center
                ${hero
                    ? 'bg-[image:var(--accent-gradient)] text-white shadow-md shadow-accent/20'
                    : 'bg-fill-strong text-text-secondary'
                }`}
            >
                {saving === savingKey ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-text">{title}</span>
                    {hero && (
                        <span className="px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wide">
                            Recommended
                        </span>
                    )}
                </div>
                <div className="text-[12.5px] text-text-muted leading-snug mt-0.5">{subtitle}</div>
            </div>
        </button>
    );

    return createPortal(
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center animate-fade-in">
            {/* Scrim */}
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={isSaving ? undefined : onClose}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Set reminder"
                tabIndex={-1}
                className="relative w-full sm:max-w-md max-h-[90vh] flex flex-col bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb focus:outline-none"
            >
                {/* Grab handle + header: the drag-to-dismiss zone on mobile. */}
                <div {...handleProps} className="shrink-0">
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>
                    <div className="flex items-center gap-3 px-5 pt-2 pb-3.5 border-b border-border-subtle">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                            <Bell className="w-[18px] h-[18px] text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[17px] font-bold text-text leading-tight">Remind me</h2>
                            <p className="text-[13px] text-text-secondary truncate" dir="auto" title={link.title}>
                                {link.title}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            aria-label="Close"
                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors disabled:opacity-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2.5">
                    {/* Current reminder, when editing one. */}
                    {isReminderActive && link.nextReminderAt && (
                        <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-accent/10 border border-accent/20">
                            <div className="w-10 h-10 shrink-0 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Next reminder</p>
                                <p className="text-[14px] font-semibold text-text leading-snug">
                                    {fmtDayTime(new Date(link.nextReminderAt))}
                                </p>
                                <p className="text-[12px] text-text-secondary">{profileLabel(link)}</p>
                            </div>
                        </div>
                    )}

                    <PresetRow
                        savingKey="smart"
                        icon={<Sparkles className="w-5 h-5" />}
                        title="Smart review"
                        subtitle="Tomorrow · then 1 week & 1 month"
                        hero
                        onCommit={() => commit('smart', presetTimes(new Date()).smart)}
                    />
                    <PresetRow
                        savingKey="tomorrow"
                        icon={<Clock className="w-5 h-5" />}
                        title="Tomorrow"
                        subtitle={fmtDayTime(new Date(presets.tomorrow))}
                        onCommit={() => commit('tomorrow', presetTimes(new Date()).tomorrow)}
                    />
                    <PresetRow
                        savingKey="next-week"
                        icon={<Calendar className="w-5 h-5" />}
                        title="Next week"
                        subtitle={fmtDayTime(new Date(presets.nextWeek))}
                        onCommit={() => commit('next-week', presetTimes(new Date()).nextWeek)}
                    />

                    {/* Custom date & time — the one option that needs a confirm. */}
                    <div className={`rounded-2xl border transition-colors ${customOpen ? 'bg-fill-subtle border-border-strong' : 'bg-fill-subtle border-border-subtle hover:bg-fill-strong'}`}>
                        <button
                            onClick={() => setCustomOpen((v) => !v)}
                            disabled={isSaving}
                            aria-expanded={customOpen}
                            className="w-full flex items-center gap-3.5 px-3.5 py-3 min-h-[60px] text-left disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="w-10 h-10 shrink-0 rounded-xl bg-fill-strong text-text-secondary flex items-center justify-center">
                                <CalendarClock className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-[15px] font-semibold text-text">Pick date &amp; time</span>
                                <div className="text-[12.5px] text-text-muted leading-snug mt-0.5">Choose exactly when</div>
                            </div>
                            <ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform duration-200 ${customOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {customOpen && (
                            <div className="px-3.5 pb-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="date"
                                        value={customDate}
                                        min={todayStr}
                                        max={maxDate}
                                        onChange={(e) => setCustomDate(e.target.value)}
                                        disabled={isSaving}
                                        aria-label="Reminder date"
                                        className="w-full bg-surface-inset border border-border-strong rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 [&::-webkit-calendar-picker-indicator]:opacity-60"
                                    />
                                    <input
                                        type="time"
                                        value={customTime}
                                        onChange={(e) => setCustomTime(e.target.value)}
                                        disabled={isSaving}
                                        aria-label="Reminder time"
                                        className="w-full bg-surface-inset border border-border-strong rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 [&::-webkit-calendar-picker-indicator]:opacity-60"
                                    />
                                </div>
                                <p aria-live="polite" className={`text-[12.5px] leading-snug px-0.5 ${customInPast ? 'text-red-400' : 'text-text-secondary'}`}>
                                    {customTs === null
                                        ? 'Pick a date to continue.'
                                        : customInPast
                                            ? 'That moment has already passed — pick a future time.'
                                            : `Will remind you ${fmtDayTime(new Date(customTs))}.`}
                                </p>
                                <button
                                    onClick={() => customTs !== null && commit('custom', customTs)}
                                    disabled={isSaving || customTs === null || customInPast}
                                    className="w-full py-3 rounded-xl bg-[image:var(--accent-gradient)] text-white text-[15px] font-semibold shadow-lg shadow-accent/25 transition-all active:scale-[0.99] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {saving === 'custom' ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Setting…
                                        </>
                                    ) : (
                                        'Set reminder'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Turn off — quiet, only when there's something to turn off. */}
                    {isReminderActive && (
                        <button
                            onClick={() => commit('off')}
                            disabled={isSaving}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-medium text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving === 'off' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
                            Turn off reminder
                        </button>
                    )}

                    {/* Web has no push channel — reminders surface in the app itself.
                        Set expectations so "remind me" doesn't imply a notification
                        that can't arrive. (Native handles this via the push nudge.) */}
                    {!isNativeApp() && (
                        <p className="px-1 pt-0.5 text-[11.5px] text-text-muted leading-snug">
                            Reminders appear here in the app when they come due.
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
