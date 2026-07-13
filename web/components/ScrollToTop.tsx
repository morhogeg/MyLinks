'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * A subtle "back to top" button that fades in once the page has scrolled down a
 * screenful, for users with long libraries. The feed scrolls the document, so it
 * watches window scroll and smooth-scrolls to the top. Sits just above the
 * Add-link FAB on the right.
 */
export default function ScrollToTop() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const onScroll = () => setShow(window.scrollY > 700);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    if (!show) return null;

    return (
        <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
            title="Back to top"
            className="fixed bottom-24 right-4 sm:right-6 z-40 w-9 h-9 rounded-full bg-card/60 backdrop-blur border border-border-subtle/60 text-text-muted flex items-center justify-center hover:text-text hover:bg-card/90 transition-colors animate-in fade-in duration-200 cursor-pointer"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
            <ArrowUp className="w-[18px] h-[18px]" />
        </button>
    );
}
