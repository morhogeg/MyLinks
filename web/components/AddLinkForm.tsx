'use client';

import { useState, useEffect, FormEvent } from 'react';

import { Link, Plus, Loader2 } from 'lucide-react';
import { saveLink } from '@/lib/storage';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

interface AddLinkFormProps {
    onLinkAdded: () => void;
}

/**
 * Form for manually adding URLs
 * This replaces WhatsApp ingestion for local testing
 * The same flow (URL -> analyze -> save) will be used by the webhook
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
        if (!url.trim() || isLoading) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
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
                tags: data.link.tags,
                category: data.link.category,
                metadata: {
                    originalTitle: data.link.metadata.originalTitle,
                    estimatedReadTime: data.link.metadata.estimatedReadTime
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
        <div className="fixed bottom-6 right-4 sm:right-6 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Expanded Form */}
            {isExpanded && (
                <form
                    onSubmit={handleSubmit}
                    className="absolute bottom-16 right-0 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-card rounded-xl p-4 shadow-2xl animate-slide-up"
                >
                    <label htmlFor="url" className="block text-sm font-medium text-text mb-2">
                        Add a link to your Second Brain
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                            <input
                                id="url"
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full pl-10 pr-4 py-3 bg-background rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-white/20"
                                disabled={isLoading}
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading || !url.trim()}
                            className="px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Save'
                            )}
                        </button>
                    </div>
                    {error && (
                        <p className="text-red-400 text-sm mt-2">{error}</p>
                    )}
                </form>
            )}

            {/* FAB Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-14 h-14 min-h-[44px] min-w-[44px] rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${isExpanded
                    ? 'bg-white/10 rotate-45'
                    : 'bg-white hover:bg-gray-200'
                    }`}
            >
                <Plus className={`w-6 h-6 transition-colors ${isExpanded ? 'text-white' : 'text-black'}`} />
            </button>
        </div>
    );
}
