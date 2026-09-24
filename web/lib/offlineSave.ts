'use client';

/**
 * Links saved while OFFLINE.
 *
 * The capture form writes the placeholder card at once (Firestore queues the
 * write and the card shows from the local cache) with `queuedAt` and
 * `pendingEnqueue: true`, and nothing is charged yet. The card has to be handed
 * to the background pipeline (/api/share with its cardId) once the device is
 * online again. Two things do that, both through `enqueueOfflineSave`:
 *   - the capture form, on the `online` event in the same session;
 *   - `useResumeOfflineSaves`, on launch / reconnect, for cards whose session
 *     ended (app killed) before the connection came back.
 * The server clears `pendingEnqueue` in the same transaction that accepts the
 * enqueue and answers `duplicate` if it was already cleared, so two devices
 * (or the two paths above) can never queue the same card twice.
 */

import { useEffect } from 'react';
import { collection, getDocs, limit, query, waitForPendingWrites, where } from 'firebase/firestore';
import { appCheckHeaders, db } from '@/lib/firebase';
import { authHeaders } from '@/lib/auth';
import { apiUrl, fetchWithTimeout } from '@/lib/api';
import { offerUpgradeFor } from '@/lib/entitlement';
import { markLinkFailed } from '@/lib/storage';

// Cards this tab is already enqueueing (the form's listener and the resume
// hook can both see the same card).
const inFlight = new Set<string>();

/**
 * Hand an offline-saved card to the pipeline. Waits for `written` (the
 * placeholder reaching the server) first: the worker drops a job whose card it
 * can't find. On failure the card flips to a retryable `failed` card.
 */
export async function enqueueOfflineSave(uid: string, url: string, cardId: string, written: Promise<unknown>): Promise<void> {
    if (inFlight.has(cardId)) return;
    inFlight.add(cardId);
    try {
        await written;
        const response = await fetchWithTimeout(apiUrl('/api/share'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
            body: JSON.stringify({ url, cardId, uid, offlineEnqueue: true }),
        }, 30_000);
        const text = await response.text();
        let resData: { success?: boolean; error?: string };
        try { resData = JSON.parse(text); } catch { resData = {}; }
        if (!response.ok || !resData.success) {
            if (response.status === 429) offerUpgradeFor(resData);
            throw new Error(resData?.error || 'Could not start analysis. Please try again.');
        }
    } catch (err) {
        try {
            await markLinkFailed(uid, cardId, err instanceof Error ? err.message : String(err));
        } catch {
            // Best-effort; the processing janitor ages it out otherwise.
        }
    } finally {
        inFlight.delete(cardId);
    }
}

/** Enqueue every offline-saved card of `uid` still waiting, now and on each
 *  reconnect. Mounted once, where the library is (Feed). */
export function useResumeOfflineSaves(uid: string | null | undefined): void {
    useEffect(() => {
        if (!uid || typeof window === 'undefined') return;
        let cancelled = false;
        const run = async () => {
            if (cancelled || navigator.onLine === false) return;
            try {
                const snap = await getDocs(query(
                    collection(db, 'users', uid, 'links'),
                    where('pendingEnqueue', '==', true),
                    limit(20),
                ));
                if (cancelled || snap.empty) return;
                // A placeholder written in a previous session may still be a
                // queued local write: let it reach the server before the
                // worker looks for it.
                const written = waitForPendingWrites(db);
                for (const d of snap.docs) {
                    const data = d.data();
                    if (data.status !== 'processing' || typeof data.url !== 'string' || !data.url) continue;
                    void enqueueOfflineSave(uid, data.url, d.id, written);
                }
            } catch {
                // Retried on the next launch or reconnect.
            }
        };
        void run();
        window.addEventListener('online', run);
        return () => {
            cancelled = true;
            window.removeEventListener('online', run);
        };
    }, [uid]);
}
