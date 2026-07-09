// Proxy to the canonical Python "Ask Your Brain" RAG backend (`ask_brain`).
//
// Unlike the other endpoints, /api/chat is intentionally NOT a vercel.json
// rewrite: it runs through this route so we can stream SSE token-by-token.
// Firebase Hosting buffers responses (it won't pass SSE through incrementally),
// so we call the Cloud Function's direct URL here instead of the Hosting domain.
// Override with CHAT_BACKEND_URL if the function lives in another region.
// (On the Firebase-Hosting / iPhone surface /api/chat still rewrites straight
// to the function and simply degrades to one buffered response.)

import { NextRequest, NextResponse } from 'next/server';

// Give the SSE proxy a longer ceiling than the default on Vercel — a cold RAG
// backend call can be slow.
//
// NOTE: we deliberately do NOT add `export const dynamic = 'force-dynamic'`.
// next.config.ts builds this app with `output: export` for Capacitor/iOS
// whenever VERCEL is unset, and Next.js still evaluates every app/api route file
// during that build (the vercel.json /api/* rewrites don't exclude it). Next
// hard-fails `next build` with `dynamic = 'force-dynamic'` under `output: export`
// ("cannot be used with output: export"), and the value must be a static literal
// so it can't be gated on VERCEL. This route reads the incoming request
// (request.json() + headers), so it is already dynamic-by-default and streams
// SSE fine without the directive.
export const maxDuration = 60;

const CHAT_BACKEND_URL =
    process.env.CHAT_BACKEND_URL ||
    'https://us-central1-secondbrain-app-94da2.cloudfunctions.net/ask_brain';

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    // Forward the caller's App Check token (and other relevant headers) so the
    // backend sees the same auth context as a direct call would.
    const appCheck = request.headers.get('X-Firebase-AppCheck');
    const authz = request.headers.get('authorization');
    const fwdHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (appCheck) fwdHeaders['X-Firebase-AppCheck'] = appCheck;
    if (authz) fwdHeaders['Authorization'] = authz;
    // Ask the backend to stream when the client requested it.
    fwdHeaders['Accept'] = request.headers.get('Accept') || 'application/json';

    try {
        const upstream = await fetch(CHAT_BACKEND_URL, {
            method: 'POST',
            headers: fwdHeaders,
            body: JSON.stringify(body),
        });

        // Stream pass-through: when the backend speaks SSE, pipe the body straight
        // through so tokens reach the client as they arrive.
        const contentType = upstream.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
            return new Response(upstream.body, {
                status: upstream.status,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        }

        // Non-streaming backend (current prod): forward the JSON unchanged.
        const text = await upstream.text();
        return new NextResponse(text, {
            status: upstream.status,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: `Could not reach the brain backend: ${message}` },
            { status: 502 }
        );
    }
}
