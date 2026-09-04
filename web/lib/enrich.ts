import { compressImage } from './image';
import { apiUrl, fetchWithTimeout } from './api';
import { appCheckHeaders } from './firebase';
import { authHeaders } from './auth';

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
        throw new Error(data?.error || 'Could not send the screenshot. Please try again.');
    }
    return { count: images.length };
}
