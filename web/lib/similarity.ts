import { apiUrl, fetchWithTimeout } from './api';
import { appCheckHeaders } from './firebase';
import { authHeaders } from './auth';

/**
 * Server-computed card similarity for the Related list (lib/related.ts) and
 * the knowledge graph (lib/graph.ts).
 *
 * Both used to take cosine similarity from the `embedding_vector` every card
 * doc carried, which made every client download every vector (~7 KB a card).
 * Vectors are moving off the card docs (functions/vector_store.py), so the
 * server now supplies the similarities instead, through `/api/search` with a
 * `similarity` body (functions/similarity_service.py — an existing rewrite, so
 * no new Hosting route). Only the vector math moved: which ties qualify, how
 * they rank and what they say is still decided in related.ts, so the Related
 * list and the graph keep agreeing.
 *
 * The server returns only the pairs the qualification bar could act on. A pair
 * it omits means "both have vectors, similarity below every bar", which is why
 * callers read a missing pair as `sim = 0` with `haveVectors = true` — that
 * gives the same verdict as the true value. Cards with no vector at all come
 * back in `noVector` (their concept ties are not vetoed by similarity).
 *
 * Every call fails soft to `null`; the caller then falls back to computing from
 * card vectors when the card still carries them. Results are cached briefly
 * per session so reopening a card or the graph costs nothing.
 */

const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CANDIDATES = 300; // = MAX_RELATED_CANDIDATES in similarity_service.py

export interface AnchorSims {
    anchorHasVector: boolean;
    sims: Map<string, number>;
    noVector: Set<string>;
}

export interface PoolSims {
    noVector: Set<string>;
    /** Similarity of pool[i] and pool[j], keyed `${min}|${max}`. */
    pairs: Map<string, number>;
}

const anchorCache = new Map<string, { at: number; value: AnchorSims }>();
let poolCache: { key: string; at: number; value: PoolSims } | null = null;

async function post(uid: string, similarity: unknown): Promise<unknown | null> {
    try {
        const res = await fetchWithTimeout(apiUrl('/api/search'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await appCheckHeaders()),
                ...(await authHeaders()),
            },
            body: JSON.stringify({ uid, similarity }),
        }, TIMEOUT_MS);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function isNum(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

/** Similarity of one card to its library (the Related list). `candidateIds`
 *  are the cards sharing a specific concept with it — each gets an exact
 *  value; the server adds its nearest semantic neighbours on top. */
export async function fetchAnchorSims(
    uid: string,
    anchorId: string,
    candidateIds: string[],
): Promise<AnchorSims | null> {
    const candidates = candidateIds.slice(0, MAX_CANDIDATES);
    const key = `${anchorId}\n${[...candidates].sort().join(',')}`;
    const hit = anchorCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const data = await post(uid, { anchorId, candidateIds: candidates }) as {
        anchorHasVector?: unknown; sims?: unknown; noVector?: unknown;
    } | null;
    if (!data || typeof data.anchorHasVector !== 'boolean') return null;
    const sims = new Map<string, number>();
    if (data.sims && typeof data.sims === 'object') {
        for (const [id, v] of Object.entries(data.sims as Record<string, unknown>)) if (isNum(v)) sims.set(id, v);
    }
    const noVector = new Set(Array.isArray(data.noVector) ? data.noVector.filter((x): x is string => typeof x === 'string') : []);
    const value: AnchorSims = { anchorHasVector: data.anchorHasVector, sims, noVector };
    if (anchorCache.size > 200) anchorCache.clear();
    anchorCache.set(key, { at: Date.now(), value });
    return value;
}

/** Pairwise similarity over the graph's node pool (<= 600 cards). `concepts`
 *  (lower-cased, parallel to `ids`) let the server drop mid-band pairs that
 *  share fewer than two concepts — they could never qualify. */
export async function fetchPoolSims(
    uid: string,
    ids: string[],
    concepts: string[][],
): Promise<PoolSims | null> {
    const key = ids.join('\n');
    if (poolCache && poolCache.key === key && Date.now() - poolCache.at < CACHE_TTL_MS) return poolCache.value;

    const data = await post(uid, { ids, concepts }) as { noVector?: unknown; pairs?: unknown } | null;
    if (!data || !Array.isArray(data.pairs)) return null;
    const pairs = new Map<string, number>();
    for (const p of data.pairs) {
        if (!Array.isArray(p) || p.length < 3) continue;
        const [i, j, s] = p;
        if (!Number.isInteger(i) || !Number.isInteger(j) || !isNum(s)) continue;
        if (i < 0 || j < 0 || i >= ids.length || j >= ids.length || i === j) continue;
        pairs.set(i < j ? `${i}|${j}` : `${j}|${i}`, s);
    }
    const noVector = new Set(Array.isArray(data.noVector) ? data.noVector.filter((x): x is string => typeof x === 'string') : []);
    const value: PoolSims = { noVector, pairs };
    poolCache = { key, at: Date.now(), value };
    return value;
}
