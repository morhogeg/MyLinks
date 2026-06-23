'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { Link, Plus, Loader2, X, Upload } from 'lucide-react';
import { saveLink, getUserTags } from '@/lib/storage';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { compressImage } from '@/lib/image';
import ImageScanProgress from '@/components/ImageScanProgress';

interface AddLinkFormProps {
    onLinkAdded: () => void;
}

const formatUrl = (input: string) => {
    let formatted = input.trim();
    if (!formatted) return '';
    if (!/^https?:\/\//i.test(formatted)) {
        formatted = `https://${formatted}`;
    }
    return formatted;
};

/**
 * Form for manually adding URLs
 * This replaces WhatsApp ingestion for local testing
 */
export default function AddLinkForm({ onLinkAdded }: AddLinkFormProps) {
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

    // Simulated-but-motion-forward progress for image analysis. We can't read
    // real progress from Gemini, so ease toward a cap (~92%) — always moving,
    // never completing early. A real milestone (upload done) is blended in from
    // handleSubmit, and success snaps it to 100%.
    useEffect(() => {
        if (isLoading && activeTab === 'image') {
            setProgress((p) => (p < 8 ? 8 : p));
            progressTimer.current = setInterval(() => {
                setProgress((p) => {
                    const CAP = 92;
                    return p >= CAP ? p : p + (CAP - p) * 0.07;
                });
            }, 180);
        }
        return () => {
            if (progressTimer.current) {
                clearInterval(progressTimer.current);
                progressTimer.current = null;
            }
        };
    }, [isLoading, activeTab]);

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
                    response = await fetch('/api/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: formattedUrl, existingTags, uid }),
                    });
                } catch (netErr) {
                    throw new Error(`Network error: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
                }
                data = await parseResponse(response);
            } else {
                // IMAGE MODE — compress client-side, then upload to storage and
                // analyze the inline bytes IN PARALLEL (no upload→re-download hop).
                const compressed = await compressImage(imageFile!);

                const storagePath = `users/${uid}/uploads/${Date.now()}.jpg`;
                const storageRef = ref(storage, storagePath);

                const uploadPromise = uploadBytes(storageRef, compressed.blob)
                    .then(() => {
                        // Real milestone: upload finished — jump past "scanning".
                        setProgress((p) => Math.max(p, 45));
                        return getDownloadURL(storageRef);
                    });

                const analyzePromise = fetch('/api/analyze-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageBytes: compressed.base64,
                        mimeType: compressed.mimeType,
                        existingTags,
                    }),
                }).then(parseResponse);

                let downloadURL: string;
                let analyzed;
                try {
                    [downloadURL, analyzed] = await Promise.all([uploadPromise, analyzePromise]);
                } catch (err) {
                    throw new Error(err instanceof Error ? err.message : String(err));
                }

                data = analyzed;
                // The link's URL is the stored image, used to display it later.
                data.link.url = downloadURL;
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
                throw new Error(`Could not save to your brain: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
            }

            // Let the image progress land on "Done!" before closing.
            if (activeTab === 'image') {
                setProgress(100);
                await new Promise((r) => setTimeout(r, 550));
            }

            setUrl('');
            setImageFile(null);
            setImagePreview(null);
            setIsExpanded(false);
            toast.success('Saved to your brain');
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

            {/* Expanded Form - Moved outside the FAB container to fix z-index stacking context */}
            {isExpanded && (
                <div className="fixed top-24 sm:top-auto sm:bottom-28 inset-x-4 sm:left-auto sm:right-4 sm:w-96 max-w-[400px] mx-auto sm:mx-0 z-[70] animate-slide-up">
                    <form
                        onSubmit={handleSubmit}
                        className="bg-card border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
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
                                Add to Brain
                            </h3>
                            <p className="text-sm text-text-secondary">
                                Capture anything to your second brain.
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
                                                <p className="text-text font-medium text-sm">Tap to upload image</p>
                                                <p className="text-text-muted text-xs mt-1">Screenshots, tweets, articles</p>
                                            </>
                                        )}
                                    </label>
                                </div>
                            )}

                            {/* The image scan view shows its own progress, so the
                                button is only needed otherwise. */}
                            {!(isLoading && activeTab === 'image') && (
                                <button
                                    type="submit"
                                    disabled={isLoading || (activeTab === 'link' ? !url.trim() : !imageFile)}
                                    className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Analyzing...</span>
                                        </>
                                    ) : (
                                        'Save'
                                    )}
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

            <div className="fixed bottom-6 right-4 sm:right-6 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {/* FAB Button */}
                <button
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
