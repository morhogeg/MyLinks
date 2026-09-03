'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { fetchShareConfig } from '@/lib/shareConfig';
import { copyToClipboard } from '@/lib/share';
import { isNativeApp } from '@/lib/api';
import { LargeTitle, SectionHeader, Footnote } from './primitives';

/**
 * Settings → Browser extension.
 *
 * The desktop capture surface used to be unreachable: the extension asks for an
 * ingest token in its popup, and nothing in the app ever showed that token. This
 * screen is the missing half — install steps plus the token itself, masked until
 * you ask for it.
 *
 * The token comes from the SAME source as the iOS Share Extension's:
 * `fetchShareConfig` → `get_share_config` (callable on web, the HTTP twin on
 * native), which mints one on first use. No new endpoint, and no second token
 * to keep in sync.
 *
 * Shown on native too — people set up their Mac from their phone — with copy
 * that says it is a desktop thing.
 *
 * NO EM DASHES in this copy (web/scripts/check-em-dash.mjs gates the build).
 */

/** What `extension/popup.js` falls back to when its Backend URL field is empty.
    If the server hands back a different origin, the user has to fill that field
    in, so we say so instead of letting the extension quietly point elsewhere. */
const EXTENSION_DEFAULT_ORIGIN = 'https://secondbrain-app-94da2.web.app';

const MASK = '•'.repeat(32);

function originOf(endpoint: string): string | null {
    try {
        return new URL(endpoint).origin;
    } catch {
        return null;
    }
}

/** Numbered how-to list, styled like the settings cards around it. */
function Steps({ items }: { items: ReactNode[] }) {
    return (
        <ol className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-3 space-y-2.5">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                    <span className="w-[19px] h-[19px] mt-[1px] rounded-full bg-tile text-tile-ink text-[11px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
                        {i + 1}
                    </span>
                    <span className="flex-1 text-[14.5px] text-text-secondary leading-snug">{item}</span>
                </li>
            ))}
        </ol>
    );
}

function Mono({ children }: { children: ReactNode }) {
    return <code dir="ltr" className="font-mono text-[13px] text-text">{children}</code>;
}

export function ExtensionView({ uid }: { uid: string | null }) {
    const [token, setToken] = useState<string | null>(null);
    const [endpoint, setEndpoint] = useState<string | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        fetchShareConfig(uid)
            .then((cfg) => {
                if (cancelled) return;
                setToken(cfg.token);
                setEndpoint(cfg.endpoint);
                setState('ready');
            })
            .catch(() => {
                if (!cancelled) setState('error');
            });
        return () => { cancelled = true; };
    }, [uid, reload]);

    const doCopy = useCallback(async () => {
        if (!token) return;
        if (await copyToClipboard(token)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        }
    }, [token]);

    const native = isNativeApp();
    const serverOrigin = endpoint ? originOf(endpoint) : null;
    const needsBackendUrl = !!serverOrigin && serverOrigin !== EXTENSION_DEFAULT_ORIGIN;

    return (
        <div className="pb-2">
            <LargeTitle>Browser extension</LargeTitle>
            <p className="px-1 text-[15px] text-text-secondary leading-snug">
                Save any page from your desktop browser in one click.
                {native ? ' Set it up on your computer, in Chrome, Edge, Brave, or Safari.' : ' It works in Chrome, Edge, Brave, and Safari.'}
            </p>

            <SectionHeader>Get the extension</SectionHeader>
            <Steps
                items={[
                    <>Put the <Mono>extension</Mono> folder from the Machina source on your computer.</>,
                    <>Open <Mono>chrome://extensions</Mono> and turn on Developer mode.</>,
                    <>Click Load unpacked and choose that <Mono>extension</Mono> folder.</>,
                    <>Pin Machina so its icon sits in the toolbar.</>,
                ]}
            />
            <Footnote>
                Machina is not in the Chrome Web Store yet, so the extension is installed by hand. Edge and Brave
                work the same way, at <Mono>edge://extensions</Mono> and <Mono>brave://extensions</Mono>. Safari
                needs a one time build in Xcode, written up in <Mono>safari/README.md</Mono>.
            </Footnote>

            <SectionHeader>Your token</SectionHeader>
            {!uid ? (
                <div className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-3 text-[14.5px] text-text-secondary leading-snug">
                    Sign in to see your token.
                </div>
            ) : state === 'loading' ? (
                <div className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-3 text-[14.5px] text-text-muted leading-snug">
                    Loading your token…
                </div>
            ) : state === 'error' ? (
                <div className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-3">
                    <div className="text-[14.5px] text-text leading-snug">Could not load your token.</div>
                    <button
                        onClick={() => { setState('loading'); setReload((n) => n + 1); }}
                        className="mt-2.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card-hover border border-border-subtle text-[13px] font-semibold text-text hover:border-accent/40 transition-colors cursor-pointer"
                    >
                        <RefreshCw className="w-[14px] h-[14px]" />
                        Try again
                    </button>
                </div>
            ) : (
                <div className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-3">
                    <div
                        dir="ltr"
                        className={`font-mono text-[13px] leading-relaxed break-all ${revealed ? 'text-text select-all' : 'text-text-muted select-none'}`}
                    >
                        {revealed ? token : MASK}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        <button
                            onClick={() => setRevealed((v) => !v)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card-hover border border-border-subtle text-[13px] font-semibold text-text hover:border-accent/40 transition-colors cursor-pointer"
                        >
                            {revealed ? <EyeOff className="w-[14px] h-[14px]" /> : <Eye className="w-[14px] h-[14px]" />}
                            {revealed ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                            onClick={doCopy}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card-hover border border-border-subtle text-[13px] font-semibold text-text hover:border-accent/40 transition-colors cursor-pointer"
                        >
                            {copied
                                ? <Check className="w-[14px] h-[14px] text-green-500" />
                                : <Copy className="w-[14px] h-[14px]" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            )}
            <Footnote>Anything saved with this token lands in this account, so keep it to yourself.</Footnote>

            {needsBackendUrl && (
                <Footnote>
                    Also set Backend URL in the extension to <Mono>{serverOrigin}</Mono>, which is where this
                    account saves.
                </Footnote>
            )}

            <SectionHeader>Where to paste it</SectionHeader>
            <Steps
                items={[
                    <>Click the Machina icon in the toolbar. With no token set it opens the settings popup.</>,
                    <>Paste the token, click Save and connect, and wait for it to say Connected.</>,
                ]}
            />
            <Footnote>
                After that, click the icon on any page to save it, or press <Mono>Ctrl+Shift+S</Mono>
                {' '}(<Mono>Command+Shift+S</Mono> on a Mac). Right click a link or a selection to save that instead.
            </Footnote>
        </div>
    );
}
