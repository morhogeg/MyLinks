// Thin proxy to the canonical Python image-analysis backend.
//
// Mirrors app/api/analyze: production rewrites bypass this route, so it only
// runs during local `next dev` to give dev/prod parity. Forwards the request
// body (inline base64 `imageBytes` + `mimeType`, or legacy `imageUrl`) to the
// Python `analyze_image` function.

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
        const upstream = await fetch(`${BACKEND_BASE}/api/analyze-image`, {
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
            { success: false, error: `Could not reach analysis backend: ${message}` },
            { status: 502 }
        );
    }
}
