// Thin proxy to the canonical Python analysis backend.
//
// The Python Cloud Functions are the single source of truth for analysis
// (scrape + Gemini + embedding + related-links). This route forwards the
// request so the Vercel surface behaves identically to the Hosting rewrite
// (no separate, drifting TS implementation). It is live on Vercel, not
// dev-only: route handlers match before vercel.json rewrites, so it is
// bounded like any public endpoint — a body ceiling before parsing and an
// upstream timeout matched to the function's own (analyze_link: 120 s).

import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, upstreamSignal } from '@/lib/apiProxy';

const BACKEND_BASE =
    process.env.ANALYZE_BACKEND_URL || 'https://secondbrain-app-94da2.web.app';
// A URL + tags + a note: 64 KB is generous.
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 125_000;
export const maxDuration = 130;

export async function POST(request: NextRequest): Promise<NextResponse> {
    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if ('error' in parsed) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: parsed.status });
    }
    const body = parsed.body;

    try {
        // Forward auth + App Check so the backend sees the same caller.
        const fwd: Record<string, string> = { 'Content-Type': 'application/json' };
        const _auth = request.headers.get('authorization');
        const _ac = request.headers.get('x-firebase-appcheck');
        if (_auth) fwd['Authorization'] = _auth;
        if (_ac) fwd['X-Firebase-AppCheck'] = _ac;
        const upstream = await fetch(`${BACKEND_BASE}/api/analyze`, {
            method: 'POST',
            headers: fwd,
            body: JSON.stringify(body),
            signal: upstreamSignal(request, UPSTREAM_TIMEOUT_MS),
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
