import { defineConfig } from '@playwright/test';

/**
 * The browser extension in real Chromium (e2e/extension/): each test launches
 * its own persistent context with extension/ loaded and a stub share_ingest
 * on a random local port. No emulators, no web dev server, so none of the
 * shared E2E ports (8080, 9099, 3100) are touched.
 *
 *   npm run test:extension
 *   npm run extension:assets    regenerate extension/store/ screenshots
 */
export default defineConfig({
    testDir: './extension',
    timeout: 60_000,
    expect: { timeout: 10_000 },
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    // Store assets only when asked for (they overwrite committed PNGs).
    grepInvert: process.env.STORE_ASSETS ? undefined : /@assets/,
    grep: process.env.STORE_ASSETS ? /@assets/ : undefined,
});
