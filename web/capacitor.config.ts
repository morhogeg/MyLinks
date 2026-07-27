import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.morhogeg.machina',
  appName: 'Machina',
  // Next.js static export lands here (see next.config.ts: output "export").
  webDir: 'out',
  plugins: {
    // Native Google + Sign in with Apple. skipNativeAuth: the plugin only
    // returns an OAuth credential (it does NOT keep a separate native Firebase
    // session); lib/auth.ts bridges that credential into the Firebase JS SDK,
    // which stays the single source of truth. See NATIVE_AUTH_SETUP.md for the
    // required Firebase Console / Apple Developer / Xcode configuration.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['apple.com', 'google.com'],
    },
  },
};

export default config;
