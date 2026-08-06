'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft } from 'lucide-react';
import LoginScreen from '@/components/LoginScreen';

/**
 * The landing page is code-split, and that is not an optimisation detail.
 *
 * `SignedOutWeb` is reached from `AuthProvider`, which is in the app's main
 * bundle — so a static `import` of `LandingPage` would pull every landing scene,
 * its demo library and its motion CSS into the **iOS bundle**, for a page the
 * native app is specifically written never to render. `next/dynamic` keeps the
 * whole thing in its own chunk that only a signed-out web visitor ever fetches.
 *
 * `ssr: false` is correct rather than merely convenient: the scenes read
 * `matchMedia` and measure scroll, so there is nothing useful to prerender at
 * this mount point. The prerendered-prose requirement is met by `/welcome`,
 * which imports `LandingPage` statically for exactly that reason.
 *
 * The fallback is the page's own ground rather than a spinner — the chunk is
 * same-origin and small, and a flash of empty background reads as the page
 * still painting, where a spinner reads as something being fetched.
 */
const LandingPage = dynamic(() => import('@/components/LandingPage'), {
    ssr: false,
    loading: () => <div className="min-h-screen bg-background" />,
});

/**
 * What a signed-out WEB visitor gets at the root: the public landing page
 * first, the sign-in screen once they ask for it.
 *
 * Before this existed the root WAS the sign-in screen, which is exactly what
 * Google's OAuth branding review rejected ("your home page is behind a login
 * page") and what left App Review without a readable Support/Marketing URL.
 *
 * The toggle lives here, in a child, rather than in `AuthProvider` — that
 * component returns early from several branches, so a `useState` for this in
 * its body would sit above those returns and run on every render of the whole
 * app for a state only this screen uses.
 *
 * NATIVE NEVER MOUNTS THIS. The call site in `AuthProvider` gates it on
 * `!native`, so the Capacitor shell still shows `LoginScreen` and opens into
 * the app — see the comment there.
 */
export default function SignedOutWeb({
    onSignIn,
    showApple,
}: {
    onSignIn: (provider: 'google' | 'apple') => Promise<void>;
    showApple: boolean;
}) {
    const [signingIn, setSigningIn] = useState(false);

    if (signingIn) {
        // The back affordance is OVERLAID here rather than added to
        // LoginScreen: that component is shared with native and with the
        // restricted/error states, none of which have a landing page to go
        // back TO. Only this mount point does, so only this mount point
        // draws the way back (owner call, round 6 — sign-in was a dead end).
        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setSigningIn(false)}
                    className="absolute left-6 top-8 z-10 flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back
                </button>
                <LoginScreen onSignIn={onSignIn} showApple={showApple} />
            </div>
        );
    }
    return <LandingPage onGetStarted={() => setSigningIn(true)} />;
}
