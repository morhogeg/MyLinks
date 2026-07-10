import { useEffect, useRef, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

/**
 * Debounced, generation-guarded semantic search (P-2). Extracted verbatim from
 * Feed (R-3) — same behavior. Owns the debounce, the callable request, and the
 * stale-response guard (`searchGenRef`); the raw query stays in the component.
 *
 * Returns the debounced query (drives the hybrid filter downstream), the
 * in-flight flag, and the normalized semantic results.
 */
export function useSemanticSearch(searchQuery: string) {
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Link[]>([]);
    const [, setSearchError] = useState<string | null>(null);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Generation guard: each search run bumps this counter and captures its own
    // generation. Out-of-order callable responses (a slow "cat" landing after a
    // fast "dog") would otherwise clobber the newer results — so every state
    // write below is gated on still being the latest generation. The callable
    // API can't be aborted mid-flight, so the guard alone protects state.
    // Modeled on AskBrain's stream-generation guard.
    const searchGenRef = useRef(0);

    // Semantic Search Effect
    useEffect(() => {
        if (!debouncedQuery.trim()) {
            searchGenRef.current += 1; // supersede any in-flight search
            setIsSearching(false);
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        const gen = ++searchGenRef.current;
        const isStale = () => searchGenRef.current !== gen;

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
                if (isStale()) return; // a newer query superseded this one
                const data = result.data as { links: Link[] };
                // Normalize each result to the full Link shape (fills defaults),
                // matching how live cards are read via toLink — safe for future
                // rendering, not just id-membership use.
                setSearchResults((data.links || []).map((r) =>
                    toLink({ id: r.id, data: () => r } as unknown as QueryDocumentSnapshot<DocumentData>)
                ));
            } catch (err: unknown) {
                if (isStale()) return;
                console.error("Search failed:", err);
                // Extract error message from the Firebase callable error
                let errorMessage = 'Search failed. Please try again.';
                const message = err instanceof Error ? err.message : '';
                if (message) {
                    if (message.includes('SEMANTIC_SEARCH_NOT_CONFIGURED')) {
                        errorMessage = 'Semantic search is not configured. Please set GEMINI_API_KEY in Firebase Functions.';
                    } else if (message.includes('SEMANTIC_SEARCH_ERROR')) {
                        errorMessage = 'Failed to generate search embeddings. Check your API key.';
                    } else if (message.includes('VECTOR_SEARCH_ERROR')) {
                        errorMessage = 'Vector search failed. Please ensure Firestore vector index is deployed.';
                    } else if (message.includes('GEMINI_API_KEY')) {
                        errorMessage = 'API key not configured for semantic search.';
                    } else {
                        errorMessage = message;
                    }
                }
                setSearchError(errorMessage);
                // Fall back to local filtering only - semantic search errors shouldn't break the app
                setSearchResults([]);
            } finally {
                if (!isStale()) setIsSearching(false);
            }
        };

        performSearch();

        // Superseding a still-running search on cleanup means its late response
        // is ignored (the callable itself can't be cancelled).
        return () => { searchGenRef.current += 1; };
    }, [debouncedQuery]);

    return { debouncedQuery, isSearching, searchResults };
}
