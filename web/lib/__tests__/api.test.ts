/**
 * fetchWithTimeout must honour BOTH its own timeout and the caller's signal.
 * It used to replace `init.signal` with its timeout controller's, so Ask's
 * Stop button and a superseding send aborted nothing: the request ran on and
 * was charged. Run with
 * `node --test --experimental-strip-types lib/__tests__/api.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithTimeout } from '../api.ts';

/** A fake fetch that answers after `ms` unless its signal aborts first, and
 *  records the signal it was handed. */
function fakeFetch(ms: number) {
    const seen: { signal: AbortSignal | null } = { signal: null };
    const impl = (_input: unknown, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? null;
        seen.signal = signal;
        if (signal?.aborted) return reject(signal.reason);
        const t = setTimeout(() => resolve(new Response('ok')), ms);
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
    });
    return { impl, seen };
}

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
        return await run();
    } finally {
        globalThis.fetch = original;
    }
}

test('the caller aborting before the headers arrive cancels the request', async () => {
    const { impl } = fakeFetch(200);
    const caller = new AbortController();
    await withFetch(impl as typeof fetch, async () => {
        const pending = fetchWithTimeout('/x', { signal: caller.signal }, 5_000);
        setTimeout(() => caller.abort(), 10);
        await assert.rejects(pending, (e: unknown) => (e as Error).name === 'AbortError');
    });
});

test('an already-aborted caller signal never starts a live request', async () => {
    const { impl, seen } = fakeFetch(200);
    const caller = new AbortController();
    caller.abort();
    await withFetch(impl as typeof fetch, async () => {
        await assert.rejects(fetchWithTimeout('/x', { signal: caller.signal }, 5_000));
        assert.equal(seen.signal?.aborted, true);
    });
});

test('the timeout still fires when the caller passes a signal', async () => {
    const { impl } = fakeFetch(500);
    const caller = new AbortController();
    await withFetch(impl as typeof fetch, async () => {
        await assert.rejects(fetchWithTimeout('/x', { signal: caller.signal }, 20));
        assert.equal(caller.signal.aborted, false, 'the timeout must not abort the caller\'s own controller');
    });
});

test('a settled request detaches from the caller signal', async () => {
    const { impl, seen } = fakeFetch(5);
    const caller = new AbortController();
    await withFetch(impl as typeof fetch, async () => {
        const res = await fetchWithTimeout('/x', { signal: caller.signal }, 5_000);
        assert.equal(await res.text(), 'ok');
        caller.abort();
        assert.equal(seen.signal?.aborted, false, 'the listener is removed once fetch() settles');
    });
});

test('without a caller signal it behaves as before', async () => {
    const { impl } = fakeFetch(5);
    await withFetch(impl as typeof fetch, async () => {
        const res = await fetchWithTimeout('/x', {}, 5_000);
        assert.equal(await res.text(), 'ok');
    });
});
