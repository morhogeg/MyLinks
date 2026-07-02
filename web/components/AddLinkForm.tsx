'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { Link, Plus, Loader2, X, Upload } from 'lucide-react';
import { saveLink, getUserTags } from '@/lib/storage';
import { appCheckHeaders } from '@/lib/firebase';
import { authHeaders } from '@/lib/auth';
import { apiUrl } from '@/lib/api';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { compressImage } from '@/lib/image';
import { hapticSuccess } from '@/lib/haptics';
import ImageScanProgress from '@/components/ImageScanProgress';
import VideoScanProgress from '@/components/VideoScanProgress';
import LinkScanProgress from '@/components/LinkScanProgress';

interface AddLinkFormProps {
    onLinkAdded: () => void;
    /** Hide the floating button (e.g. in Ask mode, where it's irrelevant). */
    hidden?: boolean;
}

const formatUrl = (input: string) => {
    let formatted = input.trim();
    if (!formatted) return '';
    if (!/^https?:\/\//i.test(formatted)) {
        formatted = `https://${formatted}`;
    }
    return formatted;
};

// Detect a YouTube link and pull its 11-char video ID, so we can show the
// "watching the video" progress (analysis is much slower than a normal page).
const youTubeId = (input: string): string | null => {
    const match = input.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    return match ? match[1] : null;
};

// Analysis can be slow on a cold function start, but it must never hang
// forever. Abort the request after a generous ceiling and surface a clear
// message instead of an indefinite spinner.
const ANALYZE_TIMEOUT_MS = 60_000;

const fetchWithTimeout = async (input: string, init: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error('Analysis is taking longer than expected. It may still finish in the background — check your feed in a moment.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Form for manually adding URLs
 * This replaces WhatsApp ingestion for local testing
 */
export default function AddLinkForm({ onLinkAdded, hidden = false }: AddLinkFormProps) {
    const { uid } = useAuth();
    const toast = useToast();
    const [url, setUrl] = useState('');
    const [activeTab, setActiveTab] = useState<'link' | 'image'>('link');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [progress, setProgress] = useState(0);
    const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

    useEffect(() => {
        const animated = isLoading && (activeTab === 'image' || isVideo || isPlainLink);
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
    }, [isLoading, activeTab, isVideo, isPlainLink]);

    const parseResponse = async (response: Response) => {
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error('The analysis service returned an unexpected response. Please try again.');
        }
        if (!response.ok || !data.success) {
            throw new Error(data?.error || 'Failed to analyze. Please try again.');
        }
        return data;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        const formattedUrl = formatUrl(url);

        if ((activeTab === 'link' && !formattedUrl) || (activeTab === 'image' && !imageFile) || isLoading) {
            return;
        }

        if (!uid) {
            setError('User not ready yet. Please wait a moment and try again.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgress(0);

        try {
            // Fetch existing tags to pass to AI for reuse (non-critical).
            let existingTags: string[] = [];
            try {
                existingTags = await getUserTags(uid);
            } catch {
                // Proceed without tag context — purely an optimization.
            }

            let data;

            if (activeTab === 'link') {
                // LINK MODE — analysis happens in the canonical Python backend.
                let response;
                try {
                    response = await fetchWithTimeout(apiUrl('/api/analyze'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
                        // uid kept for the pre-cutover soft-auth fallback; ignored once REQUIRE_AUTH is on.
                        body: JSON.stringify({ url: formattedUrl, existingTags, uid }),
                    });
                } catch (netErr) {
                    throw new Error(netErr instanceof Error ? netErr.message : `Network error: ${String(netErr)}`);
                }
                data = await parseResponse(response);
                // Real milestone: analysis came back — jump ahead to "saving".
                setProgress((p) => Math.max(p, 90));
            } else {
                // IMAGE MODE — compress client-side, then send the inline bytes to
                // the backend, which both analyzes AND stores the image (via the
                // admin SDK, bypassing storage.rules that block client writes).
                const compressed = await compressImage(imageFile!);
                // Real milestone: the image is compressed and on its way — push
                // past the "scanning" phase into "reading text".
                setProgress((p) => Math.max(p, 45));

                let response;
                try {
                    response = await fetchWithTimeout(apiUrl('/api/analyze-image'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
                        body: JSON.stringify({
                            imageBytes: compressed.base64,
                            mimeType: compressed.mimeType,
                            existingTags,
                            uid,
                        }),
                    });
                } catch (netErr) {
                    throw new Error(netErr instanceof Error ? netErr.message : `Network error: ${String(netErr)}`);
                }
                data = await parseResponse(response);
                // The backend returns the stored image's public URL as link.url.
            }

            // Save to Firestore.
            try {
                await saveLink(uid, {
                    url: data.link.url,
                    title: data.link.title,
                    summary: data.link.summary,
                    detailedSummary: data.link.detailedSummary,
                    tags: data.link.tags,
                    category: data.link.category,
                    language: data.link.language,
                    metadata: {
                        originalTitle: data.link.metadata.originalTitle,
                        estimatedReadTime: data.link.metadata.estimatedReadTime,
                        actionableTakeaway: data.link.metadata.actionableTakeaway,
                    },
                    sourceType: activeTab === 'image' ? 'image' : (data.link.sourceType || 'web'),
                    sourceName: data.link.sourceName,
                    embedding_vector: data.link.embedding_vector,
                    concepts: data.link.concepts,
                    relatedLinks: data.link.relatedLinks,
                });
            } catch (saveErr) {
                throw new Error(`Could not save to Machina: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
            }

            // Let the scan progress (link, image, or video) land on "Done!" first.
            setProgress(100);
            await new Promise((r) => setTimeout(r, 550));

            setUrl('');
            setImageFile(null);
            setImagePreview(null);
            setIsExpanded(false);
            hapticSuccess(); // the save landed — a satisfying success buzz on device
            toast.success('Saved to Machina');
            onLinkAdded();
        } catch (err) {
            const message = err instanceof Error ? err.message : `Unknown error: ${String(err)}`;
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
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
                Mobile: centered in the space above the keyboard (driven by the visual
                viewport) so it never jams up under the status bar. Desktop: a popover
                anchored just above the FAB. */}
            {isExpanded && (
                <div
                    className={`fixed z-[70] ${isMobile ? '' : 'bottom-28 right-4 w-96 max-w-[400px] animate-slide-up'}`}
                    style={isMobile && viewport.height
                        ? {
                            left: '1rem',
                            right: '1rem',
                            top: viewport.offsetTop + viewport.height / 2,
                            transform: 'translateY(-50%)',
                        }
                        : undefined}
                >
                    <form
                        onSubmit={handleSubmit}
                        className="bg-card border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-fade-in"
                        noValidate
                    >
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-text-muted transition-colors z-10"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-text mb-1 flex items-center gap-2">
                                <Link className="w-5 h-5 text-accent" />
                                Add to Machina
                            </h3>
                            <p className="text-sm text-text-secondary">
                                Capture a link or image — Machina reads, summarizes, and files it.
                            </p>
                        </div>

                        {/* Tabs */}
                        <div className="flex bg-white/5 p-1 rounded-xl mb-6 border border-white/5">
                            <button
                                type="button"
                                onClick={() => setActiveTab('link')}
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
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'image'
                                    ? 'bg-accent/10 text-accent shadow-sm border border-accent/20'
                                    : 'text-text-muted hover:text-text'
                                    }`}
                            >
                                Image
                            </button>
                        </div>

                        <div className="space-y-4">
                            {activeTab === 'link' ? (
                                isLoading && isVideo ? (
                                    <VideoScanProgress
                                        thumbnailSrc={videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null}
                                        progress={progress}
                                    />
                                ) : isLoading && isPlainLink ? (
                                    <LinkScanProgress url={formatUrl(url)} progress={progress} />
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
                                            onChange={(e) => setUrl(e.target.value)}
                                            placeholder="example.com or https://..."
                                            className="w-full px-4 py-4 bg-background border border-white/5 rounded-xl text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-base"
                                            disabled={isLoading}
                                            autoFocus
                                        />
                                    </div>
                                )
                            ) : isLoading && imagePreview ? (
                                <ImageScanProgress imageSrc={imagePreview} progress={progress} />
                            ) : (
                                <div className="relative">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setImageFile(file);
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setImagePreview(reader.result as string);
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                        className="hidden"
                                        id="image-upload"
                                        disabled={isLoading}
                                    />
                                    <label
                                        htmlFor="image-upload"
                                        className={`w-full aspect-video rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer transition-all hover:border-accent/50 hover:bg-white/5 ${imagePreview ? 'p-0 border-none overflow-hidden' : 'p-8'
                                            }`}
                                    >
                                        {imagePreview ? (
                                            <div className="relative w-full h-full group">
                                                <img
                                                    src={imagePreview}
                                                    alt="Preview"
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <p className="text-white font-medium">Change Image</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                                    <Upload className="w-6 h-6 text-accent" />
                                                </div>
                                                <p className="text-text font-medium text-sm">Tap to add an image</p>
                                            </>
                                        )}
                                    </label>
                                </div>
                            )}

                            {/* The scan views (link/image/video) show their own
                                progress, so the button is only needed when idle. */}
                            {!isLoading && (
                                <button
                                    type="submit"
                                    disabled={activeTab === 'link' ? !url.trim() : !imageFile}
                                    className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                                >
                                    Save
                                </button>
                            )}
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm mt-4 text-center bg-red-400/10 py-2 rounded-lg border border-red-400/20">
                                {error}
                            </p>
                        )}
                    </form>
                </div>
            )}

            <div className={`fixed bottom-6 right-4 sm:right-6 z-40 ${hidden ? 'hidden' : 'flex'} flex-col items-end gap-3`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {/* Persistent "still working" chip: the in-flight analysis promise
                    survives closing the panel, so show the user it's running and
                    let them reopen the scan view by tapping it. */}
                {isLoading && !isExpanded && (
                    <button
                        type="button"
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-card border border-white/10 shadow-lg text-sm font-medium text-text hover:bg-white/5 active:scale-95 transition-all animate-slide-up"
                        aria-label="Analysis in progress — tap to view"
                    >
                        <Loader2 className="w-4 h-4 animate-spin text-accent" />
                        <span>Analyzing…</span>
                    </button>
                )}

                {/* FAB Button */}
                <button
                    data-tour="add"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`w-14 h-14 min-h-[44px] min-w-[44px] rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${isExpanded
                        ? 'bg-card border border-white/10 rotate-45 scale-90 opacity-0 pointer-events-none'
                        : 'bg-accent hover:scale-105 active:scale-95'
                        }`}
                >
                    <Plus className={`w-7 h-7 transition-colors ${isExpanded ? 'text-text' : 'text-white'}`} />
                </button>
            </div>
        </>
    );
}
