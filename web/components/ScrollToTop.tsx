'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * A subtle "back to top" button that fades in once the page has scrolled down a
 * screenful, for users with long libraries. The feed scrolls the document, so it
 * watches window scroll and smooth-scrolls to the top. Sits bottom-left, opposite
 * the Add-link FAB.
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
            className="fixed bottom-6 left-4 sm:left-6 z-40 w-11 h-11 rounded-full bg-card/90 backdrop-blur border border-border-subtle text-text-secondary shadow-lg flex items-center justify-center hover:text-text hover:border-accent/40 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-200 cursor-pointer"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
            <ArrowUp className="w-5 h-5" />
        </button>
    );
}
