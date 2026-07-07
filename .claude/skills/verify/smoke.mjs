#!/usr/bin/env node
// Smoke-drive a Machina page in a real browser and fail on any console error.
//
// Usage:
//   node .claude/skills/verify/smoke.mjs <baseUrl> [path] [--wait-selector=<sel>]
//
// Exits non-zero (and prints the errors) if the page logs any console error or
// throws a page exception, so it can gate a ship. Screenshots to the scratchpad.
//
// Uses the globally-available Playwright + the pre-installed Chromium
// (PLAYWRIGHT_BROWSERS_PATH is set in web sessions) — no `playwright install`.

import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Resolve Playwright whether it's a repo dependency OR only installed globally
// (in web sessions it's global, alongside the pre-installed Chromium).
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const { execSync } = require('node:child_process');
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(require.resolve('playwright', { paths: [globalRoot] })));
}

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) || 'http://localhost:3000';
const path = args.filter((a) => !a.startsWith('--'))[1] || '/';
const waitArg = args.find((a) => a.startsWith('--wait-selector='));
const waitSelector = waitArg ? waitArg.split('=')[1] : null;
const url = new URL(path, base).toString();

// Benign noise to ignore (extend as real, safe warnings surface).
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /Firebase.*emulator/i, // emulator connection notices in local dev
];

const errors = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone-ish
const page = await ctx.newPage();

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (IGNORE.some((re) => re.test(text))) return;
  errors.push(`console.error: ${text}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

let ok = true;
try {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  if (!resp || resp.status() >= 400) {
    errors.push(`HTTP ${resp ? resp.status() : 'no response'} for ${url}`);
  }
  if (waitSelector) {
    await page.waitForSelector(waitSelector, { timeout: 15000 });
  }
  await page.waitForTimeout(1500); // let post-hydration effects settle
} catch (e) {
  ok = false;
  errors.push(`navigation: ${e.message}`);
}

const dir = mkdtempSync(join(tmpdir(), 'machina-smoke-'));
const shot = join(dir, 'smoke.png');
try {
  await page.screenshot({ path: shot, fullPage: true });
} catch {}

await browser.close();

if (errors.length || !ok) {
  console.error(`\n❌ SMOKE FAILED for ${url}`);
  for (const e of errors) console.error('   - ' + e);
  console.error(`   screenshot: ${shot}\n`);
  process.exit(1);
}
console.log(`\n✅ SMOKE OK for ${url} — zero console errors.`);
console.log(`   screenshot: ${shot}\n`);
