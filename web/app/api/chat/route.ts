// Thin proxy to the canonical Python "Ask Your Brain" RAG backend.
//
// The Python Cloud Function `ask_brain` is the single source of truth (vector
// retrieval + grounded Gemini answer). In production the vercel.json /
// firebase.json rewrites send /api/chat straight to the backend, so this route
// only runs during local `next dev` — it forwards the request so dev behaves
// identically to prod (mirrors /api/analyze).

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE =
    process.env.ANALYZE_BACKEND_URL || 'https://secondbrain-app-94da2.web.app';

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
    const fwdHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (appCheck) fwdHeaders['X-Firebase-AppCheck'] = appCheck;
    // Ask the backend to stream when the client requested it.
    fwdHeaders['Accept'] = request.headers.get('Accept') || 'application/json';

    try {
        const upstream = await fetch(`${BACKEND_BASE}/api/chat`, {
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
