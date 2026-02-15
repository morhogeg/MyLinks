import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

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
