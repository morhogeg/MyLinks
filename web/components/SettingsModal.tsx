'use client';

import { useState, useEffect } from 'react';
import { User } from '@/lib/types';

import { X, Bell, BellOff, Sun, Moon, Phone, Sparkles } from 'lucide-react';
import { updateUserSettings, getUserSettings } from '@/lib/storage';

interface SettingsModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ uid, isOpen, onClose }: SettingsModalProps) {
    const [settings, setSettings] = useState<User['settings']>({
        theme: 'dark',
        daily_digest: false,
        reminders_enabled: true,
        reminder_frequency: 'smart'
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen && uid) {
            loadSettings();
        }
    }, [isOpen, uid]);

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const userSettings = await getUserSettings(uid);
            if (userSettings) {
                setSettings({
                    theme: userSettings.theme || 'dark',
                    daily_digest: userSettings.daily_digest || false,
                    reminders_enabled: userSettings.reminders_enabled ?? true,
                    reminder_frequency: userSettings.reminder_frequency || 'smart'
                });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleReminders = () => {
        setSettings(prev => ({ ...prev, reminders_enabled: !prev.reminders_enabled }));
    };

    const handleFrequencyChange = (frequency: User['settings']['reminder_frequency']) => {
        setSettings(prev => ({ ...prev, reminder_frequency: frequency }));
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateUserSettings(uid, {
                reminders_enabled: settings.reminders_enabled,
                reminder_frequency: settings.reminder_frequency
            });
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative bg-card border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 safe-pt">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <h2 className="text-lg font-bold text-white">Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Notifications Section */}
                    <section>
                        <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Notifications</h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-xl ${settings.reminders_enabled ? 'bg-accent/10 text-accent' : 'bg-white/5 text-text-muted'}`}>
                                        {settings.reminders_enabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <div className="font-medium text-text">Global Reminders</div>
                                        <div className="text-xs text-text-muted">Receive WhatsApp notifications</div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleToggleReminders}
                                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${settings.reminders_enabled ? 'bg-accent' : 'bg-white/10'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${settings.reminders_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {settings.reminders_enabled && (
                                <div className="ml-[52px] space-y-2">
                                    <label className="text-xs text-text-muted block mb-1">Frequency</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['smart', 'daily', 'weekly'] as const).map((freq) => (
                                            <button
                                                key={freq}
                                                onClick={() => handleFrequencyChange(freq)}
                                                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${settings.reminder_frequency === freq
                                                    ? 'bg-accent/10 border-accent/20 text-accent'
                                                    : 'bg-white/5 border-white/5 text-text-muted hover:bg-white/10'
                                                    }`}
                                            >
                                                {freq.charAt(0).toUpperCase() + freq.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {settings.reminders_enabled && settings.reminder_frequency === 'smart' && (
                                <div className="mt-3 p-3 rounded-xl bg-accent/5 border border-accent/10 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex gap-2">
                                        <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-text">Smart Scheduling</p>
                                            <p className="text-[11px] text-text-muted leading-relaxed">
                                                Optimizes learning using spaced repetition (1 day, 1 week, 1 month) to ensure long-term retention.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="p-6 bg-black/20 border-t border-white/5 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:text-text transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 shadow-lg shadow-accent/20"
                    >
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
