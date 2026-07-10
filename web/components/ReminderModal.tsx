'use client';

import { useState, useEffect, useRef } from 'react';
import { Link } from '@/lib/types';
import { X, Sparkles, Calendar, Clock, Bell, BellOff, Loader2, Check } from 'lucide-react';
import { updateLinkReminder } from '@/lib/storage';
import { useToast } from '@/components/Toast';

interface ReminderModalProps {
    uid: string;
    link: Link;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

type ReminderOption = 'smart' | 'tomorrow' | 'next-week' | 'spaced' | 'custom' | 'off';

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

function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

// Move a date to another month/year keeping the day-of-month, clamped to the
// target month's length — bare setMonth/setFullYear overflows (Jul 31 → setMonth
// Feb → Mar 3), silently landing the reminder a month off the selection.
function withMonthClamped(d: Date, year: number, month: number): Date {
    const day = Math.min(d.getDate(), daysInMonth(year, month));
    return new Date(year, month, day);
}

export default function ReminderModal({ uid, link, isOpen, onClose, onUpdate }: ReminderModalProps) {
    const toast = useToast();
    const [selectedOption, setSelectedOption] = useState<ReminderOption | null>(null);
    const [spacedInterval, setSpacedInterval] = useState<number>(3);
    const [customDate, setCustomDate] = useState('');
    const [customTime, setCustomTime] = useState('09:00');
    const [isSaving, setIsSaving] = useState(false);

    // Pre-select the link's current reminder option whenever the modal opens.
    useEffect(() => {
        if (!isOpen) return;

        if (link.reminderStatus === 'pending' && link.reminderProfile) {
            const profile = link.reminderProfile;
            if (profile.startsWith('spaced-')) {
                setSelectedOption('spaced');
                setSpacedInterval(parseInt(profile.split('-')[1]) || 3);
            } else if (profile === 'smart') {
                setSelectedOption('smart');
            } else if (profile === 'tomorrow') {
                setSelectedOption('tomorrow');
            } else if (profile === 'next-week') {
                setSelectedOption('next-week');
            } else if (profile === 'custom') {
                setSelectedOption('custom');
                if (link.nextReminderAt) {
                    const date = new Date(link.nextReminderAt);
                    setCustomDate(formatLocalDate(date));
                    setCustomTime(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
                }
            } else {
                setSelectedOption('smart');
            }
        }
    }, [isOpen, link]);

    // A11y: move focus into the dialog on open, restore it to the trigger on close.
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

    // A11y: Escape dismisses the modal via the same onClose the X / backdrop use,
    // but respects the in-flight save guard (the backdrop is inert while saving).
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

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!selectedOption) return;

        setIsSaving(true);

        try {
            let nextReminderTime: number | undefined;
            const now = new Date();

            switch (selectedOption) {
                case 'smart':
                    nextReminderTime = now.getTime() + (24 * 60 * 60 * 1000);
                    break;
                case 'tomorrow':
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(9, 0, 0, 0);
                    nextReminderTime = tomorrow.getTime();
                    break;
                case 'next-week':
                    const nextWeek = new Date(now);
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    nextWeek.setHours(9, 0, 0, 0);
                    nextReminderTime = nextWeek.getTime();
                    break;
                case 'spaced':
                    const staggered = new Date(now);
                    staggered.setDate(staggered.getDate() + spacedInterval);
                    staggered.setHours(9, 0, 0, 0);
                    nextReminderTime = staggered.getTime();
                    break;
                case 'custom':
                    if (!customDate) {
                        setIsSaving(false);
                        return;
                    }
                    // Build the timestamp in LOCAL time: parseLocalDate avoids the
                    // UTC-midnight parse that would otherwise roll the day over.
                    const picked = parseLocalDate(customDate);
                    const [hours, minutes] = customTime.split(':').map(Number);
                    picked.setHours(hours, minutes, 0, 0);
                    nextReminderTime = picked.getTime();
                    break;
                case 'off':
                    await updateLinkReminder(uid, link.id, false);
                    toast.success('Reminder turned off');
                    // onUpdate (saved) before onClose (dismissed) so callers that
                    // treat a bare onClose as "cancelled" see the save first.
                    if (onUpdate) onUpdate();
                    onClose();
                    return;
            }

            // Hard invariant: a reminder can NEVER be created in the past. `now` is
            // re-derived at save (above), so this holds even if the modal sat open
            // across midnight or the picked time has since elapsed.
            if (nextReminderTime && nextReminderTime <= now.getTime()) {
                toast.error('Please pick a time in the future — that moment has already passed.');
                setIsSaving(false);
                return;
            }

            if (nextReminderTime) {
                await updateLinkReminder(
                    uid,
                    link.id,
                    true,
                    nextReminderTime,
                    selectedOption === 'spaced' ? `spaced-${spacedInterval}` : selectedOption
                );
                toast.success(`Reminder set for ${new Date(nextReminderTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`);
                // onUpdate (saved) before onClose (dismissed) so callers that
                // treat a bare onClose as "cancelled" see the save first.
                if (onUpdate) onUpdate();
                onClose();
            }

        } catch (error) {
            toast.error(`Couldn't set the reminder: ${error instanceof Error ? error.message : 'please try again.'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSelectOption = (option: ReminderOption) => {
        setSelectedOption(option);
    };

    const isReminderActive = link.reminderStatus === 'pending';

    // Materialize the custom default date the moment "Custom" is chosen (the
    // selects otherwise render a today fallback that was never committed to
    // state, so Save silently no-ops on an untouched picker). Late at night —
    // past the last 15-min slot — default to tomorrow so the picker doesn't
    // open onto a day with every time slot disabled.
    useEffect(() => {
        if (!isOpen || selectedOption !== 'custom' || customDate) return;
        const base = new Date();
        if (base.getHours() * 60 + base.getMinutes() >= 23 * 60 + 45) base.setDate(base.getDate() + 1);
        setCustomDate(formatLocalDate(base));
    }, [isOpen, selectedOption, customDate]);

    // Selection-time guards for the custom picker so past dates/times can't be
    // chosen in the first place. Recomputed every render (cheap), so the "today"
    // reference never goes stale while the modal sits open. The save-time check
    // above remains the hard backstop.
    const nowForGuards = new Date();
    const nowYear = nowForGuards.getFullYear();
    const nowMonth = nowForGuards.getMonth();
    const nowDay = nowForGuards.getDate();
    const nowMinutes = nowForGuards.getHours() * 60 + nowForGuards.getMinutes();
    const selDate = customDate ? parseLocalDate(customDate) : nowForGuards;
    const selYear = selDate.getFullYear();
    const selMonth = selDate.getMonth();
    const selDay = selDate.getDate();
    const selIsToday = selYear === nowYear && selMonth === nowMonth && selDay === nowDay;

    const OptionButton = ({
        option,
        icon: Icon,
        title,
        subtitle,
        highlighted = false
    }: {
        option: ReminderOption;
        icon: typeof Sparkles;
        title: string;
        subtitle: string;
        highlighted?: boolean;
    }) => {
        const isSelected = selectedOption === option;

        return (
            <button
                onClick={() => handleSelectOption(option)}
                disabled={isSaving}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group relative overflow-hidden
                    ${isSelected
                        ? 'bg-accent/20 border-accent ring-2 ring-accent'
                        : highlighted
                            ? 'bg-accent/5 border-accent/10 hover:bg-accent/10'
                            : 'bg-fill-subtle border-border-subtle hover:bg-fill-strong'
                    }
                    ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
                `}
            >
                <div className={`p-2 rounded-lg transition-colors
                    ${isSelected
                        ? 'bg-accent text-white'
                        : highlighted
                            ? 'bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white'
                            : 'bg-fill-subtle text-text-muted'
                    }
                `}>
                    {isSelected ? (
                        <Check className="w-5 h-5" />
                    ) : (
                        <Icon className="w-5 h-5" />
                    )}
                </div>
                <div className="flex-1">
                    <div className={`font-medium text-sm ${isSelected ? 'text-text' : 'text-text'}`}>
                        {title}
                    </div>
                    <div className="text-[11px] text-text-muted">{subtitle}</div>
                </div>
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={isSaving ? undefined : onClose}
            />

            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Set reminder"
                className="relative bg-card border border-border-strong w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 safe-pt focus:outline-none"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                    <h2 className="text-lg font-bold text-text flex items-center gap-2">
                        <Bell className="w-5 h-5 text-accent" />
                        Set Reminder
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        aria-label="Close"
                        className="p-2 rounded-full hover:bg-fill-subtle transition-all disabled:opacity-50"
                    >
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="px-2">
                        <p className="text-sm text-text-muted mb-1">When should we remind you about:</p>
                        <p className="text-base text-text font-semibold leading-snug">
                            &quot;{link.title}&quot;?
                        </p>
                    </div>

                    {isReminderActive && link.nextReminderAt && (
                        <div className="mx-2 p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="p-2 rounded-lg bg-accent/20 text-accent">
                                <Clock className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[11px] text-accent font-bold uppercase tracking-wider">Active Reminder</p>
                                <p className="text-sm text-text font-medium">
                                    {new Date(link.nextReminderAt).toLocaleString([], {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                        <OptionButton
                            option="smart"
                            icon={Sparkles}
                            title="Smart Reminder"
                            subtitle="Optimized for retention (starts in 24h)"
                        />
                        <OptionButton
                            option="tomorrow"
                            icon={Clock}
                            title="Tomorrow"
                            subtitle="9:00 AM"
                        />
                        <OptionButton
                            option="next-week"
                            icon={Calendar}
                            title="Next Week"
                            subtitle="In 7 days"
                        />
                        <div className="space-y-2">
                            <OptionButton
                                option="spaced"
                                icon={Bell}
                                title="Spaced Repetition"
                                subtitle="Initial interval for review"
                            />
                            {selectedOption === 'spaced' && (
                                <div className="flex gap-2 mx-2 p-1 bg-fill-subtle rounded-xl border border-border-subtle animate-in slide-in-from-top-2 duration-300">
                                    {[3, 5, 7].map((interval) => (
                                        <button
                                            key={interval}
                                            onClick={() => setSpacedInterval(interval)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
                                                ${spacedInterval === interval
                                                    ? 'bg-accent text-white shadow-sm'
                                                    : 'text-text-muted hover:bg-fill-subtle hover:text-text'
                                                }
                                            `}
                                        >
                                            {interval} Days
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Separator */}
                        <div className="flex items-center gap-3 py-2">
                            <div className="flex-1 h-px bg-fill-strong"></div>
                            <span className="text-xs text-text-muted uppercase tracking-wider">Or</span>
                            <div className="flex-1 h-px bg-fill-strong"></div>
                        </div>

                        {/* Custom Date & Time */}
                        <button
                            onClick={() => setSelectedOption('custom')}
                            disabled={isSaving}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full
                                ${selectedOption === 'custom'
                                    ? 'bg-accent/20 border-accent ring-2 ring-accent'
                                    : 'bg-fill-subtle border-border-subtle hover:bg-fill-strong'
                                }
                            `}
                        >
                            <div className={`p-2 rounded-lg transition-colors
                                ${selectedOption === 'custom'
                                    ? 'bg-accent text-white'
                                    : 'bg-fill-subtle text-text-muted'
                                }
                            `}>
                                {selectedOption === 'custom' ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    <Calendar className="w-5 h-5" />
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-text text-sm">Custom Date & Time</div>
                                <div className="text-[11px] text-text-muted">Pick your own schedule</div>
                            </div>
                        </button>

                        {selectedOption === 'custom' && (
                            <div className="pl-3 pr-3 pb-3 space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <select
                                        className="bg-surface-inset border border-border-strong rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                        onChange={(e) => {
                                            const currentDate = customDate ? parseLocalDate(customDate) : new Date();
                                            setCustomDate(formatLocalDate(withMonthClamped(currentDate, currentDate.getFullYear(), parseInt(e.target.value))));
                                        }}
                                        value={selMonth}
                                        disabled={isSaving}
                                    >
                                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
                                            <option key={i} value={i} disabled={selYear === nowYear && i < nowMonth}>{month}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="bg-surface-inset border border-border-strong rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                        onChange={(e) => {
                                            const currentDate = customDate ? parseLocalDate(customDate) : new Date();
                                            currentDate.setDate(parseInt(e.target.value));
                                            setCustomDate(formatLocalDate(currentDate));
                                        }}
                                        value={selDay}
                                        disabled={isSaving}
                                    >
                                        {Array.from({ length: daysInMonth(selYear, selMonth) }, (_, i) => i + 1).map(day => (
                                            <option key={day} value={day} disabled={selYear === nowYear && selMonth === nowMonth && day < nowDay}>{day}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="bg-surface-inset border border-border-strong rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                        onChange={(e) => {
                                            const currentDate = customDate ? parseLocalDate(customDate) : new Date();
                                            setCustomDate(formatLocalDate(withMonthClamped(currentDate, parseInt(e.target.value), currentDate.getMonth())));
                                        }}
                                        value={selYear}
                                        disabled={isSaving}
                                    >
                                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                <select
                                    className="w-full bg-surface-inset border border-border-strong rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    value={customTime}
                                    disabled={isSaving}
                                >
                                    {Array.from({ length: 24 }, (_, i) => {
                                        const hour = i.toString().padStart(2, '0');
                                        return ['00', '15', '30', '45'].map((min) => {
                                            const value = `${hour}:${min}`;
                                            // For today, disable slots at or before the current minute.
                                            const isPast = selIsToday && (i * 60 + parseInt(min)) <= nowMinutes;
                                            return (
                                                <option key={value} value={value} disabled={isPast}>{value}</option>
                                            );
                                        });
                                    }).flat()}
                                </select>
                            </div>
                        )}
                    </div>

                    {isReminderActive && (
                        <div className="pt-2 border-t border-border-subtle mt-2">
                            <button
                                onClick={() => handleSelectOption('off')}
                                disabled={isSaving}
                                className={`w-full py-3 rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2
                                    ${selectedOption === 'off'
                                        ? 'bg-red-500/20 border-2 border-red-500 text-red-500'
                                        : 'text-red-400 hover:bg-red-500/10 hover:text-red-500'
                                    }
                                `}
                            >
                                {selectedOption === 'off' && <Check className="w-4 h-4" />}
                                <BellOff className="w-4 h-4" />
                                Turn off Reminder
                            </button>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            className="flex-1 py-3 rounded-xl bg-fill-subtle hover:bg-fill-strong text-text-muted transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!selectedOption || isSaving || (selectedOption === 'custom' && !customDate)}
                            className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent/90 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
