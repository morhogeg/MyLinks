import { GoogleGenerativeAI } from '@google/generative-ai';

// NOTE: Link analysis (scrape + summarize + categorize + tag + embed) lives
// exclusively in the Python Cloud Functions (functions/ai_service.py), which
// are the single source of truth. The frontend reaches them through the thin
// /api/analyze and /api/analyze-image proxy routes. The earlier TypeScript
// re-implementation was removed to stop the two paths from drifting.
//
// Only the client-side chat helper remains here.

/**
 * Interactive chat about specific content using Gemini
 */
export async function chatWithContent(
    content: string,
    context: { title: string, category: string, summary: string },
    messages: { role: 'user' | 'model', content: string }[]
): Promise<string> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return "AI chat is currently unavailable (No API key).";

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const chat = model.startChat({
            history: [
                {
                    role: 'user',
                    parts: [{
                        text: `You are an expert assistant for a "Second Brain" system.
                    I have saved a link titled "${context.title}" in the category "${context.category}".
                    Here is the summary of the content: "${context.summary}".

                    Full content snippet: ${content.substring(0, 10000)}

                    Please answer the user's questions about this specific content based on the information provided.
                    Be concise, accurate, and insightful. If the answer isn't in the content, say so.` }],
                },
                {
                    role: 'model',
                    parts: [{ text: "Understood. I'm ready to help you explore the insights from this content. What would you like to know?" }],
                },
                ...messages.map(m => ({
                    role: m.role,
                    parts: [{ text: m.content }]
                }))
            ],
        });

        const latestMessage = messages[messages.length - 1];
        const result = await chat.sendMessage(latestMessage.content);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('[AI Chat] Chat failed:', error);
        return "Sorry, I encountered an error while processing your request.";
    }
}
