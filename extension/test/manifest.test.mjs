/**
 * Store-policy and house-rule checks that are cheap to automate: the exact
 * permission set, no remote code, every referenced file present, every
 * string localized, listing limits, and the copy rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST as M, MESSAGES } from './fake-chrome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}
const SRC = walk(join(ROOT, 'src'));
const code = SRC.filter((p) => /\.(js|html|css)$/.test(p)).map((p) => ({ p: relative(ROOT, p), s: readFileSync(p, 'utf8') }));
const msg = (key) => MESSAGES[key]?.message;

test('Manifest V3 with exactly the planned permissions', () => {
    assert.equal(M.manifest_version, 3);
    assert.deepEqual([...M.permissions].sort(), ['activeTab', 'alarms', 'contextMenus', 'scripting', 'storage']);
    for (const key of ['host_permissions', 'optional_host_permissions', 'optional_permissions', 'externally_connectable',
        'web_accessible_resources', 'key', 'update_url', 'oauth2']) {
        assert.equal(M[key], undefined, `no ${key}`);
    }
    assert.equal(M.content_scripts.length, 1);
    assert.deepEqual(M.content_scripts[0].matches, ['https://mymachina.app/*']);
    assert.equal(M.content_scripts[0].all_frames, false);
    assert.equal(M.background.type, 'module');
    assert.equal(M.background.scripts, undefined, 'no MV2-style background scripts');
    assert.equal(M.minimum_chrome_version, '140', 'storage.local.setAccessLevel needs Chrome 140');
    assert.match(M.version, /^\d+\.\d+\.\d+$/);
});

test('Content Security Policy: no inline, no eval, no remote scripts; saves go to one host', () => {
    const csp = M.content_security_policy.extension_pages;
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /connect-src https:\/\/mymachina\.app(;|$)/);
    assert.doesNotMatch(csp, /unsafe-(inline|eval)|https?:\/\/(?!mymachina\.app)[^\s;]*\s*;?\s*script/);
});

test('no remote code, no HTML injection, no eval', () => {
    for (const { p, s } of code) {
        assert.doesNotMatch(s, /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/, `${p}: builds DOM with nodes`);
        assert.doesNotMatch(s, /\beval\s*\(|new Function\s*\(|setTimeout\(\s*['"`]/, `${p}: no string code`);
        assert.doesNotMatch(s, /import\s*\(?[^;\n]*['"]https?:/, `${p}: imports are packaged`);
        assert.doesNotMatch(s, /<script[^>]+src=["']https?:/i, `${p}: scripts are packaged`);
        if (p.endsWith('.html')) {
            assert.doesNotMatch(s, /<script(?![^>]*\bsrc=)[^>]*>/i, `${p}: no inline <script>`);
            assert.doesNotMatch(s, /\son[a-z]+\s*=/i, `${p}: no inline handlers`);
            assert.doesNotMatch(s, /\sstyle\s*=/i, `${p}: no inline styles`);
        }
    }
});

test('every file the manifest names exists', () => {
    const refs = [
        ...Object.values(M.icons), ...Object.values(M.action.default_icon), M.action.default_popup,
        M.background.service_worker, M.options_ui.page, ...M.content_scripts.flatMap((c) => c.js),
        `_locales/${M.default_locale}/messages.json`,
    ];
    for (const r of refs) assert.ok(existsSync(join(ROOT, r)), r);
    for (const [size, path] of Object.entries(M.icons)) {
        const png = readFileSync(join(ROOT, path));
        assert.equal(png.readUInt32BE(16), Number(size), `${path} width`);
        assert.equal(png.readUInt32BE(20), Number(size), `${path} height`);
    }
});

test('listing limits: name ≤ 75, short name ≤ 12, summary ≤ 132, ≤ 4 shortcuts', () => {
    for (const field of ['name', 'short_name', 'description']) assert.match(M[field], /^__MSG_\w+__$/, `${field} is localized`);
    assert.ok(msg('extName').length <= 75, msg('extName'));
    assert.ok(msg('extShortName').length <= 12);
    assert.ok(msg('extDescription').length <= 132, `${msg('extDescription').length} chars`);
    assert.ok(msg('extName').startsWith('Machina'), 'brand first (D-1)');
    const suggested = Object.values(M.commands).filter((c) => c.suggested_key).length;
    assert.ok(suggested <= 4);
    for (const c of Object.values(M.commands)) {
        for (const keys of Object.values(c.suggested_key)) assert.doesNotMatch(keys, /Ctrl\+Alt|Alt\+Ctrl/, 'Chrome rejects Ctrl+Alt');
    }
});

test('every message key the code uses exists, and every key is used', () => {
    const used = new Set();
    const sources = [...code.map((c) => c.s), JSON.stringify(M)];
    for (const s of sources) {
        for (const m of s.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
        for (const m of s.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
        for (const m of s.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
        // Keys picked from tables: ['key'] / : 'key' values that name messages.
        for (const m of s.matchAll(/['"]([a-z][A-Za-z0-9]+)['"]/g)) if (MESSAGES[m[1]]) used.add(m[1]);
    }
    for (const key of used) if (!/^[a-z]+$/.test(key) || MESSAGES[key]) assert.ok(MESSAGES[key], `missing message ${key}`);
    const unused = Object.keys(MESSAGES).filter((k) => !used.has(k));
    assert.deepEqual(unused, [], 'unused messages');
});

test('copy rules: no em dashes, never "Machina AI", placeholders declared', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
        assert.doesNotMatch(entry.message, /—/, `${key}: no em dash`);
        assert.doesNotMatch(entry.message, /Machina AI/, `${key}: the name is Machina (D-1)`);
        for (const m of entry.message.matchAll(/\$([A-Z_]+)\$/g)) {
            assert.ok(entry.placeholders?.[m[1].toLowerCase()], `${key}: placeholder ${m[1]}`);
        }
    }
    for (const { p, s } of code.filter((c) => c.p.endsWith('.html'))) {
        assert.doesNotMatch(s, /—/, `${p}: no em dash`);
    }
});
