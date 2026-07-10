'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Copy, Eye, EyeOff } from 'lucide-react';
import { fetchShareConfig } from '@/lib/shareConfig';
import { useToast } from '@/components/Toast';
import { LargeTitle, SectionHeader, Footnote, List, RowShell, RowText } from './primitives';

/** Browser-extension / iOS-Shortcut setup: reveals and copies the workspace's
    personal ingest token (and the endpoint the Shortcut posts to). The token is
    fetched from the get_share_config callable — the same server-side source of
    truth the native Share bridge uses, which mints one on first use. */
export function ExtensionView({ uid, toast }: { uid: string; toast: ReturnType<typeof useToast> }) {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [token, setToken] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [revealed, setRevealed] = useState(false);

    // Reload counter — bumped by Retry to re-run the fetch effect below.
    const [reloadNonce, setReloadNonce] = useState(0);
    // Fetch on entry (this screen only mounts when navigated to) and on retry.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setStatus('loading');
            try {
                const cfg = await fetchShareConfig(uid);
                if (cancelled) return;
                setToken(cfg.token);
                setEndpoint(cfg.endpoint);
                setStatus('ready');
            } catch {
                if (!cancelled) setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [uid, reloadNonce]);

    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
        } catch {
            toast.error("Couldn't copy — select the text and copy it manually.");
        }
    };

    const hasToken = status === 'ready' && !!token;
    const masked = token ? `••••${token.slice(-4)}` : '';

    return (
        <>
            <LargeTitle>Browser extension</LargeTitle>

            <SectionHeader first>Ingest token</SectionHeader>
            {status === 'loading' && (
                <List>
                    <RowShell>
                        <RowText title="Loading your token…" />
                        <RefreshCw className="ml-auto w-4 h-4 text-text-muted animate-spin shrink-0" />
                    </RowShell>
                </List>
            )}
            {status === 'error' && (
                <List>
                    <RowShell>
                        <RowText title="Couldn't load your token" sub="Check your connection and try again." />
                        <button
                            onClick={() => setReloadNonce((n) => n + 1)}
                            className="ml-auto h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </button>
                    </RowShell>
                </List>
            )}
            {hasToken && (
                <List>
                    <RowShell>
                        <div className="flex-1 min-w-0 py-[11px]">
                            <div className="text-[15px] text-text tracking-[-0.01em] leading-tight font-mono truncate">
                                {revealed ? token : masked}
                            </div>
                        </div>
                        <button
                            onClick={() => setRevealed((v) => !v)}
                            aria-label={revealed ? 'Hide token' : 'Reveal token'}
                            aria-pressed={revealed}
                            className="text-text-muted hover:text-accent transition-colors cursor-pointer shrink-0 p-1"
                        >
                            {revealed ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                        </button>
                        <button
                            onClick={() => copy(token, 'Token')}
                            className="ml-1 h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            <Copy className="w-4 h-4" />
                            Copy
                        </button>
                    </RowShell>
                </List>
            )}
            {status === 'ready' && !token && (
                <List>
                    <RowShell>
                        <RowText title="No token yet" sub="Your ingest token is created together with your workspace — reopen this screen in a moment." />
                    </RowShell>
                </List>
            )}
            <Footnote>Used by the browser extension and iOS Shortcut to save into your library. Paste it into the extension&apos;s settings popup, then keep it private.</Footnote>

            {hasToken && (
                <>
                    <SectionHeader>Endpoint</SectionHeader>
                    <List>
                        <RowShell>
                            <div className="flex-1 min-w-0 py-[11px]">
                                <div className="text-[15px] text-text tracking-[-0.01em] leading-tight font-mono truncate">{endpoint}</div>
                            </div>
                            <button
                                onClick={() => copy(endpoint, 'Endpoint')}
                                className="ml-1 h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[13px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                            >
                                <Copy className="w-4 h-4" />
                                Copy
                            </button>
                        </RowShell>
                    </List>
                    <Footnote>The browser extension already points here by default — only the token is required. This is the URL the iOS Shortcut posts to.</Footnote>
                </>
            )}
        </>
    );
}
