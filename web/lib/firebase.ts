import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

// Firebase web config is NOT secret — it ships in the client bundle by design
// (security is enforced by Firestore/Storage rules, not by hiding these values).
// Env vars take precedence (so any environment can override), but we fall back
// to the project's public config so a build never fails when .env.local is
// absent — e.g. the static export built by deploy-hosting.sh on a fresh machine.
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD4Mu3eIQ6QL-nBPfcef-vQhB5yNOyxbnQ",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "secondbrain-app-94da2.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "secondbrain-app-94da2",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "secondbrain-app-94da2.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "436841308497",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:436841308497:web:fc17a945da8e6af38c7370"
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
