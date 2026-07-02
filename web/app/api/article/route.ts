// Thin proxy to the canonical Python article-extraction backend.
//
// The Python Cloud Function `get_article` is the single source of truth
// (readable text extraction). In production the vercel.json / firebase.json
// rewrites send /api/article straight to the backend, so this route only runs
// during local `next dev` — it forwards the request (mirrors /api/analyze).

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE =
    process.env.ANALYZE_BACKEND_URL || 'https://secondbrain-app-94da2.web.app';

export async function POST(request: NextRequest): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        // Forward auth + App Check so dev behaves like prod (this route only runs
        // under `next dev`; the hosting rewrite preserves these in production).
        const fwd: Record<string, string> = { 'Content-Type': 'application/json' };
        const _auth = request.headers.get('authorization');
        const _ac = request.headers.get('x-firebase-appcheck');
        if (_auth) fwd['Authorization'] = _auth;
        if (_ac) fwd['X-Firebase-AppCheck'] = _ac;
        const upstream = await fetch(`${BACKEND_BASE}/api/article`, {
            method: 'POST',
            headers: fwd,
            body: JSON.stringify(body),
        });

        const text = await upstream.text();
        return new NextResponse(text, {
            status: upstream.status,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: `Could not reach the article backend: ${message}` },
            { status: 502 }
        );
    }
}
