import os
import json
from google import genai
from models import AIAnalysis

# Professional system prompt
SYSTEM_PROMPT = """You are a professional knowledge extraction assistant for a "Second Brain" system.
Your goal is to objectively summarize web content with accuracy and precision. Do NOT add opinions, interpretations, or subjective assessments.

Output MUST be a valid JSON object only.

Requirements for the analysis:

1. language: Identify the primary language of the content. Use ISO 639-1 codes (e.g., "he" for Hebrew, "en" for English).

2. title: Create a concise, descriptive title that captures the core topic. Be factual, not clickbait.
   - **LANGUAGE**: Write the title in the SAME language as the input content.

3. summary: Write 2 to 4 concise, information-dense sentences for a card preview. 
   - **LANGUAGE**: Write the summary in the SAME language as the input content.
   - **SCANNABILITY**: Use **bolding** (double asterisks) for key terms, dates, or names to make them pop.
   - **STRUCTURE**: Add a line break (\\n) between each sentence to create visual separation.
   - Summarize ONLY what the content explicitly states.
   - NO opinions, NO value judgments.
   - Each sentence must end with a period.
   - You MAY use a single bullet point if it makes a critical finding clearer.
   
   GOOD: "Researchers at **MIT** found that **intermittent fasting** reduced inflammation markers by **40%** in a 12-week trial.\n\nThe study showed benefits appeared after just **2 weeks**."


4. detailedSummary: Write a well-structured, professional summary using markdown formatting:
   - **LANGUAGE**: Write the detailed summary in the SAME language as the input content.
   - Start with a 1-2 sentence overview paragraph.
   - Use "## Key Points" (or "## נקודות עיקריות" for Hebrew) as a subheading, followed by bullet points (use - for bullets).
   - Each bullet should be a factual statement from the content.
   - Include 3-6 bullet points covering the main arguments or information.
   - If applicable, add "## Conclusions" (or "## מסקנות" for Hebrew) with the author's stated conclusions.
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
            "actionableTakeaway": "None"
        }
