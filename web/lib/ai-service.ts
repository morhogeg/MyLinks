import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIAnalysis } from './types';

// Enhanced system prompt for professional knowledge extraction
const SYSTEM_PROMPT = `You are a professional knowledge extraction assistant for a "Second Brain" system.
Your goal is to objectively summarize web content with accuracy and precision. Do NOT add opinions, interpretations, or subjective assessments.

Output MUST be a valid JSON object only.

Requirements for the analysis:

1. language: Identify the primary language of the content. Use ISO 639-1 codes (e.g., "he" for Hebrew, "en" for English).

2. title: Create a concise, descriptive title that captures the core topic. Be factual, not clickbait.
   - **LANGUAGE**: Write the title in the SAME language as the input content.

3. summary: Write exactly 2 to 4 complete, factual sentences for a card preview. 
   - **LANGUAGE**: Write the summary in the SAME language as the input content.
   - **STRUCTURE**: Add a line break (\\n) between each sentence to create visual separation.
   - Summarize ONLY what the content explicitly states.
   - NO opinions, NO value judgments (avoid "valuable", "insightful", "comprehensive", "interesting", "excellent").
   - Each sentence must end with a period.
   - State the main subject, key points, and conclusions objectively.

4. detailedSummary: Write a well-structured, professional summary using markdown formatting:
   - **LANGUAGE**: Write the detailed summary in the SAME language as the input content.
   - Start with a 1-2 sentence overview paragraph.
   - Use "## Key Points" as a subheading, followed by bullet points (use - for bullets).
   - Each bullet should be a factual statement from the content.
   - Include 3-6 bullet points covering the main arguments or information.
   - If applicable, add "## Conclusions" with the author's stated conclusions.
   - Keep the tone neutral and professional throughout.
   - Total length: 150-300 words.

5. category: Assign exactly one high-level category (e.g., Tech, Health, Philosophy, Business, Research, Science, Finance, Productivity, Design, Career). If the content is a recipe, use "Recipe".
   - **CRITICAL**: The category MUST ALWAYS be in English, even if the content is in another language.

6. tags: Provide exactly 3 or 4 specific, relevant tags for organization.
   - **LANGUAGE**: Write tags in the SAME language as the input content.
   - Use lowercase.
   - PREFER REUSING EXISTING TAGS provided in the "Existing Tags" list if they are applicable.
   - Only create a new tag if no existing tags fit the content.

7. actionableTakeaway: One concrete, specific action or learning the reader can apply.
   - **LANGUAGE**: Write the takeaway in the SAME language as the input content.

CRITICAL RULES:
- Be a neutral reporter, not a reviewer. Report WHAT is said, not HOW WELL it is said.
- Avoid subjective phrases like: "offers valuable insights", "provides a comprehensive overview", "explores interesting ideas", "is a must-read", "excellently explains".
- Use factual language: "The article discusses...", "The author argues...", "The research shows...", "Key topics include...".

JSON Structure:
{
  "language": "...",
  "title": "...",
  "summary": "...",
  "detailedSummary": "...",
  "category": "...",
  "tags": ["...", "..."],
  "actionableTakeaway": "..."
}`;

/**
 * Analyze text using Google Gemini 1.5 Flash
 */
export async function analyzeContent(url: string, pageContent: string, existingTags: string[] = []): Promise<AIAnalysis> {
    // Check for API key (server-side, called from API route)
    const apiKey = process.env.GEMINI_API_KEY;
    const useMockAI = process.env.USE_MOCK_AI === 'true';

    console.log('[AI Service] API Key present:', !!apiKey);
    console.log('[AI Service] Use Mock AI:', useMockAI);

    if (!apiKey || useMockAI) {
        console.log('[AI Service] Using mock AI analysis (no API key or USE_MOCK_AI=true)');
        return generateMockAnalysis(url, pageContent);
    }

    try {
        console.log('[AI Service] Analyzing with gemini-2.5-flash...');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const tagsContext = existingTags.length > 0
            ? `\n\nExisting Tags in Brain (Reuse these if possible):\n${existingTags.join(', ')}`
            : '';

        const prompt = `${SYSTEM_PROMPT}${tagsContext}\n\nURL: ${url}\nContent: ${pageContent.substring(0, 150000)}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('[AI Service] ✓ Analysis complete');
        return JSON.parse(text) as AIAnalysis;
    } catch (error) {
        console.error('[AI Service] Gemini analysis failed:', error);
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
        summary: "This resource covers several key concepts related to the topic.",
        detailedSummary: "The content discusses core principles and frameworks in this domain. It presents arguments supported by examples and case studies. The author examines different perspectives and approaches to the subject matter. Key conclusions are drawn based on the analysis presented. Fallback analysis used because Gemini API was unavailable or mock mode is active.",
        category,
        tags,
        actionableTakeaway: "Review this content to determine its specific relevance to your current projects."
    };
}

/**
 * Fetch and extract text content from a URL
 * Handles Twitter/X URLs specially via fxtwitter.com API
 */
export async function fetchPageContent(url: string): Promise<{ html: string; title: string }> {
    try {
        // Special handling for Twitter/X URLs
        if (url.includes('twitter.com') || url.includes('x.com')) {
            return await fetchTwitterContent(url);
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        };

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // Clean HTML to remove noise (scripts, styles, etc)
        const cleanedHtml = cleanHtml(html);

        return { html: cleanedHtml, title };
    } catch (error) {
        console.error('Fetch failed:', error);
        return { html: '', title: new URL(url).hostname };
    }
}

function cleanHtml(html: string): string {
    // 1. Extract body if possible
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let content = bodyMatch ? bodyMatch[1] : html;

    // 2. Remove scripts and styles and other non-content tags
    content = content
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
        .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

    // 3. Remove remaining HTML tags but keep some structure tokens if needed? 
    // Actually, asking Gemini to parse HTML is fine, but we want to reduce token count.
    // Let's keep basic tags but remove attributes to save space?
    // For now, just removing the heavy blocks (scripts/styles) is the biggest win.

    // Collapse whitespace
    content = content.replace(/\s+/g, ' ').trim();

    return content;
}

/**
 * Fetch Twitter/X content using fxtwitter.com API
 * This bypasses JavaScript requirement by using a third-party embed API
 */
/**
 * Fetch Twitter/X content using fxtwitter.com API
 * This bypasses JavaScript requirement by using a third-party embed API
 */
async function fetchTwitterContent(url: string): Promise<{ html: string; title: string }> {
    try {
        console.log('[AI Service] Analyzing Twitter URL:', url);

        // 1. Try fxtwitter.com API first
        const fxApiUrl = url
            .replace('twitter.com', 'api.fxtwitter.com')
            .replace('x.com', 'api.fxtwitter.com');

        console.log('[AI Service] Attempting fxtwitter API:', fxApiUrl);
        const fxResponse = await fetch(fxApiUrl);

        if (fxResponse.ok) {
            const data = await fxResponse.json();
            if (data.tweet) {
                const tweet = data.tweet;

                // Check if text is remarkably brief or empty
                const hasText = tweet.text && tweet.text.trim().length > 0;
                const hasQuote = !!tweet.quote;
                const hasMedia = tweet.media && (tweet.media.photos?.length > 0 || tweet.media.videos?.length > 0);

                // If completely empty (no text, no quote, no media), maybe try fallback?
                // But usually fxtwitter is fine. Let's process it.

                const result = formatTwitterData(tweet, 'fxtwitter');
                if (result.isValid) {
                    console.log('[AI Service] ✓ fxtwitter content valid');
                    return result.data;
                }
            }
        }

        // 2. Fallback to vxtwitter.com (sometimes better for media/instas)
        console.log('[AI Service] fxtwitter failed or empty, trying vxtwitter...');
        const vxApiUrl = url
            .replace('twitter.com', 'api.vxtwitter.com')
            .replace('x.com', 'api.vxtwitter.com');

        let vxResult = null;
        try {
            const vxResponse = await fetch(vxApiUrl);
            if (vxResponse.ok) {
                const data = await vxResponse.json();

                // VALIDATION: Check if vxtwitter gave us meaningful content
                // Twitter Articles often return just a link or empty text via vxtwitter
                const hasMedia = data.mediaURLs?.length > 0 || data.media_extended?.length > 0;
                const textLen = data.text ? data.text.length : 0;

                // If we have media, or text is substantial (>100 chars), trust it.
                // Otherwise, we might need to scrape to get the real Article headline.
                if (hasMedia || textLen > 100) {
                    console.log('[AI Service] ✓ vxtwitter content valid (substantial)');
                    return formatVxTwitterData(data);
                }

                // Store for potential usage if scrape fails, but don't return yet
                console.log('[AI Service] vxtwitter content found but "thin" (no media, short text). Attempting scrape for better Article data...');
                vxResult = formatVxTwitterData(data);
            }
        } catch (e) {
            console.log('[AI Service] vxtwitter failed:', e);
        }

        console.log('[AI Service] APIs failed/thin. Trying direct metadata scrape (Twitter Article fallback)...');
        // 3. Final Fallback: Try to get OpenGraph tags directly from Twitter/X
        const scrapeResult = await scrapeTwitterMetadata(url);

        if (scrapeResult) {
            console.log('[AI Service] ✓ scraped metadata valid');
            return scrapeResult;
        }

        // If scrape failed but we had a "thin" vxtwitter result, likely better than nothing
        if (vxResult) {
            console.log('[AI Service] Scrape failed, reverting to thin vxtwitter result');
            return vxResult;
        }

        throw new Error('All Twitter fetch methods failed');

    } catch (error) {
        console.error('[AI Service] Twitter fetch failed:', error);
        return { html: '', title: 'Twitter/X Post' };
    }
}

/**
 * Fallback: Scrape OpenGraph tags for Twitter Articles/Links
 */
async function scrapeTwitterMetadata(url: string): Promise<{ html: string, title: string } | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
            }
        });

        if (!response.ok) return null;

        const html = await response.text();

        // Extract meta tags
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
        const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

        const title = titleMatch ? titleMatch[1] : '';
        const desc = descMatch ? descMatch[1] : '';

        if (!title && !desc) return null;

        const formattedText = `
TWEET/ARTICLE METADATA:
Title: ${title}
Description: ${desc}

(Full content not available via API, analyzed based on preview metadata)
`;
        return {
            html: formattedText,
            title: title || 'Twitter Article'
        };
    } catch (e) {
        console.error('[AI Service] Metadata scrape failed:', e);
        return null;
    }
}

function formatTwitterData(tweet: any, source: string): { isValid: boolean, data: { html: string, title: string } } {
    const author = tweet.author || {};
    const authorName = author.name || 'Unknown';
    const authorHandle = author.screen_name || '';

    let contentParts = [];

    // Main Text
    if (tweet.text) contentParts.push(tweet.text);

    // Quote
    if (tweet.quote) {
        const qAuthor = tweet.quote.author?.name || 'Unknown';
        const qHandle = tweet.quote.author?.screen_name || 'unknown';
        const qText = tweet.quote.text || '';
        contentParts.push(`\n[Replying to/Quoting ${qAuthor} (@${qHandle})]:\n"${qText}"`);
    }

    // Media
    if (tweet.media) {
        if (tweet.media.photos?.length) contentParts.push(`\n[Contains ${tweet.media.photos.length} Image(s)]`);
        if (tweet.media.videos?.length) contentParts.push(`\n[Contains Video]`);
    }

    // Check if we actually got content
    const finalContent = contentParts.join('\n\n');
    const isValid = finalContent.length > 0; // If empty, we might want fallback

    const displayContent = finalContent || "[Media-only tweet or no text content available]";

    const formattedText = `
TWEET CONTENT:
"${displayContent}"

---
METADATA:
Author: ${authorName} (@${authorHandle})
Date: ${tweet.created_at}
Engagement: ${tweet.likes} likes, ${tweet.retweets} retweets
Source: ${source} API
`;

    return {
        isValid,
        data: {
            html: formattedText,
            title: `Tweet by ${authorName}: ${displayContent.substring(0, 100).replace(/\n/g, ' ')}`
        }
    };
}

function formatVxTwitterData(data: any): { html: string, title: string } {
    // vxtwitter structure
    const contentParts = [];
    if (data.text) contentParts.push(data.text);

    if (data.mediaURLs?.length > 0 || data.media_extended?.length > 0) {
        contentParts.push(`\n[Contains ${Math.max(data.mediaURLs?.length || 0, data.media_extended?.length || 0)} Media Item(s)]`);
    }

    // vxtwitter sometimes puts Quote info in text or separate fields (qrtURL)
    // It's less structured for quotes but better for media

    const finalContent = contentParts.join('\n\n') || "[Media-only tweet]";

    const formattedText = `
TWEET CONTENT:
"${finalContent}"

---
METADATA:
Author: ${data.user_name} (@${data.user_screen_name})
Date: ${data.date}
Engagement: ${data.likes} likes, ${data.retweets} retweets
Source: vxtwitter API
`;

    return {
        html: formattedText,
        title: `Tweet by ${data.user_name}: ${finalContent.substring(0, 100).replace(/\n/g, ' ')}`
    };
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
