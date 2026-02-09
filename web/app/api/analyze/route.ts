// API route for analyzing URLs
// This runs server-side in Next.js

import { NextRequest, NextResponse } from 'next/server';
import { analyzeContent, fetchPageContent } from '@/lib/ai-service';
import { Link, AnalyzeResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
    try {
        const body = await request.json();
        const { url } = body;

        if (!url || typeof url !== 'string') {
            return NextResponse.json(
                { success: false, error: 'URL is required' },
                { status: 400 }
            );
        }

        // Validate URL format
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return NextResponse.json(
                { success: false, error: 'Invalid URL format' },
                { status: 400 }
            );
        }

        // Fetch page content
        const { html, title: originalTitle } = await fetchPageContent(url);

        // Analyze with AI (mock or real based on env)
        const analysis = await analyzeContent(url, html, body.existingTags || []);

        // Construct the link object
        const link: Link = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: parsedUrl.href,
            title: analysis.title,
            summary: analysis.summary,
            detailedSummary: analysis.detailedSummary,
            tags: analysis.tags,
            category: analysis.category,
            status: 'unread',
            createdAt: Date.now(),
            metadata: {
                originalTitle: originalTitle || analysis.title,
                estimatedReadTime: Math.ceil(html.length / 1500), // Rough estimate: 250 words/min, 6 chars/word
                actionableTakeaway: analysis.actionableTakeaway
            },
            // Enhanced AI fields
            sourceType: analysis.sourceType,
            confidence: analysis.confidence,
            keyEntities: analysis.keyEntities
        };

        return NextResponse.json({ success: true, link });

    } catch (error) {
        console.error('Analysis error:', error);

        // CRITICAL: Even if AI fails, return something so data isn't lost
        // This matches the PRD requirement for graceful degradation
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json(
            { success: false, error: `Processing failed: ${errorMessage}` },
            { status: 500 }
        );
    }
}
