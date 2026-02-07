"""
Gemini AI Service for content analysis
Using the new google-genai SDK and gemini-3-flash-preview
"""

import os
import json
from google import genai
from models import AIAnalysis

# Enhanced system prompt
SYSTEM_PROMPT = """You are an expert knowledge curator building a "Second Brain".
Your goal is to analyze web content and extract high-quality, actionable insights.

Output MUST be a valid JSON object only.

Requirements for the analysis:
1. title: Create a concise, punchy title that captures the core value.
2. summary: Write a 3 to 7 sentence summary focusing on novel insights, not just describing the content.
3. category: Assign exactly one specific high-level category (e.g., Tech, Health, Philosophy).
4. tags: Provide 3-5 relevant tags.
5. actionable_takeaway: One specific thing the user can do or learn from this."""


class ClaudeService: # Kept name for compatibility with main.py
    """
    Wrapper for Google Gemini AI
    Uses gemini-3-flash-preview as requested
    """
    
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = "gemini-3-flash-preview"
        
    def analyze_text(self, text: str) -> dict:
        """
        Analyze text content using Gemini 3.0 Flash
        """
        if not self.client:
            # Fallback to local logic if no API key
            return self._mock_analysis(text)
        
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=f"{SYSTEM_PROMPT}\n\nContent to analyze:\n{text[:30000]}",
                config={
                    'response_mime_type': 'application/json',
                }
            )
            
            return json.loads(response.text)
        except Exception as e:
            print(f"Gemini analysis failed: {e}")
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
