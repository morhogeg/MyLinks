/**
 * Shared plumbing for the first-session journeys.
 *
 * Three layers, each as real as it can be without touching production:
 *   - Auth + Firestore: the local emulators, loaded with the LIVE
 *     `firestore.rules` (copied in by `pretest`). Every client read/write the
 *     app makes goes through the real ruleset.
 *   - "The server" (Admin SDK writes the Cloud Functions would make): done here
 *     over the emulator REST API with `Authorization: Bearer owner`, which
 *     bypasses rules exactly like the Admin SDK does.
 *   - Cloud Function HTTP endpoints (`/api/*`, callables on :5001): stubbed per
 *     test with Playwright routes. No Gemini, no cost, same answer every run.
 */
import { expect, type Page, type Route } from '@playwright/test';

export const PROJECT = 'demo-machina';
export const API_KEY = 'demo-key';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

// ── Emulator reset ────────────────────────────────────────────────────────

export async function resetEmulators() {
    await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
    await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface TestUser { uid: string; email: string; password: string }

let userSeq = 0;
export async function createAuthUser(label = 'user'): Promise<TestUser> {
    const email = `${label}-${Date.now()}-${userSeq++}@e2e.test`;
    const password = 'e2e-password-1';
    const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`auth signUp failed: ${JSON.stringify(body)}`);
    return { uid: body.localId, email, password };
}

/**
 * Hide test-environment chrome that would sit over the app's own bottom UI:
 * the Auth emulator's "Running in emulator mode" strip and the Next dev
 * indicator. Neither exists in a real build.
 */
export async function hideDevChrome(page: Page) {
    await page.addInitScript(() => {
        const css = '.firebase-emulator-warning, nextjs-portal { display: none !important; }';
        const add = () => {
            const s = document.createElement('style');
            s.textContent = css;
            document.head.appendChild(s);
        };
        if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    });
}

/** Sign in through the app's own Firebase Auth instance (lib/firebase.ts hook). */
export async function signIn(page: Page, user: TestUser) {
    await page.waitForFunction(() => Boolean((window as unknown as { __machinaE2E?: unknown }).__machinaE2E));
    await page.evaluate(
        ([e, p]) => (window as unknown as { __machinaE2E: { signIn: (a: string, b: string) => Promise<string> } })
            .__machinaE2E.signIn(e, p),
        [user.email, user.password] as const,
    );
}

// ── Firestore admin (rules bypassed, like the Admin SDK) ──────────────────

type FsValue = Record<string, unknown>;

function toValue(v: unknown): FsValue {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
    throw new Error(`unsupported value ${String(v)}`);
}

function toFields(obj: Record<string, unknown>): Record<string, FsValue> {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

function fromValue(v: FsValue): unknown {
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(fromValue);
    if ('mapValue' in v) return fromFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
    return undefined;
}

function fromFields(fields: Record<string, FsValue>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

/** Full overwrite (set without merge). */
export async function adminSet(path: string, data: Record<string, unknown>) {
    const res = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: toFields(data) }) });
    if (!res.ok) throw new Error(`adminSet ${path}: ${res.status} ${await res.text()}`);
}

/** Merge the given top-level fields (update). */
export async function adminUpdate(path: string, data: Record<string, unknown>) {
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res = await fetch(`${FS}/${path}?${mask}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: toFields(data) }) });
    if (!res.ok) throw new Error(`adminUpdate ${path}: ${res.status} ${await res.text()}`);
}

export async function adminGet(path: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${FS}/${path}`, { headers: ADMIN });
    if (res.status === 404) return null;
    const body = await res.json();
    return fromFields(body.fields ?? {});
}

export async function adminDelete(path: string) {
    await fetch(`${FS}/${path}`, { method: 'DELETE', headers: ADMIN });
}

export async function adminList(path: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const res = await fetch(`${FS}/${path}?pageSize=300`, { headers: ADMIN });
    const body = await res.json();
    return (body.documents ?? []).map((d: { name: string; fields?: Record<string, FsValue> }) => ({
        id: d.name.split('/').pop()!,
        data: fromFields(d.fields ?? {}),
    }));
}

// ── Seed shapes (mirror what the backend writes) ──────────────────────────

/** functions/link_service.create_workspace, minus the ingest token. */
export async function seedWorkspace(user: TestUser, extra: Record<string, unknown> = {}) {
    await adminSet(`users/${user.uid}`, {
        authUids: [user.uid],
        createdAt: Date.now(),
        onboarded: false,
        trialClockChecked: true,
        // create_workspace stamps link_service.GRAPH_VERSION (= the web's).
        graphVersion: 2,
        email: user.email,
        ...extra,
    });
}

/** A returning user: workspace exists, consent given, welcome dismissed. */
export async function seedReturningUser(user: TestUser) {
    await seedWorkspace(user, { onboarded: true, aiConsentAt: Date.now() - 86_400_000 });
}

let cardSeq = 0;
export function readyCard(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    const n = cardSeq++;
    return {
        url: `https://example.com/article-${n}`,
        title: `Seeded article ${n}`,
        summary: `A short summary for seeded article ${n}.`,
        tags: ['testing'],
        category: 'Technology',
        status: 'ready',
        sourceType: 'web',
        isRead: false,
        createdAt: Date.now() - n * 60_000,
        metadata: { originalTitle: `Seeded article ${n}`, estimatedReadTime: 3 },
        ...over,
    };
}

export async function seedCard(user: TestUser, id: string, card: Record<string, unknown>) {
    await adminSet(`users/${user.uid}/links/${id}`, card);
}

// ── Backend stubs ─────────────────────────────────────────────────────────

export interface ApiCall { path: string; method: string; body: unknown; auth: string | null }

export interface BackendOptions {
    /** What the workspace claim answers. 'create' mirrors claim_workspace for a new account. */
    claim?: 'create' | 'down';
    entitlement?: Record<string, unknown>;
    /** Override any /api/<path> handler; return undefined to fall through to the default. */
    handlers?: Record<string, (call: ApiCall, route: Route) => Promise<void> | void>;
}

export const TRIAL_ENTITLEMENT = {
    plan: 'pro', source: 'trial', proUntil: null, trialEndsAt: null, trialAnchorAt: null,
    trialAnchorCards: 10,
    quotas: { saves: { used: 0, limit: 1000 }, asks: { used: 0, limit: 1000 }, imports: { used: 0, limit: 500 } },
};

export const FREE_ENTITLEMENT = {
    plan: 'free', source: null, proUntil: null, trialEndsAt: null, trialAnchorAt: null,
    trialAnchorCards: 10,
    quotas: { saves: { used: 100, limit: 100 }, asks: { used: 0, limit: 20 }, imports: { used: 0, limit: 500 } },
};

/**
 * Install the fake backend on a page. Returns the log of every call so tests
 * can assert the app sent the right thing (e.g. a Bearer token, the card id).
 */
export async function installBackend(page: Page, user: TestUser | null, opts: BackendOptions = {}) {
    const calls: ApiCall[] = [];
    const claimMode = opts.claim ?? 'create';

    const record = (route: Route): ApiCall => {
        const req = route.request();
        let body: unknown = null;
        try { body = req.postDataJSON(); } catch { body = req.postData(); }
        const url = new URL(req.url());
        const call = { path: url.pathname, method: req.method(), body, auth: req.headers()['authorization'] ?? null };
        calls.push(call);
        return call;
    };

    // CORS headers: the callables live on another origin (:5001), and a
    // fulfilled response is still CORS-checked by the browser.
    const json = (route: Route, status: number, body: unknown) =>
        route.fulfill({
            status,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(body),
        });

    const doClaim = async (route: Route, callable: boolean) => {
        if (claimMode === 'down' || !user) return route.abort('connectionrefused');
        await seedWorkspace(user);
        const payload = { uid: user.uid, created: true };
        return json(route, 200, callable ? { result: payload } : payload);
    };

    // Callables (functions emulator port; nothing listens there).
    await page.route('http://localhost:5001/**', async (route) => {
        const call = record(route);
        if (route.request().method() === 'OPTIONS') {
            return route.fulfill({ status: 204, headers: {
                'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            } });
        }
        if (call.path.endsWith('/claim_workspace')) return doClaim(route, true);
        if (call.path.endsWith('/delete_account')) {
            // What delete_account does server-side: wipe the workspace, then the Auth user.
            if (user) {
                for (const sub of ['links', 'chats', 'collections']) {
                    for (const d of await adminList(`users/${user.uid}/${sub}`)) await adminDelete(`users/${user.uid}/${sub}/${d.id}`);
                }
                await adminDelete(`users/${user.uid}`);
            }
            return json(route, 200, { result: { ok: true } });
        }
        if (call.path.endsWith('/rebuild_connections')) {
            return json(route, 200, { result: { done: true, nextCursor: null, processed: 0, embedded: 0, updated: 0, skipped: 0, failed: 0 } });
        }
        if (call.path.endsWith('/get_share_config')) return json(route, 200, { result: { endpoint: '', token: 'tok' } });
        return json(route, 404, { error: { message: 'not stubbed', status: 'NOT_FOUND' } });
    });

    // HTTP endpoints. /api/chat has a real Next route on the web build that
    // proxies to the function, so it's intercepted here too.
    await page.route(/\/api\//, async (route) => {
        const call = record(route);
        const custom = opts.handlers?.[call.path];
        if (custom) return custom(call, route);
        switch (call.path) {
            case '/api/claim-workspace': return doClaim(route, false);
            case '/api/entitlement': return json(route, 200, opts.entitlement ?? TRIAL_ENTITLEMENT);
            case '/api/share': return json(route, 200, { success: true, queued: true });
            case '/api/search': return json(route, 200, { results: [] });
            case '/api/client-error': return json(route, 200, { ok: true });
            case '/api/share-config': return json(route, 200, { endpoint: '', token: 'tok' });
            case '/api/delete-account': return json(route, 200, { ok: true });
            case '/api/chat': return sseAnswer(route, 'Nothing in your library answers that yet.', []);
            default: return json(route, 404, { error: `not stubbed: ${call.path}` });
        }
    });
    return calls;
}

/** Answer an /api/chat request the way the web build receives it: an SSE stream. */
export function sseAnswer(route: Route, text: string, sources: Array<{ id: string; title: string; category?: string }>) {
    const events = [
        ...text.split(/(?<= )/).map((t) => ({ type: 'token', text: t })),
        { type: 'sources', sources },
        { type: 'done' },
    ];
    return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
    });
}

// ── Page-health guards ────────────────────────────────────────────────────

/** Uncaught exceptions and console errors, minus known-benign noise. */
export function collectPageErrors(page: Page): string[] {
    const errors: string[] = [];
    const benign = [
        /Failed to load resource/i, // stubbed 404s / aborted claim transports
        /net::ERR_/i,
        /Workspace claim via/i,      // logged by design when a transport is down
        /Download the React DevTools/i,
    ];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (benign.some((re) => re.test(t))) return;
        errors.push(`console.error: ${t}`);
    });
    return errors;
}

/** The page must never scroll sideways at phone width. */
export async function expectNoHorizontalOverflow(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1);
}

// ── Journey shortcuts ─────────────────────────────────────────────────────

/** Brand-new account, all the way through consent, welcome and the tour. */
export async function openAsNewUser(page: Page, opts: BackendOptions = {}) {
    const user = await createAuthUser('new');
    await hideDevChrome(page);
    const calls = await installBackend(page, user, opts);
    await page.goto('/');
    await signIn(page, user);
    await page.getByRole('button', { name: 'I understand, continue' }).click();
    await page.getByRole('button', { name: /^Not now/ }).click();
    await page.getByRole('dialog', { name: 'How Machina works' }).getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('button', { name: 'Add to Machina' })).toBeVisible();
    return { user, calls };
}

/** Existing account with a library; lands straight in the app. */
export async function openAsReturningUser(
    page: Page,
    cards: Record<string, Record<string, unknown>> = {},
    opts: BackendOptions = {},
) {
    const user = await createAuthUser('returning');
    await seedReturningUser(user);
    // The tour is per-device (localStorage); a returning user has seen it.
    await page.addInitScript(() => {
        try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* ignore */ }
    });
    for (const [id, card] of Object.entries(cards)) await seedCard(user, id, card);
    await hideDevChrome(page);
    const calls = await installBackend(page, user, { claim: 'down', ...opts });
    await page.goto('/');
    await signIn(page, user);
    await expect(page.getByRole('button', { name: 'Add to Machina' })).toBeVisible();
    return { user, calls };
}

/** Settings → the account row (labelled with the signed-in email). */
export async function openAccountSettings(page: Page, email: string) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: new RegExp(email.replace(/[.+]/g, '\\$&')) }).click();
}
