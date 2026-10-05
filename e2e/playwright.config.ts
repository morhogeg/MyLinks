import { defineConfig, devices } from '@playwright/test';

/**
 * Runs the real Next.js app (web/) in dev mode against the local emulators.
 * `npm test` wraps this in `firebase emulators:exec`, which starts Auth +
 * Firestore (with the live rules) first. The app's own emulator gate
 * (lib/firebase.ts) connects to them because the origin is http://localhost.
 *
 * The Firebase project is overridden to `demo-machina`: a demo- project can
 * only ever talk to emulators, so a misrouted request can't reach prod.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    // Each test makes its own users, so tests don't share data; one worker
    // keeps the dev server's on-demand compiles from fighting each other.
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        // The app is iPhone-first; Chromium at iPhone size is the closest
        // headless stand-in for the WKWebView (not a substitute for device QA).
        { name: 'iphone', use: { ...devices['iPhone 14'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
        { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grep: /@desktop/ },
    ],
    webServer: {
        command: `npx next dev -p ${PORT}`,
        cwd: '../web',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-machina',
            NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-machina.appspot.com',
            NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
            NEXT_PUBLIC_FIREBASE_APP_ID: '1:0:web:e2e',
            NEXT_PUBLIC_REQUIRE_AUTH: 'true',
            NEXT_PUBLIC_RECAPTCHA_SITE_KEY: '',
            NEXT_PUBLIC_API_BASE: '',
        },
    },
});
