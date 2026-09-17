// Shared guards for the three Vercel route handlers under app/api/*.
//
// Each handler is a thin proxy to a Cloud Function. Two things the handlers
// lacked: a body-size ceiling (`request.json()` buffers whatever arrives, up
// to Vercel's own limit, before any auth check runs upstream) and an upstream
// timeout (a hung Cloud Function otherwise pins the serverless invocation for
// its full `maxDuration`). Server-only: no Firebase, no browser globals.

/** Read and bound a JSON body. Returns `{ body }` or `{ error, status }`. */
export async function readJsonBody(
    request: Request,
    maxBytes: number,
): Promise<{ body: unknown } | { error: string; status: number }> {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > maxBytes) {
        return { error: 'Body too large', status: 413 };
    }
    let raw: string;
    try {
        raw = await request.text();
    } catch {
        return { error: 'Invalid JSON body', status: 400 };
    }
    // `length` counts UTF-16 units, never more than the UTF-8 byte count, so
    // a string that passes here is at most `maxBytes` bytes on the wire.
    if (raw.length > maxBytes) return { error: 'Body too large', status: 413 };
    try {
        return { body: JSON.parse(raw) as unknown };
    } catch {
        return { error: 'Invalid JSON body', status: 400 };
    }
}

/**
 * An AbortSignal that fires on the upstream timeout OR when the caller goes
 * away, so a client that closes its tab mid-stream also ends the upstream
 * fetch instead of leaving it running to the deadline.
 */
export function upstreamSignal(request: Request, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
    if (typeof anyFn === 'function' && request.signal) {
        return anyFn.call(AbortSignal, [timeout, request.signal]);
    }
    return timeout;
}
