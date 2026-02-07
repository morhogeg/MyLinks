'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Link, Plus, Loader2, X } from 'lucide-react';
import { saveLink } from '@/lib/storage';
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
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: formattedUrl }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to analyze URL');
            }

            // Save to Firestore
            if (!uid) throw new Error("User not registered in database");

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

            setUrl('');
            setIsExpanded(false);
            onLinkAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Backdrop for mobile focus - now covering the header */}
            {isExpanded && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] sm:hidden animate-fade-in"
                    onClick={() => setIsExpanded(false)}
                />
            )}

            <div className="fixed bottom-6 right-4 sm:right-6 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {/* Expanded Form - Now using screen-relative positioning on mobile and higher z-index */}
                {isExpanded && (
                    <div className="fixed sm:absolute bottom-[40%] sm:bottom-20 inset-x-4 sm:inset-auto sm:right-0 sm:w-96 max-w-[400px] mx-auto sm:mx-0 z-[70]">
                        <form
                            onSubmit={handleSubmit}
                            className="bg-card border border-white/10 rounded-2xl p-6 shadow-2xl animate-slide-up relative overflow-hidden"
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
