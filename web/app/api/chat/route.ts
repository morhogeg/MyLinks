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

export async function POST(request: NextRequest): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const upstream = await fetch(`${BACKEND_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            { success: false, error: `Could not reach the brain backend: ${message}` },
            { status: 502 }
        );
    }
}
