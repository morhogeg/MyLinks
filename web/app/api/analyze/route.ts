// Thin proxy to the canonical Python analysis backend.
//
// The Python Cloud Functions are the single source of truth for analysis
// (scrape + Gemini + embedding + related-links). In production the
// vercel.json / firebase.json rewrites send /api/analyze straight to the
// backend, so this route only runs during local `next dev` — here it forwards
// the request so dev behaves identically to prod (no separate, drifting TS
// implementation).

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE =
    process.env.ANALYZE_BACKEND_URL || 'https://secondbrain-app-94da2.web.app';

/** Forward Content-Type plus the auth + App Check headers to the backend. */
function forwardHeaders(request: NextRequest): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = request.headers.get('authorization');
    const appCheck = request.headers.get('x-firebase-appcheck');
    if (auth) h['Authorization'] = auth;
    if (appCheck) h['X-Firebase-AppCheck'] = appCheck;
    return h;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const upstream = await fetch(`${BACKEND_BASE}/api/analyze`, {
            method: 'POST',
            headers: forwardHeaders(request),
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
