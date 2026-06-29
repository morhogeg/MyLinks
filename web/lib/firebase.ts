import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

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

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth - REVERSIBLE CHANGE (AUTH_PHASE_1)
// To revert: Comment out the line below and remove getAuth from imports
export const auth = getAuth(app);

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

if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    console.log('Detected localhost, connecting to Firebase Emulators...');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    // AUTH_PHASE_1: Connect Auth emulator
    connectAuthEmulator(auth, "http://localhost:9099");
}
