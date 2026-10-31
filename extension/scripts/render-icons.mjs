#!/usr/bin/env node
/**
 * Render the extension's PNG icons from the app's own mark
 * (web/public/icon.svg: the graphite tile and porcelain brackets), so the
 * extension never drifts from the brand.
 *
 *   node extension/scripts/render-icons.mjs
 *
 * Sizes: 16, 24, 32 fill the frame (toolbar and favicon use); 48 and 128
 * carry transparent padding, and 128 follows the Chrome Web Store rule of
 * 96×96 artwork inside 16 px of padding.
 *
 * Needs Playwright's Chromium (preinstalled in cloud sessions; elsewhere
 * `npm i -D playwright && npx playwright install chromium`).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const svg = readFileSync(join(root, 'web/public/icon.svg'), 'utf8');
const outDir = join(root, 'extension/icons');
mkdirSync(outDir, { recursive: true });

// size: canvas, art: the drawn tile inside it
const ICONS = [
    { size: 16, art: 16 },
    { size: 24, art: 24 },
    { size: 32, art: 32 },
    { size: 48, art: 40 },
    { size: 128, art: 96 },
];

function loadPlaywright() {
    const require = createRequire(import.meta.url);
    try {
        return require('playwright');
    } catch {
        return require(require.resolve('playwright', { paths: [join(root, 'e2e'), '/opt/node-tools'] }));
    }
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    for (const { size, art } of ICONS) {
        const pad = (size - art) / 2;
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(
            `<html><body style="margin:0;background:transparent">
             <img src="${src}" width="${art}" height="${art}" style="display:block;margin:${pad}px"></body></html>`,
        );
        await page.locator('img').evaluate((img) => img.decode());
        const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
        writeFileSync(join(outDir, `icon-${size}.png`), png);
        console.log(`icons/icon-${size}.png (${art}px art)`);
    }
} finally {
    await browser.close();
}
