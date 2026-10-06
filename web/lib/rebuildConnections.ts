'use client';

import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, query, updateDoc } from 'firebase/firestore';
import { db, functions } from './firebase';

/**
 * Version of the backend relatedness logic (graph_service.py). Bump it whenever
 * the connection rules change materially — every library computed under an
 * older version silently recomputes its `relatedLinks` on next app open
 * (see ensureGraphVersion). v2: distance-gated candidates + adversarial
 * verification prompt + similarity floor, killing forced connections like
 * "both use standardized benchmarking".
 *
 * Mirrored as GRAPH_VERSION in functions/link_service.py, which stamps it on
 * every brand-new workspace so a signup never "migrates" an empty library.
 * Bump both together: functions/tests/test_workspace_graph_version.py fails
 * if they differ.
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
 * Where a rebuild stands: the phase and page cursor to continue from, plus the
 * running totals (so a resumed run still knows whether an earlier session had
 * failures).
 */
export interface RebuildCheckpoint {
    phase: 'embed' | 'relate';
    cursor: string | null;
    embedded: number;
    updated: number;
    failed: number;
}

/** The callable's per-uid bucket (`rebuild-uid`, 60 calls an hour) said stop. */
function isRateLimited(e: unknown): boolean {
    const code = (e as { code?: unknown } | null)?.code;
    return code === 'functions/resource-exhausted' || code === 'resource-exhausted';
}

/**
 * Rebuild the signed-in user's knowledge graph so cards saved before the graph
 * existed get their "See also" connections. Drives the `rebuild_connections`
 * callable a page at a time (embeddings for the whole library first, then
 * relations), reporting progress so the UI can show a live count. Idempotent.
 *
 * Resumable: `resume` continues from a checkpoint and `onCheckpoint` receives
 * one after every page. The callable allows 60 calls an hour per user (20
 * cards an embed page, 8 a relate page), so a library past roughly 340 cards
 * cannot finish in one go; hitting that limit returns `paused: true` with the
 * last checkpoint intact instead of throwing away the progress.
 */
export async function rebuildConnections(
    uid: string,
    onProgress?: (p: RebuildProgress) => void,
    opts?: {
        /** Recompute `relatedLinks` even on cards that already have them —
         *  how a logic upgrade replaces stale connections. */
        force?: boolean;
        /** Continue an earlier run from here instead of from the start. */
        resume?: RebuildCheckpoint | null;
        /** Called after every page with where the run now stands. */
        onCheckpoint?: (c: RebuildCheckpoint) => void;
    },
): Promise<{ embedded: number; updated: number; failed: number; paused: boolean }> {
    const call = httpsCallable<Record<string, unknown>, BatchResult>(functions, 'rebuild_connections');
    const resume = opts?.resume ?? null;
    let embedded = resume?.embedded ?? 0;
    let updated = resume?.updated ?? 0;
    let failed = resume?.failed ?? 0;
    let processed = 0;

    const phases = (['embed', 'relate'] as const).filter((p) => !(resume?.phase === 'relate' && p === 'embed'));
    for (const phase of phases) {
        // Only the relate phase honors force — re-embedding unchanged text
        // would burn API calls to produce the same vectors.
        const force = phase === 'relate' && !!opts?.force;
        let cursor: string | null | undefined = resume?.phase === phase ? resume.cursor ?? undefined : undefined;
        // Bound the loop defensively so a backend quirk can't spin forever.
        for (let guard = 0; guard < 500; guard++) {
            let res: { data: BatchResult };
            try {
                res = await call({ phase, cursor, uid, force });
            } catch (e) {
                // Out of hourly budget: a pause, not a failure. The last
                // checkpoint already points at this page.
                if (isRateLimited(e)) return { embedded, updated, failed, paused: true };
                throw e;
            }
            const d: BatchResult = res.data;
            embedded += d.embedded;
            updated += d.updated;
            failed += d.failed;
            processed += d.processed;
            onProgress?.({ phase, processed, updated, embedded });
            cursor = d.nextCursor;
            if (d.done) break;
            opts?.onCheckpoint?.({ phase, cursor: cursor ?? null, embedded, updated, failed });
        }
        if (phase === 'embed') {
            opts?.onCheckpoint?.({ phase: 'relate', cursor: null, embedded, updated, failed });
        }
    }

    return { embedded, updated, failed, paused: false };
}

// Per user and per GRAPH_VERSION, so a version bump starts a fresh run.
const checkpointKey = (uid: string) => `machina.graphMigration.${uid}.v${GRAPH_VERSION}`;

function loadCheckpoint(uid: string): RebuildCheckpoint | null {
    try {
        const raw = localStorage.getItem(checkpointKey(uid));
        if (!raw) return null;
        const c = JSON.parse(raw) as Partial<RebuildCheckpoint> | null;
        if (!c || (c.phase !== 'embed' && c.phase !== 'relate')) return null;
        if (c.cursor !== null && typeof c.cursor !== 'string') return null;
        return {
            phase: c.phase,
            cursor: c.cursor,
            embedded: Number(c.embedded) || 0,
            updated: Number(c.updated) || 0,
            failed: Number(c.failed) || 0,
        };
    } catch {
        // Storage blocked or the value is corrupt: start over.
        return null;
    }
}

function saveCheckpoint(uid: string, c: RebuildCheckpoint | null): void {
    try {
        if (c) localStorage.setItem(checkpointKey(uid), JSON.stringify(c));
        else localStorage.removeItem(checkpointKey(uid));
    } catch {
        // Best effort: without storage a paused run restarts from the top.
    }
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
 * retries on the next open (the rebuild is idempotent). Its position is kept
 * in localStorage, so a run paused by the hourly rebuild limit (or a closed
 * tab) continues from there instead of starting over, which for a large
 * library meant it could never finish.
 */
export function ensureGraphVersion(uid: string): void {
    if (migrationStarted) return;
    migrationStarted = true;
    (async () => {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        const current = (snap.data()?.graphVersion as number | undefined) ?? 1;
        if (current >= GRAPH_VERSION) return;
        // An empty library has nothing to recompute: stamp it and skip the
        // callable (two cold function calls). create_workspace stamps new
        // workspaces itself; this covers the ones it didn't write, i.e. the
        // client-side fallback (AuthProvider.createWorkspaceClientSide, whose
        // locked create rule does not allow the field) and any doc created
        // before the server stamp shipped. A card saved after this check is
        // analyzed by the current backend, so the stamp stays true.
        const anyCard = await getDocs(query(collection(db, 'users', uid, 'links'), limit(1)));
        if (anyCard.empty) {
            await updateDoc(userRef, { graphVersion: GRAPH_VERSION });
            return;
        }
        const { updated, failed, paused } = await rebuildConnections(uid, undefined, {
            force: true,
            resume: loadCheckpoint(uid),
            onCheckpoint: (c) => saveCheckpoint(uid, c),
        });
        if (paused) {
            // Over the hourly rebuild limit: the checkpoint stays, and a later
            // open picks up from it.
            migrationStarted = false;
            console.info(`Graph migration paused at the hourly limit (${updated} recomputed so far); resumes next open`);
            return;
        }
        // The run reached the end, so its position is spent either way.
        saveCheckpoint(uid, null);
        // A partially failed run must not stamp: `failed` counts cards whose
        // recompute genuinely errored (embed/LLM/write — the backend counts
        // permanently text-less cards as skipped, not failed), so those cards
        // still carry the OLD graph's connections. Leaving the stamp unwritten
        // makes the next open retry from the top, like an interrupted run.
        if (failed > 0) {
            console.warn(`Graph migration incomplete: ${updated} recomputed, ${failed} failed. Will retry next open`);
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
