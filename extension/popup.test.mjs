// Headless load-test for popup.js: `node extension/popup.test.mjs`.
//
// There is no browser in a cloud session, so this stubs the few DOM + chrome
// APIs the popup touches, seeds the element ids straight out of popup.html (so
// a renamed id fails loudly instead of silently breaking the popup), drives the
// real handlers, and asserts the copy a user actually reads. Zero dependencies.
//
// It exercises the wiring, NOT the browser: it cannot prove the extension loads
// in Chrome, and every network call is a double.
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const DIR = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(`${DIR}/popup.html`, 'utf8');
const src = readFileSync(`${DIR}/popup.js`, 'utf8');

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const listeners = new Map(); // "id:event" -> fn

function makeEl(id) {
    return {
        id,
        className: '',
        textContent: '',
        value: '',
        type: id === 'token' ? 'password' : undefined,
        placeholder: '',
        disabled: false,
        classList: {
            add(c) { const s = new Set(this._el.className.split(' ').filter(Boolean)); s.add(c); this._el.className = [...s].join(' '); },
            remove(c) { const s = new Set(this._el.className.split(' ').filter(Boolean)); s.delete(c); this._el.className = [...s].join(' '); },
            contains(c) { return this._el.className.split(' ').includes(c); },
        },
        addEventListener(ev, fn) { listeners.set(`${id}:${ev}`, fn); },
    };
}

const els = new Map(ids.map((id) => {
    const el = makeEl(id);
    el.classList._el = el;
    return [id, el];
}));

// Storage + messaging doubles.
const store = {};
let messageHandler = async () => ({ ok: true });
const chrome = {
    storage: { sync: {
        get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]]).filter(([, v]) => v !== undefined)),
        set: async (obj) => { Object.assign(store, obj); },
    } },
    runtime: {
        lastError: undefined,
        sendMessage: (msg, cb) => { Promise.resolve(messageHandler(msg)).then(cb); },
    },
};

const documentListeners = new Map();
const documentStub = {
    getElementById: (id) => {
        const el = els.get(id);
        if (!el) throw new Error(`popup.js asked for #${id}, which popup.html does not define`);
        return el;
    },
    addEventListener: (ev, fn) => documentListeners.set(ev, fn),
};

vm.runInNewContext(src, { document: documentStub, chrome, console, Promise, setTimeout });

const $ = (id) => els.get(id);
const tick = () => new Promise((r) => setTimeout(r, 0));
const fire = async (id, ev = 'click') => { await listeners.get(`${id}:${ev}`)({ key: 'Enter' }); };

let failures = 0;
function check(name, cond, detail) {
    if (cond) { console.log(`  ok   ${name}`); } else { failures++; console.log(`  FAIL ${name} ${detail ?? ''}`); }
}

// ── 1. First run: no token stored ────────────────────────────────────────────
await documentListeners.get('DOMContentLoaded')();
await tick();
check('first run shows the paste prompt', $('banner').textContent === 'Paste your Machina token to start saving.', $('banner').textContent);
check('first run banner is visible', !$('banner').classList.contains('hidden'));
check('first run hides the connection chip', $('conn').className.includes('hidden'), $('conn').className);
check('backend placeholder defaults', $('baseUrl').placeholder === 'https://secondbrain-app-94da2.web.app');

// ── 2. Save with an empty field ──────────────────────────────────────────────
await fire('save');
await tick();
check('empty save is refused', $('status').textContent === 'Paste your token first.' && $('status').className.includes('err'), $('status').textContent);
check('empty save keeps the chip hidden', $('conn').className.includes('hidden'));

// ── 3. Paste a good token ────────────────────────────────────────────────────
let seen = [];
messageHandler = async (msg) => { seen.push(msg.type); return { ok: true, message: 'Connected.' }; };
$('token').value = '  good-token  ';
await fire('save');
await tick();
check('token is trimmed into storage', store.token === 'good-token', JSON.stringify(store));
check('validation ran', seen.includes('test-connection'), seen.join());
check('chip says Connected', $('connText').textContent === 'Connected' && $('conn').className === 'conn ok', $('conn').className + ' / ' + $('connText').textContent);
check('paste banner is gone', $('banner').classList.contains('hidden'));
check('save button re-enabled', $('save').disabled === false);

// ── 4. Reopen with a stored token: it re-validates ───────────────────────────
seen = [];
messageHandler = async (msg) => { seen.push(msg.type); return { ok: false, message: 'Invalid token, double-check it.' }; };
await documentListeners.get('DOMContentLoaded')();
await tick();
check('reopen loads the stored token', $('token').value === 'good-token');
check('reopen re-validates', seen.includes('test-connection'));
check('a rejected token shows the reason', $('connText').textContent === 'Invalid token, double-check it.' && $('conn').className === 'conn err', $('conn').className);

// ── 5. Reveal toggle ─────────────────────────────────────────────────────────
await fire('reveal');
check('reveal shows the token', $('token').type === 'text' && $('reveal').textContent === 'Hide');
await fire('reveal');
check('reveal toggles back', $('token').type === 'password' && $('reveal').textContent === 'Show');

// ── 6. Save this page: duplicate, error and bad-url paths ────────────────────
messageHandler = async () => ({ ok: true, body: { duplicate: true } });
await fire('saveTab');
await tick();
check('duplicate reads as already saved', $('status').textContent === 'Already saved ✓', $('status').textContent);

messageHandler = async () => ({ ok: false, error: 'bad-url' });
await fire('saveTab');
await tick();
check('unsavable page is explained', $('status').textContent === "This page can't be saved.", $('status').textContent);

messageHandler = async () => ({ ok: false, status: 403 });
await fire('saveTab');
await tick();
check('403 flips the chip to invalid', $('conn').className === 'conn err' && $('connText').textContent === 'Invalid token, check it above.', $('connText').textContent);

// ── 7. Enter in the token field is the same as the button ────────────────────
messageHandler = async () => ({ ok: true });
$('token').value = 'second-token';
await fire('token', 'keydown');
await tick();
check('Enter saves and connects', store.token === 'second-token' && $('conn').className === 'conn ok', JSON.stringify(store));

// ── 8. Every string a user reads is em-dash free ─────────────────────────────
for (const f of ['popup.js', 'popup.html', 'popup.css', 'background.js', 'manifest.json', 'README.md']) {
    const body = readFileSync(`${DIR}/${f}`, 'utf8');
    const bad = body.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('—'));
    check(`${f} has no em dashes`, bad.length === 0, bad.map(([n]) => `line ${n}`).join(', '));
}

console.log(failures === 0 ? '\nAll popup checks passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
