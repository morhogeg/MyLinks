'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/lib/types';
import { X, Sparkles, Calendar, CalendarClock, Clock, BellOff, Loader2, Check, ChevronDown } from 'lucide-react';
import { updateLinkReminder } from '@/lib/storage';
import { isNativeApp } from '@/lib/api';
import { trackReminderSet } from '@/lib/analytics';
import { useToast } from '@/components/Toast';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { hapticSelection, hapticSuccess, hapticWarning } from '@/lib/haptics';

interface ReminderModalProps {
    uid: string;
    link: Link;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

// The options are a radio group: tap around freely, commit with Save (device
// QA on build 1136 — tap-to-commit closed the sheet under people's fingers).
type Selection = 'smart' | 'tomorrow' | 'next-week' | 'custom';

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

// Preset fire times, derived fresh per render so an open sheet never drifts
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
 * CollectionFormModal so the whole app shares one modal personality.
 *
 * Product model (client-only; storage semantics unchanged):
 * - Smart review  → profile 'smart'  (recurs: +1d, +1w, +1mo — max 3 fires)
 * - Tomorrow / Next week / Pick date & time → profile 'once' (true one-shots)
 * Options are quiet radio rows (every one states its real fire time); the
 * standard Cancel/Save footer commits, so tapping around never saves anything.
 */
export default function ReminderModal({ uid, link, isOpen, onClose, onUpdate }: ReminderModalProps) {
    const toast = useToast();
    const [selected, setSelected] = useState<Selection | null>(null);
    const [saving, setSaving] = useState(false);
    const [customDate, setCustomDate] = useState('');
    const [customTime, setCustomTime] = useState('09:00');

    const isReminderActive = link.reminderStatus === 'pending';

    // On open: reset. Smart is preselected for a new reminder (the recommended
    // default — Save is one tap away); an editable one-shot ('once' + legacy
    // values) preselects the custom picker on its stored fire time so "edit"
    // means edit; an active smart/spaced reminder preselects Smart review.
    useEffect(() => {
        if (!isOpen) return;
        setSaving(false);
        const profile = link.reminderProfile;
        const isOneShot = !!profile && profile !== 'smart' && !profile.startsWith('spaced');
        if (link.reminderStatus === 'pending' && isOneShot && link.nextReminderAt) {
            const d = new Date(link.nextReminderAt);
            setCustomDate(formatLocalDate(d));
            setCustomTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
            setSelected('custom');
        } else {
            setCustomDate('');
            setCustomTime('09:00');
            setSelected('smart');
        }
    }, [isOpen, link]);

    // Default the custom date the moment the picker is selected on a blank
    // state. Late at night, start on tomorrow so 9:00 AM isn't in the past.
    useEffect(() => {
        if (!isOpen || selected !== 'custom' || customDate) return;
        const base = new Date();
        if (base.getHours() >= 21) base.setDate(base.getDate() + 1);
        setCustomDate(formatLocalDate(base));
    }, [isOpen, selected, customDate]);

    // Bottom sheet on mobile with drag-to-dismiss; centered modal on desktop.
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile && !saving });

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
            if (e.key !== 'Escape' || saving) return;
            e.preventDefault();
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, saving, onClose]);

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

    // Custom fire time + validity, driving the live preview and the Save guard.
    let customTs: number | null = null;
    if (customDate) {
        const picked = parseLocalDate(customDate);
        const [h, m] = customTime.split(':').map(Number);
        picked.setHours(h || 0, m || 0, 0, 0);
        customTs = picked.getTime();
    }
    const customInPast = customTs !== null && customTs <= now.getTime();

    if (!isOpen || typeof document === 'undefined') return null;

    const canSave =
        !saving && selected !== null &&
        (selected !== 'custom' || (customTs !== null && !customInPast));

    const finish = () => {
        // onUpdate (saved) before onClose (dismissed) so callers that treat a
        // bare onClose as "cancelled" see the save first.
        if (onUpdate) onUpdate();
        onClose();
    };

    const handleSave = async () => {
        if (!canSave || selected === null) return;
        setSaving(true);
        try {
            // Fire time is derived at save time (fresh `now`) so a sheet that
            // sat open never schedules from a stale clock.
            const t = presetTimes(new Date());
            const fireAt =
                selected === 'smart' ? t.smart :
                selected === 'tomorrow' ? t.tomorrow :
                selected === 'next-week' ? t.nextWeek :
                customTs;
            // Hard invariant: a reminder can NEVER be created in the past.
            if (!fireAt || fireAt <= Date.now()) {
                hapticWarning();
                toast.error('Please pick a time in the future — that moment has already passed.');
                setSaving(false);
                return;
            }
            // Profile drives recurrence on the backend: 'smart' recurs
            // (+1d, +1w, +1mo); everything else here is a true one-shot and
            // MUST be stored as 'once' so it fires exactly once.
            await updateLinkReminder(uid, link.id, true, fireAt, selected === 'smart' ? 'smart' : 'once');
            trackReminderSet();
            hapticSuccess();
            toast.success(`Reminder set for ${fmtDayTime(new Date(fireAt))}`);
            finish();
        } catch (error) {
            toast.error(`Couldn't set the reminder: ${error instanceof Error ? error.message : 'please try again.'}`);
            setSaving(false);
        }
    };

    const handleTurnOff = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await updateLinkReminder(uid, link.id, false);
            hapticSuccess();
            toast.success('Reminder turned off');
            finish();
        } catch (error) {
            toast.error(`Couldn't update the reminder: ${error instanceof Error ? error.message : 'please try again.'}`);
            setSaving(false);
        }
    };

    const select = (s: Selection) => {
        if (saving) return;
        hapticSelection();
        setSelected(s);
    };

    // Quiet radio row (iOS-Settings grammar): plain icon, label, real fire time
    // right-aligned, accent check when selected. No fills or borders — hairline
    // dividers do the separation.
    const OptionRow = ({ id, icon, label, caption, value, trailing }: {
        id: Selection;
        icon: React.ReactNode;
        label: string;
        /** Second line under the label (used where a right value wouldn't fit). */
        caption?: string;
        value?: string;
        trailing?: React.ReactNode;
    }) => {
        const isSelected = selected === id;
        return (
            <button
                onClick={() => select(id)}
                disabled={saving}
                role="radio"
                aria-checked={isSelected}
                className="w-full flex items-center gap-3 px-1.5 py-3.5 min-h-[52px] text-left transition-colors hover:bg-fill-subtle active:bg-fill-strong disabled:opacity-60 disabled:cursor-not-allowed"
            >
                <span className={`w-6 shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'text-accent' : 'text-text-muted'}`}>
                    {icon}
                </span>
                <span className="flex-1 min-w-0">
                    <span className={`block text-[15px] font-medium transition-colors ${isSelected ? 'text-accent' : 'text-text'}`}>
                        {label}
                    </span>
                    {caption && (
                        <span className="block text-[12.5px] text-text-muted leading-snug mt-0.5">{caption}</span>
                    )}
                </span>
                {value && <span className="shrink-0 text-[13px] text-text-muted">{value}</span>}
                {trailing}
                <span className="w-5 shrink-0 flex items-center justify-center">
                    {isSelected && <Check className="w-4 h-4 text-accent" />}
                </span>
            </button>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center animate-fade-in">
            {/* Scrim */}
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={saving ? undefined : onClose}
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
                    <div className="flex items-start gap-3 px-5 pt-2 pb-3.5 border-b border-border-subtle">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[17px] font-bold text-text leading-tight">Remind me</h2>
                            <p className="text-[13px] text-text-secondary leading-snug line-clamp-2 mt-0.5" dir="auto" title={link.title}>
                                {link.title}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={saving}
                            aria-label="Close"
                            className="w-9 h-9 -mt-1 shrink-0 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors disabled:opacity-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body: quiet hairline-divided radio rows. */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1">
                    {/* Current reminder, when editing one. */}
                    {isReminderActive && link.nextReminderAt && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 mt-2 rounded-xl bg-accent/10 border border-accent/15">
                            <Clock className="w-4 h-4 text-accent shrink-0" />
                            <p className="flex-1 min-w-0 text-[13px] leading-snug">
                                <span className="font-semibold text-text">{fmtDayTime(new Date(link.nextReminderAt))}</span>
                                <span className="block text-[12px] text-text-secondary">{profileLabel(link)}</span>
                            </p>
                        </div>
                    )}

                    <div role="radiogroup" aria-label="When to remind" className="divide-y divide-border-subtle">
                        <OptionRow
                            id="smart"
                            icon={<Sparkles className="w-5 h-5" />}
                            label="Smart review"
                            caption="Tomorrow · then 1 week & 1 month"
                        />
                        <OptionRow
                            id="tomorrow"
                            icon={<Clock className="w-5 h-5" />}
                            label="Tomorrow"
                            value={fmtDayTime(new Date(presets.tomorrow))}
                        />
                        <OptionRow
                            id="next-week"
                            icon={<Calendar className="w-5 h-5" />}
                            label="Next week"
                            value={fmtDayTime(new Date(presets.nextWeek))}
                        />

                        {/* Custom date & time — selecting it reveals the pickers. */}
                        <div>
                            <OptionRow
                                id="custom"
                                icon={<CalendarClock className="w-5 h-5" />}
                                label="Pick date & time"
                                trailing={
                                    <ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform duration-200 ${selected === 'custom' ? 'rotate-180' : ''}`} />
                                }
                            />
                            {selected === 'custom' && (
                                <div className="px-1.5 pb-4 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={customDate}
                                            min={todayStr}
                                            max={maxDate}
                                            onChange={(e) => setCustomDate(e.target.value)}
                                            disabled={saving}
                                            aria-label="Reminder date"
                                            className="w-full bg-fill-subtle border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/25 [&::-webkit-calendar-picker-indicator]:opacity-60"
                                        />
                                        <input
                                            type="time"
                                            value={customTime}
                                            onChange={(e) => setCustomTime(e.target.value)}
                                            disabled={saving}
                                            aria-label="Reminder time"
                                            className="w-full bg-fill-subtle border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/25 [&::-webkit-calendar-picker-indicator]:opacity-60"
                                        />
                                    </div>
                                    <p aria-live="polite" className={`text-[12.5px] leading-snug px-0.5 ${customInPast ? 'text-red-400' : 'text-text-muted'}`}>
                                        {customTs === null
                                            ? 'Pick a date to continue.'
                                            : customInPast
                                                ? 'That moment has already passed — pick a future time.'
                                                : `Will remind you ${fmtDayTime(new Date(customTs))}.`}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Turn off — quiet danger row, only when there's something to turn off. */}
                        {isReminderActive && (
                            <button
                                onClick={handleTurnOff}
                                disabled={saving}
                                className="w-full flex items-center gap-3 px-1.5 py-3.5 min-h-[52px] text-left text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="w-6 shrink-0 flex items-center justify-center">
                                    <BellOff className="w-5 h-5" />
                                </span>
                                <span className="text-[15px] font-medium">Turn off reminder</span>
                            </button>
                        )}
                    </div>

                    {/* Web has no push channel — reminders surface in the app itself.
                        Set expectations so "remind me" doesn't imply a notification
                        that can't arrive. (Native handles this via the push nudge.) */}
                    {!isNativeApp() && (
                        <p className="px-1 pt-2 text-[11.5px] text-text-muted leading-snug">
                            Reminders appear here in the app when they come due.
                        </p>
                    )}
                </div>

                {/* Footer — the app's standard Cancel/Save pair (CollectionFormModal &c). */}
                <div className="shrink-0 flex gap-3 px-4 pt-3 pb-4">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-fill-subtle text-text font-medium hover:bg-fill-strong transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            'Save'
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
