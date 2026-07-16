import { useEffect, useRef, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { functions, appCheckHeaders } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { isNativeApp, apiUrl, fetchWithTimeout } from '@/lib/api';
import { authHeaders } from '@/lib/auth';

/**
 * Debounced, generation-guarded semantic search (P-2). Extracted verbatim from
 * Feed (R-3) — same behavior. Owns the debounce, the request, and the
 * stale-response guard (`searchGenRef`); the raw query stays in the component.
 *
 * Transport is surface-aware. The web uses the Firebase `search_links` callable.
 * The native iOS shell (Capacitor WKWebView) can't: the callable transport's
 * CORS preflight is rejected from `capacitor://localhost`, so httpsCallable()
 * silently fails and the search bar degrades to keyword-only. On native we hit
 * the `search_links_http` twin via `/api/search` with a bearer ID token +
 * App Check header instead — the exact pattern claim_workspace / ask_brain use.
 *
 * Returns the debounced query (drives the hybrid filter downstream), the
 * in-flight flag, the normalized semantic results, and `searchError` — a quiet
 * signal that the meaning half failed so the UI can degrade gracefully (keyword
 * results keep working) instead of silently swallowing it.
 */
export function useSemanticSearch(searchQuery: string, uid?: string | null) {
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Link[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce the SERVER call only — local keyword ranking reacts to every
    // keystroke undebounced (see useFeedFilters), so this delay is invisible
    // except as "the meaning results settle in a beat later".
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Generation guard: each search run bumps this counter and captures its own
    // generation. Out-of-order responses (a slow "cat" landing after a fast
    // "dog") would otherwise clobber the newer results — so every state write
    // below is gated on still being the latest generation. The callable API
    // can't be aborted mid-flight, so the guard alone protects state.
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
                let links: Link[];
                if (isNativeApp()) {
                    // Native: the callable transport's CORS preflight fails from
                    // capacitor://localhost, so use the HTTP twin. Bearer ID token
                    // + App Check header mirror the other /api/* native calls; the
                    // client uid rides along as the pre-cutover fallback (the twin
                    // ignores it once REQUIRE_AUTH is on).
                    const res = await fetchWithTimeout(apiUrl('/api/search'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(await appCheckHeaders()),
                            ...(await authHeaders()),
                        },
                        body: JSON.stringify({ query: debouncedQuery, limit: 20, uid }),
                    });
                    if (isStale()) return; // a newer query superseded this one
                    if (!res.ok) throw new Error(`search HTTP ${res.status}`);
                    const data = await res.json() as { links?: Link[] };
                    links = data.links || [];
                } else {
                    const searchFn = httpsCallable(functions, 'search_links');
                    const result = await searchFn({ query: debouncedQuery, limit: 20 });
                    if (isStale()) return; // a newer query superseded this one
                    const data = result.data as { links?: Link[] };
                    links = data.links || [];
                }
                if (isStale()) return;
                // Normalize each result to the full Link shape (fills defaults),
                // matching how live cards are read via toLink — safe for future
                // rendering, not just id-membership use.
                setSearchResults(links.map((r) =>
                    toLink({ id: r.id, data: () => r } as unknown as QueryDocumentSnapshot<DocumentData>)
                ));
            } catch (err: unknown) {
                if (isStale()) return;
                console.error("Search failed:", err);
                // Extract a user-facing message. The web callable surfaces the
                // backend's tagged errors in err.message; the native twin throws
                // a plain HTTP error. Either way keyword filtering still works, so
                // this only drives a quiet one-line notice, never a hard failure.
                let errorMessage = 'Meaning search is unavailable right now.';
                const message = err instanceof Error ? err.message : '';
                if (message.includes('SEMANTIC_SEARCH_NOT_CONFIGURED')) {
                    errorMessage = 'Semantic search is not configured.';
                } else if (message.includes('SEMANTIC_SEARCH_ERROR')) {
                    errorMessage = 'Failed to generate search embeddings.';
                } else if (message.includes('VECTOR_SEARCH_ERROR')) {
                    errorMessage = 'Vector search is unavailable right now.';
                }
                setSearchError(errorMessage);
                // Fall back to local keyword filtering only — a semantic search
                // error must never break the search bar.
                setSearchResults([]);
            } finally {
                if (!isStale()) setIsSearching(false);
            }
        };

        performSearch();

        // Superseding a still-running search on cleanup means its late response
        // is ignored (the request can't always be cancelled mid-flight).
        return () => { searchGenRef.current += 1; };
    }, [debouncedQuery, uid]);

    return { debouncedQuery, isSearching, searchResults, searchError };
}
