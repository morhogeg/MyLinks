// Client-side image downscaling/compression.
//
// Screenshots straight from a phone are often 5–12 MP. Sending the full-res
// file means a slow upload AND slow Gemini vision processing. Downscaling to a
// ~1600px longest edge at JPEG ~0.82 keeps text crisp enough for OCR while
// cutting payload size (and latency) dramatically.
//
// iOS Safari notes (this path used to hang at "~92%" on iPhone):
//   - HEIC photos and large images decode unreliably via `new Image()`, so we
//     prefer `createImageBitmap(file)`, which decodes HEIC, handles very large
//     images, and applies EXIF orientation.
//   - `canvas.toBlob()` can silently never fire its callback on iOS for large
//     canvases — a permanent hang. We encode with the synchronous
//     `canvas.toDataURL('image/jpeg', q)` instead.
//   - The whole operation is wrapped in a timeout so a stuck decode/encode
//     falls back to the original bytes instead of freezing the UI forever.

export interface CompressedImage {
    /** Compressed image as a Blob, for uploading to storage. */
    blob: Blob;
    /** Base64 (no data: prefix), for sending inline to the analyze endpoint. */
    base64: string;
    /** MIME type of the compressed output. */
    mimeType: string;
}

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_QUALITY = 0.82;
// Ceiling on the whole decode+encode step. iOS occasionally stalls on a huge
// HEIC; if we blow past this we fall back to the original bytes rather than
// leaving the user stuck on a frozen progress bar.
const COMPRESS_TIMEOUT_MS = 20_000;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = src;
    });
}

/** Decode a file to something drawable, preferring the iOS-robust path. */
async function decodeDrawable(
    file: File
): Promise<{ width: number; height: number; source: CanvasImageSource; release: () => void }> {
    // Preferred: createImageBitmap — decodes HEIC, handles large images, and
    // honors EXIF orientation so portrait phone photos aren't drawn sideways.
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, {
                imageOrientation: 'from-image',
            } as ImageBitmapOptions);
            return {
                width: bitmap.width,
                height: bitmap.height,
                source: bitmap,
                release: () => bitmap.close(),
            };
        } catch {
            // Fall through to the <img> path.
        }
    }

    // Fallback: decode via an object URL (lighter on memory than a multi-MB
    // data: URL on mobile).
    const url = URL.createObjectURL(file);
    try {
        const img = await loadImage(url);
        return {
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            source: img,
            release: () => URL.revokeObjectURL(url),
        };
    } catch (err) {
        URL.revokeObjectURL(url);
        throw err;
    }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Image processing timed out')), ms);
        p.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                reject(e);
            }
        );
    });
}

/**
 * Downscale + compress an image file to a JPEG. Falls back to the original
 * file's bytes if anything goes wrong (e.g. unsupported format / iOS stall),
 * so capture never breaks.
 */
export async function compressImage(
    file: File,
    maxDim: number = DEFAULT_MAX_DIM,
    quality: number = DEFAULT_QUALITY
): Promise<CompressedImage> {
    try {
        return await withTimeout(compressToJpeg(file, maxDim, quality), COMPRESS_TIMEOUT_MS);
    } catch {
        // Graceful fallback: use the original bytes untouched.
        const base64 = await blobToBase64(file);
        return { blob: file, base64, mimeType: file.type || 'image/jpeg' };
    }
}

async function compressToJpeg(
    file: File,
    maxDim: number,
    quality: number
): Promise<CompressedImage> {
    const decoded = await decodeDrawable(file);
    try {
        const longest = Math.max(decoded.width, decoded.height) || 1;
        const scale = longest > maxDim ? maxDim / longest : 1;
        const width = Math.max(1, Math.round(decoded.width * scale));
        const height = Math.max(1, Math.round(decoded.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        // White backdrop so transparent PNGs don't flatten to black in JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(decoded.source, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        // Synchronous encode — avoids the iOS canvas.toBlob() callback hang.
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        if (!base64) throw new Error('Canvas produced empty output');

        const blob = base64ToBlob(base64, mimeType);
        return { blob, base64, mimeType };
    } finally {
        decoded.release();
    }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Strip the "data:<mime>;base64," prefix.
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error('Failed to encode image'));
        reader.readAsDataURL(blob);
    });
}
