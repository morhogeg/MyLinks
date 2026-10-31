/**
 * A small in-memory stand-in for the chrome.* APIs the extension uses, for
 * the Node unit tests (node --test). Real-browser behavior is covered by the
 * Playwright suite in e2e/extension.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MESSAGES = JSON.parse(readFileSync(join(ROOT, '_locales/en/messages.json'), 'utf8'));
export const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

/** chrome.i18n.getMessage, including $PLACEHOLDER$ → $1 substitution. */
export function getMessage(key, subs) {
    const entry = MESSAGES[key];
    if (!entry) return '';
    const list = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    let text = entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (whole, name) => {
        const ph = entry.placeholders?.[name.toLowerCase()];
        return ph ? ph.content : whole;
    });
    text = text.replace(/\$(\d)/g, (_, n) => String(list[Number(n) - 1] ?? ''));
    return text.replace(/\$\$/g, '$');
}

function event() {
    const listeners = [];
    return {
        listeners,
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
        hasListener: (fn) => listeners.includes(fn),
        async dispatch(...args) {
            return Promise.all(listeners.map((fn) => fn(...args)));
        },
    };
}

/**
 * Install a fresh fake on globalThis.chrome and return it with handles for
 * assertions: `store` (storage.local contents), `alarmMap`, `menus`, `badge`,
 * `created` (tabs opened), `scripting` (stub executeScript), `captures`.
 */
export function installFakeChrome({ id = 'abcdefghijklmnopabcdefghijklmnop' } = {}) {
    const store = {};
    const alarmMap = new Map();
    const menus = [];
    const badge = { text: {}, color: {}, textColor: null, title: {} };
    const created = [];
    const scriptCalls = [];
    const fake = {
        store, alarmMap, menus, badge, created, scriptCalls,
        executeScript: async () => [{ result: null }],
        captureVisibleTab: async () => { throw new Error('no capture in this test'); },
        tabsById: new Map(),
        accessLevel: null,
        runtime: {
            id,
            lastError: undefined,
            getURL: (p = '') => `chrome-extension://${id}/${p}`,
            getManifest: () => MANIFEST,
            getPlatformInfo: (cb) => cb?.({ os: 'linux' }),
            sendMessage: async () => undefined,
            openOptionsPage: async () => undefined,
            onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(),
        },
        i18n: { getMessage },
        storage: {
            local: {
                async get(keys) {
                    const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
                    const out = {};
                    for (const k of list) if (k in store) out[k] = structuredClone(store[k]);
                    return out;
                },
                async set(obj) {
                    for (const [k, v] of Object.entries(obj)) store[k] = structuredClone(v);
                },
                async remove(keys) {
                    for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
                },
                async setAccessLevel(opts) {
                    fake.accessLevel = opts;
                },
            },
            onChanged: event(),
        },
        alarms: {
            async create(name, info) { alarmMap.set(name, info); },
            async clear(name) { return alarmMap.delete(name); },
            async get(name) { return alarmMap.get(name); },
            onAlarm: event(),
        },
        action: {
            async setBadgeText({ tabId, text }) { badge.text[tabId ?? 'global'] = text; },
            async setBadgeBackgroundColor({ tabId, color }) { badge.color[tabId ?? 'global'] = color; },
            async setBadgeTextColor({ color }) { badge.textColor = color; },
            async setTitle({ tabId, title }) { badge.title[tabId ?? 'global'] = title; },
        },
        contextMenus: {
            async removeAll() { menus.length = 0; },
            create(item) {
                if (menus.some((m) => m.id === item.id)) throw new Error(`Cannot create item with duplicate id ${item.id}`);
                menus.push(item);
            },
            onClicked: event(),
        },
        commands: {
            async getAll() {
                return Object.entries(MANIFEST.commands).map(([name, c]) => ({
                    name, description: name === '_execute_action' ? '' : c.description, shortcut: c.suggested_key.default,
                }));
            },
            onCommand: event(),
        },
        tabs: {
            async create(info) { created.push(info); return { id: 999, ...info }; },
            async get(tabId) {
                if (!fake.tabsById.has(tabId)) throw new Error(`No tab with id: ${tabId}`);
                return fake.tabsById.get(tabId);
            },
            async query() { return [...fake.tabsById.values()]; },
            captureVisibleTab: (...args) => fake.captureVisibleTab(...args),
        },
        scripting: {
            executeScript: (details) => {
                scriptCalls.push(details);
                return fake.executeScript(details);
            },
        },
    };
    globalThis.chrome = fake;
    return fake;
}

/**
 * Replace global fetch with a scripted one. `reply(call)` returns
 * {status, body} or throws; calls are recorded with parsed JSON bodies.
 */
export function stubFetch(reply) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        const call = { url: String(url), init, headers: { ...(init.headers || {}) }, body: init.body ? JSON.parse(init.body) : undefined };
        calls.push(call);
        if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        const out = await reply(call);
        return new Response(out.raw ?? JSON.stringify(out.body ?? {}), {
            status: out.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    return { calls, restore: () => { globalThis.fetch = original; } };
}

/** navigator.onLine for the duration of a test. */
export function setOnline(value) {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: value }, configurable: true, writable: true });
}
