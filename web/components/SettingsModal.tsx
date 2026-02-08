'use client';

import { useState, useEffect } from 'react';
import { User } from '@/lib/types';
import { X, Bell, BellOff, Sun, Moon, Phone } from 'lucide-react';
import { updateUserSettings, getUserSettings } from '@/lib/storage'; // We'll add these next

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

    const handleToggleReminders = async () => {
        const newValue = !settings.reminders_enabled;
        setSettings(prev => ({ ...prev, reminders_enabled: newValue }));
        await updateUserSettings(uid, { reminders_enabled: newValue });
    };

    const handleFrequencyChange = async (frequency: User['settings']['reminder_frequency']) => {
        setSettings(prev => ({ ...prev, reminder_frequency: frequency }));
        await updateUserSettings(uid, { reminder_frequency: frequency });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative bg-card border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
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
                        </div>
                    </section>
                </div>

                <div className="p-6 bg-white/5 border-t border-white/5 text-center">
                    <p className="text-xs text-text-muted">
                        Changes are saved automatically
                    </p>
                </div>
            </div>
        </div>
    );
}
