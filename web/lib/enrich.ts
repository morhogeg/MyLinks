import { compressImage } from './image';
import { apiUrl, fetchWithTimeout } from './api';
import { appCheckHeaders } from './firebase';
import { authHeaders } from './auth';
import { offerUpgradeFor } from './entitlement';
import type { Link } from './types';

/**
 * Complete a PARTIAL card with the user's own screenshots of the post.
 *
 * Facebook, LinkedIn and Instagram serve a login wall to the scraper, so the
 * card behind such a link can be a preview at best. Instead of asking the user
 * to share a screenshot as a NEW card, the partial card takes the screenshots
 * itself: they ride the same `/api/share` images path a multi-screenshot
 * capture uses, with `enrichCardId` naming the card to complete. The backend
 * stores them, stamps the card `enrichStatus: 'processing'`, and the worker
 * merges the screenshot read into the SAME card (notes, reminders and
 * collections untouched), clears the partial flags and shows the screenshots
 * on the card. Resolves once the screenshots are queued; the card's live
 * Firestore listener carries the rest.
 */
export const MAX_CARD_SCREENSHOTS = 5; // mirrors functions/main.py MAX_CARD_IMAGES

export async function addScreenshotsToCard(uid: string, cardId: string, files: File[]): Promise<{ count: number }> {
    const picked = files.filter((f) => f && f.size > 0).slice(0, MAX_CARD_SCREENSHOTS);
    if (!picked.length) throw new Error('Pick a screenshot first.');
    const images: { data: string; mimeType: string }[] = [];
    for (const file of picked) {
        const compressed = await compressImage(file);
        images.push({ data: compressed.base64, mimeType: compressed.mimeType });
    }
    const response = await fetchWithTimeout(apiUrl('/api/share'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
        body: JSON.stringify({ images, enrichCardId: cardId, uid }),
    }, 60_000);
    let data: { success?: boolean; error?: string } | null = null;
    try {
        data = await response.json();
    } catch {
        // A non-JSON body is handled by the status check below.
    }
    if (!response.ok || !data?.success) {
        // A screenshot read is metered like a save: the free plan's monthly
        // wall opens the paywall, then fails with the server's own copy.
        if (response.status === 429) offerUpgradeFor(data);
        throw new Error(data?.error || 'Could not send the screenshot. Please try again.');
    }
    return { count: images.length };
}

/** The screenshots an earlier "Add screenshots" put on this web card, in
 *  order (mirrors functions/main.py `_card_enrich_screenshots`). A scraped
 *  card's own page images are not the user's screenshots. */
export function enrichScreenshots(link: Pick<Link, 'enrichedAt' | 'imageUrls'>): string[] {
    if (!link.enrichedAt) return [];
    return (link.imageUrls ?? []).filter((u): u is string => typeof u === 'string' && !!u).slice(0, MAX_CARD_SCREENSHOTS);
}

/** Where the screenshot read is, as the backend reports it on the card
 *  (`enrichStage`): the step index for the progress list, 0-based. */
export type EnrichStage = 'queued' | 'reading' | 'analyzing' | 'connecting';
export function enrichStep(stage: EnrichStage | undefined): number {
    switch (stage) {
        case 'reading': return 1;
        case 'analyzing': return 2;
        case 'connecting': return 3;
        default: return 1; // queued / not yet reported: the upload is done, reading is next
    }
}
