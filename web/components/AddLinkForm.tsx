'use client';

import { useState, FormEvent } from 'react';
import { Link, Plus, Loader2 } from 'lucide-react';

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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!url.trim() || isLoading) return;

        setIsLoading(true);
        setError(null);

        try {
            // Call the analyze API
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to analyze URL');
            }

            // Save to localStorage
            // TODO: This will happen server-side with Firestore in production
            const stored = localStorage.getItem('secondbrain_links');
            const links = stored ? JSON.parse(stored) : [];
            links.unshift(data.link);
            localStorage.setItem('secondbrain_links', JSON.stringify(links));

            // Reset form
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
        <div className="fixed bottom-6 right-6 z-40">
            {/* Expanded Form */}
            {isExpanded && (
                <form
                    onSubmit={handleSubmit}
                    className="absolute bottom-16 right-0 w-80 bg-card rounded-xl p-4 shadow-2xl animate-slide-up"
                >
                    <label htmlFor="url" className="block text-sm font-medium text-text mb-2">
                        Add a link to your Second Brain
                    </label>
                    <div className="flex gap-2">
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
                            className="px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${isExpanded
                        ? 'bg-white/10 rotate-45'
                        : 'bg-white hover:bg-gray-200'
                    }`}
            >
                <Plus className={`w-6 h-6 transition-colors ${isExpanded ? 'text-white' : 'text-black'}`} />
            </button>
        </div>
    );
}
