import { useEffect, useRef, useState } from 'react';
import { apiUrl, fetchWithTimeout } from '@/lib/api';
import { appCheckHeaders } from '@/lib/firebase';
import { authHeaders } from '@/lib/auth';
import { normalizeSearchText } from '@/lib/searchMatch';
import { reportError } from '@/lib/errorReporter';

/**
 * Meaning search — the semantic half of the search bar.
 *
 * The literal layer (searchMatch.ts) is instant but only finds cards that
 * contain the query's words; "Food" can't reach a card that says "Spaghetti
 * al limone". This hook sends the query — after a debounce — to the deployed
 * `search_links_http` backend (`/api/search`, rewritten to the function on
 * both Vercel and Firebase Hosting), whose hybrid retrieval embeds the query
 * and runs a quality-gated vector search over the user's cards (distance
 * ceiling + cliff cut, so nearest-neighbour padding never masquerades as
 * results — the junk wall that killed the 2026-07 hybrid stays dead).
 *
 * Only the ranked card IDS come back into ranking: the client already holds
 * the full library snapshot while searching (useSearchLibrary), so results
 * render from live client `Link` objects and pass through the exact same
 * pending/privacy/facet gates as every other card. useFeedFilters appends
 * semantic-only matches BELOW every literal hit — meaning search widens
 * results, it can never outrank or displace an exact word match. WHICH of these
 * ids are semantic-ONLY is decided there too (`semanticOnlyIds`), not here:
 * this hook knows what the server returned, but "does the card also contain the
 * query's words" is the literal pass. Feed puts that set behind a "By meaning"
 * divider and marks each card, so a hit sharing no word with the query reads as
 * deliberate rather than as noise.
 *
 * The HTTP twin (not the `search_links` callable) serves BOTH web and native:
 * the callable's CORS preflight is rejected from the Capacitor
 * `capacitor://localhost` origin (the documented claim_workspace bug class),
 * and the twin runs the identical backend logic — one code path, no platform
 * branch. Failures degrade silently to literal-only search and are reported
 * to `client_errors` (`semantic-search` tag) so an outage leaves a trail.
 */

// 400ms was pure dead time in front of a request that already takes a second or
// more; 220ms still collapses a burst of keystrokes into one request while
// shaving that wait off every search (owner QA: results felt 5-10s away).
const DEBOUNCE_MS = 220;
/** Skip one-letter queries: the literal layer already narrows per keystroke,
 *  and a single character carries no meaning to embed. */
const MIN_QUERY_CHARS = 2;
const RESULT_LIMIT = 20;
/** Server rejects bodies over MAX_QUESTION_LENGTH (2000); stay well under. */
const MAX_QUERY_CHARS = 500;
const CACHE_CAP = 50;

/** Re-warm at most this often: an instance stays warm ~15 min, so pings inside
 *  that window buy nothing. */
const WARMUP_INTERVAL_MS = 10 * 60_000;
let lastWarmupAt = 0;

/**
 * Fire-and-forget cold-start absorber. Called the moment the search UI opens
 * (and on the first keystroke, for icon-less entry): the search backend is a
 * scale-to-zero function whose cold start (3-6s of module import + Firebase
 * init) otherwise lands in front of the FIRST query. A `{warmup: true}` body
 * makes the server answer 204 before auth/App Check — reaching the handler IS
 * the work — so the boot happens while the user is still typing. Deliberately
 * no auth/App Check headers: computing them would delay the ping, and the
 * endpoint does nothing with them. Failures are irrelevant by design.
 */
export function warmSearchBackend(): void {
    const now = Date.now();
    if (now - lastWarmupAt < WARMUP_INTERVAL_MS) return;
    lastWarmupAt = now;
    fetchWithTimeout(apiUrl('/api/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warmup: true }),
    }, 10_000).catch(() => { /* a failed warmup just means a normal cold search */ });
}

interface SemanticSearchState {
    /** Card ids in server rank order — [] until a response lands for the CURRENT query. */
    semanticIds: string[];
    /** True while a request for the current query is debouncing or in flight. */
    semanticPending: boolean;
}

export function useSemanticSearch(uid: string | null | undefined, searchQuery: string): SemanticSearchState {
    const [state, setState] = useState<SemanticSearchState>({ semanticIds: [], semanticPending: false });
    // Per-session response cache keyed by the normalized query, so re-typing a
    // query (or backspacing through one) re-applies instantly with no request.
    const cacheRef = useRef(new Map<string, string[]>());
    // The normalized query the latest request was issued for — the stale-response
    // guard: a response only applies while its query is still the live one.
    const liveKeyRef = useRef('');

    const trimmed = searchQuery.trim().slice(0, MAX_QUERY_CHARS);
    const queryKey = normalizeSearchText(trimmed);

    useEffect(() => {
        liveKeyRef.current = queryKey;

        if (!uid || trimmed.length < MIN_QUERY_CHARS) {
            setState({ semanticIds: [], semanticPending: false });
            return;
        }

        const cached = cacheRef.current.get(queryKey);
        if (cached) {
            setState({ semanticIds: cached, semanticPending: false });
            return;
        }

        // New query: drop the previous query's ids immediately (stale semantic
        // matches must never mix into a different query's results) and show the
        // pending state through debounce + flight.
        setState({ semanticIds: [], semanticPending: true });

        const timer = setTimeout(async () => {
            try {
                const res = await fetchWithTimeout(apiUrl('/api/search'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(await appCheckHeaders()),
                        ...(await authHeaders()),
                    },
                    body: JSON.stringify({ query: trimmed, limit: RESULT_LIMIT, uid }),
                }, 15_000);
                if (!res.ok) throw new Error(`search_links_http ${res.status}`);
                const data = await res.json();
                const ids: string[] = Array.isArray(data?.links)
                    ? data.links.map((l: { id?: unknown }) => l?.id).filter((id: unknown): id is string => typeof id === 'string')
                    : [];
                if (cacheRef.current.size >= CACHE_CAP) cacheRef.current.clear();
                cacheRef.current.set(queryKey, ids);
                if (liveKeyRef.current === queryKey) {
                    setState({ semanticIds: ids, semanticPending: false });
                }
            } catch (err) {
                // Degrade to literal-only for this query; leave a durable trail.
                reportError(err, 'semantic-search');
                if (liveKeyRef.current === queryKey) {
                    setState({ semanticIds: [], semanticPending: false });
                }
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
        // `trimmed` and `queryKey` derive from searchQuery; keying the effect on
        // queryKey alone would miss uid arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid, queryKey]);

    return state;
}
