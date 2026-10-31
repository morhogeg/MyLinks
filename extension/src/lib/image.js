/**
 * Screenshot bytes: decode the data URL captureVisibleTab returns, and shrink
 * it when needed so it stays legible for Machina's image reader but under the
 * server's 5 MB limit (main.py MAX_IMAGE_BYTES). Runs in the service worker:
 * createImageBitmap and OffscreenCanvas are available there, so no offscreen
 * document (and no extra permission) is needed.
 */

/** Longest side Machina needs to read text in a screenshot. */
export const MAX_EDGE = 2400;

/** Comfortably under the server's 5 MB per image. */
export const MAX_BYTES = 4_500_000;

/**
 * Decode a base64 data URL by hand (no fetch(data:), which an extension CSP
 * with a strict connect-src would block).
 * @returns {{bytes: Uint8Array, mimeType: string}}
 */
export function decodeDataUrl(dataUrl) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl));
    if (!m || !m[2]) throw new Error('Not a base64 data URL');
    const binary = atob(m[3]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, mimeType: m[1] || 'application/octet-stream' };
}

/** Base64 without data: prefix, in chunks (no call-stack blowup on MBs). */
export function toBase64(bytes) {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + CHUNK)));
    }
    return btoa(binary);
}

/**
 * @param {string} dataUrl from chrome.tabs.captureVisibleTab
 * @returns {Promise<{data: string, mimeType: string, width: number, height: number, bytes: number}>}
 */
export async function fitScreenshot(dataUrl) {
    const { bytes, mimeType } = decodeDataUrl(dataUrl);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
    try {
        const { width, height } = bitmap;
        if (Math.max(width, height) <= MAX_EDGE && bytes.length <= MAX_BYTES) {
            return { data: toBase64(bytes), mimeType, width, height, bytes: bytes.length };
        }
        let scale = Math.min(1, MAX_EDGE / Math.max(width, height));
        let quality = 0.88;
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const w = Math.max(1, Math.round(width * scale));
            const h = Math.max(1, Math.round(height * scale));
            const canvas = new OffscreenCanvas(w, h);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No 2D context');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bitmap, 0, 0, w, h);
            const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
            if (blob.size <= MAX_BYTES) {
                const out = new Uint8Array(await blob.arrayBuffer());
                return { data: toBase64(out), mimeType: 'image/jpeg', width: w, height: h, bytes: out.length };
            }
            // Too big still: lower quality first, then size.
            if (quality > 0.7) quality -= 0.1;
            else scale *= 0.8;
        }
        throw new Error('Screenshot too large');
    } finally {
        bitmap.close();
    }
}
