'use client';

import { useState, FormEvent } from 'react';
import { Link, Plus, Loader2, X, Image as ImageIcon, Upload } from 'lucide-react';
import { saveLink, getUserTags } from '@/lib/storage';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/components/AuthProvider';

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
    const [url, setUrl] = useState('');
    const [activeTab, setActiveTab] = useState<'link' | 'image'>('link');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        console.log('Submit triggered with URL:', url); // DEBUG

        const formattedUrl = formatUrl(url);
        console.log('Formatted URL:', formattedUrl); // DEBUG

        if ((activeTab === 'link' && !formattedUrl) || (activeTab === 'image' && !imageFile) || isLoading) {
            console.log('Validation failed or already loading'); // DEBUG
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Stage 1: Analysis
            // Fetch existing tags to pass to AI for reuse
            let existingTags: string[] = [];
            try {
                if (uid) {
                    existingTags = await getUserTags(uid);
                }
            } catch (tagErr) {
                console.warn('Failed to fetch existing tags (proceeding without):', tagErr);
                // Continue without tags - this is non-critical optimization
            }

            let response;

            if (activeTab === 'link') {
                // LINK MODE
                console.log('Calling /api/analyze...'); // DEBUG
                try {
                    response = await fetch('/api/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: formattedUrl,
                            existingTags
                        }),
                    });
                } catch (netErr) {
                    console.error('Network request failed:', netErr);
                    throw new Error(`Network Error: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
                }
            } else {
                // IMAGE MODE
                console.log('Current UID before upload:', uid); // DEBUG
                if (!imageFile || !uid) {
                    const msg = !uid ? "User ID not found. Please ensure you are logged in or the test user exists." : "No image selected.";
                    throw new Error(msg);
                }

                // 1. Upload to Firebase Storage
                const storagePath = `users/${uid}/uploads/${Date.now()}_${imageFile.name}`;
                console.log('Uploading to path:', storagePath); // DEBUG
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, imageFile);
                const downloadURL = await getDownloadURL(storageRef);

                // 2. Call Analyze Image API
                console.log('Calling /api/analyze-image...'); // DEBUG
                try {
                    response = await fetch('/api/analyze-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imageUrl: downloadURL,
                            existingTags
                        }),
                    });
                } catch (netErr) {
                    console.error('Network request failed:', netErr);
                    throw new Error(`Network Error: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
                }
            }

            console.log('Response status:', response.status); // DEBUG

            let responseText = '';
            try {
                responseText = await response.text();
                console.log('Raw server response body:', responseText); // DEBUG
            } catch (textErr) {
                console.error('Failed to read response text:', textErr);
                throw new Error('Failed to read server response');
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (jsonErr) {
                console.error('JSON parse failed:', jsonErr);
                throw new Error(`Invalid Server Response (Not JSON): ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
            }

            console.log('Analysis data:', data); // DEBUG

            if (!data.success) {
                throw new Error(`Analysis Error: ${data.error || 'Failed to analyze URL'}`);
            }

            // Stage 2: Save
            // Save to Firestore
            if (!uid) throw new Error("User not registered in database");

            try {
                await saveLink(uid, {
                    url: data.link.url, // For images, this will be the storage URL
                    title: data.link.title,
                    summary: data.link.summary,
                    detailedSummary: data.link.detailedSummary,
                    tags: data.link.tags,
                    category: data.link.category,
                    language: data.link.language,
                    metadata: {
                        originalTitle: data.link.metadata.originalTitle,
                        estimatedReadTime: data.link.metadata.estimatedReadTime,
                        actionableTakeaway: data.link.metadata.actionableTakeaway
                    },
                    // Add source type info if available
                    sourceType: activeTab === 'image' ? 'image' : 'web',
                    sourceName: data.link.sourceName
                });
            } catch (saveErr) {
                throw new Error(`Firestore Save Error: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
            }

            setUrl('');
            setImageFile(null);
            setImagePreview(null);
            setIsExpanded(false);
            onLinkAdded();
        } catch (err) {
            console.error('AddLinkForm Error Details:', err);
            // Check if it's a DOMException or other weird browser error
            if (err instanceof DOMException) {
                console.error('DOMException name:', err.name);
                console.error('DOMException message:', err.message);
            }
            setError(err instanceof Error ? err.message : `Unknown error: ${String(err)}`);
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

                            <button
                                type="submit"
                                disabled={isLoading || (activeTab === 'link' ? !url.trim() : !imageFile)}
                                className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>{activeTab === 'link' ? 'Analyzing...' : 'Processing Image...'}</span>
                                    </>
                                ) : (
                                    'Save'
                                )}
                            </button>
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
