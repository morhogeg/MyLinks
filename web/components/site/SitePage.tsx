import type { ReactNode } from 'react';
import { Header, Footer } from '@/components/landing/chrome';
import { CINEMATIC_LANDING } from '@/components/landing/motion';
import '@/components/landing/landing.css';

/**
 * The frame every public page other than the landing page sits in (blog,
 * FAQ): the landing page's own header and footer on the same ground, so a
 * reader who arrives from search sees the same site they'd see at the root.
 * `mx-cine` only switches on the header's sticky glass bar here; nothing in
 * these pages uses the landing's entrance motion, so the text is visible on
 * the first paint and in the prerendered HTML.
 */
export default function SitePage({ children }: { children: ReactNode }) {
    return (
        <div className={`min-h-screen bg-background text-text ${CINEMATIC_LANDING ? 'mx-cine' : ''}`}>
            <Header homeHref="/" />
            <main>{children}</main>
            <Footer />
        </div>
    );
}
