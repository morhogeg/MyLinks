'use client';

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface RebuildProgress {
    phase: 'embed' | 'relate';
    /** Cards processed so far across the whole run. */
    processed: number;
    /** relatedLinks written so far. */
    updated: number;
    /** embeddings written so far. */
    embedded: number;
}

interface BatchResult {
    done: boolean;
    nextCursor: string | null;
    processed: number;
    embedded: number;
    updated: number;
    skipped: number;
    failed: number;
}

/**
 * Rebuild the signed-in user's knowledge graph so cards saved before the graph
 * existed get their "See also" connections. Drives the `rebuild_connections`
 * callable a page at a time (embeddings for the whole library first, then
 * relations), reporting progress so the UI can show a live count. Idempotent.
 */
export async function rebuildConnections(
    uid: string,
    onProgress?: (p: RebuildProgress) => void,
): Promise<{ embedded: number; updated: number; failed: number }> {
    const call = httpsCallable<Record<string, unknown>, BatchResult>(functions, 'rebuild_connections');
    let embedded = 0;
    let updated = 0;
    let failed = 0;
    let processed = 0;

    for (const phase of ['embed', 'relate'] as const) {
        let cursor: string | null | undefined = undefined;
        // Bound the loop defensively so a backend quirk can't spin forever.
        for (let guard = 0; guard < 500; guard++) {
            const res: { data: BatchResult } = await call({ phase, cursor, uid });
            const d: BatchResult = res.data;
            embedded += d.embedded;
            updated += d.updated;
            failed += d.failed;
            processed += d.processed;
            onProgress?.({ phase, processed, updated, embedded });
            cursor = d.nextCursor;
            if (d.done) break;
        }
    }

    return { embedded, updated, failed };
}
