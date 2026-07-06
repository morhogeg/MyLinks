'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/lib/types';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

/**
 * Hybrid search state for the feed: the raw query, its 500ms-debounced echo,
 * and the semantic-search results fetched from the `search_links` callable.
 * Keyword matching against the debounced query stays with the caller — this
 * hook only owns the query lifecycle and the semantic leg.
 */
export function useSearch() {
    const [searchQuery, setSearchQuery] = useState('');

    // Semantic Search State
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Link[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Semantic Search Effect
    useEffect(() => {
        if (!debouncedQuery.trim()) {
            setIsSearching(false);
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        const performSearch = async () => {
            setIsSearching(true);
            setSearchError(null);
            try {
                const searchFn = httpsCallable(functions, 'search_links');
                const result = await searchFn({
                    query: debouncedQuery,
                    limit: 20
                    // We can pass uid here if needed for dev, but auth context should handle it
                });
                const data = result.data as { links: Link[] };
                setSearchResults(data.links || []);
            } catch (err: any) {
                console.error("Search failed:", err);
                // Extract error message from the Firebase callable error
                let errorMessage = 'Search failed. Please try again.';
                if (err?.message) {
                    if (err.message.includes('SEMANTIC_SEARCH_NOT_CONFIGURED')) {
                        errorMessage = 'Semantic search is not configured. Please set GEMINI_API_KEY in Firebase Functions.';
                    } else if (err.message.includes('SEMANTIC_SEARCH_ERROR')) {
                        errorMessage = 'Failed to generate search embeddings. Check your API key.';
                    } else if (err.message.includes('VECTOR_SEARCH_ERROR')) {
                        errorMessage = 'Vector search failed. Please ensure Firestore vector index is deployed.';
                    } else if (err.message.includes('GEMINI_API_KEY')) {
                        errorMessage = 'API key not configured for semantic search.';
                    } else {
                        errorMessage = err.message;
                    }
                }
                setSearchError(errorMessage);
                // Fall back to local filtering only - semantic search errors shouldn't break the app
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        performSearch();
    }, [debouncedQuery]);

    return { searchQuery, setSearchQuery, debouncedQuery, isSearching, searchResults, searchError };
}
