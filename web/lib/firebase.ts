import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator } from "firebase/auth";

// Inside the native iOS shell (Capacitor) the page is served from
// capacitor://localhost. Firestore's default WebChannel transport fails to
// establish over that custom scheme inside WKWebView and hangs every read, so
// we force long-polling there. Plain browsers keep the default transport.
//
// Detection mirrors api.ts's isNativeApp(): do NOT treat the mere presence of
// window.Capacitor as native — @capacitor/core defines that global in a plain
// browser too. The authoritative signals are the capacitor:// origin and the
// runtime's own isNativePlatform(). Replicated inline (not imported) so this
// low-level module stays dependency-free and safe to evaluate at import time.
const isCapacitor = typeof window !== 'undefined'
    && (window.location.protocol === 'capacitor:'
        || (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
            .Capacitor?.isNativePlatform?.() === true);

// Firebase web config comes from NEXT_PUBLIC_* env vars (Vercel has them; local
// builds read web/.env.local). These values aren't secret — they ship in the
// client bundle — but we keep them out of source so GitHub secret scanning
// doesn't flag the apiKey pattern.
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore.
//
// localCache: persistentLocalCache() switches the SDK from memory-only to
// IndexedDB-backed persistence, so a relaunch reads cached docs instead of
// re-fetching the whole library over the network every time. Single-tab
// manager (rather than multi-tab) matches this app: the native shell is a
// single WebView, and it avoids the extra cross-tab coordination overhead.
//
// The WebView fix (experimentalForceLongPolling on Capacitor) is preserved and
// coexists with the cache in this SDK version — both are plain
// initializeFirestore settings.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
    ...(isCapacitor ? { experimentalForceLongPolling: true } : {}),
});

// Initialize Auth WITHOUT a popup/redirect resolver. getAuth() eagerly loads
// Google's gapi iframe (apis.google.com/js/api.js) to check for redirect
// sign-in results; that script throws under Capacitor's capacitor:// WKWebView
// origin and aborts app startup (the React bundle never hydrates). We don't use
// popup/redirect auth anywhere, so omitting the resolver skips loading gapi
// entirely — harmless on the web, and it unblocks the iOS app.
export const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

// Initialize Storage
import { getStorage, connectStorageEmulator } from "firebase/storage";
export const storage = getStorage(app);

// Initialize Functions
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
export const functions = getFunctions(app);

// Initialize App Check (browser only). Attests that calls to the paid backend
// endpoints come from the real app. Requires a reCAPTCHA v3 site key registered
// under Firebase Console → App Check, supplied via NEXT_PUBLIC_RECAPTCHA_SITE_KEY.
// When the key is absent (e.g. local dev) App Check is skipped and the backend
// runs in soft mode, so nothing breaks.
import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";

let appCheck: AppCheck | null = null;
if (typeof window !== 'undefined') {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (siteKey) {
        appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true,
        });
    }
}

/** Fetch a fresh App Check token, or null if App Check isn't configured. */
export async function getAppCheckToken(): Promise<string | null> {
    if (!appCheck) return null;
    try {
        const result = await getToken(appCheck, false);
        return result.token;
    } catch (e) {
        console.warn('App Check token fetch failed', e);
        return null;
    }
}

/** Headers object carrying the App Check token (empty when unavailable). */
export async function appCheckHeaders(): Promise<Record<string, string>> {
    const token = await getAppCheckToken();
    return token ? { 'X-Firebase-AppCheck': token } : {};
}

// Connect to emulators on localhost
import { connectFirestoreEmulator } from "firebase/firestore";

// Only the real local dev server (http://localhost:3000) should hit the
// emulators. The bundled iOS app (Capacitor) also serves from "localhost" but
// over the capacitor:// scheme — gating on http: keeps it on the prod backend.
if (typeof window !== 'undefined'
    && window.location.hostname === 'localhost'
    && window.location.protocol === 'http:') {
    console.log('Detected localhost, connecting to Firebase Emulators...');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    // AUTH_PHASE_1: Connect Auth emulator
    connectAuthEmulator(auth, "http://localhost:9099");
}
