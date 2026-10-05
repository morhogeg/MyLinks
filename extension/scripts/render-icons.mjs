// Render the extension's PNG icons from the SVG sources in icons-src/.
//
//   node extension/scripts/render-icons.mjs
//
// Uses the Playwright Chromium that e2e/ already installs (cd e2e && npm ci &&
// npx playwright install chromium). Output is committed, so this only needs
// to run when the artwork changes.
import { createRequire } from 'module';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(EXT, '..', 'e2e', 'package.json'));
const { chromium } = require('playwright');

const svg = (name) => 'data:image/svg+xml;base64,' + readFileSync(join(EXT, 'icons-src', name)).toString('base64');
const TILE = svg('tile.svg');
const TILE16 = svg('tile16.svg');

// [file, canvas size, artwork size, source]. The store icon keeps Chrome's
// recommended 16px of transparent padding around a 96px mark.
const JOBS = [
    ['icons/toolbar16.png', 16, 16, TILE16],
    ['icons/toolbar24.png', 24, 24, TILE],
    ['icons/toolbar32.png', 32, 32, TILE],
    ['icons/icon16.png', 16, 16, TILE16],
    ['icons/icon32.png', 32, 32, TILE],
    ['icons/icon48.png', 48, 44, TILE],
    ['icons/icon128.png', 128, 96, TILE],
    ['store/icon128.png', 128, 96, TILE],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, canvas, art, src] of JOBS) {
    await page.setViewportSize({ width: canvas, height: canvas });
    const pad = (canvas - art) / 2;
    await page.setContent(
        `<html><body style="margin:0;background:transparent">` +
        `<img src="${src}" width="${art}" height="${art}" style="position:absolute;left:${pad}px;top:${pad}px;display:block">` +
        `</body></html>`,
    );
    await page.waitForFunction(() => document.images[0].complete);
    mkdirSync(dirname(join(EXT, file)), { recursive: true });
    await page.screenshot({ path: join(EXT, file), omitBackground: true, clip: { x: 0, y: 0, width: canvas, height: canvas } });
    console.log(`wrote ${file} (${canvas}px)`);
}
await browser.close();
