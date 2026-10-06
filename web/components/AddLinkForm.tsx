'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Link, Plus, X, Upload, Loader2, Image as ImageIcon, StickyNote } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { findLinkIdByUrl, startProcessingPlaceholder, createImagePlaceholder, markLinkFailed, markLinkWaiting, startNoteCard, enrichNoteCard } from '@/lib/storage';
import { appCheckHeaders, db } from '@/lib/firebase';
import { authHeaders } from '@/lib/auth';
import { progressFor } from '@/lib/shareProgress';
import { stageProgress, type ProcessingStage } from '@/lib/scanPhases';
import { apiUrl, fetchWithTimeout as apiFetch } from '@/lib/api';
import { trackSaveSucceeded, trackFirstSave, trackSaveFailed } from '@/lib/analytics';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { compressImage } from '@/lib/image';
import { hapticSuccess } from '@/lib/haptics';
import { announceWaitingSave, isWaitingSave, offerUpgradeFor, saveWallAsWaiting, type WaitingSave } from '@/lib/entitlement';
import ImageScanProgress from '@/components/ImageScanProgress';
import VideoScanProgress from '@/components/VideoScanProgress';
import LinkScanProgress from '@/components/LinkScanProgress';
import ImportSheet from '@/components/ImportSheet';
import ScreenshotStrip, { toPickedImages, type PickedImage } from '@/components/ScreenshotStrip';
import { enqueueOfflineSave, queueStalledSave } from '@/lib/offlineSave';
import { reportError } from '@/lib/errorReporter';

interface AddLinkFormProps {
    onLinkAdded: () => void;
    /** Hide the floating button (e.g. in Ask mode, where it's irrelevant). */
    hidden?: boolean;
    /** Bumped by the bottom tab bar's center + (mobile v4); each increment
        pops the capture form open. The mobile FAB itself is retired — on
        phones the bar's + IS the capture affordance; desktop keeps the FAB. */
    openSignal?: number;
    /** Publish in-flight analysis state so the page can show a persistent
     *  banner that outlives this form being collapsed/closed. */
    onAnalyzingChange?: (state: { active: boolean; progress: number; kind: 'link' | 'image' | 'video' }) => void;
    /** Publish the card id of the plain-link capture currently owned by the open
     *  in-dialog stepper (null when none). The feed's processing banner excludes
     *  it so the same capture is never shown twice — see useProcessingBanner. */
    onDialogCardChange?: (cardId: string | null) => void;
}

// Sentence punctuation that trails a pasted URL but is never part of it,
// including the ellipsis and the Hebrew gershayim/geresh (mirrors
// functions/main.py _URL_TRAILING_PUNCT).
const URL_TRAILING_PUNCT = /[).,;:!?"'”’»\]>…\u05f4\u05f3]+$/;
// A URL in pasted text. CJK punctuation (U+3000-303F) and full/halfwidth forms
// (U+FF00-FFEF) end it: Chinese and Japanese text puts no space after a link
// (mirrors functions/main.py _URL_IN_TEXT_RE).
const URL_IN_TEXT = /https?:\/\/[^\s<>"\u3000-\u303f\uff00-\uffef]+/i;

const validHttpUrl = (candidate: string): string => {
    try {
        const u = new URL(candidate);
        // Validated, but returned as typed: the stored url stays what the user saved.
        if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')) return candidate;
    } catch { /* not a URL */ }
    return '';
};

/**
 * The link to save from whatever was pasted. A bare "example.com/x" gets
 * https:// in front; pasted TEXT ("Article title – https://…", a message with
 * a link in it) yields the first URL inside it, trailing punctuation trimmed.
 * Returns '' when there is no URL at all, so the form can offer to save the
 * text as a note instead of saving "https://Article title – https://…".
 */
const formatUrl = (input: string): string => {
    const text = input.trim();
    if (!text) return '';
    const found = text.match(URL_IN_TEXT);
    if (found) {
        let raw = found[0];
        const trimmed = raw.replace(URL_TRAILING_PUNCT, '');
        // Keep a closing paren the URL itself opened (…/wiki/Foo_(bar)).
        raw = raw.charAt(trimmed.length) === ')' && (trimmed.split('(').length > trimmed.split(')').length)
            ? `${trimmed})`
            : trimmed;
        return validHttpUrl(raw);
    }
    // No scheme: only a single token that looks like a host (+ path) counts.
    if (/\s/.test(text)) return '';
    return validHttpUrl(`https://${text.replace(URL_TRAILING_PUNCT, '')}`);
};

// Detect a YouTube link and pull its 11-char video ID, so we can show the
// "watching the video" progress (analysis is much slower than a normal page).
const youTubeId = (input: string): string | null => {
    const match = input.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    return match ? match[1] : null;
};

// The image upload (/api/share stores the images and queues the read; no
// analysis runs in that request) must never hang forever on a bad connection.
// Abort after a generous ceiling and surface a clear message instead of an
// indefinite spinner.
const UPLOAD_TIMEOUT_MS = 60_000;

// Multi-screenshot cards: how many ordered images may become ONE card. Mirrors
// the backend's MAX_CARD_IMAGES — keep the two in step.
const MAX_IMAGES = 5;

// A save can fail for a few distinct reasons; we surface an honest message to
// the user AND record a short, fixed failure category for analytics (never the
// raw error text). `category` rides on the Error so the catch block can read it.
type SaveFailReason = 'timeout' | 'network' | 'analyze_failed' | 'save_failed';

const saveError = (message: string, category: SaveFailReason): Error =>
    Object.assign(new Error(message), { category });

// What a failed save says. Firestore and browser errors ("FirebaseError:
// Missing or insufficient permissions", "Load failed") go to the error
// reporter, never to the screen.
const SAVE_COPY = {
    link: 'Couldn’t save that link. Please try again.',
    note: 'Couldn’t save your note. Please try again.',
    image: 'Couldn’t save your screenshot. Please try again.',
    images: 'Couldn’t save your screenshots. Please try again.',
    network: 'Couldn’t reach Machina. Check your connection and try again.',
    notReady: 'Machina is still signing you in. Try again in a moment.',
    unexpected: 'Couldn’t save that. Please try again.',
} as const;

/** How long the "you already saved this" probe may hold a save. It fails
    open: past this the save goes ahead. */
const DEDUPE_PROBE_MS = 3000;
/** How long a link placeholder may wait for the server before the save is
    treated as offline (the device says online, the server isn't answering). */
const PLACEHOLDER_ACK_MS = 8000;
/** A rejected note write comes back fast; past this the write is queued. */
const NOTE_ACK_MS = 1500;

type Settled<T> = { status: 'ok'; value: T } | { status: 'error'; error: unknown } | { status: 'pending' };

/** `p`'s outcome if it settles within `ms`, else 'pending'. Never rejects. */
async function settleWithin<T>(p: Promise<T>, ms: number): Promise<Settled<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Promise<Settled<T>>((resolve) => { timer = setTimeout(() => resolve({ status: 'pending' }), ms); });
    try {
        return await Promise.race([
            p.then((value): Settled<T> => ({ status: 'ok', value }), (error: unknown): Settled<T> => ({ status: 'error', error })),
            pending,
        ]);
    } finally {
        clearTimeout(timer);
    }
}

const fetchWithTimeout = async (input: string, init: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            // HONEST copy: the card is in the feed (marked failed), but whether
            // the server received the images before the connection gave up is
            // unknown. If it did, the card still finishes in the background.
            throw saveError('The upload took too long. If it doesn’t finish in your library shortly, please add it again.', 'timeout');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Form for manually adding URLs
 */
export default function AddLinkForm({ onLinkAdded, hidden = false, onAnalyzingChange, onDialogCardChange, openSignal = 0 }: AddLinkFormProps) {
    const { uid } = useAuth();
    const toast = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [activeTab, setActiveTab] = useState<'link' | 'image' | 'note'>('link');
    // Image capture: an ORDERED list of up to MAX_IMAGES screenshots that become
    // ONE card, read by the background pipeline (one image or five). The strip
    // below is the ordering answer — the order is visible and editable (drag to
    // reorder), never whatever the OS handed back.
    const [images, setImages] = useState<PickedImage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Link-tab input that holds no URL (e.g. a pasted sentence): shown as a
    // hint offering to save it as a note. Cleared as soon as the input changes.
    const [notUrlText, setNotUrlText] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    // The bulk import sheet, offered under the link field: one page at a time
    // is the wrong tool for a bookmarks file.
    const [importing, setImporting] = useState(false);

    // Bottom-bar capture (mobile v4): each openSignal bump opens the form.
    useEffect(() => {
        if (openSignal > 0) setIsExpanded(true);
    }, [openSignal]);
    const [progress, setProgress] = useState(0);
    const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // DURABLE PLAIN-LINK DIALOG (Task 1). After /api/share acks, the dialog no
    // longer closes: it enters a processing phase, subscribing to the placeholder
    // card doc and driving LinkScanProgress from the SAME shared ramp
    // (progressFor + stage floors) the bottom pill uses — so closing early hands
    // off to the pill at the identical %/step with no restart. `status` walks
    // processing → done | failed; null = no in-flight link dialog.
    const [linkCard, setLinkCard] = useState<{
        id: string;
        startedAt: number;          // shared ramp clock (card.processingStartedAt)
        status: 'processing' | 'done' | 'failed' | 'waiting';
        stage?: ProcessingStage;    // backend milestone, when present
    } | null>(null);
    // Cards whose hand-off to the pipeline failed in THIS form (the enqueue
    // catch below). That catch owns the one error toast for the save: the card
    // also flips to `failed` under the snapshot listener, and its terminal
    // effect must not toast the same failure a second time (finding E1).
    const handoffFailedIds = useRef<Set<string>>(new Set());
    // Wall-clock tick (1s) that advances the ramp while a link is processing.
    const [nowTick, setNowTick] = useState(0);
    // Monotonic guard on the in-dialog %: never let the displayed number step back
    // (e.g. when the snapshot corrects startedAt). Reset when the session ends.
    const lastLinkPct = useRef(0);

    // Mobile vs. desktop drives how the Add sheet is positioned: a keyboard-aware
    // centered card on phones, a popover anchored to the FAB on desktop.
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    // Track the visible viewport so the sheet centers in the space above the
    // keyboard (the URL field autofocuses, so the keyboard is up immediately).
    const viewport = useVisualViewport();

    // Swipe in from the left edge to dismiss the open sheet (iOS back gesture).
    useEdgeSwipeBack(() => setIsExpanded(false), isMobile && isExpanded);

    // Escape collapses the open sheet, mirroring the close button / backdrop tap.
    useEffect(() => {
        if (!isExpanded) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsExpanded(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isExpanded]);

    // A YouTube link gets the "watching the video" progress treatment, since
    // native video analysis takes ~1 minute vs. a few seconds for a page.
    const videoId = activeTab === 'link' ? youTubeId(formatUrl(url)) : null;
    const isVideo = !!videoId;

    // Simulated-but-motion-forward progress for the slow analyses (image OCR and
    // YouTube video). We can't read real progress from Gemini, so ease toward a
    // high cap (~99%) — always inching forward so it never looks frozen, but
    // never completing early. Video creeps slower (it really does take ~1 min);
    // success snaps it to 100%.
    // A normal web link/article also gets the phased scan treatment now.
    const isPlainLink = activeTab === 'link' && !isVideo;
    // A URL-less note is analyzed like a plain page (a few seconds, no scraping).
    const isNote = activeTab === 'note';

    useEffect(() => {
        // The plain-link path drives its own ramp from the card doc (see below),
        // so it's excluded here — image / video / note keep this simulated ease.
        const animated = isLoading && (activeTab === 'image' || isVideo || isNote);
        if (animated) {
            setProgress((p) => (p < 8 ? 8 : p));
            // Smaller factor = slower climb. Tuned so video reaches ~97% over a
            // minute, images fill in a few seconds, and a normal page lands in
            // between (a handful of seconds, slower on a cold start).
            const factor = isVideo ? 0.012 : activeTab === 'image' ? 0.04 : 0.03;
            progressTimer.current = setInterval(() => {
                setProgress((p) => {
                    const CAP = 99;
                    return p >= CAP ? p : p + (CAP - p) * factor;
                });
            }, 180);
        }
        return () => {
            if (progressTimer.current) {
                clearInterval(progressTimer.current);
                progressTimer.current = null;
            }
        };
    }, [isLoading, activeTab, isVideo, isNote]);

    // Publish the in-flight state up to the page so it can render a persistent
    // "Analyzing… N%" banner that survives this form collapsing/closing.
    // On DESKTOP the open panel shows its own scan view, so suppress the banner
    // while it's expanded (avoids a duplicate %) — it appears the moment the
    // panel is closed. On mobile the panel behaves differently; leave it as-is.
    useEffect(() => {
        const suppressed = !isMobile && isExpanded;
        // The plain-link path never feeds this optimistic channel: while its
        // dialog is open it renders its own stepper, and on close it hands off to
        // the Firestore-driven pill (useProcessingBanner). Publishing here too
        // would double the banner.
        onAnalyzingChange?.({
            active: isLoading && !suppressed && !isPlainLink,
            progress,
            kind: activeTab === 'image' ? 'image' : isVideo ? 'video' : 'link',
        });
    }, [isLoading, progress, activeTab, isVideo, isPlainLink, isExpanded, isMobile, onAnalyzingChange]);

    // Publish the processing link's card id so the feed's pill excludes it while
    // this dialog owns it (no "restart" from a duplicate banner). Cleared when the
    // session ends or the form unmounts.
    useEffect(() => {
        const id = linkCard && linkCard.status === 'processing' ? linkCard.id : null;
        onDialogCardChange?.(id);
        return () => onDialogCardChange?.(null);
        // Keyed on id/status only: a stage or startedAt update mustn't re-fire this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkCard?.id, linkCard?.status, onDialogCardChange]);

    // Drive the in-dialog stepper from the placeholder card doc: subscribe while
    // it's processing, mirror status + processingStage, and unsubscribe the
    // instant it resolves (or the session is dropped). ONE driver for this phase.
    useEffect(() => {
        if (!uid || !linkCard || linkCard.status !== 'processing') return;
        const ref = doc(db, 'users', uid, 'links', linkCard.id);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const data = snap.data();
                if (!data) return;
                const startedAt =
                    typeof data.processingStartedAt === 'number' ? data.processingStartedAt : undefined;
                const stage = data.processingStage as ProcessingStage | undefined;
                setLinkCard((c) => {
                    if (!c) return c;
                    if (data.status === 'processing') {
                        return { ...c, stage, startedAt: startedAt ?? c.startedAt };
                    }
                    // Left processing: a real status = done, 'failed' = failed,
                    // 'waiting' = kept past the monthly allowance (read later).
                    const next = data.status === 'failed' ? 'failed'
                        : data.status === 'waiting' ? 'waiting' : 'done';
                    return { ...c, status: next };
                });
            },
            () => {
                // Snapshot listener error — don't hang the dialog. Hand the capture
                // to the pill (the card keeps processing in the feed).
                setLinkCard(null);
                setIsLoading(false);
                setUrl('');
            }
        );
        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid, linkCard?.id, linkCard?.status]);

    // Advance the ramp once a second while a link is processing (the bar's own
    // width transition smooths the step). Date.now shares the card's clock base.
    useEffect(() => {
        if (!linkCard || linkCard.status !== 'processing') return;
        const tick = () => setNowTick(Date.now());
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkCard?.status, linkCard?.id]);

    // Terminal transitions for the in-dialog link session.
    useEffect(() => {
        if (!linkCard) return;
        if (linkCard.status === 'done') {
            // Brief completed frame — the bar lands on 100 — then close + reset.
            hapticSuccess();
            toast.success('Saved to Machina');
            const t = setTimeout(() => resetLinkSession(), 800);
            return () => clearTimeout(t);
        }
        if (linkCard.status === 'failed') {
            // The card survives as a retryable `failed` card in the feed. One
            // toast per failed save: when the hand-off itself failed, the
            // enqueue catch has already said so.
            if (!handoffFailedIds.current.has(linkCard.id)) {
                toast.error("Saved your link, but analysis couldn't finish. Tap the card to retry.");
            }
            resetLinkSession();
        }
        if (linkCard.status === 'waiting') {
            // Kept past the monthly allowance. The save response announces it
            // (paywall or one calm line); the session just ends, quietly.
            resetLinkSession();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkCard?.status]);

    // User closed the dialog (X / scrim / Escape / edge-swipe) while a link was
    // still processing → hand it to the bottom pill: drop the in-dialog session +
    // its banner suppression, leaving the card processing in the feed. The pill
    // resumes at the same % from the shared ramp (progressFor + stage floors), so
    // there's no restart. (The done/failed paths null `linkCard` in the same
    // tick, so this no-ops for them.)
    useEffect(() => {
        if (!isExpanded && linkCard && linkCard.status === 'processing') {
            lastLinkPct.current = 0;
            setLinkCard(null);
            setIsLoading(false);
            setUrl('');
        }
    }, [isExpanded, linkCard]);

    // End the in-dialog link session and return the form to a clean, empty state
    // ready for a new entry (used by the done/failed terminal transitions).
    const resetLinkSession = () => {
        lastLinkPct.current = 0;
        setLinkCard(null);
        setUrl('');
        setProgress(0);
        setIsLoading(false);
        setIsExpanded(false);
    };

    // ── Image strip: add / remove / drag-to-reorder ──────────────────────────
    // Previews are object URLs — revoked on remove/clear/unmount so a long
    // session doesn't leak blobs.
    const imagesRef = useRef(images);
    imagesRef.current = images;
    useEffect(() => () => {
        imagesRef.current.forEach((im) => URL.revokeObjectURL(im.preview));
    }, []);

    const addImageFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        // Read the FileList NOW, synchronously: the input's onChange resets
        // `value` right after this call, and a FileList is LIVE (WebKit
        // empties it on reset) — so a setImages updater, which React runs
        // after the handler returns, would see zero files. Same reason the
        // toast and object-URL creation stay OUT of the updater: it must be
        // pure (StrictMode runs it twice).
        const incoming = Array.from(files);
        const room = Math.max(0, MAX_IMAGES - imagesRef.current.length);
        if (incoming.length > room) {
            toast.info(`Up to ${MAX_IMAGES} images per card. Kept the first ${room}.`);
        }
        const added = toPickedImages(incoming.slice(0, room));
        if (added.length === 0) return;
        setImages((prev) => [...prev, ...added]);
    };

    const clearImages = () => {
        setImages((prev) => {
            prev.forEach((im) => URL.revokeObjectURL(im.preview));
            return [];
        });
    };

    // In-dialog ramp for the processing link: max(time-ramp, stage floor),
    // monotonic. Step is pinned to the backend stage when present; otherwise
    // LinkScanProgress derives it from the %. On done the bar completes to 100.
    let linkProgress = 0;
    let linkActiveStep: number | undefined;
    if (linkCard) {
        if (linkCard.status === 'done') {
            linkProgress = 100;
        } else {
            const { step, floor } = stageProgress(linkCard.stage);
            const elapsed = Math.max(0, (nowTick || Date.now()) - linkCard.startedAt);
            linkProgress = Math.max(progressFor(elapsed), floor, lastLinkPct.current);
            lastLinkPct.current = linkProgress;
            linkActiveStep = linkCard.stage ? step : undefined;
        }
    }

    const readBody = async (response: Response) => {
        const responseText = await response.text();
        try {
            return JSON.parse(responseText);
        } catch {
            throw saveError('The analysis service returned an unexpected response. Please try again.', 'analyze_failed');
        }
    };

    const ensureOk = (response: Response, data: { success?: boolean; error?: string }) => {
        if (!response.ok || !data.success) {
            // A quota wall that still refuses: open the paywall, then fail
            // with the server's own copy.
            if (response.status === 429) offerUpgradeFor(data);
            throw saveError(data?.error || 'Failed to analyze. Please try again.', 'analyze_failed');
        }
        return data;
    };

    // A save kept past the monthly allowance (the card is `waiting`, read on
    // the 1st or on upgrade). Not an error: the capture is recorded as a
    // success, the form closes, and the user sees ONLY the paywall (free) or
    // one calm line (Pro). Never a failed card, a Retry, or an error toast.
    const finishWaitingSave = (waiting: WaitingSave) => {
        trackSaveSucceeded('web_form');
        trackFirstSave();
        hapticSuccess();
        const line = announceWaitingSave(waiting);
        if (line) toast.info(line);
        setUrl('');
        clearImages();
        setIsExpanded(false);
        setIsLoading(false);
        onLinkAdded();
    };

    // Enqueue an offline-saved link once the device is back online (see
    // lib/offlineSave.ts). If the app is closed before reconnecting, the card
    // keeps `pendingEnqueue` and useResumeOfflineSaves (Feed) enqueues it on
    // the next launch instead.
    const enqueueWhenOnline = (ownerUid: string, linkUrl: string, cardId: string, written: Promise<void>) => {
        const run = () => {
            window.removeEventListener('online', run);
            void enqueueOfflineSave(ownerUid, linkUrl, cardId, written);
        };
        window.addEventListener('online', run);
    };

    const submit = async () => {
        const formattedUrl = formatUrl(url);

        // Text with no link in it: don't invent "https://<the text>". Offer to
        // keep it as a note instead (the hint under the field does the switch).
        if (activeTab === 'link' && !formattedUrl && url.trim() && !isLoading) {
            setError(null);
            setNotUrlText(url.trim());
            return;
        }

        if ((activeTab === 'link' && !formattedUrl) || (activeTab === 'image' && images.length === 0) || (activeTab === 'note' && !note.trim()) || isLoading) {
            return;
        }

        if (!uid) {
            setError(SAVE_COPY.notReady);
            return;
        }

        // Web-path dedup (link mode only — an image gets its URL post-analysis).
        // Mirror the iOS share path: exact match on the stored `url` field. Do it
        // BEFORE the expensive analysis so a repeat paste is caught instantly and
        // no work is wasted. The check is best-effort: any failure (offline, query
        // error) falls through to a normal save — a save is NEVER blocked on it.
        // OFFLINE link save. The placeholder write can't be acknowledged until
        // the device reconnects, so awaiting it (the online path below) would
        // pin the dialog on a spinner. Firestore queues the write and shows the
        // card from its local cache at once; hand the URL to the pipeline when
        // the connection comes back, and close now. The dedup probe is skipped:
        // it needs the server, and a save is never blocked on it.
        if (activeTab === 'link' && typeof navigator !== 'undefined' && navigator.onLine === false) {
            let placeholder: { id: string; written: Promise<void> };
            try {
                placeholder = startProcessingPlaceholder(uid, formattedUrl, { offline: true });
            } catch (writeErr) {
                trackSaveFailed('save_failed');
                reportError(writeErr, 'capture.link.offline');
                setError(SAVE_COPY.link);
                toast.error(SAVE_COPY.link);
                return;
            }
            enqueueWhenOnline(uid, formattedUrl, placeholder.id, placeholder.written);
            trackSaveSucceeded('web_form');
            trackFirstSave();
            onLinkAdded();
            hapticSuccess();
            toast.info('Saved offline. Machina will analyze it when you’re back online.');
            setUrl('');
            setError(null);
            setIsExpanded(false);
            return;
        }

        if (activeTab === 'link') {
            // Busy from the first tap: the probe and the placeholder below are
            // network round trips, and the Save button must say so.
            setIsLoading(true);
            setError(null);
            try {
                // Capped and parallel (lib/storage.ts): a slow connection used
                // to hold the button for three sequential round trips.
                const probe = await settleWithin(findLinkIdByUrl(uid, formattedUrl), DEDUPE_PROBE_MS);
                const existingId = probe.status === 'ok' ? probe.value : null;
                if (existingId) {
                    trackSaveFailed('duplicate');
                    toast.info("You already saved this. Opening it now.");
                    setUrl('');
                    setError(null);
                    setIsLoading(false);
                    setIsExpanded(false);
                    // Deep-link to the existing card; Feed consumes ?linkId and
                    // opens it (see Feed.tsx's searchParams effect).
                    router.push(`${pathname}?linkId=${existingId}`);
                    return;
                }
            } catch {
                // Dedup probe failed — proceed to save rather than block capture.
            }

            // DURABLE WEB LINK CAPTURE (Weakness #5). A link no longer blocks on
            // an up-to-60s synchronous /api/analyze call that a slow scrape could
            // time out and lose. Instead: write a `processing` placeholder card
            // (instant feed feedback) and enqueue the URL into the SAME background
            // pipeline the iOS share sheet uses. Analysis finishes asynchronously
            // and flips this very card to ready/failed — the capture is durable
            // the moment the placeholder is written. (Images take the same
            // durable path below; a note is written first and enriched after.)
            setProgress(0);
            lastLinkPct.current = 0;

            // Local ramp anchor until the snapshot supplies the authoritative
            // processingStartedAt (a hair later at most; the monotonic guard keeps
            // the correction from stepping the % backwards).
            const startedAt = Date.now();
            const placeholder = startProcessingPlaceholder(uid, formattedUrl);
            const ack = await settleWithin(placeholder.written, PLACEHOLDER_ACK_MS);
            if (ack.status === 'error') {
                // The placeholder write IS the capture — if it fails, nothing was
                // saved. Keep the URL in the field so retry is one tap.
                trackSaveFailed('save_failed');
                reportError(ack.error, 'capture.link.placeholder');
                setError(SAVE_COPY.link);
                toast.error(SAVE_COPY.link);
                setIsLoading(false);
                return;
            }
            if (ack.status === 'pending') {
                // The device says online but the server isn't answering (Wi-Fi
                // without internet, a captive portal). Firestore keeps the card
                // queued, and it shows in the feed already: finish it as an
                // offline save instead of a stepper stuck at 0% forever.
                queueStalledSave(uid, formattedUrl, placeholder.id, placeholder.written);
                trackSaveSucceeded('web_form');
                trackFirstSave();
                onLinkAdded();
                hapticSuccess();
                toast.info('Saved. Your connection is slow, so Machina will read it in the background.');
                setUrl('');
                setError(null);
                setIsExpanded(false);
                setIsLoading(false);
                return;
            }
            const cardId = placeholder.id;

            // PLAIN links only: enter the processing phase NOW — the dialog stays
            // open and the stepper subscribes to this card doc (see the onSnapshot
            // effect) instead of closing the instant the enqueue acks. A YouTube
            // LINK keeps today's flow (VideoScanProgress, close on ack → bottom
            // pill), so it doesn't get a linkCard session.
            if (isPlainLink) {
                setLinkCard({ id: cardId, startedAt, status: 'processing' });
            }

            try {
                // Enqueue for background analysis. This request is FAST — it only
                // writes the queue doc; no scraping/AI runs in it — so the 60s
                // Hosting cap that hurt slow YouTube links no longer applies.
                const response = await apiFetch(apiUrl('/api/share'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
                    // uid kept for the pre-cutover soft-auth fallback; ignored once REQUIRE_AUTH is on.
                    body: JSON.stringify({ url: formattedUrl, cardId, uid }),
                }, 30_000);
                const text = await response.text();
                let resData: { success?: boolean; error?: string };
                try { resData = JSON.parse(text); } catch { resData = {}; }
                // Past the monthly allowance: the server kept the card as
                // `waiting` (or, if it still answers with the save-wall 429,
                // the client does), so this save is DONE, just read later.
                let waiting: WaitingSave | null = response.ok && isWaitingSave(resData) ? resData : null;
                const wall = waiting ? null : saveWallAsWaiting(response.status, resData);
                if (wall) {
                    await markLinkWaiting(uid, cardId);
                    waiting = wall;
                }
                if (waiting) {
                    setLinkCard(null);
                    lastLinkPct.current = 0;
                    finishWaitingSave(waiting);
                    return;
                }
                if (!response.ok || !resData.success) {
                    if (response.status === 429) offerUpgradeFor(resData);
                    throw new Error(resData?.error || 'Could not start analysis. Please try again.');
                }
            } catch (enqueueErr) {
                // Couldn't hand the capture to the pipeline. The placeholder card
                // exists, so flip it to a retryable `failed` card (never a stuck
                // spinner) rather than lose it — the feed's Retry re-runs analysis.
                // This catch owns the save's one error toast (see handoffFailedIds).
                handoffFailedIds.current.add(cardId);
                try {
                    await markLinkFailed(uid, cardId, enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr));
                } catch {
                    // Best-effort; the 15-min processing janitor ages it out otherwise.
                }
                // Drop the in-dialog session — the feed's `failed` card (with
                // Retry) takes over — and close cleanly.
                setLinkCard(null);
                lastLinkPct.current = 0;
                trackSaveFailed('network');
                toast.error("Saved your link, but analysis couldn't start. Tap the card to retry.");
                setUrl('');
                setIsExpanded(false);
                setIsLoading(false);
                onLinkAdded();
                return;
            }

            // Durably captured AND queued. Record the save now: even if analysis
            // later fails, the card survives as a retryable card, so this is the
            // honest success moment for analytics.
            trackSaveSucceeded('web_form');
            trackFirstSave();
            onLinkAdded();

            if (!isPlainLink) {
                // Video LINK — close immediately; the bottom pill
                // (useProcessingBanner) carries the rest.
                //
                // The bar does NOT jump to 100 here: this ack only means the
                // URL was QUEUED — a video analysis runs
                // ~a minute after it. Snapping to 100% announced a finish that
                // had not happened, and the card then sat in the feed visibly
                // still working (owner-reported 2026-08-01). The capture is
                // durable either way (the placeholder card is already written),
                // so the honest surface is the pill: it ramps from that card's
                // own clock and flips to "Saved to Machina" when the card
                // actually resolves. Leaving `progress` where the ramp reached
                // hands over mid-flight instead of finishing early. The SAVE
                // itself is worth confirming — hence the buzz and a toast that
                // says exactly what happened: captured now, analysing still.
                hapticSuccess();
                toast.success('Saved. Analyzing in the background.');
                setUrl('');
                setIsExpanded(false);
                setIsLoading(false);
            }
            // Plain link: the DIALOG STAYS OPEN — its stepper runs off the card doc
            // until the card resolves (brief completed frame + close) or the user
            // closes early (hand off to the pill). The success toast/haptic fire on
            // completion, not here, so the user isn't told "Saved" mid-steps.
            return;
        }

        // DURABLE NOTE CAPTURE. A note is the user's own words — saving it must
        // never hinge on a slow (or undeployed) AI call the way the old path did
        // (it POSTed to /api/analyze and errored "URL is required" whenever the
        // note branch wasn't live). Write the card instantly client-side, then
        // enrich it (AI title/tags/category) in the background, best-effort.
        if (activeTab === 'note') {
            setIsLoading(true);
            setError(null);
            setProgress(0);

            const text = note.trim();
            // Not awaited to the server: offline (or on a connection that isn't
            // answering) the acknowledgement only comes on reconnect, and the
            // form used to spin on "Reading your note…" until then. A rejected
            // write comes back fast, so a short wait still catches it.
            const { id: cardId, written } = startNoteCard(uid, text);
            const ack = await settleWithin(written, NOTE_ACK_MS);
            if (ack.status === 'error') {
                trackSaveFailed('save_failed');
                reportError(ack.error, 'capture.note');
                setError(SAVE_COPY.note);
                toast.error(SAVE_COPY.note);
                setIsLoading(false);
                return;
            }
            if (ack.status === 'pending') {
                written.catch((err) => {
                    reportError(err, 'capture.note.late');
                    toast.error(SAVE_COPY.note);
                });
            }

            // Saved (queued, if offline). Record and close immediately — the
            // feed streams the note card in via onSnapshot, exactly like any
            // other capture.
            trackSaveSucceeded('note');
            trackFirstSave();
            setProgress(100);
            hapticSuccess();
            toast.success(ack.status === 'pending' && typeof navigator !== 'undefined' && navigator.onLine === false
                ? 'Note saved. It syncs when you’re back online.'
                : 'Note saved');
            setNote('');
            setIsExpanded(false);
            setIsLoading(false);
            onLinkAdded();

            // Background AI enrichment (title/tags/category). Fire-and-forget: the
            // note already stands on its own with the user's text if this never
            // lands. Chained to the write, so a note saved offline is enriched
            // on reconnect instead of failing at once and never again.
            void written.then(() => enrichNoteCard(uid, cardId, text), () => {});
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgress(0);

        try {
            // IMAGE CAPTURE: one screenshot, or an ordered set that becomes ONE
            // card. Durable, like every other capture: a `processing`
            // placeholder card first, then each image compressed IN THE
            // CONFIRMED ORDER and handed to /api/share, which stores them and
            // enqueues one background job that flips this same card to
            // ready/failed. A single image used to wait on the synchronous
            // image-analysis endpoint instead: this form gave up at 60 seconds
            // while the server ran on, charged the save and stored the
            // screenshot with no card, and the user was told nothing was saved.
            const single = images.length === 1;
            const errorTag = single ? 'capture.image' : 'capture.images';
            const payload: { data: string; mimeType: string }[] = [];
            for (const im of images) {
                const compressed = await compressImage(im.file);
                payload.push({ data: compressed.base64, mimeType: compressed.mimeType });
            }
            setProgress((p) => Math.max(p, 45));

            let cardId: string;
            try {
                cardId = await createImagePlaceholder(uid, images.length);
            } catch (writeErr) {
                reportError(writeErr, `${errorTag}.placeholder`);
                throw saveError(single ? SAVE_COPY.image : SAVE_COPY.images, 'save_failed');
            }

            let waiting: WaitingSave | null = null;
            try {
                const response = await fetchWithTimeout(apiUrl('/api/share'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
                    body: JSON.stringify({ images: payload, cardId, uid }),
                });
                const body = await readBody(response);
                // Past the monthly allowance the images are stored and the card
                // waits for its read (see finishWaitingSave).
                waiting = response.ok && isWaitingSave(body) ? body : saveWallAsWaiting(response.status, body);
                if (waiting && !response.ok) await markLinkWaiting(uid, cardId);
                if (!waiting) ensureOk(response, body);
            } catch (err) {
                // Enqueue failed: flip the placeholder to a retryable failed
                // card (never a stuck spinner), then surface the error.
                try {
                    await markLinkFailed(uid, cardId, err instanceof Error ? err.message : String(err));
                } catch {
                    // Best-effort; the processing janitor ages it out otherwise.
                }
                if (err instanceof Error && 'category' in err) throw err;
                reportError(err, `${errorTag}.enqueue`);
                throw saveError(SAVE_COPY.network, 'network');
            }

            if (waiting) {
                finishWaitingSave(waiting);
                return;
            }

            // Queued durably: the honest success moment for the CAPTURE, not
            // the analysis. Deliberately NO progress-100 frame here: the ack
            // only means the images were queued, and snapping the banner to
            // "Done" while the card still reads "Saving" is the exact dishonest
            // finish the video path was cured of (2026-08-01). Close now; the
            // feed's processing card + Firestore pill carry the real ramp until
            // the card actually resolves.
            trackSaveSucceeded('web_form');
            trackFirstSave();
            clearImages();
            setIsExpanded(false);
            hapticSuccess();
            toast.success(single
                ? 'Saved. Reading your screenshot in the background.'
                : 'Saved. Reading your screenshots in the background.');
            onLinkAdded();
        } catch (err) {
            // Record a SHORT, FIXED failure category (never raw error text). An
            // uncategorized error is an unexpected code path → 'analyze_failed',
            // and its text (a canvas or browser error) is for the reporter, not
            // the screen; a categorized one already carries plain copy.
            const categorized = err instanceof Error && 'category' in err;
            const category = (categorized ? (err as { category?: SaveFailReason }).category : undefined) ?? 'analyze_failed';
            if (!categorized) reportError(err, 'capture.unexpected');
            const message = categorized ? (err as Error).message : SAVE_COPY.unexpected;
            trackSaveFailed(category);
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    // One submit at a time. The link path awaits the dedupe probe and the
    // placeholder write, so a second tap (or Enter) during them used to pass
    // every guard and save the link twice, charging two saves (WEB-4).
    const submitting = useRef(false);
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        try {
            await submit();
        } finally {
            submitting.current = false;
        }
    };

    return (
        <>
            {/* Backdrop for mobile focus - now covering the header completely */}
            {isExpanded && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[60] sm:hidden animate-fade-in"
                    onClick={() => setIsExpanded(false)}
                />
            )}

            {/* Expanded Form - Moved outside the FAB container to fix z-index stacking context.
                Mobile: positioned in the space above the keyboard (driven by the visual
                viewport) so it never jams up under the status bar. Desktop: a popover
                anchored just above the FAB.

                STEADINESS: the card's TOP is computed by centering a FIXED estimated
                height — not the live content height — so toggling Link/Image/Note
                (whose contents differ) never re-centers the frame. Combined with the
                equal-height tab content area below, the dialog holds one position;
                only the keyboard sliding in/out moves it (as it must). */}
            {isExpanded && (
                <div
                    className={`fixed z-[70] ${isMobile ? '' : 'bottom-28 right-4 w-96 max-w-[400px] animate-slide-up'}`}
                    style={isMobile && viewport.height
                        ? {
                            left: '1rem',
                            right: '1rem',
                            // 460 ≈ the card's height with the fixed content area; the
                            // constant is what keeps `top` identical across tabs.
                            top: viewport.offsetTop + Math.max(16, (viewport.height - 460) / 2),
                            maxHeight: viewport.height - 32,
                        }
                        : undefined}
                >
                    <form
                        onSubmit={handleSubmit}
                        role="dialog"
                        aria-label="Add link"
                        aria-modal="true"
                        className="bg-card border border-border-strong rounded-3xl p-6 shadow-2xl relative max-h-full overflow-y-auto animate-fade-in"
                        noValidate
                    >
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-fill-strong text-text-muted transition-colors z-10"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-text mb-1 flex items-center gap-2">
                                {activeTab === 'image'
                                    ? <ImageIcon className="w-5 h-5 text-accent" />
                                    : activeTab === 'note'
                                        ? <StickyNote className="w-5 h-5 text-accent" />
                                        : <Link className="w-5 h-5 text-accent" />}
                                Add to Machina
                            </h3>
                            <p className="text-sm text-text-secondary">
                                Capture a link, image, or your own note. Machina reads, summarizes, and files it.
                            </p>
                        </div>

                        {/* Tabs */}
                        <div className="flex bg-fill-subtle p-1 rounded-xl mb-6 border border-border-subtle">
                            <button
                                type="button"
                                onClick={() => setActiveTab('link')}
                                aria-pressed={activeTab === 'link'}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'link'
                                    ? 'bg-accent/10 text-accent shadow-sm border border-accent/20'
                                    : 'text-text-muted hover:text-text'
                                    }`}
                            >
                                Link
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('image')}
                                aria-pressed={activeTab === 'image'}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'image'
                                    ? 'bg-accent/10 text-accent shadow-sm border border-accent/20'
                                    : 'text-text-muted hover:text-text'
                                    }`}
                            >
                                Image
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('note')}
                                aria-pressed={activeTab === 'note'}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'note'
                                    ? 'bg-accent/10 text-accent shadow-sm border border-accent/20'
                                    : 'text-text-muted hover:text-text'
                                    }`}
                            >
                                Note
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Equal-height swap area: every tab's idle content fills the
                                same 170px block, so toggling tabs moves NOTHING below it
                                (the Save button stays put). Loading states may grow past
                                it — that's a phase change, not a toggle. */}
                            <div className="min-h-[170px] flex flex-col justify-center">
                            {activeTab === 'link' ? (
                                isLoading && isVideo ? (
                                    <VideoScanProgress
                                        thumbnailSrc={videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null}
                                        progress={progress}
                                    />
                                ) : isLoading && isPlainLink ? (
                                    <LinkScanProgress url={formatUrl(url)} progress={linkProgress} activeStep={linkActiveStep} />
                                ) : (
                                    <div className="relative">
                                        <input
                                            id="url"
                                            type="text"
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="off"
                                            spellCheck={false}
                                            value={url || ''}
                                            onChange={(e) => { setUrl(e.target.value); setNotUrlText(null); }}
                                            placeholder="example.com or https://..."
                                            className="w-full px-4 py-4 bg-background border border-border-subtle rounded-xl text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-base"
                                            disabled={isLoading}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setIsExpanded(false); setImporting(true); }}
                                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-accent transition-colors"
                                        >
                                            <Upload className="w-3.5 h-3.5" />
                                            Have a bookmarks file? Import it
                                        </button>
                                    </div>
                                )
                            ) : activeTab === 'note' ? (
                                isLoading ? (
                                    <div className="rounded-xl border border-border-subtle bg-background px-4 py-8 flex flex-col items-center justify-center gap-3 text-center">
                                        <Loader2 className="w-6 h-6 text-accent animate-spin" />
                                        <p className="text-sm font-semibold text-text">Reading your note…</p>
                                        <div className="w-full h-1.5 rounded-full bg-fill-subtle overflow-hidden">
                                            <div
                                                className="h-full bg-accent transition-all duration-200"
                                                style={{ width: `${Math.round(progress)}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <textarea
                                        id="note"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Write a thought, an idea, a quote. Machina summarizes and files it."
                                        rows={5}
                                        className="w-full h-[170px] px-4 py-3 bg-background border border-border-subtle rounded-xl text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-base resize-none"
                                        disabled={isLoading}
                                        autoFocus
                                    />
                                )
                            ) : isLoading && images.length > 0 ? (
                                <ImageScanProgress imageSrc={images[0].preview} progress={progress} />
                            ) : (
                                <div className="relative">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={(e) => {
                                            addImageFiles(e.target.files);
                                            // Reset so re-picking the same file fires onChange again.
                                            e.target.value = '';
                                        }}
                                        className="hidden"
                                        id="image-upload"
                                        disabled={isLoading}
                                    />
                                    {images.length > 0 ? (
                                        /* Thumbnail strip: ONE row of equal tiles in the
                                           order the card will read them. The order is
                                           visible and editable here — number badges +
                                           drag to reorder — instead of trusting whatever
                                           order the OS handed the files back in. */
                                        <div className="flex flex-col justify-center gap-3">
                                            <ScreenshotStrip
                                                images={images}
                                                setImages={setImages}
                                                max={MAX_IMAGES}
                                                addInputId="image-upload"
                                            />
                                            <p className="text-[11px] text-text-muted text-center leading-snug">
                                                {images.length === 1
                                                    ? `Add up to ${MAX_IMAGES} screenshots of one post. They become a single card.`
                                                    : 'Screens of one post, read in this order. Drag to reorder.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <label
                                            htmlFor="image-upload"
                                            className="w-full h-[170px] rounded-xl border-2 border-dashed border-border-strong flex flex-col items-center justify-center cursor-pointer transition-all hover:border-accent/50 hover:bg-fill-subtle p-8"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-fill-subtle flex items-center justify-center mb-3">
                                                <Upload className="w-6 h-6 text-accent" />
                                            </div>
                                            <p className="text-text font-medium text-sm">Tap to add images</p>
                                            <p className="text-text-muted text-xs mt-1">Up to {MAX_IMAGES} screenshots become one card</p>
                                        </label>
                                    )}
                                </div>
                            )}
                            </div>

                            {/* The scan views (link/image/video) show their own
                                progress, so the button is only needed when idle. */}
                            {!isLoading && (
                                <button
                                    type="submit"
                                    disabled={activeTab === 'link' ? !url.trim() : activeTab === 'note' ? !note.trim() : images.length === 0}
                                    className="w-full py-4 bg-accent text-accent-ink font-bold rounded-xl hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
                                >
                                    Save
                                </button>
                            )}
                        </div>

                        {error && (
                            <p role="alert" className="text-danger text-sm mt-4 text-center bg-danger/10 py-2 rounded-lg border border-danger/20">
                                {error}
                            </p>
                        )}

                        {activeTab === 'link' && notUrlText && !error && (
                            <div className="mt-4 rounded-xl border border-border-subtle bg-fill-subtle px-4 py-3 text-center">
                                <p className="text-sm text-text-secondary">
                                    That doesn’t contain a link.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNote(notUrlText);
                                        setUrl('');
                                        setNotUrlText(null);
                                        setActiveTab('note');
                                    }}
                                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
                                >
                                    <StickyNote className="w-4 h-4" />
                                    Save it as a note instead
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            )}

            <ImportSheet isOpen={importing} onClose={() => setImporting(false)} />

            {/* FAB is desktop-only now — on phones the bottom bar's center +
                is the capture button (see BottomTabBar). */}
            <div className={`fixed bottom-6 right-4 sm:right-6 z-40 ${hidden ? 'hidden' : 'hidden sm:flex'} flex-col items-end gap-3`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {/* The in-flight "Analyzing… N%" indicator now lives at the page
                    level (AnalyzingBanner) so it persists after this form is
                    collapsed or closed — see page.tsx. */}

                {/* FAB Button */}
                <button
                    data-tour="add"
                    aria-label="Add to Machina"
                    onClick={() => setIsExpanded(!isExpanded)}
                    /* The glyph is `--accent-ink`, NOT white. `--accent` is the
                       neutral EMPHASIS token, and in DARK mode it is porcelain
                       (#E9E9F2) — so a white `+` on it was white-on-white and the
                       whole control read as a washed-out disc. `--accent-ink`
                       exists precisely for content sitting ON an accent surface
                       and flips per theme (#101016 dark / #F7F7F9 light).
                       Treatment now matches the mobile capture button in
                       BottomTabBar: same action, same brand gradient + ink. */
                    className={`w-14 h-14 min-h-[44px] min-w-[44px] rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${isExpanded
                        ? 'bg-card border border-border-strong rotate-45 scale-90 opacity-0 pointer-events-none'
                        : 'bg-[image:var(--accent-gradient)] shadow-accent/40 hover:scale-105 active:scale-95'
                        }`}
                >
                    <Plus className={`w-7 h-7 transition-colors ${isExpanded ? 'text-text' : 'text-accent-ink'}`} />
                </button>
            </div>
        </>
    );
}
