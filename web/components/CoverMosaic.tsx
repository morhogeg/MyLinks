/**
 * A collection's cover: up to 4 member thumbnails tiled into the cover band
 * (1 fills it, 2 split it, 3 = one tall beside two stacked, 4 = a 2×2 grid).
 * Render it inside a `relative` box with a fixed height; it fills that box.
 *
 * Each image sits absolutely inside its own cell. As a direct grid item, an
 * <img> with h-full rendered at its natural height in WKWebView (iOS
 * simulator, 2026-10-20): every cell showed the top of its picture, a YouTube
 * thumbnail's black letterbox bar included, and with three thumbnails the
 * third fell below the cover. A cell sized by the grid with the image
 * positioned inside it crops to the center the same way in every engine.
 */
export default function CoverMosaic({ thumbs, className = '' }: { thumbs: string[]; className?: string }) {
    const shown = thumbs.slice(0, 4);
    if (shown.length === 0) return null;
    const layout = shown.length >= 3
        ? 'grid-cols-2 grid-rows-2'
        : shown.length === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-1 grid-rows-1';
    return (
        <div className={`absolute inset-0 grid gap-px ${layout} ${className}`}>
            {shown.map((t, i) => (
                <div key={i} className={`relative overflow-hidden ${shown.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
                    <img src={t} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                </div>
            ))}
        </div>
    );
}
