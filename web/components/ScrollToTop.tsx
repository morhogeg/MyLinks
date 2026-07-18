'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * A subtle "back to top" button that fades in once the Home feed has scrolled
 * down a screenful, for users with long libraries. The feed scrolls the
 * document, so it watches window scroll and smooth-scrolls to the top. On
 * mobile it's especially useful once the bottom bar has scrolled away (the Home
 * tab isn't reachable then). `enabled` scopes it to the Home feed — the only
 * view that window-scrolls — so it never lingers over Collections/Digest/Ask.
 */
export default function ScrollToTop({ enabled = true }: { enabled?: boolean }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const onScroll = () => setShow(window.scrollY > 700);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    if (!show || !enabled) return null;

    return (
        <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
            title="Back to top"
            className="flex fixed bottom-20 sm:bottom-24 right-4 sm:right-6 z-40 w-9 h-9 rounded-full bg-card/70 backdrop-blur border border-border-subtle/60 text-text-muted items-center justify-center hover:text-text hover:bg-card/90 shadow-sm transition-colors animate-in fade-in duration-200 cursor-pointer"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
            <ArrowUp className="w-[18px] h-[18px]" />
        </button>
    );
}
