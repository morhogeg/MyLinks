import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIAnalysis } from './types';

// Enhanced system prompt based on user requirements
const SYSTEM_PROMPT = `You are an expert knowledge curator building a "Second Brain".
Your goal is to analyze web content and extract high-quality, actionable insights.

Output MUST be a valid JSON object only.

Requirements for the analysis:
1. title: Create a concise, punchy title that captures the core value.
2. summary: Write a 3 to 7 sentence summary focusing on novel insights, not just describing the content. Focus on the "so what?".
3. category: Assign exactly one specific high-level category (e.g., Tech, Health, Philosophy, Business, Research, Meta-Learning).
4. tags: Provide 3-5 relevant tags for deep organization.
5. actionable_takeaway: One specific thing the user can do or learn from this.

JSON Structure:
{
  "title": "...",
  "summary": "...",
  "category": "...",
  "tags": ["...", "..."],
  "actionable_takeaway": "..."
}`;

/**
 * Analyze text using Google Gemini 1.5 Flash
 */
export async function analyzeContent(url: string, pageContent: string): Promise<AIAnalysis> {
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    const useMockAI = process.env.USE_MOCK_AI === 'true';

    if (!apiKey || useMockAI) {
        console.log('Using mock AI analysis (no API key or USE_MOCK_AI=true)');
        return generateMockAnalysis(url, pageContent);
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const prompt = `${SYSTEM_PROMPT}\n\nURL: ${url}\nContent: ${pageContent.substring(0, 30000)}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return JSON.parse(text) as AIAnalysis;
    } catch (error) {
        console.error('Gemini analysis failed:', error);
        // Fallback to mock so we don't block the user
        return generateMockAnalysis(url, pageContent);
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
        summary: "Mock summary: This resource provides valuable insights into the topic. It explores several key concepts and offers a comprehensive overview suitable for your second brain. (Fallback used because Gemini API was unavailable or mock mode active).",
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return "AI chat is currently unavailable (No API key).";

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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
        console.error('Gemini chat failed:', error);
        return "Sorry, I encountered an error while processing your request.";
    }
}
