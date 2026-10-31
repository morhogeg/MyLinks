/**
 * The real browser extension (extension/) in Chromium, against a stub
 * share_ingest on a random local port. No emulators, no dev server.
 *
 * Test-only changes, made to a COPY of the extension, never to extension/:
 *   - src/lib/config.js points saves at the stub, and the connect bridge at
 *     `appOrigin` (the stub's own fixture page, or the real web app in
 *     tests/10-browser-extension.spec.ts);
 *   - the manifest lets the bridge run there, lets the CSP reach the stub,
 *     and grants <all_urls> so the tests can do what a toolbar click's
 *     activeTab grant allows (read the page, capture it) without a toolbar;
 *   - the popup honors ?tab=<id> (it is opened as a page, not from the toolbar);
 *   - the service worker exposes its menu and shortcut handlers on
 *     globalThis.__machina (native menus and shortcuts can't be pressed here).
 */
import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const EXTENSION_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
export const GOOD_TOKEN = 'e2e_GoodToken_1234567890abc';
export const ACCOUNT = 'e2e@example.com';

export interface ShareCall { headers: IncomingMessage['headers']; body: Record<string, unknown> }
export type Reply = { status: number; body: unknown };

/** Pages the stub serves for the tests to save (the article also backs the store images). */
export const ARTICLE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>The quiet power of spaced review</title>
<meta property="og:title" content="The quiet power of spaced review">
<meta property="og:description" content="Why reading something three times, days apart, beats reading it once.">
<style>body{font:18px/1.6 Georgia,serif;max-width:720px;margin:48px auto;padding:0 24px;color:#1f2937;background:#fbfaf7}
h1{font:700 40px/1.15 -apple-system,Segoe UI,sans-serif;letter-spacing:-.02em;margin:0 0 8px}
.by{font:14px -apple-system,Segoe UI,sans-serif;color:#6b7280;margin-bottom:32px}
@media (prefers-color-scheme: dark){body{color:#e5e7eb;background:#111214}.by{color:#9ca3af}}</style></head>
<body><article><h1>The quiet power of spaced review</h1>
<p class="by">Field notes · 6 min read</p>
<p id="lede">Most of what we read is gone within a week. Not because it was dull, but because we met it once and never again.</p>
<p id="quote">Coming back to an idea after a day, then a week, then a month turns a passing thought into something you can actually use.</p>
<p>The trick is not effort. It is timing: a short look, at the moment you were about to forget.</p>
</article></body></html>`;

/** The web app's connect protocol (web/lib/extension.ts), as a bare page. */
const CONNECT_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Machina (stub)</title></head>
<body><h1>Machina stub</h1><script>
const FROM_PAGE = 'machina-web', FROM_EXT = 'machina-extension';
let seq = 0;
function ask(type, payload, ms) {
  const id = String(++seq);
  return new Promise((resolve) => {
    const done = (v) => { clearTimeout(timer); removeEventListener('message', on); resolve(v); };
    const on = (e) => { if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data; if (!d || d.source !== FROM_EXT || d.id !== id) return; done(d.reply ?? null); };
    const timer = setTimeout(() => done(null), ms);
    addEventListener('message', on);
    postMessage({ source: FROM_PAGE, id, type, ...payload }, location.origin);
  });
}
async function tokenTag(token) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('machina-ext:' + token)));
  return Array.from(d.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}
window.ready = false;
addEventListener('message', (e) => { if (e.source === window && e.data && e.data.source === FROM_EXT && e.data.type === 'machina-ready') window.ready = true; });
window.machina = {
  ping: () => ask('machina-ping', {}, 2000),
  connect: (token, account) => ask('machina-connect', { token, account }, 20000),
  disconnect: async (token) => ask('machina-disconnect', { tokenTag: await tokenTag(token) }, 2000),
  tokenTag,
};
</script></body></html>`;

export class Stub {
    calls: ShareCall[] = [];
    /** Default: an empty body is the token check (400, like the real server). */
    reply: (call: ShareCall) => Reply = (call) => (Object.keys(call.body).length === 0
        ? { status: 400, body: { success: false, error: 'No URL or text found in shared content' } }
        : { status: 200, body: { success: true, queued: true, id: 'q1' } });
    /** Drop connections without answering (a network failure). */
    down = false;
    server!: Server;
    origin = '';

    async start() {
        this.server = createServer((req, res) => this.handle(req, res));
        await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
        const addr = this.server.address();
        this.origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    }

    stop() {
        return new Promise<void>((r) => this.server.close(() => r()));
    }

    shareCalls() {
        return this.calls.filter((c) => Object.keys(c.body).length > 0);
    }

    private handle(req: IncomingMessage, res: ServerResponse) {
        const path = (req.url ?? '/').split('?')[0];
        if (path === '/api/share') {
            if (this.down) {
                req.socket.destroy();
                return;
            }
            // What share_ingest sends an extension origin (functions/main.py _cors_headers).
            const cors = {
                'Access-Control-Allow-Origin': String(req.headers.origin ?? '*'),
                'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Token',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                Vary: 'Origin',
            };
            if (req.method === 'OPTIONS') {
                res.writeHead(204, cors);
                res.end();
                return;
            }
            let raw = '';
            req.on('data', (c) => { raw += c; });
            req.on('end', () => {
                let body: Record<string, unknown> = {};
                try { body = JSON.parse(raw || '{}'); } catch { /* keep {} */ }
                const call = { headers: req.headers, body };
                this.calls.push(call);
                const out = this.reply(call);
                res.writeHead(out.status, { ...cors, 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out.body));
            });
            return;
        }
        // `/s/…` stands in for the public share pages, which must not be able to connect.
        const pages: Record<string, string> = { '/': CONNECT_PAGE, '/article': ARTICLE, '/s/abc123': CONNECT_PAGE };
        if (pages[path] !== undefined) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pages[path]);
            return;
        }
        res.writeHead(404);
        res.end();
    }
}

function patch(file: string, from: string, to: string) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes(from)) throw new Error(`fixtures: ${file} no longer contains the text this harness patches:\n${from}`);
    writeFileSync(file, src.replace(from, to));
}

/** A patched copy of extension/ (see the header). */
export function prepareExtension(opts: { shareEndpoint: string; appOrigin: string }) {
    const dir = mkdtempSync(join(tmpdir(), 'machina-ext-'));
    cpSync(EXTENSION_SRC, dir, { recursive: true });

    writeFileSync(join(dir, 'src/lib/config.js'), `// e2e copy (e2e/extension/fixtures.ts)
export const APP_ORIGIN = ${JSON.stringify(opts.appOrigin)};
export const SHARE_ENDPOINT = ${JSON.stringify(opts.shareEndpoint)};
export const APP_URL = \`\${APP_ORIGIN}/\`;
export const CONNECT_URL = \`\${APP_ORIGIN}/?connect=extension\`;
export const SETTINGS_URL = \`\${APP_ORIGIN}/?settings=extension\`;
export const PRIVACY_URL = \`\${APP_ORIGIN}/privacy\`;
export const BRIDGE_ORIGINS = [APP_ORIGIN];
`);

    const manifestPath = join(dir, 'manifest.json');
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const app = new URL(opts.appOrigin);
    m.content_scripts[0].matches = [`${app.protocol}//${app.hostname}/*`];
    m.content_security_policy.extension_pages = m.content_security_policy.extension_pages
        .replace('connect-src https://mymachina.app', `connect-src ${new URL(opts.shareEndpoint).origin}`);
    m.host_permissions = ['<all_urls>'];
    writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    patch(join(dir, 'src/popup/popup.js'),
        'const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });',
        `const __tab = new URLSearchParams(location.search).get('tab');
    const [tab] = __tab ? [await chrome.tabs.get(Number(__tab))] : await chrome.tabs.query({ active: true, currentWindow: true });`);

    const bg = join(dir, 'src/background.js');
    writeFileSync(bg, `${readFileSync(bg, 'utf8')}
// e2e only
globalThis.__machina = { onMenuClick, onCommand, flushQueue, createMenus };
`);
    return dir;
}

export interface Ext {
    context: BrowserContext;
    worker: Worker;
    id: string;
    stub: Stub;
    storage: () => Promise<Record<string, any>>;
    connect: (token?: string, account?: string) => Promise<void>;
    tabIdOf: (page: Page) => Promise<number>;
    openPopup: (target: Page, opts?: { colorScheme?: 'light' | 'dark' }) => Promise<Page>;
    openPopupForTab: (tabId: number, opts?: { colorScheme?: 'light' | 'dark' }) => Promise<Page>;
    close: () => Promise<void>;
}

/**
 * Launch Chromium with the patched extension. `appOrigin` defaults to the
 * stub (its `/` page speaks the connect protocol).
 */
export async function launchExtension(opts: { appOrigin?: string } = {}): Promise<Ext> {
    const stub = new Stub();
    await stub.start();
    const dir = prepareExtension({ shareEndpoint: `${stub.origin}/api/share`, appOrigin: opts.appOrigin ?? stub.origin });
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'machina-profile-')), {
        channel: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;

    const ext: Ext = {
        context, worker, id, stub,
        storage: () => worker.evaluate(() => chrome.storage.local.get(null)),
        async connect(token = GOOD_TOKEN, account = ACCOUNT) {
            await worker.evaluate(([t, a]) => chrome.storage.local.set({ token: t, account: a, needsReconnect: false }), [token, account]);
        },
        async tabIdOf(page) {
            const url = page.url();
            const id = await worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
            if (typeof id !== 'number') throw new Error(`no tab for ${url}`);
            return id;
        },
        /**
         * The popup, opened in its own window for `target`, so `target` stays
         * the visible tab of its window (screenshots capture the visible tab).
         */
        async openPopup(target, opts) {
            return ext.openPopupForTab(await ext.tabIdOf(target), opts);
        },
        async openPopupForTab(tabId, { colorScheme = 'light' } = {}) {
            const url = `chrome-extension://${id}/src/popup/popup.html?tab=${tabId}`;
            const [popup] = await Promise.all([
                context.waitForEvent('page', (p) => p.url().startsWith(`chrome-extension://${id}/src/popup/`)),
                worker.evaluate((u) => chrome.windows.create({ url: u, width: 380, height: 640, focused: false }), url),
            ]);
            await popup.emulateMedia({ colorScheme });
            return popup;
        },
        async close() {
            await context.close();
            await stub.stop();
        },
    };
    return ext;
}
