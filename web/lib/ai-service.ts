import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIAnalysis } from './types';

// Enhanced system prompt based on user requirements
const SYSTEM_PROMPT = `You are a knowledge extraction assistant for a "Second Brain" system.
Your goal is to objectively summarize web content without adding opinions or interpretations.

Output MUST be a valid JSON object only.

Requirements for the analysis:
1. title: Create a concise, punchy title that captures the core topic.
2. summary: Write exactly 2 to 4 concise, complete sentences suitable for a card preview. Summarize ONLY what the content actually says - no opinions, interpretations, or value judgments. State facts objectively. Each sentence must end properly.
3. detailedSummary: Write a comprehensive 5 to 8 sentence summary for the expanded detail view. Objectively describe the main points, key arguments, and conclusions presented in the content. Focus on what is actually stated, not on subjective assessments of value or quality.
4. category: Assign exactly one specific high-level category (e.g., Tech, Health, Philosophy, Business, Research, Meta-Learning).
5. tags: Provide 3-5 relevant tags for deep organization.
6. actionable_takeaway: One specific thing the user can do or learn from this content.

CRITICAL: Both summaries must be purely factual. Avoid phrases like "offers valuable insights", "provides a comprehensive overview", "explores interesting ideas". Instead, describe what the content actually covers.

JSON Structure:
{
  "title": "...",
  "summary": "...",
  "detailedSummary": "...",
  "category": "...",
  "tags": ["...", "..."],
  "actionable_takeaway": "..."
}`;

/**
 * Analyze text using Google Gemini 1.5 Flash
 */
export async function analyzeContent(url: string, pageContent: string): Promise<AIAnalysis> {
    // Check for API key (server-side, called from API route)
    const apiKey = process.env.GEMINI_API_KEY;
    const useMockAI = process.env.USE_MOCK_AI === 'true';

    console.log('[AI Service] API Key present:', !!apiKey);
    console.log('[AI Service] Use Mock AI:', useMockAI);

    if (!apiKey || useMockAI) {
        console.log('[AI Service] Using mock AI analysis (no API key or USE_MOCK_AI=true)');
        return generateMockAnalysis(url, pageContent);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `${SYSTEM_PROMPT}\n\nURL: ${url}\nContent: ${pageContent.substring(0, 30000)}`;

    // Try primary model first: gemini-3-flash-preview
    try {
        console.log('[AI Service] Trying gemini-3-flash-preview...');
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('[AI Service] ✓ Success with gemini-3-flash-preview');
        return JSON.parse(text) as AIAnalysis;
    } catch (error: any) {
        // Check if it's a rate limit error (429)
        const isRateLimit = error?.message?.includes('429') || error?.status === 429;

        if (isRateLimit) {
            console.log('[AI Service] Rate limit hit on gemini-3-flash-preview, trying gemini-2.5-flash...');

            try {
                const fallbackModel = genAI.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    generationConfig: {
                        responseMimeType: "application/json",
                    }
                });

                const result = await fallbackModel.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                console.log('[AI Service] ✓ Success with gemini-2.5-flash (fallback)');
                return JSON.parse(text) as AIAnalysis;
            } catch (fallbackError) {
                console.error('[AI Service] Fallback model also failed:', fallbackError);
                return generateMockAnalysis(url, pageContent);
            }
        } else {
            console.error('[AI Service] Gemini analysis failed (non-rate-limit error):', error);
            return generateMockAnalysis(url, pageContent);
        }
    }
}

/**
 * Generate a realistic mock analysis based on URL/content patterns
 * (Fallback if API fails)
 */
function generateMockAnalysis(url: string, _content: string): AIAnalysis {
    // ... (previous mock logic remains same)
    const urlLower = url.toLowerCase();
    let category = 'General';
    let tags: string[] = [];

    if (urlLower.includes('github') || urlLower.includes('stackoverflow')) {
        category = 'Tech';
        tags = ['programming', 'code', 'oss'];
    } else if (urlLower.includes('health') || urlLower.includes('bio')) {
        category = 'Health';
        tags = ['wellness', 'longevity'];
    } else {
        tags = ['reference', 'learning'];
    }

    return {
        title: new URL(url).hostname,
        summary: "This resource covers several key concepts related to the topic.",
        detailedSummary: "The content discusses core principles and frameworks in this domain. It presents arguments supported by examples and case studies. The author examines different perspectives and approaches to the subject matter. Key conclusions are drawn based on the analysis presented. Fallback analysis used because Gemini API was unavailable or mock mode is active.",
        category,
        tags,
        actionable_takeaway: "Review this content to determine its specific relevance to your current projects."
    };
}

/**
 * Fetch and extract text content from a URL
 */
export async function fetchPageContent(url: string): Promise<{ html: string; title: string }> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        return { html, title };
    } catch (error) {
        console.error('Fetch failed:', error);
        return { html: '', title: new URL(url).hostname };
    }
}
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const systemPrompt = `You are an expert assistant for a "Second Brain" system. 
                    I have saved a link titled "${context.title}" in the category "${context.category}".
                    Here is the summary of the content: "${context.summary}".
                    
                    Full content snippet: ${content.substring(0, 10000)}
                    
                    Please answer the user's questions about this specific content based on the information provided. 
                    Be concise, accurate, and insightful. If the answer isn't in the content, say so.`;

    // Try primary model first
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

        const chat = model.startChat({
            history: [
                {
                    role: 'user',
                    parts: [{ text: systemPrompt }],
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
    } catch (error: any) {
        // Check if it's a rate limit error
        const isRateLimit = error?.message?.includes('429') || error?.status === 429;

        if (isRateLimit) {
            console.log('[AI Chat] Rate limit hit, trying gemini-2.5-flash...');

            try {
                const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

                const chat = fallbackModel.startChat({
                    history: [
                        {
                            role: 'user',
                            parts: [{ text: systemPrompt }],
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
            } catch (fallbackError) {
                console.error('[AI Chat] Fallback model also failed:', fallbackError);
                return "Sorry, I encountered an error while processing your request. Please try again later.";
            }
        } else {
            console.error('[AI Chat] Chat failed:', error);
            return "Sorry, I encountered an error while processing your request.";
        }
    }
}
