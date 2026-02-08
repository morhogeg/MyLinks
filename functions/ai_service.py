import os
import json
from google import genai
from models import AIAnalysis

# Enhanced system prompt - professional and factual
SYSTEM_PROMPT = """You are a professional knowledge extraction assistant for a "Second Brain" system.
Your goal is to objectively summarize web content with accuracy and precision. Do NOT add opinions, interpretations, or subjective assessments.

Output MUST be a valid JSON object only.

Requirements for the analysis:

1. title: Create a concise, descriptive title that captures the core topic. Be factual, not clickbait.

2. summary: Write exactly 2 to 4 complete, factual sentences for a card preview.
   - Summarize ONLY what the content explicitly states.
   - NO opinions, NO value judgments (avoid "valuable", "insightful", "comprehensive", "interesting", "excellent").
   - Each sentence must end with a period.
   - State the main subject, key points, and conclusions objectively.

3. detailedSummary: Write a well-structured, professional summary using markdown formatting:
   - Start with a 1-2 sentence overview paragraph.
   - Use "## Key Points" as a subheading, followed by bullet points (use - for bullets).
   - Each bullet should be a factual statement from the content.
   - Include 3-6 bullet points covering the main arguments or information.
   - If applicable, add "## Conclusions" with the author's stated conclusions.
   - Keep the tone neutral and professional throughout.
   - Total length: 150-300 words.

4. category: Assign exactly one high-level category. If the content is a recipe, use "Recipe". (Other examples: Tech, Health, Philosophy, Business, Research, Science, Finance, Productivity, Design, Career).

5. tags: Provide 3-5 specific, relevant tags for organization.

6. actionable_takeaway: One concrete, specific action or learning the reader can apply.

7. recipe: IF AND ONLY IF the content is primarily a food recipe, provide a "recipe" object:
   - ingredients: A clean list of required items (strings).
   - instructions: A clean, step-by-step list of preparation steps (strings).
   - servings: (Optional) Number of servings.
   - prep_time: (Optional) Preparation time.
   - cook_time: (Optional) Cooking time.
   IMPORTANT: Cleanly extract ONLY the recipe content. Remove all blog "clutter", stories, and unnecessary introductions.

CRITICAL RULES:
- Be a neutral reporter, not a reviewer. Report WHAT is said, not HOW WELL it is said.
- Avoid subjective phrases like: "offers valuable insights", "provides a comprehensive overview", "explores interesting ideas", "is a must-read", "excellently explains".
- For recipes, ensure the output format is extremely clean and structured for a checklist/step-by-step UI.
- Use factual language: "The article discusses...", "The author argues...", "The research shows...", "Key topics include..."."""


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
        
    def analyze_text(self, text: str) -> dict:
        """
        Analyze text content using Gemini 3.0 Flash
        """
        if not self.client:
            print("Gemini client not initialized, using mock")
            return self._mock_analysis(text)
        
        try:
            # Clean up the text to avoid too much noise
            clean_text = text[:30000]
            
            response = self.client.models.generate_content(
                model=self.model,
                contents=[f"{SYSTEM_PROMPT}\n\nContent to analyze:\n{clean_text}"],
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
