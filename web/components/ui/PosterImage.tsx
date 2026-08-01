'use client';

import { useState } from 'react';
import { posterWithoutPlayBadge } from '@/lib/instagramPoster';

/**
 * A scraped poster image (video banner / social-post cover), rendered without
 * the play triangle Instagram's CDN bakes into reel thumbnails — see
 * lib/instagramPoster.
 *
 * Falls back to the URL exactly as stored the moment the rewritten one fails to
 * load, so a CDN that refuses an edited transform list costs one re-render
 * rather than a missing picture. Posters with no such transform (YouTube, photo
 * covers, bridge-served images) render untouched and never take this path.
 */
export default function PosterImage({
    src,
    alt = '',
    className,
    loading,
}: {
    src: string;
    alt?: string;
    className?: string;
    loading?: 'lazy' | 'eager';
}) {
    const cleaned = posterWithoutPlayBadge(src);
    const [fellBack, setFellBack] = useState(false);
    // One card's failed rewrite must not condemn the next: the detail modal
    // reuses this instance as you walk related cards. Reset on a new src, as a
    // render-time state adjustment (React discards this pass and re-renders)
    // rather than an effect — same pattern as the modal's broken-image reset.
    const [srcSeen, setSrcSeen] = useState(src);
    if (srcSeen !== src) {
        setSrcSeen(src);
        setFellBack(false);
    }
    return (
        <img
            // The `error` event can fire BEFORE React attaches onError — a
            // server-rendered <img> starts loading as the HTML is parsed, and a
            // failure that lands pre-hydration is never delivered to the
            // handler (proven in Chromium: the rewritten URL 500'd and the
            // fallback never ran). A ref that inspects the element on attach
            // catches exactly that case: a decoded-but-zero-width image is one
            // that already failed. `complete` is false for a load still in
            // flight, so a healthy image never trips this.
            ref={(el) => {
                if (el && !fellBack && el.complete && el.naturalWidth === 0) setFellBack(true);
            }}
            src={cleaned && !fellBack ? cleaned : src}
            alt={alt}
            loading={loading}
            className={className}
            onError={() => setFellBack(true)}
        />
    );
}
