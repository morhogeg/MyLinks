/**
 * `firebase/auth` for the capture build: always signed in as the demo
 * account from the library. Only the functions the app calls are replaced;
 * the rest of the real SDK stays exported (the Capacitor auth plugin imports
 * names the app never uses).
 */
import { CAPTURE_USER } from './library.mjs';

export * from '@firebase/auth';

const user = {
  uid: CAPTURE_USER.uid,
  email: CAPTURE_USER.email,
  displayName: CAPTURE_USER.displayName,
  photoURL: null,
  phoneNumber: null,
  emailVerified: true,
  isAnonymous: false,
  providerId: 'firebase',
  tenantId: null,
  refreshToken: 'capture',
  providerData: [
    {
      providerId: 'google.com',
      uid: CAPTURE_USER.uid,
      email: CAPTURE_USER.email,
      displayName: CAPTURE_USER.displayName,
      photoURL: null,
      phoneNumber: null,
    },
  ],
  metadata: {
    creationTime: new Date(Date.now() - 400 * 86_400_000).toUTCString(),
    lastSignInTime: new Date().toUTCString(),
  },
  getIdToken: async () => 'capture-token',
  getIdTokenResult: async () => ({ token: 'capture-token', claims: {}, signInProvider: 'google.com' }),
  reload: async () => {},
  delete: async () => {},
  toJSON: () => ({ uid: CAPTURE_USER.uid }),
};

type Cb = ((u: unknown) => void) | { next?: (u: unknown) => void };
const fire = (cb: Cb) => {
  const t = setTimeout(() => (typeof cb === 'function' ? cb(user) : cb.next?.(user)), 0);
  return () => clearTimeout(t);
};

const auth = {
  app: { name: '[DEFAULT]', options: {} },
  name: '[DEFAULT]',
  currentUser: user,
  languageCode: 'en',
  onAuthStateChanged: (cb: Cb) => fire(cb),
  onIdTokenChanged: (cb: Cb) => fire(cb),
  authStateReady: async () => {},
  signOut: async () => {},
  useDeviceLanguage: () => {},
};

export const initializeAuth = () => auth;
export const getAuth = () => auth;
export const onAuthStateChanged = (_a: unknown, cb: Cb) => fire(cb);
export const onIdTokenChanged = (_a: unknown, cb: Cb) => fire(cb);
export const connectAuthEmulator = () => {};
export const signInWithPopup = async () => ({ user });
export const signInWithRedirect = async () => {};
export const signInWithCredential = async () => ({ user });
export const getRedirectResult = async () => null;
export const signOut = async () => {};
export const updateProfile = async () => {};
export const linkWithCredential = async () => ({ user });
export const linkWithPopup = async () => ({ user });
export const reauthenticateWithCredential = async () => ({ user });
export const reauthenticateWithPopup = async () => ({ user });
export const revokeAccessToken = async () => {};
export const fetchSignInMethodsForEmail = async () => ['google.com'];
