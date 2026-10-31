import { defineConfig } from '@playwright/test';

/**
 * The browser extension in real Chromium (e2e/extension/): each test
 * launches its own persistent context with a patched copy of extension/
 * loaded and a stub share_ingest on a random port (see extension/fixtures.ts).
 * No emulators, no dev server.
 *
 *   npm run test:extension      the suite
 *   npm run extension:assets    also regenerate extension/store/ images
 */
export default defineConfig({
    testDir: './extension',
    timeout: 60_000,
    expect: { timeout: 10_000 },
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: { trace: 'retain-on-failure' },
});
