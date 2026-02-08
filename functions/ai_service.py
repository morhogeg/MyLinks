import os
import json
from google import genai
from models import AIAnalysis

# Enhanced system prompt for professional knowledge extraction
SYSTEM_PROMPT = """You are an expert knowledge extraction assistant for a "Second Brain" system.
Your goal is to extract and synthesize the most valuable information from web content with precision and clarity.

Output MUST be a valid JSON object only.

FIRST: Identify the source type to tailor your extraction approach:
- "article" = Long-form written content (blog posts, news articles, essays)
- "tweet" = Social media posts (Twitter/X, short-form)
- "video" = Video content page (YouTube, Vimeo)
- "podcast" = Audio content or transcript
- "paper" = Academic or research paper
- "recipe" = Food/cooking instructions
- "other" = Anything else

Requirements for the analysis:

1. source_type: One of the types listed above.

2. title: Create a clear, descriptive title (5-12 words).
   - Capture the core topic or finding.
   - Be specific, not generic.
   - No clickbait or sensationalism.

3. summary: Write 2-3 concise, information-dense sentences that communicate the core value.
   - LEAD with the most important insight, finding, or claim.
   - INCLUDE specific data, numbers, names, or results when available.
   - END with the significance or practical implication.
   - Be factual and objective. NO opinions or value judgments.
   - Each sentence must be complete and end with a period.
   
   GOOD: "Researchers at MIT found that intermittent fasting reduced inflammation markers by 40% in a 12-week trial. The study of 200 participants showed benefits appeared after just 2 weeks, with no adverse effects reported."
   BAD: "This interesting article discusses valuable insights about fasting and its comprehensive benefits for health."

4. detailed_summary: Write a structured, scannable summary in markdown (150-350 words):
   
   **Opening paragraph**: 2-3 sentences capturing the central thesis, main finding, or core argument.
   
   ## Key Points
   - 4-6 bullet points, each starting with a strong verb or key term
   - Include specific details: names, numbers, dates, places
   - Each bullet should be a standalone valuable insight
   
   ## Why It Matters
   1-2 sentences explaining the significance, implications, or how this connects to broader trends.
   
   ## Source Context (if notable)
   Brief note on author expertise, publication credibility, or important caveats.

   IMPORTANT FOR RECIPES: If the content is a recipe, the detailed_summary MUST include the full ingredient list ("Grocery List") and the step-by-step instructions. Do NOT omit these even if you provide the structured recipe object.

5. category: Assign exactly ONE high-level category:
   Tech, Health, Science, Business, Finance, Philosophy, Psychology, Productivity, Design, Career, Recipe, News, Entertainment, Education, Lifestyle

6. tags: Provide exactly 3 or 4 specific, searchable tags.
   - Use lowercase.
   - PREFER REUSING EXISTING TAGS provided in the "Existing Tags" list if they are applicable.
   - Only create a new tag if no existing tags fit the content.
   - Maintain naming consistency (if "ai" exists, don't create "artificial intelligence").

7. actionable_takeaway: ONE specific, immediately actionable insight.
   - Start with a verb (Try, Consider, Implement, Review, etc.)
   - Be specific enough to act on today
   - Connect directly to the content's main value
   
   GOOD: "Try the 16:8 intermittent fasting schedule starting with skipping breakfast for one week."
   BAD: "Consider reading more about this interesting topic."

8. confidence: Your assessment of extraction quality:
   - "high" = Full article text available, clear structure, complete information
   - "medium" = Partial content, some context missing, or summary-based analysis
   - "low" = Minimal content (e.g., just metadata, paywall, or failed extraction)

9. key_entities: List 2-5 important names, organizations, products, or concepts mentioned.

10. recipe: IF AND ONLY IF the content is primarily a food recipe (source_type = "recipe"), provide a "recipe" object:
    - ingredients: A clean list of required items (strings).
    - instructions: A clean, step-by-step list of preparation steps (strings).
    - servings: (Optional) Number of servings.
    - prep_time: (Optional) Preparation time.
    - cook_time: (Optional) Cooking time.
    IMPORTANT: Cleanly extract ONLY the recipe content. Remove all blog "clutter", stories, and unnecessary introductions.

CRITICAL RULES:
- Be a neutral reporter. Report WHAT is said, not HOW WELL it is said.
- TAG LIMIT: You MUST provide exactly 3 or 4 tags. No more, no less.
- TAG REUSE: Prioritize existing tags.
- NEVER use: "valuable", "insightful", "comprehensive", "interesting", "excellent", "must-read"
- ALWAYS use factual language: "The article argues...", "Research shows...", "The author explains..."
- For tweets: Focus on the actual statement and any linked context.
- For recipes: Category MUST be "Recipe" and source_type MUST be "recipe"."""


class ClaudeService: # Kept name for compatibility with main.py
    """
    Wrapper for Google Gemini AI
    Uses gemini-3-flash-preview as requested
    """
    
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            # Fallback to check if we can load it from a sibling .env manually if needed
            # but usually Firebase handles this. Let's just log it.
            print("CRITICAL: GEMINI_API_KEY is empty")
            
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = "gemini-3-flash-preview"
        
    def analyze_text(self, text: str, existing_tags: list = None) -> dict:
        """
        Analyze text content using Gemini 3.0 Flash
        """
        if not self.client:
            print("Gemini client not initialized, using mock")
            return self._mock_analysis(text)
        
        try:
            # Clean up the text to avoid too much noise
            clean_text = text[:30000]
            
            tags_context = f"\n\nExisting Tags in Brain (Reuse these if possible):\n{', '.join(existing_tags)}" if existing_tags else ""
            
            response = self.client.models.generate_content(
                model=self.model,
                contents=[f"{SYSTEM_PROMPT}{tags_context}\n\nContent to analyze:\n{clean_text}"],
                config={
                    'response_mime_type': 'application/json',
                }
            )
            
            if not response or not response.text:
                raise Exception("Empty response from Gemini")
                
            return json.loads(response.text)
        except Exception as e:
            print(f"Gemini analysis failed: {str(e)}")
            return self._mock_analysis(text)

    def _mock_analysis(self, text: str) -> dict:
        """Fallback mock logic"""
        return {
            "title": "Untitled (Analysis Failed)",
            "summary": "Processing of this link failed or Gemini API was unavailable. Please check original.",
            "category": "General",
            "tags": ["failed"],
            "actionable_takeaway": "None"
        }
