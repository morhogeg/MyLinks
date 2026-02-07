import { NextRequest, NextResponse } from 'next/server';
import { chatWithContent } from '@/lib/ai-service';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, context, content } = body;

        if (!messages || !context) {
            return NextResponse.json(
                { success: false, error: 'Messages and context are required' },
                { status: 400 }
            );
        }

        const responseText = await chatWithContent(content || '', context, messages);

        return NextResponse.json({ success: true, response: responseText });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
