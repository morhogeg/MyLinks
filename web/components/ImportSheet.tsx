'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, FileText, ClipboardPaste, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/AuthProvider';
import { useScrollLock } from '@/lib/useScrollLock';
import { useSheetDrag, useIsMobile } from '@/lib/useSheetDrag';
import { hapticLight, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { apiUrl, fetchWithTimeout } from '@/lib/api';
import { appCheckHeaders } from '@/lib/firebase';
import { authHeaders } from '@/lib/auth';
import { offerUpgradeFor } from '@/lib/entitlement';
import { findLinkIdByUrl } from '@/lib/storage';
import { parseImportFile, type ImportedLink, type ImportFormat } from '@/lib/importParsers';

/**
 * Bring an existing reading list into Machina.
 *
 * The shape of the screen follows the shape of the decision: choose a file (or
 * paste), see honestly what is in it, press one button, watch it arrive. There
 * is no mapping step, no folder picker, no format question. The parsers
 * (lib/importParsers.ts) work out whether it is a browser bookmarks export, a
 * Pocket CSV, or a list of URLs.
 *
 * Imported links take the SAME path a share-sheet capture takes: POST /api/import
 * writes a `processing` placeholder card and one queue doc per link, and the
 * existing background trigger analyses them. So the feed behind this sheet fills
 * in with the same skeletons and the same analyzing pill the user already knows,
 * and closing the sheet mid-import loses nothing.
 *
 * Two numbers are always shown before anything is written: how many links are
 * new, and how many the library already has. Nothing is imported that the user
 * has not seen counted.
 */

/** Ceiling per import, matching MAX_IMPORT_LINKS in functions/main.py. */
const IMPORT_LIMIT = 200;
/** Links per request. Small enough that progress moves, large enough to be few. */
const CHUNK_SIZE = 25;
/** How many parsed links we will check against the library looking for new ones. */
const MAX_DEDUPE_CHECKS = 1000;
/** Duplicate checks in flight at once. Point queries, so this is politeness. */
const DEDUPE_CONCURRENCY = 8;
/** Refuse to read a file larger than this. A big bookmarks export is ~5 MB. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;

const FORMAT_LABEL: Record<ImportFormat, string> = {
    bookmarks: 'browser bookmarks',
    pocket: 'a Pocket export',
    urls: 'a list of links',
};

type Scanned = {
    format: ImportFormat;
    /** The new links, in file order, capped at IMPORT_LIMIT. */
    fresh: ImportedLink[];
    /** How many of the links we checked are already in the library. */
    alreadySaved: number;
    /** True when the file holds more new links than one import can take. */
    truncated: boolean;
    /** Entries in the file that carried no usable link. */
    unusable: number;
};

export default function ImportSheet({
    isOpen,
    onClose,
    onImported,
}: {
    isOpen: boolean;
    onClose: () => void;
    /** Fired once links have actually been queued, with how many. */
    onImported?: (count: number) => void;
}) {
    const { uid } = useAuth();
    const [pasting, setPasting] = useState(false);
    const [pasted, setPasted] = useState('');
    const [filename, setFilename] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [scanned, setScanned] = useState<Scanned | null>(null);
    const [note, setNote] = useState<string | null>(null);
    /** null while idle; otherwise how many of `total` have been queued. */
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [finished, setFinished] = useState<number | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const busy = scanning || progress !== null;
    useScrollLock(isOpen);
    const isMobile = useIsMobile();
    const { sheetRef, scrimRef, handleProps } = useSheetDrag({ onClose, enabled: isMobile && !busy });

    // Every open starts clean: a previous file's counts must never be read as
    // this one's.
    useEffect(() => {
        if (!isOpen) return;
        setPasting(false);
        setPasted('');
        setFilename(null);
        setScanned(null);
        setNote(null);
        setProgress(null);
        setFinished(null);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose, busy]);

    /**
     * Parse the text, then walk it in order asking the library about each link
     * until we have a full import's worth of new ones. Walking (rather than
     * checking only the first 200) is what makes a second import of the same
     * file pick up where the first one stopped.
     */
    const scan = useCallback(async (text: string, name?: string) => {
        if (!uid) return;
        setScanning(true);
        setNote(null);
        setScanned(null);
        try {
            const parsed = parseImportFile(text, name);
            if (!parsed.links.length) {
                setNote(parsed.skipped > 0
                    ? 'No links in that file. It has entries, but none of them are web pages.'
                    : 'No links found in that file.');
                return;
            }
            const considered = parsed.links.slice(0, MAX_DEDUPE_CHECKS);
            const fresh: ImportedLink[] = [];
            let alreadySaved = 0;
            for (let i = 0; i < considered.length && fresh.length < IMPORT_LIMIT; i += DEDUPE_CONCURRENCY) {
                const batch = considered.slice(i, i + DEDUPE_CONCURRENCY);
                const existing = await Promise.all(batch.map(async (link) => {
                    try {
                        return await findLinkIdByUrl(uid, link.url);
                    } catch {
                        // A failed lookup must not drop a link: the server checks
                        // for duplicates again anyway.
                        return null;
                    }
                }));
                batch.forEach((link, at) => {
                    if (existing[at]) alreadySaved += 1;
                    else if (fresh.length < IMPORT_LIMIT) fresh.push(link);
                });
            }
            setScanned({
                format: parsed.format,
                fresh,
                alreadySaved,
                truncated: fresh.length >= IMPORT_LIMIT
                    && parsed.links.length > fresh.length + alreadySaved,
                unusable: parsed.skipped,
            });
            track('import_scanned', { format: parsed.format, found: fresh.length });
        } catch {
            setNote('That file could not be read. Try exporting it again.');
        } finally {
            setScanning(false);
        }
    }, [uid]);

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setNote('That file is too large to read. Export a smaller one, or paste the links.');
            return;
        }
        setFilename(file.name);
        setPasting(false);
        try {
            await scan(await file.text(), file.name);
        } catch {
            setNote('That file could not be read. Try exporting it again.');
        }
    };

    const runImport = async () => {
        if (!scanned || !scanned.fresh.length || progress) return;
        hapticLight();
        const links = scanned.fresh;
        setNote(null);
        setProgress({ done: 0, total: links.length });
        let queued = 0;
        try {
            for (let i = 0; i < links.length; i += CHUNK_SIZE) {
                const chunk = links.slice(i, i + CHUNK_SIZE);
                const res = await fetchWithTimeout(apiUrl('/api/import'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(await appCheckHeaders()),
                        ...(await authHeaders()),
                    },
                    body: JSON.stringify({
                        links: chunk.map((l) => ({
                            url: l.url,
                            ...(l.title ? { title: l.title } : {}),
                            ...(l.addedAt ? { addedAt: l.addedAt } : {}),
                            ...(l.tags?.length ? { tags: l.tags } : {}),
                        })),
                    }),
                }, 60_000);
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    // A free plan out of import allowance gets the paywall, not
                    // an error toast. Whatever already went through is kept.
                    if (res.status === 429 && offerUpgradeFor(data)) {
                        setNote(typeof data?.error === 'string' ? data.error : null);
                    } else {
                        setNote(typeof data?.error === 'string'
                            ? data.error
                            : 'The import stopped partway. Whatever arrived is already in your library.');
                    }
                    hapticWarning();
                    break;
                }
                queued += typeof data?.queued === 'number' ? data.queued : 0;
                setProgress({ done: Math.min(i + chunk.length, links.length), total: links.length });
            }
        } catch {
            setNote('The import stopped partway. Whatever arrived is already in your library.');
            hapticWarning();
        } finally {
            setProgress(null);
        }
        if (queued > 0) {
            hapticSuccess();
            setFinished(queued);
            track('import_completed', { count: queued, format: scanned.format });
            onImported?.(queued);
        }
    };

    if (!isOpen) return null;

    const canImport = !!scanned?.fresh.length && !busy;

    return (
        <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center animate-fade-in">
            <div
                ref={scrimRef}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={busy ? undefined : onClose}
            />

            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Import links"
                className="relative w-full sm:max-w-md bg-card border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden safe-pb max-h-[calc(100%-env(safe-area-inset-top)-1.5rem)] sm:max-h-[88vh] flex flex-col"
            >
                <div {...handleProps}>
                    <div className="sm:hidden flex justify-center pt-3 pb-1">
                        <div className="h-1.5 w-10 rounded-full bg-fill-strong" />
                    </div>
                    <div className="flex items-start gap-3 px-5 pt-3 pb-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                                <Upload className="w-3 h-3" />
                                Import
                            </div>
                            <h2 className="mt-1.5 text-[21px] font-bold text-text leading-tight tracking-[-0.01em]">
                                Bring your links over
                            </h2>
                            <p className="mt-1 text-[13px] text-text-secondary leading-snug">
                                Browser bookmarks, a Pocket export, or a list you paste. Machina reads and files every one.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={busy}
                            aria-label="Close"
                            className="p-2 -me-2 -mt-1 rounded-full text-text-muted hover:text-text hover:bg-fill-subtle transition-colors disabled:opacity-40"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto px-5 pb-5">
                    {/* Done. The feed behind this sheet is already filling in. */}
                    {finished !== null ? (
                        <div className="py-2 text-center">
                            <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                                <Check className="w-6 h-6" strokeWidth={2.5} />
                            </div>
                            <p className="mt-3 text-[15px] font-semibold text-text">
                                {finished} {finished === 1 ? 'link is' : 'links are'} on the way
                            </p>
                            <p className="mt-1 text-[13px] text-text-secondary leading-snug">
                                They are being read and filed now. You can close this and watch them land.
                            </p>
                            <Button variant="primary" radius="full" onClick={onClose} className="mt-4 w-full h-11 text-[15px]">
                                Done
                            </Button>
                        </div>
                    ) : progress ? (
                        <div className="py-2">
                            <p className="text-center text-[15px] font-semibold text-text tabular-nums">
                                Importing {progress.done} of {progress.total}
                            </p>
                            <div className="mt-3 h-1.5 rounded-full bg-fill-subtle overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-[image:var(--accent-gradient)] transition-[width] duration-300"
                                    style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                                />
                            </div>
                            <p className="mt-3 text-center text-[13px] text-text-secondary leading-snug">
                                Each one is being read, summarized, and connected. They appear in your feed as they finish.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Source: a file, or paste. */}
                            <input
                                ref={fileInput}
                                type="file"
                                accept=".html,.htm,.csv,.txt,text/html,text/csv,text/plain"
                                className="hidden"
                                onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
                            />
                            <div className="flex flex-col gap-2">
                                <SourceRow
                                    icon={<FileText className="w-4 h-4" />}
                                    title={filename ?? 'Choose a file'}
                                    sub={filename
                                        ? 'Pick another to start over.'
                                        : 'A bookmarks export (.html) or a Pocket export (.csv).'}
                                    active={!!filename && !pasting}
                                    onClick={() => { hapticLight(); fileInput.current?.click(); }}
                                />
                                <SourceRow
                                    icon={<ClipboardPaste className="w-4 h-4" />}
                                    title="Paste links"
                                    sub="One link per line."
                                    active={pasting}
                                    onClick={() => {
                                        hapticLight();
                                        setPasting(true);
                                        setFilename(null);
                                        setScanned(null);
                                        setNote(null);
                                    }}
                                />
                            </div>

                            {pasting && (
                                <>
                                    <textarea
                                        value={pasted}
                                        onChange={(e) => setPasted(e.target.value)}
                                        rows={5}
                                        dir="auto"
                                        placeholder={'https://example.com/one\nhttps://example.com/two'}
                                        className="mt-3 w-full rounded-2xl bg-background border border-border-subtle px-3.5 py-3 text-[14px] text-text placeholder:text-text-muted leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                                    />
                                    <Button
                                        variant="secondary"
                                        radius="full"
                                        onClick={() => void scan(pasted)}
                                        disabled={!pasted.trim() || scanning}
                                        className="mt-2 w-full h-10"
                                    >
                                        {scanning ? 'Reading…' : 'Read these links'}
                                    </Button>
                                </>
                            )}

                            {scanning && !pasting && (
                                <p className="mt-4 text-center text-[13px] text-text-secondary">Reading your file…</p>
                            )}

                            {/* The honest count, before anything is written. */}
                            {scanned && (
                                <div className="mt-4 rounded-2xl border border-border-subtle bg-card-hover px-4 py-3.5">
                                    <p className="text-[15px] font-semibold text-text">
                                        {scanned.fresh.length === 0
                                            ? 'Everything here is already saved'
                                            : `${scanned.fresh.length} new ${scanned.fresh.length === 1 ? 'link' : 'links'}`}
                                        {scanned.alreadySaved > 0 && scanned.fresh.length > 0 && (
                                            <span className="text-text-muted font-medium">
                                                {`, ${scanned.alreadySaved} already saved`}
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-1 text-[12.5px] text-text-muted leading-snug">
                                        Read as {FORMAT_LABEL[scanned.format]}.
                                        {scanned.unusable > 0
                                            && ` ${scanned.unusable} ${scanned.unusable === 1 ? 'entry was' : 'entries were'} not a web page and got left out.`}
                                    </p>
                                    {scanned.truncated && (
                                        <p className="mt-1.5 text-[12.5px] text-text-secondary leading-snug">
                                            Machina brings {IMPORT_LIMIT} links over at a time. Import again afterwards to continue where this stops.
                                        </p>
                                    )}
                                </div>
                            )}

                            {note && (
                                <p role="status" className="mt-3 text-center text-[13px] text-amber-500 leading-snug">{note}</p>
                            )}

                            <Button
                                variant="primary"
                                radius="full"
                                onClick={runImport}
                                disabled={!canImport}
                                className="mt-4 w-full h-11 text-[15px]"
                            >
                                {scanned?.fresh.length
                                    ? `Import ${scanned.fresh.length} ${scanned.fresh.length === 1 ? 'link' : 'links'}`
                                    : 'Import'}
                            </Button>
                            <p className="mt-2 text-center text-[12px] text-text-muted leading-snug">
                                Imported links do not count against your monthly saves.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function SourceRow({
    icon, title, sub, active, onClick,
}: {
    icon: React.ReactNode;
    title: string;
    sub: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-start transition-colors cursor-pointer ${active ? 'border-accent/60 bg-accent/8' : 'border-border-subtle bg-card hover:bg-card-hover'}`}
        >
            <span className="w-9 h-9 shrink-0 rounded-xl bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold text-text leading-snug truncate">{title}</span>
                <span className="block text-[12px] text-text-muted mt-0.5 leading-snug">{sub}</span>
            </span>
        </button>
    );
}
