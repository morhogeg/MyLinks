'use client';

import { useState, useEffect } from 'react';
import { User } from '@/lib/types';

import { X, Bell, BellOff, Sun, Moon, Phone, Sparkles, Share2, Copy, Check } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
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

    // Share-to-app (iOS Shortcut) config
    const [shareConfig, setShareConfig] = useState<{ endpoint: string; token: string } | null>(null);
    const [shareLoading, setShareLoading] = useState(false);
    const [copied, setCopied] = useState<'endpoint' | 'token' | null>(null);

    useEffect(() => {
        if (isOpen && uid) {
            loadSettings();
            loadShareConfig();
        }
    }, [isOpen, uid]);

    const loadShareConfig = async () => {
        setShareLoading(true);
        try {
            const fn = httpsCallable(functions, 'get_share_config');
            const result = await fn({ uid });
            setShareConfig(result.data as { endpoint: string; token: string });
        } catch (error) {
            console.error('Failed to load share config:', error);
        } finally {
            setShareLoading(false);
        }
    };

    const handleCopy = async (value: string, which: 'endpoint' | 'token') => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(which);
            setTimeout(() => setCopied(null), 1500);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    };

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

                    {/* Share to Second Brain (iOS Shortcut) */}
                    <section className="pt-2 border-t border-white/5">
                        <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Share to Second Brain</h3>

                        <div className="flex items-start gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                                <Share2 className="w-5 h-5" />
                            </div>
                            <p className="text-xs text-text-muted leading-relaxed">
                                Save links from any app (Safari, Maps, Instagram…) with an iOS Shortcut.
                                Paste the values below into the Shortcut once. See{' '}
                                <span className="font-medium text-text">SHORTCUT_SETUP.md</span> for steps.
                            </p>
                        </div>

                        {shareLoading && (
                            <div className="text-xs text-text-muted">Loading your endpoint…</div>
                        )}

                        {shareConfig && (
                            <div className="space-y-3">
                                {([
                                    { label: 'Endpoint URL', value: shareConfig.endpoint, key: 'endpoint' as const },
                                    { label: 'Ingest Token (X-Ingest-Token)', value: shareConfig.token, key: 'token' as const },
                                ]).map(({ label, value, key }) => (
                                    <div key={key}>
                                        <label className="text-[11px] text-text-muted block mb-1">{label}</label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-text font-mono">
                                                {value}
                                            </code>
                                            <button
                                                onClick={() => handleCopy(value, key)}
                                                className="shrink-0 p-2 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:bg-white/10 hover:text-text transition-all"
                                                aria-label={`Copy ${label}`}
                                            >
                                                {copied === key ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <p className="text-[11px] text-text-muted leading-relaxed">
                                    Keep your token private — anyone with it can save links to your brain.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* App Version / Maintenance */}
                    <section className="pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium text-text">Force Update</div>
                                <div className="text-xs text-text-muted">Reload app to apply latest fixes</div>
                            </div>
                            <button
                                onClick={() => {
                                    if (typeof window !== 'undefined') {
                                        window.location.reload();
                                    }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-text hover:bg-white/10 transition-all flex items-center gap-2"
                            >
                                <Sparkles className="w-3 h-3 text-accent" />
                                Reload App
                            </button>
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
