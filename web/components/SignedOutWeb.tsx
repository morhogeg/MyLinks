'use client';

import { useState } from 'react';
import LandingPage from '@/components/LandingPage';
import LoginScreen from '@/components/LoginScreen';

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
        return <LoginScreen onSignIn={onSignIn} showApple={showApple} />;
    }
    return <LandingPage onGetStarted={() => setSigningIn(true)} />;
}
