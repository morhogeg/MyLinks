'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft } from 'lucide-react';
import LoginScreen from '@/components/LoginScreen';

/**
 * The landing page is code-split so the app's MAIN bundle stays lean:
 * `SignedOutWeb` is reached from `AuthProvider`, which every signed-in session
 * loads — a static `import` of `LandingPage` would put every landing scene in
 * that critical path. `next/dynamic` keeps it in its own chunk, fetched only
 * when someone is actually signed out. (Since round 14 native renders the
 * landing too, so the chunk legitimately rides in the iOS bundle now.)
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
 * Since round 14 (owner call) NATIVE mounts this too: a signed-out iPhone —
 * fresh install, or just signed out — sees the same landing page as the web,
 * with the same one-click path into LoginScreen. A signed-in user on either
 * platform never sees it. The `next/dynamic` split below still matters on the
 * web (the app's main bundle stays lean); on native the chunk loads from the
 * local bundle, so the split costs nothing there.
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
