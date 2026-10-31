#!/usr/bin/env node
/**
 * Build the Chrome Web Store upload: a zip of only the files the extension
 * runs (manifest, _locales, icons, src), after checking the manifest the way
 * the store and the review will.
 *
 *   node extension/scripts/package.mjs                 check + zip the current version
 *   node extension/scripts/package.mjs --bump patch    raise the version first (minor, major too)
 *   node extension/scripts/package.mjs --set 1.2.0     set an exact version first
 *   node extension/scripts/package.mjs --check         check only (CI)
 *
 * Writes extension/dist/machina-chrome-<version>.zip (gitignored). Every
 * upload to the store needs a higher version than the last one.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED = ['manifest.json', '_locales', 'icons', 'src'];
const MANIFEST = join(ROOT, 'manifest.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

function fail(message) {
    console.error(`package: ${message}`);
    process.exit(1);
}

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

function bump(version, part) {
    const [major, minor, patch] = version.split('.').map(Number);
    if (part === 'major') return `${major + 1}.0.0`;
    if (part === 'minor') return `${major}.${minor + 1}.0`;
    if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
    return fail(`--bump takes patch, minor or major, not "${part}"`);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
let version = manifest.version;
if (value('--bump')) version = bump(version, value('--bump'));
if (value('--set')) version = value('--set');
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`version "${version}" must look like 1.2.3`);

// --- the checks the store and its review apply -----------------------------
const messages = JSON.parse(readFileSync(join(ROOT, '_locales/en/messages.json'), 'utf8'));
const msg = (field) => {
    const m = /^__MSG_(\w+)__$/.exec(field);
    return m ? messages[m[1]]?.message : field;
};
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.key) fail('remove the development "key" before uploading');
if (manifest.host_permissions?.length) fail('no host_permissions: saves rely on share_ingest CORS');
if (JSON.stringify(manifest).match(/localhost|127\.0\.0\.1/)) fail('the manifest names a local origin');
if (!msg(manifest.name) || msg(manifest.name).length > 75) fail('name missing or over 75 characters');
if (!msg(manifest.description) || msg(manifest.description).length > 132) fail('summary missing or over 132 characters');
for (const r of [...Object.values(manifest.icons), manifest.action.default_popup, manifest.background.service_worker,
    manifest.options_ui.page, ...manifest.content_scripts.flatMap((c) => c.js)]) {
    if (!existsSync(join(ROOT, r))) fail(`manifest names ${r}, which doesn't exist`);
}
const files = SHIPPED.flatMap((p) => (statSync(join(ROOT, p)).isDirectory() ? walk(join(ROOT, p)) : [join(ROOT, p)]))
    .map((p) => relative(ROOT, p))
    .filter((p) => !p.endsWith('.DS_Store'));
for (const p of files.filter((f) => f.endsWith('.js'))) {
    const s = readFileSync(join(ROOT, p), 'utf8');
    if (/import\s*\(?[^;\n]*['"]https?:/.test(s) || /\beval\s*\(|new Function\s*\(/.test(s)) fail(`${p}: remote or string code`);
}
const size = files.reduce((n, p) => n + statSync(join(ROOT, p)).size, 0);
console.log(`package: ${files.length} files, ${(size / 1024).toFixed(0)} KB, version ${version}`);
if (flag('--check')) process.exit(0);

// --- write the zip ---------------------------------------------------------
if (version !== manifest.version) {
    manifest.version = version;
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`package: manifest version set to ${version}`);
}
const dist = join(ROOT, 'dist');
mkdirSync(dist, { recursive: true });
const zip = join(dist, `machina-chrome-${version}.zip`);
rmSync(zip, { force: true });
// -X: no extra file attributes; -D: no directory entries; stable order.
execFileSync('zip', ['-q', '-X', '-D', zip, ...files.sort()], { cwd: ROOT, stdio: 'inherit' });
console.log(`package: wrote ${relative(join(ROOT, '..'), zip)}`);
