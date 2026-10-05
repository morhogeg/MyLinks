'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Check, ChevronRight, Copy, Eye, EyeOff, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { fetchShareConfig, rotateShareToken } from '@/lib/shareConfig';
import ConfirmDialog from '@/components/ConfirmDialog';
import { copyToClipboard, openExternal } from '@/lib/share';
import { isNativeApp } from '@/lib/api';
import {
    browserKind, chromeWebStoreUrl, connectExtension, connectFailureText, detectExtension, macAppStoreUrl,
    onExtensionReady, tokenTag, type ExtensionStatus,
} from '@/lib/extension';
import { LargeTitle, SectionHeader, Footnote } from './primitives';

/**
 * Settings → Browser extension.
 *
 * For a normal person this is three steps on one screen: add the extension
 * from the Chrome Web Store, connect it with one click (this page hands the
 * extension the account's ingest token directly, see lib/extension.ts), then
 * save from any page. The token itself, Reset, and the paste fallback live
 * under Advanced.
 *
 * Until the store listing exists (CHROME_WEB_STORE_ITEM_ID in lib/extension),
 * the install step says "Coming soon" instead of pretending; load-unpacked
 * instructions are for developers and live in extension/README.md.
 *
 * The token comes from the SAME source as the iOS Share Extension's:
 * `fetchShareConfig` (get_share_config), which mints one on first use.
 *
 * NO EM DASHES in this copy (web/scripts/check-em-dash.mjs gates the build).
 */

const MASK = '•'.repeat(32);
const DETECT_EVERY_MS = 2500;

type ConnectState = 'idle' | 'busy' | 'error';

function Card({ children }: { children: ReactNode }) {
    return <div className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-[14px]">{children}</div>;
}

function PrimaryButton({ children, onClick, disabled, busy }: { children: ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 h-11 px-4 rounded-xl bg-accent text-accent-ink text-[15px] font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:cursor-default disabled:opacity-60"
        >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {children}
        </button>
    );
}

const SMALL_BTN = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card-hover border border-border-subtle text-[13px] font-semibold text-text hover:border-border-strong transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default';

function ComingSoonButton() {
    return (
        <button
            type="button"
            disabled
            className="mt-3 inline-flex w-full items-center justify-center h-11 px-4 rounded-xl border border-border-subtle bg-card-hover text-[15px] font-semibold text-text-muted cursor-default"
        >
            Coming soon
        </button>
    );
}

function Mono({ children }: { children: ReactNode }) {
    return <code dir="ltr" className="font-mono text-[13px] text-text">{children}</code>;
}

function StatusLine({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
    return (
        <div className="flex items-start gap-2.5">
            <span className="mt-[1px] w-[22px] h-[22px] shrink-0 rounded-full bg-tile text-tile-ink flex items-center justify-center" aria-hidden>
                {icon}
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-semibold text-text leading-snug">{title}</div>
                {children && <div className="mt-0.5 text-[14px] text-text-secondary leading-snug">{children}</div>}
            </div>
        </div>
    );
}

export function ExtensionView({
    uid, account, autoConnect,
}: {
    uid: string | null;
    /** Shown in the extension's settings ("Saving to …"). */
    account?: string | null;
    /** Opened from the extension's Connect button (`/?connect=extension`):
        connect as soon as the extension and the token are both known. */
    autoConnect?: boolean;
}) {
    const native = isNativeApp();
    // Where the extension can run: desktop Chrome/Edge/Brave, or Safari on a Mac.
    const [kind] = useState(() => (native ? 'other' : browserKind()));
    const desktop = kind !== 'other';
    const safari = kind === 'safari';
    const storeUrl = chromeWebStoreUrl();
    const masUrl = macAppStoreUrl();

    // ── The account's token ─────────────────────────────────────────────────
    const [token, setToken] = useState<string | null>(null);
    const [myTag, setMyTag] = useState<string | null>(null);
    const [tokenState, setTokenState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        fetchShareConfig(uid)
            .then(async (cfg) => {
                if (cancelled) return;
                setToken(cfg.token);
                setMyTag(await tokenTag(cfg.token));
                setTokenState('ready');
            })
            .catch(() => { if (!cancelled) setTokenState('error'); });
        return () => { cancelled = true; };
    }, [uid, reload]);

    // ── The extension in this browser ───────────────────────────────────────
    // `undefined` = still looking (first answer pending), `null` = not found.
    const [ext, setExt] = useState<ExtensionStatus | null | undefined>(desktop ? undefined : null);
    const refreshExt = useCallback(async () => {
        const found = await detectExtension();
        setExt(found);
        return found;
    }, []);

    useEffect(() => {
        if (!desktop) return;
        let stop = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Keep looking until it shows up: someone who just clicked "Add to
        // Chrome" comes back to this screen with it installed.
        const tick = async () => {
            const found = await detectExtension();
            if (stop) return;
            setExt(found);
            if (!found) timer = setTimeout(tick, DETECT_EVERY_MS);
        };
        void tick();
        const onFocus = () => { void refreshExt(); };
        window.addEventListener('focus', onFocus);
        // The content script says hello when it arrives (Safari: right after
        // the person allows Machina on this site).
        const offReady = onExtensionReady(() => { void refreshExt(); });
        return () => {
            stop = true;
            if (timer) clearTimeout(timer);
            window.removeEventListener('focus', onFocus);
            offReady();
        };
    }, [desktop, refreshExt]);

    const connectedHere = !!ext?.connected && !!ext.tokenTag && !!myTag && ext.tokenTag === myTag;
    const connectedElsewhere = !!ext?.connected && !connectedHere && !!myTag;

    // ── Connect ─────────────────────────────────────────────────────────────
    const [connectState, setConnectState] = useState<ConnectState>('idle');
    const [connectError, setConnectError] = useState('');

    const doConnect = useCallback(async () => {
        if (!ext || !token) return;
        setConnectState('busy');
        setConnectError('');
        const r = await connectExtension(token, account);
        if (r.ok) {
            setConnectState('idle');
            await refreshExt();
        } else {
            setConnectState('error');
            setConnectError(connectFailureText(r.reason));
        }
    }, [ext, token, account, refreshExt]);

    const autoTried = useRef(false);
    useEffect(() => {
        if (!autoConnect || autoTried.current || !ext || !token || !myTag || connectedHere) return;
        autoTried.current = true;
        // Deferred a tick so the state change lands from a callback, not the
        // effect body.
        const t = setTimeout(() => { void doConnect(); }, 0);
        return () => clearTimeout(t);
    }, [autoConnect, ext, token, myTag, connectedHere, doConnect]);

    // ── Advanced: the token itself ──────────────────────────────────────────
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [resetState, setResetState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
    const [resetPushed, setResetPushed] = useState(false);

    const doCopy = useCallback(async () => {
        if (!token) return;
        if (await copyToClipboard(token)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        }
    }, [token]);

    const doReset = useCallback(async () => {
        setConfirmReset(false);
        setResetState('busy');
        try {
            const cfg = await rotateShareToken();
            setToken(cfg.token);
            setMyTag(await tokenTag(cfg.token));
            setRevealed(false);
            setCopied(false);
            // The extension in THIS browser gets the new token straight away.
            let pushed = false;
            if (ext) {
                const r = await connectExtension(cfg.token, account);
                pushed = r.ok;
                await refreshExt();
            }
            setResetPushed(pushed);
            setResetState('done');
        } catch {
            setResetState('error');
        }
    }, [ext, account, refreshExt]);

    // ── Main card ───────────────────────────────────────────────────────────
    let main: ReactNode;
    if (native) {
        main = (
            <StatusLine icon={<ChevronRight className="w-[14px] h-[14px]" />} title="Set it up on your computer">
                Open mymachina.app in Chrome, Edge, Brave, or Safari on your computer and come back to this screen there.
            </StatusLine>
        );
    } else if (!desktop) {
        main = (
            <>
                <StatusLine icon={<ChevronRight className="w-[14px] h-[14px]" />} title="Works in Chrome, Edge, Brave, and Safari">
                    Open Machina in one of those browsers on a computer to add it.
                </StatusLine>
                {storeUrl && <PrimaryButton onClick={() => openExternal(storeUrl)}>View in the Chrome Web Store</PrimaryButton>}
            </>
        );
    } else if (ext === undefined) {
        main = (
            <StatusLine icon={<Loader2 className="w-[14px] h-[14px] animate-spin" />} title="Looking for the extension" />
        );
    } else if (ext === null && safari) {
        main = (
            <>
                <StatusLine icon={<span className="text-[12px] font-bold">1</span>} title={masUrl ? 'Get Machina for Safari' : 'Coming soon to the Mac App Store'}>
                    {masUrl
                        ? 'Free, from the Mac App Store. Open the app once, then turn on the extension in Safari.'
                        : 'Machina for Safari is on its way. Once it is in the Mac App Store, you will get it from here.'}
                </StatusLine>
                {masUrl ? (
                    <PrimaryButton onClick={() => openExternal(masUrl)}>View in the Mac App Store</PrimaryButton>
                ) : (
                    <ComingSoonButton />
                )}
                <div className="mt-3 rounded-xl bg-surface-inset px-3 py-2.5 text-[13.5px] text-text-secondary leading-snug">
                    <span className="font-semibold text-text">Already have it?</span> Safari asks before an extension can
                    see a website. In Safari, open Settings, then Extensions, choose Machina, and allow it on
                    mymachina.app. This page notices and connects it.
                </div>
            </>
        );
    } else if (ext === null) {
        main = storeUrl ? (
            <>
                <StatusLine icon={<span className="text-[12px] font-bold">1</span>} title="Add Machina to your browser">
                    Free, from the Chrome Web Store. Edge and Brave use the same listing.
                </StatusLine>
                <PrimaryButton onClick={() => openExternal(storeUrl)}>Add to Chrome</PrimaryButton>
                <p className="mt-2.5 text-[13px] text-text-muted leading-snug">
                    Come back here after adding it. This page connects it for you.
                </p>
            </>
        ) : (
            <>
                <StatusLine icon={<span className="text-[12px] font-bold">1</span>} title="Coming soon to the Chrome Web Store">
                    The Machina extension is on its way. Once it is in the store, you will add it from here in one click.
                </StatusLine>
                <ComingSoonButton />
            </>
        );
    } else if (connectedHere) {
        main = (
            <StatusLine icon={<Check className="w-[14px] h-[14px]" strokeWidth={3} />} title="Connected in this browser">
                Click the Machina icon on any page to save it.
            </StatusLine>
        );
    } else {
        main = (
            <>
                <StatusLine
                    icon={connectState === 'error' ? <AlertCircle className="w-[14px] h-[14px]" /> : <span className="text-[12px] font-bold">2</span>}
                    title={connectState === 'error' ? 'Not connected yet' : connectedElsewhere ? 'Connected to another account' : 'Connect the extension'}
                >
                    {connectState === 'error'
                        ? connectError
                        : connectedElsewhere
                            ? 'The extension in this browser saves to a different Machina account. Connect it to this one instead.'
                            : 'One click links it to this account. Nothing to copy or paste.'}
                </StatusLine>
                <PrimaryButton
                    onClick={doConnect}
                    busy={connectState === 'busy'}
                    disabled={!token}
                >
                    {connectState === 'busy' ? 'Connecting' : connectState === 'error' ? 'Try again' : 'Connect this browser'}
                </PrimaryButton>
                {tokenState === 'error' && (
                    <p className="mt-2.5 text-[13px] text-text-secondary leading-snug">Could not load your account details. Reload this screen and try again.</p>
                )}
            </>
        );
    }

    return (
        <div className="pb-2">
            <LargeTitle>Browser extension</LargeTitle>
            <p className="px-1 text-[15px] text-text-secondary leading-snug">
                Save any page from your desktop browser in one click. Works in Chrome, Edge, Brave, and Safari.
            </p>

            <SectionHeader>{connectedHere ? 'Status' : 'Get started'}</SectionHeader>
            <div data-testid="extension-status">
                <Card>{main}</Card>
            </div>

            <SectionHeader>How to save</SectionHeader>
            <ul className="rounded-[14px] border border-border-subtle bg-card px-[14px] py-3 space-y-2 text-[14.5px] text-text-secondary leading-snug">
                <li>Click the Machina icon in the toolbar, or press <Mono>Ctrl+Shift+S</Mono> (<Mono>Command+Shift+S</Mono> on a Mac).</li>
                <li>Right click a link to save the link, or select text and right click to save it with the page.</li>
                <li>Each save lands in your library, and Machina reads it in the background.</li>
            </ul>
            <Footnote>Pin Machina to the toolbar so the icon is always one click away.</Footnote>

            <SectionHeader>Advanced</SectionHeader>
            <details className="group rounded-[14px] border border-border-subtle bg-card">
                <summary className="flex items-center justify-between gap-2 px-[14px] min-h-[46px] cursor-pointer list-none text-[16px] text-text [&::-webkit-details-marker]:hidden">
                    Connect with a token
                    <ChevronRight className="w-[18px] h-[18px] text-text-muted transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="px-[14px] pb-[14px]">
                    <p className="text-[14px] text-text-secondary leading-snug">
                        For a browser that can&apos;t connect in one click. In the extension, open Settings, choose Use a token
                        instead, and paste this.
                    </p>
                    <div className="mt-3 rounded-xl border border-border-subtle bg-surface-inset px-3 py-2.5">
                        {!uid ? (
                            <div className="text-[14px] text-text-secondary">Sign in to see your token.</div>
                        ) : tokenState === 'loading' ? (
                            <div className="text-[14px] text-text-muted">Loading your token</div>
                        ) : tokenState === 'error' ? (
                            <div>
                                <div className="text-[14px] text-text">Could not load your token.</div>
                                <button type="button" onClick={() => { setTokenState('loading'); setReload((n) => n + 1); }} className={`mt-2 ${SMALL_BTN}`}>
                                    <RefreshCw className="w-[14px] h-[14px]" aria-hidden />
                                    Try again
                                </button>
                            </div>
                        ) : (
                            <div
                                dir="ltr"
                                data-testid="extension-token"
                                aria-label={revealed ? 'Your token' : 'Your token, hidden'}
                                className={`font-mono text-[13px] leading-relaxed break-all ${revealed ? 'text-text select-all' : 'text-text-muted select-none'}`}
                            >
                                {revealed ? token : MASK}
                            </div>
                        )}
                    </div>
                    {tokenState === 'ready' && (
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <button type="button" onClick={() => setRevealed((v) => !v)} className={SMALL_BTN} aria-pressed={revealed}>
                                {revealed ? <EyeOff className="w-[14px] h-[14px]" aria-hidden /> : <Eye className="w-[14px] h-[14px]" aria-hidden />}
                                {revealed ? 'Hide' : 'Reveal'}
                            </button>
                            <button type="button" onClick={doCopy} className={SMALL_BTN}>
                                {copied ? <Check className="w-[14px] h-[14px]" aria-hidden /> : <Copy className="w-[14px] h-[14px]" aria-hidden />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                            <button type="button" onClick={() => setConfirmReset(true)} disabled={resetState === 'busy'} className={SMALL_BTN}>
                                <RotateCcw className="w-[14px] h-[14px]" aria-hidden />
                                {resetState === 'busy' ? 'Resetting' : 'Reset token'}
                            </button>
                        </div>
                    )}
                    <div role="status" aria-live="polite">
                        {resetState === 'done' && (
                            <p className="mt-2.5 text-[13px] text-text-secondary leading-snug">
                                New token issued. The old one stopped working.
                                {resetPushed ? ' The extension in this browser already has the new one.' : ''}
                                {' '}Reconnect the extension in any other browser.
                            </p>
                        )}
                        {resetState === 'error' && (
                            <p className="mt-2.5 text-[13px] text-text leading-snug">Could not reset the token. Try again in a moment.</p>
                        )}
                    </div>
                    <p className="mt-3 text-[12.5px] text-text-muted leading-snug">
                        Anything saved with this token lands in this account, so keep it to yourself. If it ever leaks,
                        Reset token makes the old one useless right away.
                    </p>
                </div>
            </details>

            <ConfirmDialog
                isOpen={confirmReset}
                onClose={() => setConfirmReset(false)}
                onConfirm={doReset}
                title="Reset your token?"
                message="The current token stops working right away. The Machina app on your phone and the extension in this browser update themselves. An extension in any other browser needs to reconnect."
                confirmLabel="Reset token"
            />
        </div>
    );
}
