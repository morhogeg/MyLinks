'use client';

import { useState } from 'react';
import { Link } from '@/lib/types';
import { X, Sparkles, Calendar, Clock, Bell, BellOff, Loader2, Check } from 'lucide-react';
import { updateLinkReminder } from '@/lib/storage';

interface ReminderModalProps {
    uid: string;
    link: Link;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

type ReminderOption = 'smart' | 'tomorrow' | 'next-week' | 'spaced' | 'custom' | 'off';

export default function ReminderModal({ uid, link, isOpen, onClose, onUpdate }: ReminderModalProps) {
    const [selectedOption, setSelectedOption] = useState<ReminderOption | null>(null);
    const [spacedInterval, setSpacedInterval] = useState<number>(3);
    const [customDate, setCustomDate] = useState('');
    const [customTime, setCustomTime] = useState('09:00');
    const [isSaving, setIsSaving] = useState(false);

    // Effect to initialize state when modal opens
    useState(() => {
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
                    setCustomDate(date.toISOString().split('T')[0]);
                    setCustomTime(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
                }
            } else {
                setSelectedOption('smart');
            }
        }
    });

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!selectedOption) return;

        console.log('Saving reminder option:', selectedOption);
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
                    const picked = new Date(customDate);
                    const [hours, minutes] = customTime.split(':').map(Number);
                    picked.setHours(hours, minutes, 0, 0);
                    nextReminderTime = picked.getTime();
                    break;
                case 'off':
                    await updateLinkReminder(uid, link.id, false);
                    onClose();
                    if (onUpdate) onUpdate();
                    return;
            }

            if (nextReminderTime) {
                console.log('Setting reminder for:', new Date(nextReminderTime).toLocaleString());
                await updateLinkReminder(
                    uid,
                    link.id,
                    true,
                    nextReminderTime,
                    selectedOption === 'spaced' ? `spaced-${spacedInterval}` : selectedOption
                );
                onClose();
                if (onUpdate) onUpdate();
            }

        } catch (error) {
            console.error("Failed to set reminder:", error);
            alert(`Failed to set reminder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSelectOption = (option: ReminderOption) => {
        setSelectedOption(option);
        console.log('Selected option:', option);
    };

    const isReminderActive = link.reminderStatus === 'pending';

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
                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                    }
                    ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
                `}
            >
                <div className={`p-2 rounded-lg transition-colors
                    ${isSelected
                        ? 'bg-accent text-white'
                        : highlighted
                            ? 'bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white'
                            : 'bg-white/5 text-text-muted'
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

            <div className="relative bg-card border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 safe-pt">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <h2 className="text-lg font-bold text-text flex items-center gap-2">
                        <Bell className="w-5 h-5 text-accent" />
                        Set Reminder
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="p-2 rounded-full hover:bg-white/5 transition-all disabled:opacity-50"
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
                                <div className="flex gap-2 mx-2 p-1 bg-white/5 rounded-xl border border-white/5 animate-in slide-in-from-top-2 duration-300">
                                    {[3, 5, 7].map((interval) => (
                                        <button
                                            key={interval}
                                            onClick={() => setSpacedInterval(interval)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
                                                ${spacedInterval === interval
                                                    ? 'bg-accent text-white shadow-sm'
                                                    : 'text-text-muted hover:bg-white/5 hover:text-text'
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
                            <div className="flex-1 h-px bg-white/10"></div>
                            <span className="text-xs text-text-muted uppercase tracking-wider">Or</span>
                            <div className="flex-1 h-px bg-white/10"></div>
                        </div>

                        {/* Custom Date & Time */}
                        <button
                            onClick={() => setSelectedOption('custom')}
                            disabled={isSaving}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full
                                ${selectedOption === 'custom'
                                    ? 'bg-accent/20 border-accent ring-2 ring-accent'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }
                            `}
                        >
                            <div className={`p-2 rounded-lg transition-colors
                                ${selectedOption === 'custom'
                                    ? 'bg-accent text-white'
                                    : 'bg-white/5 text-text-muted'
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
                                        className="bg-black/20 border border-white/10 rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                        onChange={(e) => {
                                            const currentDate = customDate ? new Date(customDate) : new Date();
                                            currentDate.setMonth(parseInt(e.target.value));
                                            setCustomDate(currentDate.toISOString().split('T')[0]);
                                        }}
                                        value={customDate ? new Date(customDate).getMonth() : new Date().getMonth()}
                                        disabled={isSaving}
                                    >
                                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
                                            <option key={i} value={i}>{month}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="bg-black/20 border border-white/10 rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                        onChange={(e) => {
                                            const currentDate = customDate ? new Date(customDate) : new Date();
                                            currentDate.setDate(parseInt(e.target.value));
                                            setCustomDate(currentDate.toISOString().split('T')[0]);
                                        }}
                                        value={customDate ? new Date(customDate).getDate() : new Date().getDate()}
                                        disabled={isSaving}
                                    >
                                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                            <option key={day} value={day}>{day}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="bg-black/20 border border-white/10 rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                        onChange={(e) => {
                                            const currentDate = customDate ? new Date(customDate) : new Date();
                                            currentDate.setFullYear(parseInt(e.target.value));
                                            setCustomDate(currentDate.toISOString().split('T')[0]);
                                        }}
                                        value={customDate ? new Date(customDate).getFullYear() : new Date().getFullYear()}
                                        disabled={isSaving}
                                    >
                                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    value={customTime}
                                    disabled={isSaving}
                                >
                                    {Array.from({ length: 24 }, (_, i) => {
                                        const hour = i.toString().padStart(2, '0');
                                        return [
                                            <option key={`${hour}:00`} value={`${hour}:00`}>{`${hour}:00`}</option>,
                                            <option key={`${hour}:15`} value={`${hour}:15`}>{`${hour}:15`}</option>,
                                            <option key={`${hour}:30`} value={`${hour}:30`}>{`${hour}:30`}</option>,
                                            <option key={`${hour}:45`} value={`${hour}:45`}>{`${hour}:45`}</option>
                                        ];
                                    }).flat()}
                                </select>
                            </div>
                        )}
                    </div>

                    {isReminderActive && (
                        <div className="pt-2 border-t border-white/5 mt-2">
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
                            className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted transition-all disabled:opacity-50"
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
