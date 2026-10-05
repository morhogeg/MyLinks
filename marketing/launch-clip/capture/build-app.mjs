/**
 * Build the REAL app for capture.
 *
 *   node capture/build-app.mjs      →  out/capture/app/out  (a static export)
 *
 * The reel shows the shipped app, not a rebuilt mockup. This copies `web/`
 * verbatim into out/capture/app, adds nothing to it but `__capture__/` (the
 * Firebase shims + the demo library) and a next.config that points the five
 * `firebase/*` module names at those shims, then runs the same static-export
 * build the iOS app ships (`output: 'export'`, see web/next.config.ts).
 *
 * So every component, style, animation and piece of copy in a capture is the
 * app's own; only the backend is a stand-in. `web/` itself is never modified.
 * Run `npm ci` in web/ once first (its node_modules are hard-linked, not
 * reinstalled).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clip = path.join(here, '..');
const web = path.join(clip, '..', '..', 'web');
const app = path.join(clip, 'out', 'capture', 'app');

if (!fs.existsSync(path.join(web, 'node_modules', 'next'))) {
  console.error('web/node_modules is missing: run `npm ci` in web/ first.');
  process.exit(1);
}

// 1. a fresh copy of the app's source (never node_modules / build output / iOS)
const SKIP = new Set(['node_modules', '.next', 'out', 'ios', '.vercel']);
fs.rmSync(path.join(app, '.next'), { recursive: true, force: true });
fs.rmSync(path.join(app, 'out'), { recursive: true, force: true });
for (const name of fs.readdirSync(web)) {
  if (SKIP.has(name) || name.endsWith('.tsbuildinfo')) continue;
  fs.rmSync(path.join(app, name), { recursive: true, force: true });
  fs.cpSync(path.join(web, name), path.join(app, name), { recursive: true });
}

// 2. dependencies: hard links into web/node_modules (instant, no extra disk)
if (!fs.existsSync(path.join(app, 'node_modules'))) {
  execSync(`cp -al "${path.join(web, 'node_modules')}" "${path.join(app, 'node_modules')}"`);
}

// 3. the shims and the library they seed from
const cap = path.join(app, '__capture__');
fs.rmSync(cap, { recursive: true, force: true });
fs.mkdirSync(cap, { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'shims'))) fs.copyFileSync(path.join(here, 'shims', f), path.join(cap, f));
fs.copyFileSync(path.join(here, 'library.mjs'), path.join(cap, 'library.mjs'));

// 4. the one config change: firebase/* → the shims
fs.writeFileSync(
  path.join(app, 'next.config.ts'),
  `import path from 'node:path';
import type { NextConfig } from 'next';

// Written by marketing/launch-clip/capture/build-app.mjs. The real app's config
// (static export, unoptimized images) plus the capture aliases.
const alias: Record<string, string> = {
  'firebase/app': './__capture__/app.ts',
  'firebase/auth': './__capture__/auth.ts',
  'firebase/firestore': './__capture__/firestore.ts',
  'firebase/functions': './__capture__/functions.ts',
  'firebase/storage': './__capture__/storage.ts',
};

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // the shims are loosely typed on purpose; the app itself is type-checked by
  // its own build, not this one
  typescript: { ignoreBuildErrors: true },
  turbopack: { root: process.cwd(), resolveAlias: alias },
  webpack: (config) => {
    for (const [k, v] of Object.entries(alias)) config.resolve.alias[k + '$'] = path.resolve(process.cwd(), v);
    return config;
  },
};

export default nextConfig;
`,
);

// 5. the same static export the iOS app ships
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'capture',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'capture.local',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'capture',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'capture',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'capture',
};
delete env.NEXT_PUBLIC_API_BASE;
delete env.NEXT_PUBLIC_REQUIRE_AUTH;
delete env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
delete env.VERCEL;
execSync('npx next build', { cwd: app, env, stdio: 'inherit' });
console.log(`\nbuilt ${path.relative(clip, path.join(app, 'out'))}`);
