// Thin proxy to the canonical Python image-analysis backend.
//
// Mirrors app/api/analyze (see the note there: live on Vercel, bounded).
// Forwards the request body (inline base64 `imageBytes` + `mimeType`, or
// legacy `imageUrl`) to the Python `analyze_image` function. The body carries
// an image as base64, so the ceiling sits just under Vercel's 4.5 MB request
// limit; the function's own 8 MB source cap is the upstream truth.

import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, upstreamSignal } from '@/lib/apiProxy';

const BACKEND_BASE =
    process.env.ANALYZE_BACKEND_URL || 'https://secondbrain-app-94da2.web.app';
const MAX_BODY_BYTES = 4_400_000;
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
        const upstream = await fetch(`${BACKEND_BASE}/api/analyze-image`, {
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
