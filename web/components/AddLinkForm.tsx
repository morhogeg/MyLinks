'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Link, Plus, Loader2, X } from 'lucide-react';
import { saveLink, getUserTags } from '@/lib/storage';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

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
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [uid, setUid] = useState<string | null>(null);

    // Get UID on mount
    useEffect(() => {
        async function fetchUid() {
            const q = query(collection(db, 'users'), where('phone_number', '==', '+16462440305'), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) setUid(snap.docs[0].id);
        }
        fetchUid();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const formattedUrl = formatUrl(url);
        if (!formattedUrl || isLoading) return;

        setIsLoading(true);
        setError(null);

        try {
            // Stage 1: Analysis
            // Fetch existing tags to pass to AI for reuse
            const existingTags = uid ? await getUserTags(uid) : [];

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: formattedUrl,
                    existingTags
                }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(`Analysis Error: ${data.error || 'Failed to analyze URL'}`);
            }

            // Stage 2: Save
            // Save to Firestore
            if (!uid) throw new Error("User not registered in database");

            try {
                await saveLink(uid, {
                    url: data.link.url,
                    title: data.link.title,
                    summary: data.link.summary,
                    detailedSummary: data.link.detailedSummary,
                    tags: data.link.tags,
                    category: data.link.category,
                    metadata: {
                        originalTitle: data.link.metadata.originalTitle,
                        estimatedReadTime: data.link.metadata.estimatedReadTime,
                        actionableTakeaway: data.link.metadata.actionableTakeaway
                    }
                });
            } catch (saveErr) {
                throw new Error(`Firestore Save Error: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
            }

            setUrl('');
            setIsExpanded(false);
            onLinkAdded();
        } catch (err) {
            console.error('AddLinkForm Error:', err);
            setError(err instanceof Error ? err.message : 'Something went wrong');
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
                <div className="fixed top-24 sm:top-auto sm:bottom-28 inset-x-4 sm:left-auto sm:right-6 sm:w-96 max-w-[400px] mx-auto sm:mx-0 z-[70] animate-slide-up">
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
                                Paste any link to analyze and save it.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="relative">
                                <input
                                    id="url"
                                    type="text"
                                    pattern={undefined}
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="example.com or https://..."
                                    className="w-full px-4 py-4 bg-background border border-white/5 rounded-xl text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-base"
                                    disabled={isLoading}
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading || !url.trim()}
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
