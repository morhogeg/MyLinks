// Client-side image downscaling/compression.
//
// Screenshots straight from a phone are often 5–12 MP. Sending the full-res
// file means a slow upload AND slow Gemini vision processing. Downscaling to a
// ~1600px longest edge at JPEG ~0.85 keeps text crisp enough for OCR while
// cutting payload size (and latency) dramatically.

export interface CompressedImage {
    /** Compressed image as a Blob, for uploading to storage. */
    blob: Blob;
    /** Base64 (no data: prefix), for sending inline to the analyze endpoint. */
    base64: string;
    /** MIME type of the compressed output. */
    mimeType: string;
}

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_QUALITY = 0.85;

function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = src;
    });
}

/**
 * Downscale + compress an image file. Falls back to the original file's bytes
 * if anything goes wrong (e.g. unsupported format), so capture never breaks.
 */
export async function compressImage(
    file: File,
    maxDim: number = DEFAULT_MAX_DIM,
    quality: number = DEFAULT_QUALITY
): Promise<CompressedImage> {
    try {
        const dataUrl = await readAsDataURL(file);
        const img = await loadImage(dataUrl);

        const longest = Math.max(img.width, img.height);
        const scale = longest > maxDim ? maxDim / longest : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        // White backdrop so transparent PNGs don't flatten to black in JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const blob: Blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
                mimeType,
                quality
            );
        });

        const base64 = await blobToBase64(blob);
        return { blob, base64, mimeType };
    } catch {
        // Graceful fallback: use the original bytes untouched.
        const base64 = await blobToBase64(file);
        return { blob: file, base64, mimeType: file.type || 'image/jpeg' };
    }
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
