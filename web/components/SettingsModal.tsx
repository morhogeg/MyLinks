'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { User } from '@/lib/types';
import { X, Bell, Sparkles, Share2, Copy, Check, Sun, Moon, Monitor, MessageCircle, RefreshCw, Palette, BrainCircuit, ShieldCheck } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { updateUserSettings, getUserSettings } from '@/lib/storage';
import { useTheme } from './ThemeProvider';

interface SettingsModalProps {
    uid: string;
    isOpen: boolean;
    onClose: () => void;
}

type Frequency = User['settings']['reminder_frequency'];

const FREQUENCY_NOTE: Record<string, string> = {
    smart: 'Spaced repetition (1 day → 1 week → 1 month) for long-term retention.',
    daily: 'One reminder per day for items with an active reminder.',
    weekly: 'A weekly nudge to revisit what you saved.',
};

export default function SettingsModal({ uid, isOpen, onClose }: SettingsModalProps) {
    const { theme, setTheme } = useTheme();

    const [settings, setSettings] = useState<User['settings']>({
        theme: 'dark',
        daily_digest: false,
        reminders_enabled: true,
        reminder_frequency: 'smart',
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

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
                    reminder_frequency: userSettings.reminder_frequency || 'smart',
                });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateUserSettings(uid, {
                reminders_enabled: settings.reminders_enabled,
                reminder_frequency: settings.reminder_frequency,
            });
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                className="relative w-full max-w-lg max-h-[88vh] rounded-3xl bg-card border border-border-subtle shadow-[var(--shadow-card-hover)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 safe-pt"
            >
                {/* Header */}
                <div className="relative flex items-center justify-between px-6 py-5 border-b border-border-subtle">
                    <div className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--accent-gradient)] opacity-30" />
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/15">
                            <BrainCircuit className="w-5 h-5 text-white" />
                        </div>
                        <div className="leading-tight">
                            <h2 className="text-lg font-bold text-text">Settings</h2>
                            <p className="text-[11px] text-text-muted">Tune your Second Brain</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-9 w-9 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                        aria-label="Close settings"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
                    {/* Appearance */}
                    <Section icon={<Palette className="w-4 h-4" />} title="Appearance">
                        <Row title="Theme" subtitle="Applies instantly across the app">
                            <Segmented
                                value={theme}
                                onChange={(v) => setTheme(v as typeof theme)}
                                options={[
                                    { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
                                    { value: 'system', label: 'Auto', icon: <Monitor className="w-4 h-4" /> },
                                    { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
                                ]}
                            />
                        </Row>
                    </Section>

                    {/* Reminders */}
                    <Section icon={<Bell className="w-4 h-4" />} title="Reminders">
                        <Row
                            title="WhatsApp reminders"
                            subtitle="Resurface saved items so you actually revisit them"
                        >
                            <Toggle
                                on={settings.reminders_enabled}
                                onChange={() => setSettings((p) => ({ ...p, reminders_enabled: !p.reminders_enabled }))}
                            />
                        </Row>

                        {settings.reminders_enabled && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                <Segmented
                                    value={settings.reminder_frequency || 'smart'}
                                    onChange={(v) => setSettings((p) => ({ ...p, reminder_frequency: v as Frequency }))}
                                    options={[
                                        { value: 'smart', label: 'Smart' },
                                        { value: 'daily', label: 'Daily' },
                                        { value: 'weekly', label: 'Weekly' },
                                    ]}
                                />
                                <div className="flex gap-2 p-3 rounded-xl bg-accent/5 border border-accent/10">
                                    <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                    <p className="text-[12px] text-text-secondary leading-relaxed">
                                        {FREQUENCY_NOTE[settings.reminder_frequency || 'smart']}
                                    </p>
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* Capture */}
                    <Section icon={<Share2 className="w-4 h-4" />} title="Capture links">
                        <Row
                            icon={<MessageCircle className="w-5 h-5 text-green-500" />}
                            title="WhatsApp"
                            subtitle="Send any link to the bot — it's saved, summarized, and tagged automatically."
                        />

                        <div className="h-px bg-border-subtle" />

                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 shrink-0 text-accent"><Share2 className="w-5 h-5" /></div>
                                <p className="text-[12px] text-text-secondary leading-relaxed">
                                    <span className="font-semibold text-text">iOS Shortcut</span> — save from any app
                                    (Safari, Maps, Instagram…). Paste these into the Shortcut once; see{' '}
                                    <span className="font-medium text-text">SHORTCUT_SETUP.md</span>.
                                </p>
                            </div>

                            {shareLoading && <div className="text-xs text-text-muted pl-8">Loading your endpoint…</div>}

                            {shareConfig && (
                                <div className="space-y-2.5 pl-8">
                                    {[
                                        { label: 'Endpoint URL', value: shareConfig.endpoint, key: 'endpoint' as const },
                                        { label: 'Ingest Token', value: shareConfig.token, key: 'token' as const },
                                    ].map(({ label, value, key }) => (
                                        <div key={key}>
                                            <label className="text-[11px] font-medium text-text-muted block mb-1">{label}</label>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-xl bg-card-hover border border-border-subtle text-xs text-text-secondary font-mono">
                                                    {value}
                                                </code>
                                                <button
                                                    onClick={() => handleCopy(value, key)}
                                                    className="shrink-0 h-9 w-9 rounded-xl bg-card-hover border border-border-subtle text-text-muted hover:text-text hover:border-accent/40 transition-all flex items-center justify-center cursor-pointer"
                                                    aria-label={`Copy ${label}`}
                                                >
                                                    {copied === key ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                        Keep your token private — anyone with it can save to your brain.
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* About */}
                    <Section icon={<RefreshCw className="w-4 h-4" />} title="About">
                        <Row title="Second Brain" subtitle="Your knowledge, organized">
                            <button
                                onClick={() => typeof window !== 'undefined' && window.location.reload()}
                                className="h-9 px-3.5 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reload
                            </button>
                        </Row>
                    </Section>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2 bg-card">
                    <button
                        onClick={onClose}
                        className="h-10 px-4 rounded-full text-sm font-semibold text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="h-10 px-5 rounded-full text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 shadow-lg shadow-accent/20 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------- small building blocks ---------- */

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2 text-text-muted">
                {icon}
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em]">{title}</h3>
            </div>
            <div className="rounded-2xl border border-border-subtle p-4 space-y-4">{children}</div>
        </section>
    );
}

function Row({ icon, title, subtitle, children }: { icon?: ReactNode; title: string; subtitle?: string; children?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
                {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-text">{title}</div>
                    {subtitle && <div className="text-[12px] text-text-muted leading-relaxed mt-0.5">{subtitle}</div>}
                </div>
            </div>
            {children && <div className="shrink-0">{children}</div>}
        </div>
    );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (
        <button
            onClick={onChange}
            role="switch"
            aria-checked={on}
            className={`relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${on ? 'bg-accent' : 'bg-text-muted/25'}`}
        >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
    return (
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-card-hover border border-border-subtle w-full">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        onClick={() => onChange(o.value)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${active ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text'}`}
                    >
                        {o.icon}
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
