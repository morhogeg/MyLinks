'use client';

import { useState } from 'react';
import { Link } from '@/lib/types';
import { X, Sparkles, Calendar, Clock, Bell, BellOff } from 'lucide-react';
import { updateLinkReminder } from '@/lib/storage';

interface ReminderModalProps {
    uid: string;
    link: Link;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

export default function ReminderModal({ uid, link, isOpen, onClose, onUpdate }: ReminderModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [customDate, setCustomDate] = useState('');

    if (!isOpen) return null;

    const handleSetReminder = async (option: 'smart' | 'tomorrow' | 'next-week' | 'custom' | 'off') => {
        console.log('Reminder option selected:', option);
        setIsLoading(true);
        try {
            let nextReminderTime: number | undefined;
            const now = new Date();

            switch (option) {
                case 'smart':
                    nextReminderTime = now.getTime() + (24 * 60 * 60 * 1000);
                    console.log('Smart reminder time:', new Date(nextReminderTime));
                    break;
                case 'tomorrow':
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(9, 0, 0, 0);
                    nextReminderTime = tomorrow.getTime();
                    console.log('Tomorrow reminder time:', new Date(nextReminderTime));
                    break;
                case 'next-week':
                    const nextWeek = new Date(now);
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    nextWeek.setHours(9, 0, 0, 0);
                    nextReminderTime = nextWeek.getTime();
                    console.log('Next week reminder time:', new Date(nextReminderTime));
                    break;
                case 'custom':
                    if (!customDate) {
                        console.error('No custom date selected');
                        setIsLoading(false);
                        return;
                    }
                    const picked = new Date(customDate);
                    picked.setHours(9, 0, 0, 0);
                    nextReminderTime = picked.getTime();
                    console.log('Custom reminder time:', new Date(nextReminderTime));
                    break;
                case 'off':
                    console.log('Turning off reminder for link:', link.id);
                    await updateLinkReminder(uid, link.id, false);
                    console.log('Reminder disabled successfully');
                    onClose();
                    if (onUpdate) onUpdate();
                    setIsLoading(false);
                    return;
            }

            if (nextReminderTime) {
                console.log('Setting reminder for link:', link.id, 'at', new Date(nextReminderTime));
                await updateLinkReminder(uid, link.id, true, nextReminderTime);
                console.log('Reminder set successfully');
                onClose();
                if (onUpdate) onUpdate();
            } else {
                console.error('No reminder time calculated');
            }

        } catch (error) {
            console.error("Failed to set reminder:", error);
            alert(`Failed to set reminder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const isReminderActive = link.reminderStatus === 'pending';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative bg-card border border-white/10 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Bell className="w-5 h-5 text-accent" />
                        Set Reminder
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    <p className="text-sm text-text-muted px-2">
                        When should we remind you about <span className="text-text font-medium line-clamp-1">&quot;{link.title}&quot;</span>?
                    </p>

                    <div className="grid grid-cols-1 gap-2">
                        <button
                            onClick={() => handleSetReminder('smart')}
                            disabled={isLoading}
                            className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/10 hover:bg-accent/10 transition-all text-left group"
                        >
                            <div className="p-2 rounded-lg bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="font-medium text-text text-sm">Smart Reminder</div>
                                <div className="text-[11px] text-text-muted">Optimized for retention (starts in 24h)</div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleSetReminder('tomorrow')}
                            disabled={isLoading}
                            className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left"
                        >
                            <div className="p-2 rounded-lg bg-white/5 text-text-muted">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="font-medium text-text text-sm">Tomorrow</div>
                                <div className="text-[11px] text-text-muted">9:00 AM</div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleSetReminder('next-week')}
                            disabled={isLoading}
                            className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left"
                        >
                            <div className="p-2 rounded-lg bg-white/5 text-text-muted">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="font-medium text-text text-sm">Next Week</div>
                                <div className="text-[11px] text-text-muted">In 7 days</div>
                            </div>
                        </button>

                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <label className="text-xs text-text-muted block mb-2 font-medium">Pick a date</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/50"
                                    onChange={(e) => setCustomDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                />
                                <button
                                    onClick={() => handleSetReminder('custom')}
                                    disabled={!customDate || isLoading}
                                    className="px-4 py-2 bg-white/10 hover:bg-accent text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    Set
                                </button>
                            </div>
                        </div>
                    </div>

                    {isReminderActive && (
                        <div className="pt-2 border-t border-white/5 mt-2">
                            <button
                                onClick={() => handleSetReminder('off')}
                                disabled={isLoading}
                                className="w-full py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-all text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <BellOff className="w-4 h-4" />
                                Turn off Reminder
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
