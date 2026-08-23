'use client';

import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, functions } from './firebase';

/**
 * Version of the backend relatedness logic (graph_service.py). Bump it whenever
 * the connection rules change materially — every library computed under an
 * older version silently recomputes its `relatedLinks` on next app open
 * (see ensureGraphVersion). v2: distance-gated candidates + adversarial
 * verification prompt + similarity floor, killing forced connections like
 * "both use standardized benchmarking".
 */
export const GRAPH_VERSION = 2;

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
    opts?: {
        /** Recompute `relatedLinks` even on cards that already have them —
         *  how a logic upgrade replaces stale connections. */
        force?: boolean;
    },
): Promise<{ embedded: number; updated: number; failed: number }> {
    const call = httpsCallable<Record<string, unknown>, BatchResult>(functions, 'rebuild_connections');
    let embedded = 0;
    let updated = 0;
    let failed = 0;
    let processed = 0;

    for (const phase of ['embed', 'relate'] as const) {
        // Only the relate phase honors force — re-embedding unchanged text
        // would burn API calls to produce the same vectors.
        const force = phase === 'relate' && !!opts?.force;
        let cursor: string | null | undefined = undefined;
        // Bound the loop defensively so a backend quirk can't spin forever.
        for (let guard = 0; guard < 500; guard++) {
            const res: { data: BatchResult } = await call({ phase, cursor, uid, force });
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

// One attempt per tab — the Firestore stamp below is the durable guard; this
// only stops a re-mount in the same tab from starting a second concurrent run.
let migrationStarted = false;

/**
 * Silent, automatic migration: when this library's connections were computed
 * by an older graph version, recompute them in the background and stamp the
 * user doc with the current version. Fire-and-forget from app boot — no UI,
 * no owner step. Cards whose connections were forced under the old logic get
 * honest ones (or none: an empty related list is a valid outcome). The stamp
 * is written only after the rebuild completes, so an interrupted run simply
 * retries on the next open (the rebuild is idempotent).
 */
export function ensureGraphVersion(uid: string): void {
    if (migrationStarted) return;
    migrationStarted = true;
    (async () => {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        const current = (snap.data()?.graphVersion as number | undefined) ?? 1;
        if (current >= GRAPH_VERSION) return;
        const { updated, failed } = await rebuildConnections(uid, undefined, { force: true });
        // A partially failed run must not stamp: `failed` counts cards whose
        // recompute genuinely errored (embed/LLM/write — the backend counts
        // permanently text-less cards as skipped, not failed), so those cards
        // still carry the OLD graph's connections. Leaving the stamp unwritten
        // makes the next open retry, exactly like an interrupted run.
        if (failed > 0) {
            console.warn(`Graph migration incomplete: ${updated} recomputed, ${failed} failed — will retry next open`);
            return;
        }
        // The user doc always exists (created server-side by claim_workspace),
        // and rules deny client-side creates — update, like updateUserSettings.
        await updateDoc(userRef, { graphVersion: GRAPH_VERSION });
        console.info(`Graph migrated to v${GRAPH_VERSION}: ${updated} cards recomputed, ${failed} failed`);
    })().catch((e) => {
        // Non-fatal: the stamp was never written, so the next open retries.
        migrationStarted = false;
        console.warn('Graph version migration failed; will retry next open', e);
    });
}
