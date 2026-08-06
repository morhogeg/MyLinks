'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/components/AuthProvider';

/**
 * Routes that must be readable WITHOUT signing in. App Store Connect requires
 * the privacy-policy URL (and by extension the terms page) to be publicly
 * accessible — AuthProvider would otherwise swap them for the LoginScreen
 * after hydration. These pages use no auth context, so skipping the provider
 * is safe; every other route keeps the exact existing gating.
 *
 * `/welcome` is the landing page's static twin. The root shows the same page to
 * signed-out web visitors, but only after `AuthProvider` resolves — so the
 * root's prerendered HTML is the boot shell. Listing it here means the marketing
 * copy is in the shipped markup and the URL makes NO auth call at all, which is
 * what a crawler, a JS-less fetch, or a reviewer checking the claim actually
 * gets. See `components/LandingPage.tsx`.
 */
const PUBLIC_ROUTES = ['/privacy', '/terms', '/welcome'];

export function AuthGate({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? '';
    const isPublic = PUBLIC_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
    if (isPublic) return <>{children}</>;
    return <AuthProvider>{children}</AuthProvider>;
}
