// Build the Chrome Web Store upload: `node extension/scripts/package.mjs`.
//
//   node extension/scripts/package.mjs                 package the current version
//   node extension/scripts/package.mjs --bump patch    1.2.0 -> 1.2.1, then package
//   node extension/scripts/package.mjs --bump minor    (or major)
//   node extension/scripts/package.mjs --set 1.3.0     set an exact version
//   node extension/scripts/package.mjs --check         verify only, write nothing
//
// Output (gitignored):
//   extension/dist/machina-extension/            the unpacked store build
//   extension/dist/machina-extension-<v>.zip     upload this to the dashboard
//
// The store build differs from the folder you "Load unpacked" in one way:
// the connect content script runs on https origins only. A local dev server
// must never be able to hand a published extension a token. (A "key", if
// one is ever added for a fixed dev id, is dropped too: the store refuses it.)
// Only the files the extension actually runs are copied. Tests, scripts,
// icon sources and store assets stay out. Zero dependencies.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateRawSync } from 'zlib';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(EXT, 'dist');
const STAGE = join(DIST, 'machina-extension');

// Everything that ships. A file not listed here is not in the upload.
const SHIPPED = [
    'manifest.json',
    'background.js',
    'shared.js',
    'connect.js',
    'popup.html',
    'popup.css',
    'popup.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'icons/toolbar16.png',
    'icons/toolbar24.png',
    'icons/toolbar32.png',
];

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : (args[i + 1] ?? '');
};
const checkOnly = args.includes('--check');

function fail(msg) {
    console.error(`package: ${msg}`);
    process.exit(1);
}

// ── Version ────────────────────────────────────────────────────────────────
// Chrome wants 1 to 4 dot-separated integers, each 0..65535, and every upload
// must be higher than the last one.
const VERSION_RE = /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/;
const manifestPath = join(EXT, 'manifest.json');
const manifestText = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
let version = manifest.version;

const bump = flag('--bump');
const set = flag('--set');
if (bump !== null || set !== null) {
    if (checkOnly) fail('--check cannot change the version');
    if (set !== null) {
        if (!VERSION_RE.test(set)) fail(`"${set}" is not a Chrome version (1 to 4 numbers, like 1.3.0)`);
        version = set;
    } else {
        const parts = version.split('.').map(Number);
        while (parts.length < 3) parts.push(0);
        if (bump === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
        else if (bump === 'minor') { parts[1]++; parts[2] = 0; }
        else if (bump === 'patch') { parts[2]++; }
        else fail(`--bump takes major, minor, or patch, not "${bump}"`);
        version = parts.slice(0, 3).join('.');
    }
    // Rewrite only the version line, so the file keeps its formatting.
    const next = manifestText.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
    writeFileSync(manifestPath, next);
    manifest.version = version;
    console.log(`version ${version}`);
}
if (!VERSION_RE.test(version) || version.split('.').some((n) => Number(n) > 65535)) fail(`manifest version "${version}" is not valid`);

// ── Checks ─────────────────────────────────────────────────────────────────
for (const f of SHIPPED) {
    if (!existsSync(join(EXT, f))) fail(`missing ${f}`);
}
// Every file the manifest or the popup points at must ship.
const referenced = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page.split('?')[0],
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...(manifest.content_scripts || []).flatMap((c) => c.js || []),
]);
for (const m of readFileSync(join(EXT, 'popup.html'), 'utf8').matchAll(/(?:src|href)="([^"#:]+)"/g)) referenced.add(m[1]);
for (const m of readFileSync(join(EXT, 'background.js'), 'utf8').matchAll(/importScripts\("([^"]+)"\)/g)) referenced.add(m[1]);
for (const m of readFileSync(join(EXT, 'background.js'), 'utf8').matchAll(/getURL\("([^"]+)"\)/g)) referenced.add(m[1]);
for (const r of referenced) {
    if (!SHIPPED.includes(r)) fail(`${r} is used but not in SHIPPED`);
}
// House rule: no em dashes in anything a user can read.
for (const f of SHIPPED.filter((x) => !x.endsWith('.png'))) {
    const text = readFileSync(join(EXT, f), 'utf8');
    const line = text.split('\n').findIndex((l) => l.includes('—'));
    if (line !== -1) fail(`em dash in ${f} line ${line + 1}`);
}

// ── The store manifest ─────────────────────────────────────────────────────
const storeManifest = JSON.parse(JSON.stringify(manifest));
delete storeManifest.key;
for (const cs of storeManifest.content_scripts || []) {
    cs.matches = cs.matches.filter((m) => m.startsWith('https://'));
    if (!cs.matches.length) fail('a content script has no https origin left');
}
if (storeManifest.host_permissions) storeManifest.host_permissions = storeManifest.host_permissions.filter((m) => m.startsWith('https://'));
if (JSON.stringify(storeManifest).includes('localhost') || JSON.stringify(storeManifest).includes('127.0.0.1')) fail('store manifest still mentions a local origin');

if (checkOnly) {
    console.log(`package check ok: version ${version}, ${SHIPPED.length} files`);
    process.exit(0);
}

// ── Stage ──────────────────────────────────────────────────────────────────
rmSync(STAGE, { recursive: true, force: true });
const entries = [];
for (const f of SHIPPED) {
    const data = f === 'manifest.json'
        ? Buffer.from(JSON.stringify(storeManifest, null, 2) + '\n')
        : readFileSync(join(EXT, f));
    mkdirSync(dirname(join(STAGE, f)), { recursive: true });
    writeFileSync(join(STAGE, f), data);
    entries.push({ name: f, data });
}

// ── Zip (store-only writer: deflate, fixed timestamps, no extra fields) ────
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
// 2024-01-01 00:00, so the same source always zips to the same bytes.
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const centrals = [];
let offset = 0;
for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const zipPath = join(DIST, `machina-extension-${version}.zip`);
writeFileSync(zipPath, Buffer.concat([...locals, ...centrals, end]));

console.log(`staged ${entries.length} files in ${STAGE}`);
console.log(`wrote ${zipPath} (${(statSync(zipPath).size / 1024).toFixed(1)} KB)`);
console.log('upload that zip in the Chrome Web Store dashboard (Package, Upload new package).');
