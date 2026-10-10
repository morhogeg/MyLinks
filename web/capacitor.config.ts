import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.morhogeg.machina',
  appName: 'Machina',
  // Next.js static export lands here (see next.config.ts: output "export").
  webDir: 'out',
  ios: {
    // The WKWebView's background before the first paint. Config only takes one
    // fixed color, so MainViewController.viewDidLoad replaces it with the
    // adaptive LaunchBackground asset (light #F9FAFB / dark #050505, the
    // `--background` tokens in app/globals.css). This value only covers the
    // instant before that runs; keep it equal to the dark token.
    backgroundColor: '#050505',
  },
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
