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
 */
const PUBLIC_ROUTES = ['/privacy', '/terms'];

export function AuthGate({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? '';
    const isPublic = PUBLIC_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
    if (isPublic) return <>{children}</>;
    return <AuthProvider>{children}</AuthProvider>;
}
