/**
 * Load the real extension (extension/) into a Chromium persistent context,
 * with a stub share_ingest and a couple of plain web pages to save.
 *
 * Two test-only changes to a COPY of the extension, never to extension/:
 *   - host permission for the stub server (http://127.0.0.1/*, plus the
 *     made-up hosts of the store screenshots), so the popup,
 *     opened as a tab with `?tab=<id>`, can read the target tab's URL and
 *     title the way a real toolbar click grants through activeTab;
 *   - nothing else. The pinned dev `key` stays, so the id matches
 *     web/lib/extension.ts EXTENSION_DEV_ID.
 * The extension's storage points `baseUrl` at the stub, which answers with
 * permissive CORS like a server would for an allowed origin.
 */
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const EXTENSION_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
export const DEV_ID = 'gjegndcjhemlpeoiamfebeoaeegkelnk';
export const GOOD_TOKEN = 'e2e_GoodToken_1234567890abc';

export interface ShareCall { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }
type Reply = { status: number; body: unknown };

export class Stub {
    calls: ShareCall[] = [];
    reply: (call: ShareCall) => Reply = (call) => (Object.keys(call.body).length === 0
        ? { status: 400, body: { success: false, error: 'No URL or text found in shared content' } }
        : { status: 200, body: { success: true, queued: true, id: 'q1', url: call.body.url } });
    pages = new Map<string, string>();
    server!: Server;
    origin = '';

    async start() {
        this.server = createServer((req, res) => this.handle(req, res));
        await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
        const addr = this.server.address();
        this.origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    }

    private handle(req: IncomingMessage, res: ServerResponse) {
        const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Token',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
        };
        const path = (req.url ?? '/').split('?')[0];
        if (path === '/api/share') {
            if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
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
        const html = this.pages.get(path);
        res.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html ?? '<!doctype html><title>Not found</title>');
    }

    saves() { return this.calls.filter((c) => Object.keys(c.body).length > 0); }

    async stop() { await new Promise((r) => this.server.close(r)); }
}

function extensionCopy(): string {
    const dir = mkdtempSync(join(tmpdir(), 'machina-ext-'));
    cpSync(EXTENSION_SRC, dir, { recursive: true, filter: (p) => !p.includes(`${EXTENSION_SRC}/dist`) && !p.includes(`${EXTENSION_SRC}/store`) });
    const mf = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    // + the made-up hosts the store screenshots use (store-assets.spec.ts).
    mf.host_permissions = [...mf.host_permissions, 'http://127.0.0.1/*', 'https://fieldnotes.example/*', 'https://yoman.example/*'];
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(mf, null, 2));
    return dir;
}

export interface Ext {
    context: BrowserContext;
    worker: Worker;
    id: string;
    stub: Stub;
    /** Store a token (and point the extension at the stub). */
    connect(token?: string): Promise<void>;
    /** Open a stub page in a tab; returns the page and its tab id. */
    openPage(path: string, html: string): Promise<{ page: Page; tabId: number }>;
    /** Open the popup aimed at a tab, the way a toolbar click would. */
    openPopup(tabId?: number, opts?: { colorScheme?: 'light' | 'dark'; search?: string }): Promise<Page>;
    storage(): Promise<Record<string, unknown>>;
}

export async function launchExtension(): Promise<Ext> {
    const stub = new Stub();
    await stub.start();
    const dir = extensionCopy();
    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: !process.env.HEADED,
        viewport: { width: 1280, height: 800 },
        args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    });
    // The first-install tab and any "Open Machina" click land on the real web
    // app; keep them off the network.
    await context.route('https://mymachina.app/**', (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: '<!doctype html><title>Machina</title><p>Machina web app (stub)</p>',
    }));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;

    const ext: Ext = {
        context, worker, id, stub,
        async connect(token = GOOD_TOKEN) {
            await worker.evaluate(([t, b]) => chrome.storage.local.set({ token: t, baseUrl: b, account: 'reader@example.com' }), [token, stub.origin] as const);
        },
        async openPage(path, html) {
            stub.pages.set(path, html);
            const page = await context.newPage();
            await page.goto(`${stub.origin}${path}`);
            const tabId = await worker.evaluate(async (url) => {
                const tabs = await chrome.tabs.query({ url });
                return tabs[0]?.id ?? -1;
            }, `${stub.origin}${path}`);
            return { page, tabId };
        },
        async openPopup(tabId, opts = {}) {
            const page = await context.newPage();
            await page.setViewportSize({ width: 340, height: 600 });
            if (opts.colorScheme) await page.emulateMedia({ colorScheme: opts.colorScheme });
            const q = opts.search ?? (tabId ? `?tab=${tabId}` : '');
            await page.goto(`chrome-extension://${id}/popup.html${q}`);
            return page;
        },
        async storage() {
            return worker.evaluate(() => chrome.storage.local.get(null));
        },
    };
    return ext;
}

export const test = base.extend<{ ext: Ext }>({
    // eslint-disable-next-line no-empty-pattern
    ext: async ({}, use) => {
        const ext = await launchExtension();
        await use(ext);
        await ext.context.close();
        await ext.stub.stop();
    },
});

export { expect } from '@playwright/test';

export function article(title: string, body: string, lang = 'en', dir = 'ltr'): string {
    return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${title}</title></head>`
        + `<body style="font-family:Georgia,serif;max-width:680px;margin:40px auto;line-height:1.6"><h1>${title}</h1>${body}</body></html>`;
}

declare const chrome: {
    storage: { local: { set(o: object): Promise<void>; get(k: null): Promise<Record<string, unknown>> } };
    tabs: { query(q: object): Promise<Array<{ id?: number }>> };
};
